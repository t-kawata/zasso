import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VERIFIER_CHECKS,
  assertMachineVerified,
  verifyLawSkill,
} from '../../.claude/scripts/amend-rfc-up/verify-law-skill.mjs';

const skillRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '.claude/skills/rust-interface-law',
);

test('the reference skill passes every verifier check', () => {
  const report = verifyLawSkill({
    skillPath: skillRoot,
    root: skillRoot,
    testRunner: () => ({ status: 0, stdout: '', stderr: '' }),
  });
  for (const check of VERIFIER_CHECKS) {
    assert.equal(report.checks[check].status, 'machine_verified', check);
  }
  assert.doesNotThrow(() => assertMachineVerified({ report }));
});

test('a missing layer fails closed', () => {
  const directory = mkdtempSync(join(tmpdir(), 'law-verifier-'));
  try {
    writeFileSync(join(directory, 'SKILL.md'), '# Fixture\n\n## Procedure\n');
    const report = verifyLawSkill({
      skillPath: directory,
      root: directory,
      testRunner: () => ({ status: 0, stdout: '', stderr: '' }),
    });
    assert.equal(report.checks.layer.status, 'failed');
    assert.throws(
      () => assertMachineVerified({ report }),
      (error) => error.code === 'LAW_SKILL_INVALID',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
