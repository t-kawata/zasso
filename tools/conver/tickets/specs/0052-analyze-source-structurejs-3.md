---
ticket_id: 52
title: analyze-source-structure.js — 3軸分割支援の機械的情報提供スクリプト
slug: analyze-source-structurejs-3
status: made
created_at: 2026-07-06
updated_at: 2026-07-06
ticket_key: PX-17
---

# `analyze-source-structure.js` — 3軸分割支援の機械的情報提供スクリプト

## Summary

graphify-rfc の Step 1（ノード分割）において、AI が自力で Markdown 構造解析・kind 推定・依存スキャン・行数計算をするのは無駄が多く、分割粒度にバラつきが生じる。本スクリプトはこれらを**機械的に事前抽出**し、自然言語レポートとして標準出力に出力する。AI はこのレポートを参照することで、分割判断に集中できる。第2軸・第3軸の判断はあくまで AI が行うものであり、本スクリプトは「情報提供」に徹する。

## Background

graphify-rfc.md の Step 1 は現在、3軸の分割基準を記述しているのみで、機械的な情報提供手段がない。これにより：
- AI が毎回自力で Markdown の構造を解析する冗長さ
- kind の推定が AI の知識のみに依存し、バラつく
- 外部依存の見落としが発生する
- コードスニペットを含む行数と実質記述行数の区別ができず、粒度の目安（30〜50行）が正しく適用できない

これらを解決するため、`.claude/scripts/rfc-graph/analyze-source-structure.js` を新規作成し、graphify-rfc Step 1 の最初のサブステップとして実行する。

## Scope

### 対象
- `.claude/scripts/rfc-graph/analyze-source-structure.js` の新規作成（CommonJS）
- `tests/rfc-graph/analyze-source-structure.test.cjs` の新規作成
- `.claude/commands/graphify-rfc.md` Step 1 への呼び出し追加

### スクリプトが出力するもの（標準出力に自然言語レポート）
以下の4情報を標準出力に自然言語で出力する。JSON/YAML は使用しない（トークン節約と即時利用性のため）。

#### 1. 基本情報
```
総行数: 833行（うちコードブロック: 313行、実質記述: 520行）
```

#### 2. セクションツリー（第1軸支援）
各見出しのレベル・行範囲・実質記述行数・コードブロック件数を出力：
```
<h1>: L1-L5     4行    Abstract
<h1>: L6-L20   15行    Motivation
<h2>: L22-L45  18行(1)  3.1 アーキテクチャ概要
```

#### 3. kind 候補（第2軸支援 — あくまで機械的な候補提示）
見出し文字列と本文キーワードのパターンマッチにより、各セクションの kind 候補を推定する。出力には「これは機械的な候補であり、AI が判断を上書き可能」という但し書きを含める（判断はAI、支援はスクリプト）。

```
## kind 候補（機械的推定。AI が判断を上書き可能）
L22-L45   architecture  ← 見出しに "アーキテクチャ"
L59-L94   data_model    ← 見出しに "スキーマ", 本文に struct type required
```

#### 4. 外部依存レポート（第3軸支援 — 同上、あくまで情報提供）
```
## 外部依存ありセクション（検出されたパターン）
L441-L464  ファイルI/O (fs.readFileSync, fs.writeFileSync)
L468-L488  ファイルI/O
```

#### 5. 100行超セクション一覧（強制分割候補の機械的特定）
```
## 100行超セクション（コードブロック除く実質記述行数）
L21-L433  記述105行(2)  Design  ← 実質100行超のため強制分割候補
```

### キーワード照合パターン（第2軸）

kind 推定のためのパターンは以下を網羅する。見出しに該当文字列が含まれる場合を最優先し、本文キーワードは補助的に使用する。

| kind | 見出しトリガー | 本文キーワード |
|------|--------------|--------------|
| requirement | 要件, 要求, 必須, 条件, 必要, 機能要件, 非機能要件 | must, shall, need to, 必要がある, しなければならない, 必須, 〜する必要, 〜できること |
| api_contract | API, エンドポイント, インターフェース, I/F, REST, Web API, インタフェース | POST, GET, PUT, DELETE, PATCH, HTTP, request, response, endpoint, route, handler, fetch, api/, /v1/, ステータスコード, status code, リクエストボディ |
| data_model | データモデル, スキーマ, 型定義, エンティティ, DB, データベース, テーブル, ストレージ, データ構造, モデル定義, entity, カラム, フィールド定義 | struct, type, field, column, primary key, foreign key, index, migration, CREATE TABLE, ALTER TABLE, SELECT, INSERT, where, join, schema |
| state_machine | 状態機械, 状態遷移, ステート, ステートマシン, 状態, 遷移, workflow, ワークフロー, フェーズ, ライフサイクル, 状態図 | state, transition, event, state_machine, status, enum, match, 遷移条件, ガード条件, guard, trigger |
| architecture | アーキテクチャ, 構成, コンポーネント, モジュール構成, システム構成, レイヤ, 階層, 全体図, コンポーネント図, システム設計, モジュール, サブシステム | component, module, layer, architecture, dependency, 依存関係, 結合, interface, 責務, responsibility, 配置, deploy構成 |
| security | セキュリティ, 認証, 認可, 暗号, 脅威, プライバシー, セキュリティ対策, セキュリティモデル, アクセス制御, 監査, コンプライアンス | auth, token, password, encrypt, decrypt, hash, JWT, OAuth, SSL, TLS, certificate, permission, role, ACL, CVE, injection, XSS, CSRF, 攻撃, 認証, 認可, 権限, sanitize, バリデーション |
| error_policy | エラー, エラー処理, エラーハンドリング, 例外, 異常系, 障害, リカバリ, 回復, フォールバック, エラー戦略, 障害対策 | error, exception, panic, fail, fallback, retry, timeout, circuit breaker, graceful, shutdown, グレースフル, リトライ, タイムアウト, catch, Result, Option, unwrap |
| config | 設定, コンフィグ, 環境変数, 設定値, 構成管理, configuration, config, 設定ファイル, パラメータ | env, .env, config, environment variable, setting, YAML, TOML, INI, 設定ファイル, conf, cfg, var, 既定値, default, 初期化, init |
| test_policy | テスト, テスト計画, テスト戦略, 品質, 単体テスト, 結合テスト, E2E, テスト手法, 品質保証 | test, spec, assert, mock, coverage, jest, vitest, playwright, describe, it, should, expect, spy, stub, fixture, CI |
| build_ci | ビルド, CI, CD, デプロイ, リリース, パッケージ, CI/CD, デプロイ戦略, ビルド設定, 継続的インテグレーション | Makefile, cargo, npm, yarn, pnpm, docker, build, publish, release, pipeline, github actions, workflow, artifact, dist, コンパイル, compile |
| rationale | 根拠, 設計判断, 判断根拠, なぜ, 意思決定, 選択理由, 代替案, トレードオフ, 背景, 設計選択, 比較 | therefore, because, reason, trade-off, pros/cons, 理由, 〜のため, なぜなら, したがって, 一方, 比較, 検討, 優位性, デメリット |
| glossary | 用語, 用語集, 定義, 用語定義, 語彙, 辞書, 用語解説 | 用語, 定義, 略語, acronym, 略称, 正式名称, 意味, 説明, すなわち, i.e., e.g., 曖昧さ回避 |

### 外部依存パターン（第3軸）

依存の有無と種別を機械的に検出する。検出は「ファイル全体にわたる本文のパターンマッチ」で行い、依存の強度判断（hard/soft）は AI に委ねる。

| 依存種別 | 検出パターン（部分一致） |
|---------|----------------------|
| ファイルI/O | fs., readFile, writeFile, openFile, mkdir, rmdir, chmod, access, stat, パス, path, File, ファイル読み込み, ファイル書き込み, fsync, rename, unlink |
| ネットワーク | http://, https://, reqwest, axios, fetch(.$|(), websocket, WebSocket, TCP, UDP, socket, connect, listen, port, ネットワーク, curl, 通信, リモート |
| データベース | DB, database, query, SQL, SELECT, INSERT, UPDATE, DELETE, migration, connection pool, orm, prisma, diesel, seaorm, sqlx, コネクション, postgresql, mysql, sqlite, redis, mongo |
| LLM/API | LLM, GPT, Claude, API key, openai, anthropic, completion, embedding, 言語モデル, token, prompt, 推論 |
| 非同期ランタイム | tokio, async, await, Future, Promise, thread, spawn, join, async fn, 非同期, async/await, concurrent, parallel |
| 乱数生成 | random, rand, 暗号論的乱数, crypto.random, Math.random, 乱数, ランダム, UUID, uuid, nonce |
| システム時間 | clock, time, now, SystemTime, chrono, duration, timestamp, date, 日時, 時刻, タイマー, 経過時間 |
| プロセス管理 | process, exit, signal, child_process, exec, spawn, kill, プロセス, シグナル, デーモン, daemon |
| 外部モジュール読込 | require(, import, use `, extern crate, from ', from ", mod, 依存関係, dependency, crate, package, ライブラリ |
| 標準入出力 | stdin, stdout, stderr, print, println, console.log, console.error, output, 標準出力, 標準エラー, 入出力 |
| 設定ファイル読込 | .env, config, YAML, TOML, JSON, 設定ファイル, conf, ini, 読み込み, load, parse |

### 非スコープ
- kind の自動確定（あくまで候補提示。確定は AI）
- 依存の強度判定（hard/soft。判断は AI）
- ノードの自動生成（分割は AI の責務）
- グラフファイルの書き込み（crud.js の専権事項）
- `load-rfc-graph.js` や `dump-ticket-graph-commands.js` への機能追加

## Investigation

### 既存スクリプト群の確認

`.claude/scripts/rfc-graph/` 配下には以下の7ファイルが存在する：
- `crud.js` — グラフCRUD操作。`--graph=<path>` + サブコマンド
- `verify.js` — カバレッジ・孤立ノード検証
- `embed-markers.js` — マーカー埋め込み
- `query.js` — マルチホップ検索
- `update-step-status.js` — GRAPHIFY-Status.json 管理
- `load-rfc-graph.js` — formulate連携（グラフサマリー）
- `dump-ticket-graph-commands.js` — formulate連携（コマンド追記）

全スクリプトは CommonJS、`require` + 関数エクスポート、JSDoc コメント、3段テンプレート（`[ERROR]` / `原因:` / `対応:`）のエラー処理、`atomicWrite` パターンで統一されている。

### ディレクトリ構成

```
.claude/scripts/rfc-graph/
  schema/
    node.schema.json        # kind: 12種列挙
    edge.schema.json        # type: 12種列挙
    graph.schema.json       # 全体構造
    validate.js             # スキーマ検証関数
  crud.js
  verify.js
  embed-markers.js
  query.js
  update-step-status.js
  load-rfc-graph.js
  dump-ticket-graph-commands.js

tests/rfc-graph/
  schema/validate.test.cjs
  crud.test.cjs
  verify.test.cjs
  embed-markers.test.cjs
  query.test.cjs
  update-step-status.test.cjs
  load-rfc-graph.test.cjs
  dump-ticket-graph-commands.test.cjs
  graphify-cmd.test.cjs
  acceptance-criteria.test.cjs
```

### スクリプトのコード規約
- `#!/usr/bin/env node` shebang
- `require('fs')` / `require('path')`
- 公開関数は `module.exports = { ... }` でエクスポート
- 引数パース関数 (`parseArguments`) は `process.argv` を参照
- エラー時は `exitWithError(summary, cause, action)` または同等の関数で3段テンプレートを stderr に出力
- 単体テストは `node:test` + `node:assert/strict` + 一時ディレクトリ (`os.tmpdir`)

## Test Plan

### ユニットテスト計画

| テスト対象 | 正常系 | 異常系 | 境界値 |
|-----------|--------|--------|--------|
| `parseArguments` | ソースパスを正しくパース | 引数不足でエラー、余剰引数でエラー | --help で usage 表示 |
| `extractHeadingTree` | 複数階層の見出しを正しく抽出 | 見出しなしのファイルは空配列 | コードブロック内の`#`を見出しと誤認しない |
| `countProseLines` | コードブロックを除外した行数を計算 | コードブロックが閉じていない場合は全行を記述扱い | 空ファイルは0行、コードブロックのみのファイルは0行 |
| `estimateKind` | 全12種の kind が正しいキーワードで推定される | キーワード不在のセクションで空/null を返す | 複数 kind にマッチする場合は候補を列挙 |
| `detectExternalDeps` | 全11種の依存パターンが検出される | 依存なしのファイルは空配列 | コメントアウトされたコードを依存と誤認しない |
| `findLongSections` | 100行超セクションを正しく報告 | 全セクション100行未満なら空報告 | ちょうど100行のセクションは対象外 |
| `formatReport` | 全5情報を含む自然言語レポートが出力される | N/A（string 結合のため） | 空の情報がある場合も「なし」と明示 |
| 統合テスト | 実在のRFC-GRAPHIFY.md に対するレポート出力検証 | 存在しないファイルパスでエラー | 最小RFC（1行）で正常動作 |

### ユニットテスト不可能な項目（例外）
- なし（全機能がメモリ内完結。ファイルI/O は一時ディレクトリでテスト可能）

## Boy Scout Rule — 翻訳可能性計画

- `analyze-source-structure.js` の各関数は「文」として読める動詞句にする
  - `extractHeadingTree(sourceLines)` — 見出しツリーを抽出
  - `countProseLines(sourceLines, codeBlocks)` — コードブロック行を除外して記述行をカウント
  - `estimateKind(heading, bodyText)` — 見出しと本文から kind 種別を推定
  - `detectExternalDeps(bodyText)` — 本文から外部依存パターンを検出
  - `formatReport(sections, kinds, deps, longSections)` — 自然言語レポートを組み立て
- ハードコードされたキーワードパターンは定数としてモジュール先頭に定義する
- 関数は一責務とし、1関数30行以内を目標とする
- `fs.readFileSync` 以外の外部依存を持たない

## Acceptance Criteria

- [ ] `analyze-source-structure.js` が #! node スクリプトとして実装されている
- [ ] 存在する Markdown ファイルに対してセクションツリーを正しく出力する
- [ ] コードブロック行を除外した実質記述行数を計算できる
- [ ] 全12種の kind について、見出し＋本文キーワードから候補を提示できる
- [ ] 全11種の外部依存パターンを機械的に検出できる
- [ ] 100行超セクションを機械的に特定できる
- [ ] 第2軸・第3軸の出力に「機械的候補でありAIが判断を上書き可能」の但し書きを含む
- [ ] キーワード未マッチのセクションには kind を出力しない（空/null で表現）
- [ ] コードブロック内の `#` を見出しと誤認しない
- [ ] コメントアウトされたコード行を依存と誤認しない
- [ ] 既存の全 rfc-graph テストが通過している
- [ ] graphify-rfc.md Step 1 に `analyze-source-structure.js "$1"` の呼び出しが追加されている
- [ ] 全テストが `node:test` で実装され、通過している
