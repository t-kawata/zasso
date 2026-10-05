#!/usr/bin/env node
/**
 * list-files.js <rfc-dir>
 *
 * Reads the material paths from <rfc-dir>/Status.json and prints, as a JSON array,
 * every file beneath them, in the order the run was given them.
 *
 * This is what lets the AI read its material without remembering the command line:
 * the list is resolved mechanically from $RFC_DIR alone.
 *
 * A session with no material prints an empty array. Absence of material is an empty
 * set, not the directory the process happens to be running in.
 */
import fs from "fs";
import path from "path";
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
import { toHomeRelative } from '../lib/path-utils.js';

const rfcDirArg = process.argv[2];
if (!rfcDirArg) {
  console.error("Usage: list-files.js <rfc-dir>");
  process.exit(1);
}

const rfcDir = path.resolve(rfcDirArg);
const statusPath = path.join(rfcDir, "Status.json");

if (!fs.existsSync(statusPath)) {
  console.error(`Status.json not found: ${toHomeRelative(statusPath)}. Run init.js first.`);
  process.exit(1);
}

const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));

/**
 * The material paths this session holds.
 *
 * materialPaths is the field current runs write. researchPath is the single path a
 * Status.json written before that field existed carries, and is read only when the
 * list is absent, so an older session still lists its material instead of failing.
 */
// [::TICKET::] PX-235 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-235 --for-spec --no-implementation-order`.
function materialPathsOf(record) {
  if (Array.isArray(record.materialPaths)) return record.materialPaths;
  return record.researchPath ? [record.researchPath] : [];
}

const materialPaths = materialPathsOf(status);

for (const materialPath of materialPaths) {
  if (!fs.existsSync(materialPath)) {
    console.error(`Material path not found: ${materialPath}`);
    process.exit(1);
  }
}

/** Every file beneath a material: the file itself, or every file a directory holds. */
// [::TICKET::] PX-235 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-235 --for-spec --no-implementation-order`.
function collectMaterialFiles(materialPath) {
  const stat = fs.statSync(materialPath);
  if (stat.isFile()) return [materialPath];
  if (stat.isDirectory()) {
    return fs.readdirSync(materialPath)
      .flatMap((name) => collectMaterialFiles(path.join(materialPath, name)));
  }
  return [];
}

// A Set so a material named twice contributes its files once, and insertion order
// so the printed list reads in the order the run was given.
const files = [...new Set(materialPaths.flatMap(collectMaterialFiles))];
process.stdout.write(JSON.stringify(files, null, 2) + "\n");
