#!/usr/bin/env node
// [::TICKET::] PX-131: print-manifest-for-find-omissions.js — file-based grouped manifest printer.

/**
 * print-manifest-for-find-omissions.js — Emit the grouped manifest for /find-omissions.
 *
 * Scans a directory for [::UNIT::<id>::]-tagged STUB markers, groups them by unit id,
 * writes the grouped manifest {sourceKey, stubs:[{file,line,content}]} to
 * ./manifests/CONSOLIDATED-MANIFEST-<YYYYMMDDhhmmss>.json (auto-creating manifests/),
 * and — only after a successful write — mechanically strips every [::UNIT::<id>::] tag
 * from the source markers so they return to their clean format.
 *
 * Usage:
 *   node print-manifest-for-find-omissions.js [dir]     (dir defaults to cwd)
 *
 * Exit codes:
 *   0 = success (manifest file written, unit tags stripped)
 *   1 = error (no tagged markers, unwritable manifests dir, or cleanup failure)
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { extractUnitId } = require("./update-stub.js");
const { extractTicketKey } = require("./validate-no-external-excuses.js");

// Output directory (auto-created) and file prefix for the manifest.
const MANIFESTS_DIR = "manifests";
const MANIFEST_PREFIX = "CONSOLIDATED-MANIFEST-";
// The transient unit tag embedded by update-stub.js --unit-id.
const UNIT_TAG_RE = /\[::UNIT::[^\]]*::\]/;

/**
 * List all STUB markers under a directory (reuse find-all-stubs.js).
 * @param {string} dir — Directory to scan
 * @returns {Array<{file: string, line: number, content: string}>}
 */
// [::TICKET::] PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-131 --for-spec --no-implementation-order`.
function scanStubs(dir) {
  const script = path.resolve(__dirname, "review/find-all-stubs.js");
  const stdout = execFileSync("node", [script, path.resolve(dir)], { encoding: "utf8" });
  const out = JSON.parse(stdout);
  return out.stubs || [];
}

/**
 * Remove the [::UNIT::<id>::] tag from a marker line, collapsing the leftover gap.
 * @param {string} content — Marker line
 * @returns {string} — Clean marker line
 */
// [::TICKET::] PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-131 --for-spec --no-implementation-order`.
function stripUnitTag(content) {
  return content.replace(UNIT_TAG_RE, "").replace(/\s{2,}/, " ").trim();
}

/**
 * Collect markers that carry a [::UNIT::<id>::] tag.
 * @param {string} dir — Directory to scan
 * @returns {Array<{file: string, line: number, content: string, unitId: string}>}
 */
// [::TICKET::] PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-131 --for-spec --no-implementation-order`.
function scanTaggedMarkers(dir) {
  return scanStubs(dir)
    .filter((s) => extractUnitId(s.content))
    .map((s) => ({ ...s, unitId: extractUnitId(s.content) }));
}

/**
 * Group tagged markers by unit id into manifest-ready entries.
 * @param {Array} taggedMarkers — [{file,line,content,unitId}]
 * @returns {Array} — [{unitId, sourceKey, stubs:[{file,line,content}]}] with clean content
 */
// [::TICKET::] PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-131 --for-spec --no-implementation-order`.
function groupByUnitId(taggedMarkers) {
  const byUnit = new Map();
  for (const m of taggedMarkers) {
    if (!byUnit.has(m.unitId)) byUnit.set(m.unitId, []);
    byUnit.get(m.unitId).push(m);
  }
  return Array.from(byUnit.entries()).map(([unitId, markers]) => {
    const sourceKey = extractTicketKey(markers[0].content);
    const stubs = markers.map((m) => ({ file: m.file, line: m.line, content: stripUnitTag(m.content) }));
    return { unitId, sourceKey, stubs };
  });
}

/**
 * Current timestamp as YYYYMMDDhhmmss (used for the manifest filename).
 * @returns {string}
 */
// [::TICKET::] PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-131 --for-spec --no-implementation-order`.
function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

/**
 * Write the manifest to ./manifests/CONSOLIDATED-MANIFEST-<ts>.json (auto-creates
 * manifests/). Refuses to overwrite an existing file of the same timestamp.
 * @param {Array} manifest — Grouped manifest entries
 * @param {string} cwd — Root directory (manifests/ lives here)
 * @returns {{ok: boolean, manifestPath?: string, error?: string}}
 */
// [::TICKET::] PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-131 --for-spec --no-implementation-order`.
function writeManifestFile(manifest, cwd) {
  const manifestsDir = path.join(cwd, MANIFESTS_DIR);
  try {
    fs.mkdirSync(manifestsDir, { recursive: true });
    const manifestPath = path.join(manifestsDir, MANIFEST_PREFIX + timestamp() + ".json");
    if (fs.existsSync(manifestPath)) {
      return { ok: false, error: "manifest file already exists: " + manifestPath };
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    return { ok: true, manifestPath };
  } catch (e) {
    return { ok: false, error: "cannot write manifest: " + e.message };
  }
}

/**
 * Strip the [::UNIT::<id>::] tag from every tagged source marker in place.
 * @param {Array} taggedMarkers — [{file,line,content,unitId}]
 */
// [::TICKET::] PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-131 --for-spec --no-implementation-order`.
function stripUnitTags(taggedMarkers) {
  const byFile = {};
  for (const m of taggedMarkers) {
    if (!byFile[m.file]) byFile[m.file] = [];
    byFile[m.file].push(m);
  }
  for (const [file, markers] of Object.entries(byFile)) {
    markers.sort((a, b) => b.line - a.line); // descending so line numbers stay valid
    const lines = fs.readFileSync(file, "utf8").split("\n");
    for (const m of markers) {
      const idx = m.line - 1;
      const current = lines[idx];
      if (current === undefined || !current.includes("[::UNIT::")) continue;
      lines[idx] = stripUnitTag(current);
    }
    fs.writeFileSync(file, lines.join("\n"), "utf8");
  }
}

/**
 * Full pipeline: scan tagged markers -> group -> write manifest -> strip tags on success.
 * @param {string|null} [dir] — Directory to scan (defaults to cwd)
 * @returns {{ok: boolean, manifestPath?: string, markers?: number, units?: number, error?: string}}
 */
// [::TICKET::] PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-131 --for-spec --no-implementation-order`.
function runPrinter(dir) {
  const root = dir ? path.resolve(dir) : process.cwd();
  let tagged;
  try {
    tagged = scanTaggedMarkers(root);
  } catch (e) {
    return { ok: false, error: "stub scan failed: " + e.message };
  }
  if (tagged.length === 0) {
    return { ok: false, error: "no [::UNIT::] tagged markers found under " + root };
  }

  const grouped = groupByUnitId(tagged);
  const manifest = grouped.map(({ sourceKey, stubs }) => ({ sourceKey, stubs }));

  const write = writeManifestFile(manifest, root);
  if (!write.ok) return { ok: false, error: write.error };

  // Cleanup runs ONLY after a confirmed write (C005).
  try {
    stripUnitTags(tagged);
  } catch (e) {
    return { ok: false, error: "manifest written but tag cleanup failed: " + e.message, manifestPath: write.manifestPath };
  }
  return { ok: true, manifestPath: write.manifestPath, markers: tagged.length, units: grouped.length };
}

/** CLI entry point. */
// [::TICKET::] PX-131 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-131 --for-spec --no-implementation-order`.
function main() {
  const dir = process.argv[2] || ".";
  const res = runPrinter(dir);
  if (!res.ok) {
    process.stderr.write("[print-manifest-for-find-omissions] FAIL -- " + res.error + "\n");
    process.exit(1);
  }
  process.stdout.write(
    "[print-manifest-for-find-omissions] wrote " + res.manifestPath + " (" + res.markers + " markers -> " + res.units + " units)\n"
  );
  process.exit(0);
}

if (require.main === module) main();

module.exports = { scanStubs, scanTaggedMarkers, groupByUnitId, writeManifestFile, stripUnitTags, stripUnitTag, runPrinter, timestamp };
