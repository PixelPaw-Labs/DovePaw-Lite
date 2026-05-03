#!/usr/bin/env tsx
import {
  deployAgentSdk,
  linkAgentSdkToAgentLocal,
  linkLocalAgentSkills,
  syncAgentLocalToSettings,
  syncClaudeRules,
} from "../lib/installer.js";

await deployAgentSdk();
await linkAgentSdkToAgentLocal();
await Promise.all([linkLocalAgentSkills(), syncAgentLocalToSettings(), syncClaudeRules()]);
console.log(`  SDK deployed`);
