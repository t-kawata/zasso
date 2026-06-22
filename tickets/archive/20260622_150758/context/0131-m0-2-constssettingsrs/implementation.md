# 実装サマリ: M0-2 — 静的定数定義 (consts/settings.rs)

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/ggufrs/src/consts/settings.rs` | **新規作成** | 8つの pub(crate) const 定数 + 日本語コメント + ユニットテスト11件 + dead_code抑制 |
| `crates/ggufrs/src/consts/mod.rs` | **修正** | pub mod settings + 全定数再公開（unused_imports抑制）+ STUB除去 |

## 定数一覧

| 定数名 | 値 | 説明 |
|--------|-----|------|
| DEFAULT_RT_PORT | 3910 | REST API / OpenAI 互換エンドポイント |
| DEFAULT_SW_PORT | 3911 | 静的コンテンツポート |
| DEFAULT_MODEL_DIR | "models" | モデルファイル格納ディレクトリ |
| CURL_TIMEOUT_SECS | 60 | モデルダウンロードタイムアウト |
| DEFAULT_CONTEXT_SIZE | 32768 | Qwen3.5 デフォルトコンテキスト長 |
| DEFAULT_MAX_TOKENS | 256 | 推論デフォルト最大トークン数 |
| DEFAULT_TEMPERATURE | 0.1 | 推論デフォルト温度 |
| GPU_PROVIDER_ENV_VAR | "GGUFRS_GPU_PROVIDER" | GPU プロバイダー環境変数名 |

## 検証結果

| 検証項目 | 結果 |
|---------|------|
| `make check-ggufrs` | ✅ 通過 (0 warnings, 0 errors) |
| `cargo test` (ggufrs) | ✅ 11 passed, 0 failed |
| 品質チェック (run-quality-checks.js) | ⚠️ 2件のポート番号検出はsettings.rsの目的上正当なfalse positive |

## ユニットテスト詳細

11テスト全件通過:
1. default_rt_port_is_in_user_range
2. default_sw_port_is_in_user_range
3. ports_are_distinct
4. default_model_dir_is_not_empty
5. curl_timeout_secs_is_positive
6. default_context_size_is_reasonable
7. default_max_tokens_is_positive
8. max_tokens_does_not_exceed_context_size
9. default_temperature_is_in_range
10. gpu_provider_env_var_is_not_empty
11. gpu_provider_env_var_has_ggufrs_prefix

## スタブ解決状況

- ✅ `consts/mod.rs` の STUB 2件を解決（settings.rs 実装 + pub mod 宣言 + pub use 再公開）
- ✅ `[::STUB::]` 未付与のスタブなし

## 残課題

- 定数が後続チケットで参照開始されたタイミングで `#[allow(dead_code)]` / `#[allow(unused_imports)]` を除去する
