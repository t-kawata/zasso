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
import os from "os";
import path from "path";
import { validateAll } from "./check-all-schema.js";
import { AI_SUPPLEMENT_COMMENT } from "./lib/checklist-fence.mjs";
import {
  VIEW_JSON_NAME,
  VIEW_MARKDOWN_NAME,
  expandHomePath,
  findSequenceMaterial,
  isUsableSourceArtifact,
  nodeFileSystem,
  SOURCE_ARTIFACT_SUFFIX,
} from "../sequences-slice/lib/material.mjs";
import { ProjectionRefused, projectPackageView } from "../sequences-slice/lib/project-package.mjs";

const HOME_DIRECTORY = os.homedir();

/**
 * The view this run was handed an artifact for, made current.
 *
 * A session records the material it was given and then reads whatever is on disk, so a view
 * projected from an older artifact was read as material by every later run and nothing in the run's
 * own state said it predated the obligation carriage. The repair belongs at initialization rather
 * than in the command's prose because the arguments are already here: the run cannot forget a step
 * it never had to take.
 *
 * It happens only when an argument names an artifact, which is the condition under which a run owes
 * this directory a carriage at all. A session resumed with no artifact — the ordinary case for a
 * project that has none — reaches none of this and writes nothing.
 *
 * The two view files are recorded as material in the same step, because the strict readers walk
 * the recorded list: a view that was written and not recorded is a view the run does not read.
 *
 * The artifact is looked for in what the session recorded and in what this invocation was handed,
 * because on the run that first reaches a directory the artifact is only in the second: the session
 * record is written at the end of this function, so it cannot be the only place the argument is
 * read from. An unusable artifact that is still on disk is attempted anyway, so the refusal names
 * what is wrong with it instead of the run reporting that it had nothing to do.
 *
 * @param {string} rfcDir
 * @param {string[]} givenMaterialPaths — this invocation's arguments, already resolved
 * @returns {{ refreshed: Array<{view: string, packageId: string}>, recordedMaterials: string[], reason: string|null }}
 */
// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
function refreshRecordedView(rfcDir, givenMaterialPaths) {
  const io = { ...nodeFileSystem(fs), basename: path.basename, join: path.join };
  const answer = findSequenceMaterial({ rfcDir, homeDirectory: HOME_DIRECTORY, io });
  const candidates = [
    ...answer.materialPaths.map((materialPath) => expandHomePath(materialPath, HOME_DIRECTORY)),
    ...givenMaterialPaths,
  ].filter((materialPath) => materialPath.endsWith(SOURCE_ARTIFACT_SUFFIX));

  const artifactPath = candidates.find((materialPath) => isUsableSourceArtifact(io, materialPath))
    ?? candidates.find((materialPath) => fs.existsSync(materialPath))
    ?? null;
  if (artifactPath === null) return { refreshed: [], recordedMaterials: [], reason: null };
  const recordedMaterials = [
    path.join(rfcDir, VIEW_MARKDOWN_NAME),
    path.join(rfcDir, VIEW_JSON_NAME),
  ];
  if (answer.viewIsCurrent) return { refreshed: [], recordedMaterials, reason: null };

  try {
    const written = projectPackageView(artifactPath, rfcDir);
    return { refreshed: [{ view: VIEW_JSON_NAME, packageId: written.packageId }], recordedMaterials, reason: null };
  } catch (error) {
    if (!(error instanceof ProjectionRefused)) throw error;
    return { refreshed: [], recordedMaterials: [], reason: error.message };
  }
}

/** The one name a grill run gives the design document it writes. */
const CANONICAL_RFC_FILENAME = "RFC.md";

const packageDir = process.argv[2];
if (!packageDir) {
  console.error("Usage: init.js <rfc-dir> [<material-path>...]");
  process.exit(1);
}

const materialPaths = process.argv.slice(3)
  .map((materialPath) => path.resolve(expandHomePath(materialPath, HOME_DIRECTORY)));
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
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
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
  const refresh = refreshRecordedView(rfcDir, materialPaths);
  const withViews = mergeMaterialPaths(merged, refresh.recordedMaterials);
  if (added.length > 0 || withViews.added.length > 0) {
    status.materialPaths = withViews.merged;
    status.researchPath = withViews.merged[0] ?? "";
  }
  if (added.length > 0) {
    status.materialsAddedAt = status.updatedAt;
  }
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), "utf-8");

  process.stdout.write(JSON.stringify({ mode: "resume", status, addedMaterials: added, ...refresh }) + "\n");
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
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
  state: "GRILLING",
  researchPath: materialPaths[0] ?? "",
  materialPaths,
  rfcPath,
  rfcDir,
  reviewLoopCount: 0,
  grillGeneration: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// A directory being initialized is the first run in it, and the branch that used to project its
// view was the manual step the command no longer states. Without this the first run in every
// directory would end with no view, which is the state the sequences rail then reads as nothing
// to do. The refresh is the same call the resume path makes, so there is one answer to what a
// view contains rather than one per branch.
const refresh = refreshRecordedView(rfcDir, materialPaths);
const withViews = mergeMaterialPaths(statusTemplate.materialPaths, refresh.recordedMaterials);
statusTemplate.materialPaths = withViews.merged;
statusTemplate.researchPath = withViews.merged[0] ?? "";
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
  status: statusTemplate,
  materialPaths: statusTemplate.materialPaths,
  files: {
    status: statusPath,
    tree: treePath,
    checklist: checklistPath,
  },
  ...refresh,
}) + "\n");
