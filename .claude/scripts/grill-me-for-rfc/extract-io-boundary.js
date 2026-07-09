#!/usr/bin/env node
/**
 * extract-io-boundary.js <rfc-file>
 *
 * RFC ファイルから「graphify-rfc + boundify-graph-to-dirs のための参考情報 — RFC設計書が示す I/O 境界の手がかり」
 * セクションを抽出して stdout に出力する。
 *
 * 抽出できなかった場合は空出力 + exit 0（エラーではなく「情報がない」だけ）。
 */
import fs from "node:fs";
import path from "node:path";

const RFC_PATH = process.argv[2];
if (!RFC_PATH) {
  console.error("Usage: extract-io-boundary.js <rfc-file>");
  process.exit(1);
}

const resolvedPath = path.resolve(RFC_PATH);
if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: RFC file not found: ${resolvedPath}`);
  process.exit(1);
}

const content = fs.readFileSync(resolvedPath, "utf-8");
const lines = content.split("\n");

// I/O 境界セクションのタイトルを検出
// 形式: ## <N>. graphify-rfc + boundify-graph-to-dirs のための参考情報 ...
const SECTION_TITLE_MARKER = "graphify-rfc + boundify-graph-to-dirs のための参考情報";
const SECTION_PATTERN = new RegExp(`^## \\d+\\.\\s+${escapeRegex(SECTION_TITLE_MARKER)}`);

let sectionStartIndex = -1;
for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
  if (SECTION_PATTERN.test(lines[lineIndex])) {
    sectionStartIndex = lineIndex;
    break;
  }
}

if (sectionStartIndex === -1) {
  // I/O 境界セクションなし
  process.exit(0);
}

// 次の ## レベル見出しまでを抽出
let sectionEndIndex = lines.length;
for (let lineIndex = sectionStartIndex + 1; lineIndex < lines.length; lineIndex++) {
  if (/^## \d/.test(lines[lineIndex])) {
    sectionEndIndex = lineIndex;
    break;
  }
}

const sectionLines = lines.slice(sectionStartIndex, sectionEndIndex);
console.log(sectionLines.join("\n"));

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
