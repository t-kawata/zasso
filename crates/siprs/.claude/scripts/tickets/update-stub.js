#!/usr/bin/env node
// [::TICKET::] PX-130: update-stub.js — edit an existing [::STUB::] marker line.

/**
 * update-stub.js — Edit an existing [::STUB::] marker in place.
 *
 * The pipeline's insert side (insert-stub.js) adds markers and remove side
 * (remove-stub.js) deletes them. This script is the matching edit side: it
 * rewrites a marker's resolve key, reason, and/or resolution plan while keeping
 * the marker anchored at its file:line site. Unlike insert-stub.js, re-pointing
 * to a COMPLETED ticket key is allowed — that is the /find-omissions
 * re-ticketization signal (the marker's referenced ticket becomes the clone
 * source for a resolving ticket).
 *
 * CLI:
 *   node update-stub.js --file=<path> --line=<N> --resolve-by-ticket=<key> \
 *     [--stub-reason="..."] [--resolve-plan="..."]
 *
 * Tickets.json is ALWAYS ./Tickets.json relative to the current directory (same
 * convention as batch-create-resolving-tickets.js); --tickets-path is rejected.
 *
 * Exported API:
 *   updateStub({ file, line, resolveByTicket, stubReason, resolvePlan, ticketsPath })
 *     -> { success: true, file, line, content } | { success: false, error }
 *   mergeTrueDuplicates(markers)   -> { kept, removed }
 *   normalizeUnitKey(unit)         -> unit with every marker sharing one resolve key
 *   emitHandoffManifest(units)     -> [{ sourceKey, stubs:[{file,line,content}] }]
 *
 * This script NEVER writes Tickets.json — ticket creation is /find-omissions work.
 */

const fs = require("fs");
const path = require("path");
const { EXCUSE_PATTERNS, WORK_ITEM_VERB_RE, findTicket } = require("./validate-no-external-excuses.js");

// Marker tag that identifies a STUB marker line (see validate-stub-format.js).
const STUB_TAG = "[::STUB::]";
// Ticket keys are P{phase}-{id} or PX-{id}; MUST RESOLVE carries no key.
const TICKET_REF_RE = /^P[A-Z0-9]+-\d+$/;
// The PX phase has ambiguous ordering and is forbidden as a resolve target.
const PX_PREFIX = "PX-";

/**
 * Parse a marker line into { key, reason, plan } (the reason excludes any unit tag).
 * @param {string} content — Full marker line (indentation allowed)
 * @returns {{key: string, reason: string, plan: string}|null}
 */
// [::TICKET::] PX-130, PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-130|PX-131) --for-spec --no-implementation-order`.
function parseMarker(content) {
  const m = content.match(/\[::STUB::\]\s+(.+?)\s*:\s*(.*?)\s*--\s*(.*)$/);
  if (!m) return null;
  return { key: m[1].trim(), reason: m[2].trim(), plan: m[3].trim() };
}

/**
 * Extract the [::UNIT::<id>::] tag from a marker line, or null when absent.
 * @param {string} content — Full marker line
 * @returns {string|null} — Unit id, e.g. "U1"
 */
// [::TICKET::] PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-131 --for-spec --no-implementation-order`.
function extractUnitId(content) {
  const m = (content || "").match(/\[::UNIT::([^\]]+)::\]/);
  return m ? m[1].trim() : null;
}

/**
 * Build a marker line, preserving the source line's leading indentation.
 * A unit id is embedded as [::UNIT::<id>::] between the reason and the plan.
 * @param {string} current — Existing marker line (for its indentation)
 * @param {string} key — Resolve ticket key
 * @param {string} reason — Why the code is left as a stub
 * @param {string} plan — What the resolving ticket must implement
 * @param {string|null} [unitId] — Unit membership tag (optional)
 * @returns {string}
 */
// [::TICKET::] PX-130, PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-130|PX-131) --for-spec --no-implementation-order`.
function buildMarkerLine(current, key, reason, plan, unitId) {
  const leading = (current.match(/^\s*/) || [""])[0];
  const unitTag = unitId ? " [::UNIT::" + unitId + "::]" : "";
  return leading + "// [::STUB::] " + key + ": " + reason + unitTag + " -- " + plan;
}

/**
 * Validate the resolve key: format, PX ban, MUST RESOLVE ban, existence.
 * A COMPLETED ticket key is allowed (find-omissions handoff signal).
 * @param {string} key
 * @param {object} ticketsData
 * @returns {{ok: boolean, error?: string}}
 */
// [::TICKET::] PX-130, PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-130|PX-131) --for-spec --no-implementation-order`.
function validateResolveKey(key, ticketsData) {
  if (!key || key === "MUST RESOLVE") {
    return { ok: false, error: "MUST RESOLVE is not a valid resolve target; specify an existing ticket key" };
  }
  if (!TICKET_REF_RE.test(key)) {
    return { ok: false, error: "invalid resolve-by-ticket format: " + key + ' (expected P{phase}-{id})' };
  }
  if (key.startsWith(PX_PREFIX)) {
    return { ok: false, error: "PX-* tickets are forbidden as resolve targets" };
  }
  if (!findTicket(ticketsData, key)) {
    return { ok: false, error: "ticket not found: " + key };
  }
  return { ok: true };
}

/**
 * Validate the composed marker text: a terminal excuse without an AI-executable
 * work item is forbidden.
 * @param {string} markerText
 * @returns {{ok: boolean, error?: string}}
 */
// [::TICKET::] PX-130, PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-130|PX-131) --for-spec --no-implementation-order`.
function validateResolvePlan(markerText) {
  const excuseHit = EXCUSE_PATTERNS.some((re) => re.test(markerText));
  const workItem = WORK_ITEM_VERB_RE.test(markerText);
  if (excuseHit && !workItem) {
    return { ok: false, error: "resolve plan contains a terminal excuse without an AI-executable work item" };
  }
  return { ok: true };
}

/**
 * Edit an existing marker line at file:line.
 * @param {object} params
 * @param {string} params.file — Source file path
 * @param {number} params.line — 1-indexed marker line
 * @param {string} params.resolveByTicket — New resolve ticket key (required)
 * @param {string} [params.stubReason] — Override the marker reason
 * @param {string} [params.resolvePlan] — Override the resolution plan
 * @param {string} params.ticketsPath — Path to Tickets.json
 * @returns {{success: boolean, error?: string, file?: string, line?: number, content?: string}}
 */
// [::TICKET::] PX-130, PX-131, PX-132, PX-135 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-130|PX-131|PX-132|PX-135) --for-spec --no-implementation-order`.
function updateStub({ file, line, resolveByTicket, stubReason, resolvePlan, unitId, ticketsPath, dryRun = false }) {
  if (!file || !Number.isInteger(line) || line < 1) {
    return { success: false, error: "--file and a positive integer --line are required" };
  }
  if (!resolveByTicket) {
    return { success: false, error: "--resolve-by-ticket is required" };
  }
  // Tickets.json is always the current directory's Tickets.json (CLI convention);
  // the exported API accepts an explicit path only for test isolation.
  const ticketsJsonPath = ticketsPath || path.resolve("Tickets.json");

  const absFile = path.resolve(file);
  let sourceText;
  try {
    sourceText = fs.readFileSync(absFile, "utf8");
  } catch {
    return { success: false, error: "source file not found: " + file };
  }
  const lines = sourceText.split("\n");
  const idx = line - 1;
  const current = lines[idx];
  if (current === undefined || !current.includes(STUB_TAG)) {
    return { success: false, error: "no [::STUB::] marker at " + file + ":" + line };
  }

  const parsed = parseMarker(current);
  if (!parsed) {
    return { success: false, error: "cannot parse marker at " + file + ":" + line };
  }

  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(ticketsJsonPath, "utf8"));
  } catch (e) {
    return { success: false, error: "cannot read Tickets.json: " + e.message };
  }

  const key = resolveByTicket.trim();
  const keyCheck = validateResolveKey(key, ticketsData);
  if (!keyCheck.ok) return { success: false, error: keyCheck.error };

  // Keep the reason free of any existing unit tag, then re-embed the effective
  // unit id: the explicit --unit-id overrides, otherwise an existing tag survives.
  const reason = (stubReason !== undefined ? stubReason : parsed.reason)
    .replace(/\s*\[::UNIT::[^\]]*::\]/, "")
    .trim();
  const plan = (resolvePlan !== undefined ? resolvePlan : parsed.plan).trim();
  // PX-135: refuse to write a marker with a blank reason or plan — the batch
  // decision validator already rejects empty strings, this guards direct callers.
  if (reason === "") {
    return { success: false, error: "resolve reason must be a non-empty string when provided" };
  }
  if (plan === "") {
    return { success: false, error: "resolve plan must be a non-empty string when provided" };
  }
  const effectiveUnitId = unitId !== undefined && unitId !== "" ? unitId : extractUnitId(current);
  const markerText = buildMarkerLine(current, key, reason, plan, effectiveUnitId);
  const planCheck = validateResolvePlan(markerText);
  if (!planCheck.ok) return { success: false, error: planCheck.error };

  // Surgical edit: replace only the target marker line. dryRun validates and
  // prepares the new content without writing — used by batch-update-stub.js for
  // all-or-nothing atomic commits.
  if (!dryRun) {
    lines[idx] = markerText;
    try {
      fs.writeFileSync(absFile, lines.join("\n"), "utf8");
    } catch (e) {
      return { success: false, error: "cannot write file: " + e.message };
    }
  }

  return { success: true, file: absFile, line, content: markerText };
}

/**
 * Merge true duplicates: markers that share the same defect (reason) in the same
 * file. The survivor (lowest line) enumerates the covered line span so no stub
 * site loses its location annotation.
 * @param {Array} markers — [{file, line, content}]
 * @returns {{kept: Array, removed: Array}}
 */
// [::TICKET::] PX-130, PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-130|PX-131) --for-spec --no-implementation-order`.
function mergeTrueDuplicates(markers) {
  const byFile = {};
  for (const m of markers) {
    if (!byFile[m.file]) byFile[m.file] = [];
    byFile[m.file].push(m);
  }
  const kept = [];
  const removed = [];
  for (const [file, group] of Object.entries(byFile)) {
    const byDefect = new Map();
    for (const m of group) {
      const parsed = parseMarker(m.content);
      const defect = parsed ? parsed.reason : m.content;
      if (!byDefect.has(defect)) byDefect.set(defect, []);
      byDefect.get(defect).push(m);
    }
    for (const cluster of byDefect.values()) {
      if (cluster.length === 1) { kept.push(cluster[0]); continue; }
      cluster.sort((a, b) => a.line - b.line);
      const survivor = cluster[0];
      const covered = path.basename(file) + ":" + cluster.map((c) => c.line).join(",");
      survivor.content = annotateCoveredLines(survivor.content, covered);
      kept.push(survivor);
      removed.push(...cluster.slice(1));
    }
  }
  return { kept, removed };
}

/**
 * Insert " (covers <file:line,...>)" before the ' -- ' plan separator.
 * @param {string} content — Marker line
 * @param {string} covered — Comma-separated covered locations
 * @returns {string}
 */
// [::TICKET::] PX-130, PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-130|PX-131) --for-spec --no-implementation-order`.
function annotateCoveredLines(content, covered) {
  const m = content.match(/^(.*?)\s*--\s*(.*)$/);
  if (m) return m[1] + " (covers " + covered + ") -- " + m[2];
  return content + " (covers " + covered + ")";
}

/**
 * Normalize a unit so every marker shares exactly one resolve key.
 * @param {object} unit — {markers:[{file,line,content,resolveByTicket?}], resolveByTicket?}
 * @returns {object} — unit with every marker carrying the same resolveByTicket
 */
// [::TICKET::] PX-130, PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-130|PX-131) --for-spec --no-implementation-order`.
function normalizeUnitKey(unit) {
  const first = unit.markers[0];
  const key = unit.resolveByTicket || (first && (first.resolveByTicket || (parseMarker(first.content) || {}).key)) || null;
  const markers = unit.markers.map((m) => ({ ...m, resolveByTicket: key }));
  return { ...unit, markers, resolveByTicket: key };
}

/**
 * Emit the PX-129 grouped handoff manifest: one {sourceKey, stubs:[...]} entry
 * per unit, directly consumable by batch-create-resolving-tickets.js.
 * @param {Array} units — [{markers:[{file,line,content}]}]
 * @returns {Array} — [{sourceKey, stubs:[{file,line,content}]}]
 */
// [::TICKET::] PX-130, PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-130|PX-131) --for-spec --no-implementation-order`.
function emitHandoffManifest(units) {
  return units.map((unit) => {
    const normalized = normalizeUnitKey(unit);
    return {
      sourceKey: normalized.resolveByTicket,
      stubs: normalized.markers.map((m) => ({ file: m.file, line: m.line, content: m.content })),
    };
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** Parse CLI arguments. Tickets.json is always ./Tickets.json — --tickets-path is rejected. @returns {{file: string|null, line: number|null, resolveByTicket: string|null, stubReason: string|null, resolvePlan: string|null, unitId: string|null, error?: string}} */
// [::TICKET::] PX-130, PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-130|PX-131) --for-spec --no-implementation-order`.
function parseCliArgs(argv) {
  const opts = { file: null, line: null, resolveByTicket: null, stubReason: null, resolvePlan: null, unitId: null };
  for (const arg of argv) {
    if (arg.startsWith("--file=")) opts.file = arg.slice("--file=".length);
    else if (arg.startsWith("--line=")) opts.line = parseInt(arg.slice("--line=".length), 10);
    else if (arg.startsWith("--resolve-by-ticket=")) opts.resolveByTicket = arg.slice("--resolve-by-ticket=".length);
    else if (arg.startsWith("--stub-reason=")) opts.stubReason = arg.slice("--stub-reason=".length);
    else if (arg.startsWith("--resolve-plan=")) opts.resolvePlan = arg.slice("--resolve-plan=".length);
    else if (arg.startsWith("--unit-id=")) opts.unitId = arg.slice("--unit-id=".length);
    else return { ...opts, error: "unknown argument: " + arg };
  }
  return opts;
}

/** @returns {string} — stdin text (empty when nothing piped) */
// [::TICKET::] PX-130, PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-130|PX-131) --for-spec --no-implementation-order`.
function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/** CLI entry point. */
// [::TICKET::] PX-130, PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-130|PX-131) --for-spec --no-implementation-order`.
function main() {
  const args = readStdin()
    ? parseCliArgs(readStdin().trim().split(/\s+/))
    : parseCliArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write("[update-stub] " + args.error + "\n");
    process.exit(2);
  }
  const res = updateStub(args);
  if (!res.success) {
    process.stderr.write("[update-stub] FAIL -- " + res.error + "\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ success: true, file: res.file, line: res.line }) + "\n");
  process.exit(0);
}

if (require.main === module) main();

module.exports = { updateStub, mergeTrueDuplicates, normalizeUnitKey, emitHandoffManifest, parseMarker, buildMarkerLine, extractUnitId, validateResolveKey, validateResolvePlan, parseCliArgs };
