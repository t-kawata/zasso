#!/usr/bin/env node
// scripts/generate-favicons.mjs
//
// editions.json からカレントエディションのソース画像を読み取り、
// Quasar（フロントエンド）用 favicon PNG を fe/public/icons/ に生成する。
//
// 環境変数:
//   EDITION_SLUG   — エディション名（例: zasso, mycute, neco-asovi）
//
// 依存: fe/node_modules/sharp（クロスプラットフォーム画像処理）

import { readFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createRequire } from "module";

// sharp は fe/node_modules にインストールされているため、createRequire で fe/ を起点に解決する
const feRequire = createRequire(resolve(import.meta.dirname, "..", "fe", "package.json"));
const sharp = feRequire("sharp");

// ──────────────────────────────────────────────
//  設定
// ──────────────────────────────────────────────
const FAVICON_SIZES = [
  { width: 16, height: 16, name: "favicon-16x16.png" },
  { width: 32, height: 32, name: "favicon-32x32.png" },
  { width: 96, height: 96, name: "favicon-96x96.png" },
  { width: 128, height: 128, name: "favicon-128x128.png" },
];

const ROOT = resolve(import.meta.dirname, "..");
const EDITIONS_JSON = resolve(ROOT, "editions.json");
const OUTPUT_DIR = resolve(ROOT, "fe/public/icons");

// ──────────────────────────────────────────────
//  エディションの icon_path を editions.json から取得
// ──────────────────────────────────────────────
function resolveIconPath() {
  const edition = process.env.EDITION_SLUG || "zasso";
  const editions = JSON.parse(readFileSync(EDITIONS_JSON, "utf-8"));
  const entry = editions[edition];
  if (!entry || !entry.icon_path) {
    console.error(
      `\x1b[31mError: icon_path not found for edition '${edition}' in editions.json\x1b[0m`,
    );
    process.exit(1);
  }
  const fullPath = resolve(ROOT, entry.icon_path);
  if (!existsSync(fullPath)) {
    console.error(`\x1b[31mError: Source icon not found at ${fullPath}\x1b[0m`);
    process.exit(1);
  }
  return fullPath;
}

// ──────────────────────────────────────────────
//  sharp を用いたクロスプラットフォーム favicon 生成
// ──────────────────────────────────────────────
async function generateFavicons(sourcePath) {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const { width, height, name } of FAVICON_SIZES) {
    const outPath = resolve(OUTPUT_DIR, name);
    await sharp(sourcePath).resize(width, height).toFile(outPath);
    console.log(`  Generated: ${name} (${width}x${height})`);
  }

  console.log("\x1b[32mFavicon generation complete.\x1b[0m");
}

// ──────────────────────────────────────────────
//  エントリポイント
// ──────────────────────────────────────────────
const sourcePath = resolveIconPath();
console.log(`  Source: ${sourcePath}`);
await generateFavicons(sourcePath);
