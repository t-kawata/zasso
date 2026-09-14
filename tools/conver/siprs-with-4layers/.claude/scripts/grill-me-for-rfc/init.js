#!/usr/bin/env node
/**
 * init.js <research-path> <rfc-output-file-path>
 *
 * Takes a research path (1st arg) and an RFC output file path (2nd arg),
 * and generates the template files. The research path is persisted in Status.json
 * so subsequent scripts can read it mechanically.
 *
 * Detects existing files to determine whether the mode is new/resume/overwrite_confirm,
 * and reports the result as JSON on STDOUT.
 */
import fs from "fs";
import path from "path";
import { validateAll } from "./check-all-schema.js";

const researchPath = process.argv[2];
const rfcPath = process.argv[3];
if (!researchPath || !rfcPath) {
  console.error("Usage: init.js <research-path> <rfc-output-file-path>");
  process.exit(1);
}

const rfcDir = path.dirname(path.resolve(rfcPath));
const statusPath = path.join(rfcDir, "Status.json");
const treePath = path.join(rfcDir, "DesignTree.json");
const checklistPath = path.join(rfcDir, "CheckList.md");

const rfcExists = fs.existsSync(rfcPath);
const statusExists = fs.existsSync(statusPath);

// Determine mode
let mode = "new";
if (statusExists) {
  mode = "resume";
} else if (rfcExists && !statusExists) {
  mode = "overwrite_confirm";
}

if (mode === "resume") {
  const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
  const schemaErrors = validateAll(rfcDir);
  if (schemaErrors.length > 0) {
    console.error(JSON.stringify({ ok: false, phase: "schema-validation", errors: schemaErrors }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ mode: "resume", status }));
  process.exit(0);
}

if (mode === "overwrite_confirm") {
  console.log(JSON.stringify({ mode: "overwrite_confirm", researchPath: path.resolve(researchPath), rfcPath: path.resolve(rfcPath) }));
  process.exit(0);
}

// New mode: generate template files
fs.mkdirSync(rfcDir, { recursive: true });

// Status.json template — persist researchPath
const statusTemplate = {
  state: "GRILLING",
  researchPath: path.resolve(researchPath),
  rfcPath: path.resolve(rfcPath),
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

// CheckList.md template
const checklistTemplate = `# RFC 要件チェックリスト

> このファイルは /grill-me-for-rfc により自動管理されます。
> grillセッション完了後に内容が充填されます。

<!-- GENERATED -->
`;
fs.writeFileSync(checklistPath, checklistTemplate, "utf-8");

const schemaErrors = validateAll(rfcDir);
if (schemaErrors.length > 0) {
  console.error(JSON.stringify({ ok: false, phase: "schema-validation", errors: schemaErrors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  mode: "new",
  rfcDir,
  files: {
    status: statusPath,
    tree: treePath,
    checklist: checklistPath,
  },
}));
