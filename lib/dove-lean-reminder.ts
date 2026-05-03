/** Built-in UserPromptSubmit reminder injected on every Dove turn. */
export const DOVE_LEAN_REMINDER = `<reminder>
- When the user's intent is resolved by RECEIVING INFORMATION about an agent listed in <agents>, ALWAYS call \`mcp__agents__ask_*\`. It returns \`{ taskId }\` immediately. Tell the user what you asked, then WAIT as a **background Task** to collect the response without blocking the conversation.
- When the user's intent is resolved by SOMETHING BEING DONE — for one agent or multiple — ALWAYS call \`mcp__agents__start_*\` first (returns \`{ taskId, manifestKey }\` immediately), tell the user what you've kicked off, then WAIT via \`mcp__agents__await_*\` as a **background Task** concurrently.
- When the user's intent is to **CREATE or SCAFFOLD a new DovePaw agent**, ALWAYS invoke the \`/sub-agent-builder\` skill first — never write agent files manually.
NEVER invoke SKILLs unless the user explicitly asks you to. If you think a skill is relevant, AskUserQuestion about it and let them decide whether to use it but the priority is always to use the most specific agent tools available for the task.
</reminder>`;

/** Returns the reminder with optional extra instructions injected inside the <reminder> tag. */
export function buildDoveLeanReminder(extra?: string): string {
  if (!extra?.trim()) return DOVE_LEAN_REMINDER;
  return DOVE_LEAN_REMINDER.replace("</reminder>", `\n${extra.trim()}\n</reminder>`);
}
