// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * Runtime, test, and installer checks for the OKF v0.2 layout.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exists, status } from '../law-verify/source.mjs';
import { treeDigest } from './checks-artifact.mjs';

function failed(code, evidence) {
  return status('failed', evidence, { codes: [code] });
}

function verified(evidence) {
  return status('machine_verified', evidence, { codes: [] });
}

export function checkRuntime({ skillPath, mode }) {
  const entry = mode === 'installed' ? join(skillPath, 'dist/skill.mjs') : join(skillPath, 'scripts/cli.mjs');
  const root = join(skillPath, 'okf');
  const commands = [
    ['list', '--root', root],
    ['search', '--query', 'tokens', '--root', root],
  ];
  for (const args of commands) {
    const result = spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8' });
    if (result.status !== 0) return failed('RUNTIME_FAILED', `${args[0]}: ${result.stdout}${result.stderr}`);
  }
  const validation = spawnSync(process.execPath, [entry, 'validate', '--mode', 'conformance', '--root', root], { encoding: 'utf8' });
  if (validation.status !== 0) return failed('RUNTIME_FAILED', `validate: ${validation.stdout}${validation.stderr}`);
  return verified('runtime commands pass');
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

export function checkInstaller({ skillPath, mode, sourceRoot }) {
  if (mode === 'installed') {
    const outside = ['okf-core', 'scripts', 'okf', 'source', 'dist', 'tests'].filter((root) => !exists(join(skillPath, root)));
    if (outside.length > 0) return failed('INSTALLER_INVALID', `missing installed roots: ${outside.join(', ')}`);
    const list = spawnSync(process.execPath, [join(skillPath, 'dist/skill.mjs'), 'list', '--root', join(skillPath, 'okf')], { encoding: 'utf8' });
    return list.status === 0 ? verified('installed layering and dist resolution ok') : failed('INSTALLER_INVALID', list.stderr);
  }
  if (!sourceRoot) return status('unverifiable', 'installer check needs --source-root', { codes: ['SOURCE_ROOT_REQUIRED'] });
  const target = mkdtempSync(join(tmpdir(), 'okf-install-check-'));
  try {
    const result = spawnSync(process.execPath, [join(skillPath, 'install.js'), target], { encoding: 'utf8' });
    if (result.status !== 0) return failed('INSTALLER_INVALID', result.stderr);
    const installed = join(target, '.claude/skills', skillPath.split('/').pop());
    const roots = ['dist', 'okf-core', 'okf', 'source', 'tests/fixtures/runtime'];
    if (treeDigest(installed, roots) !== treeDigest(skillPath, roots)) return failed('INSTALLED_SHA_MISMATCH', 'source and installed differ');
    return verified('installed copy matches staging');
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
}
