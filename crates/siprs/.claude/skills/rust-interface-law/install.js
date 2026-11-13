#!/usr/bin/env node
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
process.stdout.write('install: copied to ' + targetDir + '\n');
