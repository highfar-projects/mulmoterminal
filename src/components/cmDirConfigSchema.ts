import type { Extension } from "@codemirror/state";
import type { jsonSchema } from "codemirror-json-schema";
import { isRecord } from "../../common/isRecord";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

// A directory's config file edited in the Files pane gets the keys offered and wrong values marked
// as they are typed (#2625), from the same JSON Schema the config skill ships (`dirConfigJsonSchema`).
//
// Loaded only when such a file is opened: the schema tooling is a large dependency, and nothing else
// in the editor needs it. The schema is asked for once per page.
type JsonSchema = NonNullable<Parameters<typeof jsonSchema>[0]>;

const DIR_CONFIG_FILES = new Set([".mulmoterminal.json", ".mulmoterminal.local.json"]);

export const isDirConfigFile = (filename: string): boolean => DIR_CONFIG_FILES.has(filename.split(/[\\/]/).pop() ?? "");

const isJsonSchema = (value: unknown): value is JsonSchema => isRecord(value) && value.type === "object" && isRecord(value.properties);

let schemaRequest: Promise<JsonSchema | null> | null = null;

async function fetchSchema(): Promise<JsonSchema | null> {
  try {
    const res = await fetchWithTimeout("/api/dir-config/schema");
    const body: unknown = res.ok ? await res.json() : null;
    return isJsonSchema(body) ? body : null;
  } catch {
    return null;
  }
}

function loadSchema(): Promise<JsonSchema | null> {
  schemaRequest ??= fetchSchema().then((schema) => {
    // A failed answer is not kept, so the next config file opened asks again.
    if (schema === null) schemaRequest = null;
    return schema;
  });
  return schemaRequest;
}

/** The JSON mode with the schema's completion, lint and hover — or null when the schema could not be
 *  had, leaving the file on the plain JSON mode it opened with. */
export async function dirConfigSchemaExtension(): Promise<Extension | null> {
  const [schema, tooling] = await Promise.all([loadSchema(), import("codemirror-json-schema")]);
  return schema ? tooling.jsonSchema(schema) : null;
}

/** Test seam: forget the schema asked for. */
export function resetDirConfigSchemaForTesting(): void {
  schemaRequest = null;
}
