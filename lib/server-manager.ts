/**
 * Shared A2A server lifecycle helpers.
 *
 * Canonical usage of `npm run chatbot:servers` lives here so that every
 * caller — Next.js API route, CLI — uses the same command.
 *
 * Importers:
 *   chatbot/app/api/servers/restart/route.ts   via  @@/lib/server-manager
 */

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { AGENTS_ROOT, A2A_SERVERS_PID_FILE } from "./paths";

/**
 * Kill the A2A servers process identified by the PID file.
 * No-ops silently if the file is absent or the process is already gone.
 */
export function killServers(): void {
  if (!existsSync(A2A_SERVERS_PID_FILE)) return;
  const pid = parseInt(readFileSync(A2A_SERVERS_PID_FILE, "utf-8").trim(), 10);
  if (isNaN(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already gone — fine
  }
}

/**
 * Spawn a fresh A2A servers process via `npm run chatbot:servers`.
 *
 * Returns the raw ChildProcess so the caller can call unref() to detach
 * and write child.pid to the PID file.
 *
 * @param port  Value forwarded as DOVEPAW_PORT env var (default 8473)
 * @param stdio "pipe" for log piping, "ignore" for detached API restarts
 */
export function createServersProcess(
  port: number = 8473,
  stdio: "pipe" | "ignore" = "ignore",
): ChildProcess {
  return spawn("npm", ["run", "chatbot:servers"], {
    cwd: AGENTS_ROOT,
    env: { ...process.env, DOVEPAW_PORT: String(port) },
    stdio,
    detached: true,
  });
}
