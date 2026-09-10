#!/usr/bin/env node
/**
 * generate-checklist.js <rfc-dir>
 *
 * Reads DesignTree.json and generates CheckList.md in a section-by-node two-tier structure.
 * Backs up the existing CheckList.md before overwriting.
 *
 * Output format:
 *   ## §N <top-level node title>
 *   - [ ] Section is fully described
 *   - [ ] Code snippets are included
 *   - [ ] No TBD/TODO/"deferred to future version" expressions remain
 *
 *   ### §N.M <child node title>
 *   - [ ] <child node title> is described in the design
 *   - [ ] Code snippets are included
 *   - [ ] No TBD/TODO/"deferred to future version" expressions remain
 *
 * After generation, AI must visually inspect and add supplementary notes (as stated in the command definition).
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

// Backup existing CheckList.md (skipped when --no-backup is specified)
if (fs.existsSync(checklistPath) && !noBackup) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = checklistPath.replace(/\.md$/, `.${ts}.bak.md`);
  fs.copyFileSync(checklistPath, backup);
  console.error(`Backed up existing CheckList.md → ${path.basename(backup)}`);
}

// --- Generate Markdown from nodes ---

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
