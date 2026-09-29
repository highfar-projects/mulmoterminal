// Reads Firestore (and Cloud Storage) after `yarn import-source` and holds it against the copied source, over the REST
// APIs rather than the app's own code: every collection has as many documents as it had records, every stored field of
// every record reads back equal, and every file a record points at is in the bucket. Prints each mismatch, and exits 1
// when there is any.
//
//   node firestore-verify.mjs emulator   inside `firebase emulators:exec` (FIRESTORE_EMULATOR_HOST, GCLOUD_PROJECT)
//   node firestore-verify.mjs prod       with PROJECT_ID and ACCESS_TOKEN (gcloud auth print-access-token)
//
// The bucket the files went to is named in .blueprint/storage-bucket; in production it must be one of the project's.
import { existsSync, readFileSync } from "node:fs";
import { hasValue, labelOf, plainFields, pointedAtFiles, recordsOf, report, sameValue, schemaOf, sourceCollections } from "./compare.mjs";

const PAGE_SIZE = 300;
const TIMEOUT_MS = 20000;
const target = process.argv[2];

function endpoints() {
  if (target === "emulator") {
    const project = process.env.GCLOUD_PROJECT || "demo-blueprint";
    return {
      documents: `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents`,
      object: (bucket, file) => `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucket}/o/${encodeURIComponent(file)}`,
      headers: { Authorization: "Bearer owner" },
      bucketAllowed: () => true,
    };
  }
  const project = process.env.PROJECT_ID;
  return {
    documents: `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`,
    object: (bucket, file) => `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(file)}`,
    headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` },
    bucketAllowed: (bucket) => bucket === `${project}.appspot.com` || bucket === `${project}.firebasestorage.app`,
  };
}

async function get(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: response.status, body: response.ok ? await response.json() : null };
}

// A Firestore REST value as the plain value it holds.
function decode(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("referenceValue" in value) return value.referenceValue.split("/").at(-1);
  if ("nullValue" in value) return null;
  return value;
}

async function documentsOf(api, collection, pageToken = "") {
  const query = new URLSearchParams({ pageSize: String(PAGE_SIZE), ...(pageToken ? { pageToken } : {}) });
  const { status, body } = await get(`${api.documents}/${encodeURIComponent(collection)}?${query}`, api.headers);
  if (status !== 200) throw new Error(`reading ${collection} from Firestore answered ${status}`);
  const page = (body.documents ?? []).map((doc) => ({
    id: doc.name.split("/").at(-1),
    fields: Object.fromEntries(Object.entries(doc.fields ?? {}).map(([key, value]) => [key, decode(value)])),
  }));
  return body.nextPageToken ? [...page, ...(await documentsOf(api, collection, body.nextPageToken))] : page;
}

function fieldProblems(slug, key, spec, record, doc, label) {
  const value = record[key];
  if (!hasValue(value)) return [];
  if (!(key in doc.fields)) return [`${slug} ${label}: the document has no field ${key}`];
  return sameValue(spec.type, value, doc.fields[key], (flag) => flag)
    ? []
    : [`${slug} ${label}: ${key} is ${JSON.stringify(doc.fields[key])}, the source had ${JSON.stringify(value)}`];
}

async function collectionProblems(api, slug) {
  const schema = schemaOf(slug);
  const records = recordsOf(slug);
  const docs = new Map((await documentsOf(api, slug)).map((doc) => [doc.id, doc]));
  const counted = docs.size === records.length ? [] : [`${slug}: Firestore has ${docs.size} documents, the source had ${records.length} records`];
  // The primary key is the document id, matched here; the document need not repeat it as a field.
  const fields = plainFields(schema).filter(([key]) => key !== schema.primaryKey);
  const perRecord = records.flatMap((record) => {
    const doc = docs.get(String(record[schema.primaryKey]));
    if (!doc) return [`${slug}: no document ${JSON.stringify(record[schema.primaryKey])}`];
    return fields.flatMap(([key, spec]) => fieldProblems(slug, key, spec, record, doc, labelOf(schema, record)));
  });
  return [...counted, ...perRecord];
}

async function fileProblems(api) {
  const files = pointedAtFiles();
  if (files.length === 0) return [];
  const bucketFile = ".blueprint/storage-bucket";
  if (!existsSync(bucketFile)) return [`the records point at ${files.length} files, and ${bucketFile} does not name the bucket they went to`];
  const bucket = readFileSync(bucketFile, "utf8").trim();
  if (!api.bucketAllowed(bucket)) return [`${bucketFile} names ${bucket}, which is not this project's bucket`];
  const found = await Promise.all(files.map(async (file) => (await get(api.object(bucket, file), api.headers)).status === 200));
  return files.filter((_file, index) => !found[index]).map((file) => `${file} is not in the bucket ${bucket}`);
}

const api = endpoints();
const problems = [...(await Promise.all(sourceCollections().map((slug) => collectionProblems(api, slug)))).flat(), ...(await fileProblems(api))];
report(problems);
