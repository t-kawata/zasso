// [::TICKET::] PX-191 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-191 --for-spec --no-implementation-order`.
// PX-191 @verifies C001 C002 C003 C004 C005
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { materializeSeedFixture, makeDecisions } from '../helpers/build-valid-manifest.mjs';
import { parseSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs';

const RUN = fileURLToPath(new URL('../../../.claude/scripts/workspacify-allocate/run.mjs', import.meta.url));

function runCli(args) {
  return spawnSync(process.execPath, [RUN, ...args], { encoding: 'utf8' });
}

test('IT validate -> plan -> packet -> gate -> finalize publishes the real tree and seeds', () => {
  const { dir, manifestPath, manifest } = materializeSeedFixture();
  try {
    const validate = runCli(['validate', manifestPath]);
    assert.equal(validate.status, 0, validate.stderr);
    assert.ok(validate.stdout.includes('"status":"PASS"'));

    const plan = runCli(['plan', manifestPath]);
    assert.equal(plan.status, 0, plan.stderr);
    assert.ok(plan.stdout.includes('"plannedDirectoryCount"'));

    const packet = runCli(['packet', manifestPath]);
    assert.equal(packet.status, 0, packet.stderr);
    assert.ok(packet.stdout.includes('"packets"'));

    const decisionsPath = join(dir, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify(makeDecisions(manifest)));

    const gate = runCli(['gate', manifestPath, `--decisions=${decisionsPath}`]);
    assert.equal(gate.status, 0, gate.stderr);
    assert.ok(gate.stdout.includes('"status":"COMPLETE"'));

    const finalize = runCli(['finalize', manifestPath, `--decisions=${decisionsPath}`]);
    assert.equal(finalize.status, 0, finalize.stderr);
    assert.ok(finalize.stdout.includes('"published":true'));
    assert.ok(finalize.stdout.includes('"seedCount":2'));

    // Real directories + RFC-SEED.md exist; no allocate manifest anywhere.
    assert.ok(existsSync(join(dir, 'crates', 'protocol', 'alpha', 'RFC-SEED.md')));
    assert.ok(existsSync(join(dir, 'crates', 'protocol', 'beta', 'RFC-SEED.md')));
    assert.equal(existsSync(join(dir, 'WORKSPACIFY-ALLOCATE-MANIFEST.json')), false);

    // The spec and manifest files are untouched.
    assert.ok(existsSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json')));
    assert.ok(existsSync(join(dir, 'spec.md')));

    // Reload-parse each seed: all 15 required headings.
    for (const leaf of ['alpha', 'beta']) {
      const seedText = readFileSync(join(dir, 'crates', 'protocol', leaf, 'RFC-SEED.md'), 'utf8');
      assert.equal(parseSeed(seedText).headings.length, 15);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
