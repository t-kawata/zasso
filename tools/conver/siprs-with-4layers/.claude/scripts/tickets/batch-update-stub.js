#!/usr/bin/env node
// [::TICKET::] PX-132: batch-update-stub.js — batch consolidation from a units decision file.

/**
 * batch-update-stub.js — Apply a units decision file to every listed STUB marker.
 *
 * Reads the AI-authored grouping decision [{unitId, resolveByTicket?, reason?,
 * plan?, markerLines:[file:line,...]}], resolves each marker reference against the
 * scanned markers, validates every edit via updateStub (dryRun), and — only when
 * ALL edits validate — commits them atomically, merges true duplicates, emits the
 * grouped manifest (reusing print-manifest-for-find-omissions.js), strips the
 * [::UNIT::] tags, and consumes the decision file.
 *
 * Three-point verification:
 *   Omissions (C004) — scanned markers absent from the decision file are reported as unassigned
 *   Failures (C003) — any validation failure aborts with zero writes; failures list file:line
 *   Debris (C005) — after success, zero [::UNIT::] tags remain, format gate passes, decision file removed
 *
 * Usage (run from the directory containing Tickets.json):
 *   node batch-update-stub.js <units.json>
 *
 * The target source tree is always the current directory; a [dir] argument is
 * not accepted (same convention as batch-create-resolving-tickets.js).
 */

const fs = require("fs");
const path = require("path");
const { updateStub, mergeTrueDuplicates } = require("./update-stub.js");
const { extractTicketKey } = require("./validate-no-external-excuses.js");
const { scanStubs, runPrinter } = require("./print-manifest-for-find-omissions.js");

/** Parse a "file:line" reference. @returns {{file: string, line: number}|null} */
// [::TICKET::] PX-132 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-132 --for-spec --no-implementation-order`.
function parseMarkerReference(ref) {
  const m = String(ref).match(/^(.+):(\d+)$/);
  return m ? { file: m[1], line: parseInt(m[2], 10) } : null;
}

/** Canonical marker key: root-resolved absolute file + line. */
// [::TICKET::] PX-132 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-132 --for-spec --no-implementation-order`.
function markerKey(file, line, root) {
  return path.resolve(root, file) + ":" + line;
}

/**
 * Strict schema validation of the units decision file. Catches every malformed
 * or ambiguous input BEFORE any marker is touched, so a non-deterministic AI
 * output can never cause a partial or wrong edit.
 * @param {Array} units — Parsed decision file
 * @returns {Array} — [{where, unitId?, ref?, problem, cause, fix}]
 */
// [::TICKET::] PX-132, PX-135 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-132|PX-135) --for-spec --no-implementation-order`.
function validateDecisionUnits(units) {
  const problems = [];
  const seenUnitIds = new Set();
  const seenMarkerRefs = new Set();
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const where = "unit[" + i + "]";
    if (!unit || typeof unit !== "object" || Array.isArray(unit)) {
      problems.push({
        where,
        problem: "this entry is not an object",
        cause: "each unit must be a JSON object",
        fix: "wrap each unit as { unitId, resolveByTicket?, reason?, plan?, markerLines }",
      });
      continue;
    }
    if (typeof unit.unitId !== "string" || unit.unitId.trim() === "") {
      problems.push({
        where,
        unitId: unit.unitId,
        problem: "unitId is missing or empty",
        cause: "each unit needs a unique identifier so the manifest printer can group its markers",
        fix: 'add "unitId": "U<n>" (e.g. "U1") to this unit',
      });
    } else if (seenUnitIds.has(unit.unitId)) {
      problems.push({
        where,
        unitId: unit.unitId,
        problem: 'unitId "' + unit.unitId + '" is used more than once',
        cause: "unit ids must be unique across the decision file",
        fix: "give each unit a distinct unitId",
      });
    }
    seenUnitIds.add(unit.unitId);

    if (!Array.isArray(unit.markerLines) || unit.markerLines.length === 0) {
      problems.push({
        where,
        unitId: unit.unitId,
        problem: "markerLines is missing or empty",
        cause: "markerLines tells the tool which markers belong to this unit",
        fix: 'list every marker as "file:line" (e.g. "src/call.rs:23") from Step 1\'s enumeration',
      });
    } else {
      for (const ref of unit.markerLines) {
        if (!parseMarkerReference(ref)) {
          problems.push({
            where,
            unitId: unit.unitId,
            ref,
            problem: 'marker reference "' + ref + '" is not a valid file:line',
            cause: 'expected the form "<file>:<line>" with a positive integer line',
            fix: 'correct the markerLines entry to "<file>:<line>"',
          });
        } else {
          const key = String(ref);
          if (seenMarkerRefs.has(key)) {
            problems.push({
              where,
              unitId: unit.unitId,
              ref,
              problem: 'marker "' + ref + '" is assigned to more than one unit',
              cause: "a marker can belong to exactly one unit",
              fix: "remove the duplicate from one unit's markerLines",
            });
          }
          seenMarkerRefs.add(key);
        }
      }
    }

    // PX-135: an empty reason/plan would blank the marker — reject when present
    // but empty so no marker is ever written without its why/plan text.
    if (unit.reason !== undefined && (typeof unit.reason !== "string" || unit.reason.trim() === "")) {
      problems.push({
        where,
        unitId: unit.unitId,
        problem: "reason must be a non-empty string when present",
        cause: "an empty reason would blank the marker's why-this-stays text",
        fix: "omit reason to keep each marker's existing reason, or provide a non-empty reason",
      });
    }
    if (unit.plan !== undefined && (typeof unit.plan !== "string" || unit.plan.trim() === "")) {
      problems.push({
        where,
        unitId: unit.unitId,
        problem: "plan must be a non-empty string when present",
        cause: "an empty plan would produce a marker with no resolution plan",
        fix: "omit plan to keep each marker's existing plan, or provide a non-empty plan",
      });
    }
  }
  return problems;
}

/**
 * Resolve each decision unit's markerLines against the scanned marker set.
 * Both the decision refs and the scanned markers are keyed by root-resolved
 * absolute path, so relative "src/a.rs:4" refs match scanned absolute paths.
 * @param {Array} decision — Units from the decision file
 * @param {Array} scanned — Markers from find-all-stubs
 * @param {string} root — Target tree root for path resolution
 * @returns {{resolved: Array, assigned: Set, failures: Array}}
 */
// [::TICKET::] PX-132 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-132 --for-spec --no-implementation-order`.
function resolveMarkerLines(decision, scanned, root) {
  const scannedByRef = new Map();
  for (const s of scanned) scannedByRef.set(markerKey(s.file, s.line, root), s);
  const resolved = [];
  const assigned = new Set();
  const failures = [];
  for (const unit of decision) {
    const markers = [];
    for (const ref of unit.markerLines || []) {
      const parsed = parseMarkerReference(ref);
      if (!parsed) { failures.push({ ref, error: "invalid marker reference: " + ref }); continue; }
      const key = markerKey(parsed.file, parsed.line, root);
      const scannedMarker = scannedByRef.get(key);
      if (!scannedMarker) { failures.push({ ref, error: "no marker at " + ref }); continue; }
      markers.push({ file: scannedMarker.file, line: scannedMarker.line, content: scannedMarker.content });
      assigned.add(key);
    }
    resolved.push({ ...unit, markers });
  }
  return { resolved, assigned, failures };
}

/** Omissions: scanned markers not assigned to any unit. */
// [::TICKET::] PX-132 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-132 --for-spec --no-implementation-order`.
function findUnassigned(scanned, assigned, root) {
  return scanned.filter((s) => !assigned.has(markerKey(s.file, s.line, root)));
}

/**
 * Resolve a unit's key: explicit resolveByTicket wins, otherwise the key is
 * derived from the first marker's content.
 * @param {object} unit
 * @returns {string|null}
 */
// [::TICKET::] PX-132 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-132 --for-spec --no-implementation-order`.
function deriveResolveKey(unit) {
  if (unit.resolveByTicket) return unit.resolveByTicket;
  const first = unit.markers[0];
  return first ? extractTicketKey(first.content) : null;
}

/**
 * Validate every edit via updateStub(dryRun) — no writes. Returns prepared edits
 * or the failures (which abort the run).
 * @param {Array} units — Resolved units with markers
 * @param {string} ticketsPath
 * @returns {{ok: boolean, edits?: Array, failures?: Array}}
 */
// [::TICKET::] PX-132 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-132 --for-spec --no-implementation-order`.
function prepareAllEdits(units, ticketsPath) {
  const edits = [];
  const failures = [];
  for (const unit of units) {
    const key = deriveResolveKey(unit);
    for (const marker of unit.markers) {
      const res = updateStub({
        file: marker.file,
        line: marker.line,
        resolveByTicket: key,
        stubReason: unit.reason,
        resolvePlan: unit.plan,
        unitId: unit.unitId,
        ticketsPath,
        dryRun: true,
      });
      if (!res.success) {
        failures.push({ file: marker.file, line: marker.line, error: res.error });
      } else {
        // oldContent must be the exact on-disk line (find-all-stubs returns it trimmed),
        // so the rollback backup restores the file byte-for-byte.
        const onDiskLine = fs.readFileSync(res.file, "utf8").split("\n")[marker.line - 1];
        edits.push({ file: res.file, line: marker.line, oldContent: onDiskLine, newContent: res.content, unitId: unit.unitId, key });
      }
    }
  }
  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, edits };
}

/**
 * Split prepared edits into dedup survivors (kept) and merged-away duplicates
 * (removed). Markers sharing the same file and reason within a unit collapse to
 * the lowest-line survivor, which enumerates the covered lines.
 * @param {Array} edits — Prepared edits [{file, line, newContent, unitId, key}]
 * @returns {{kept: Array, removed: Array}}
 */
// [::TICKET::] PX-135 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-135 --for-spec --no-implementation-order`.
function mergeUnitDuplicates(edits) {
  const byUnit = {};
  for (const e of edits) {
    if (!byUnit[e.unitId]) byUnit[e.unitId] = [];
    byUnit[e.unitId].push(e);
  }
  const kept = [];
  const removed = [];
  for (const unitId of Object.keys(byUnit)) {
    const unitEdits = byUnit[unitId];
    const markers = unitEdits.map((e) => ({ file: e.file, line: e.line, content: e.newContent }));
    const merged = mergeTrueDuplicates(markers);
    const removedKeys = new Set(merged.removed.map((m) => m.file + ":" + m.line));
    for (const e of unitEdits) {
      if (removedKeys.has(e.file + ":" + e.line)) {
        removed.push(e);
      } else {
        const survivor = merged.kept.find((m) => m.file === e.file && m.line === e.line);
        kept.push({ ...e, newContent: survivor ? survivor.content : e.newContent });
      }
    }
  }
  return { kept, removed };
}

/**
 * Commit a consolidation: replace survivor lines and delete merged-away lines.
 * Both operations are processed per file in descending line order so deletions
 * never shift an earlier replacement's target line.
 * @param {Array} keptEdits — Survivor edits [{file, line, newContent}]
 * @param {Array} removedEdits — Merged-away edits [{file, line}]
 */
// [::TICKET::] PX-135 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-135 --for-spec --no-implementation-order`.
function commitConsolidated(keptEdits, removedEdits) {
  const byFile = {};
  for (const e of keptEdits) {
    if (!byFile[e.file]) byFile[e.file] = [];
    byFile[e.file].push({ line: e.line, kind: "replace", content: e.newContent });
  }
  for (const e of removedEdits) {
    if (!byFile[e.file]) byFile[e.file] = [];
    byFile[e.file].push({ line: e.line, kind: "delete" });
  }
  for (const [file, operations] of Object.entries(byFile)) {
    operations.sort((a, b) => b.line - a.line);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    for (const op of operations) {
      if (op.kind === "delete") lines.splice(op.line - 1, 1);
      else lines[op.line - 1] = op.content;
    }
    fs.writeFileSync(file, lines.join("\n"), "utf8");
  }
}

/** Current timestamp as YYYYMMDDhhmmss (same format as print-manifest). */
// [::TICKET::] PX-132 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-132 --for-spec --no-implementation-order`.
function rollbackTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

/**
 * Write a precise rollback backup (the pre-edit marker contents) under manifests/,
 * so the applied consolidation can be undone without destructive git commands.
 * The backup records edited (survivor) entries for replacement and removed
 * (merged-away) entries for reinsertion on rollback.
 * @param {Array} keptEdits — Survivor edits [{file, line, oldContent}]
 * @param {Array} removedEdits — Merged-away edits [{file, line, oldContent}]
 * @param {string} root — Target tree root
 * @returns {{ok: boolean, rollbackPath?: string, error?: string}}
 */
// [::TICKET::] PX-132, PX-135 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-132|PX-135) --for-spec --no-implementation-order`.
function writeRollbackFile(keptEdits, removedEdits, root) {
  const manifestsDir = path.join(root, "manifests");
  try {
    fs.mkdirSync(manifestsDir, { recursive: true });
    const rollbackPath = path.join(manifestsDir, "ROLLBACK-" + rollbackTimestamp() + ".json");
    const backup = {
      edited: keptEdits.map((e) => ({ file: e.file, line: e.line, oldContent: e.oldContent })),
      removed: removedEdits.map((e) => ({ file: e.file, line: e.line, oldContent: e.oldContent })),
    };
    fs.writeFileSync(rollbackPath, JSON.stringify(backup, null, 2) + "\n", "utf8");
    return { ok: true, rollbackPath };
  } catch (e) {
    return { ok: false, error: "cannot write rollback backup: " + e.message };
  }
}

/**
 * Restore the edited markers from a rollback backup — precise, no git involved.
 * Accepts both the legacy flat-array format (every entry is an edited line) and
 * the PX-135 structured format { edited: [...], removed: [...] }.
 * @param {object} params
 * @param {string} params.backupPath — Path to the ROLLBACK-*.json file
 * @returns {{ok: boolean, restored?: number, error?: string}}
 */
// [::TICKET::] PX-132, PX-135 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-132|PX-135) --for-spec --no-implementation-order`.
function runRollback({ backupPath }) {
  if (!backupPath) return { ok: false, error: "--rollback requires a backup path" };
  let backup;
  try {
    backup = JSON.parse(fs.readFileSync(path.resolve(backupPath), "utf8"));
  } catch (e) {
    return { ok: false, error: "cannot read rollback backup: " + e.message };
  }

  // Normalize both backup shapes to a single entry list with a restore kind.
  let editedEntries;
  let removedEntries;
  if (Array.isArray(backup)) {
    editedEntries = backup;
    removedEntries = [];
  } else if (backup && Array.isArray(backup.edited)) {
    editedEntries = backup.edited;
    removedEntries = backup.removed || [];
  } else {
    return { ok: false, error: "malformed rollback backup: expected an array or { edited, removed }" };
  }

  const byFile = {};
  const collect = (entries, kind) => {
    for (const b of entries) {
      if (!b.file || !Number.isInteger(b.line) || typeof b.oldContent !== "string") {
        return { ok: false, error: "malformed rollback entry: " + JSON.stringify(b) };
      }
      if (!byFile[b.file]) byFile[b.file] = [];
      byFile[b.file].push({ line: b.line, kind, oldContent: b.oldContent });
    }
    return { ok: true };
  };
  const editedCollect = collect(editedEntries, "replace");
  if (!editedCollect.ok) return editedCollect;
  const removedCollect = collect(removedEntries, "insert");
  if (!removedCollect.ok) return removedCollect;

  for (const [file, entries] of Object.entries(byFile)) {
    entries.sort((a, b) => b.line - a.line);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    for (const e of entries) {
      if (e.kind === "insert") lines.splice(e.line - 1, 0, e.oldContent);
      else lines[e.line - 1] = e.oldContent;
    }
    fs.writeFileSync(file, lines.join("\n"), "utf8");
  }
  return { ok: true, restored: editedEntries.length + removedEntries.length };
}

/**
 * Full pipeline: read decision -> resolve -> validate (dryRun) -> commit atomically
 * -> emit manifest + strip tags -> consume decision file -> report unassigned.
 * @param {object} params
 * @param {Array} [params.decision] — Units array (inline)
 * @param {string} [params.decisionPath] — Path to the units JSON file
 * @param {string} [params.dir] — Target tree (defaults to cwd)
 * @param {string} [params.ticketsPath] — Tickets.json (defaults to cwd)
 * @returns {{ok: boolean, manifestPath?: string, markers?: number, units?: number, unassigned?: Array, problems?: Array, failures?: Array, error?: string}}
 */
// [::TICKET::] PX-132, PX-135 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-132|PX-135) --for-spec --no-implementation-order`.
function runBatchUpdate({ decision, decisionPath, dir, ticketsPath, dryRun = false }) {
  const root = dir ? path.resolve(dir) : process.cwd();
  const tickets = ticketsPath || path.resolve("Tickets.json");

  let units;
  if (Array.isArray(decision)) units = decision;
  else if (decisionPath) {
    try { units = JSON.parse(fs.readFileSync(path.resolve(decisionPath), "utf8")); }
    catch (e) { return { ok: false, error: "cannot read the units JSON: " + e.message }; }
  } else {
    return { ok: false, error: "a units decision is required (pass <units.json> or --stdin)" };
  }
  if (!Array.isArray(units)) return { ok: false, error: "the units JSON must be an array of unit objects" };

  // Strict schema validation (Omissions-proof): malformed input fails before any
  // marker is touched. Semantic checks (resolution + edit validation) run only when
  // the schema is well-formed, and their failures are reported together.
  const schemaProblems = validateDecisionUnits(units);
  let scanned = [];
  let resolved = [];
  let assigned = new Set();
  let resolveFailures = [];
  let editFailures = [];
  let prepared = null;
  if (schemaProblems.length === 0) {
    try { scanned = scanStubs(root); } catch (e) { return { ok: false, error: "stub scan failed: " + e.message }; }
    const r = resolveMarkerLines(units, scanned, root);
    resolved = r.resolved;
    assigned = r.assigned;
    resolveFailures = r.failures;
    if (resolveFailures.length === 0) {
      prepared = prepareAllEdits(resolved, tickets);
      if (!prepared.ok) editFailures = prepared.failures;
    }
  }
  if (schemaProblems.length > 0 || resolveFailures.length > 0 || editFailures.length > 0) {
    return { ok: false, problems: schemaProblems, failures: resolveFailures.concat(editFailures), error: "the units decision file has problems" };
  }

  // Omissions (C004): report scanned markers that were not assigned to any unit.
  const unassigned = findUnassigned(scanned, assigned, root);

  // PX-135: split the prepared edits into dedup survivors and merged-away
  // duplicates before any write, so the rollback backup and the manifest both
  // reflect the consolidated result.
  const { kept, removed } = mergeUnitDuplicates(prepared.edits);

  // Dry-run: show the full edit plan with zero side effects so the AI can confirm
  // the grouping before anything is applied.
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      plan: prepared.edits.map((e) => ({ file: e.file, line: e.line, oldContent: e.oldContent, newContent: e.newContent, unitId: e.unitId, key: e.key })),
      unassigned,
      units: resolved.length,
      merged: removed.length,
    };
  }

  // Write a precise rollback backup BEFORE committing (edited survivors to
  // restore in place, removed duplicates to reinsert), so an approved-but-wrong
  // apply can be undone without destructive git commands.
  const rollback = writeRollbackFile(kept, removed, root);
  if (!rollback.ok) return { ok: false, error: rollback.error };

  // Atomic commit: replace survivor lines and delete merged-away lines.
  commitConsolidated(kept, removed);

  // Emit manifest + strip [::UNIT::] tags (print-manifest). Debris (C005).
  const printed = runPrinter(root);
  if (!printed.ok) return { ok: false, error: printed.error };

  // Consume the decision file.
  if (decisionPath) { try { fs.unlinkSync(path.resolve(decisionPath)); } catch { /* already gone */ } }

  return { ok: true, manifestPath: printed.manifestPath, rollbackPath: rollback.rollbackPath, markers: prepared.edits.length, units: resolved.length, merged: removed.length, unassigned };
}

/**
 * Print a single problem/failure block in a kind, actionable form.
 * @param {number} n — 1-based problem number
 * @param {object} entry — {problem|error, where, cause, fix}
 */
// [::TICKET::] PX-132 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-132 --for-spec --no-implementation-order`.
function printProblem(n, entry) {
  process.stderr.write("[batch-update-stub] Problem " + n + ": " + (entry.problem || entry.error) + "\n");
  if (entry.where) process.stderr.write("[batch-update-stub]   Where: " + entry.where + "\n");
  if (entry.cause) process.stderr.write("[batch-update-stub]   Cause: " + entry.cause + "\n");
  if (entry.fix) process.stderr.write("[batch-update-stub]   Fix: " + entry.fix + "\n");
  process.stderr.write("[batch-update-stub]   Return to consolidate-stubs Step 3, edit the units JSON, then re-run the command.\n\n");
}

/** CLI entry point. */
// [::TICKET::] PX-132 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-132 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const rollbackIdx = args.indexOf("--rollback");
  const rollbackPath = rollbackIdx >= 0 ? args[rollbackIdx + 1] : null;

  if (rollbackPath) {
    const rb = runRollback({ backupPath: rollbackPath });
    if (!rb.ok) {
      process.stderr.write("[batch-update-stub] Rollback failed -- " + rb.error + "\n");
      process.exit(1);
    }
    process.stdout.write("[batch-update-stub] Rolled back " + rb.restored + " marker(s) from " + rollbackPath + "\n");
    process.exit(0);
  }

  if (positional.length > 1) {
    process.stderr.write(
      "[batch-update-stub] Too many arguments. The [dir] argument is not accepted — " +
      "the target source tree is always the current directory (the Tickets.json root).\n"
    );
    process.stderr.write("[batch-update-stub] Usage: node .claude/scripts/tickets/batch-update-stub.js <units.json> [--dry-run]\n");
    process.exit(2);
  }
  const decisionPath = positional[0] || null;
  const res = runBatchUpdate({ decisionPath, dryRun });
  if (!res.ok) {
    process.stderr.write("[batch-update-stub] The units decision file has problems. No markers were changed (all-or-nothing).\n");
    process.stderr.write("[batch-update-stub] Fix each problem below, then re-run:\n");
    process.stderr.write("[batch-update-stub]     node .claude/scripts/tickets/batch-update-stub.js <units.json>\n\n");
    let n = 1;
    for (const p of res.problems || []) {
      const where = p.where +
        (p.unitId !== undefined ? ' (unitId "' + p.unitId + '")' : "") +
        (p.ref ? ' (marker "' + p.ref + '")' : "");
      printProblem(n++, { problem: p.problem, where, cause: p.cause, fix: p.fix });
    }
    for (const f of res.failures || []) {
      const where = f.file ? f.file + ":" + f.line : (f.ref ? '"' + f.ref + '"' : "?");
      printProblem(n++, {
        error: f.error,
        where,
        cause: "the units JSON does not match the scanned markers or Tickets.json",
        fix: "correct the markerLines / resolveByTicket entry that refers to this location",
      });
    }
    if (res.error && !res.problems && !res.failures) {
      process.stderr.write("[batch-update-stub] Problem: " + res.error + "\n");
    }
    process.exit(1);
  }
  if (res.dryRun) {
    process.stdout.write("[batch-update-stub] DRY RUN — no changes were made. Review the plan, then apply:\n");
    process.stdout.write("[batch-update-stub]     node .claude/scripts/tickets/batch-update-stub.js <units.json>\n");
    for (const unit of groupPlanByUnit(res.plan)) {
      process.stdout.write("[batch-update-stub] Unit " + unit.unitId + " (key " + unit.key + "):\n");
      for (const e of unit.edits) {
        process.stdout.write("[batch-update-stub]   " + e.file + ":" + e.line + "\n");
        process.stdout.write("[batch-update-stub]     old: " + e.oldContent + "\n");
        process.stdout.write("[batch-update-stub]     new: " + e.newContent + "\n");
      }
    }
    if (res.unassigned.length) {
      process.stdout.write("[batch-update-stub] UNASSIGNED: " + res.unassigned.map((u) => u.file + ":" + u.line).join(", ") + "\n");
    }
    process.exit(0);
  }
  process.stdout.write(
    "[batch-update-stub] wrote " + res.manifestPath + " (" + res.markers + " markers -> " + res.units + " units" +
    (res.unassigned.length ? "; UNASSIGNED: " + res.unassigned.map((u) => u.file + ":" + u.line).join(", ") : "") + ")\n"
  );
  process.stdout.write("[batch-update-stub] rollback backup: " + res.rollbackPath + " (restore with --rollback)\n");
  process.exit(0);
}

/** Group a flat edit plan by unitId for a readable dry-run report. */
// [::TICKET::] PX-132 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-132 --for-spec --no-implementation-order`.
function groupPlanByUnit(plan) {
  const byUnit = new Map();
  for (const e of plan) {
    const unitId = e.unitId || "?";
    if (!byUnit.has(unitId)) byUnit.set(unitId, { unitId, key: e.key, edits: [] });
    byUnit.get(unitId).edits.push(e);
  }
  return Array.from(byUnit.values());
}

if (require.main === module) main();

module.exports = { runBatchUpdate, runRollback, writeRollbackFile, validateDecisionUnits, parseMarkerReference, resolveMarkerLines, findUnassigned, deriveResolveKey, prepareAllEdits, commitConsolidated, mergeUnitDuplicates };
