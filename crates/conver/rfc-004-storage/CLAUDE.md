# RFC_004: 永続化ストレージ（conver-storage） — 設計全体マップ

> このファイルは `/formulate-tickets` によって自動生成されました。
> **生成元:** crates/conver/rfc-004-storage/RFC_004.md
> **生成日:** 2026-06-23

## 目的とスコープ

`conver-storage` crate は、conver オーケストレータの永続化層を提供する。
ファイルベースのバックエンド（SQLite不使用）として、`StorageBackend` trait の実装
`FileBackend` を提供し、全書き込みは `write-temp → fsync → rename` の atomic パターンに従う。

**責務:**
1. Atomic 書き込み（write-temp/fsync/rename）
2. 整合性保証（複数ファイル更新）
3. SHA-256 改竄検出
4. append-only ログ（round_log.jsonl）
5. CRUD 抽象化（CrudStore trait）
6. マニフェスト管理（インストールマニフェスト）
7. チェックポイント永続化（commit/rollback/resume）

## アーキテクチャ概要

```
conver-storage/src/
├── lib.rs              # モジュール宣言 + 再公開
├── backend.rs          # StorageBackend trait + FileBackend 具象実装
├── crud.rs             # CrudStore trait + ファイル操作実装
├── atomic.rs           # AtomicWriter（write-temp/fsync/rename）
├── checkpoint.rs       # CheckpointStore（commit/rollback/resume）
├── round_log.rs        # AppendOnlyLog（round_log.jsonl）
├── tamper.rs           # TamperDetector（SHA-256検証）+ RfcNodeInfo
├── manifest.rs         # ManifestStore + Manifest/ManifestAsset/BuildInfo
├── path.rs             # PathResolver（ルート相対パス解決）
└── error.rs            # StorageError（9 variant）
```

依存関係（`a → b` は「a が b に依存」）:
```
error.rs (最下層 — 全モジュールが依存)
  ↑
path.rs, manifest.rs 型定義, tamper.rs 型定義 (Layer 0)
  ↑
atomic.rs, round_log.rs, checkpoint.rs (Layer 1 — I/O プリミティブ)
  ↑
backend.rs — FileBackend + StorageBackend trait (Layer 2)
  ↑
crud.rs, tamper.rs 完全実装, manifest.rs 完全実装 (Layer 3)
  ↑
lib.rs + Cargo.toml + acceptance test (Layer 4)
```

## 主要な型とデータ構造

| 型 | 定義ファイル | 役割 |
|----|------------|------|
| `StorageError` | error.rs | 9 variant のエラー型。全モジュールで使用 |
| `PathResolver` | path.rs | ルート相対パスを絶対パスに解決 |
| `AtomicWriter` | atomic.rs | write-temp→fsync→rename の atomic 書き込み |
| `FileBackend` | backend.rs | ファイルベース StorageBackend 実装 |
| `StorageBackend` (trait) | backend.rs | ストレージバックエンドの抽象化 |
| `CrudStore` (trait) | crud.rs | CRUD操作の統一インターフェース |
| `CheckpointStore` | checkpoint.rs | チェックポイント commit/rollback |
| `AppendOnlyLog` | round_log.rs | round_log.jsonl 追記専用ログ |
| `TamperDetector` | tamper.rs | SHA-256 改竄検出器 |
| `RfcNodeInfo` | tamper.rs | RFC ノードのパスとハッシュ情報 |
| `ManifestStore` | manifest.rs | インストールマニフェスト管理 |
| `Manifest` | manifest.rs | マニフェストデータ型 |
| `ManifestAsset` | manifest.rs | アセット情報 |
| `BuildInfo` | manifest.rs | ビルド情報 |

## モジュール／コンポーネント間の関係

| # | 依存元 | 依存先 | 依存の種類 | 備考 |
|---|--------|--------|-----------|------|
| 1 | error.rs | — | — | 全モジュールが使うエラー型 |
| 2 | path.rs | — | — | 純粋関数、依存なし |
| 3 | manifest.rs 型定義 | error.rs | データ型の From | Serialize/Deserialize |
| 4 | tamper.rs RfcNodeInfo | — | — | 純粋データ型、依存なし |
| 5 | atomic.rs | error.rs | From<io::Error> | ファイルI/O |
| 6 | round_log.rs | error.rs | From<io::Error> | ファイルI/O |
| 7 | checkpoint.rs | error.rs | From<io::Error> | ディレクトリ操作 |
| 8 | backend.rs | error, path, atomic, checkpoint | 直接構成要素 | FileBackend のコンストラクタ |
| 9 | crud.rs | backend::FileBackend, error | impl CrudStore for FileBackend | 委譲ベース |
| 10 | tamper.rs 完全実装 | error, backend::StorageBackend | trait 境界 | トレイト経由の呼出し |
| 11 | manifest.rs 完全実装 | error, 自身の型定義 | 操作メソッド | I/O + 型操作 |
| 12 | lib.rs | 全モジュール | 宣言 + 再公開 | 最終アセンブリ |

## スタブ一覧と解決計画

本設計書に基づく実装では、**純粋なスタブは存在しない**。各チケットは実装完了とともに
そのモジュールの全関数が実際に動作する。

ただし以下は設計上の制約・注意点としてチケットに注記する：

1. **StorageBackend trait の所在**: RFC 上は「conver-core で定義」とあるが、conver-core が
   未実装のため、本 crate の backend.rs 内に定義する。将来 conver-core が実装された際に
   当該 trait を移譲する可能性を残す（非破壊的変更の範囲内なら許容）。
2. **batch_update / batch_delete の非 atomic性**: 現設計では複数ファイルの batch 操作は
   逐次実行であり、中途でのエラーによるロールバックは保証されない。この制約は設計上の
   選択としてチケットに明記する。
3. **同期 I/O**: 本 crate は全操作を同期 I/O (std::fs) で実装する。非同期ランタイムは
   使用しない。
