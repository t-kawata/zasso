const fs = require("fs"), path = require("path");
const LABELS = {
  purpose:"目的", goals:"目標", successCriteria:"成功条件", nonScope:"非スコープ",
  architecture:"アーキテクチャ概要", componentRelations:"コンポーネント間関係",
  designDecisions:"設計判断", typeDefinitions:"型定義",
  apiSignatures:"APIシグネチャ", dependencyGraph:"依存関係グラフ",
  externalDependencies:"外部依存", testRequirements:"テスト要件",
  errorHandling:"エラー処理", configuration:"設定"
};
function show(rfcU) {
  const lines = [["","RFC 理解サマリー",""].join("=".repeat(30))];
  for (const [k,label] of Object.entries(LABELS)) {
    lines.push("","["+label+"]", (rfcU&&rfcU[k])||"(未記入)");
  }
  return lines.join("\n");
}
function main() {
  const fp = process.argv[2];
  if (!fp) { console.log(JSON.stringify({success:false,error:"Usage: node show-omissions-rfc-understanding.js <PATH>"})); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(path.resolve(fp),"utf8"));
  console.log(show(data.rfcUnderstanding));
  const filled = Object.keys(data.rfcUnderstanding||{}).filter(k=>data.rfcUnderstanding[k]).length;
  console.error(JSON.stringify({success:true, filled, total:Object.keys(LABELS).length}));
}
if (require.main === module) main();
module.exports = { show };
