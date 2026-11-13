#!/usr/bin/env node
// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C011
/**
 * Copy-only installer. The installed tree stays executable without a build.
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
for (const part of ['scripts', 'okf', 'source', 'tests/fixtures/runtime']) {
  cpSync(join(root, part), join(skillDir, part), { recursive: true });
}
for (const file of ['atoms.lock.json', 'SKILL.md', 'DESIGN.md', 'IMPLEMENTATION-LEFTOVERS.md']) {
  cpSync(join(root, file), join(skillDir, file));
}
process.stdout.write(`install: copied to ${skillDir}\n`);
