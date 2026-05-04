/**
 * Memory Dream - Extract domain knowledge from sub-agent sessions into per-agent memory.
 * Runs nightly at 00:00 via launchd, or on-demand.
 *
 * Discovers agents from ~/.dovepaw-lite/settings.agents/ (excludes itself and memory-distiller),
 * reads their workspace JSONL sessions directly, and writes learnings to per-agent memory dirs.
 */

import {
  AgentRunner,
  createLogger,
  makeTimestamp,
  cleanupOldLogs,
  agentPersistentLogDir,
  agentPersistentStateDir,
  PROJECTS_DIR,
  AGENT_SETTINGS_DIR,
} from "@dovepaw/agent-sdk";
import {
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  copyFileSync,
  readdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { parseSessionFile, listSessionFiles, discoverWorkspaceSlugs } from "./session-reader.js";

// ─── Configuration ──────────────────────────────────────────────────────────

const HOME = process.env.HOME!;
const SELF_NAMES = new Set(["memory-dream", "memory-distiller"]);

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORK_DIR = process.env.AGENT_WORKSPACE ?? SCRIPT_DIR;
const LOG_DIR = agentPersistentLogDir("memory-dream");
const LOG_FILE = join(LOG_DIR, `memory-dream-${makeTimestamp()}.log`);
const { log } = createLogger(LOG_DIR, LOG_FILE);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function discoverAgentNames(): string[] {
  if (!existsSync(AGENT_SETTINGS_DIR)) return [];
  return readdirSync(AGENT_SETTINGS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !SELF_NAMES.has(d.name))
    .map((d) => d.name);
}

function ensureQValue(filePath: string): void {
  const content = readFileSync(filePath, "utf8");
  if (content.includes("q_value:")) return;
  const updated = content.replace(/\n---\n/, "\nq_value: 0\n---\n");
  if (updated !== content) writeFileSync(filePath, updated);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log("=== Memory Dream started ===");

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  log(`Time window: since ${since}`);

  const agentNames = discoverAgentNames();
  if (agentNames.length === 0) {
    log("No sub-agents found. Exiting.");
    return;
  }
  log(`Sub-agents: ${agentNames.join(", ")}`);

  let totalSessions = 0;

  /* oxlint-disable no-await-in-loop -- agents processed one at a time to limit concurrent Claude instances */
  for (const agentName of agentNames) {
    const slugs = discoverWorkspaceSlugs(PROJECTS_DIR, agentName);
    if (slugs.length === 0) {
      log(`SKIP ${agentName}: no workspace project slugs found`);
      continue;
    }

    // Collect all JSONL session files across all workspace slugs for this agent
    const sessionFiles = slugs.flatMap((slug) => listSessionFiles(PROJECTS_DIR, slug));
    if (sessionFiles.length === 0) {
      log(`SKIP ${agentName}: no session files found`);
      continue;
    }

    log(
      `--- ${agentName}: checking ${sessionFiles.length} session file(s) across ${slugs.length} workspace(s) ---`,
    );

    // Parse sessions that have activity in the time window
    const activeSessions = sessionFiles
      .map((f) => ({ file: f, data: parseSessionFile(f, since) }))
      .filter((s): s is { file: string; data: NonNullable<typeof s.data> } => s.data !== null);

    if (activeSessions.length === 0) {
      log(`${agentName}: no sessions with activity since ${since}`);
      continue;
    }

    log(`${agentName}: ${activeSessions.length} active session(s)`);

    const memoryDir = join(agentPersistentStateDir(agentName), "memory");
    const memoryFile = join(memoryDir, "MEMORY.md");

    const suffix = randomBytes(3).toString("hex");
    const skillName = `memory-dream-${agentName}-${suffix}`;
    const skillDir = join(HOME, ".claude/skills", skillName);
    const skillRefDir = join(skillDir, "references");
    mkdirSync(skillRefDir, { recursive: true });

    const existingTopicFiles: string[] = [];
    if (existsSync(memoryFile)) {
      copyFileSync(memoryFile, join(skillRefDir, "existing-memory.md"));
    } else {
      writeFileSync(join(skillRefDir, "existing-memory.md"), "[empty - file does not exist yet]");
    }
    if (existsSync(memoryDir)) {
      for (const f of readdirSync(memoryDir)) {
        if (f === "MEMORY.md" || !f.endsWith(".md")) continue;
        const actualPath = join(memoryDir, f);
        ensureQValue(actualPath);
        copyFileSync(actualPath, join(skillRefDir, `topic-${f}`));
        existingTopicFiles.push(f);
      }
    }

    let sessionCount = 0;
    for (const { file: _file, data } of activeSessions) {
      if (sessionCount >= 10) break;
      sessionCount++;
      const sessionFile = join(skillRefDir, `session-${sessionCount}.md`);

      let content = `# Session ${sessionCount}\n`;
      content += `cwd: ${data.cwd} | branch: ${data.gitBranch}\n\n`;

      for (const msg of data.messages) {
        content += `\n## [${msg.role}] ${msg.timestamp}\n${msg.content}\n`;
      }

      writeFileSync(sessionFile, content);
    }

    const sessionLinks = Array.from(
      { length: sessionCount },
      (_, i) => `  - [Session ${i + 1}](references/session-${i + 1}.md)`,
    ).join("\n");

    const existingTopicLinks =
      existingTopicFiles.length > 0
        ? existingTopicFiles.map((f) => `  - [${f}](references/topic-${f})`).join("\n")
        : "  - (none)";

    const skillMd = `---
name: memory-dream-${agentName}
description: Extract domain knowledge from Claude Code sessions for ${agentName}
allowed-tools: Read, Edit, Write, Bash(python3 *)
context: fork
---

# Memory Dream: ${agentName}

Extract valuable domain knowledge from recent sub-agent sessions and write it to agent memory.

## Task

Analyze the sessions from the **${agentName}** agent (past 24 hours).
Extract generalizable rules — not chat incidents.

Look for:

1. **User corrections** — things the agent did wrong that the user had to correct
2. **Domain-specific patterns** — conventions, approaches, gotchas specific to this agent's work
3. **Workflow preferences** — how the user prefers things done (keep conservative — exclude one-off commands)

### Abstraction rule (critical)

Every learning MUST be written as a **general, reusable rule** — not a description of what happened in a specific session.

**Wrong** (case-specific incident):
> "In session 3, the agent failed to handle a 404 response."

**Right** (general rule):
> "Always check HTTP response codes before parsing the body — treat 4xx/5xx as failures."

Ask yourself: "Would this rule apply to a future run that has nothing to do with today's sessions?" If yes, it's worth saving.

## Reference Files

- **Existing MEMORY.md index** (for deduplication): Read [existing-memory.md](references/existing-memory.md)
- **Existing topic files** (read each for deduplication):
${existingTopicLinks}
- **Sessions to analyze** (read each file):
${sessionLinks}

## Memory Structure

The memory directory uses **topic files** — each learning is a separate .md file with YAML frontmatter.
\`MEMORY.md\` is a **concise index** (under 200 lines) that links to topic files with brief descriptions.

### Topic file format

\`\`\`markdown
---
name: {{short descriptive name}}
description: {{one-line description — used to decide relevance in future conversations}}
type: {{user | feedback | project | reference}}
q_value: 0.0
---

{{Lead with the rule itself — imperative, actionable, general. No incident narrative.}}

**Why:** {{reason the user gave or the pattern behind this rule — not "in session X..."}}

**How to apply:** {{when/where this guidance kicks in across future conversations}}
\`\`\`

### Naming convention

File names: \`{type}_{descriptive_slug}.md\` (e.g., \`feedback_no_easy_fixes.md\`, \`project_auth_rewrite.md\`)

## Rules

- Write topic files using python3: \`python3 -c "open('${memoryDir}/filename.md', 'w').write(content)"\`
- Update the MEMORY.md index using python3: \`python3 -c "open('${memoryFile}', 'w').write(content)"\`
- Ensure the memory directory exists: \`python3 -c "import os; os.makedirs('${memoryDir}', exist_ok=True)"\`
- **DEDUPLICATE** — read ALL existing topic files first. If an existing topic already covers a learning, skip it.
- **CORRECT CONTRADICTIONS** — if a new learning contradicts an existing topic file, UPDATE that file (newer wins).
- **MERGE related learnings** — if a new learning extends an existing topic, update that topic file rather than creating a new one.
- Be ADDITIVE for genuinely new learnings — create a new topic file and add an index entry.
- Keep each topic file focused on ONE concept (1-15 lines of content after frontmatter).
- Keep MEMORY.md as a concise index (links + one-line descriptions). Do NOT put detailed content in MEMORY.md.
- If nothing genuinely new is found, output "No new learnings" and make no changes.

## Q-Value Maintenance

Each topic file has a \`q_value\` float in its frontmatter (default \`0.0\`). Update it each run for every topic file you read that is relevant to the sessions you analyzed.

### Reinforcement (at most once per topic per run)

| Event | Delta |
|-------|-------|
| Session confirms or successfully applies this learning | \`feedback\` +0.5 · others +0.3 |

### Contradiction (takes priority over reinforcement)

- If a session contradicts this learning: \`q_value -= 1.0\`

### Decay (apply every run to every topic file you read)

| Type | Decay per run | Time to deletion at −2.0 |
|------|--------------|--------------------------|
| \`user\` | −0.01 | ~200 runs (~28 weeks) |
| \`feedback\` | −0.02 | ~100 runs (~14 weeks) |
| \`reference\` | −0.05 | ~40 runs (~6 weeks) |
| \`project\` | −0.1 | ~20 runs (~3 weeks) |

### Deletion threshold

If \`q_value < -2.0\`: delete the file with \`python3 -c "import os; os.remove('/path/to/file')"\` **and** remove its entry from \`MEMORY.md\`.

## MEMORY.md Index Format

\`\`\`markdown
# Agent Memory: ${agentName}

## User
- [user_topic.md](user_topic.md) — Brief description

## Feedback
- [feedback_topic.md](feedback_topic.md) — Brief description

## Project
- [project_topic.md](project_topic.md) — Brief description

## Reference
- [reference_topic.md](reference_topic.md) — Brief description
\`\`\`

If the MEMORY.md file exists with inline content (not links), migrate those entries into topic files
and replace the inline content with index links. Only include sections that have entries.
`;

    writeFileSync(join(skillDir, "SKILL.md"), skillMd);

    log(`Invoking agent for ${agentName} (${sessionCount} sessions) via skill...`);

    const runner = new AgentRunner(LOG_DIR, LOG_FILE);
    try {
      const { code: exitCode, stdout: claudeOutput } = await runner.run(`/${skillName}`, {
        cwd: WORK_DIR,
        taskName: "memory-dream",
        timeoutMs: 5 * 60 * 60 * 1000,
        claudeOpts: { permissionMode: "acceptEdits" },
      });
      log(`Agent exited with code: ${exitCode}`);
      if (claudeOutput) log(`--- Response ---\n${claudeOutput}`);
    } finally {
      rmSync(skillDir, { recursive: true, force: true });
      log("Cleaned up skill");
    }

    totalSessions += sessionCount;
  }
  /* oxlint-enable no-await-in-loop */

  log(`=== Memory Dream finished (processed ${totalSessions} session(s)) ===`);
  cleanupOldLogs(LOG_DIR, ["memory-dream-"], 30);
}

main().catch((err: unknown) => {
  log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
