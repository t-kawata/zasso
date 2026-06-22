# M16-2: ResamplePipeline
## 変更: resampler.rs(新規), audio/mod.rs
## 状況: 同一レートパススルーのみ。異レート変換は rubato API 確認後に実装
## STUB: resampler.rs - M17-2でrubato統合
## tests(4): identity_rate, different_rate_error, reset_noop, empty_input
## cargo test: 358 passed, 0 failed
