import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const tauriDirectory = join(root, "src-tauri");
const { bundle } = JSON.parse(readFileSync(join(tauriDirectory, "tauri.conf.json"), "utf8"));
const cli = createRequire(import.meta.url).resolve("@tauri-apps/cli/tauri.js");
const source = join(root, "src", "assets", "image-studio.svg");
const staging = mkdtempSync(join(tmpdir(), "image-studio-icons-"));

try {
  execFileSync(process.execPath, [cli, "icon", source, "--output", staging], { cwd: root, stdio: "pipe" });
  mkdirSync(join(tauriDirectory, "icons"), { recursive: true });
  for (const icon of bundle.icon) {
    copyFileSync(join(staging, basename(icon)), join(tauriDirectory, icon));
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}
