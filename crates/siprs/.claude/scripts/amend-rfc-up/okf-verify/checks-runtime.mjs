// @verifies C011
/**
 * Runtime, test, and installer checks.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exists, status } from '../law-verify/source.mjs';
import { treeDigest } from './checks-artifact.mjs';

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function failed(code, evidence) {
  return status('failed', evidence, { codes: [code] });
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function verified(evidence) {
  return status('machine_verified', evidence, { codes: [] });
}

export function checkRuntime({ skillPath, mode }) {
  const entry = mode === 'installed' ? join(skillPath, 'dist/skill.mjs') : join(skillPath, 'scripts/cli.mjs');
  const checks = ['lint', 'graph', 'coverage', 'provenance', 'citation', 'usage', 'conflicts'];
  for (const check of checks) {
    const result = spawnSync(process.execPath, [entry, 'check', check], { encoding: 'utf8' });
    if (result.status !== 0) return failed('RUNTIME_FAILED', `${check}: ${result.stdout}${result.stderr}`);
  }
  return verified('runtime checks pass');
}

export function checkTests({ skillPath }) {
  const tests = join(skillPath, 'tests');
  if (!exists(tests)) return failed('TESTS_MISSING', tests);
  const files = [];
  for (const entry of readdirSync(tests, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.test.mjs')) files.push(join(tests, entry.name));
  }
  if (files.length === 0) return failed('TESTS_MISSING', 'no *.test.mjs');
  const result = spawnSync(process.execPath, ['--test', ...files], { encoding: 'utf8' });
  return result.status === 0 ? verified('generated tests pass') : failed('TESTS_FAILED', result.stdout);
}

export function checkInstaller({ skillPath, mode, sourceRoot, aliasPath }) {
  if (mode === 'installed') {
    const outside = ['scripts', 'okf', 'source', 'dist', 'tests'].filter((root) => !exists(join(skillPath, root)));
    if (outside.length > 0) return failed('INSTALLER_INVALID', `missing installed roots: ${outside.join(', ')}`);
    const lint = spawnSync(process.execPath, [join(skillPath, 'dist/skill.mjs'), 'check', 'lint'], { encoding: 'utf8' });
    return lint.status === 0 ? verified('installed layering and dist resolution ok') : failed('INSTALLER_INVALID', lint.stderr);
  }
  if (!sourceRoot) return status('unverifiable', 'installer check needs --source-root', { codes: ['SOURCE_ROOT_REQUIRED'] });
  const target = mkdtempSync(join(tmpdir(), 'okf-install-check-'));
  try {
    const result = spawnSync(process.execPath, [join(skillPath, 'install.js'), target], { encoding: 'utf8' });
    if (result.status !== 0) return failed('INSTALLER_INVALID', result.stderr);
    const installed = join(target, '.claude/skills', skillPath.split('/').pop());
    const roots = ['dist', 'okf', 'source', 'tests/fixtures/runtime'];
    if (treeDigest(installed, roots) !== treeDigest(skillPath, roots)) return failed('INSTALLED_SHA_MISMATCH', 'source and installed differ');
    return verified('installed copy matches staging');
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
}
