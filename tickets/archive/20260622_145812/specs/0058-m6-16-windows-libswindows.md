---
ticket_id: 58
title: M6-1.6 Windows: libs/windows/ ランタイムライブラリ収集
slug: m6-16-windows-libswindows
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
plan_path: C:\Users\kawat\shyme\zasso\tickets\context\0058-m6-16-windows-libswindows\plan.md
implementation_path: C:\Users\kawat\shyme\zasso\tickets\context\0058-m6-16-windows-libswindows\implementation.md
review_report_path: C:\Users\kawat\shyme\zasso\tickets\context\0058-m6-16-windows-libswindows\review.md
---
# M6-1.6 Windows: libs/windows/ ランタイムライブラリ収集

## Summary

Windows で音声入力が動作するために必要な全ランタイム DLL（sherpa-onnx, SpeechHelper, VC++ 再頒布可能）を `libs/windows/` に自動収集する。voiput crate が `libs/` を開けば全て揃っている状態を保証する。

## Background

チケット M6-1（プリビルドライブラリ自動ビルド）の一部。macOS 側（M6-1.5）と対になる Windows 版のランタイムライブラリ収集ロジック。現在 `collect_runtime_libs_windows()`（`build.rs:722`）は既に実装済みだが、以下の課題が残っている:

1. sherpa-onnx DLL のコピー元パスが `OUT_DIR/../../..`（=`target/debug/`）に依存しており、バージョンや環境による変動への耐性が不明
2. `find_system_dll` の VS 再頒布可能ディレクトリ探索パスが不完全（x64 直下ではなく `x64/Microsoft.VC145.CRT/` が正しい）
3. `libs/windows/` の existence check で `panic!` すると全ビルドが止まるため、初回クローン時など DLL 不在時のエラーメッセージが不親切

## Scope

- `collect_runtime_libs_windows()` の堅牢性向上
- `find_system_dll()` の VS 再頒布可能ディレクトリ探索パス修正
- sherpa-onnx DLL のコピー元をより確実なソースに変更
- `libs/windows/` が初回不在時のエラーメッセージ改善
- 収集対象はチケット M6-1.6 の収集対象表「必須✅」に定義された 6 ファイル

## Non-scope

- C# Native AOT ビルドそのもの（`native/cs/build.ps1`）は M6-1 で対応済み
- SpeechHelper FFI の実装修正
- プロセスモニタや `ProcMon` によるロード確認（動作確認は cargo run --bin test-run で代替）
- `libs/macos/` 収集ロジック（M6-1.5）

## Investigation

### 調査日時
2026-06-12、Windows 11 (10.0.26200) にて実施。

### 現状の収集ロジック

`collect_runtime_libs_windows()`（`build.rs:722-776`）の流れ:
1. `target_dir = OUT_DIR/../../..` → `target/debug/` から sherpa-onnx の DLL 2 ファイルをコピー
2. `prebuilt/windows/SpeechHelper.dll` から SpeechHelper.dll をコピー
3. `find_system_dll()` で VC++ 再頒布可能 DLL 3 ファイルを System32 / VS redist からコピー
4. 6 ファイル全ての存在確認。1 つでも欠け → `panic!`

### 証拠 1: sherpa-onnx DLL の配置

```bash
$ find target -name "sherpa-onnx-c-api.dll"
target/debug/sherpa-onnx-c-api.dll                           # リンカがコピーしたもの
target/sherpa-onnx-prebuilt/sherpa-onnx-v1.13.2-.../lib/sherpa-onnx-c-api.dll  # オリジナル
```

`OUT_DIR/../../..` で解決される `target/debug/` に DLL が存在することを確認。このパスは cargo がリンク時に DLL をコピーする場所であり、現状動作している。（`build.rs:727-728`）

### 証拠 2: VC++ 再頒布可能 DLL の配置

```powershell
Test-Path 'C:\Windows\System32\vcruntime140.dll'   → True
Test-Path 'C:\Windows\System32\vcruntime140_1.dll'  → True
Test-Path 'C:\Windows\System32\msvcp140.dll'        → True
```

System32 に全 DLL が存在。`find_system_dll()` の第1パス（System32）で正しく検出されることを確認。

### 証拠 3: VS redist ディレクトリ構造

```
VC/Redist/MSVC/14.51.36231/
├── x64/Microsoft.VC145.CRT/vcruntime140.dll    ← 実際のパス
└── onecore/x64/Microsoft.VC145.CRT/vcruntime140.dll
```

`find_system_dll()` の第2パスは `entry.path().join("x64").join(dll_name)` を探索しているが、正しいパスは `entry.path().join("x64").join("Microsoft.VC145.CRT").join(dll_name)`。ただし System32 が優先されるため現状は動作に支障なし。（`build.rs:782-802`）

### 証拠 4: cargo clean の影響

```bash
$ cargo clean -p voiput
  Removed 1368 files, 1011.1MiB total
$ ls libs/windows/  # ファイル数変化なし（10 エントリ維持）
```

`libs/` は `target/` 外部（crate ルート直下）のため `cargo clean` では削除されない。設計動作を確認。（`build.rs:106` の `rerun-if-changed=libs/` により変更検出も機能）

### 証拠 5: 現状の libs/windows/ ファイル一覧

```bash
$ ls libs/windows/
SpeechHelper.dll         4674560 bytes  (Jun 12 10:31)  ← 実 .NET AOT バイナリ
msvcp140.dll              642720 bytes  (Apr  1 00:34)
onnxruntime.dll         16036864 bytes  (May 13 22:14)
sherpa-onnx-c-api.dll    4457472 bytes  (May 13 22:22)
vcruntime140.dll          178848 bytes  (Apr  1 00:34)
vcruntime140_1.dll         50256 bytes  (Apr  1 00:34)
```

6 ファイル全て存在。`cargo check` / `cargo test` / `cargo run --bin test-run` 全て通る。

### 証拠 6: main() の実行順序

```rust
// build.rs:79-106
// 1. ランタイムライブラリ収集（先）
collect_runtime_libs_windows(&manifest_dir);
// 2. プリビルドライブラリのリンク（後）
link_windows(&prebuilt);
```

Windows では `link_windows` が `libs/` を参照しないため、順序の影響はない。macOS との統一性のみ。

## Test Plan

### ユニットテスト計画

本チケットでテスト対象となるのは build.rs 内の関数群であり、**Rust の build script は通常の cargo test でテストできない**（別のビルドコンテキストで実行される）。そのため以下の方針とする:

| テスト対象 | 方法 | 検証内容 |
|-----------|------|---------|
| `collect_runtime_libs_windows()` の正常動作 | `cargo clean -p voiput` → `cargo check` | 全必須 DLL が `libs/windows/` に存在すること、panic しないこと |
| `find_system_dll()` の正常動作 | 上記に含まれる（内部的に実行される） | VC++ DLL が System32 からコピーされること |
| DLL 不在時のエラーハンドリング | テスト用 DLL 退避 → `cargo check` | `panic!` のメッセージに不足ファイル名が含まれること |
| `cargo clean` 耐性 | `cargo clean -p voiput` 前後で `libs/` を比較 | 削除されないこと |

### ユニットテスト不可能な項目（例外）

- 実機 Windows Speech 環境との結合テスト: ハードウェア/OS の音声認識機能に依存するため
- VS redist 探索パスの網羅: 全ての VS バージョン・エディションのインストールパターンをカバーするのは実質不可能なため、主要パターンのみカバー

## Boy Scout Rule — 翻訳可能性計画

1. `find_system_dll()` の変数名 `candidate` → 何の候補か分かりにくい。`system32_path` / `redist_path` に分割して明確化
2. `collect_runtime_libs_windows()` 内の `target_dir` → `OUT_DIR/../../..` の解決意図をコメントで明記（「target/debug/ または target/release/ の先」）
3. 必須 DLL リストはハードコードではなく設定定数として上部に抽出することを検討

## Acceptance Criteria

- [ ] `cargo clean -p voiput && cargo check` がエラーなく完了する
- [ ] `libs/windows/` に必須 6 DLL が全て存在する
- [ ] `cargo run --bin test-run` で `[WINDOWS]` セクションがスタブ動作として正常表示される
- [ ] `cargo test` で既存 111 テストが全てパスする
- [ ] `find_system_dll()` の VS redist 探索パスが正しいサブディレクトリ（`Microsoft.VC145.CRT/`）を考慮する
- [ ] `find_system_dll()` の変数名が意図を明確に伝える

## Notes

### 依存関係

- 親チケット: M6-1（プリビルドライブラリ自動ビルド）— ✅ 完了
- macOS 版: M6-1.5 — ✅ 完了
- 本チケット完了後: M6-2（統合テスト）、M6-3（README）

### 補足

現在 `libs/windows/` の DLL は手動または既存の cargo build で一度配置された状態。新規クローン時の初回ビルドでは `collect_runtime_libs_windows()` 内のコピー処理で賄われるが、SpeechHelper.dll だけは事前に `prebuilt/windows/` に存在する必要がある（C# Native AOT ビルドが必要）。その場合 build.rs の `try_build_windows_native()` が `native/cs/build.ps1` を自動実行する。

### 成果物

- 計画: context/0058-m6-16-windows-libswindows/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0058-m6-16-windows-libswindows/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0058-m6-16-windows-libswindows/review.md（未作成、/review-ticket 全チェック通過後に作成）
