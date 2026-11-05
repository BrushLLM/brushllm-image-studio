import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CompareSlider from "./CompareSlider";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

it("supports keyboard comparison with bounded values", () => {
  render(<CompareSlider before="before.png" after="after.png" />);
  const slider = screen.getByRole("slider", { name: "common.compare" });
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(slider.getAttribute("aria-valuenow")).toBe("51");
  fireEvent.keyDown(slider, { key: "ArrowLeft", shiftKey: true });
  expect(slider.getAttribute("aria-valuenow")).toBe("41");
  fireEvent.keyDown(slider, { key: "End" });
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(slider.getAttribute("aria-valuenow")).toBe("100");
  fireEvent.keyDown(slider, { key: "Home" });
  expect(slider.getAttribute("aria-valuenow")).toBe("0");
});
