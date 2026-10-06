#!/usr/bin/env node
/**
 * backup-rfc.js <rfc-path>
 *
 * Copies the canonical RFC to a timestamped sibling before STEP 5 rewrites it.
 *
 * The grill writes the whole document from its settled DesignTree, so the RFC is
 * regenerated rather than appended to. The tree holds the decisions; it does not
 * hold the prose or the code examples that carry them, and nothing else in this
 * command keeps a copy. This is that copy: not a gate — the rewrite is meant to
 * replace the file — but the artifact that makes an unfaithful rewrite diffable by
 * the human or the next run instead of silent.
 *
 * The timestamp spelling is the one generate-checklist.js already uses for the
 * CheckList, so the repository holds one convention for a pre-rewrite copy rather
 * than two. RFC.md itself is never written to: the copy is a second file.
 *
 * Exit-code contract:
 *   copied  → 0, prints the backup path on stdout
 *   missing → 1, prints an error naming the path on stderr and creates nothing
 *
 * CLI:
 *   backup-rfc.js <rfc-path>
 */
import fs from "fs";
import path from "path";
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
import { toHomeRelative } from '../lib/path-utils.js';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/** The suffix a pre-rewrite copy carries, beside the file it was taken from. */
const BACKUP_SUFFIX = ".bak.md";

const rfcPathArg = process.argv[2];
if (!rfcPathArg) {
  console.error("Usage: backup-rfc.js <rfc-path>");
  process.exit(EXIT_FAILURE);
}

const rfcPath = path.resolve(rfcPathArg);

if (!fs.existsSync(rfcPath)) {
  console.error(`Cannot back up: RFC not found: ${toHomeRelative(rfcPath)}`);
  process.exit(EXIT_FAILURE);
}

/**
 * The name a copy taken now carries.
 *
 * Colons and dots are replaced because the timestamp is part of a filename, and
 * the spelling matches the CheckList backup so both copies sort and read alike.
 *
 * The extension is dropped only when there is one: slicing off a zero-length
 * extension would truncate the whole path, and the copy would land beside a name
 * that names nothing.
 *
 * @param {string} sourcePath — the RFC being copied
 * @returns {string} absolute path of the copy
 */
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
function backupPathFor(sourcePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const extension = path.extname(sourcePath);
  const stem = extension ? sourcePath.slice(0, -extension.length) : sourcePath;
  return `${stem}.${timestamp}${BACKUP_SUFFIX}`;
}

const backupPath = backupPathFor(rfcPath);
fs.copyFileSync(rfcPath, backupPath);
process.stdout.write(`${backupPath}\n`);
process.exit(EXIT_SUCCESS);
