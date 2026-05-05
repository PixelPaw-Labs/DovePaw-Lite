/**
 * SSE heartbeat — pings each agent's A2A agent-card endpoint every INTERVAL_MS,
 * reads processing state from PROCESSING_FILE (written by processing-registry.ts
 * on every state change), and streams results to browser clients.
 *
 * Runs entirely in the Next.js process — no dependency on the A2A heartbeat server
 * or any shared intermediate file for the main ping data.
 */

import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { PROCESSING_FILE, PORTS_FILE } from "@/lib/paths";
import { readPortsManifest } from "@/a2a/lib/ports-manifest";
import { getSchedulerStatuses } from "@/lib/agent-scheduler";
import type { AgentStatus, StatusMessage } from "@/a2a/heartbeat-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERVAL_MS = 10_000;
const PING_TIMEOUT_MS = 5_000;

const DEBUG = process.env.HEARTBEAT_DEBUG === "1";
const dbg = (...args: unknown[]) => DEBUG && console.log("[heartbeat]", ...args);

async function pingAgent(port: number): Promise<Pick<AgentStatus, "online" | "latency">> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(`http://localhost:${port}/.well-known/agent-card.json`, {
      signal: controller.signal,
    });
    return { online: res.ok, latency: Date.now() - t0 };
  } catch (err) {
    dbg(`ping port ${port} failed:`, err instanceof Error ? err.message : err);
    return { online: false, latency: null };
  } finally {
    clearTimeout(timer);
  }
}

const processingStateSchema = z.record(
  z.string(),
  z.object({
    processing: z.boolean(),
    processingTrigger: z.union([z.literal("scheduled"), z.literal("dove")]).nullable(),
  }),
);
type ProcessingState = z.infer<typeof processingStateSchema>;

const EMPTY_PROCESSING: ProcessingState = {};

function readProcessingState(): ProcessingState {
  try {
    if (!existsSync(PROCESSING_FILE)) return EMPTY_PROCESSING;
    const raw: unknown = JSON.parse(readFileSync(PROCESSING_FILE, "utf-8"));
    const result = processingStateSchema.safeParse(raw);
    return result.success ? result.data : EMPTY_PROCESSING;
  } catch {
    return EMPTY_PROCESSING;
  }
}

async function checkAll(): Promise<Record<string, AgentStatus>> {
  dbg("PORTS_FILE:", PORTS_FILE);
  const manifest = readPortsManifest();
  if (!manifest) {
    dbg("ports manifest missing or invalid");
    return {};
  }

  const agentPorts = Object.entries(manifest).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number",
  );
  dbg(
    "agent keys from manifest:",
    agentPorts.map(([k]) => k),
  );
  if (agentPorts.length === 0) return {};

  const processing = readProcessingState();
  let schedulerMap: Record<string, { loaded: boolean; running: boolean }> = {};
  try {
    schedulerMap = await getSchedulerStatuses();
  } catch (err) {
    dbg("getSchedulerStatuses failed:", err instanceof Error ? err.message : err);
  }

  const pingResults = await Promise.all(agentPorts.map(([, port]) => pingAgent(port)));
  dbg("ping results:", Object.fromEntries(agentPorts.map(([k], i) => [k, pingResults[i]])));

  return Object.fromEntries(
    agentPorts.map(([k], i) => [
      k,
      {
        ...pingResults[i],
        scheduler: schedulerMap[k] ?? null,
        processing: processing[k]?.processing ?? false,
        processingTrigger: processing[k]?.processingTrigger ?? null,
      },
    ]),
  );
}

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  dbg("SSE client connected");

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      function send(agents: Record<string, AgentStatus>) {
        const msg: StatusMessage = { type: "status", agents };
        const payload = JSON.stringify(msg);
        dbg("sending status, agent count:", Object.keys(agents).length);
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }

      async function tick() {
        if (closed) return;
        try {
          const agents = await checkAll();
          if (!closed) send(agents);
        } catch (err) {
          console.error("[heartbeat] tick error:", err);
        }
      }

      void tick();
      const timer = setInterval(() => void tick(), INTERVAL_MS);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(timer);
        dbg("SSE client disconnected");
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
