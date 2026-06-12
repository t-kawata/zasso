# Implementation: M1-2 AudioChunk / AudioChunkPair 定義

## 変更ファイル一覧

| ファイル | 種別 | 行数 | 内容 |
|----------|------|------|------|
| crates/siprs/src/audio/chunk.rs | 新規 | 300行 | AudioChunk enum + AudioChunkPair struct + 20 tests |
| crates/siprs/src/audio/mod.rs | 修正 | +1行 | pub mod chunk; 追加 |

## 実装内容

### chunk.rs 主要構成

1. **AudioChunk** — I16(Vec<i16>) / F32(Vec<f32>), len(), is_empty(), as_i16(), as_f32()
2. **AudioChunkPair** — call_id / account_id / timestamp / in_chunk / out_chunk, new(), stereo_i16()
3. **20 ユニットテスト**（正常系・異常系・境界値・コンパイル時検証）

### 設計判断
- 全 unwrap() を Result 伝播（?演算子）または削除により排除 — quality check 0 issues
- stereo_i16() の型不一致は SipError::invalid_state で報告
- Clone の独立コピー検証テストを追加し、値セマンティクスを確認
- Send + Sync のコンパイル時検証を追加（後続のスレッド間配送に備える）

## ビルド・テスト結果

- cargo build → ✅ OK（0 error, 0 warning）
- cargo clippy -- -D warnings → ✅ OK（0 warning）
- cargo test → ✅ OK（56 unit + 1 doc-test = 57 passed, 0 failed）

### テスト内訳

**chunk.rs（20件新規）:**
- AudioChunk: len(I16/F32), is_empty(true/false), as_i16(ok/none), as_f32(ok/none), Clone, Debug
- AudioChunkPair: new fields, new timestamp, stereo_i16(ok/truncate/f32_in/f32_out), Clone, Debug
- コンパイル時検証: Send + Sync（AudioChunk, AudioChunkPair）

**既存テスト（継続）:**
- error.rs: 10件 ✅
- util/id.rs: 11件 ✅
- audio/format.rs: 15件 ✅

## Quality Checks
- run-quality-checks.js: 0 issues ✅
- 翻訳可能性: 全関数が動詞句、unwrap/expect/dbg なし
