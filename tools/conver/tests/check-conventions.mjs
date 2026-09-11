#!/usr/bin/env node
// [::TICKET::] PX-208 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-208 --for-spec --no-implementation-order`.
/**
 * check-conventions — report whether each script directory uses the module system
 * its declaration says it does, and whether the rule file agrees with the tree.
 *
 * Exits 0 when every directory conforms and the document matches the filesystem,
 * 1 otherwise. The filesystem is the authority; a disagreement is a defect in the
 * document, never something to resolve by editing the source.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  CONVENTION_RULE_PATH,
  SCRIPT_ROOT,
// [::TICKET::] PX-205 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-205 --for-spec --no-implementation-order`.
  parseConventionTable,
  renderConformanceReport,
  scanScriptDirectories,
} from './lib/module-convention.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.
// [::TICKET::] PX-206 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-206 --for-spec --no-implementation-order`.
// [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.

const entries = scanScriptDirectories(join(PROJECT_ROOT, SCRIPT_ROOT));
const documented = parseConventionTable(readFileSync(join(PROJECT_ROOT, CONVENTION_RULE_PATH), 'utf8'));

const undocumented = entries.filter((entry) => documented[entry.dir] === undefined).map((entry) => entry.dir);
const stale = Object.keys(documented).filter((name) => !entries.some((entry) => entry.dir === name));
const mismatched = entries.filter(
  (entry) => documented[entry.dir] !== undefined && documented[entry.dir] !== entry.moduleSystem,
);
const contradictions = entries.reduce((total, entry) => total + entry.nonConforming.length, 0);

process.stdout.write(`${renderConformanceReport(entries)}\n`);

if (undocumented.length > 0) {
  process.stderr.write(`${CONVENTION_RULE_PATH} does not state a module system for: ${undocumented.join(', ')}\n`);
}
if (stale.length > 0) {
  process.stderr.write(`${CONVENTION_RULE_PATH} names directories that no longer exist: ${stale.join(', ')}\n`);
}
for (const entry of mismatched) {
  process.stderr.write(
    `${entry.dir} is documented as ${documented[entry.dir]} and resolves to ${entry.moduleSystem}\n`,
  );
}

const clean = undocumented.length + stale.length + mismatched.length + contradictions === 0;
process.exitCode = clean ? 0 : 1;
