#!/usr/bin/env node
/**
 * init-for-grill-me-for-next-rfc.js <research-path> <rfc-output-file-path>
 *
 * /grill-me-for-next-rfc-ja 専用の初期化ラッパー。
 *
 * 以下の順で処理する：
 *
 *   1. 親RFCのパスを OMISSIONS JSON から読み取り、安全確認に使用する
 *   2. 前回セッションのファイルとRFC出力ファイルを grills/<RFC名>/ に退避（mv）
 *   3. init.js を子プロセス実行
 *
 * 【安全機構】退避対象が親RFC（RFC_ROOT.md 等）と同一ファイルの場合は
 * エラー終了する。これにより親RFCが誤って退避される事故を防止する。
 *
 * 【出力】
 *   退避あり: {"evacuated":true,"dir":"<grillsディレクトリの絶対パス>"}
 *   退避なし: {"evacuated":false,"dir":null}
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();
const researchPath = process.argv[2];
const rfcOutputPath = process.argv[3];

// --- 安全機構: 親RFCのパスを取得 ---
let parentRfcPath = null;
try {
  const omPath = path.resolve(researchPath);
  if (fs.existsSync(omPath)) {
    const om = JSON.parse(fs.readFileSync(omPath, "utf-8"));
    parentRfcPath = om.parentRfcPath
      ? path.resolve(om.parentRfcPath)
      : null;
  }
} catch {
  // OMISSIONS JSON が読めなくても処理は続行（安全確認が一部制限されるのみ）
}

// --- 退避対象リスト ---
const rfcBasename = path.basename(path.resolve(rfcOutputPath), ".md");
const resolvedRfcPath = path.resolve(rfcOutputPath);
const targetFiles = [
  "Status.json",
  "DesignTree.json",
  "CheckList.md",
  path.basename(resolvedRfcPath),
];

// --- 安全機構: 親RFCの退避を防止 ---
if (
  parentRfcPath &&
  resolvedRfcPath === parentRfcPath
) {
  console.error(
    `エラー: 出力先パス "${rfcOutputPath}" は親RFC（${path.basename(parentRfcPath)}）と同一です。` +
    "出力先には親RFCと異なるパスを指定してください。",
  );
  process.exit(1);
}

// --- 退避実行 ---
let grillDir = null;
const hasOldFiles = targetFiles.some((f) =>
  fs.existsSync(path.join(cwd, f)),
);

if (hasOldFiles) {
  grillDir = path.join(cwd, "grills", rfcBasename);
  fs.mkdirSync(grillDir, { recursive: true });
  for (const file of targetFiles) {
    const src = path.join(cwd, file);
    if (fs.existsSync(src)) {
      fs.renameSync(src, path.join(grillDir, file));
    }
  }
}

// --- init.js 実行 ---
const initScript = path.join(__dirname, "init.js");
const result = spawnSync(
  "node",
  [initScript, researchPath, rfcOutputPath],
  // init.js の stdout は抑制（ノイズ）、stderr は継承（エラー可視化）
  { stdio: ["inherit", "pipe", "inherit"], encoding: "utf-8" },
);
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// --- 退避結果出力 ---
console.log(JSON.stringify({ evacuated: hasOldFiles, dir: grillDir }));
