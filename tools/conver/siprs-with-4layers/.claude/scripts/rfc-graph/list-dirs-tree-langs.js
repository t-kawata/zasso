#!/usr/bin/env node
/**
 * list-dirs-tree-langs.js — Output language list from Dirs-Tree.json
 *
 * $1: Path to Dirs-Tree.json
 * stdout: Language names space-separated (e.g. "rust go typescript")
 * Exit code: always 0 (empty output on error)
 */
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) {
  // No arguments → fallback: all languages
  process.stdout.write('rust go typescript');
  process.exit(0);
}

try {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, 'utf-8');
  const dirsTree = JSON.parse(raw);
  const languages = Object.keys(dirsTree.trees || {});
  if (languages.length > 0) {
    process.stdout.write(languages.join(' '));
  } else {
    process.stdout.write('rust go typescript');
  }
} catch (_) {
  // Read/parse error → fallback
  process.stdout.write('rust go typescript');
}
