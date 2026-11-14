#!/usr/bin/env node
/**
 * Copy-only installer for the natenv OKF skill.
 *
 * Nothing here builds, judges, or edits a target. The dist bundle already
 * carries the runtime, so the installed tree needs no node_modules.
 */

const { cpSync, existsSync, mkdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const skillRoot = __dirname;
const target = process.argv[2] ?? process.cwd();
// The installed directory name comes from the package, not from the staging
// folder, so staging and installation names cannot drift.
const { name } = JSON.parse(readFileSync(join(skillRoot, 'package.json'), 'utf8'));
const skillDir = join(target, '.claude', 'skills', name);

if (!existsSync(join(skillRoot, 'dist/skill.mjs'))) {
  process.stderr.write('install: dist/skill.mjs missing; build before installing\n');
  process.exit(1);
}

// The unredacted build input and its ledger are part of the portable skill.
// Refuse a partial install that would leave the OKF form unauditable.
if (!existsSync(join(skillRoot, 'PRE-OKF-ORIGINAL.md')) || !existsSync(join(skillRoot, 'source/pre-okf-original.json'))) {
  process.stderr.write('install: PRE-OKF-ORIGINAL.md or source/pre-okf-original.json missing\n');
  process.exit(1);
}

mkdirSync(join(skillDir, 'dist'), { recursive: true });
cpSync(join(skillRoot, 'dist/skill.mjs'), join(skillDir, 'dist/skill.mjs'));
for (const part of ['okf-core', 'scripts', 'okf', 'source']) {
  if (existsSync(join(skillRoot, part))) cpSync(join(skillRoot, part), join(skillDir, part), { recursive: true });
}
mkdirSync(join(skillDir, 'tests/fixtures/runtime'), { recursive: true });
cpSync(
  join(skillRoot, 'tests/fixtures/runtime/runtime.json'),
  join(skillDir, 'tests/fixtures/runtime/runtime.json'),
);
for (const file of [
  'PRE-OKF-ORIGINAL.md',
  'atoms.lock.json',
  'SKILL.md',
  'DESIGN.md',
  'IMPLEMENTATION-LEFTOVERS.md',
  'package.json',
  'THIRD_PARTY_NOTICES.md',
]) {
  if (existsSync(join(skillRoot, file))) cpSync(join(skillRoot, file), join(skillDir, file));
}
process.stdout.write(`install: copied to ${skillDir}\n`);
