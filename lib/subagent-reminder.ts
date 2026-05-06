/** Built-in UserPromptSubmit reminder injected on every sub-agent turn (start mode). */
export const SUBAGENT_PROMPT_REMINDER = `<reminder>
- When the user's intent is resolved by SOMETHING BEING DONE: ALWAYS START yourself first (returns runId immediately), tell the user what you've kicked off, then WAIT as a **background Task** concurrently.
</reminder>`;

function buildMemoryBullet(memoryDir: string): string {
  return (
    `<reminder>\n` +
    `- MEMORY WORKFLOW — MUST follow every time the user ASKS A QUESTION NOT ABOUT THIS AGENT:\n` +
    `  1. READ \`${memoryDir}/memory/MEMORY.md\` index — NEVER skip this step.\n` +
    `     If the file does not exist → go directly to step 3 NOT SUFFICIENT.\n` +
    `  2. SCAN the index for entries relevant to the user's question (topic, keyword, domain match).\n` +
    `     If a relevant entry is found → READ that memory file for full detail.\n` +
    `  3. DETECT sufficiency:\n` +
    `     - SUFFICIENT: memory directly and fully answers the question → reply using it. Do NOT add or invent details beyond what memory says.\n` +
    `     - NOT SUFFICIENT (missing file, missing entry, or partial): your ENTIRE response MUST be this exact sentence — no preamble, no explanation, no extra words before or after:\n` +
    `       "Memory insufficient — you MUST START the agent to answer this question."\n` +
    `</reminder>`
  );
}

/** Appends the start-mode reminder to the instruction, forcing the agent to call the start tool. */
export const withStartReminder = (instruction: string, manifestKey: string): string =>
  `${instruction}\n<reminder>Must call "start_${manifestKey}" tool</reminder>`;

/** Appends the ask-mode memory workflow reminder to the instruction. No-op when memoryDir is absent. */
export const withMemoryReminder = (instruction: string, memoryDir?: string): string =>
  memoryDir ? `${instruction}\n${buildMemoryBullet(memoryDir)}` : instruction;

/** Returns the sub-agent reminder with optional extra instructions injected inside the <reminder> tag. */
export function buildSubAgentReminder(extra?: string): string {
  const parts = extra?.trim();
  if (!parts) return SUBAGENT_PROMPT_REMINDER;
  return SUBAGENT_PROMPT_REMINDER.replace("</reminder>", `\n${parts}\n</reminder>`);
}
