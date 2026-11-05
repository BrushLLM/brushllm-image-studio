import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePreview } from "./usePreview";
import type { PreviewOutcome } from "./ipc";

const outcome = (data: string): PreviewOutcome => ({ data_url: data, bytes: 10, in_bytes: 20 });
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { cleanup(); await act(async () => {}); vi.useRealTimers(); });
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(350); });

it("waits for an explicit AVIF preview and invalidates it when settings change", async () => {
  const build = vi.fn(async () => outcome("exact"));
  const hook = renderHook(({ quality }) => usePreview(build, [quality], true), { initialProps: { quality: 75 } });
  await tick();
  expect(build).not.toHaveBeenCalled();
  act(() => hook.result.current.refresh());
  await tick();
  expect(build).toHaveBeenCalledTimes(1);
  expect(hook.result.current.result?.data_url).toBe("exact");
  hook.rerender({ quality: 90 });
  await tick();
  expect(build).toHaveBeenCalledTimes(1);
  expect(hook.result.current.result).toBeNull();
});

it("serializes previews and skips superseded settings while a codec is busy", async () => {
  let finish!: (value: PreviewOutcome) => void;
  const build = vi.fn((quality: number) => quality === 1
    ? new Promise<PreviewOutcome>((resolve) => { finish = resolve; })
    : Promise.resolve(outcome(String(quality))));
  const hook = renderHook(({ quality }) => usePreview(() => build(quality), [quality]), { initialProps: { quality: 1 } });
  await tick();
  hook.rerender({ quality: 2 }); await tick();
  hook.rerender({ quality: 3 }); await tick();
  expect(build.mock.calls.map(([q]) => q)).toEqual([1]);
  await act(async () => { finish(outcome("stale")); });
  expect(build.mock.calls.map(([q]) => q)).toEqual([1, 3]);
  expect(hook.result.current.result?.data_url).toBe("3");
});

it("removes queued work when navigating away", async () => {
  let finish!: (value: PreviewOutcome) => void;
  const first = renderHook(() => usePreview(() => new Promise<PreviewOutcome>((resolve) => { finish = resolve; }), []));
  await tick();
  const build = vi.fn(async () => outcome("unused"));
  const second = renderHook(() => usePreview(build, []));
  await tick(); second.unmount();
  await act(async () => { finish(outcome("done")); });
  expect(build).not.toHaveBeenCalled();
  first.unmount();
});
