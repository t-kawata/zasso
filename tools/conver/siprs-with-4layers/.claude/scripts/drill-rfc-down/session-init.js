#!/usr/bin/env node
/**
 * session-init.js <rfc-path> — /drill-rfc-down Step 1-1 session bootstrap
 *
 * Creates (or resumes) the isolated drill session in $SESSION_DIR = <rfcDir>/drills.
 * Only files inside $SESSION_DIR are written; pre-existing session files in the
 * RFC directory are never read or modified.
 *
 * Behavior:
 *   - All three session files present → "continued" (no writes, schema validated).
 *   - Any missing → session templates are written (new session).
 *   - RFC path missing → error to stderr, exit 1.
 *
 * Exit codes: 0 = success (new or continued), 1 = failure.
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 1-1).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateAll } from './check-all-schema.js';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

const SESSION_DIR_NAME = 'drills';
const STATUS_FILE = 'Status.json';
const DESIGN_TREE_FILE = 'DesignTree.json';
const CHECKLIST_FILE = 'CheckList.md';
const SESSION_FILES = [STATUS_FILE, DESIGN_TREE_FILE, CHECKLIST_FILE];

/** Derive the session directory from the RFC path. */
// [::TICKET::] PX-157, PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-157|PX-158|PX-159) --for-spec --no-implementation-order`.
function resolveSessionDir(rfcPath) {
  const rfcDir = path.dirname(path.resolve(rfcPath));
  return { rfcDir, sessionDir: path.join(rfcDir, SESSION_DIR_NAME) };
}

/** Split session files into present and missing buckets. */
// [::TICKET::] PX-157, PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-157|PX-158|PX-159) --for-spec --no-implementation-order`.
function classifySessionFiles(sessionDir) {
  const existing = [];
  const missing = [];
  for (const name of SESSION_FILES) {
    if (fs.existsSync(path.join(sessionDir, name))) {
      existing.push(name);
    } else {
      missing.push(name);
    }
  }
  return { existing, missing };
}

/**
 * Write the three session templates under $SESSION_DIR.
 * Mirrors init.js's template shapes so the session is grill-compatible.
 */
// [::TICKET::] PX-157, PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-157|PX-158|PX-159) --for-spec --no-implementation-order`.
function writeSessionTemplates(sessionDir, rfcPath, rfcDir) {
  fs.mkdirSync(sessionDir, { recursive: true });
  const now = new Date().toISOString();
  fs.writeFileSync(path.join(sessionDir, STATUS_FILE), JSON.stringify({
    state: 'GRILLING',
    researchPath: rfcPath,
    rfcPath,
    rfcDir,
    reviewLoopCount: 0,
    createdAt: now,
    updatedAt: now,
  }, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(sessionDir, DESIGN_TREE_FILE), JSON.stringify({
    version: 1,
    updatedAt: now,
    nodes: [],
  }, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(sessionDir, CHECKLIST_FILE), `# RFC 要件チェックリスト

> このファイルは /drill-rfc-down により自動管理されます。
> grillセッション完了後に内容が充填されます。

<!-- GENERATED -->
`, 'utf8');
}

// [::TICKET::] PX-157, PX-158, PX-159 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-157|PX-158|PX-159) --for-spec --no-implementation-order`.
function main() {
  const rfcPath = process.argv[2];
  if (!rfcPath) {
    console.error('Usage: session-init.js <rfc-path>');
    process.exit(EXIT_FAILURE);
  }
  const resolvedRfcPath = path.resolve(rfcPath);
  if (!fs.existsSync(resolvedRfcPath)) {
    console.error(`[ERROR] session-init: RFC not found: ${resolvedRfcPath}`);
    process.exit(EXIT_FAILURE);
  }

  const { rfcDir, sessionDir } = resolveSessionDir(resolvedRfcPath);
  const { existing, missing } = classifySessionFiles(sessionDir);

  let session;
  let created = [];
  if (missing.length === 0) {
    session = 'continued';
  } else {
    writeSessionTemplates(sessionDir, resolvedRfcPath, rfcDir);
    created = missing;
    session = 'new';
  }

  const schemaErrors = validateAll(sessionDir);
  if (schemaErrors.length > 0) {
    console.error(JSON.stringify({ ok: false, phase: 'schema-validation', errors: schemaErrors }, null, 2));
    process.exit(EXIT_FAILURE);
  }

  process.stdout.write(JSON.stringify({ session, existing, created, sessionDir }) + '\n');
  process.exit(EXIT_SUCCESS);
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export { resolveSessionDir, classifySessionFiles, writeSessionTemplates, main, SESSION_FILES };
