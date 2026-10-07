import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Module-level external store keyed by slot name. Values survive component
 * unmount, so navigating away and back (e.g. AI Toolbox → Settings → back)
 * restores the session instead of resetting it. In-flight async work can
 * also write results here after the component is gone: a captured `set`
 * talks to the store, not to a hook instance, so it still persists.
 *
 * React binds to the store via `useSyncExternalStore` with PER-KEY
 * subscriptions. Every mounted hook listens only to its own key, so:
 * - a setter captured by tool A reads/writes A's key and notifies only
 *   hooks on A — it can never touch tool B's UI after a key switch;
 * - a write that lands while nobody is mounted (`writePersisted` from an
 *   async task, or a late `set`) is picked up both by the next mount and
 *   by any hook already listening on that key;
 * - `writePersisted` notifies mounted hooks on that key (e.g. the Home
 *   update banner refreshes when the update check finishes).
 *
 * The key may change between renders (per-tool state): `subscribe` and
 * `getSnapshot` are keyed with `useCallback`, so a key change makes
 * `useSyncExternalStore` re-subscribe and re-read the new slot — each key
 * behaves like an independent store.
 *
 * `clearPersisted`/`clearPersistedByPrefix` notify every MOUNTED hook whose
 * key was cleared, so the UI resets immediately instead of showing stale
 * values until the next re-render.
 */

/** React's onStoreChange callback for one mounted hook. */
type KeyListener = () => void;

const store = new Map<string, unknown>();
/** Mounted listeners per key — the pub/sub side of the external store. */
const keyListeners = new Map<string, Set<KeyListener>>();

/** Notify every hook mounted on `key`. Store writes MUST land before this
 *  runs: getSnapshot has to observe the new reference, otherwise
 *  useSyncExternalStore sees no change and skips the re-render. */
function notifyKey(key: string) {
  const listeners = keyListeners.get(key);
  if (!listeners) return;
  // Iterate a copy: React may (un)subscribe other hooks synchronously
  // inside a listener while it re-renders.
  for (const listener of [...listeners]) listener();
}

export function usePersistedState<T>(key: string, initial: T) {
  // useSyncExternalStore compares snapshots by identity: while the store
  // has no entry for this key, getSnapshot must keep returning the SAME
  // initial reference (a fresh literal per render would loop forever). The
  // cache is re-captured when the key changes, so a slot keeps the initial
  // it was mounted with — same semantics as the old key-change effect.
  const initialRef = useRef<{ key: string; value: T } | null>(null);
  if (initialRef.current === null || initialRef.current.key !== key) {
    initialRef.current = { key, value: initial };
  }

  // Keyed subscribe/getSnapshot: a key change re-subscribes and re-reads
  // the new slot's snapshot.
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let listeners = keyListeners.get(key);
      if (!listeners) {
        listeners = new Set();
        keyListeners.set(key, listeners);
      }
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
        if (listeners.size === 0 && keyListeners.get(key) === listeners) {
          keyListeners.delete(key);
        }
      };
    },
    [key],
  );

  const getSnapshot = useCallback(() => {
    if (store.has(key)) return store.get(key) as T;
    return initialRef.current!.value;
  }, [key]);

  // Client-only app: never actually invoked, but keeps the hook API
  // complete. Reads through the ref so it stays in sync with the key.
  const getServerSnapshot = useCallback(() => initialRef.current!.value, []);

  const value = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      // The previous value comes from the STORE — the single source of
      // truth — never from this hook instance: a setter captured by async
      // work must read and write its OWN key even after the hook has
      // switched to another key. An empty slot falls back to the initial
      // this slot was mounted with (the closure re-captures together with
      // initialRef whenever the key changes).
      const prev = store.has(key) ? (store.get(key) as T) : initial;
      const resolved =
        typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      store.set(key, resolved);
      notifyKey(key);
    },
    // `initial` is deliberately not a dependency: the callback must keep
    // the initial captured when this key was mounted (same as initialRef),
    // so a stale setter from before a key switch uses the right slot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return [value, set] as const;
}

/** Drop a persisted value (e.g. the mask strokes when the source image
 *  changes). Mounted hooks on this key reset to their initial value. */
export function clearPersisted(key: string) {
  if (store.delete(key)) notifyKey(key);
}

/** Drop every persisted value whose key starts with `prefix` — e.g. clearing
 *  every tool's result slot when the source image changes. */
export function clearPersistedByPrefix(prefix: string) {
  const cleared: string[] = [];
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      cleared.push(key);
    }
  }
  // Notify only after every deletion landed, so re-rendering listeners
  // observe a fully-consistent store.
  for (const key of cleared) notifyKey(key);
}

/** Read the live stored value (not a React snapshot) — used by async work to
 *  check whether its session is still current. */
export function readPersisted<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

/** Write a slot directly — used when one tool hands its result to another
 *  tool's slot, or when non-React code (e.g. the update check) produces a
 *  value. Mounted hooks on that key are notified, so their UI refreshes
 *  immediately. */
export function writePersisted(key: string, value: unknown) {
  store.set(key, value);
  notifyKey(key);
}
