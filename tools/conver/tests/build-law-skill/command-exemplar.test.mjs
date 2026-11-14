/**
 * /build-law-skill must point at the bundled rust-interface-law skill as the
 * ideal exemplar and must always place the pre-OKF original beside it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditCommand } from './lib/command-contract.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const command = readFileSync(join(here, '../../.claude/commands/build-law-skill.md'), 'utf8');

test('the command names rust-interface-law as the reference exemplar', () => {
  assert.match(command, /^## Reference Exemplars$/m);
  assert.match(command, /\.claude\/skills\/rust-interface-law/);
  assert.match(command, /exemplar/i);
});

test('the exemplar reference does not become an execution literal', () => {
  const findings = auditCommand(command);
  assert.deepEqual(
    findings.filter((finding) => finding.code === 'EXAMPLE_LITERAL_IN_EXECUTION'),
    [],
  );
});

test('a literal outside the exemplar section is still rejected', () => {
  const polluted = command.replace(
    '## Procedure',
    '## Procedure\n\nRun rust-interface-law as the acceptance fixture.',
  );
  const findings = auditCommand(polluted);
  assert.ok(findings.some((finding) => finding.code === 'EXAMPLE_LITERAL_IN_EXECUTION'));
});

test('the pre-OKF original is a layout, placement, and verification obligation', () => {
  assert.match(command, /PRE-OKF-ORIGINAL\.md/);
  assert.match(command, /source\/pre-okf-original\.json/);
  assert.match(command, /PRE_OKF_ORIGINAL_MISSING/);
  assert.match(command, /PRE_OKF_ORIGINAL_DRIFT/);
  const layout = command.slice(command.indexOf('## Generated Skill Layout'));
  assert.match(layout.slice(0, 2500), /PRE-OKF-ORIGINAL\.md/);
});
