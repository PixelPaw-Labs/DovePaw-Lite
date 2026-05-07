/** Built-in UserPromptSubmit reminder injected on every sub-agent turn (start mode). */
export const SUBAGENT_PROMPT_REMINDER = `<reminder>
- **Bad:** Do the work inline when asked to perform a task. **Correct:** ALWAYS call \`start_*\` first (returns runId immediately), tell the user what you've kicked off, then WAIT via \`await_*\` as a **background Task** concurrently.
{{extra}}
</reminder>`;

function buildMemoryBullet(memoryDir: string): string {
  return (
    `<reminder>\n` +
    `- **Bad:** Answer a question without reading memory first. **Correct:** ALWAYS read \`${memoryDir}/memory/MEMORY.md\` — if a relevant entry exists, read that file before answering.\n` +
    `- **Bad:** Answer when memory is missing, incomplete, or doesn't fully cover the question. **Correct:** Your ENTIRE response MUST be this exact sentence — no other words: "Memory insufficient — you MUST START the agent to answer this question."\n` +
    `- **Bad:** Add or infer details beyond what memory says. **Correct:** Reply using only what memory contains.\n` +
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
  return SUBAGENT_PROMPT_REMINDER.replace("{{extra}}", extra?.trim() ? extra.trim() : "");
}
