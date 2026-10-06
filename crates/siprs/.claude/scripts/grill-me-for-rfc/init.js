#!/usr/bin/env node
/**
 * init.js <rfc-dir> [<material-path>...]
 *
 * Initialises a grill session in <rfc-dir>: writes Status.json, DesignTree.json and
 * CheckList.md, and records the material paths the caller handed over so later
 * scripts read them from Status.json rather than from the command line.
 *
 * The RFC is deliberately not an argument. It is always <rfc-dir>/RFC.md, so the
 * name of the design document is a rule of the command rather than a choice of the
 * caller, and no later reader has to work out which file was meant.
 *
 * Detects existing files to determine whether the mode is new/resume/overwrite_confirm,
 * and reports the result as JSON on STDOUT.
 */
import fs from "fs";
import path from "path";
import { validateAll } from "./check-all-schema.js";
import { AI_SUPPLEMENT_COMMENT } from "./lib/checklist-fence.mjs";

/** The one name a grill run gives the design document it writes. */
const CANONICAL_RFC_FILENAME = "RFC.md";

const packageDir = process.argv[2];
if (!packageDir) {
  console.error("Usage: init.js <rfc-dir> [<material-path>...]");
  process.exit(1);
}

const materialPaths = process.argv.slice(3).map((materialPath) => path.resolve(materialPath));
const missingMaterials = materialPaths.filter((materialPath) => !fs.existsSync(materialPath));
if (missingMaterials.length > 0) {
  console.error(`Material not found: ${missingMaterials.join(", ")}`);
  process.exit(1);
}

const rfcDir = path.resolve(packageDir);
const rfcPath = path.join(rfcDir, CANONICAL_RFC_FILENAME);
const statusPath = path.join(rfcDir, "Status.json");
const treePath = path.join(rfcDir, "DesignTree.json");
const checklistPath = path.join(rfcDir, "CheckList.md");

const rfcExists = fs.existsSync(rfcPath);
const statusExists = fs.existsSync(statusPath);

// Determine mode
let mode = "new";
if (statusExists) {
  mode = "resume";
} else if (rfcExists) {
  mode = "overwrite_confirm";
}

/**
 * The material the session already holds.
 *
 * materialPaths is the field current runs write. researchPath is the single path a
 * Status.json written before that field existed carries, and is read only when the
 * list is absent, so an older session still reports its material instead of failing.
 *
 * @param {object} status — the parsed Status.json
 * @returns {string[]}
 */
// [::TICKET::] PX-238, PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-238|PX-239) --for-spec --no-implementation-order`.
function materialPathsOf(status) {
  if (Array.isArray(status.materialPaths)) return status.materialPaths;
  return status.researchPath ? [status.researchPath] : [];
}

/**
 * Join the material a resume was given to the material the session already holds.
 *
 * A resumed run is the same run continuing, so what it is handed is added to the
 * session rather than replacing it. Order is part of the contract: list-files.js
 * walks the recorded list in the order given, so this appends and never sorts. A
 * path already recorded — or named twice in one invocation — contributes once,
 * which keeps the list a set of materials rather than a log of invocations.
 *
 * @param {string[]} recorded — the material paths the session already holds
 * @param {string[]} given — the material paths this invocation was handed
 * @returns {{ merged: string[], added: string[] }}
 */
// [::TICKET::] PX-238, PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-238|PX-239) --for-spec --no-implementation-order`.
function mergeMaterialPaths(recorded, given) {
  const merged = [...recorded];
  const added = [];
  for (const materialPath of given) {
    if (merged.includes(materialPath)) continue;
    merged.push(materialPath);
    added.push(materialPath);
  }
  return { merged, added };
}

if (mode === "resume") {
  // Validate what is on disk before touching it: a session that is already
  // malformed is reported and left exactly as it was found, which is the guarantee
  // the resume path had before it started writing at all.
  const schemaErrors = validateAll(rfcDir);
  if (schemaErrors.length > 0) {
    console.error(JSON.stringify({ ok: false, phase: "schema-validation", errors: schemaErrors }, null, 2));
    process.exit(1);
  }

  const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
  const { merged, added } = mergeMaterialPaths(materialPathsOf(status), materialPaths);

  // The session was resumed, so its timestamp moves either way; the material list
  // and the moment it last grew move only when this invocation contributed
  // something, which is what lets a completed session tell "a viewpoint arrived
  // afterwards" apart from "this run finished and nothing has happened since".
  status.updatedAt = new Date().toISOString();
  if (added.length > 0) {
    status.materialPaths = merged;
    status.researchPath = merged[0] ?? "";
    status.materialsAddedAt = status.updatedAt;
  }
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), "utf-8");

  process.stdout.write(JSON.stringify({ mode: "resume", status, addedMaterials: added }) + "\n");
  process.exit(0);
}

if (mode === "overwrite_confirm") {
  process.stdout.write(JSON.stringify({ mode: "overwrite_confirm", materialPaths, rfcPath }) + "\n");
  process.exit(0);
}

// New mode: generate template files
fs.mkdirSync(rfcDir, { recursive: true });

// Status.json template.
//
// materialPaths is the list this run was given. researchPath repeats its first
// entry because every Status.json written before materialPaths existed carries it
// and check-all-schema.js still requires it; a run with no material records the
// empty string rather than null, which that same check rejects as missing.
const statusTemplate = {
  state: "GRILLING",
  researchPath: materialPaths[0] ?? "",
  materialPaths,
  rfcPath,
  rfcDir,
  reviewLoopCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
fs.writeFileSync(statusPath, JSON.stringify(statusTemplate, null, 2), "utf-8");

// DesignTree.json template
const treeTemplate = {
  version: 1,
  updatedAt: new Date().toISOString(),
  nodes: [],
};
fs.writeFileSync(treePath, JSON.stringify(treeTemplate, null, 2), "utf-8");

// CheckList.md template — the shape the generator recognises as its own.
//
// generate-checklist.js owns the bytes between its fence markers and refuses a
// file carrying neither a fence nor its trailing AI-supplement comment. The old
// template ended in a bare `<!-- GENERATED -->` comment, which is neither, so
// STEP 4 refused on every freshly initialized directory and no grill run could
// reach the RFC. The header stays because check-all-schema.js requires it; the
// trailing comment is what lets the first generation migrate this file instead
// of refusing it, and the header is carried into the generated body rather than
// duplicated outside the fence.
// [::TICKET::] PX-233 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-233 --for-spec --no-implementation-order`.
const checklistTemplate = `# RFC 要件チェックリスト\n\n${AI_SUPPLEMENT_COMMENT}\n`;
fs.writeFileSync(checklistPath, checklistTemplate, "utf-8");

const schemaErrors = validateAll(rfcDir);
if (schemaErrors.length > 0) {
  console.error(JSON.stringify({ ok: false, phase: "schema-validation", errors: schemaErrors }, null, 2));
  process.exit(1);
}

process.stdout.write(JSON.stringify({
  mode: "new",
  rfcDir,
  materialPaths,
  files: {
    status: statusPath,
    tree: treePath,
    checklist: checklistPath,
  },
}) + "\n");
