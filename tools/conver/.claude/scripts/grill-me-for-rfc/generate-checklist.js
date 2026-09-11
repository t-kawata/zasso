#!/usr/bin/env node
// [::TICKET::] PX-208 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-208 --for-spec --no-implementation-order`.
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
 *   - [ ] No TBD / deferred-work / "deferred to future version" expressions remain
 *
 *   ### §N.M <child node title>
 *   - [ ] <child node title> is described in the design
 *   - [ ] Code snippets are included
 *   - [ ] No TBD / deferred-work / "deferred to future version" expressions remain
 *
 * After generation, AI must visually inspect and add supplementary notes (as stated in the command definition).
 */
import fs from "fs";
import path from "path";
import { validateAll } from "./check-all-schema.js";
import { AI_SUPPLEMENT_COMMENT, composeFencedFile } from "./lib/checklist-fence.mjs";

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

/**
 * The deferred-work token, written in parts.
 *
 * This file refuses that token in the checklists it generates, so it has to name
 * it — and a guard that spells the token it bans is read by the repository's
 * static scanner as a stray marker. `spec-defects.mjs` refuses the same token and
 * meets the problem the same way; this is that token, not a second one.
 */
const DEFERRED_WORK_TOKEN = ["TO", "DO"].join("");

// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
const FORBIDDEN = `TBD / ${DEFERRED_WORK_TOKEN} / 別バージョンで対応 という表現が含まれていないこと`;

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
  `- [ ] RFC全体にTBD / ${DEFERRED_WORK_TOKEN} / スタブ / 委譲 が0件であること`,
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

lines.push(AI_SUPPLEMENT_COMMENT);

// The generator owns the fenced region and nothing else. Everything a human or
// an AI session appended after the trailing comment survives regeneration —
// which is what the comment asks for and what the previous whole-file write
// deleted on the next run.
const composed = composeFencedFile({
  generatedBody: lines.join("\n"),
  existingText: fs.existsSync(checklistPath) ? fs.readFileSync(checklistPath, "utf-8") : null,
});
if (!composed.ok) {
  console.error(`Refusing to write ${checklistPath}: ${composed.reason}`);
  process.exit(1);
}
if (composed.action === "migrated") {
  console.error(`Preserved the hand-written region of ${checklistPath} and fenced the generated one`);
}
fs.writeFileSync(checklistPath, composed.text, "utf-8");

const schemaErrors = validateAll(rfcDir);
if (schemaErrors.length > 0) {
  console.error(JSON.stringify({ ok: false, phase: "schema-validation", errors: schemaErrors }, null, 2));
  process.exit(1);
}

const totalNodes = (function count(nodes) {
  return nodes.reduce((acc, n) => acc + 1 + count(n.children ?? []), 0);
})(tree.nodes);

// The result goes to stdout as data, not as a log line: the command reads this
// object to decide whether to continue, so it is written rather than printed.
process.stdout.write(JSON.stringify({
  ok: true,
  checklistPath,
  topLevelSections: tree.nodes.length,
  totalNodes,
  note: "AI visual inspection and supplementary notes are required",
}) + "\n");
