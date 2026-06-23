# RFC_003: ランタイム抽象化（conver-runtime）— 設計全体マップ

> このファイルは `/formulate-tickets` によって自動生成されました。
> **生成元:** crates/conver/rfc-003-runtime/RFC_003.md
> **生成日:** 2026-06-23

## 目的とスコープ

conver オーケストレータのランタイム抽象化レイヤ `conver-runtime` crate の設計。
Claude Code をデフォルトの実行バックエンドとしつつ、`RuntimeBackend` / `RuntimeSession` /
`StructuredPayloadExtractor` の3つのtraitにより将来のbackend変更に備える。

- **親RFC**: [RFC_ROOT.md](../../RFC_ROOT.md)（conver: 決定論的 Rust オーケストレータ）
- **crate 実装先**: `crates/conver/rfc-003-runtime/`
- **結合先**: `conver-core` が本crateのtrait実装を利用する

## アーキテクチャ概要

```text
conver-runtime/src/
├── lib.rs              # モジュール宣言 + 全公開APIの再公開
├── backend.rs          # RuntimeBackend trait + RuntimeRequest
├── session.rs          # RuntimeSession trait + RuntimeResult + SessionState
├── event.rs            # RuntimeEvent enum（5 variant）
├── extractor.rs        # StructuredPayloadExtractor trait
│                       # + JsonExtractor + MarkdownExtractor
│                       # + RetryExtractor + CompositeExtractor
├── claude.rs           # ClaudeCodeBackend + ClaudeSession
├── timeout.rs          # TimeoutMonitor（別スレッドでのタイムアウト監視）
├── error.rs            # RuntimeError（7 variant）
└── logging.rs          # イベントロギングヘルパー
```

**依存の流れ**:
```
error.rs → event.rs → session.rs → backend.rs → claude.rs
                   ↘                       ↗
              extractor.rs ───→ claude.rs
              timeout.rs ───→ claude.rs
              logging.rs (event.rs のみ依存)
```

## 主要な型とデータ構造

| 型 | 種類 | 定義箇所 | 外部依存 |
|-----|------|---------|---------|
| `RuntimeBackend` | trait | `backend.rs` | `session::RuntimeSession`, `error::RuntimeError` |
| `RuntimeRequest` | struct | `backend.rs` | なし（純粋データ） |
| `RuntimeSession` | trait | `session.rs` | `event::RuntimeEvent`, `error::RuntimeError` |
| `RuntimeResult` | struct | `session.rs` | なし（純粋データ） |
| `SessionState` | enum (4) | `session.rs` | なし |
| `RuntimeEvent` | enum (5) | `event.rs` | なし |
| `StructuredPayloadExtractor` | trait | `extractor.rs` | `error::ExtractError` |
| `ExtractError` | struct | `extractor.rs` | なし |
| `RetryFeedback` | struct | `extractor.rs` | なし |
| `JsonExtractor` | struct | `extractor.rs` | `StructuredPayloadExtractor` |
| `MarkdownExtractor` | struct | `extractor.rs` | なし |
| `CompositeExtractor` | struct | `extractor.rs` | `StructuredPayloadExtractor` |
| `RetryExtractor` | struct | `extractor.rs` | `StructuredPayloadExtractor` |
| `ClaudeCodeBackend` | struct | `claude.rs` | `RuntimeBackend` |
| `ClaudeSession` | struct | `claude.rs` | `RuntimeSession` |
| `TimeoutMonitor` | struct | `timeout.rs` | なし |
| `NotifyingTimeoutMonitor` | struct | `timeout.rs` | なし（`mpsc` 利用） |
| `EventLogger` | struct | `logging.rs` | `RuntimeEvent` |
| `RuntimeError` | enum (7) | `error.rs` | `thiserror`, `extractor::ExtractError` |

## モジュール／コンポーネント間の関係

| モジュール | 依存先 | 依存される側 |
|-----------|--------|------------|
| `error.rs` | `thiserror`, `extractor::ExtractError` | session, backend, extractor, claude, lib |
| `event.rs` | なし | session, claude, logging, lib |
| `session.rs` | event, error | backend, claude, lib |
| `backend.rs` | session, error | claude, lib |
| `extractor.rs` | error | lib |
| `claude.rs` | backend, session, event, error, timeout | lib |
| `timeout.rs` | なし | claude, lib |
| `logging.rs` | event | lib |
| `lib.rs` | 全モジュール | 外部crate（conver-core） |

## 外部依存

| 依存クレート | 用途 | 対象モジュール |
|------------|------|-------------|
| `serde` (derive) | シリアライズ・デシリアライズ | backend, session, event, extractor |
| `serde_json` | JSONパース・デコード | extractor |
| `thiserror` | エラー型の derive マクロ | error, extractor |
| `log` | 構造化ログ出力 | claude, timeout, logging |
| `libc` (unix) | SIGTERM シグナル送信 | claude |

## Phase/マイルストーン構成

| Phase | マイルストーン | 層 | 内容 |
|-------|-------------|-----|------|
| M0 | M0-1〜M0-4 | Layer 0 | 型定義基盤: error, event enum, SessionState, RuntimeResult, RuntimeRequest |
| M1 | M1-1〜M1-7 | Layer 1 | 純粋ロジック: event methods, builder, extractor chain |
| M2 | M2-1〜M2-2 | Layer 2 | トレイト定義: RuntimeSession, RuntimeBackend |
| M3 | M3-1〜M3-3 | Layer 3 | ライフサイクル管理: ClaudeCodeBackend, ClaudeSession, TimeoutMonitor, EventLogger |
| M4 | M4-1〜M4-2 | Layer 4 | 統合: lib.rs, Cargo.toml, integration tests |

## スタブ一覧と解決計画

本設計書に基づく実装で発生するスタブ：

| ID | スタブ内容 | 解決先チケット | ステータス |
|----|-----------|--------------|-----------|
| STUB-1 | `TomlExtractor`（`CompositeExtractor::lenient()` のコメント中に言及あり） | M1-4 または事後対応 | 未着手（設計上は JsonExtractor のみでlenient構成としている） |
| STUB-2 | `serde::Serialize` / `Deserialize` derive アノテーション | 各型定義チケットで付与 | 未着手 |
| STUB-3 | `#[cfg(windows)]` の `child.kill()` のテスト | M4-2 | 未着手（Windows環境未テスト） |
