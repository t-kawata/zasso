/**
 * Combined OMISSIONS skeleton generation, number assignment, and validation.
 * Usage: node create-omissions.js <RFC_FILE_PATH>
 */

const fs = require("fs");
const path = require("path");

const OMISSION_FILE_RE = /^OMISSIONS-(\d{3})\.json$/;
const SKELETON_STEPS = [
  {"id":"1","label":"スケルトン生成","status":"done","children":[
    {"id":"1a","label":"OMISSIONS番号採番","status":"done"},
    {"id":"1b","label":"雛形JSON書き出し","status":"done"}
  ]},
  {"id":"2","label":"RFC理解","status":"todo","children":[
    {"id":"2a-1","label":"目的とゴールの把握","status":"todo"},
    {"id":"2a-2","label":"メタ情報の記録","status":"todo"},
    {"id":"2b","label":"アーキテクチャ把握","status":"todo"},
    {"id":"2c-1","label":"実装詳細（型・API・依存）","status":"todo"},
    {"id":"2c-2","label":"実装詳細（テスト・エラー処理・設定）","status":"todo"},
    {"id":"2-review","label":"RFC理解の全体確認","status":"todo"}
  ]},
  {"id":"3","label":"ソースコード比較分析","status":"todo","children":[
    {"id":"3a","label":"目的とゴールの実装反映確認","status":"todo"},
    {"id":"3b","label":"アーキテクチャの実装一致確認","status":"todo"},
    {"id":"3c-1","label":"型・API・依存関係の確認","status":"todo"},
    {"id":"3c-2","label":"テスト・エラー処理・設定の確認","status":"todo"}
  ]},
  {"id":"4","label":"機械的フィルタリング","status":"todo"},
  {"id":"5","label":"発見漏れ確認","status":"todo"},
  {"id":"6","label":"最終検証","status":"todo","children":[
    {"id":"6a","label":"スキーマ検証","status":"todo"},
    {"id":"6b","label":"犯罪点検","status":"todo"}
  ]},
  {"id":"7","label":"完了報告","status":"todo"}
];

const SKELETON_STEPS_CHECK_FINAL = [
  {"id":"1","label":"スケルトン生成","status":"done","children":[
    {"id":"1a","label":"OMISSIONS番号採番","status":"done"},
    {"id":"1b","label":"雛形JSON書き出し","status":"done"}
  ]},
  {"id":"2","label":"RFC理解","status":"todo","children":[
    {"id":"2a-1","label":"目的とゴールの把握","status":"todo"},
    {"id":"2a-2","label":"メタ情報の記録","status":"todo"},
    {"id":"2b","label":"アーキテクチャ把握","status":"todo"},
    {"id":"2c-1","label":"実装詳細（型・API・依存）","status":"todo"},
    {"id":"2c-2","label":"実装詳細（テスト・エラー処理・設定）","status":"todo"},
    {"id":"2-review","label":"RFC理解の全体確認","status":"todo"}
  ]},
  {"id":"3","label":"ソースコード比較分析","status":"todo","children":[
    {"id":"3a","label":"目的とゴールの実装反映確認","status":"todo"},
    {"id":"3b","label":"アーキテクチャの実装一致確認","status":"todo"},
    {"id":"3c-1","label":"型・API・依存関係の確認","status":"todo"},
    {"id":"3c-2","label":"テスト・エラー処理・設定の確認","status":"todo"}
  ]},
  {"id":"4","label":"機械的フィルタリング","status":"todo"},
  {"id":"5","label":"発見漏れ確認","status":"todo"},
  {"id":"6","label":"最終検証","status":"todo","children":[
    {"id":"6a","label":"スキーマ検証","status":"todo"},
    {"id":"6b","label":"犯罪点検","status":"todo"}
  ]},
  {"id":"7","label":"完了報告","status":"todo"},
  {"id":"8","label":"OMISSIONS照合","status":"todo"},
  {"id":"9","label":"全チケット確認","status":"todo"},
  {"id":"10","label":"最終結果報告","status":"todo"}
];

function extractTitle(rfcPath) {
  const content = fs.readFileSync(rfcPath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^#\s+(.+)/);
    if (m) return m[1].trim();
  }
  return path.basename(rfcPath, ".md");
}

function findNextNumber(rfcDir) {
  let max = 0;
  if (!fs.existsSync(rfcDir)) return 1;
  for (const f of fs.readdirSync(rfcDir)) {
    const m = f.match(OMISSION_FILE_RE);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return max + 1;
}

function createSkeleton(rfcPath, isCheckFinal) {
  const resolved = path.resolve(rfcPath);
  const rfcDir = path.dirname(resolved);
  const nextNum = findNextNumber(rfcDir);
  const padded = String(nextNum).padStart(3, "0");
  const omPath = path.join(rfcDir, "OMISSIONS-" + padded + ".json");
  const now = new Date();
  const dateStr = now.getFullYear() + "-" +
    String(now.getMonth()+1).padStart(2,"0") + "-" +
    String(now.getDate()).padStart(2,"0");

  const skeleton = {
    parentRfcPath: resolved, parentRfcTitle: extractTitle(rfcPath),
    generatedAt: dateStr, summary: "",
    rfcUnderstanding: {
      purpose:"", goals:"", successCriteria:"", nonScope:"",
      architecture:"", componentRelations:"", designDecisions:"",
      typeDefinitions:"", apiSignatures:"", dependencyGraph:"",
      externalDependencies:"", testRequirements:"", errorHandling:"",
      configuration:""
    },
    omissions: [],
    steps: isCheckFinal ? SKELETON_STEPS_CHECK_FINAL : SKELETON_STEPS
  };

  fs.writeFileSync(omPath, JSON.stringify(skeleton, null, 2) + "\n");
  try {
    const { validateOmissions } = require("../lib/validate-omissions");
    const r = validateOmissions(skeleton);
    if (!r.valid) { fs.unlinkSync(omPath); return { success:false, error:"Validation failed", errors:r.errors }; }
  } catch(e) { fs.unlinkSync(omPath); return { success:false, error:"Validation error: "+e.message }; }

  return { success:true, path:rfcDir, omissionsFilePath:omPath, nextNumber:nextNum };
}

function main() {
  const p = process.argv[2];
  const isCheckFinal = process.argv[3] === '--check-final';
  if (!p) { console.log(JSON.stringify({success:false,error:"Usage: node create-omissions.js <RFC_FILE_PATH> [--check-final]"})); process.exit(1); }
  const r = path.resolve(p);
  if (!fs.existsSync(r)) { console.log(JSON.stringify({success:false,error:"RFC not found: "+p})); process.exit(1); }
  const result = createSkeleton(r, isCheckFinal);
  if (!result.success) { console.log(JSON.stringify(result)); process.exit(1); }
  console.log(JSON.stringify(result)); process.exit(0);
}

if (require.main === module) main();
module.exports = { createSkeleton };
