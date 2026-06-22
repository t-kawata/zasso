# 実装サマリー: チケット #3 — test-chat バイナリ

## 変更ファイル

| ファイル | 種別 | 行数 | 内容 |
|---------|------|------|------|
| `crates/ggufrs/src/bin/test-chat.rs` | 新規 | 561行 | 対話型チャットバイナリ本体 |
| `crates/ggufrs/Cargo.toml` | 修正 | +5行 | `[[bin]] name = "test-chat"` エントリ追加 |

## 実装内容

### 引数パース（手動パース、test-run 準拠）
- `--model=<NAME>`（必須） — 4モデルから選択
- `--prompt=<TEXT>`（省略可） — あり=ワンショット、なし=対話モード
- `--temperature=<F>`（省略可、デフォルト 0.7）
- `--max-tokens=<N>`（省略可、デフォルト 512）
- `--help` / `-h` — 使用方法表示

### モデル名解決
- `gemma4-e2b` → `ModelConfig::gemma4_e2b()`
- `gemma4-e4b` → `ModelConfig::gemma4_e4b()`
- `qwen3.5-0.8b` → `ModelConfig::qwen3_5_0_8b()`
- `qwen3.5-2b` → `ModelConfig::qwen3_5_2b()`
- 大文字小文字不区別、未知のモデル名はエラー表示＋一覧表示

### ワンショットモード
- `generate_stream()` で逐次表示
- 経過時間・TPS 表示

### 対話モード
- 標準入力から逐次読み取り、`> ` プロンプト表示
- 会話履歴を `User: \n\nAssistant: \n\n` 形式で連結
- 履歴が 4000 文字超で古いターンを自動切り詰め
- `generate_stream()` で逐次表示
- 各ターン終了時に経過時間・TPS 表示
- Ctrl+D/空行/exit/quit で終了

### 設計原則
- 既存コード（`lib.rs` / `inference/` / `config/`）は一切変更なし
- 関数名は動詞句（`resolve_model_config`, `run_one_shot`, `run_interactive`）
- `unwrap()` 不使用（本番コード）、`anyhow::Result` で一元管理
- 生成テキスト=stdout、診断情報=stderr で分離
- ハードコード値は名前付き定数

## テスト

| 項目 | 結果 |
|------|------|
| `make check-be` | ✅ 成功 |
| `cargo clippy`（test-chat） | ✅ 警告0 |
| `cargo test` 全テスト | ✅ 204/204 合格（新規15含む） |
| `cargo test --bin test-chat` | ✅ 15/15 合格 |

### 新規ユニットテスト（15件）
- モデル名解決（全4モデル + 大文字小文字 + 未知 + 空 + べき等性）: 11件
- 会話履歴フォーマット（単一/複数/空/切り詰め）: 4件

### 不完全実装・犯罪
- なし（全てのチェック通過）

## 翻訳可能性の検証
- ✅ 関数名は動詞句: `resolve_model_config`, `run_one_shot`, `run_interactive`, `parse_args`, `print_usage`, `print_stats`
- ✅ 一関数一責務: 引数パース・モデル解決・ワンショット実行・対話実行は別関数
- ✅ エラーは `anyhow::Result` 伝播、本番コードで `unwrap()` 不使用
- ✅ ハードコード値は名前付き定数: `DEFAULT_TEMPERATURE`, `DEFAULT_MAX_TOKENS`, `MAX_HISTORY_CHARS` 等
- ✅ 標準出力とエラー出力の分離: 生成テキスト=stdout、診断=stderr
