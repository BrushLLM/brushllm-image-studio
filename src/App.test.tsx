import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { clearPersistedByPrefix, readPersisted } from "./lib/persistedState";

const { open, onDragDropEvent } = vi.hoisted(() => ({ open: vi.fn(), onDragDropEvent: vi.fn() }));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: () => ({ onDragDropEvent }) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));
vi.mock("./lib/ipc", () => ({
  getSettings: async () => ({ appearance: "light" }),
  checkUpdate: async () => ({ update_available: false }),
}));
vi.mock("./lib/theme", () => ({ setAppearance: vi.fn() }));
vi.mock("./pages/Convert", () => ({ default: () => <h1>Convert workflow</h1> }));
vi.mock("./pages/AiRepaint", () => ({
  default: ({ tool }: { tool: { id: string } }) => <h1>{tool.id}</h1>,
}));
vi.mock("./pages/Settings", () => ({ default: () => <h1>Settings workflow</h1> }));

let media: EventTarget;
let drop: (event: { payload: { type: "drop"; paths: string[] } }) => void;

beforeEach(() => {
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => media);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true, value(this: HTMLDialogElement) { this.open = true; },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true, value(this: HTMLDialogElement) { this.open = false; },
  });
  onDragDropEvent.mockImplementation((handler) => { drop = handler; return Promise.resolve(() => {}); });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clearPersistedByPrefix("local.convert.");
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

it("condenses navigation on resize and opens the AI group from the icon rail", async () => {
  render(<App />);
  const navigation = within(screen.getByRole("navigation"));
  navigation.getByRole("button", { name: "home.convertName" }).focus();

  act(() => { media.dispatchEvent(Object.assign(new Event("change"), { matches: true })); });
  expect(screen.getByRole("button", { name: "navigation.expand" }).getAttribute("aria-expanded")).toBe("false");
  expect(navigation.queryByRole("button", { name: "home.convertName" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "navigation.expand" }));

  fireEvent.click(navigation.getByRole("button", { name: "navigation.onlineAi" }));
  fireEvent.click(navigation.getByRole("button", { name: "ai.toolCustom" }));
  await screen.findByRole("heading", { name: "custom" });
  expect(navigation.getByRole("button", { name: "ai.toolCustom" }).getAttribute("aria-current")).toBe("page");
  expect(navigation.getByRole("button", { name: "common.settings" })).toBeTruthy();
});

it("keeps search, selection and back/forward available from the keyboard", async () => {
  render(<App />);
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const search = within(screen.getByRole("dialog")).getByRole("combobox");
  expect(document.activeElement).toBe(search);

  fireEvent.change(search, { target: { value: "generate" } });
  fireEvent.keyDown(search, { key: "Enter" });
  await screen.findByRole("heading", { name: "generate-image" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("main"));

  fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });
  expect(screen.getByRole("heading", { name: "navigation.allTools" })).toBeTruthy();

  fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
  await screen.findByRole("heading", { name: "generate-image" });
});

it("routes a mixed drop to Convert once and only queues supported files", async () => {
  render(<App />);
  await act(async () => {
    drop({ payload: { type: "drop", paths: ["/first.jpg", "/first.jpg", "/other.heic", "/second.png"] } });
  });
  await screen.findByRole("heading", { name: "Convert workflow" });
  expect(readPersisted("local.convert.files")).toEqual(["/first.jpg", "/second.png"]);
  expect(readPersisted("local.convert.inputError")).toBeNull();

  fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });
  expect(screen.getByRole("heading", { name: "navigation.allTools" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "common.back" }).hasAttribute("disabled")).toBe(true);
});

it("requires deliberate selection before Enter launches a no-match suggestion", async () => {
  render(<App />);
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const search = within(screen.getByRole("dialog")).getByRole("combobox");
  fireEvent.change(search, { target: { value: "no-such-tool" } });
  fireEvent.keyDown(search, { key: "Enter" });
  expect(screen.getByRole("dialog")).toBeTruthy();

  fireEvent.keyDown(search, { key: "ArrowDown" });
  fireEvent.keyDown(search, { key: "Enter" });
  await screen.findByRole("heading", { name: "Convert workflow" });
});

it("avoids a Back button that would reopen the current view after Escape", async () => {
  render(<App />);
  fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "home.convertName" }));
  await screen.findByRole("heading", { name: "Convert workflow" });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.getByRole("heading", { name: "navigation.allTools" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "common.back" }).hasAttribute("disabled")).toBe(true);
});
