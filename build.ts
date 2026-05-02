#!/usr/bin/env tsx

/**
 * Build & install scheduler agents.
 *
 * Usage:
 *   npm run install-agents          # build + install + reload all agents
 *   npm run install-agents -- --uninstall   # unload + remove all agents
 */

import { execSync } from "node:child_process";
import { agents } from "./scheduler-config/configs.js";
import { SCHEDULER_ROOT } from "./lib/paths.js";
import {
  copyNativePackages,
  deployAgentSdk,
  linkLocalAgentSkills,
} from "./lib/installer.js";
import { scheduler } from "./lib/scheduler.js";

const NATIVE_PACKAGES = ["@ladybugdb/core"];
const uninstall = process.argv.includes("--uninstall");

// ─── Uninstall ───────────────────────────────────────────────────────────────

if (uninstall) {
  if (process.platform !== "win32") {
    console.log("Uninstalling all scheduler agents...\n");
    await Promise.all(agents.map((agent) => scheduler.uninstallAgent(agent)));
  }
  console.log(`\nDone. Scripts remain in ${SCHEDULER_ROOT}/ for manual use.`);
  process.exit(0);
}

// ─── Build ───────────────────────────────────────────────────────────────────

console.log("Step 1: Building TypeScript...\n");
execSync("npx tsup", { stdio: "inherit", cwd: import.meta.dirname });

// ─── Install + load ──────────────────────────────────────────────────────────

console.log("\nStep 2: Linking skills and deploying SDK...\n");
await deployAgentSdk();
await linkLocalAgentSkills();
console.log(`  SDK deployed to ~/.dovepaw-lite/sdk`);

if (process.platform === "win32") {
  console.log("\nStep 3: Skipped (unsupported platform).");
  console.log("Step 4: Skipped.");
} else {
  console.log("\nStep 3: Installing scheduler entries...\n");
  await copyNativePackages(NATIVE_PACKAGES);
  await Promise.all(agents.map((agent) => scheduler.installAgent(agent, NATIVE_PACKAGES)));
  console.log("  Done");

  console.log("\nStep 4: Verifying...\n");
  await Promise.all(
    agents.map(async (agent) => {
      const ok = await scheduler.isAgentLoaded(scheduler.agentLabel(agent));
      console.log(`  ${ok ? "OK" : "WARN"}: ${agent.name}`);
    }),
  );
}

console.log("\nDone!");
