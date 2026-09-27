/**
 * Theme management. The persisted preference lives in Rust Settings
 * (`appearance`), applied here as a `.dark` class on <html> so the CSS
 * token set can switch. "system" tracks the OS preference live.
 */

export type Appearance = "system" | "light" | "dark";

let current: Appearance = "system";
const media =
  typeof window !== "undefined" && "matchMedia" in window
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function apply(appearance: Appearance) {
  const dark =
    appearance === "dark" ||
    (appearance === "system" && (media?.matches ?? false));
  document.documentElement.classList.toggle("dark", dark);
  // Lets native scrollbars / form controls follow the theme too.
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function setAppearance(appearance: Appearance) {
  current = appearance;
  apply(appearance);
}

/** Wire listeners once at startup; returns the current preference. */
export function initTheme(): Appearance {
  media?.addEventListener("change", () => {
    if (current === "system") apply("system");
  });
  apply(current);
  return current;
}

export function currentAppearance(): Appearance {
  return current;
}
