import { setSessionStatus } from "@/lib/db-lite";
import { sessionRunner } from "@/lib/session-runner";

/**
 * Wire session-runner status callbacks to the DB. Call once at server startup.
 */
export function enablePersistence(): void {
  sessionRunner.configure({
    onComplete: (id) => setSessionStatus(id, "done"),
    onAbort: (id) => setSessionStatus(id, "cancelled"),
  });
}
