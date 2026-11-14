#!/usr/bin/env node
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * Copy-only installer for an OKF v0.2 skill.
 *
 * The runtime libraries are bundled into dist/skill.mjs, so the installed
 * tree does not need node_modules. Package metadata and the third-party notice
 * travel with the tree so the installed skill is auditable.
 */

const { cpSync, existsSync, mkdirSync } = require('node:fs');
const { basename, join } = require('node:path');

const root = __dirname;
const target = process.argv[2] ?? process.cwd();
const skillDir = join(target, '.claude/skills', basename(root));

if (!existsSync(join(root, 'dist/skill.mjs'))) {
  process.stderr.write('install: dist/skill.mjs missing\n');
  process.exit(1);
}

mkdirSync(join(skillDir, 'dist'), { recursive: true });
cpSync(join(root, 'dist/skill.mjs'), join(skillDir, 'dist/skill.mjs'));
for (const part of ['okf-core', 'scripts', 'okf', 'source', 'tests/fixtures/runtime']) {
  if (existsSync(join(root, part))) cpSync(join(root, part), join(skillDir, part), { recursive: true });
}
for (const file of [
  'atoms.lock.json',
  'SKILL.md',
  'DESIGN.md',
  'IMPLEMENTATION-LEFTOVERS.md',
  'package.json',
  'THIRD_PARTY_NOTICES.md',
]) {
  if (existsSync(join(root, file))) cpSync(join(root, file), join(skillDir, file));
}
process.stdout.write(`install: copied to ${skillDir}\n`);
