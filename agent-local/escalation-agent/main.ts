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
const LOG_DIR = agentPersistentLogDir("escalation-agent");
const LOG_FILE = join(LOG_DIR, `escalation-agent-${makeTimestamp()}.log`);
const { log, publishStatusToUI } = createLogger(LOG_DIR, LOG_FILE);

// ─── Prompt ───────────────────────────────────────────────────────────────────
export function buildPrompt(instruction: string): string {
  return `Skill("/escalation-agent ${instruction}")`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log("=== Escalation Agent started ===");
  await publishStatusToUI("Checking if escalation is needed…");

  const prompt = buildPrompt(INSTRUCTION);

  const runner = new AgentRunner(LOG_DIR, LOG_FILE);
  const { code, stdout } = await runner.run(prompt, {
    cwd: WORK_DIR,
    taskName: "escalation-agent",
    timeoutMs: 10 * 60 * 1000,
    claudeOpts: { permissionMode: "acceptEdits" },
    codexOpts: { sandboxMode: "workspace-write" },
  });

  log(`Agent exited with code: ${code}`);
  log(stdout);
  await publishStatusToUI("Done.");
  log("=== Escalation Agent finished ===");
  cleanupOldLogs(LOG_DIR, ["escalation-agent-"], 30);
}

main().catch((err: unknown) => {
  log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
