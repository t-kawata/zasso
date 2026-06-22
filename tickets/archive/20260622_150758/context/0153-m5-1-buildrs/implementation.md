# M5-1 実装サマリ

## 変更概要
build.rs を作成し、2つの GGUF モデルファイルの自動ダウンロードを実装した。

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/ggufrs/build.rs` | 新規 | モデル自動ダウンロード（80行） |

## 実装内容
- MODEL_FILES 定数配列: Qwen3.5-0.8B-Q4_K_M + Qwen3.5-2B-Q4_K_M のURL
- download_file() Unix: curl -sS -L -m 60 -o
- download_file() Windows: PowerShell Invoke-WebRequest
- main(): ディレクトリ作成 → 存在確認後ダウンロード → assert 存在確認
- cargo:rerun-if-changed=models/

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check（初回） | ✅ 自動ダウンロード + コンパイル成功 |
| ダウンロード結果 | ✅ Qwen3.5-0.8B (389MB) + Qwen3.5-2B (1.2GB) |
| cargo test (159 tests) | ✅ 全通過 |
| cargo check（2回目・冪等性） | ✅ 再ダウンロードなし、警告なし |
| cargo fmt | ✅ フォーマット済み |
| cargo clippy | ✅ エラーなし |
| 翻訳可能性 | ✅ 名詞始まり関数なし、デバッグ出力なし |
