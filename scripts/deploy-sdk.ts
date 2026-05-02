#!/usr/bin/env tsx
import {
  deployAgentSdk,
  linkAgentSdkToAgentLocal,
  linkLocalAgentSkills,
} from "../lib/installer.js";

await deployAgentSdk();
await linkAgentSdkToAgentLocal();
await linkLocalAgentSkills();
console.log(`  SDK deployed`);
