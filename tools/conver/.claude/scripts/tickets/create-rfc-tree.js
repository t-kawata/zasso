/**
 * create-rfc-tree.js — RFC-TREE.json 雛形作成＋言語検出
 */
const fs = require("fs");
const path = require("path");
const { validateRfcTree } = require("./validate-rfc-tree");

const RFC_TREE_FILE = "RFC-TREE.json";

function detectLanguage(projDir) {
  let dir = path.resolve(projDir);
  const root = path.parse(dir).root;
  while (true) {
    if (fs.existsSync(path.join(dir, "Cargo.toml"))) {
      return "rust";
    }
    if (fs.existsSync(path.join(dir, "go.mod"))) return "go";
    if (fs.existsSync(path.join(dir, "package.json"))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
        if (pkg.workspaces || pkg.workspace) return "typescript";
      } catch { /* ignore */ }
    }
    if (dir === root) break;
    dir = path.dirname(dir);
  }
  return null;
}

function extractTitle(rfcPath) {
  const c = fs.readFileSync(rfcPath, "utf8");
  for (const line of c.split("\n")) {
    const m = line.match(/^#\s+(.+)/);
    if (m) return m[1].trim();
  }
  return path.basename(rfcPath, ".md");
}

function createSkeleton(rfcPath) {
  const resolved = path.resolve(rfcPath);
  const rfcDir = path.dirname(resolved);
  const treePath = path.join(rfcDir, RFC_TREE_FILE);
  if (fs.existsSync(treePath)) {
    return { success: false, error: `RFC-TREE.json already exists: ${treePath}`, skipped: true };
  }
  const language = detectLanguage(resolved);
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const skeleton = {
    canonicalRfcPath: path.relative(rfcDir, resolved),
    canonicalRfcTitle: extractTitle(resolved),
    generatedAt: dateStr,
    summary: "",
    language: language,
    split_status: {
      steps: {
        "0": "done", "1": "done", "2": "pending", "3": "pending",
        "3a-1": "pending", "3a-2": "pending", "3b": "pending",
        "3c-1": "pending", "3c-2": "pending", "3-review": "pending",
        "4": "pending", "5": "pending", "6": "pending", "7": "pending",
        "8": "pending", "9": "pending", "10": "pending", "11": "pending",
        "12": "pending"
      }
    },
    rfcUnderstanding: {
      purpose: "", goals: "", successCriteria: "", nonScope: "",
      architecture: "", componentRelations: "", designDecisions: "",
      typeDefinitions: "", apiSignatures: "", dependencyGraph: "",
      externalDependencies: "", testRequirements: "", errorHandling: "", configuration: "",
    },
    draftTree: [],
    finalTree: [],
  };
  fs.writeFileSync(treePath, JSON.stringify(skeleton, null, 2) + "\n");
  const vr = validateRfcTree(skeleton);
  if (!vr.valid) { fs.unlinkSync(treePath); return { success: false, error: "Validation failed", errors: vr.errors }; }
  return { success: true, path: treePath, language: language, generatedAt: dateStr };
}

function main() {
  const rfcPathArg = process.argv[2];
  if (!rfcPathArg) { console.log(JSON.stringify({ success: false, error: "Usage: node create-rfc-tree.js <CANONICAL_RFC_PATH>" })); process.exit(1); }
  const resolved = path.resolve(rfcPathArg);
  if (!fs.existsSync(resolved)) { console.log(JSON.stringify({ success: false, error: `RFC not found: ${rfcPathArg}` })); process.exit(1); }
  const result = createSkeleton(resolved);
  console.log(JSON.stringify(result));
  if (result.success === false && !result.skipped) process.exit(1);
}

if (require.main === module) main();
module.exports = { createSkeleton, detectLanguage };
