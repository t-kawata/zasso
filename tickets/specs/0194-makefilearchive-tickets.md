---
ticket_id: 194
title: Makefileにarchive-ticketsコマンドを追加する
slug: makefilearchive-tickets
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0194-makefilearchive-tickets/review.md
---

# Makefileにarchive-ticketsコマンドを追加する

## Summary

Makefile に `archive-tickets` ターゲットを追加する。このコマンドはキュー（`tickets/queue.md`）、仕様書（`tickets/specs/`）、コンテキスト（`tickets/context/`）の現在の状態をタイムスタンプ付きで `tickets/archive/` に退避（コピー）し、元の場所を空にする。

## Background

zasso プロジェクトでは 260 以上のチケットが蓄積されており、`tickets/specs/` と `tickets/context/` には 260 ファイル以上、`tickets/queue.md` は 260 行超となっている。これにより以下の問題が発生している：

- **検索性の低下**: ディレクトリエントリ数が増え、チケット一覧表示やファイル検索が遅くなっている
- **バックアップ不在**: キューの状態を定期的にスナップショットとして保存する仕組みがなく、誤操作からの回復が困難
- **クリーンスタートの障壁**: `tickets/` 配下を整理したい場合に、全て手動で退避する必要がある

定期的なアーカイブにより、キューの履歴を追跡可能にしつつ、作業中のチケット群をクリーンな状態に保つ。

## Scope

1. **`.claude/scripts/tickets/archive-tickets.sh`** の作成
   - タイムスタンプ生成（`YYYYmmdd_HHMMSS` 形式）
   - `tickets/archive/YYYYmmdd_HHMMSS/` ディレクトリ作成
   - `tickets/queue.md` のコピー
   - `tickets/specs/` 内の全ファイルのコピー
   - `tickets/context/` 内の全ディレクトリのコピー
   - コピー元のクリア（`queue.md` はヘッダー行のみ残す、`specs/` と `context/` は空にする）

2. **`Makefile` への `archive-tickets` ターゲット追加**
   - `.PHONY` に `archive-tickets` を追加
   - 上記シェルスクリプトを呼び出すターゲット定義

3. **アーカイブ先の `.gitignore` 確認**
   - `tickets/archive/` が git 管理対象外であることを確認する

## Non-scope

- アーカイブからの復元コマンドの作成（必要なら別チケット）
- 古いアーカイブの自動削除・クリーンアップ（必要なら別チケット）
- アーカイブの圧縮（tar.gz 等）

## Investigation

### 現状把握

| 項目 | 値 |
|------|-----|
| `tickets/queue.md` 行数 | 266 行 |
| `tickets/specs/` ファイル数 | 262 ファイル |
| `tickets/context/` ディレクトリ数 | 261 ディレクトリ |
| `tickets/archive/` | 空（`.gitignore` 対象の空ディレクトリ） |

### Makefile の既存パターン（抜粋）

Makefile は以下のパターンでコマンドを定義している：

- **シェルコマンド直書き**: `push`, `pull`, `branch` 等の git 操作（複数行の `@` コマンド）
- **Node.js スクリプト呼び出し**: `stubs`, `crimes` 等のチケット操作（`.claude/scripts/tickets/` 配下）
- **`.PHONY` 宣言**: ファイル名とターゲット名の競合防止のため全ターゲットを列挙（Makefile 29-35行目）

`archive-tickets` ターゲットの実装はシェルスクリプト方式を採用する。理由：
- 必要な操作（mkdir, cp, rm, date）は全て pure shell で完結する
- Node.js の依存を増やさない
- `make archive-tickets` で直接実行できる

### 関連チケット検索結果

"archive" / "backup" / "キュー" で検索したが、関連チケットは本チケット（#194）のみ。既存のアーカイブ機構は存在しない。

### Malfeasance 点検

`scan-crimes.sh` を実行した結果、未解決の犯罪（`[::STUB::]` 未付与の不完全実装）は 0 件。本チケットが新たな不完全実装を導入しないよう、スクリプト内の全ロジックは完全な実装とする。

## Test Plan

### 検証手順

本チケットは Makefile ターゲットとシェルスクリプトの作成が主であり、Rust/Node.js のテストフレームワークの対象外。以下の手動検証ですべての Acceptance Criteria を確認する：

1. **スクリプト単体動作確認**
   - シェルスクリプトを直接実行して、`tickets/archive/YYYYmmdd_HHMMSS/` が作成されることを確認
   - アーカイブディレクトリ内に `queue.md`・`specs/`・`context/` が存在することを確認
   - コピー元の `queue.md` がヘッダーのみになっていることを確認
   - `tickets/specs/`・`tickets/context/` が空になっていることを確認

2. **Makefile 経由の動作確認**
   - `make archive-tickets` が正常終了（exit 0）すること
   - スクリプト単体実行と同等の結果が得られること

3. **冪等性確認**
   - 同じ状態で再実行してもエラーが発生しないこと（空の `queue.md` に再実行しても問題なし）
   - 存在しないファイルをコピーしようとしないこと

4. **整合性確認**
   - アーカイブ後の `tickets/specs/` と `tickets/context/` が期待通り空であること（`ls` で確認）

### ユニットテスト不可能な項目（例外）

- **シェルスクリプトの動作検証**: ファイルシステム操作（mkdir, cp, rm）は Rust/Node.js のユニットテストフレームワークでは直接テストできない。実際の環境での動作確認が適切。
- **Makefile の構文検証**: Makefile の構文エラーは `make` コマンド実行時に検出される。これらはテストコードでは事前検出できない。

## Acceptance Criteria

1. `make archive-tickets` を実行すると、`tickets/archive/YYYYmmdd_HHMMSS/` が作成される
2. アーカイブディレクトリ内に `queue.md`・`specs/`・`context/` がコピーされている
3. `tickets/queue.md` は「# Ticket Queue」のヘッダー行のみになる
4. `tickets/specs/` と `tickets/context/` は空のディレクトリになる
5. アーカイブされた内容と元の内容が完全に一致する（コピー欠落なし）
6. `.PHONY` に `archive-tickets` が宣言されている
7. 既存の `.gitignore` により `tickets/archive/` が git 管理対象外である

## Boy Scout Rule — 翻訳可能性計画

本チケットのスコープは新規シェルスクリプトと Makefile への追加のみ。翻訳可能性を損なう既存コードの修正は以下の範囲で行う：

- **新規スクリプト内**: 
  - 関数名/変数名はドメイン概念で命名（`TIMESTAMP`, `ARCHIVE_DIR` 等）
  - `set -euo pipefail` でエラーを確実に検出（エラー握りつぶし禁止）
  - 全コマンドブロックに日本語コメントを付与し意図を説明
  - ハードコード値なし（タイムスタンプは `date` コマンドで動的生成）
- **Makefile 編集箇所**: 
  - 既存のコメントパターン（`# ═══════` 区切り + 日本語コメント）に従う
  - 周辺の既存コードは変更しない（Surgical Diff の原則）
