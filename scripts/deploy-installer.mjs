#!/usr/bin/env node
// scripts/deploy-installer.mjs
//
// cargo tauri build 完了後にインストーラー成果物を検証し、
// dist/<os>/v<version>/ に所定の命名規則で配置する。
//
// 環境変数:
//   EDITION_SLUG  — エディション名（make build から自動設定）
//   OS_TYPE       — OS 種別（macos/linux/windows、Makefile から自動設定）

import { readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { resolve } from "path";

// ──────────────────────────────────────────────
//  バージョン情報を settings.rs から抽出
// ──────────────────────────────────────────────
function readAppVersion() {
  const settingsPath = resolve("src-tauri/src/consts/settings.rs");
  const content = readFileSync(settingsPath, "utf-8");
  const match = content.match(/APP_VERSION:\s*&str\s*=\s*"(?<ver>[^"]+)"/);
  if (!match?.groups?.ver) {
    console.error("\x1b[1;31mError: APP_VERSION not found in settings.rs\x1b[0m");
    process.exit(1);
  }
  const raw = match.groups.ver; // "v0.24.237"
  return { raw, clean: raw.replace(/^v/, "") };
}

// ──────────────────────────────────────────────
//  プラットフォーム情報の判定
// ──────────────────────────────────────────────
function detectPlatform() {
  const platform = process.platform; // darwin / win32 / linux
  const archRaw = process.arch;      // arm64 / x64

  let osType, bundleType, ext;
  let arch;
  switch (platform) {
    case "darwin":
      osType = "mac";
      bundleType = "dmg";
      ext = ".dmg";
      arch = archRaw === "arm64" ? "aarch64" : "x86_64";
      break;
    case "win32":
      osType = "win";
      bundleType = "nsis";
      ext = ".exe";
      arch = "x64";
      break;
    case "linux":
      osType = "linux";
      bundleType = "appimage";
      ext = ".AppImage";
      arch = archRaw === "arm64" ? "aarch64" : "x86_64";
      break;
    default:
      console.error(`\x1b[1;31mError: Unsupported platform: ${platform}\x1b[0m`);
      process.exit(1);
  }

  return { osType, bundleType, ext, arch };
}

// ──────────────────────────────────────────────
//  インストーラーファイルの発見
// ──────────────────────────────────────────────
function findInstaller(bundleType, ext) {
  const bundleDir = resolve(`src-tauri/target/release/bundle/${bundleType}`);
  if (!existsSync(bundleDir)) {
    console.error(`\x1b[1;31mError: Bundle directory not found at ${bundleDir}\x1b[0m`);
    process.exit(1);
  }

  const files = readdirSync(bundleDir).filter((file) => file.endsWith(ext));
  if (files.length === 0) {
    console.error(
      `\x1b[1;31mError: No installer file (*${ext}) found in ${bundleDir}\x1b[0m`,
    );
    process.exit(1);
  }

  // 複数ある場合は最初のものを採用（通常は1つのみ）
  const installer = files[0];
  return resolve(bundleDir, installer);
}

// ──────────────────────────────────────────────
//  dist へのコピー
// ──────────────────────────────────────────────
function deployInstaller(sourcePath, osType, editionSlug, version, arch, ext) {
  const dir = resolve("dist", osType, version);
  const destName = `${osType}-${editionSlug}-${version}-${arch}${ext}`;
  const destPath = resolve(dir, destName);

  mkdirSync(dir, { recursive: true });
  copyFileSync(sourcePath, destPath);

  if (!existsSync(destPath)) {
    console.error(`\x1b[1;31mError: Failed to copy installer to ${destPath}\x1b[0m`);
    process.exit(1);
  }

  return destPath;
}

// ──────────────────────────────────────────────
//  エディション slug の取得
// ──────────────────────────────────────────────
function getEditionSlug() {
  return process.env.EDITION_SLUG || "zasso";
}

// ──────────────────────────────────────────────
//  エントリポイント
// ──────────────────────────────────────────────
const version = readAppVersion();
const { osType, bundleType, ext, arch } = detectPlatform();
const editionSlug = getEditionSlug();

console.log(`  Deploying installer for ${editionSlug} ${version.raw} (${osType}/${arch})...`);

const installerPath = findInstaller(bundleType, ext);
console.log(`  Found installer: ${installerPath}`);

const deployedPath = deployInstaller(
  installerPath, osType, editionSlug, version.raw, arch, ext,
);

console.log(`\x1b[1;36m  ✅ Build and deploy complete: ${deployedPath}\x1b[0m`);
