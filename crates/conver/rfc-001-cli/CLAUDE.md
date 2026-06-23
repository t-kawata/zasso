# RFC_001: CLI レイヤ（conver-cli）— 設計全体マップ

> このファイルは `/formulate-tickets` によって自動生成されました。
> **生成元:** crates/conver/rfc-001-cli/RFC_001.md
> **生成日:** 2026-06-23

## 目的とスコープ

`conver-cli` crate は `conver` オーケストレータのCLIレイヤを実装する。clap によるコマンドライン引数パース、5層設定解決、ドメインハンドラへの WorkflowRequest ルーティング、埋め込みアセットの初期配布（init）、およびレガシースクリプト互換レイヤ（conver cmd）の責務を負う。

## アーキテクチャ概要

```text
[エントリポイント] main.rs
    │
    ├── [パース層] parser.rs
    │    clap Command enum → Settings + WorkflowRequest
    │
    ├── [設定解決層] config.rs
    │    5層マージ: defaults < global < project < -f < flags
    │
    ├── [ルーティング層] router.rs
    │    WorkflowRequest → conver-core::controller::execute()
    │
    ├── [init層] init.rs
    │    埋め込みアセット展開 + マニフェスト書出
    │
    └── [互換層] compat.rs
        レガシースクリプト引数 → canonical WorkflowRequest
```

各層は一方向の依存関係を持ち、下位層は上位層を参照しない。

## 主要な型とデータ構造

| 型 | 分類 | 定義場所 |
|----|------|---------|
| `Cli` | トップレベルパーサー | `parser.rs` |
| `Command` | サブコマンドenum（7種） | `parser.rs` |
| `RfcCommand` | RFC操作サブコマンド（5種） | `parser.rs` |
| `TicketCommand` | チケット管理サブコマンド（7種） | `parser.rs` |
| `MalfeasanceCommand` | Malfeasance操作サブコマンド（4種） | `parser.rs` |
| `QualityCommand` | 品質検証サブコマンド | `parser.rs` |
| `RuntimeCommand` | ランタイム操作サブコマンド（3種） | `parser.rs` |
| `CompatCommand` | 互換コマンド（9種） | `compat.rs` / `parser.rs` |
| `Settings` | 10サブ設定を持つ設定構造体 | `config.rs` |
| `ConfigResolver` | 5層設定解決 | `config.rs` |
| `Merge` | 設定マージトレイト | `config.rs` |
| `InitRunner` | 埋め込みアセット展開 | `init.rs` |
| `EmbeddedAsset` | 埋め込みアセット構造体 | `lib.rs` |
| `AssetKind` | アセット種別enum | `lib.rs` |

## モジュール／コンポーネント間の関係

```text
lib.rs (モジュール宣言 + EmbeddedAsset/AssetKind)
  ├── parser.rs (Command 全定義) — 他モジュールに依存しない
  ├── config.rs (Settings + ConfigResolver) — 他モジュールに依存しない
  ├── compat.rs (CompatCommand → WorkflowRequest) → parser.rs に依存
  ├── router.rs (Command → WorkflowRequest + 実行) → parser.rs + conver-core に依存
  ├── init.rs (InitRunner) → lib.rs + conver-core に依存
  └── main.rs (エントリポイント) → 全モジュール + conver-core + conver-storage に依存
```

### 外部依存関係

| 依存先 | 用途 | 必須/任意 |
|--------|------|---------|
| clap (derive) | CLI引数パース | 必須 |
| serde + serde_json | 設定ファイルdeserialize | 必須 |
| thiserror | エラー型derive | 必須 |
| conver-core | WorkflowController, WorkflowRequest, Settings, Manifest | 必須 |
| conver-storage | FileBackend | 必須 |
| dirs | グローバル設定ディレクトリ解決 | 必須 |
| sha2 | アセットSHA-256計算 | 必須 |

## スタブ一覧と解決計画

本RFCの実装範囲内では、`[::STUB::]` は発生しない設計を原則とする（RFC §Motivation「1回完結」）。
ただし以下の要素は外部crate（conver-core, conver-storage）に依存するため、それらのcrateの未実装箇所が存在する場合はスタブとなる：

| スタブ対象 | 依存先 | 解決チケット | 備考 |
|-----------|--------|------------|------|
| `WorkflowController` | conver-core | 外部crate (RFC_002) | モックで代用可 |
| `WorkflowRequest` | conver-core | 外部crate (RFC_002) | 構造体定義のみ必要 |
| `Settings` (core版) | conver-core | 外部crate (RFC_002) | conver-cli独自定義も可 |
| `FileBackend` | conver-storage | 外部crate (RFC_004) | init時のディレクトリ作成に使用 |
