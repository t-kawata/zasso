---
ticket_id: 3
title: test-chat バイナリ — マルチターンチャット会話/ワンショット推論
slug: test-chat
aliases: 
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
plan_path: /Users/kawata/shyme/zasso/tickets/context/0003-test-chat/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0003-test-chat/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0003-test-chat/review.md
---
# test-chat バイナリ — マルチターンチャット会話/ワンショット推論

## Summary

ggufrs クレートに、**対話型チャットバイナリ `test-chat`** を追加する。
ユーザーは `cargo run --bin test-chat` で起動し、4種類のビルトインモデル（qwen3.5-0.8b / qwen3.5-2b / gemma4-e2b / gemma4-e4b）から任意のモデルを指定して、**マルチターンの対話的チャット**または**ワンショット推論**が行える。

## Background

### 現状の課題

現在 ggufrs には test-run バイナリ（`src/bin/test-run.rs`）が存在し、3パターンの推論（Structured Output / Text Generation / Streaming）を順次実行する。しかし test-run は以下を満たしていない：

1. **対話（マルチターン）ができない**: 一度の推論で終了し、会話履歴を保持しない
2. **モデルをコマンドラインで選択できない**: `ModelConfig` をコード内で直接指定しており、ユーザーが実行時にモデルを選べない
3. **ユーザープロンプトを自由に指定できない**: プロンプトはコードにハードコードされている

これらの制約により、ggufrs のビルトインモデルを使って自由にチャット対話を試すことができない。開発中テストやモデル比較のために、対話的な検証ツールが必要である。

### 解決策

test-chat バイナリを新規作成し、以下の2モードを提供する：

1. **対話モード**（`--prompt` なし）: 標準入力からユーザー入力を読み取り、マルチターンのチャットセッションを行う
2. **ワンショットモード**（`--prompt=<TEXT>`）: 単一プロンプトを与え、生成結果を表示して終了する

両モードとも `--model=<NAME>` フラグで4モデルから自由に選択可能とする。

### 既存コードの分析

**`src/bin/test-run.rs` (283行)**:
- `GgufEngine::new(config)` でエンジン初期化
- `engine.generate()` / `engine.generate_structured()` / `engine.generate_stream()` の3メソッドを使用
- モデル名 `gemma4-e2b` をハードコード
- CPU-Only モードで動作
- サマリー表示で PASS/FAIL を一覧
- テンプレートとして流用可能な土台を持つ

**`src/inference/mod.rs` (L86-146: `InferenceEngine` トレイト)**:
```rust
async fn generate(&self, model_name: &str, prompt: &str, params: GenerateParams) -> Result<String, GgufError>;
async fn generate_stream(&self, model_name: &str, prompt: &str, params: GenerateParams) -> Result<Pin<Box<dyn Stream<...>>>, GgufError>;
```
- `generate()` は同期的な全テキスト返却
- `generate_stream()` はストリーミング返却
- どちらも単一 `&str` プロンプトを受け取る → マルチターンでは手動で会話履歴を連結する必要がある

**`src/config.rs` (L231-272: `ModelConfig` ビルトインコンストラクタ）**:
| コンストラクタ | モデル名 | ファイル |
|---|---|---|
| `gemma4_e2b()` | `gemma4-e2b` | `models/gemma-4-E2B-it-Q4_K_M.gguf` ~3.1GB |
| `gemma4_e4b()` | `gemma4-e4b` | `models/gemma-4-E4B-it-Q4_K_M.gguf` ~5.0GB |
| `qwen3_5_0_8b()` | `qwen3.5-0.8b` | `models/Qwen3.5-0.8B-Q4_K_M.gguf` ~600MB |
| `qwen3_5_2b()` | `qwen3.5-2b` | `models/Qwen3.5-2B-Q4_K_M.gguf` ~1.2GB |

**`Cargo.toml` (L62-65: 既存バイナリ定義)**:
```toml
[[bin]]
name = "test-run"
path = "src/bin/test-run.rs"
```

**`build.rs`**: 上記4モデルをビルド時に自動ダウンロードする（`MODEL_FILES`）。

## 証拠（Investigation）

### ソースコード解析結果（2026-06-22）

| 調査項目 | 結果 | 詳細 |
|---------|------|------|
| 現行バイナリ定義 | 1つ（test-run）のみ | Cargo.toml L62-65 |
| 推論API | `generate()` / `generate_stream()` が利用可能 | 単一 `&str` プロンプト。会話履歴は呼び出し側で連結必須 |
| モデル名→ModelConfig | マッピング関数なし | `from_str` 相当の文字列→コンストラクタ変換が未実装（test-chat 内で実装する） |
| 引数パース | test-run は手動パース（`parse_patterns()`） | clap 等の外部クレート未使用、anyhow のみ |
| GenerateParams | 全フィールド `Option` | `--model`, `--prompt` 以外に `--temperature`, `--max-tokens` 等の制御も追加可能 |
| ストリーミング | `generate_stream()` で利用可能 | 対話モードでの逐次表示に使用可能 |
| モデルファイル | build.rs で自動DL | 全4ファイルは `models/` に格納済みであることが前提 |
| CPU-Only 動作 | `GpuConfig { provider: GpuProvider::Cpu, cpu_only: true }` | test-run と同様の設定 |

### 犯罪・スタブ点検結果

- **Malfeasance.json**: 未解決の犯罪なし（count: 0）✅
- **スタブ検出**: `src/consts/settings.rs:4` に `#![allow(dead_code)]` のスタブ — 本チケットのスコープ外（settings.rs の未使用定数は既存の課題）

### 依存チケットの確認

- **先行必須**: なし。全チケット（Tickets.md の M0〜M6-14）は ✅ 完了済み。全てのビルド・テストが通過している状態が前提。
- **本チケット新規バイナリ**: 既存の `lib.rs` / `inference/` / `config/` に変更を加えず、`src/bin/test-chat.rs` のみの追加で完結する。`Cargo.toml` への `[[bin]]` 追加のみが必要。

## Scope

### 実装スコープ

1. **`src/bin/test-chat.rs` 新規作成** — 対話型チャットバイナリ
   - 引数パース: `--model=<NAME>`（必須）、`--prompt=<TEXT>`（省略可）、`--temperature=<F>`（省略可、デフォルト0.7）、`--max-tokens=<N>`（省略可、デフォルト512）
   - `--prompt` あり → ワンショットモード（単一生成 → 終了）
   - `--prompt` なし → 対話モード（標準入力から逐次読み取り → 生成 → 履歴に追加 → 繰り返し）
   - Ctrl+C / Ctrl+D / `exit` / `quit` で終了

2. **`Cargo.toml` に `[[bin]]` エントリ追加**
   ```toml
   [[bin]]
   name = "test-chat"
   path = "src/bin/test-chat.rs"
   ```

3. **ワンショットモードの動作**
   - 与えられたプロンプトで `generate_stream()` を呼び出し、逐次表示
   - 生成完了後に経過時間・推定 TPS を表示

4. **対話モードの動作**
   - プロンプト `> ` を表示し、標準入力から1行読み取り
   - 空行または `exit`/`quit` で終了
   - 読み取った入力を会話履歴に追加し、履歴全体を1つのプロンプト文字列として `generate_stream()` に渡す
   - 生成結果を逐次表示し、完了後 `> ` に戻る
   - 会話履歴のフォーマット: `User: {message}\n\nAssistant: {response}\n\n` を繰り返し連結（シンプルなプレーンテキスト形式。空行で区切ることでターン境界を明確にする）
   - 各ターン終了時に経過時間・推定 TPS を表示

5. **モデル名解決**
   - 文字列から `ModelConfig` のビルトインコンストラクタを選択するマッピング関数
   - マッピング: `gemma4-e2b` / `gemma4-e4b` / `qwen3.5-0.8b` / `qwen3.5-2b`（大文字小文字不区別）
   - 未知のモデル名 → エラーメッセージ表示 + 利用可能モデル一覧表示 + exit(1)

6. **GgufEngine 初期化**
   - CPU-Only モード（`GpuProvider::Cpu`, `cpu_only: true`）
   - 選択されたモデルのみを単一モデルとして設定
   - 初期化は非同期で行う

### 非スコープ

- **`lib.rs` の変更**: GgufEngine / InferenceEngine 等の公開APIに変更を加えない
- **`inference/` の変更**: 推論エンジン本体に変更を加えない
- **`config.rs` の変更**: ModelConfig に文字列→コンストラクタマッピングを追加しない（test-chat バイナリ内で完結させる）
- **チャットテンプレートの実装**: llama-cpp-2 の chat template 機能の利用は今後の課題とする。当面は平文連結で対応
- **Web UI / TUI**: 対話はシンプルな CLI 標準入出力。ncurses や ratatui は使用しない
- **サーバーモード**: test-chat はサーバーを起動しない

## Test Plan

### ユニットテスト計画

test-chat バイナリ（`src/bin/test-chat.rs`）は **目視確認用ツール** として位置づける。
以下の項目はユニットテストで検証可能：

| # | テスト対象 | 内容 | 種別 |
|---|-----------|------|------|
| 1 | モデル名解決（全4モデル） | 全ビルトイン名が正しく ModelConfig に解決される | 正常系 |
| 2 | モデル名解決（大文字小文字） | `GEMMA4-E2B` / `Gemma4-E2B` / `gemma4-e2b` が同一結果 | 正常系 |
| 3 | モデル名解決（未知） | `unknown-model` で None が返る | 異常系 |
| 4 | 会話履歴フォーマット | `User: ...\n\nAssistant: ...\n\n` の連結が正しい | 正常系 |
| 5 | 会話履歴（1ターンのみ） | 単一メッセージの履歴が正しい形式 | 境界値 |
| 6 | 会話履歴（複数ターン） | 3ターン連結で各ターンが正しく区切られる | 正常系 |
| 7 | 会話履歴（空メッセージ） | 空文字列が渡された場合の動作 | 境界値 |
| 8 | コンパイル確認 | `cargo check --bin test-chat` | ビルド検証 |

**モック・スタブ**: 推論エンジンそのもののモックは不要（test-chat は実モデルを使用する目視確認ツール）。test-chat のロジック（モデル名解決、会話履歴構築）は純粋関数としてユニットテスト可能。

### ユニットテスト不可能な項目（例外）

| # | 項目 | 理由 |
|---|------|------|
| 1 | 対話モードの標準入力ループ | 標準入力をシミュレートするには `std::io::Stdin` のモックが必要だが、バイナリコードの設計上ユニットテストでは困難。E2E テスト（シェルスクリプト経由のパイプ入力）で検証する |
| 2 | 実際のモデル読み込みと推論 | 実モデルファイルが必要。build.rs はテスト実行時には動作しないため、手動テストが唯一の手段 |
| 3 | ストリーミング表示の逐次性 | 表示のリアルタイム性は人間の目視確認のみで判断可能 |

### 検証項目（手動）

| # | 項目 | 方法 | 期待結果 |
|---|------|------|---------|
| 1 | `make check-be` | コンパイル + clippy | 成功、警告なし |
| 2 | ワンショット（Gemma4 E2B） | `cargo run --bin test-chat -- --model=gemma4-e2b --prompt="こんにちは"` | 応答が表示され終了 |
| 3 | ワンショット（Qwen3.5 0.8B） | `cargo run --bin test-chat -- --model=qwen3.5-0.8b --prompt="Hello"` | 応答が表示され終了 |
| 4 | ワンショット（Gemma4 E4B） | `cargo run --bin test-chat -- --model=gemma4-e4b --prompt="Rustについて"` | 応答が表示され終了 |
| 5 | 対話モード起動 | `cargo run --bin test-chat -- --model=gemma4-e2b` | `> ` プロンプト表示 |
| 6 | 対話モード: 複数ターン | 3回以上対話継続 | 各ターンで応答表示、履歴が保持される |
| 7 | 対話モード: `exit` 終了 | `> exit` と入力 | 正常終了 |
| 8 | 対話モード: 空行終了 | 空行を入力 | 正常終了 |
| 9 | 未知のモデル名 | `--model=invalid` | エラー + 利用可能モデル一覧 |
| 10 | `--model` 省略 | `--prompt="hello"` | エラーメッセージ |
| 11 | 不正引数 | `--unknown-flag` | エラーメッセージ |

## Boy Scout Rule — 翻訳可能性計画

### 設計方針

test-chat バイナリは新規作成のため、設計時点で翻訳可能性を満たす：

1. **関数名は動詞句**: `resolve_model_name()`, `build_chat_history()`, `run_interactive()`, `run_one_shot()`, `print_model_list()`
2. **一関数一責務**: モデル名解決、会話履歴構築、対話ループ、ワンショット実行は別関数に分割
3. **ハードコード値は名前付き定数**: デフォルト temperature / max-tokens / モデル名マッピングは定数化
4. **エラーは Result 伝播**: `anyhow::Result` で一元管理、`unwrap()` 不使用
5. **標準出力とエラー出力の分離**: 生成結果は stdout、診断情報は stderr

```rust
// test-chat.rs の翻訳可能性設計（構造イメージ）:
//
// fn main() -> Result<()>
//   → parse_args()
//   → resolve_model_config(args.model_name)
//   → initialize_engine(config)
//   → match args.mode
//     → OneShot  => run_one_shot(engine, args)
//     → Chat     => run_interactive(engine)
```

### 既存コードの改善

本チケットでは新しいバイナリファイルのみを作成するため、既存コードへの変更は Cargo.toml の `[[bin]]` 追加のみにとどめる。翻訳可能性の改善は新規コードに集中する。

## Acceptance Criteria

- [ ] `make check-be` 成功（Rust コンパイル + clippy 警告0）
- [ ] `cargo run --bin test-chat -- --model=gemma4-e2b --prompt="こんにちは"` で応答が表示される
- [ ] `cargo run --bin test-chat -- --model=qwen3.5-0.8b --prompt="Hello"` で応答が表示される
- [ ] `cargo run --bin test-chat -- --model=gemma4-e2b` で対話モードが起動し、`> ` プロンプトが表示される
- [ ] 対話モードで複数ターンの会話が可能（履歴が保持される）
- [ ] 対話モードで `exit` / 空行で終了できる
- [ ] 未知のモデル名でエラーメッセージ + 利用可能モデル一覧が表示される
- [ ] `--model` 省略時にエラーメッセージが表示される
- [ ] 翻訳可能性の検証 — 関数名は動詞句、一関数一責務、unwrap 不使用、ハードコード値は定数化

## 依存関係

| 依存方向 | チケット | 内容 |
|---------|---------|------|
| 先行必須 | なし | 全既存チケット（M0〜M6-14）完了済み |
| 後続処理 | なし | 本チケットで完結 |

## Notes

### 実装上の注意点

1. **会話履歴のサイズ管理**: 長時間の対話でコンテキストサイズを超過しないよう、履歴がモデルの `context_size` を超えた場合の警告またはトリミングを考慮する（初回実装では超過時にエラー表示のみで良い）

2. **GenerateParams**: 対話モードでは `temperature: Some(0.7)`（test-run の0.3より高め）、`max_tokens: Some(512)`（会話向けに長め）をデフォルトとする。チャットでは決定的より多様性が重要

3. **ストリーミング**: 対話モードでは `generate_stream()` を使用し、トークンが生成されるたびに逐次表示する。行バッファリング（`print!` + `flush()`）で表示

4. **モデル選択**: test-chat は軽量な `qwen3.5-0.8b` または `gemma4-e2b` を推奨モデルとしてヘルプに明記

5. **引数パース**: clap のような外部クレートは使わず、test-run と同様の簡易手動パースで実装する（既存パターンに従う）

### 会話履歴フォーマット例

```
User: こんにちは

Assistant: こんにちは！今日はどのようにお手伝いしましょうか？

User: Rustについて教えてください

Assistant: Rustはシステムプログラミング言語で、メモリ安全性と並行性に優れています...
```

この形式を対話のたびに連結し、`generate_stream()` に渡す。空行でターン境界を区切ることで、モデルが会話の構造を認識しやすくする。

### 成果物

- 実装ファイル: `src/bin/test-chat.rs`
- Cargo.toml 変更: `[[bin]]` エントリ追加
- 計画: `context/0003-test-chat/plan.md`（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: `context/0003-test-chat/implementation.md`（未作成、実装完了後に作成）
- レビュー報告書: `context/0003-test-chat/review.md`（未作成、`/review-ticket` 通過後に作成）
