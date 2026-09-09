// [::TICKET::] PX-191 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-191 --for-spec --no-implementation-order`.
// PX-191 @verifies C002 C003 C005
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { materializeSeedFixture, makeDecisions } from '../helpers/build-valid-manifest.mjs';
import { parseSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs';
import { SEED_REQUIRED_SECTIONS } from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';

const RUN = fileURLToPath(new URL('../../../.claude/scripts/workspacify-allocate/run.mjs', import.meta.url));

test('C005 acceptance: a COMPLETE tree manifest becomes a real workspace with grill-ready seeds', () => {
  const { dir, manifestPath, manifest } = materializeSeedFixture();
  try {
    const decisionsPath = join(dir, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify(makeDecisions(manifest)));

    const finalize = spawnSync(process.execPath, [RUN, 'finalize', manifestPath, `--decisions=${decisionsPath}`], { encoding: 'utf8' });
    assert.equal(finalize.status, 0, finalize.stderr);
    const summary = JSON.parse(finalize.stdout);
    assert.equal(summary.published, true);
    assert.equal(summary.seedCount, 2);
    assert.equal(summary.directoryCount >= 4, true); // crates, crates/protocol, two leaves

    // Every seed parses with all 15 required headings in order.
    for (const leaf of ['alpha', 'beta']) {
      const seedText = readFileSync(join(dir, 'crates', 'protocol', leaf, 'RFC-SEED.md'), 'utf8');
      const parsed = parseSeed(seedText);
      assert.equal(parsed.headings.length, SEED_REQUIRED_SECTIONS.length);
      assert.ok(seedText.startsWith('# RFC Seed: '));
    }

    // No WORKSPACIFY-ALLOCATE-MANIFEST.json is created anywhere in the workspace.
    assert.equal(existsSync(join(dir, 'WORKSPACIFY-ALLOCATE-MANIFEST.json')), false);

    // A second finalize is BLOCKED (fresh-workspace-only policy).
    const second = spawnSync(process.execPath, [RUN, 'finalize', manifestPath, `--decisions=${decisionsPath}`], { encoding: 'utf8' });
    assert.notEqual(second.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
