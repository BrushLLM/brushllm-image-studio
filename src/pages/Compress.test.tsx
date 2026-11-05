import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Compress from "./Compress";
import { clearPersistedByPrefix } from "../lib/persistedState";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => path }));
vi.mock("../lib/ipc", () => ({ loadDefaultOutputDir: async () => "/pictures", previewBatch: vi.fn() }));
vi.mock("../lib/usePreview", () => ({ usePreview: () => ({ result: null, loading: false, error: null, refresh: vi.fn() }) }));
vi.mock("../components/DropZone", () => ({ default: ({ onFiles }: { onFiles: (files: string[]) => void }) => <button onClick={() => onFiles(["/images/photo.jpg"])}>Add image</button> }));
vi.mock("../components/FileQueue", () => ({ default: ({ files }: { files: string[] }) => <div>{files.join(",")}</div> }));
vi.mock("../components/BatchRunner", () => ({ default: () => null }));
vi.mock("../components/PreviewCard", () => ({ default: () => null }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

afterEach(() => { cleanup(); clearPersistedByPrefix("local.compress."); });

it("restores files, output options and quality after leaving the tool", async () => {
  const first = render(<Compress onBack={() => {}} />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Add image" }));
  fireEvent.click(screen.getByRole("button", { name: "WebP" }));
  fireEvent.change(screen.getByRole("slider", { name: "convert.quality" }), { target: { value: "83" } });
  fireEvent.change(screen.getByLabelText("convert.suffix"), { target: { value: "-custom" } });
  first.unmount();
  render(<Compress onBack={() => {}} />);
  await act(async () => {});
  expect(screen.getByText("/images/photo.jpg")).toBeTruthy();
  expect(screen.getByRole("button", { name: "WebP" }).getAttribute("aria-pressed")).toBe("true");
  expect((screen.getByRole("slider", { name: "convert.quality" }) as HTMLInputElement).value).toBe("83");
  expect((screen.getByLabelText("convert.suffix") as HTMLInputElement).value).toBe("-custom");
});
