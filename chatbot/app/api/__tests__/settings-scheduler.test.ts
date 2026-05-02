import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AgentDef } from "@@/lib/agents";
import type { ScheduledJob } from "@@/lib/agents-config-schemas";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockScheduler = vi.hoisted(() => ({
  agentLabel: vi.fn((a: { name: string }) => `com.pixelpaw.scheduler.${a.name}`),
  jobLabel: vi.fn(
    (agentName: string, jobId: string) => `com.pixelpaw.scheduler.${agentName}.${jobId}`,
  ),
  configFilePath: vi.fn((_label: string) => ""),
  isAgentLoaded: vi.fn().mockResolvedValue(false),
  areAgentsLoaded: vi.fn().mockResolvedValue({}),
  loadAgent: vi.fn().mockResolvedValue(undefined),
  unloadAgent: vi.fn().mockResolvedValue(undefined),
  installAgent: vi.fn().mockResolvedValue({ skipped: false }),
  uninstallAgent: vi.fn().mockResolvedValue(undefined),
  writeAgentConfig: vi.fn().mockResolvedValue(undefined),
  writeJobConfig: vi.fn().mockResolvedValue(undefined),
  removeJobConfig: vi.fn().mockResolvedValue(undefined),
  activateJob: vi.fn().mockResolvedValue(undefined),
  deactivateJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@@/lib/scheduler", () => ({ scheduler: mockScheduler }));

const AGENT: AgentDef = {
  name: "my-agent",
  alias: "ma",
  entryPath: "agents/my-agent/main.ts",
  displayName: "My Agent",
  label: "Claude Code Agent - My Agent",
  manifestKey: "my_agent",
  toolName: "yolo_my_agent",
  description: "Test agent",
  icon: (() => null) as never,
  iconBg: "bg-blue-100",
  iconColor: "text-blue-700",
  doveCard: {
    icon: (() => null) as never,
    iconBg: "",
    iconColor: "",
    title: "",
    description: "",
    prompt: "",
  },
  suggestions: [],
};

const JOB: ScheduledJob = {
  id: "abc12345",
  label: "Daily run",
  schedule: { type: "calendar", hour: 9, minute: 0 },
  instruction: "do stuff",
};

vi.mock("@@/lib/agents-config", () => ({
  readAgentsConfig: vi.fn(),
}));

import { readAgentsConfig } from "@@/lib/agents-config";
import { GET, POST } from "../settings/scheduler/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockScheduler.isAgentLoaded.mockResolvedValue(false);
  mockScheduler.areAgentsLoaded.mockResolvedValue({});
  mockScheduler.configFilePath.mockReturnValue("");
});

// ─── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/settings/scheduler", () => {
  it("returns all agents with job statuses", async () => {
    vi.mocked(readAgentsConfig).mockResolvedValue([AGENT]);
    const req = new Request("http://localhost/api/settings/scheduler");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agents).toHaveProperty("my-agent");
    expect(body.agents["my-agent"].jobs).toHaveProperty("legacy");
  });

  it("returns a single agent when agentName is provided", async () => {
    vi.mocked(readAgentsConfig).mockResolvedValue([AGENT]);
    const req = new Request("http://localhost/api/settings/scheduler?agentName=my-agent");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toHaveProperty("legacy");
  });

  it("returns 404 when agentName is not found", async () => {
    vi.mocked(readAgentsConfig).mockResolvedValue([AGENT]);
    const req = new Request("http://localhost/api/settings/scheduler?agentName=missing");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns per-job statuses for agents with scheduledJobs", async () => {
    const agent = { ...AGENT, scheduledJobs: [JOB] };
    vi.mocked(readAgentsConfig).mockResolvedValue([agent]);
    mockScheduler.areAgentsLoaded.mockResolvedValue({
      [`com.pixelpaw.scheduler.my-agent.abc12345`]: true,
    });
    const req = new Request("http://localhost/api/settings/scheduler");
    const res = await GET(req);
    const body = await res.json();
    expect(body.agents["my-agent"].jobs["abc12345"].loaded).toBe(true);
  });
});

// ─── POST ─────────────────────────────────────────────────────────────────────

describe("POST /api/settings/scheduler", () => {
  it("returns 404 for unknown agent", async () => {
    vi.mocked(readAgentsConfig).mockResolvedValue([AGENT]);
    const req = new Request("http://localhost/api/settings/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentName: "missing", action: "install" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("install action calls uninstallAgent then installAgent", async () => {
    vi.mocked(readAgentsConfig).mockResolvedValue([AGENT]);
    const req = new Request("http://localhost/api/settings/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentName: "my-agent", action: "install" }),
    });
    await POST(req);
    expect(mockScheduler.uninstallAgent).toHaveBeenCalledWith(AGENT);
    expect(mockScheduler.installAgent).toHaveBeenCalledWith(AGENT, []);
  });

  it("load action calls loadAgent", async () => {
    vi.mocked(readAgentsConfig).mockResolvedValue([AGENT]);
    const req = new Request("http://localhost/api/settings/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentName: "my-agent", action: "load" }),
    });
    await POST(req);
    expect(mockScheduler.loadAgent).toHaveBeenCalledWith(AGENT);
  });

  it("unload action calls unloadAgent", async () => {
    vi.mocked(readAgentsConfig).mockResolvedValue([AGENT]);
    const req = new Request("http://localhost/api/settings/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentName: "my-agent", action: "unload" }),
    });
    await POST(req);
    expect(mockScheduler.unloadAgent).toHaveBeenCalledWith(AGENT);
  });

  it("delete action calls uninstallAgent", async () => {
    vi.mocked(readAgentsConfig).mockResolvedValue([AGENT]);
    const req = new Request("http://localhost/api/settings/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentName: "my-agent", action: "delete" }),
    });
    await POST(req);
    expect(mockScheduler.uninstallAgent).toHaveBeenCalledWith(AGENT);
  });

  it("unknown action returns 400", async () => {
    vi.mocked(readAgentsConfig).mockResolvedValue([AGENT]);
    const req = new Request("http://localhost/api/settings/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentName: "my-agent", action: "explode" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("job install action calls writeJobConfig and activateJob", async () => {
    const agent = { ...AGENT, scheduledJobs: [JOB] };
    vi.mocked(readAgentsConfig).mockResolvedValue([agent]);
    const req = new Request("http://localhost/api/settings/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentName: "my-agent", action: "install", jobId: "abc12345" }),
    });
    await POST(req);
    expect(mockScheduler.writeJobConfig).toHaveBeenCalledWith(agent, JOB);
    expect(mockScheduler.activateJob).toHaveBeenCalledWith(agent, JOB);
  });

  it("job delete action calls deactivateJob and removeJobConfig", async () => {
    const agent = { ...AGENT, scheduledJobs: [JOB] };
    vi.mocked(readAgentsConfig).mockResolvedValue([agent]);
    const req = new Request("http://localhost/api/settings/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentName: "my-agent", action: "delete", jobId: "abc12345" }),
    });
    await POST(req);
    expect(mockScheduler.deactivateJob).toHaveBeenCalledWith(agent, JOB);
    expect(mockScheduler.removeJobConfig).toHaveBeenCalledWith(agent, JOB);
  });

  it("job not found returns 404", async () => {
    const agent = { ...AGENT, scheduledJobs: [JOB] };
    vi.mocked(readAgentsConfig).mockResolvedValue([agent]);
    const req = new Request("http://localhost/api/settings/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentName: "my-agent", action: "install", jobId: "missing" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});
