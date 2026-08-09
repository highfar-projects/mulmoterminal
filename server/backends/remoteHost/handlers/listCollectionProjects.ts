// listCollectionProjects command handler.
//
// The other half of the project scope (../commandScope.ts): the handlers can already RESOLVE a
// project a command names, and this is how the phone LEARNS which ones there are. A picker needs
// `{ id, label }` pairs from the host and can invent neither.
//
// Mirrors GET /api/collection-projects, minus the `cwd`. The browser is handed each project's
// path because it has to MATCH a project to a cell it is already showing, and it knows every
// cell's cwd anyway. The phone has no such need and is a genuinely remote client, so the path
// stays here: an absolute root in a command or an artifact publishes the user's home directory
// over the wire, and the id is what the host resolves against its own list.
//
// The workspace is included and leads the list, as it does in the HTTP listing — a phone that
// wants "the host's own collections" names it like any other project rather than by omitting the
// parameter and hoping.
import { toJsonObject, type CommandHandlers } from "@mulmoclaude/core/remote-host";
import { listProjectRoots } from "../../../infra/project-root.js";

export const listCollectionProjects: CommandHandlers["listCollectionProjects"] = async () =>
  toJsonObject({ projects: listProjectRoots().map((project) => ({ id: project.id, label: project.label })) });
