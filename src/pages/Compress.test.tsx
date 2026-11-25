import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Compress from "./Compress";
import { clearPersistedByPrefix } from "../lib/persistedState";

const { loadDefaultOutputDir, open } = vi.hoisted(() => ({
  loadDefaultOutputDir: vi.fn<() => Promise<string | null>>(),
  open: vi.fn<() => Promise<string | null>>(),
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => path }));
vi.mock("../lib/ipc", () => ({ loadDefaultOutputDir, previewBatch: vi.fn() }));
vi.mock("../lib/usePreview", () => ({ useBatchPreview: () => ({ result: null, loading: false, error: null, refresh: vi.fn() }) }));
vi.mock("../components/DropZone", () => ({
  default: ({ onFiles, label, buttonRef }: {
    onFiles: (files: string[]) => void;
    label: string;
    buttonRef: React.Ref<HTMLButtonElement>;
  }) => <button ref={buttonRef} onClick={() => onFiles(["/images/photo.jpg"])}>{label}</button>,
}));
vi.mock("../components/FileQueue", () => ({ default: ({ files }: { files: string[] }) => <div>{files.join(",")}</div> }));
vi.mock("../components/BatchRunner", () => ({ default: () => null }));
vi.mock("../components/PreviewCard", () => ({ default: () => null }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));

beforeEach(() => { loadDefaultOutputDir.mockReset().mockResolvedValue("/pictures"); });
afterEach(() => { cleanup(); clearPersistedByPrefix("local.compress."); });

it("restores files, output options and quality after leaving the tool", async () => {
  const first = render(<Compress />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "compress.dropLabel" }));
  fireEvent.click(screen.getByRole("button", { name: "WebP" }));
  fireEvent.change(screen.getByRole("slider", { name: "convert.quality" }), { target: { value: "83" } });
  fireEvent.change(screen.getByLabelText("convert.suffix"), { target: { value: "-custom" } });
  first.unmount();
  render(<Compress />);
  await act(async () => {});
  expect(screen.getByText("/images/photo.jpg")).toBeTruthy();
  expect(screen.getByRole("button", { name: "WebP" }).getAttribute("aria-pressed")).toBe("true");
  expect((screen.getByRole("slider", { name: "convert.quality" }) as HTMLInputElement).value).toBe("83");
  expect((screen.getByLabelText("convert.suffix") as HTMLInputElement).value).toBe("-custom");
});

it("keeps the import control mounted and focused while a batch queue changes", async () => {
  render(<Compress />);
  await act(async () => {});
  const importControl = screen.getByRole("button", { name: "compress.dropLabel" });
  importControl.focus();
  fireEvent.click(importControl);
  expect(screen.getByRole("button", { name: "common.addImages" })).toBe(importControl);
  expect(document.activeElement).toBe(importControl);

  const clear = screen.getByRole("button", { name: "common.removeAll" });
  clear.focus();
  fireEvent.click(clear);
  expect(screen.getByRole("button", { name: "compress.dropLabel" })).toBe(importControl);
  expect(document.activeElement).toBe(importControl);
});

it("keeps the chosen destination and naming options when the default directory arrives late", async () => {
  let resolveDefault!: (path: string) => void;
  let resolveChoice!: (path: string) => void;
  loadDefaultOutputDir.mockReturnValueOnce(new Promise((resolve) => { resolveDefault = resolve; }));
  open.mockReturnValueOnce(new Promise((resolve) => { resolveChoice = resolve; }));

  render(<Compress />);
  fireEvent.click(screen.getByRole("button", { name: "settings.changeFolder" }));
  const suffix = screen.getByLabelText<HTMLInputElement>("convert.suffix");
  const collision = screen.getByLabelText<HTMLSelectElement>("convert.collision");
  fireEvent.change(suffix, { target: { value: "-reviewed" } });
  fireEvent.change(collision, { target: { value: "skip" } });

  await act(async () => { resolveChoice("/chosen"); });
  await act(async () => { resolveDefault("/pictures"); });
  expect(screen.getByTitle("/chosen")).toBeTruthy();
  expect(suffix.value).toBe("-reviewed");
  expect(collision.value).toBe("skip");
});

it("applies the latest directory action when a reset resolves after a folder selection", async () => {
  let resolveReset!: (path: string) => void;
  render(<Compress />);
  await act(async () => {});
  loadDefaultOutputDir.mockReturnValueOnce(new Promise((resolve) => { resolveReset = resolve; }));
  open.mockResolvedValueOnce("/chosen");

  fireEvent.click(screen.getByRole("button", { name: "settings.resetToDefault" }));
  fireEvent.click(screen.getByRole("button", { name: "settings.changeFolder" }));
  await act(async () => { resolveReset("/pictures"); });
  expect(screen.getByTitle("/chosen")).toBeTruthy();
});
