const fs = require("fs"),
  path = require("path");
const TYPE_LABEL = {
  missing_implementation: "実装漏れ",
  incomplete_implementation: "実装不足",
  design_deviation: "設計不一致",
  bug: "バグ",
  stub_remaining: "スタブ残存",
  test_missing: "テスト欠落",
  inconsistency: "不整合",
};
const SEV = { critical: "!!!", high: "!!", medium: "!", low: "" };
const RU_LABEL = {
  purpose: "目的",
  goals: "目標",
  successCriteria: "成功条件",
  nonScope: "非スコープ",
  architecture: "アーキテクチャ概要",
  componentRelations: "コンポーネント間関係",
  designDecisions: "設計判断",
  typeDefinitions: "型定義",
  apiSignatures: "APIシグネチャ",
  dependencyGraph: "依存関係グラフ",
  externalDependencies: "外部依存",
  testRequirements: "テスト要件",
  errorHandling: "エラー処理",
  configuration: "設定",
};

function convert(omPath) {
  const rp = path.resolve(omPath);
  if (!fs.existsSync(rp))
    return { success: false, error: "Not found: " + omPath };
  let d;
  try {
    d = JSON.parse(fs.readFileSync(rp, "utf8"));
  } catch (e) {
    return { success: false, error: "Invalid JSON" };
  }
  const dir = path.dirname(rp),
    base = path.basename(rp, ".json"),
    mdPath = path.join(dir, base + ".md");
  const L = [];
  L.push("# " + base, "", "> 生成元: `" + rp + "`", "");
  if (d.parentRfcPath) L.push("- **親RFC**: " + d.parentRfcPath);
  if (d.parentRfcTitle) L.push("- **タイトル**: " + d.parentRfcTitle);
  if (d.generatedAt) L.push("- **生成日**: " + d.generatedAt);
  if (d.summary) L.push("- **サマリ**: " + d.summary);
  L.push("");
  if (d.rfcUnderstanding && Object.values(d.rfcUnderstanding).some((v) => v)) {
    L.push("## RFC 理解", "");
    for (const [k, label] of Object.entries(RU_LABEL)) {
      if (d.rfcUnderstanding[k])
        L.push("### " + label, "", d.rfcUnderstanding[k], "");
    }
  }
  if (d.omissions && d.omissions.length > 0) {
    L.push("## 漏れ・矛盾・不足 (" + d.omissions.length + "件)", "");
    for (const o of d.omissions) {
      const tl = TYPE_LABEL[o.type] || o.type,
        sv = SEV[o.severity] || "",
        sec = o.rfcSection ? " §" + o.rfcSection : "";
      L.push(
        "### " + o.id + " " + sv + " [" + tl + "]" + sec,
        "",
        o.description,
        "",
      );
      if (o.details) L.push("**詳細**: " + o.details);
      if (o.affectedFiles && o.affectedFiles.length > 0) {
        L.push("", "**該当ファイル**:");
        for (const af of o.affectedFiles) L.push("- `" + af + "`");
      }
      if (o.suggestedResolution)
        L.push("", "**解決方法**: " + o.suggestedResolution);
      if (o.resolvedInNextRfc) L.push("", "→ 次RFCで解決");
      L.push("---", "");
    }
  } else {
    L.push("_漏れ・矛盾・不足は発見されませんでした。_", "");
  }
  if (d.steps && d.steps.length > 0) {
    L.push(
      "## 漏れ・矛盾・不足の発見作業の進捗",
      "",
      "| Step | 状態 |",
      "|------|------|",
    );
    (function walk(s, indent) {
      for (const x of s || []) {
        const em =
          x.status === "done" ? "✅" : x.status === "in_progress" ? "🔄" : "⬜";
        L.push(
          "| " +
            indent +
            x.id +
            ": " +
            x.label +
            " | " +
            em +
            " " +
            x.status +
            " |",
        );
        if (x.children) walk(x.children, indent + "  ");
      }
    })(d.steps, "");
    L.push("");
  }
  fs.writeFileSync(mdPath, L.join("\n"));
  return { success: true, mdFilePath: mdPath };
}
function main() {
  const fp = process.argv[2];
  if (!fp) {
    console.log(
      JSON.stringify({
        success: false,
        error:
          "Usage: node convert-omissions-to-markdown.js <OMISSIONS_FILE_PATH>",
      }),
    );
    process.exit(1);
  }
  const r = convert(fp);
  if (!r.success) {
    console.log(JSON.stringify(r));
    process.exit(1);
  }
  console.log(JSON.stringify(r));
  process.exit(0);
}
if (require.main === module) main();
module.exports = { convert };
