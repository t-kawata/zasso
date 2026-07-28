#!/usr/bin/env node

/**
 * scan-incomplete-implementations.js — Scan source tree for incomplete
 * implementation patterns (todo!(), TODO, #[allow], etc.) that lack
 * a corresponding [::STUB::] marker.
 *
 * Replaces the multi-line grep cascade previously hardcoded in plan-ticket.md.
 * Uses the project's canonical targetExtensions from ticket-config.js.
 *
 * Usage: node scan-incomplete-implementations.js [--dir=<path>] [--mode=all|stubs|suppress]
 *
 *   --dir=<path>   Directory to scan (default: .)
 *   --mode=all     Scan all patterns (default)
 *   --mode=stubs   Scan todo/TODO patterns only
 *   --mode=suppress Scan #[allow]/suppression patterns only
 *
 * Output: JSON on stdout. Exit 0 = no findings, exit 1 = findings exist.
 * Stderr: reserved for fatal errors only.
 */

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../lib/ticket-config');

const CFG = loadConfig();

// Patterns to detect incomplete implementations (groups)
const PATTERN_GROUPS = {
  stubMarkers: [
    // Language-specific incomplete implementation markers
    { raw: /todo!\(\)/,             label: 'todo!()' },
    { raw: /unimplemented!\(\)/,    label: 'unimplemented!()' },
    { raw: /panic!\(/,              label: 'panic!()' },
    // Universal comment markers for incomplete tasks
    { raw: /\bTODO\b/,              label: 'TODO' },
    { raw: /\bFIXME\b/,             label: 'FIXME' },
    { raw: /\bHACK\b/,              label: 'HACK' },
    { raw: /\bXXX\b/,               label: 'XXX' },
  ],
  suppressMarkers: [
    // Suppression annotations (Rust-style; other languages emit separately)
    { raw: /#\[allow\(/,            label: '#[allow()]' },
    { raw: /#\[deny\(/,             label: '#[deny()]' },
  ],
};

const STUB_MARKER_RE = /\[::STUB::\]/;
const TARGET_EXTS = CFG.review.targetExtensions;

function parseArgs() {
  const args = process.argv.slice(2);
  let dirPath = '.';
  let mode = 'all';
  for (const a of args) {
    if (a.startsWith('--dir=')) dirPath = a.slice('--dir='.length);
    if (a.startsWith('--mode=')) mode = a.slice('--mode='.length);
  }
  if (!['all', 'stubs', 'suppress'].includes(mode)) {
    console.error('[ERROR] Invalid mode: ' + mode + ' (expected all|stubs|suppress)');
    process.exit(2);
  }
  return { dirPath: path.resolve(dirPath), mode };
}

function scanFile(filePath, mode, content) {
  if (content === undefined) {
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return [];
    }
  }

  const lines = content.split('\n');
  const findings = [];

  const activeGroups = [];
  if (mode === 'all' || mode === 'stubs') activeGroups.push(...PATTERN_GROUPS.stubMarkers);
  if (mode === 'all' || mode === 'suppress') activeGroups.push(...PATTERN_GROUPS.suppressMarkers);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip lines that already have a [::STUB::] marker
    if (STUB_MARKER_RE.test(line)) continue;

    for (const pattern of activeGroups) {
      if (pattern.raw.test(line)) {
        findings.push({
          file: filePath,
          line: i + 1,
          pattern: pattern.label,
          content: line.trim().substring(0, 120),
        });
        break; // One finding per line
      }
    }
  }

  return findings;
}

function scanDirectory(dirPath, mode) {
  const allFindings = [];
  const extSet = new Set(TARGET_EXTS);

  function walk(currentPath) {
    let entries;
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extSet.has(ext)) {
          const findings = scanFile(fullPath, mode);
          allFindings.push(...findings);
        }
      }
    }
  }

  walk(dirPath);
  return allFindings;
}

function main() {
  const { dirPath, mode } = parseArgs();

  if (!fs.existsSync(dirPath)) {
    console.error('[ERROR] Directory not found: ' + dirPath);
    process.exit(2);
  }

  const findings = scanDirectory(dirPath, mode);

  const result = {
    ok: findings.length === 0,
    mode: mode,
    total: findings.length,
    findings: findings,
  };

  console.log(JSON.stringify(result, null, 2));

  if (findings.length > 0) process.exit(1);
}

if (require.main === module) main();
module.exports = { scanFile, scanDirectory, PATTERN_GROUPS };
