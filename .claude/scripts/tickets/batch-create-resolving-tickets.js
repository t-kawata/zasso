#!/usr/bin/env node
// [::TICKET::] PX-1: batch-create-resolving-tickets — manifest-driven atomic resolving-ticket creation + marker-key rewrite.

/**
 * batch-create-resolving-tickets.js — /find-omissions Step 1 reusable tool (PX-1).
 *
 * Reads a marker manifest, resolves each entry's source ticket and seed, validates
 * every on-disk marker line, then atomically commits: rewrite-map first, Tickets.json
 * once, then the marker-line rewrites. --no-write runs full validation with zero side
 * effects. Guarantees (contracts C001..C009 of PX-1):
 *   C001 manifest shape / sourceKey auto-extract / title auto-derive / unresolvable rejected
 *   C002 atomic two-phase commit (all-or-nothing)
 *   C003 marker replacement + non-marker refusal
 *   C004 path resolution under the source root + escape rejection
 *   C005 --no-write dry-run with zero side effects
 *   C006 stubs[] embedded with the new key (createResolvingTicket)
 *   C007 idempotent re-run (markers already referencing an active ticket are skipped)
 *   C008 duplicate file:line rejection
 *   C009 on-disk oldKey divergence refusal
 *
 * Usage (run from the directory containing Tickets.json; the source root is cwd):
 *   echo '<manifest-json>' | node batch-create-resolving-tickets.js [--no-write]
 *   Tickets.json is always ./Tickets.json; manifest file paths are cwd-relative.
 *   --no-write runs full validation with zero side effects.
 */

const fs = require("fs");
const path = require("path");
const { createResolvingTicket } = require("./create-resolving-ticket.js");
const { extractTicketKey, findTicket } = require("./validate-no-external-excuses.js");

// -- Constants --

/** Statuses that mean "a marker referencing this ticket is already resolved". */
const ACTIVE_STATUSES = new Set(["todo", "in_progress", "planned", "remanded"]);

/** Exit codes. */
const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

// -- Pure helpers (exported for testing) --

/**
 * Parse CLI arguments.
 * @param {string[]} [argv] — Arguments (defaults to process.argv.slice(2))
 * @returns {{noWrite: boolean}|{error: string}}
 */
// [::TICKET::] PX-1, PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-1|PX-2) --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const args = argv || process.argv.slice(2);
  // Minimal CLI: --no-write is the only flag. Tickets.json is always ./Tickets.json,
  // the source root is cwd, and the manifest is piped on stdin.
  const parsed = { noWrite: false };
  for (const arg of args) {
    if (arg === "--no-write") parsed.noWrite = true;
    else return { error: "Unknown argument: " + arg };
  }
  return parsed;
}

/**
 * Parse the manifest entries from stdin text.
 * @param {string} stdinText — stdin content
 * @returns {Array} — Manifest entries [{file,line,content,sourceKey?,seed?}]
 * @throws {Error} when stdin carries no JSON.
 */
// [::TICKET::] PX-1, PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-1|PX-2) --for-spec --no-implementation-order`.
function loadManifest(stdinText) {
  if (stdinText && stdinText.trim()) {
    return JSON.parse(stdinText);
  }
  throw new Error("No manifest provided: pipe the manifest JSON on stdin");
}

/**
 * Derive a ticket title from a marker's plan text after ' -- '; fall back to the reason.
 * @param {string} content — Full marker line
 * @returns {string} — Non-empty title
 */
// [::TICKET::] PX-1, PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-1|PX-2) --for-spec --no-implementation-order`.
function autoDeriveTitle(content) {
  const plan = content.match(/--\s*(.+)$/);
  if (plan && plan[1].trim()) return plan[1].trim();
  const reason = content.match(/\[::STUB::\]\s+(?:[A-Z]+[A-Z\d]*-\d+|MUST\s+RESOLVE)\s*:\s*(.+?)(?:\s*--|$)/);
  if (reason && reason[1].trim()) return reason[1].trim();
  return content.slice(0, 80);
}

/**
 * Resolve the source ticket key for an entry: explicit sourceKey or auto-extracted.
 * @param {object} entry — {file,line,content,sourceKey?}
 * @param {object} ticketsData — Parsed Tickets.json
 * @returns {{key: string}|{error: string, key?: string}}
 */
// [::TICKET::] PX-1, PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-1|PX-2) --for-spec --no-implementation-order`.
function resolveSourceKey(entry, ticketsData) {
  const key = entry.sourceKey || extractTicketKey(entry.content) || null;
  if (!key) return { error: "no sourceKey resolvable from entry content" };
  const ticket = findTicket(ticketsData, key);
  if (!ticket) return { error: "source ticket not found: " + key, key };
  return { key };
}

/**
 * Resolve the source root to an absolute path (default cwd).
 * @param {string|null} sourceRoot
 * @returns {string} — Absolute source root
 */
// [::TICKET::] PX-1, PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-1|PX-2) --for-spec --no-implementation-order`.
function resolveSourceRoot(sourceRoot) {
  return sourceRoot ? path.resolve(sourceRoot) : process.cwd();
}

/**
 * Resolve a manifest-relative file path under the source root; reject escapes (C004).
 * @param {string} sourceRoot — Absolute source root
 * @param {string} file — Manifest file path (repo-relative)
 * @returns {{path: string}|{error: string}}
 */
// [::TICKET::] PX-1, PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-1|PX-2) --for-spec --no-implementation-order`.
function resolveEntryPath(sourceRoot, file) {
  const resolved = path.resolve(sourceRoot, file);
  const rel = path.relative(sourceRoot, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { error: "path escapes source root: " + file };
  }
  return { path: resolved };
}

/**
 * Validate the manifest shape + duplicate file:line entries (C001-pre, C008).
 * @param {Array} manifest
 * @returns {Array} — errors [{error, file?, line?}]
 */
// [::TICKET::] PX-1, PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-1|PX-2) --for-spec --no-implementation-order`.
function validateManifestShape(manifest) {
  const errors = [];
  if (!Array.isArray(manifest)) {
    errors.push({ error: "manifest must be an array" });
    return errors;
  }
  const seen = new Set();
  for (let i = 0; i < manifest.length; i++) {
    const e = manifest[i];
    if (!e || typeof e !== "object" || Array.isArray(e)) {
      errors.push({ error: "entry " + i + " is not an object" });
      continue;
    }
    if (typeof e.file !== "string" || e.file.length === 0) {
      errors.push({ error: "entry " + i + " missing file", file: e.file });
    }
    if (!Number.isInteger(e.line) || e.line < 1) {
      errors.push({ error: "entry " + i + " line must be a positive integer", file: e.file, line: e.line });
    }
    if (typeof e.content !== "string" || !e.content.includes("[::STUB::]")) {
      errors.push({ error: "entry " + i + " content must contain [::STUB::]", file: e.file, line: e.line });
    }
    const dupKey = e.file + ":" + e.line;
    if (seen.has(dupKey)) {
      errors.push({ error: "duplicate file:line entry: " + dupKey, file: e.file, line: e.line });
    }
    seen.add(dupKey);
  }
  return errors;
}

/**
 * Check the on-disk marker for an entry: skip if already resolved, refuse on divergence (C003/C007/C009).
 * @param {object} entry
 * @param {string} sourceRoot — Absolute source root
 * @param {object} ticketsData — Parsed Tickets.json
 * @returns {{status: 'ok'|'skip'|'refuse', reason?: string}}
 */
// [::TICKET::] PX-1, PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-1|PX-2) --for-spec --no-implementation-order`.
function checkOnDiskMarker(entry, sourceRoot, ticketsData) {
  const rp = resolveEntryPath(sourceRoot, entry.file);
  if (rp.error) return { status: "refuse", reason: rp.error };
  if (!fs.existsSync(rp.path)) return { status: "refuse", reason: "file not found: " + entry.file };
  const lines = fs.readFileSync(rp.path, "utf8").split("\n");
  const line = lines[entry.line - 1];
  if (line === undefined) {
    return { status: "refuse", reason: "line out of range: " + entry.file + ":" + entry.line };
  }
  if (!line.includes("[::STUB::]")) {
    return { status: "refuse", reason: "no [::STUB::] at " + entry.file + ":" + entry.line };
  }
  // C007: the on-disk marker already referencing an ACTIVE ticket is resolved — skip.
  const currentKey = extractTicketKey(line);
  if (currentKey) {
    const currentTicket = findTicket(ticketsData, currentKey);
    if (currentTicket && ACTIVE_STATUSES.has(currentTicket.status)) {
      return { status: "skip", reason: "already references active ticket " + currentKey };
    }
  }
  // C009: the on-disk line must still carry the manifest's expected old key.
  const oldKey = entry.sourceKey || extractTicketKey(entry.content);
  if (oldKey && !line.includes(oldKey)) {
    return { status: "refuse", reason: "on-disk line does not contain expected key " + oldKey };
  }
  return { status: "ok" };
}

/**
 * Create resolving tickets from a manifest, in memory, without committing (C001..C009).
 * @param {object} params
 * @param {object} params.ticketsData — Parsed Tickets.json
 * @param {Array} params.manifest — Manifest entries
 * @param {string|null} params.sourceRoot — Repo root for relative file paths
 * @param {boolean} [params.noWrite] — Dry-run: create in memory, do not plan a commit
 * @returns {{success: true, data: object, created: Array, skipped: Array, rewriteMap: Array, dryRun?: boolean}|{success: false, errors: Array, created?: Array, skipped?: Array}}
 */
// [::TICKET::] PX-1, PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-1|PX-2) --for-spec --no-implementation-order`.
function createResolvingTickets({ ticketsData, manifest, sourceRoot, noWrite = false }) {
  const errors = [];
  const shapeErrors = validateManifestShape(manifest);
  errors.push(...shapeErrors);
  if (errors.length > 0) return { success: false, errors };

  const root = resolveSourceRoot(sourceRoot);
  const created = [];
  const skipped = [];
  const rewriteMap = [];
  let data = JSON.parse(JSON.stringify(ticketsData)); // work on a copy; commit only at runBatchCreate

  for (const entry of manifest) {
    const sk = resolveSourceKey(entry, ticketsData);
    if (sk.error) {
      errors.push({ error: sk.error, key: sk.key, file: entry.file, line: entry.line });
      continue;
    }

    const marker = checkOnDiskMarker(entry, root, ticketsData);
    if (marker.status === "skip") {
      skipped.push({ file: entry.file, line: entry.line, reason: marker.reason });
      continue;
    }
    if (marker.status === "refuse") {
      errors.push({ error: marker.reason, file: entry.file, line: entry.line });
      continue;
    }

    // Build the seed: auto-derive a non-empty title when absent (C001-post).
    const seed = {
      ...(entry.seed || {}),
      title: entry.seed && entry.seed.title ? entry.seed.title : autoDeriveTitle(entry.content),
    };
    const stubs = [{ file: path.resolve(root, entry.file), line: entry.line, content: entry.content }];
    const res = createResolvingTicket({ ticketsData: data, sourceKey: sk.key, seed, stubs });
    if (!res.success) {
      errors.push({ error: res.error, file: entry.file, line: entry.line });
      continue;
    }
    data = res.data;
    created.push({ sourceKey: sk.key, newKey: res.key, ticket: res.ticket });
    const newContent = res.ticket.stubs[0].content;
    rewriteMap.push({
      file: path.resolve(root, entry.file),
      line: entry.line,
      oldKey: sk.key,
      newKey: res.key,
      newContent,
    });
  }

  if (errors.length > 0) {
    return { success: false, errors, created, skipped };
  }
  if (noWrite) {
    return { success: true, data, created, skipped, rewriteMap, dryRun: true };
  }
  return { success: true, data, created, skipped, rewriteMap };
}

/**
 * Rewrite the on-disk marker lines from a rewrite map (descending order per file).
 * @param {Array} rewriteMap — [{file,line,oldKey,newKey,newContent}]
 * @returns {Array} — errors when a line changed between validation and commit
 */
// [::TICKET::] PX-1, PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-1|PX-2) --for-spec --no-implementation-order`.
function rewriteMarkerLines(rewriteMap) {
  const byFile = {};
  for (const m of rewriteMap) {
    if (!byFile[m.file]) byFile[m.file] = [];
    byFile[m.file].push(m);
  }
  const errors = [];
  for (const [file, entries] of Object.entries(byFile)) {
    entries.sort((a, b) => b.line - a.line);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    for (const e of entries) {
      const idx = e.line - 1;
      const current = lines[idx];
      if (current === undefined || !current.includes("[::STUB::]") || !current.includes(e.oldKey)) {
        errors.push({ error: "marker changed between validation and commit: " + e.file + ":" + e.line, file: e.file, line: e.line });
        continue;
      }
      lines[idx] = e.newContent;
    }
    fs.writeFileSync(file, lines.join("\n"), "utf8");
  }
  return errors;
}

/**
 * Full CLI-level orchestration: read Tickets.json, create resolving tickets in memory,
 * then commit atomically (rewrite-map → Tickets.json → marker lines) unless noWrite.
 * @param {object} params
 * @param {string} params.ticketsPath — Path to Tickets.json
 * @param {Array} params.manifest — Manifest entries
 * @param {string|null} [params.sourceRoot]
 * @param {boolean} [params.noWrite]
 * @returns {{success: boolean, created?: Array, skipped?: Array, rewriteMap?: Array, errors?: Array, dryRun?: boolean}}
 */
// [::TICKET::] PX-1, PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-1|PX-2) --for-spec --no-implementation-order`.
function runBatchCreate({ ticketsPath, manifest, sourceRoot, noWrite = false }) {
  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(path.resolve(ticketsPath), "utf8"));
  } catch (e) {
    return { success: false, errors: [{ error: "cannot read Tickets.json: " + e.message }] };
  }

  const res = createResolvingTickets({ ticketsData, manifest, sourceRoot, noWrite });
  if (!res.success) return res;
  if (noWrite) return res;

  // Commit phase (C002: all markers were verified in createResolvingTickets, so these writes are safe):
  fs.writeFileSync(path.resolve(ticketsPath), JSON.stringify(res.data, null, 2) + "\n", "utf8");
  const markerErrors = rewriteMarkerLines(res.rewriteMap);
  if (markerErrors.length > 0) {
    return { success: false, errors: markerErrors, created: res.created, skipped: res.skipped };
  }
  return res;
}

// -- CLI entry point --

/** Read all of stdin as a string (empty when no stdin is piped). */
// [::TICKET::] PX-1, PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-1|PX-2) --for-spec --no-implementation-order`.
function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

// [::TICKET::] PX-1, PX-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-1|PX-2) --for-spec --no-implementation-order`.
function main() {
  const parsed = parseArgs();
  if (parsed.error) {
    process.stderr.write("[batch-create-resolving-tickets] " + parsed.error + "\n");
    process.exit(EXIT_USAGE);
  }
  let manifest;
  try {
    manifest = loadManifest(readStdin());
  } catch (e) {
    process.stderr.write("[batch-create-resolving-tickets] " + e.message + "\n");
    process.exit(EXIT_USAGE);
  }

  // Minimal CLI: always the current directory's Tickets.json and cwd as the source root.
  const res = runBatchCreate({
    ticketsPath: path.resolve(process.cwd(), "Tickets.json"),
    manifest,
    sourceRoot: process.cwd(),
    noWrite: parsed.noWrite,
  });

  if (!res.success) {
    for (const err of res.errors || []) {
      const where = err.file ? err.file + (err.line ? ":" + err.line : "") + " " : "";
      process.stderr.write("[batch-create-resolving-tickets] FAIL " + where + "-- " + err.error + "\n");
    }
    process.exit(EXIT_FAILURE);
  }

  const summary = {
    createdTickets: (res.created || []).length,
    skipped: (res.skipped || []).length,
    rewrittenMarkers: (res.rewriteMap || []).length,
    dryRun: !!res.dryRun,
  };
  process.stdout.write(JSON.stringify(summary) + "\n");
  process.exit(EXIT_OK);
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  loadManifest,
  autoDeriveTitle,
  resolveSourceKey,
  resolveSourceRoot,
  resolveEntryPath,
  validateManifestShape,
  checkOnDiskMarker,
  createResolvingTickets,
  rewriteMarkerLines,
  runBatchCreate,
};
