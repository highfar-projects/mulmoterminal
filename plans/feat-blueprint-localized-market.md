# Blueprints: the market's refusals in the person's language

Issue: #2395 (follows #2373)

## Why

The market's refusals and failures reached the screen as the server's English. Worse, a refused install or removal did not reach the screen at all: the view re-reads the catalog after every action, and that read reset the one error slot, so the refusal was wiped the moment it arrived.

## Shape

- New codes in `common/blueprint/refusal.ts`:
  - a registry address not allowed;
  - a registry this machine does not read;
  - a pack not listed;
  - a pack busy;
  - a pack not installed;
  - a shipped pack;
  - a web registry's pack on this machine's disk;
  - a broken pack;
  - a failed fetch.

  The last two keep the technical English as `detail` inside the worded sentence. Their English is exactly what it was.
- `server/blueprint/refused.ts`: `Refused` (the base of `BlueprintRefusal` and `InstallRefusal`) and `refusalBody`, which both route files answer with.
- The market view keeps an action's refusal apart from a failed catalog read, words both, and shows both.

## Verification

- Market routes over real HTTP with the registry and clone faked: each refusal answers its code and the English derived from it.
- The market view:
  - a refusal survives the re-read (this failed before the fix, with plain English too);
  - it is worded from its code;
  - a success clears it;
  - a refusal and a failed read show side by side.
- Each decision inverted in turn goes red.
- On the test server, in Japanese, adding a plain-http registry showed the Japanese refusal, and the saved list was unchanged.
