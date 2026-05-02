import type { AgentConfigEntry } from "@@/lib/agents-config-schemas";

const DOVE_ID = "dove";

/** "dove" | any agent config entry name. Derived from AgentConfigEntry["name"] so it
 *  automatically widens if the schema ever narrows name to a literal union. */
export type AgentId = typeof DOVE_ID | (AgentConfigEntry["name"] & {});


export function sessionDetailUrl(_agentId: AgentId, id: string): string {
  return `/api/chat/session/${id}`;
}

export function agentChatUrl(_agentId: AgentId): string {
  return "/api/chat";
}


export function sessionStreamUrl(sessionId: string): string {
  return `/api/chat/stream/${sessionId}`;
}
