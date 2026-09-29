import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  clearPersisted,
  clearPersistedByPrefix,
  readPersisted,
  usePersistedState,
  writePersisted,
} from "./persistedState";

afterEach(() => {
  cleanup();
  clearPersistedByPrefix("test.");
});

describe("persistedState", () => {
  it("persists across unmount and remount", () => {
    const first = renderHook(() => usePersistedState<string>("test.a", "x"));
    act(() => first.result.current[1]("hello"));
    first.unmount();
    const second = renderHook(() => usePersistedState<string>("test.a", "x"));
    expect(second.result.current[0]).toBe("hello");
  });

  it("clearPersisted resets a MOUNTED hook to its initial value", () => {
    const { result } = renderHook(() => usePersistedState<string>("test.b", "init"));
    act(() => result.current[1]("changed"));
    expect(result.current[0]).toBe("changed");
    act(() => clearPersisted("test.b"));
    expect(result.current[0]).toBe("init");
    expect(readPersisted("test.b")).toBeUndefined();
  });

  it("clearPersistedByPrefix resets every matching mounted hook", () => {
    const one = renderHook(() => usePersistedState<number>("tool.x", 0));
    const two = renderHook(() => usePersistedState<number>("tool.y", 0));
    const other = renderHook(() => usePersistedState<number>("keep.z", 0));
    act(() => one.result.current[1](5));
    act(() => two.result.current[1](6));
    act(() => other.result.current[1](7));
    act(() => clearPersistedByPrefix("tool."));
    expect(one.result.current[0]).toBe(0);
    expect(two.result.current[0]).toBe(0);
    expect(other.result.current[0]).toBe(7);
  });

  it("writePersisted is visible to a hook after a key change", () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => usePersistedState<string>(key, "d"),
      { initialProps: { key: "test.c" } },
    );
    writePersisted("test.d", "written");
    rerender({ key: "test.d" });
    expect(result.current[0]).toBe("written");
  });

  it("set with a function sees the latest ref value", () => {
    const { result } = renderHook(() => usePersistedState<number>("test.e", 1));
    act(() => result.current[1]((p) => p + 1));
    act(() => result.current[1]((p) => p + 1));
    expect(result.current[0]).toBe(3);
  });

  it("unmounted set still writes the store (in-flight async safety)", () => {
    const { result, unmount } = renderHook(() =>
      usePersistedState<string>("test.f", "i"),
    );
    const setter = result.current[1];
    unmount();
    act(() => setter("late"));
    expect(readPersisted("test.f")).toBe("late");
  });
});

// Silence jsdom's missing rAF edge in older environments.
vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
  setTimeout(() => cb(Date.now()), 0) as unknown as number,
);
