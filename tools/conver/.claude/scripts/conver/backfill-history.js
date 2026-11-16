#!/usr/bin/env node
/**
 * Build a provenance-labelled backfill ledger for the progress timeline.
 *
 * Usage:
 *   backfill-history.js --root=<workspace> [--dry-run|--apply] [--output=<file>]
 *
 * The live .conver-history.jsonl is append-only. This tool writes the sibling
 * .conver-history.backfill.jsonl and never uses artifact mtime as a clock.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverPackageArtifacts, discoverPackages, readManifests } from './progress-gif/parse.js';
import {
  buildBackfillRecords,
  collectBackfillEvidence,
  renderBackfillLedger,
  writeBackfillFile,
} from './progress-gif/backfill.js';

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const options = { root: process.cwd(), apply: false, output: null };
  for (const argument of argv) {
    if (argument === '--apply') options.apply = true;
    else if (argument === '--dry-run') options.apply = false;
    else if (argument.startsWith('--root=')) options.root = argument.slice('--root='.length);
    else if (argument.startsWith('--output=')) options.output = argument.slice('--output='.length);
  }
  return options;
}

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function readWorkspaceHistory(root, packages, warnings) {
  const records = [];
  const workspaceHistory = path.join(root, '.conver-history.jsonl');
  if (fs.existsSync(workspaceHistory)) {
    for (const line of fs.readFileSync(workspaceHistory, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { records.push(JSON.parse(line)); } catch { warnings.push(`[backfill] ${workspaceHistory}: malformed line`); }
    }
  }
  for (const pkg of packages) {
    const artifacts = discoverPackageArtifacts(root, pkg, warnings);
    records.push(...artifacts.historyRecords);
  }
  return records;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const root = path.resolve(options.root);
  const warnings = [];
  const { tree, alloc } = readManifests(root);
  const discovered = discoverPackages(root, tree, alloc);
  warnings.push(...discovered.warnings);
  const historyRecords = readWorkspaceHistory(root, discovered.packages, warnings);
  const evidence = collectBackfillEvidence({ root, packages: discovered.packages, historyRecords });
  warnings.push(...evidence.warnings);
  const records = buildBackfillRecords(evidence);

  if (options.output) {
    fs.writeFileSync(path.resolve(options.output), `${renderBackfillLedger(records)}\n`, 'utf8');
  }
  process.stdout.write(`${renderBackfillLedger(records)}\n`);
  for (const warning of [...new Set(warnings)]) process.stderr.write(`${warning}\n`);

  if (options.apply) {
    const packagesById = new Map(discovered.packages.map((pkg) => [pkg.id, pkg]));
    const byTarget = new Map();
    for (const record of records) {
      const target = record.packageId ? path.join(root, packagesById.get(record.packageId)?.path || '') : root;
      const group = byTarget.get(target) || [];
      group.push(record);
      byTarget.set(target, group);
    }
    for (const [target, group] of byTarget) {
      const result = writeBackfillFile(target, group);
      for (const warning of result.warnings) process.stderr.write(`${warning}\n`);
    }
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
