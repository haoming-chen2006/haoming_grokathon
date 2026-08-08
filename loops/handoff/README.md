# Handoff requests

One file per worktree, named `pivot-<surface>.md`. Nothing else writes here.

A worktree may not edit a hot file — `client/src/control-room/useControlRoom.ts`,
`ControlRoomApp.tsx`, `server/services/projectStore.ts`, `server/types/*.ts`,
`server/index.ts`, `package.json` — because nine parallel branches editing them
would cost more than the feature work they carry.

Instead, append a request here: the file, the exact change, the reason, and the
signature or event shape other worktrees will depend on. One reconciliation pass
applies every request at the end.
