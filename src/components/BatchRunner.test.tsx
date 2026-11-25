import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import BatchRunner from "./BatchRunner";
import FileQueue from "./FileQueue";
import type { BatchJob, BatchProgress, BatchReport } from "../lib/types";

const { runBatch, batchCancel, progress } = vi.hoisted(() => ({
  runBatch: vi.fn(),
  batchCancel: vi.fn(),
  progress: { emit: (_: { payload: BatchProgress }) => {} },
}));
vi.mock("../lib/ipc", () => ({
  runBatch, batchCancel, fileMeta: async () => ({ name: "input.jpg", bytes: 100 }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (_: string, handler: typeof progress.emit) => {
    progress.emit = handler;
    return () => {};
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => path }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(cleanup);

const input = "/test/input.jpg";
const files = [input];
const buildJob = (selected: string[]): BatchJob => ({
  files: selected,
  steps: [],
  format: "webp",
  quality: 75,
  preserve_exif: false,
  output: { dir: "/test/exports", suffix: "-compressed", collision: "rename" },
});

it("keeps the active batch locked across tools and shows the report on the originating tool", async () => {
  let finish!: (report: BatchReport) => void;
  runBatch.mockReturnValueOnce(new Promise<BatchReport>((resolve) => { finish = resolve; }));
  const renderTool = (tool: "compress" | "convert", runLabel: string) => (
    <>
      <BatchRunner tool={tool} files={files} buildJob={buildJob} runLabel={runLabel} />
      <FileQueue tool={tool} files={files} onRemove={() => {}} previewFile={input} onSelectPreview={() => {}} />
    </>
  );
  const view = render(renderTool("compress", "Compress"));
  fireEvent.click(screen.getByRole("button", { name: "Compress" }));
  expect(runBatch).toHaveBeenCalledWith(buildJob(files));

  view.rerender(renderTool("convert", "Convert"));
  await act(async () => {
    progress.emit({ payload: { index: 0, total: 1, file: input, status: "ok", error: null } });
  });
  const queueStatus = () => view.container.querySelector(".queue-item")?.getAttribute("data-status");
  expect(queueStatus()).toBeNull();
  expect(screen.getByRole("button", { name: "common.processing" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByText("batch.processingIn")).toBeTruthy();

  await act(async () => {
    finish({
      total: 1,
      ms: 5,
      ok: 1,
      failed: 0,
      skipped: 0,
      cancelled: false,
      in_bytes: 100,
      out_bytes: 70,
      items: [{
        input,
        file: "input.jpg",
        status: "ok",
        output_path: "/test/exports/input.webp",
        error: null,
        in_bytes: 100,
        out_bytes: 70,
        ms: 5,
      }],
    });
  });
  expect(screen.queryByText("batch.done")).toBeNull();
  expect(screen.queryByRole("button", { name: "common.openFolder" })).toBeNull();

  view.rerender(renderTool("compress", "Compress"));
  expect(queueStatus()).toBe("ok");
  expect(screen.getByText("batch.done")).toBeTruthy();
  expect(screen.getByRole("button", { name: "common.openFolder" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "common.remove input.jpg" }));
  expect(queueStatus()).toBeNull();
});
