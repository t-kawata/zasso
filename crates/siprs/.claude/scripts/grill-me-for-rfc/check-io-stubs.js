#!/usr/bin/env node
/**
 * check-io-stubs.js <rfc-file>
 *
 * RFC ファイル内に [::IO-INFO-STUB::] マーカーが残存していないか検証する。
 * マーカーが 0 件 → exit 0（正常）
 * マーカーが 1 件以上 → exit 1（未記入）
 */
import fs from "node:fs";
import path from "node:path";

const RFC_PATH = process.argv[2];
if (!RFC_PATH) {
  console.error("Usage: check-io-stubs.js <rfc-file>");
  process.exit(1);
}

const resolvedPath = path.resolve(RFC_PATH);
if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: RFC file not found: ${resolvedPath}`);
  process.exit(1);
}

const content = fs.readFileSync(resolvedPath, "utf-8");
const lines = content.split("\n");

const stubPattern = /\[::IO-INFO-STUB::\]/;
const foundLines = [];

for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
  const match = lines[lineIndex].match(stubPattern);
  if (match) {
    foundLines.push({ line: lineIndex + 1, text: lines[lineIndex].trim() });
  }
}

if (foundLines.length === 0) {
  console.log(JSON.stringify({ ok: true, count: 0 }));
  process.exit(0);
} else {
  console.error(JSON.stringify({
    ok: false,
    count: foundLines.length,
    stubs: foundLines,
    message: `Found ${foundLines.length} remaining [::IO-INFO-STUB::] marker(s). AI must replace them with actual content before completion declaration.`,
  }, null, 2));
  process.exit(1);
}
