# Builds that share a folder: each works with its own answers, and two never work at once

Issue: #2360

## Why

Every build keeps its interview answers in the project's `.blueprint/answers.json`, and every pack's skills and
checks read that file. The document examples suggest chaining builds in one folder (make a style, then write or
polish with it). A second build overwrote the first one's answers. If the first was waiting for a person and was
resumed later, it ran its steps and checks with the second build's answers. Nothing stopped two builds' agents
from working in one folder at the same moment, either.

## Change

- The run record keeps the answers the build started with (`answers`, empty for a run recorded before this). The
  create route no longer writes `.blueprint/answers.json` itself: it hands the answers to the executor.
- Every session a build starts (its first step, a step a person resumed, recovery after a restart, a spec
  revision) goes through one place in the executor. That place takes a lock per folder, whose identity is the real
  path. Under the lock it checks that no other build there is working (a step running, meaning its session or its
  check, or its spec being revised), writes this build's answers, and starts the session. If another build is
  working, the step fails with that build's id and waits for the person's retry, the way an untrusted folder
  does. A spec revision is refused instead.
- The create route refuses early (409) with the same test, so the common case gets a clear message.
- Because nothing else can start while a build works, its check reads the same answers its agent did.

## Not in this change

The other records under `.blueprint/` are named per usecase (a findings file, a report) and do not clash, except
style and write, which both use `.blueprint/sources/`. Chaining those means write's sources may sit beside style's
model texts. That is left as it is: nothing reads the other's list, and the report names what it quoted.

## Verification

- Executor specs: the answers are kept, written before the session, and written back before the check after
  another build wrote theirs (checked at the moment the check runs). They are also written before a spec
  revision, and not at all for a build with none. Route specs: a busy folder refuses without writing, a build
  that waits or works elsewhere does not block, and the answers are handed to the created build.
- A mutation sweep over each decision.
- A real run: build A (review) stopped at its gate, build B (verify) started in the same folder and replaced the
  answers, and a third start while B worked was refused. A, approved, finished its step with its own answers.
