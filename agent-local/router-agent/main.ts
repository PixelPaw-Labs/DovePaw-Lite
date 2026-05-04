import { join } from "node:path";
import {
  AgentRunner,
  createLogger,
  makeTimestamp,
  cleanupOldLogs,
  agentPersistentLogDir,
} from "@dovepaw/agent-sdk";

// ─── Configuration ────────────────────────────────────────────────────────────
const INSTRUCTION = process.argv[2] || "";
const WORK_DIR = process.env.AGENT_WORKSPACE!;
const LOG_DIR = agentPersistentLogDir("router-agent");
const LOG_FILE = join(LOG_DIR, `router-agent-${makeTimestamp()}.log`);
const { log, publishStatusToUI } = createLogger(LOG_DIR, LOG_FILE);

// ─── Prompt ───────────────────────────────────────────────────────────────────
export function buildPrompt(instruction: string): string {
  return `Skill("/router-agent ${instruction}")`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log("=== Router Agent started ===");
  await publishStatusToUI("Classifying intent…");

  const prompt = buildPrompt(INSTRUCTION);

  const runner = new AgentRunner(LOG_DIR, LOG_FILE);
  const { code, stdout } = await runner.run(prompt, {
    cwd: WORK_DIR,
    taskName: "router-agent",
    timeoutMs: 10 * 60 * 1000,
    claudeOpts: { permissionMode: "acceptEdits" },
    codexOpts: { sandboxMode: "workspace-write" },
  });

  log(`Agent exited with code: ${code}`);
  log(stdout);
  await publishStatusToUI("Done.");
  log("=== Router Agent finished ===");
  cleanupOldLogs(LOG_DIR, ["router-agent-"], 30);
}

main().catch((err: unknown) => {
  log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
