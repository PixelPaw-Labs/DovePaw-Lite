#!/usr/bin/env tsx
/**
 * Usage:
 *   tsx scripts/setup.ts            # common setup only (npm run dev)
 *   tsx scripts/setup.ts --install  # common setup + tsup + register scheduler (local dev + Docker)
 *   npm run uninstall                # unload and remove all scheduler entries
 */

import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { agents } from "../scheduler-config/configs.js";
import { SCHEDULER_ROOT } from "../lib/paths.js";
import {
  copyNativePackages,
  deployAgentSdk,
  linkAgentSdkToAgentLocal,
  linkLocalAgentSkills,
  syncAgentLocalToSettings,
  syncClaudeRules,
} from "../lib/installer.js";
import { scheduler } from "../lib/scheduler.js";

const NATIVE_PACKAGES = ["@ladybugdb/core"];
const install = process.argv.includes("--install");
const uninstall = process.argv.includes("--uninstall");

// ─── Uninstall ────────────────────────────────────────────────────────────────

if (uninstall) {
  if (process.platform !== "win32") {
    console.log("Uninstalling all scheduler agents...\n");
    await Promise.all(agents.map((agent) => scheduler.uninstallAgent(agent)));
  }
  console.log(`\nDone. Scripts remain in ${SCHEDULER_ROOT}/ for manual use.`);
  process.exit(0);
}

// ─── Common setup (always runs) ───────────────────────────────────────────────

await deployAgentSdk();
await linkAgentSdkToAgentLocal();
await Promise.all([linkLocalAgentSkills(), syncAgentLocalToSettings(), syncClaudeRules()]);
console.log(`  SDK deployed`);

// ─── Install: compile + register scheduler ───────────────────────────────────

if (install) {
  console.log("\nBuilding TypeScript...\n");
  execSync("npx tsup", { stdio: "inherit", cwd: resolve(import.meta.dirname, "..") });
}

if (install && process.platform !== "win32") {
  console.log("\nInstalling scheduler entries...\n");
  await copyNativePackages(NATIVE_PACKAGES);
  await Promise.all(agents.map((agent) => scheduler.installAgent(agent, NATIVE_PACKAGES)));

  console.log("\nVerifying...\n");
  await Promise.all(
    agents.map(async (agent) => {
      const ok = await scheduler.isAgentLoaded(scheduler.agentLabel(agent));
      console.log(`  ${ok ? "OK" : "WARN"}: ${agent.name}`);
    }),
  );

  console.log("\nDone!");
}
