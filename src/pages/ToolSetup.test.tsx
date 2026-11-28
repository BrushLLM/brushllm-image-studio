import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearPersistedByPrefix } from "../lib/persistedState";
import Adjust from "./Adjust";
import ColorPicker from "./ColorPicker";
import ColorReplace from "./ColorReplace";
import Compress from "./Compress";
import Convert from "./Convert";
import CropRotate from "./CropRotate";
import Exif from "./Exif";
import ImageAnnotate from "./ImageAnnotate";
import Mirror from "./Mirror";
import Mosaic from "./Mosaic";
import Resize from "./Resize";
import RoundedCorners from "./RoundedCorners";
import Shadow from "./Shadow";
import Stitch from "./Stitch";
import Watermark from "./Watermark";

const { open, previewCrop, loadCanvasImage } = vi.hoisted(() => ({
  open: vi.fn(),
  previewCrop: vi.fn(),
  loadCanvasImage: vi.fn(),
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));
vi.mock("../lib/ipc", async (original) => ({
  ...await original<typeof import("../lib/ipc")>(),
  loadDefaultOutputDir: async () => "/pictures",
  previewCrop,
}));
vi.mock("../lib/canvas", async (original) => ({
  ...await original<typeof import("../lib/canvas")>(),
  loadCanvasImage,
}));

beforeEach(() => {
  open.mockReset().mockResolvedValue("/image.png");
  previewCrop.mockReset().mockResolvedValue({ data_url: "data:image/png;base64,AA==", width: 120, height: 80 });
  loadCanvasImage.mockReset();
});

afterEach(() => {
  cleanup();
  clearPersistedByPrefix("local.");
});

const tools = [
  ["Adjust", Adjust, "common.settingsCard"],
  ["Color Picker", ColorPicker, "picker.color"],
  ["Color Replace", ColorReplace, "recolor.pairs"],
  ["Compress", Compress, "common.settingsCard"],
  ["Convert", Convert, "common.settingsCard"],
  ["Crop & Rotate", CropRotate, "crop.output"],
  ["EXIF", Exif, "exif.action"],
  ["Annotate", ImageAnnotate, "common.settingsCard"],
  ["Mirror", Mirror, "common.settingsCard"],
  ["Mosaic", Mosaic, "common.settingsCard"],
  ["Resize", Resize, "common.settingsCard"],
  ["Rounded Corners", RoundedCorners, "common.settingsCard"],
  ["Shadow", Shadow, "common.settingsCard"],
  ["Stitch", Stitch, "common.settingsCard"],
  ["Watermark", Watermark, "settings.output"],
] as const;

it.each(tools)("%s keeps its controls beside the import area before a file is selected", async (name, Tool, heading) => {
  const { container } = render(<Tool />);
  const sidebar = container.querySelector<HTMLElement>(".split > .side-col")!;
  expect(within(sidebar).getByRole("heading", { name: heading })).toBeTruthy();
  expect(container.querySelector(".split > :first-child .dropzone")).toBeTruthy();
  const actions = name === "Color Picker"
    ? within(sidebar).getAllByRole<HTMLButtonElement>("button", { name: /^(HEX|RGB)$/ })
    : [sidebar.querySelector<HTMLButtonElement>("button.btn-primary")!];
  expect(actions.every((action) => action.disabled)).toBe(true);
  await act(async () => {});
});

it("carries the crop ratio and output suffix through import", async () => {
  render(<CropRotate />);
  const aspect = screen.getByRole("button", { name: "1:1" });
  const suffix = screen.getByRole<HTMLInputElement>("textbox", { name: "convert.suffix" });
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "crop.rotateRight" }).disabled).toBe(true);
  fireEvent.click(aspect);
  fireEvent.change(suffix, { target: { value: "-square" } });
  fireEvent.click(screen.getByRole("button", { name: "crop.dropLabel" }));
  await screen.findByRole("img", { name: "errors.original" });
  expect(aspect.getAttribute("aria-pressed")).toBe("true");
  expect(suffix.value).toBe("-square");
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "crop.rotateRight" }).disabled).toBe(false);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "common.saveImage" }).disabled).toBe(false);
});

it("keeps rounded-corner preferences editable while the image loads", async () => {
  let resolveImage!: (image: HTMLImageElement) => void;
  loadCanvasImage.mockImplementation(() => new Promise((resolve) => { resolveImage = resolve; }));
  render(<RoundedCorners />);
  fireEvent.click(screen.getByRole("button", { name: "rounded.jpegCorners" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "rounded.dropLabel" })); });
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "common.saveImage" }).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "25%" }));
  const image = new Image();
  Object.defineProperties(image, { naturalWidth: { value: 120 }, naturalHeight: { value: 80 } });
  image.src = "data:image/png;base64,AA==";
  await act(async () => { resolveImage(image); });
  expect(screen.getByRole<HTMLInputElement>("slider", { name: "rounded.radius" }).value).toBe("25");
  expect(screen.getByRole("button", { name: "rounded.jpegCorners" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "common.saveImage" }).disabled).toBe(false);
});
