#!/usr/bin/env tsx
import { deployAgentSdk } from "../lib/installer.js";

await deployAgentSdk();
console.log(`  SDK deployed`);
