import { defineConfig } from "tsup";
import { readAgentConfigEntries } from "./lib/agents-config.js";

const agentEntries = await readAgentConfigEntries();

// Only bundle agents whose script is TypeScript (scriptFile absent or ending in .ts).
// Non-TS agents (e.g. Ruby via scriptFile: "main.rb") are executed directly at runtime.
const tsAgentEntries = agentEntries.filter((a) => !a.scriptFile || a.scriptFile.endsWith(".ts"));

export default defineConfig({
  entry: {
    ...Object.fromEntries(
      tsAgentEntries.map((a) => {
        const script = a.scriptFile ?? "main.ts";
        return [`agents/${a.name}`, `agent-local/${a.name}/${script}`];
      }),
    ),
    "a2a-trigger": "lib/a2a-trigger.ts",
  },
  format: "esm",
  outDir: "dist",
  bundle: true,
  splitting: false,
  external: ["@ladybugdb/core", "@a2a-js/sdk"], // native addon + SDK deployed to scheduler separately
  platform: "node",
  target: "node24",
  banner: { js: "#!/usr/bin/env node" },
  outExtension: () => ({ js: ".mjs" }),
  clean: true,
});
