"use client";

import {
  addQueueEntrySafe,
  createFlux,
  createNoopAdapter,
  getQueueCount,
  initReplayTriggers,
  replayQueue,
  type FluxEngine,
  type QueueWriteResult,
} from "@tsworldtech/flux";

/**
 * Flux, kept to one job: lesson progress that survives a dropped connection.
 *
 * A learner on Nigerian mobile data loses the network mid-lesson and the
 * "mark complete" button fails. The lesson was still watched; the progress is
 * still real. This writes that intent to IndexedDB and replays it to
 * /api/progress/complete when the connection comes back.
 *
 * Deliberately narrow. Flux can also put the browser in direct conversation
 * with Postgres through its Supabase adapter, which would move authorisation
 * out of the server and into row-level policies for every table it touches.
 * That is a much larger change than an offline queue, so the adapter here is
 * the no-op one: no realtime, no database exposure, nothing on the wire but
 * our own authenticated endpoint.
 *
 * Browser only. The engine touches IndexedDB, Web Locks and BroadcastChannel,
 * none of which exist during server rendering, so every entry point here is
 * called from an effect and the module is imported dynamically.
 */

const STORE_NAME = "lesson-progress";
const ENDPOINT = "/api/progress/complete";

/** Namespaces IndexedDB keys and locks, so a second app on this origin cannot collide. */
export const STORAGE_PREFIX = "copaserve";

let engine: FluxEngine | null = null;
let replayStop: (() => void) | null = null;

/**
 * Start the engine once per page.
 *
 * createFlux verifies the licence asynchronously, which is also why this is
 * not a module-level constant: on a hard refresh while offline the check fails
 * with KEY_UNAVAILABLE and recovers on the next focus, and none of that should
 * happen while a component is rendering.
 */
export function getFlux(): FluxEngine {
  if (engine) return engine;

  engine = createFlux({
    // No realtime. The queue and IndexedDB are what this integration uses.
    adapter: createNoopAdapter(),
    license: process.env.NEXT_PUBLIC_FLUX_LICENSE_TOKEN,
    storagePrefix: STORAGE_PREFIX,
    onStorageFallback: (layer, reason) => {
      // IndexedDB is unavailable in some private-browsing modes. Flux falls
      // back to localStorage and then to memory; memory means the queue does
      // not survive a reload, which is worth knowing about rather than
      // discovering from a support message.
      console.warn(`[flux] queue fell back to ${layer}: ${reason}`);
    },
  });

  return engine;
}

/**
 * Replay anything queued, and keep replaying as the connection returns.
 *
 * Scoped to one learner: queue entries carry the user id they were written
 * under, so a shared device cannot replay one person's progress into another
 * person's account.
 */
export function startReplay(userId: string): () => void {
  getFlux();
  replayStop?.();

  // userId is not decoration. Entries carry the account they were queued
  // under, and the endpoint takes the caller from whatever session is signed
  // in now — so replaying unscoped on a shared phone would credit one
  // learner's lesson to the next person to log in.
  replayStop = initReplayTriggers({
    queues: [
      { storeName: STORE_NAME, endpoint: ENDPOINT, storagePrefix: STORAGE_PREFIX, method: "POST", userId },
    ],
  });

  return () => {
    replayStop?.();
    replayStop = null;
  };
}

/** Write the intent down. Returns which layer it landed in. */
export async function queueLessonCompletion(
  lessonId: string,
  userId: string,
): Promise<QueueWriteResult> {
  getFlux();

  return addQueueEntrySafe(
    {
      storeName: STORE_NAME,
      // userId travels with the entry so the endpoint can refuse it if a
      // different learner is signed in by the time it replays.
      payload: { lessonId, userId },
      timestamp: Date.now(),
      method: "POST",
      endpoint: ENDPOINT,
      // One entry per lesson. Clicking twice offline is one completion, and
      // 'reject' keeps the first — the earlier timestamp is the truer one.
      dedupeKey: lessonId,
      dedupeStrategy: "reject",
    },
    STORAGE_PREFIX,
    undefined,
    undefined,
    undefined,
    "user",
    userId,
  );
}

/** How many completions are still waiting to reach the server. */
export function pendingCount(userId: string): Promise<number> {
  return getQueueCount(STORAGE_PREFIX, STORE_NAME, userId);
}

/** Flush now — used when the browser says the connection is back. */
export function flushNow(userId: string): Promise<void> {
  return replayQueue({
    storeName: STORE_NAME,
    endpoint: ENDPOINT,
    storagePrefix: STORAGE_PREFIX,
    method: "POST",
    userId,
  });
}
