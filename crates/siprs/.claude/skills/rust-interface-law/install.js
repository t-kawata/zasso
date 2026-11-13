#!/usr/bin/env node
// [::TICKET::] PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-422 --for-spec --no-implementation-order`.
// [::TICKET::] PX-421 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-421 --for-spec --no-implementation-order`.
const { cpSync, existsSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const root = __dirname;
const target = process.argv[2] ?? process.cwd();
const targetDir = join(target, '.claude/skills/rust-interface-law');
const targetDistDir = join(targetDir, 'dist');
const dist = join(root, 'dist/skill.mjs');

if (!existsSync(dist)) {
  process.stderr.write('install: dist/skill.mjs missing\n');
  process.exit(1);
}

// Preserve dist/ so the bundled entry resolves okf/ as a sibling, exactly as in the source tree.
mkdirSync(targetDistDir, { recursive: true });
cpSync(dist, join(targetDistDir, 'skill.mjs'));
cpSync(join(root, 'okf'), join(targetDir, 'okf'), { recursive: true });
cpSync(join(root, 'source'), join(targetDir, 'source'), { recursive: true });
cpSync(join(root, 'templates'), join(targetDir, 'templates'), { recursive: true });
// Installed mode executes the verifier's runtime fixture; the fixture is not source law.
const runtimeFixtures = join(root, 'tests/fixtures/runtime');
if (existsSync(runtimeFixtures)) {
  cpSync(runtimeFixtures, join(targetDir, 'tests/fixtures/runtime'), { recursive: true });
}
process.stdout.write('install: copied to ' + targetDir + '\n');
