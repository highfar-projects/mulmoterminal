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
  };
}
