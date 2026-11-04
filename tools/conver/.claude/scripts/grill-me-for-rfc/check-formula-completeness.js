#!/usr/bin/env node
/**
 * check-formula-completeness.js <workspace-root>
 *
 * The workspace counterpart of the per-package gate. It measures the union of every
 * package ledger against the specification denominator, writes the repair worklist and
 * exits non-zero while any formula is missing, invented, unowned or under-specified.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  runSpecCompleteness,
  writeSpecCompletenessWorklist,
} from '../smooth-sequences/lib/checks-spec-completeness.mjs';

const USAGE = 'usage: check-formula-completeness.js <workspace-root>';

/** The one root sequences artifact, or null when it is absent or ambiguous. */
// [::TICKET::] PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-360|PX-361) --for-spec --no-implementation-order`.
function rootArtifact(root) {
  const candidates = readdirSync(root).filter((name) => name.endsWith('-sequences.json')).sort();
  if (candidates.length !== 1) return null;
  return JSON.parse(readFileSync(join(root, candidates[0]), 'utf8'));
}

/** @param {string[]} argv @returns {number} */
export function run(argv) {
  if (argv.length === 0) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  const root = resolve(argv[0]);
  const treePath = join(root, 'WORKSPACIFY-TREE-MANIFEST.json');
  if (!existsSync(treePath)) {
    process.stderr.write(`refused: no workspace tree manifest at ${treePath}\n`);
    return 1;
  }

  const artifact = rootArtifact(root);
  const treeManifest = JSON.parse(readFileSync(treePath, 'utf8'));
  const result = runSpecCompleteness({ root, artifact, treeManifest });
  const worklistPath = writeSpecCompletenessWorklist(root, result);

  process.stdout.write(`${JSON.stringify({
    ok: result.ok,
    specDigest: result.specDigest,
    summary: result.summary,
    findings: result.findings,
    worklistPath,
  }, null, 2)}\n`);

  if (!result.ok) {
    for (const entry of result.findings) {
      process.stderr.write(`S8: ${entry.checkId}: ${entry.reason}\n`);
    }
    return 1;
  }
  return 0;
}

process.exit(run(process.argv.slice(2)));
