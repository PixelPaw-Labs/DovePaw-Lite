import { describe, it, expect } from "vitest";
import { buildAgentConfig } from "../agent-config-builder";
import type { AgentDef } from "@@/lib/agents";
const DEF = {
  name: "my-agent",
  displayName: "My Agent",
  description: "Does things",
  entryPath: "agent-local/my-agent/main.ts",
} as unknown as AgentDef;

const CWD = "/tmp/workspace/my-agent";

describe("buildAgentConfig", () => {
  it("builds scriptPath from AGENT_LOCAL_DIR and agent name", () => {
    const config = buildAgentConfig(DEF, CWD, {}, []);
    expect(config.scriptPath).toMatch(/agent-local\/my-agent\/main\.ts$/);
  });

  it("sets agentName and whatItDoes from def", () => {
    const config = buildAgentConfig(DEF, CWD, {}, []);
    expect(config.agentName).toBe("My Agent");
    expect(config.whatItDoes).toBe("Does things");
  });

  it("sets workspacePath from cwd", () => {
    const config = buildAgentConfig(DEF, CWD, {}, []);
    expect(config.workspacePath).toBe("/tmp/workspace/my-agent");
  });

  it("injects AGENT_WORKSPACE into extraEnv", () => {
    const config = buildAgentConfig(DEF, CWD, { MY_VAR: "val" }, []);
    expect(config.extraEnv?.AGENT_WORKSPACE).toBe("/tmp/workspace/my-agent");
    expect(config.extraEnv?.MY_VAR).toBe("val");
  });

  it("injects REPO_LIST when repoSlugs are provided", () => {
    const config = buildAgentConfig(DEF, CWD, {}, ["owner/repo-a", "owner/repo-b"]);
    expect(config.extraEnv?.REPO_LIST).toBe("owner/repo-a,owner/repo-b");
  });

  it("omits REPO_LIST when repoSlugs is empty", () => {
    const config = buildAgentConfig(DEF, CWD, {}, []);
    expect(config.extraEnv?.REPO_LIST).toBeUndefined();
  });
});
