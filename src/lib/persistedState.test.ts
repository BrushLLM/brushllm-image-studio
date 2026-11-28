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

describe("per-key external store", () => {
  it("a setter only writes its own key — a hook on another key is unaffected", () => {
    const a = renderHook(() => usePersistedState<string>("test.iso.a", "a0"));
    const aSetter = a.result.current[1];
    const b = renderHook(() => usePersistedState<string>("test.iso.b", "b0"));
    act(() => aSetter("a1"));
    expect(readPersisted("test.iso.a")).toBe("a1");
    expect(readPersisted("test.iso.b")).toBeUndefined();
    expect(a.result.current[0]).toBe("a1");
    expect(b.result.current[0]).toBe("b0");
  });

  it("a setter captured before a key switch never touches the new key", () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => usePersistedState<string>(key, "d"),
      { initialProps: { key: "test.switch.a" } },
    );
    const oldSetter = result.current[1];
    rerender({ key: "test.switch.b" });
    expect(result.current[0]).toBe("d");
    act(() => oldSetter("late"));
    expect(readPersisted("test.switch.a")).toBe("late");
    expect(readPersisted("test.switch.b")).toBeUndefined();
    expect(result.current[0]).toBe("d");
  });

  it("a remounted hook sees a write that landed while unmounted, and a late old-instance setter updates it", () => {
    const first = renderHook(() => usePersistedState<string>("test.remount", "i"));
    const oldSetter = first.result.current[1];
    first.unmount();
    // Old instance's async completion writes the store while nobody listens.
    act(() => writePersisted("test.remount", "written"));
    const second = renderHook(() => usePersistedState<string>("test.remount", "i"));
    expect(second.result.current[0]).toBe("written");
    // The old instance settles even later — the NEW mount must be notified.
    act(() => oldSetter("late"));
    expect(second.result.current[0]).toBe("late");
  });

  it("writePersisted notifies a mounted hook on the same key (Home update banner)", () => {
    const { result } = renderHook(() =>
      usePersistedState<string | null>("test.banner", null),
    );
    act(() => writePersisted("test.banner", "1.2.3"));
    expect(result.current[0]).toBe("1.2.3");
    act(() => writePersisted("test.banner", null));
    expect(result.current[0]).toBeNull();
  });

  it("functional set computes from the store's latest value across hooks", () => {
    const one = renderHook(() => usePersistedState<number>("test.concurrent", 0));
    const two = renderHook(() => usePersistedState<number>("test.concurrent", 0));
    act(() => one.result.current[1]((p) => p + 1));
    act(() => two.result.current[1]((p) => p + 10));
    expect(readPersisted("test.concurrent")).toBe(11);
    expect(one.result.current[0]).toBe(11);
    expect(two.result.current[0]).toBe(11);
  });
});

// Silence jsdom's missing rAF edge in older environments.
vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
  setTimeout(() => cb(Date.now()), 0) as unknown as number,
);
