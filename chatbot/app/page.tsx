import { ChatApp } from "@/components/chat-app";
import { readAgentConfigEntries } from "@@/lib/agents-config";
import { readSettings } from "@@/lib/settings";
import { effectiveDoveSettings } from "@@/lib/settings-schemas";

export default async function Home() {
  const [agentConfigs, doveRaw] = await Promise.all([readAgentConfigEntries(), readSettings()]);
  const initialDoveSettings = effectiveDoveSettings(doveRaw);
  return <ChatApp agentConfigs={agentConfigs} initialDoveSettings={initialDoveSettings} />;
}
