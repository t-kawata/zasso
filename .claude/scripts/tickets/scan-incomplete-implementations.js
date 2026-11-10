#!/usr/bin/env node

/**
 * scan-incomplete-implementations.js — Scan source for incomplete
 * implementation patterns that lack a corresponding [::STUB::] marker.
 *
 * The default scan is unchanged. The omission layer opts into a finite source
 * set: dependency and build directories are excluded, and every finding is
 * classified as unmarked-confirmed or needsJudgment before it is recorded.
 *
 * Usage:
 *   node scan-incomplete-implementations.js [--dir=<path>] [--mode=all|stubs|suppress]
 *     [--source-set=omission] [--exclude-dirs=a,b] [--include-dot] [--classify]
 *     [--record=<ledger path>] [--verify-classification=<ledger path>]
 *
 * Output: JSON on stdout. Exit 0 = no findings, exit 1 = findings exist.
 */

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../lib/ticket-config');
const { writeTemporaryThenRename } = require('./lib/atomic-write.js');

const CFG = loadConfig();

const CLASSIFICATION = Object.freeze({
  UNMARKED_CONFIRMED: 'unmarked-confirmed',
  NEEDS_JUDGMENT: 'needsJudgment',
  FALSE_POSITIVE: 'falsePositive',
});

const CLASS_SET = new Set(Object.values(CLASSIFICATION));

const OMISSION_EXCLUDED_DIRS = Object.freeze(['node_modules', 'dist', 'build', 'target', 'coverage', 'vendor']);

// Patterns to detect incomplete implementations (groups)
const PATTERN_GROUPS = {
  stubMarkers: [
    { raw: /todo!\(\)/, label: 'todo!()', classification: CLASSIFICATION.UNMARKED_CONFIRMED },
    { raw: /unimplemented!\(\)/, label: 'unimplemented!()', classification: CLASSIFICATION.UNMARKED_CONFIRMED },
    { raw: /panic!\(/, label: 'panic!()', classification: CLASSIFICATION.UNMARKED_CONFIRMED },
    { raw: /\bTODO\b/, label: 'TODO', classification: CLASSIFICATION.NEEDS_JUDGMENT },
    { raw: /\bFIXME\b/, label: 'FIXME', classification: CLASSIFICATION.NEEDS_JUDGMENT },
    { raw: /\bHACK\b/, label: 'HACK', classification: CLASSIFICATION.NEEDS_JUDGMENT },
    { raw: /\bXXX\b/, label: 'XXX', classification: CLASSIFICATION.NEEDS_JUDGMENT },
  ],
  emptyImplementations: [
    { raw: /\b(?:function|fn)\s+\w+\s*\([^)]*\)\s*(?:->[^{]*)?\{\s*\}/, label: 'empty function body', classification: CLASSIFICATION.UNMARKED_CONFIRMED },
  ],
  commentedOutImplementations: [
    { raw: /^\s*\/\/\s*(?:function|fn|const|let|return|if|for|while|class)\b/, label: 'commented-out implementation', classification: CLASSIFICATION.UNMARKED_CONFIRMED },
    { raw: /^\s*#\s*(?:def|return|if|for|while|class)\b/, label: 'commented-out implementation', classification: CLASSIFICATION.UNMARKED_CONFIRMED },
  ],
  suppressMarkers: [
    { raw: /#\[allow\(/, label: '#[allow()]', classification: CLASSIFICATION.NEEDS_JUDGMENT },
    { raw: /#\[deny\(/, label: '#[deny()]', classification: CLASSIFICATION.NEEDS_JUDGMENT },
    { raw: /eslint-disable/, label: 'eslint-disable', classification: CLASSIFICATION.NEEDS_JUDGMENT },
    { raw: /@ts-ignore/, label: '@ts-ignore', classification: CLASSIFICATION.NEEDS_JUDGMENT },
    { raw: /@ts-expect-error/, label: '@ts-expect-error', classification: CLASSIFICATION.NEEDS_JUDGMENT },
    { raw: /#\s*noqa/, label: '# noqa', classification: CLASSIFICATION.NEEDS_JUDGMENT },
    { raw: /#\s*type:\s*ignore/, label: '# type: ignore', classification: CLASSIFICATION.NEEDS_JUDGMENT },
    { raw: /\/\/nolint/, label: '//nolint', classification: CLASSIFICATION.NEEDS_JUDGMENT },
  ],
};

const STUB_MARKER_RE = /\[::STUB::\]/;
const TARGET_EXTS = CFG.review.targetExtensions;

// PX-90: data files whose JSON content contains [::STUB::] references.
const EXCLUDED_FILENAMES = new Set(['Tickets.json', 'Malfeasance.json']);

const VALID_MODES = ['all', 'stubs', 'suppress'];

/** Parse the CLI arguments. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function parseArgs() {
  const args = process.argv.slice(2);
  let dirPath = '.';
  let mode = 'all';
  let sourceSet = null;
  let excludeDirs = null;
  let includeDot = false;
  let classify = false;
  let record = null;
  let verifyClassification = null;
  for (const a of args) {
    if (a.startsWith('--dir=')) dirPath = a.slice('--dir='.length);
    if (a.startsWith('--mode=')) mode = a.slice('--mode='.length);
    if (a.startsWith('--source-set=')) sourceSet = a.slice('--source-set='.length);
    if (a.startsWith('--exclude-dirs=')) excludeDirs = a.slice('--exclude-dirs='.length).split(',').filter(Boolean);
    if (a === '--include-dot') includeDot = true;
    if (a === '--classify') classify = true;
    if (a.startsWith('--record=')) record = a.slice('--record='.length);
    if (a.startsWith('--verify-classification=')) verifyClassification = a.slice('--verify-classification='.length);
  }
  if (!VALID_MODES.includes(mode)) {
    return { error: 'Invalid mode: ' + mode + ' (expected ' + VALID_MODES.join('|') + ')' };
  }
  return { dirPath: path.resolve(dirPath), mode, sourceSet, excludeDirs, includeDot, classify, record, verifyClassification };
}

/** Scan one file. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function scanFile(filePath, mode, content, options = {}) {
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
  if (mode === 'all') activeGroups.push(...PATTERN_GROUPS.emptyImplementations, ...PATTERN_GROUPS.commentedOutImplementations);
  if (mode === 'all' || mode === 'suppress') activeGroups.push(...PATTERN_GROUPS.suppressMarkers);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (STUB_MARKER_RE.test(line)) continue;
    for (const pattern of activeGroups) {
      if (pattern.raw.test(line)) {
        if ((pattern.label === 'empty function body' || pattern.label === 'commented-out implementation') && markedByPrecedingLine(lines, i)) break;
        const finding = {
          file: options.relativeTo ? path.relative(options.relativeTo, filePath) : filePath,
          line: i + 1,
          pattern: pattern.label,
          content: line.trim().substring(0, 120),
        };
        if (options.classify) finding.classification = pattern.classification;
        findings.push(finding);
        break;
      }
    }
  }

  return findings;
}

/** Whether the nearest preceding non-empty line carries a STUB marker. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function markedByPrecedingLine(lines, index) {
  for (let i = index - 1; i >= 0; i--) {
    if (lines[i].trim().length === 0) continue;
    return STUB_MARKER_RE.test(lines[i]);
  }
  return false;
}

/** Scan a directory. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function scanDirectory(dirPath, mode, options = {}) {
  const allFindings = [];
  const extSet = new Set(TARGET_EXTS);
  const excluded = new Set([...(options.sourceSet === 'omission' ? OMISSION_EXCLUDED_DIRS : []), ...(options.excludeDirs ?? [])]);

// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
  function walk(currentPath) {
    let entries;
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && !options.includeDot) continue;
      if (excluded.has(entry.name)) continue;
      if (EXCLUDED_FILENAMES.has(entry.name)) continue;
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extSet.has(ext)) allFindings.push(...scanFile(fullPath, mode, undefined, { ...options, relativeTo: options.relativeTo ?? null }));
      }
    }
  }

  walk(dirPath);
  return allFindings;
}

/** The identity of one finding in the classification ledger. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function findingKey(finding) {
  return finding.file + ':' + finding.line + ':' + finding.pattern;
}

/** Merge AI decisions into the scan findings and write the ledger. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function recordClassification({ directory, mode, sourceSet, decisions, ledgerPath }) {
  const findings = scanDirectory(directory, mode, { sourceSet, classify: true, relativeTo: directory });
  const byKey = new Map(findings.map((finding) => [findingKey(finding), finding]));
  for (const decision of decisions ?? []) {
    const current = byKey.get(decision.key);
    if (!current) continue;
    current.classification = decision.classification;
    current.reason = decision.reason;
  }
  const unclassified = findings.filter((finding) => !CLASS_SET.has(finding.classification) || (finding.classification !== CLASSIFICATION.UNMARKED_CONFIRMED && !finding.reason));
  if (unclassified.length > 0) return { ok: false, code: 'UNCLASSIFIED_FINDINGS', unclassified };
  const ledger = { version: 1, directory, at: new Date().toISOString(), findings };
  writeTemporaryThenRename(path.resolve(ledgerPath), JSON.stringify(ledger, null, 2) + '\n');
  return { ok: true, ledger: path.resolve(ledgerPath), total: findings.length };
}

/** Verify that every current finding has a recorded classification. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function verifyClassification({ directory, mode, sourceSet, ledgerPath }) {
  const ledger = JSON.parse(fs.readFileSync(path.resolve(ledgerPath), 'utf8'));
  const recorded = new Map((ledger.findings ?? []).map((finding) => [findingKey(finding), finding]));
  const current = scanDirectory(directory, mode, { sourceSet, classify: true, relativeTo: directory });
  const missing = current.filter((finding) => !recorded.has(findingKey(finding)));
  const invalid = current.filter((finding) => {
    const entry = recorded.get(findingKey(finding));
    return !entry || !CLASS_SET.has(entry.classification) || (entry.classification !== CLASSIFICATION.UNMARKED_CONFIRMED && !entry.reason);
  });
  if (missing.length > 0 || invalid.length > 0) return { ok: false, code: 'CLASSIFICATION_INCOMPLETE', missing, invalid };
  return { ok: true, total: current.length };
}

/** CLI entry point. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function main() {
  const args = parseArgs();
  if (args.error) {
    console.error('[ERROR] ' + args.error);
    process.exitCode = 2;
    return;
  }
  if (!fs.existsSync(args.dirPath)) {
    console.error('[ERROR] Directory not found: ' + args.dirPath);
    process.exitCode = 2;
    return;
  }
  if (args.verifyClassification) {
    const result = verifyClassification({
      directory: args.dirPath, mode: args.mode, sourceSet: args.sourceSet, ledgerPath: args.verifyClassification,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (args.record) {
    let decisions = [];
    try {
      const stdin = fs.readFileSync(0, 'utf8').trim();
      decisions = stdin.length > 0 ? JSON.parse(stdin) : [];
    } catch {
      console.error('[ERROR] --record expects a JSON array on stdin');
      process.exitCode = 2;
      return;
    }
    const result = recordClassification({
      directory: args.dirPath, mode: args.mode, sourceSet: args.sourceSet, decisions, ledgerPath: args.record,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }

  const findings = scanDirectory(args.dirPath, args.mode, {
    sourceSet: args.sourceSet, excludeDirs: args.excludeDirs, includeDot: args.includeDot, classify: args.classify,
    relativeTo: args.dirPath,
  });
  const result = { ok: findings.length === 0, mode: args.mode, sourceSet: args.sourceSet ?? 'default', total: findings.length, findings };
  console.log(JSON.stringify(result, null, 2));
  if (findings.length > 0) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = {
  CLASSIFICATION,
  OMISSION_EXCLUDED_DIRS,
  PATTERN_GROUPS,
  findingKey,
  recordClassification,
  scanDirectory,
  scanFile,
  verifyClassification,
};
