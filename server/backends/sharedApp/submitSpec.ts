// One collection's `public.submit` declaration, lifted out of the published document.
//
// Two callers read the SAME document shape and had the same code: `previewWrite.ts` reads the
// projection a publish WOULD write, and `participate/submit.ts` reads the one Firestore already
// holds. Both are `config/public.submit[cid]`, and both need it as a `SubmitSpec`.
//
// KEY BY KEY, NEVER ASSERTED. The projection types this loosely on purpose — the rules read these
// keys by the AUTHOR's own names — so a cast would be a claim about a document neither caller
// wrote. What is not a string is absent, which is what every one of these keys means to the rules.
import type { SubmitSpec } from "@receptron/sharedapp/view";
import { isRecord } from "../../../common/isRecord.js";

export function submitSpecOf(raw: Record<string, unknown>): SubmitSpec {
  const text = (key: string): string | undefined => {
    const value = raw[key];
    return typeof value === "string" ? value : undefined;
  };
  return {
    createFields: Array.isArray(raw.createFields) ? raw.createFields.filter((field): field is string => typeof field === "string") : [],
    auth: text("auth"),
    emailField: text("emailField"),
    // Filled by `recordOf` from the session, exactly as the address is. Read off the PUBLISHED
    // declaration for the reason the stamp is: `uidOk` tests the submit block.
    uidField: text("uidField"),
    initialStatus: text("initialStatus"),
    idFrom: text("idFrom"),
    idField: text("idField"),
    mirror: text("mirror"),
    // Read back off the PUBLISHED declaration, which is where the rules read it from too. The form
    // beside it carries the same name, and this is deliberately not that one: `stampOk` tests
    // `"stampField" in s` against the submit block, so the submit block is the authority.
    stampField: text("stampField"),
    // THE ONE KEY HERE THAT NO RULE ENFORCES. Every other field above is read by `firestore.rules`,
    // so a host that drops one collects a permission error and somebody notices; a dropped
    // `maxBytes` fails silently in the other direction — the write is ACCEPTED, at any length, and
    // the index the author published pays for it on every open. This copier is exactly the closed
    // list the package's own note warns about, so the key is copied here and the check itself comes
    // from the package (`overLongFields`) rather than being re-derived.
    //
    // Numbers only, and own properties only: a field name has no grammar, so `toString` is a legal
    // one and a plain index would hand back a function.
    ...(isRecord(raw.maxBytes) ? { maxBytes: capsOf(raw.maxBytes) } : {}),
  };
}

function capsOf(raw: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}
