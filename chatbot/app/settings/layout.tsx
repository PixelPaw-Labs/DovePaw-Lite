import { AgentSidebar } from "@/components/agent-chat/agent-sidebar";
import { readAgentConfigEntries } from "@@/lib/agents-config";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const agentConfigs = await readAgentConfigEntries();
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AgentSidebar agentConfigs={agentConfigs} />
      <main className="flex-1 flex flex-col bg-background relative min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
