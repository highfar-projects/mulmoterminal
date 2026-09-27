# feat: leave out toolbar entries for features that are not set up (#2318)

Step 3 of the direction agreed in #2311: an entry for a feature nobody set up opens onto an empty
screen, so the toolbar does not offer it.

## Rule

`src/components/gatedToolbarEntries.ts` decides, as a pure function:

| entry | offered when | signal |
|---|---|---|
| Pull requests | at least one repository in `prRepos` | `useAppConfig().prRepos` |
| Rooms | at least one room exists | `roomsExist` in `useRooms.ts` |
| Worklog | the worklog is turned on | `worklogEnabled` |

Each is also offered while its own screen is open, so nobody loses the sign of where they are.
The same signals gate these tabs in the reference implementation attached to #2311.

## Rooms

There is no push for rooms, and a room is created by its first message. So `useRooms.ts` keeps the
count from the last successful `/api/rooms` read: a landed post raises it to at least one, a delete
re-reads it, and the toolbar reads it once on mount. A failed read leaves the count alone, so
"could not find out" never hides a room that is there.

## Out of scope

- Remote host: the popover is the only place to connect, until Settings has one.
- Collections / Feeds / Wiki / Accounting: the door to the content section, or a first-run screen.
- Canvas and uninstalled agents: shown disabled on purpose, to explain how to enable them.
- The cell's GitHub pane and where Accounting lives: consolidation, handled separately.
