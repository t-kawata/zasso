#!/usr/bin/env node
/**
 * Generate the four OKF leak/coverage ledgers from the frozen source set.
 *
 * This script is a build-time seed, not a verifier. The canonical verifier
 * re-derives every fact from the sources and rejects a stale or incomplete
 * ledger; this script only writes the first complete decision set.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPathAlias, sha256 } from './lib/path-alias.mjs';
import { buildRedactionReview } from './lib/redaction-review.mjs';
import { buildNormativeInventory } from './lib/normative-inventory.mjs';
import { buildDelivery } from './lib/delivery.mjs';

const SKILL_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_ALIAS = join(dirname(SKILL_ROOT), basename(SKILL_ROOT) + '.path-alias.json');
const MANIFEST = join(SKILL_ROOT, 'source/manifest.toml');
const REDACTION = join(SKILL_ROOT, 'source/redaction.sha256.json');
const LOCK = join(SKILL_ROOT, 'atoms.lock.json');
const INPUT_LEDGER = join(SKILL_ROOT, 'source/input-ledger.json');
const REDACTION_REVIEW = join(SKILL_ROOT, 'source/redaction.review.json');
const NORMATIVE_INVENTORY = join(SKILL_ROOT, 'source/normative-inventory.json');
const DELIVERY = join(SKILL_ROOT, 'source/delivery.json');

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function parseManifest(text) {
  const files = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '[[file]]') {
      current = {};
      files.push(current);
      continue;
    }
    const match = line.match(/^([a-z_][a-z0-9_]*)\s*=\s*"(.*)"$/);
    if (!match) continue;
    if (current && (match[1] === 'path' || match[1] === 'sha256')) current[match[1]] = match[2];
  }
  return files;
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function listFiles(directory) {
  const collected = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) collected.push(...listFiles(entryPath));
    else if (statSync(entryPath).isFile()) collected.push(entryPath);
  }
  return collected.sort();
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function exclusion(text, alias) {
  if (basename(alias) === 'README.md') return { reason: 'directory index', phrase: 'Index' };
  if (/review bundle/i.test(text)) {
    return { reason: 'single-file review bundle duplicating the authoritative docs', phrase: 'review bundle' };
  }
  throw new Error('excluded input needs an explicit reason: ' + alias);
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function main() {
  const aliasPath = process.argv[2] ?? DEFAULT_ALIAS;
  const sourceRoot = resolve(process.argv[3] ?? join(SKILL_ROOT, '..', '..', '..'));
  const aliasMap = loadPathAlias(aliasPath);
  const manifest = parseManifest(readFileSync(MANIFEST, 'utf8'));
  const redaction = JSON.parse(readFileSync(REDACTION, 'utf8'));
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  const included = new Map(manifest.map((file) => [file.path, file]));
  const sources = manifest.map((file) => readFileSync(resolve(sourceRoot, aliasMap.aliases[file.path]), 'utf8'));

  const entries = manifest.map((file) => ({
    alias: file.path,
    sha256: file.sha256,
    decision: 'included',
    reason: 'authoritative source document',
  }));
  for (const root of aliasMap.input_roots) {
    for (const file of listFiles(resolve(sourceRoot, root))) {
      const original = relative(sourceRoot, file).replace(/\\/g, '/');
      const alias = Object.entries(aliasMap.aliases).find(([, value]) => value === original)?.[0];
      if (!alias || included.has(alias)) continue;
      const text = readFileSync(file, 'utf8');
      const decision = exclusion(text, alias);
      entries.push({
        alias,
        sha256: sha256(text),
        decision: 'excluded',
        reason: decision.reason,
        phrase: decision.phrase,
      });
    }
  }

  const inputLedger = { schema: 'law-input-ledger/v1', entries };
  const review = buildRedactionReview({ sources, redaction });
  const inventory = buildNormativeInventory({ atoms: lock.atoms });
  const delivery = buildDelivery({ atoms: lock.atoms });

  writeAtomic(INPUT_LEDGER, JSON.stringify(inputLedger, null, 2) + '\n');
  writeAtomic(REDACTION_REVIEW, JSON.stringify(review, null, 2) + '\n');
  writeAtomic(NORMATIVE_INVENTORY, JSON.stringify(inventory, null, 2) + '\n');
  writeAtomic(DELIVERY, JSON.stringify(delivery, null, 2) + '\n');
  process.stdout.write(
    `ledgers: inputs=${entries.length} review=${review.entries.length} inventory=${inventory.entries.length} delivery=${delivery.atoms.length}\n`,
  );
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function writeAtomic(filePath, text) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporary = filePath + '.tmp';
  writeFileSync(temporary, text);
  renameSync(temporary, filePath);
}

if (existsSync(MANIFEST)) main();
