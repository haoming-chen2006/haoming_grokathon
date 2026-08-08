// Start the server, taking the port back first.
//
//   bun run serve
//
// `bun run server/index.ts` fails with EADDRINUSE when a previous server is still holding 6968,
// and the message names the line that called Bun.serve rather than the process that owns the port
// — so the obvious reading is "the server is broken" when the truth is "the server is already
// running". That cost a real debugging detour, and every `fresh` after a crashed run hits it.
//
// This asks who has the port, stops them, waits for the socket to actually close, and only then
// starts. It refuses rather than starting if the port never frees, because a server that silently
// did not start is worse than one that says why.

import { spawn, spawnSync } from "child_process";

const PORT = Number(process.env.PORT) || 6968;

function holders() {
  // -t is pids only; a missing lsof or no listener both mean "nobody", not an error.
  const out = spawnSync("lsof", ["-ti", `:${PORT}`], { encoding: "utf8" });
  return (out.stdout ?? "")
    .split("\n")
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

const existing = holders();
if (existing.length > 0) {
  console.log(`  Port ${PORT} was held by ${existing.join(", ")} — stopping them.`);
  for (const pid of existing) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone between the listing and here, which is the outcome we wanted anyway.
    }
  }

  // Wait for the socket, not for the process: a killed process releases its listener slightly
  // later, and starting in that gap fails with the same error this exists to prevent.
  const deadline = Date.now() + 5000;
  while (holders().length > 0 && Date.now() < deadline) {
    spawnSync("sleep", ["0.2"]);
  }

  const stubborn = holders();
  if (stubborn.length > 0) {
    for (const pid of stubborn) {
      try {
        process.kill(pid, "SIGKILL");
      } catch { /* gone */ }
    }
    spawnSync("sleep", ["0.5"]);
  }

  if (holders().length > 0) {
    console.error(`\n  Port ${PORT} is still held by ${holders().join(", ")} after SIGKILL.`);
    console.error(`  Refusing to start rather than failing with EADDRINUSE and blaming Bun.serve.\n`);
    process.exit(1);
  }
}

const server = spawn("bun", ["run", "server/index.ts"], { stdio: "inherit", env: process.env });
server.on("exit", (code) => process.exit(code ?? 0));
