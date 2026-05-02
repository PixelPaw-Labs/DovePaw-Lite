/**
 * Dependabot Merger - Automated dependency PR reviewer and merger
 *
 * When spawned by the chatbot A2A server, receives the user's instruction as argv[2].
 * When run via launchd with no argv[2], processes all configured repos.
 *
 * Lists open Dependabot PRs across configured repos, assesses risk, maps to Jira sprint
 * tickets, and merges safe PRs (or dry-runs if instructed).
 *
 * Required env vars: REPO_LIST
 *
 * REPO_LIST should contain local repo paths. The skill derives GitHub slugs from
 * each repo's remote origin URL.
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentRunner,
  createLogger,
  makeTimestamp,
  cleanupOldLogs,
  AUTONOMY_PREFIX,
  parseRepos,
  agentPersistentLogDir,
} from "@dovepaw/agent-sdk";

// ─── Configuration ──────────────────────────────────────────────────────────

const REPOS = parseRepos("REPO_LIST");
const INSTRUCTION = process.argv[2] || "";
const JIRA_TICKET = process.env.JIRA_TICKET ?? "EC-1007";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORK_DIR = process.env.AGENT_WORKSPACE ?? SCRIPT_DIR;
const LOG_DIR = agentPersistentLogDir("dependabot-merger");
const LOG_FILE = join(LOG_DIR, `dependabot-merger-${makeTimestamp()}.log`);
const { log } = createLogger(LOG_DIR, LOG_FILE);

export function buildSkillArgs(ticket: string, instruction: string): string {
  return [`ticket="${ticket}"`, instruction].filter(Boolean).join(" ");
}

function buildPrompt(): string {
  const lines = [`[Dependabot Merger] ${AUTONOMY_PREFIX}`, "", `Repos: ${REPOS.join(", ")}`];
  const skillArgs = buildSkillArgs(JIRA_TICKET, INSTRUCTION);
  lines.push("", `Skill("/dependabot-merger ${skillArgs}")`, "", "Report completion as markdown.");
  return lines.join("\n");
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log("=== Dependabot Merger started ===");
  log(`Instruction: ${INSTRUCTION || "(none)"}`);
  log(`Repos: ${REPOS.join(", ") || "(none)"}`);

  const prompt = buildPrompt();
  log("Invoking agent...");

  const runner = new AgentRunner(LOG_DIR, LOG_FILE);
  const { code: exitCode, stdout: claudeOutput } = await runner.run(prompt, {
    cwd: WORK_DIR,
    taskName: "dependabot-merger",
    timeoutMs: 4 * 60 * 60 * 1000,
    additionalDirectories: REPOS,
    claudeOpts: { permissionMode: "acceptEdits" },
    codexOpts: {
      sandboxMode: "danger-full-access",
    },
  });

  log(`Agent exited with code: ${exitCode}`);
  log("--- Response ---");
  log(claudeOutput);
  log("=== Dependabot Merger finished ===");

  cleanupOldLogs(LOG_DIR, ["dependabot-merger-"], 30);
}

main().catch((err: unknown) => {
  log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
