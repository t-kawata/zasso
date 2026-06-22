# 実装成果: チケット #70 — M5-2 interleave_in_out ステレオマッピング

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/audio/bridge.rs | 新規 | 3 ステレオマッピング関数 + 9 tests |
| crates/siprs/src/audio/mod.rs | 修正 | pub mod bridge; 追加 |

## 実装内容

### interleave_in_out
- モノラル IN/OUT → L=IN, R=OUT のステレオ Vec<i16>
- pair_count = min(len(in), len(out)) で切り詰め
- 空入力 → 空 Vec

### deinterleave_stereo
- ステレオ → (Vec<IN>, Vec<OUT>) のモノラルペア
- chunks_exact(2) で奇数長を安全に切捨て
- 空入力 → 空ペア

### interleave_in_out_f32
- i16 版と同一ロジック、f32 型

## テスト結果
- 193 tests PASS（既存 184 + 新規 9）
- 0 warnings
- Quality checks: 0 issues
