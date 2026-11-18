// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { failRevision } from '../revision/errors.mjs';

export function loadOkfBaseline({ baselineSkill }) {
  const inventoryPath = join(baselineSkill, 'source/concept-inventory.json');
  if (!existsSync(inventoryPath)) {
    failRevision('REVISION_BASELINE_MISSING', `OKF baseline has no concept inventory: ${baselineSkill}`, { target: baselineSkill });
  }
  const inventory = readJson(inventoryPath);
  const lock = existsSync(join(baselineSkill, 'atoms.lock.json')) ? readJson(join(baselineSkill, 'atoms.lock.json')) : { concepts: [] };
  const coverage = existsSync(join(baselineSkill, 'source/coverage.json')) ? readJson(join(baselineSkill, 'source/coverage.json')) : { counts: {} };
  const log = existsSync(join(baselineSkill, 'source/okf-log.json')) ? readJson(join(baselineSkill, 'source/okf-log.json')) : { entries: [] };
  const descriptorPath = join(baselineSkill, 'source/baseline.json');
  const descriptor = existsSync(descriptorPath) ? readJson(descriptorPath) : null;
  const packagePath = join(baselineSkill, 'package.json');
  const version = descriptor?.version ?? (existsSync(packagePath) ? readJson(packagePath).version : '0.0.0');
  return {
    skill: baselineSkill,
    version,
    digest: sha256Text(JSON.stringify({ inventory, lock, coverage })),
    inventory,
    lock,
    coverage,
    log,
  };
}

export function adoptOkfBaseline({ baseline, outDir }) {
  const baselineDir = join(outDir, 'source/baseline');
  mkdirSync(baselineDir, { recursive: true });
  writeJson(join(baselineDir, 'concept-inventory.json'), baseline.inventory);
  writeJson(join(baselineDir, 'atoms.lock.json'), baseline.lock);
  writeJson(join(baselineDir, 'coverage.json'), baseline.coverage);
  copyBaselineOriginal({ baseline, baselineDir });
  writeJson(join(outDir, 'source/baseline.json'), {
    schema: 'revision-baseline/v1',
    skill: baseline.skill.split('/').pop(),
    version: baseline.version,
    origin: 'installed',
    digest: baseline.digest,
  });
  return baseline;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function copyBaselineOriginal({ baseline, baselineDir }) {
  const original = join(baseline.skill, 'PRE-OKF-ORIGINAL.md');
  const ledger = join(baseline.skill, 'source/pre-okf-original.json');
  if (existsSync(original)) writeFileSync(join(baselineDir, 'PRE-OKF-ORIGINAL.md'), readFileSync(original, 'utf8'));
  if (existsSync(ledger)) writeFileSync(join(baselineDir, 'pre-okf-original.json'), readFileSync(ledger, 'utf8'));
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function sha256Text(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}
