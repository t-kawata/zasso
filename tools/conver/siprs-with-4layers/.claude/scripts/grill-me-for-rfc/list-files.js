#!/usr/bin/env node
/**
 * list-files.js <rfc-dir>
 *
 * Reads researchPath from <rfc-dir>/Status.json and
 * outputs a flat list of file paths (as a JSON array) to STDOUT
 * for the file or directory pointed to by that path.
 *
 * This eliminates the need for the AI to remember $RESEARCH_PATH;
 * it is resolved mechanically from $RFC_DIR alone.
 */
import fs from "fs";
import path from "path";

const rfcDirArg = process.argv[2];
if (!rfcDirArg) {
  console.error("Usage: list-files.js <rfc-dir>");
  process.exit(1);
}

const rfcDir = path.resolve(rfcDirArg);
const statusPath = path.join(rfcDir, "Status.json");

if (!fs.existsSync(statusPath)) {
  console.error(`Status.json not found: ${statusPath}. Run init.js first.`);
  process.exit(1);
}

const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
const researchPath = status.researchPath;

if (!researchPath) {
  console.error(`researchPath not found in Status.json. Re-run init.js.`);
  process.exit(1);
}

const resolved = researchPath;

if (!fs.existsSync(resolved)) {
  console.error(`Research path not found: ${resolved}`);
  process.exit(1);
}

function collectFiles(p) {
  const stat = fs.statSync(p);
  if (stat.isFile()) return [p];
  if (stat.isDirectory()) {
    return fs.readdirSync(p)
      .flatMap(name => collectFiles(path.join(p, name)));
  }
  return [];
}

const files = collectFiles(resolved);
console.log(JSON.stringify(files, null, 2));
