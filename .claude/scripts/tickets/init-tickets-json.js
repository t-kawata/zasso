/**
 * init-tickets-json.js — Tickets.json スケルトンを RFC から生成
 *
 * 次世代RFC（NEXT_RFC.md）のパスを受け取り、セクション見出しを抽出して
 * Tickets.json のスケルトンを生成する。write-tickets-json-template.js に委譲。
 *
 * 使用法:
 *   node init-tickets-json.js <PATH to Tickets.json> <PATH to NEXT_RFC.md>
 *
 * 終了コード:
 *   0 — 成功
 *   1 — 引数不足またはファイル不在
 *   2 — スケルトン生成失敗（スキーマ検証エラー等）
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function extractSectionHeadings(rfcPath) {
  const content = fs.readFileSync(rfcPath, "utf8");
  const headings = [];
  // h1-h3 の Markdown 見出しを抽出（#~### の行）
  const re = /^#{1,3}\s+(.+)$/gm;
  let match;
  while ((match = re.exec(content)) !== null) {
    headings.push(match[1].trim());
  }
  return headings;
}

function generateAnalyzedSections(rfcPath) {
  const headings = extractSectionHeadings(rfcPath);
  if (headings.length > 0) {
    return headings.join(", ");
  }
  // 見出しがなければファイル名をフォールバックに
  return path.basename(rfcPath, path.extname(rfcPath));
}

function main() {
  const ticketsPath = process.argv[2];
  const rfcPath = process.argv[3];

  if (!ticketsPath || !rfcPath) {
    console.error(
      "Usage: node init-tickets-json.js <PATH to Tickets.json> <PATH to NEXT_RFC.md>",
    );
    process.exit(1);
  }

  const resolvedRfcPath = path.resolve(rfcPath);
  if (!fs.existsSync(resolvedRfcPath)) {
    console.error("Error: RFC file not found: " + resolvedRfcPath);
    process.exit(1);
  }

  const now = new Date();
  const generatedAt =
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0");

  const rfcName = path.basename(resolvedRfcPath, path.extname(resolvedRfcPath));
  const analyzedSections = generateAnalyzedSections(resolvedRfcPath);

  const graphPath = resolvedRfcPath.replace(/\.md$/, '-GRAPH.json');
  const dirsTreePath = resolvedRfcPath.replace(/\.md$/, '-Dirs-Tree.json');

  const metadata = JSON.stringify({
    title: rfcName + " 実装チケット分解設計書",
    source: resolvedRfcPath,
    generatedAt: generatedAt,
    analyzedSections: analyzedSections,
    resolvedPaths: {
      rfcPath: resolvedRfcPath,
      graphPath: graphPath,
      dirsTreePath: dirsTreePath,
    },
  });

  const templateScript = path.join(
    path.dirname(process.argv[1]),
    "write-tickets-json-template.js",
  );
  const result = spawnSync(process.execPath, [templateScript, ticketsPath, metadata], {
    stdio: ["inherit", "pipe", "pipe"],
    encoding: "utf8",
  });

  if (result.status !== 0) {
    console.error("Error: Failed to generate Tickets.json skeleton");
    if (result.stderr) console.error(result.stderr);
    process.exit(2);
  }

  // write-tickets-json-template.js の stdout をそのまま通す
  process.stdout.write(result.stdout);
}

if (require.main === module) main();
module.exports = { main, extractSectionHeadings, generateAnalyzedSections };
