#!/usr/bin/env node
/**
 * init-for-grill-me-for-next-rfc.js <research-path> <rfc-output-file-path>
 *
 * Dedicated initialization wrapper for /grill-me-for-next-rfc-ja.
 *
 * Processes in the following order:
 *
 *   1. Reads the parent RFC path from the OMISSIONS JSON and uses it for safety checks
 *   2. Evacuates (mv) the previous session files and RFC output file to grills/<RFC name>/
 *   3. Runs init.js as a child process
 *
 * [Safety mechanism] If the evacuation target is the same file as the parent RFC (RFC_ROOT.md etc.),
 * exits with an error. This prevents the parent RFC from being accidentally evacuated.
 *
 * [Output]
 *   With evacuation: {"evacuated":true,"dir":"<absolute path to grills directory>"}
 *   Without evacuation: {"evacuated":false,"dir":null}
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();
const researchPath = process.argv[2];
const rfcOutputPath = process.argv[3];

// --- Safety mechanism: get parent RFC path ---
let parentRfcPath = null;
try {
  const omPath = path.resolve(researchPath);
  if (fs.existsSync(omPath)) {
    const om = JSON.parse(fs.readFileSync(omPath, "utf-8"));
    parentRfcPath = om.parentRfcPath
      ? path.resolve(om.parentRfcPath)
      : null;
  }
} catch {
  // Continue even if OMISSIONS JSON is unreadable (only partial safety check limitation)
}

// --- Evacuation target list ---
const rfcBasename = path.basename(path.resolve(rfcOutputPath), ".md");
const resolvedRfcPath = path.resolve(rfcOutputPath);
const targetFiles = [
  "Status.json",
  "DesignTree.json",
  "CheckList.md",
  path.basename(resolvedRfcPath),
];

// --- Safety mechanism: prevent evacuation of parent RFC ---
if (
  parentRfcPath &&
  resolvedRfcPath === parentRfcPath
) {
  console.error(
    `エラー: 出力先パス "${rfcOutputPath}" は親RFC（${path.basename(parentRfcPath)}）と同一です。` +
    "出力先には親RFCと異なるパスを指定してください。",
  );
  process.exit(1);
}

// --- Execute evacuation ---
let grillDir = null;
const hasOldFiles = targetFiles.some((f) =>
  fs.existsSync(path.join(cwd, f)),
);

if (hasOldFiles) {
  grillDir = path.join(cwd, "grills", rfcBasename);
  fs.mkdirSync(grillDir, { recursive: true });
  for (const file of targetFiles) {
    const src = path.join(cwd, file);
    if (fs.existsSync(src)) {
      fs.renameSync(src, path.join(grillDir, file));
    }
  }
}

// --- Run init.js ---
const initScript = path.join(__dirname, "init.js");
const result = spawnSync(
  "node",
  [initScript, researchPath, rfcOutputPath],
  // Suppress init.js stdout (noise), inherit stderr (error visibility)
  { stdio: ["inherit", "pipe", "inherit"], encoding: "utf-8" },
);
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// --- Output evacuation result ---
console.log(JSON.stringify({ evacuated: hasOldFiles, dir: grillDir }));
