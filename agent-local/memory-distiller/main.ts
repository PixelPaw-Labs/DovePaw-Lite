/**
 * Memory Distiller - Promote common patterns from sub-agent memories into global ~/.claude/CLAUDE.md
 * Runs weekly (Mon 01:00) via launchd, or on-demand.
 *
 * Reads per-agent memory dirs from ~/.dovepaw-lite/agents/state/.<agentName>/memory/
 * and distils cross-agent patterns into the global CLAUDE.md.
 */

import { writeFileSync, existsSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { discoverAgentMemories } from "./discover.js";
import {
  AgentRunner,
  createLogger,
  makeTimestamp,
  cleanupOldLogs,
  agentPersistentLogDir,
} from "@dovepaw/agent-sdk";

// ─── Configuration ──────────────────────────────────────────────────────────

const HOME = process.env.HOME!;
const CLAUDE_MD = join(HOME, ".claude/CLAUDE.md");
const DOVEPAW_DIR = join(HOME, ".dovepaw-lite");
const AGENT_SETTINGS_DIR = join(DOVEPAW_DIR, "settings.agents");

const SELF_NAMES = new Set(["memory-dream", "memory-distiller"]);

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORK_DIR = process.env.AGENT_WORKSPACE ?? SCRIPT_DIR;
const LOG_DIR = agentPersistentLogDir("memory-distiller");
const LOG_FILE = join(LOG_DIR, `memory-distiller-${makeTimestamp()}.log`);
const { log } = createLogger(LOG_DIR, LOG_FILE);

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log("=== Memory Distiller started ===");

  const memoryFiles = discoverAgentMemories(AGENT_SETTINGS_DIR, SELF_NAMES);

  if (memoryFiles.length < 2) {
    log(`Only ${memoryFiles.length} agent memory file(s) found. Need at least 2. Exiting.`);
    return;
  }

  log(`Found ${memoryFiles.length} agent memory file(s):`);
  for (const f of memoryFiles) {
    log(
      `  - ${f.agentName}: ${f.memoryFile} (${f.memoryContent.split("\n").length} lines, ${f.topicFiles.length} topic files)`,
    );
  }

  const suffix = randomBytes(3).toString("hex");
  const skillName = `memory-distiller-${suffix}`;
  const skillDir = join(HOME, ".claude/skills", skillName);
  const skillRefDir = join(skillDir, "references");
  mkdirSync(skillRefDir, { recursive: true });

  if (existsSync(CLAUDE_MD)) {
    copyFileSync(CLAUDE_MD, join(skillRefDir, "existing-claude-md.md"));
  } else {
    writeFileSync(join(skillRefDir, "existing-claude-md.md"), "[empty - file does not exist yet]");
  }

  const memoryRefLinks: string[] = [];
  for (const f of memoryFiles) {
    const agentRefDir = join(skillRefDir, f.agentName);
    mkdirSync(agentRefDir, { recursive: true });

    copyFileSync(f.memoryFile, join(agentRefDir, "MEMORY.md"));
    for (const topic of f.topicFiles) {
      copyFileSync(topic.path, join(agentRefDir, topic.name));
    }

    const topicList =
      f.topicFiles.length > 0
        ? f.topicFiles
            .map((t) => `    - [${t.name}](references/${f.agentName}/${t.name})`)
            .join("\n")
        : "    - (no topic files)";
    memoryRefLinks.push(
      `  - **${f.agentName}**: [MEMORY.md](references/${f.agentName}/MEMORY.md) → \`${f.memoryDir}/\`\n${topicList}`,
    );
  }

  const filePathMapping = memoryFiles
    .map((f) => `  - ${f.agentName}: \`${f.memoryDir}/\``)
    .join("\n");

  const skillMd = `---
name: memory-distiller
description: Synthesize sub-agent memories into global CLAUDE.md
allowed-tools: Read, Edit, Write, Bash(mkdir *), Bash(rm *), Bash(python3 *)
context: fork
---

# Memory Distiller

## Scope — read this first

Your ONLY job is: read the provided reference files → find patterns present in 2+ agents → write those patterns to global CLAUDE.md → remove promoted entries from agent files.

**NEVER do any of the following:**
- Read session history (\`.jsonl\` files) or git logs
- Write new agent-level memory files
- Create memories from code analysis or session scanning
- Do anything beyond the four steps below

You work ONLY with the reference files listed in Step 1. If a pattern isn't already in those files, ignore it.

## Task

You have ${memoryFiles.length} agent memory directories and the global CLAUDE.md to work with.

### Step 1: Read all reference files
- Read [existing-claude-md.md](references/existing-claude-md.md)
${memoryRefLinks.join("\n")}

### Step 2: Identify cross-agent patterns
Find entries (in MEMORY.md inline content OR topic files) that appear in **2 or more** agents.
Be CONSERVATIVE — only promote genuinely cross-agent patterns, not agent-specific ones.

### Step 3: Update global CLAUDE.md
- File: ${CLAUDE_MD}
- Add under \`## Learned Preferences\` (create if needed)
- DEDUPLICATE and CORRECT CONTRADICTIONS (newer wins)
- **Reformulate as a general rule** — every entry written to CLAUDE.md must be an imperative, actionable rule that applies globally.
  - Wrong: "The dependabot-merger agent failed when a PR had no labels."
  - Right: "Always handle the case where a PR has no labels — treat it as an unlabelled PR, not an error."
- Write the updated file using python3: \`python3 -c "open('${CLAUDE_MD}', 'w').write(content)"\`

### Step 4: Remove promoted entries from agent files
${filePathMapping}

When removing a promoted entry:
- If the entry is a **topic file**, delete the file and remove its index line from MEMORY.md
- If the entry is **inline content in MEMORY.md**, remove that section/bullet
- Write topic files using python3: \`python3 -c "open('FULL_PATH/filename.md', 'w').write(content)"\`

### Step 5: Output summary (promoted entries only — no new memories)

## Rules
- Be CONSERVATIVE — when in doubt, leave entries in agent files
- An entry must appear in 2+ agent files to qualify
- Don't promote agent-specific patterns (e.g., GitHub-specific, PR-specific)
- Keep CLAUDE.md organized and concise
- Preserve all existing CLAUDE.md content
- Stop after Step 5 — do not start new runs or write additional files
`;

  writeFileSync(join(skillDir, "SKILL.md"), skillMd);

  log(`Invoking agent via skill /${skillName}...`);

  const runner = new AgentRunner(LOG_DIR, LOG_FILE);
  try {
    const { code: exitCode, stdout: claudeOutput } = await runner.run(`/${skillName}`, {
      cwd: WORK_DIR,
      taskName: "memory-distiller",
      timeoutMs: 5 * 60 * 60 * 1000,
      claudeOpts: { permissionMode: "acceptEdits" },
    });

    log(`Agent exited with code: ${exitCode}`);
    if (claudeOutput) log(`--- Response ---\n${claudeOutput}`);
  } finally {
    try {
      rmSync(skillDir, { recursive: true, force: true });
      log(`Cleaned up skill directory: ${skillDir}`);
    } catch (err: unknown) {
      log(
        `WARN: Failed to clean up skill directory: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  log("=== Memory Distiller finished ===");
  cleanupOldLogs(LOG_DIR, ["memory-distiller-"], 30);
}

main().catch((err: unknown) => {
  log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
