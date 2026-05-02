#!/usr/bin/env tsx
import {
  deployAgentSdk,
  linkAgentSdkToAgentLocal,
  linkLocalAgentSkills,
  syncAgentLocalToSettings,
} from "../lib/installer.js";

await deployAgentSdk();
await linkAgentSdkToAgentLocal();
await Promise.all([linkLocalAgentSkills(), syncAgentLocalToSettings()]);
console.log(`  SDK deployed`);
