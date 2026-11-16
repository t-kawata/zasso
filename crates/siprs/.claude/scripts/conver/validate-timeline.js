#!/usr/bin/env node
/**
 * Validate the progress timeline's chronology invariants.
 *
 * Usage:
 *   validate-timeline.js --root=<workspace> [--json]
 *
 * Exits 1 when a fatal chronology violation is present. Final-state parity is a
 * warning: the history-only final state is expected to differ from the old
 * artifact projection while a workspace migrates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeWorkspace } from './draw-progress-gif.js';
import { buildTimeline, progressStateAt, STAGE_ORDER } from './progress-gif/loop.js';
import { listSnapshots, readSnapshot } from './progress-gif/snapshot.js';
import { validateTimeline } from './progress-gif/validator.js';

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const options = { root: process.cwd(), json: false, model: null, previous: null };
  for (const argument of argv) {
    if (argument === '--json') options.json = true;
    else if (argument.startsWith('--root=')) options.root = argument.slice('--root='.length);
    else if (argument.startsWith('--model=')) options.model = argument.slice('--model='.length);
    else if (argument.startsWith('--previous=')) options.previous = argument.slice('--previous='.length);
  }
  return options;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const root = path.resolve(options.root);
  let model;
  if (options.model) {
    try {
      model = JSON.parse(fs.readFileSync(options.model, 'utf8'));
    } catch (error) {
      process.stderr.write(`[timeline] cannot read model ${options.model}: ${error.message}\n`);
      return 1;
    }
  } else {
    model = analyzeWorkspace(root, { sourceScan: false, now: Date.now() });
  }
  const timeline = buildTimeline(model);
  const snapshotDir = path.join(model.workspaceRoot || root, 'progress-gif', 'snapshots');
  const newest = listSnapshots(snapshotDir, Date.now())[0];
  const previousSnapshot = options.previous
    ? readSnapshot(options.previous)
    : (newest ? readSnapshot(newest.path) : null);
  const finalState = progressStateAt(model, Number.POSITIVE_INFINITY);
  const finalModel = {
    packages: model.packages.map((pkg, index) => ({
      id: pkg.id,
      stages: Object.fromEntries(STAGE_ORDER.map((stage, stageIndex) => [stage, finalState.pi[index][stageIndex]])),
    })),
  };
  const violations = validateTimeline({
    model,
    timeline,
    previousSnapshot,
    artifactModel: { packages: model.packages },
    finalModel,
    uncovered: model.uncovered || [],
  });
  const fatal = violations.filter((violation) => violation.severity !== 'warning');

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ mode: model.timelineMode, violations }, null, 2)}\n`);
  } else {
    process.stdout.write(`# Timeline health\n\n- mode: \`${model.timelineMode}\`\n- records: ${model.historyRecordCount || 0}\n- backfill: ${model.backfillCount || 0}\n- violations: ${violations.length}\n\n`);
    for (const violation of violations) {
      process.stdout.write(`- \`${violation.severity}\` ${violation.code} ${violation.packageId ?? ''} ${violation.stage ?? ''}: ${violation.detail}\n`);
    }
  }
  return fatal.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
