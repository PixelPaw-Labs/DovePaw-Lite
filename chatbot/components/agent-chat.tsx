"use client";

import * as React from "react";
import type { AgentConfigEntry } from "@@/lib/agents-config-schemas";
import type { AgentId } from "@/lib/agent-api-urls";
import { useChatSession } from "@/components/hooks/use-chat-session";
import { ChatPane } from "@/components/agent-chat/chat-pane";

interface AgentChatProps {
  agentId: string;
  agentConfigs: AgentConfigEntry[];
  onIsLoadingChange: (loading: boolean) => void;
  onNewSession: (fn: () => void) => void;
}

export function AgentChat({
  agentId,
  agentConfigs,
  onIsLoadingChange,
  onNewSession,
}: AgentChatProps) {
  return (
    <AgentChatSession
      agentId={agentId as AgentId}
      agentConfigs={agentConfigs}
      onIsLoadingChange={onIsLoadingChange}
      onNewSession={onNewSession}
    />
  );
}

function AgentChatSession({
  agentId,
  agentConfigs,
  onIsLoadingChange,
  onNewSession,
}: {
  agentId: AgentId;
  agentConfigs: AgentConfigEntry[];
  onIsLoadingChange: (loading: boolean) => void;
  onNewSession: (fn: () => void) => void;
}) {
  const session = useChatSession(agentId);

  // Register a clear handler.
  React.useEffect(() => {
    onNewSession(() => {
      session.newSession();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify parent when loading changes.
  // useLayoutEffect fires before paint so ConversationContext (and the agent button shimmer)
  // updates in the same frame as the chat UI — prevents the shimmer outlasting the response.
  const prevIsLoadingRef = React.useRef(session.isLoading);
  React.useLayoutEffect(() => {
    if (prevIsLoadingRef.current !== session.isLoading) {
      onIsLoadingChange(session.isLoading);
    }
    prevIsLoadingRef.current = session.isLoading;
  }, [session.isLoading, onIsLoadingChange]);

  return (
    <ChatPane
      agentId={agentId}
      agentConfigs={agentConfigs}
      messages={session.messages}
      isLoading={session.isLoading}
      currentSessionId={session.currentSessionId}
      pendingPermissions={session.pendingPermissions}
      pendingQuestions={session.pendingQuestions}
      pendingQueue={session.pendingQueue}
      sendMessage={session.sendMessage}
      cancelMessage={session.cancelMessage}
      newSession={session.newSession}
      resolvePermission={session.resolvePermission}
      resolveQuestion={session.resolveQuestion}
      removeFromQueue={session.removeFromQueue}
    />
  );
}
