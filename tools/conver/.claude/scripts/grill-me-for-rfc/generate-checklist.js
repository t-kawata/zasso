#!/usr/bin/env node
/**
 * generate-checklist.js <rfc-dir>
 *
 * DesignTree.json を読み込み、CheckList.md をセクション×ノードの2段構造で生成する。
 * 既存の CheckList.md はバックアップしてから上書きする。
 *
 * 出力フォーマット:
 *   ## §N <トップレベルノードのtitle>
 *   - [ ] セクションが完全に記述されている
 *   - [ ] コードスニペットが含まれている
 *   - [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと
 *
 *   ### §N.M <子ノードのtitle>
 *   - [ ] <子ノードのtitle> が設計として記述されている
 *   - [ ] コードスニペットが含まれている
 *   - [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと
 *
 * ★ 生成後、AIが目視チェックして補足事項を追記すること（コマンド定義に明記済み）。
 */
import fs from "fs";
import path from "path";
import { validateAll } from "./check-all-schema.js";

const rfcDir = path.resolve(process.argv[2] ?? ".");
const noBackup = process.argv.includes("--no-backup");
const treePath = path.join(rfcDir, "DesignTree.json");
const checklistPath = path.join(rfcDir, "CheckList.md");

if (!fs.existsSync(treePath)) {
  console.error(`DesignTree.json not found: ${treePath}`);
  process.exit(1);
}

const tree = JSON.parse(fs.readFileSync(treePath, "utf-8"));

// 既存 CheckList.md をバックアップ（--no-backup 指定時はスキップ）
if (fs.existsSync(checklistPath) && !noBackup) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = checklistPath.replace(/\.md$/, `.${ts}.bak.md`);
  fs.copyFileSync(checklistPath, backup);
  console.error(`Backed up existing CheckList.md → ${path.basename(backup)}`);
}

// --- ノードから Markdown を生成 ---

const FORBIDDEN = "TBD / TODO / 別バージョンで対応 という表現が含まれていないこと";

function nodeChecks(title) {
  return [
    `- [ ] **${title}** が設計として完全に記述されている`,
    `- [ ] コードスニペットが含まれている`,
    `- [ ] ${FORBIDDEN}`,
  ].join("\n");
}

function sectionChecks() {
  return [
    `- [ ] セクション全体が完全に記述されている`,
    `- [ ] コードスニペットが含まれている`,
    `- [ ] ${FORBIDDEN}`,
  ].join("\n");
}

function renderChildren(children, sectionPrefix, depth) {
  if (!children?.length) return "";
  return children.map((child, i) => {
    const prefix = `${sectionPrefix}.${i + 1}`;
    const heading = `${"#".repeat(depth)} §${prefix} ${child.title}`;
    const statusBadge = child.status === "resolved" ? " ✅" : " 🔲";
    const checks = nodeChecks(child.title);
    const sub = renderChildren(child.children, prefix, depth + 1);
    return `${heading}${statusBadge}\n\n${checks}\n${sub}`;
  }).join("\n\n");
}

const lines = [
  `# RFC 要件チェックリスト`,
  ``,
  `> **⚠️ このファイルはスクリプトにより自動生成された雛形です。**`,
  `> AIが目視チェックし、補足事項・プロジェクト固有の制約を追記してから使用すること。`,
  ``,
  `生成日時: ${new Date().toISOString()}`,
  `DesignTree バージョン: ${tree.version ?? 1}`,
  ``,
  `---`,
  ``,
  `## 全体チェック`,
  ``,
  `- [ ] RFC全体にTBD / TODO / スタブ / 委譲 が0件であること`,
  `- [ ] 全セクションにコードスニペットが含まれていること`,
  `- [ ] DesignTreeの全ノードがRFCのいずれかのセクションに対応していること`,
  ``,
  `---`,
  ``,
];

tree.nodes.forEach((node, i) => {
  const sectionNum = i + 1;
  const statusBadge = node.status === "resolved" ? " ✅" : " 🔲";
  lines.push(`## §${sectionNum} ${node.title}${statusBadge}`);
  lines.push(``);
  lines.push(sectionChecks());
  lines.push(``);
  if (node.children?.length) {
    lines.push(renderChildren(node.children, `${sectionNum}`, 3));
    lines.push(``);
  }
  lines.push(`---`);
  lines.push(``);
});

lines.push(`<!-- AI補足欄: 上記チェック項目に加え、プロジェクト固有の制約・注意事項をここに追記すること -->`);

fs.writeFileSync(checklistPath, lines.join("\n"), "utf-8");

const schemaErrors = validateAll(rfcDir);
if (schemaErrors.length > 0) {
  console.error(JSON.stringify({ ok: false, phase: "schema-validation", errors: schemaErrors }, null, 2));
  process.exit(1);
}

const totalNodes = (function count(nodes) {
  return nodes.reduce((acc, n) => acc + 1 + count(n.children ?? []), 0);
})(tree.nodes);

console.log(JSON.stringify({
  ok: true,
  checklistPath,
  topLevelSections: tree.nodes.length,
  totalNodes,
  note: "AI visual inspection and supplementary notes are required",
}));
