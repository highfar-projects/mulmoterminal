// WAS THIS REFUSED, or did it merely fail?
//
// The difference decides real things on both sides of a shared app, and it may not be guessed:
//
//   A REFUSAL IS A FACT ABOUT THE CALLER. They are a participant, the rules will never open this
//   document to them, and the narrower path that follows is correct for exactly that reason.
//
//   A FAILURE IS A FACT ABOUT THE MOMENT. A blip, an offline second. Treated as a refusal it hands
//   a WRITER a write path that skips its check, and it reports a partial read as though the rules
//   had drawn a boundary — which is worse than an error, because the caller acts on it.
//
// Matched on the SDK's code rather than the message: the message is English and localised, the code
// is the contract.
export const refused = (err: unknown): boolean => typeof err === "object" && err !== null && "code" in err && err.code === "permission-denied";
