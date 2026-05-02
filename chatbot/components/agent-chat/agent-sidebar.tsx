"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bot, PawPrint, Settings } from "lucide-react";
import { LUCIDE_ICON_REGISTRY } from "@@/lib/icon-registry";
import { buildAgentDef } from "@@/lib/agents";
import type { AgentConfigEntry } from "@@/lib/agents-config-schemas";
import { cn } from "@/lib/utils";
import { useAgentHeartbeat } from "@/components/hooks/use-agent-heartbeat";
import { useConversationContext } from "@/components/hooks/use-conversation-context";
import { useButtonShimmer } from "@/components/hooks/use-button-shimmer";
import { useDoveSettings } from "@/components/hooks/use-dove-settings";
import type { DoveSettings } from "@@/lib/settings-schemas";
import type { AgentStatus } from "@/a2a/heartbeat-types";
import { AgentButton } from "./agent-button";

interface AgentSidebarProps {
  agentConfigs: AgentConfigEntry[];
  activeAgentId?: string;
  initialDoveSettings?: DoveSettings;
  onSelectAgent?: (agentId: string) => void;
}

export function AgentSidebar({
  agentConfigs,
  activeAgentId = "dove",
  initialDoveSettings,
  onSelectAgent,
}: AgentSidebarProps) {
  const { doveIsRunning } = useConversationContext();
  const statuses = useAgentHeartbeat();
  const pathname = usePathname();
  const router = useRouter();
  const isSettings = pathname === "/settings";

  const hasData = Object.keys(statuses).length > 0;
  const onlineCount = Object.values(statuses).filter((s) => s.online).length;
  const anyOnline = onlineCount > 0;

  const doveSettings = useDoveSettings(initialDoveSettings);
  const DoveIcon = LUCIDE_ICON_REGISTRY[doveSettings.iconName] ?? Bot;

  const isDoveLoading = doveIsRunning;
  const doveShimmerRef = useButtonShimmer(isDoveLoading);
  const isDoveSelected = (activeAgentId === "dove" && !isSettings) || isDoveLoading;

  const MIN_WIDTH = 180;
  const MAX_WIDTH = 480;
  const [sidebarWidth, setSidebarWidth] = React.useState(256);
  React.useEffect(() => {
    const stored = localStorage.getItem("sidebar-width");
    if (stored) setSidebarWidth(Number(stored));
  }, []);
  const isDragging = React.useRef(false);

  function handleResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    function onMove(ev: MouseEvent) {
      if (!isDragging.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + ev.clientX - startX));
      setSidebarWidth(next);
      localStorage.setItem("sidebar-width", String(next));
    }
    function onUp() {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <aside
      style={{ width: sidebarWidth }}
      className="h-screen shrink-0 flex flex-col bg-background border-r border-border/30 relative"
    >
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/30 transition-colors z-50"
      />
      {/* Logo header */}
      <div className="px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
            <PawPrint className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">
              DOVEPAW AGENTS
            </h2>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">
              AI Workforce
            </p>
          </div>
        </div>
      </div>

      {/* Agent nav — scrolls independently; settings links stay pinned below */}
      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto overflow-x-hidden misty-scroll">
        {/* Dove — the orchestrator (always first, outside all groups) */}
        <button
          onClick={() => onSelectAgent?.("dove")}
          className={cn(
            "relative overflow-hidden shrink-0 my-0.5 px-4 py-2.5 flex items-center gap-3 text-left transition-all w-full",
            isDoveSelected
              ? "bg-primary/10 text-primary border-l-4 border-primary"
              : "text-muted-foreground hover:bg-muted hover:translate-x-0.5 duration-200",
          )}
        >
          {isDoveLoading && (
            <span
              ref={doveShimmerRef}
              aria-hidden
              className="absolute inset-y-0 left-0 w-1/2 pointer-events-none -skew-x-12"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.06) 75%, transparent 100%)",
              }}
            />
          )}
          <div
            className={cn(
              "w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors",
              doveSettings.iconBg,
              doveSettings.iconColor,
            )}
          >
            <DoveIcon className="w-3 h-3" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className={cn("text-sm font-medium", !isDoveSelected && "text-foreground/80")}>
              {doveSettings.displayName}
            </span>
            <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wide">
              Orchestrator
            </span>
          </div>
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", "bg-green-500 animate-pulse")} />
        </button>

        {agentConfigs.map((config) => {
          const agent = buildAgentDef(config);
          const isAgentSettings =
            pathname === `/settings/agents/${agent.name}` ||
            pathname === `/settings/agents/${agent.name}/repos`;
          return (
            <AgentButton
              key={agent.manifestKey}
              agent={agent}
              isActive={!isSettings && !isAgentSettings && activeAgentId === agent.name}
              status={statuses[agent.manifestKey]}
              hasData={hasData}
              onClick={() => onSelectAgent?.(agent.name)}
              settingsHref={`/settings/agents/${agent.name}`}
              isAgentSettings={isAgentSettings}
            />
          );
        })}
      </nav>

      {/* Settings nav links — always pinned at bottom */}
      <div className="pb-2 flex flex-col gap-0.5 border-t border-border/20 bg-background/80 backdrop-blur-xl shadow-[0_-8px_20px_-4px_rgba(0,0,0,0.06)] pt-1">
        <Link
          href="/settings"
          className={cn(
            "my-0.5 px-4 py-2.5 flex items-center gap-3 transition-all w-full",
            isSettings
              ? "bg-primary/10 text-primary border-l-4 border-primary"
              : "text-muted-foreground hover:bg-muted hover:translate-x-0.5 duration-200",
          )}
        >
          <Settings className={cn("w-4 h-4 shrink-0", isSettings ? "text-primary" : "")} />
          <span className={cn("text-sm font-medium", !isSettings && "text-foreground/80")}>
            Settings
          </span>
        </Link>
      </div>

      {/* Bottom branding */}
      <div className="p-4">
        <div className="p-3 rounded-xl bg-muted border border-border/40">
          <p className="text-[11px] font-bold text-primary tracking-tight mb-1">DovePaw</p>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                anyOnline ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40",
              )}
            />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {!hasData
                ? "Connecting…"
                : anyOnline
                  ? `System Status: Optimal · ${onlineCount} active`
                  : "Agents Offline"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

