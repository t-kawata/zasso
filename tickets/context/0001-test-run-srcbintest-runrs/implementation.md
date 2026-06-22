# 実装サマリ: チケット #1（M6-13）

## 変更内容

### 1. 推論バグ修正: LlamaSampler チェーンに greedy 選択サンプラーを追加
**ファイル**: `src/inference/generate.rs`, `src/inference/stream.rs`
**原因**: llama-cpp-2 v0.1.150 の `chain_simple()` はチェーン末尾に選択用サンプラー（greedy/dist 等）が必須だが、temp + top_p のみで終了しており SIGABRT が発生。
**修正**: 両ファイルの sampler chain 末尾に `LlamaSampler::greedy()` を追加。

### 2. curl タイムアウト修正: 60秒→600秒
**ファイル**: `build.rs`, `src/consts/settings.rs`
**原因**: 3.1GB の Gemma4 E2B モデルダウンロードに60秒のタイムアウトでは不十分。
**修正**: 両ファイルの `CURL_TIMEOUT_SECS` を 60→600（10分）に延長。

### 3. clippy 警告修正: std::io::Error::other() への置き換え
**ファイル**: `src/registry.rs`
**内容**: Rust 1.91 で推奨の API に統一。

### 4. モデルファイル再ダウンロード
不完全な Gemma4 E2B モデルファイル（628MB）を削除し、2.9GB の正常ファイルを再ダウンロード。

## 検証結果
- cargo clippy --bin test-run: ✅ 警告0
- cargo test: ✅ 189 tests PASS
- cargo run --bin test-run:
  - Pattern 1 (Structured Output): ✅ PASS (8.718秒)
  - Pattern 2 (Text Generation): ✅ PASS (9.521秒)
  - Pattern 3 (Streaming): ✅ PASS (0.163秒)
  - Summary: **3/3 ALL PASS**
