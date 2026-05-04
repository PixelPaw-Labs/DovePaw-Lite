#!/usr/bin/env node
/**
 * Decrypt an EJSON secrets file and print `export KEY=VALUE` lines to stdout.
 *
 * Usage (in entrypoint.sh):
 *   eval "$(node /app/docker/ejson-inject.mjs /run/secrets/secrets.ejson)"
 *
 * The ejson binary uses EJSON_KEYDIR (or ~/.ejson/keys/) to locate the private
 * key matching the public key in the file. Pass EJSON_PRIVATE_KEY to ejson if
 * the key is supplied as an environment variable instead.
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const ejsonSchema = z.object({ environment: z.record(z.string(), z.string()).optional() });

/** Parse decrypted EJSON output and return shell export lines. */
export function buildExports(parsed) {
  const { environment = {} } = ejsonSchema.parse(parsed);
  return Object.entries(environment)
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => `export ${k}=${JSON.stringify(v)}\n`)
    .join("");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) process.exit(0);
  const json = execSync(`ejson decrypt ${JSON.stringify(file)}`, { encoding: "utf8" });
  process.stdout.write(buildExports(JSON.parse(json)));
}
