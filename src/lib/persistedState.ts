import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Module-level store backing useState: values survive component unmount, so
 * navigating away and back (e.g. AI Toolbox → Settings → back) restores the
 * session instead of resetting it. In-flight async work can also write
 * results here after the component is gone — `set` writes the store first
 * and only then touches React state, so an unmounted caller still persists.
 *
 * The key may change between renders (per-tool state); a key change
 * re-reads the store so each key behaves like an independent slot.
 */
const store = new Map<string, unknown>();

export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() =>
    store.has(key) ? (store.get(key) as T) : initial,
  );
  const ref = useRef(value);

  // Key changed → this is a different slot; re-read its stored value.
  useEffect(() => {
    const next = store.has(key) ? (store.get(key) as T) : initial;
    ref.current = next;
    setValue(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === "function"
          ? (next as (p: T) => T)(ref.current)
          : next;
      ref.current = resolved;
      store.set(key, resolved);
      // No-op once unmounted — the store write above already happened.
      setValue(resolved);
    },
    [key],
  );
  return [value, set] as const;
}

/** Drop a persisted value (e.g. the mask strokes when the source image
 *  changes). */
export function clearPersisted(key: string) {
  store.delete(key);
}

/** Drop every persisted value whose key starts with `prefix` — e.g. clearing
 *  every tool's result slot when the source image changes. */
export function clearPersistedByPrefix(prefix: string) {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Read the live stored value (not a React snapshot) — used by async work to
 *  check whether its session is still current. */
export function readPersisted<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

/** Write a slot directly (no React involved) — used when one tool hands its
 *  result to another tool's slot. A mounted usePersistedState on that key
 *  re-reads via its key effect on the next render. */
export function writePersisted(key: string, value: unknown) {
  store.set(key, value);
}
