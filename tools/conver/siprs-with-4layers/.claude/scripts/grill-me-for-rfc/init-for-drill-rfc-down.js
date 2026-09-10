#!/usr/bin/env node
/**
 * init-for-drill-rfc-down.js <target-rfc-path>
 *
 * Dedicated initialization wrapper for /drill-rfc-down.
 * Checks existing DesignTree/Status/CheckList; reuses if present, generates via init.js if not.
 * research-path = target-rfc-path (to append to itself).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();
const targetRfcPath = process.argv[2];

if (!targetRfcPath) { console.error("Usage: init-for-drill-rfc-down.js <target-rfc-path>"); process.exit(1); }
const resolvedRfcPath = path.resolve(targetRfcPath);
if (!fs.existsSync(resolvedRfcPath)) { console.error("Error: RFC not found: "+targetRfcPath); process.exit(1); }

const researchPath = resolvedRfcPath;
const outputPath = resolvedRfcPath;

// Check existing grill files
const targetFiles = ["Status.json", "DesignTree.json", "CheckList.md"];
const existing = [], missing = [];
for (const fileName of targetFiles) {
  if (fs.existsSync(path.join(cwd, fileName))) existing.push(fileName); else missing.push(fileName);
}

// Call init.js if any files are missing
if (missing.length > 0) {
  const initScript = path.join(__dirname, "init.js");
  const result = spawnSync("node", [initScript, researchPath, outputPath], { stdio: ["inherit", "pipe", "inherit"], encoding: "utf-8" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Ensure researchPath is set (for session continuation case)
const statusPath = path.join(cwd, "Status.json");
if (fs.existsSync(statusPath)) {
  try {
    const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
    status.researchPath = researchPath;
    fs.writeFileSync(statusPath, JSON.stringify(status, null, 2) + "\n");
  } catch { /* non-fatal */ }
}

console.log(JSON.stringify({ session: existing.length === 3 ? "continued" : "new", existing, missing, researchPath }));
