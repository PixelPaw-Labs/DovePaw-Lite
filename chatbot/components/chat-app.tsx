"use client";

import * as React from "react";
import type { AgentConfigEntry } from "@@/lib/agents-config-schemas";
import type { DoveSettings } from "@@/lib/settings-schemas";
import { AgentSidebar } from "@/components/agent-chat/agent-sidebar";
import { AgentChat } from "@/components/agent-chat";
import { ConversationProvider } from "@/components/hooks/use-conversation-context";

interface ChatAppProps {
  agentConfigs: AgentConfigEntry[];
  tmpAgentConfigs?: AgentConfigEntry[];
  initialDoveSettings?: DoveSettings;
}

export function ChatApp({
  agentConfigs,
  tmpAgentConfigs = [],
  initialDoveSettings,
}: ChatAppProps) {
  const [activeAgentId, setActiveAgentId] = React.useState("dove");
  const [isLoading, setIsLoading] = React.useState(false);
  const [doveIsRunning, setDoveIsRunning] = React.useState(false);
  const newSessionRef = React.useRef<(() => void) | null>(null);

  const handleSelectAgent = React.useCallback((agentId: string) => {
    setActiveAgentId(agentId);
    setIsLoading(false);
  }, []);

  return (
    <ConversationProvider
      isLoading={isLoading}
      activeAgentId={activeAgentId}
      doveIsRunning={doveIsRunning}
    >
      <div className="flex h-screen bg-background overflow-hidden">
        <AgentSidebar
          agentConfigs={agentConfigs}
          tmpAgentConfigs={tmpAgentConfigs}
          initialDoveSettings={initialDoveSettings}
          onSelectAgent={handleSelectAgent}
          activeAgentId={activeAgentId}
        />
        <AgentChat
          key={activeAgentId}
          agentId={activeAgentId}
          agentConfigs={[...agentConfigs, ...tmpAgentConfigs]}
          onIsLoadingChange={(loading) => {
            setIsLoading(loading);
            if (activeAgentId === "dove") setDoveIsRunning(loading);
          }}
          onNewSession={(fn) => {
            newSessionRef.current = fn;
          }}
        />
      </div>
    </ConversationProvider>
  );
}
