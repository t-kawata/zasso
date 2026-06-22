---
ticket_id: 33
title: ログ基盤導入と sidecar 出力の統合パイプ
slug: sidecar
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-11
plan_path: /Users/kawata/shyme/zasso/tickets/context/0033-sidecar/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0033-sidecar/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0033-sidecar/review.md
---
# ログ基盤導入と sidecar 出力の統合パイプ

## Summary

zasso アプリケーション全体に構造化ログ基盤（`tracing`）を導入する。同時に、sidecar プロセス（bifrost-http）の stdout/stderr を process-registry がキャプチャしているが破棄している問題を解決し、すべての出力をログに統合する。既存の raw print（`eprintln!`）も適宜置き換える。

## Background

- zasso の本番コード（`src-tauri/src/`）自体は生の `println!` / `eprintln!` を使用していないが、`log::info!` / `tracing::info!` などの構造化ログも一切使用しておらず、アプリケーションの状態を把握する手段がない
- sidecar（bifrost-http）の stdout/stderr は process-registry の `spawn_one()` でブロードキャストチャネルにキャプチャされているが、**誰も購読しておらず全出力が破棄されている**。bifrost の起動失敗、プロキシエラー、LLM 関連のエラーがすべて不可視
- `crates/procreg/watchdog/` の本番コードには `eprintln!` が5箇所あり、統一口グフォーマットで出力されていない
- 問題の切り分けや運用時の可観測性が著しく低い

## Scope

- `tracing` + `tracing-subscriber` クレートの導入（`cargo add` 経由）
- Tauri `setup()` におけるログ初期化（`tracing_subscriber::fmt().init()`）
- `ProcessRegistry::pipe_output_to("bifrost", ...)` の呼び出し追加 → sidecar 出力を `tracing::info!` に統合
- watchdog の `eprintln!` → `tracing::error!` への置き換え（watchdog は別バイナリのため、その `Cargo.toml` のみに `tracing` 追加）
- sidecar 定義側での OS 別バイナリパス出力（起動ログ）
- 不要になったコメントアウトまたはサンプルコードの整理

## Non-scope

- procreg ライブラリ自体への `tracing` / `log` の追加（独立性を維持する）
- ログのファイル出力（最初はコンソールのみ。必要なら後続チケットで対応）
- `tracing-appender` などの追加クレート導入（最初は `tracing-subscriber` の `fmt` で十分）
- testing 用 `println!` / `eprintln!` の置き換え（テスト用出力はテストの可読性のために許容）
- `build.rs` の `println!("cargo:...")` 置き換え（cargo 規約のため変更不可）
- フロントエンド（Tauri event）へのログ転送（後続チケットで対応可能）

## Investigation

### 現状のログ状況

**`src-tauri/src/` 配下:**
- `println!` / `eprintln!` / `dbg!` / `log::info!` / `tracing::info!` の使用はゼロ
- `Cargo.toml` には `log` / `fern` / `tracing` の依存なし

**`crates/procreg/watchdog/src/main.rs` — raw eprintln! の実在確認:**
- `:40` — `eprintln!("[watchdog] No child command specified");`
- `:49` — `eprintln!("[watchdog] Failed to spawn child: {e}");`
- `:71` — `eprintln!("[watchdog] Error waiting for child: {e}");`
- `:143` — `eprintln!("[watchdog] Failed to kill process {pid}: {e}");`
- `:155` — `eprintln!("[watchdog] Failed to kill process {pid}: {e}");`

### sidecar (bifrost) 出力パイプライン

`crates/procreg/src/spawn.rs` の `spawn_one()` 関数が sidecar を起動。パイプラインは以下の通り：

```
bifrost-http → (stdio 継承) → procreg-watchdog
  → (Stdio::piped) → process-registry の stdout/stderr reader タスク
  → broadcast::channel::<String>(2048) → 誰も購読していない
```

- `cmd.stdout(std::process::Stdio::piped())` / `cmd.stderr(std::process::Stdio::piped())` — キャプチャはされている
- 2つの `tokio::spawn` タスク（stdout 読み、stderr 読み）が行単位で `output_tx` に送信
- `wait_ready()` は bifrost（`TcpPort` 条件）の購読を行わないため、起動時の出力も読まれない
- チャネル capacity は 2048。オーバーフロー時の動作：最も古いメッセージが破棄（`Lagged`）
- `subscribe_output(name)` / `pipe_output_to(name, sink)` API は存在するが、本番コードからの呼び出しはゼロ（テストコードのみ使用）

### クロスプラットフォーム対応状況

process-registry は以下の OS 差を既に吸収している：
- `sidecar.rs`: `binary_filename()` が Windows で `.exe` を付与
- `deploy.rs`: `#[cfg(unix)]` で Unix パーミッション設定
- `watchdog/main.rs`: `#[cfg(unix)]` / `#[cfg(windows)]` でプロセス生存確認と kill を切り替え
- `spawn.rs` のテスト: OS 別のテストプログラムパス（`/bin/echo` / `cmd.exe /c echo`）
- `assets.rs`: 3 アーキテクチャ（macOS-arm64, Linux-amd64, Windows-amd64）の binary bundle を `include_bytes!`
- `pipe_output_to` のインターフェースは OS 非依存

### 結論（独立性能）

| コンポーネント | tracing 追加？ | 独立性への影響 |
|---|---|---|
| zasso (src-tauri) | ✅ 追加 | 本体なので問題なし |
| procreg ライブラリ | ❌ 追加しない | **完全に維持** |
| watchdog バイナリ | △ 追加可 | 依存は watchdog のみ、procreg ライブラリに影響なし |

## Test Plan

### ユニットテスト計画

| 対象 | テスト内容 | 正常系 | 異常系 | 境界値 |
|------|-----------|--------|--------|--------|
| `setup_logging()`（新規） | `tracing_subscriber` の初期化がパニックせず完了すること | デフォルトレベルでの初期化 | — | — |
| `pipe_output_to`（既存 API の確認） | クロージャに出力行が届くこと | 文字列が sink に渡される | — | — |
| bifrost sidecar 定義の起動ログ文字列 | フォーマットが正しいこと | — | — | — |

### ユニットテスト不可能な項目（例外）

- **Tauri `setup()` フックの動作確認**: Tauri ランタイムが必要。E2E / 手動確認とする
- **sidecar (bifrost) の実出力キャプチャ**: 実際の bifrost-http バイナリが必要。手動確認または integration test でカバー
- **watchdog の eprintln! → tracing 変更**: tracing の初期化は zasso 側で行うため、watchdog 単体で出力を確認するにはテストバイナリ実行が必要

## Boy Scout Rule — 翻訳可能性計画

### `crates/procreg/watchdog/src/main.rs`（本チケットで直接触るファイル）

- **`eprintln!` → `tracing::error!`**: エラーメッセージが `"[watchdog] ..."` というプレフィックスで統一されており、翻訳可能性は既に高い。`tracing` 移行後も同レベルの可読性を維持する
- **ハードコード値確認**: 現状の定数（`SLEEP_SEC` 等）が `consts/settings.rs` ではなくファイル内に定義されている場合は、可能な範囲で設定集約の方針に沿って改善する
- **メッセージ内容の一貫性**: `"Failed to kill process {pid}"` のようなエラーメッセージは「何に失敗したか」「どのプロセスか」が明確で翻訳可能性を満たしている。保持する

### `src-tauri/src/lib.rs`（本チケットで触るファイル）

- `setup()` フック内の処理は現状「home 初期化 → bifrost デプロイ → Procreg 起動 → panic hook」という段落構造になっており、翻訳可能性は良好。新しいログ初期化も同じ段落スタイルで冒頭に追加する
- 将来的に `setup()` が長大化した場合の分割を視野に入れるが、このチケットでは行わない

### `src-tauri/src/sidecar.rs`（起動ログ出力）

- 新しく追加する起動ログメッセージは「どの sidecar を」「どのパスで」「どのポートで」起動するかが一文で読み取れるフォーマットにすること

## Acceptance Criteria

- [ ] `tracing` + `tracing-subscriber` が `cargo add` で導入され、`Cargo.toml` に記録されている
- [ ] Tauri 起動時に `tracing_subscriber::fmt().init()` が呼ばれ、以降 `tracing::info!` 等がコンソールに出力される
- [ ] `ProcessRegistry::pipe_output_to("bifrost", ...)` が呼ばれ、bifrost の出力が `[bifrost] ...` の形式でログに統合されている
- [ ] watchdog の `eprintln!` 5箇所が `tracing::error!` に置き換えられている
- [ ] `cargo check` / `cargo build` が通る
- [ ] procreg ライブラリの `Cargo.toml` に `tracing` / `log` の依存が追加されていない（独立性維持）
- [ ] 既存テストがすべて通過する

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0033-sidecar/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0033-sidecar/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0033-sidecar/review.md（未作成、/review-ticket 全チェック通過後に作成）
