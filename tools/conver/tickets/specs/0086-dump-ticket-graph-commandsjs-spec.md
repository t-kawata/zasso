---
ticket_id: 86
title: dump-ticket-graph-commands.js spec書き込み不能バグ修正
slug: dump-ticket-graph-commandsjs-spec
status: made
created_at: 2026-07-13
updated_at: 2026-07-13
---

# dump-ticket-graph-commands.js: `resolveSpecPath()` 常に null バグの修正

## Summary

`dump-ticket-graph-commands.js` の `resolveSpecPath()` 関数は、チケットキー（例: `P0-1`）から spec ファイルのパスを解決するロジックが未実装であり、常に `null` を返す。その結果、`make-ticket` の Step 7 で呼び出されても spec ファイルへの「RFC設計グラフ構造探索コマンド」セクションの自動追記が機能していない。本チケットはこの `resolveSpecPath()` を Tickets.json の `referenceSection` フィールドから spec パスを解決する実装に修正する。

## Background

### パイプライン全体の中でこのバグがなぜ問題か

`graphify → boundify → split → make → plan → start → review` のパイプラインにおいて、`make-ticket` は graphify で生成されたグラフ情報を spec に初めて書き込む最初の工程である。この工程で spec への情報書き込みが不完全だと、後続の plan/start/review の全工程で情報の再調査負荷が発生し、トレーサビリティが断絶する。

`dump-ticket-graph-commands.js` の役割は、チケットの `nodeIds` に対応するグラフノードへの `query.js` 探索コマンドを spec に自動追記することである。これにより、実装者は spec を読むだけでグラフ構造（ノード間の関係性）にアクセスできる。しかし `resolveSpecPath()` が常に `null` を返すため、この自動追記は全く機能していない。

### 発見経緯

本バグは `/make-ticket` の make-ticket.md 改修調査において、`dump-ticket-graph-commands.js` のコードレビュー中に発見された。graphify → boundify → split パイプラインの情報資産が make-ticket で spec に書き起こされていない問題の根本原因の1つである。

### コード上の証拠

`dump-ticket-graph-commands.js` の `resolveSpecPath()` 関数（L287-321）:

```javascript
function resolveSpecPath(ticketKey) {
  const specDirs = ['tickets/specs'];  // ← 想定: tools/conver/tickets/specs/
  let specDir = null;
  for (const dir of specDirs) {
    if (fs.existsSync(dir)) {
      specDir = dir;
      break;  // ← 発見: tickets/specs/ は存在するのでここで止まる
    }
  }
  if (!specDir) return null;  // ← 通過しない

  let files;
  try {
    files = fs.readdirSync(specDir);  // ← 全 spec ファイルの一覧を取得
  } catch { return null; }

  // P0-1 → 0-1 を含むファイルを探す… とコメントには書いてあるが、
  // 実際のマッチングロジックが実装されていない！
  return null;  // ← ★ 常に null を返す
}
```

仕様と実装の乖離:
- コメント（L316-318）には「P0-1 → 0-1 を含む」と要件が書かれている
- しかし実際の返り値は常に `null` である
- 呼び出し側（L450-466）は `specPath` が `null` の場合、spec 追記を静かにスキップする（エラーにもならない）
- したがって spec への追記は一度も実行されたことがない

### 影響範囲

このバグにより、`make-ticket` の Step 7 で dumpt-ticket-graph-commands.js が呼び出されても以下の現象が発生する:

1. スクリプトは正常終了する（exit 0）— エラーとして検出されない
2. stdout に「RFC設計グラフ構造探索コマンド」セクションの内容が出力される
3. しかし spec ファイルには何も書き込まれない
4. ユーザーは追記されたことに気づかない（誰も stdout を見ていない）
5. 存在しないグラフの場合のメッセージ出力は機能するが、存在するグラフの spec 書き込みが死んでいる

これはまさに「サイレント障害」であり、`exit 0` で成功を装う最も有害なパターンのバグである。

### 依存関係

このバグ修正は PX-50（dump-node-context-to-spec.js 新規作成）および PX-51（make-ticket.md 改修）の前提条件である。PX-49 が修正されない限り、dump-ticket-graph-commands.js → spec の書き込み経路が機能せず、パイプライン全体の情報連携が不完全なままとなる。

## Scope

### 変更対象

- `.claude/scripts/rfc-graph/dump-ticket-graph-commands.js` — `resolveSpecPath()` の完全実装

### 実装要件

1. **spec ファイル名の命名規則の確定**: spec ファイルは `tickets/specs/{4桁ゼロ埋めID}-{slug}.md` 形式。チケットキー `P{phaseID}-{ticketID}` から spec ファイルパスを以下の手順で解決する:
   - phaseId と ticketId を解析（例: `P0-1` → phaseId=0, ticketId=1）
   - Tickets.json の全フェーズを走査し、一致する phase.tickets[].id のチケットを見つける
   - そのチケットの `referenceSection` フィールドから spec ファイルパスを直接取得する（最も確実）
   - `referenceSection` がない場合は null を返す（推測による誤追記を防ぐ。呼び出し元で静かにスキップ）

2. **spec 追記の冪等性**: 同一セクションが既に存在する場合は重複追記しない（先頭の `### RFC設計グラフ構造探索コマンド` の有無で判定）

3. **存在確認**: 解決した spec ファイルが実際に存在する場合のみ追記を実行する

### 変更しないもの

- スクリプトの外部インターフェース（CLI 引数形式: `--tickets=`, `--graph=`, `--source=`）
- 標準出力へのコマンド一覧出力（既存の出力は維持）
- グラフ不在時の挙動（仕様通り正常終了）
- 既存のテストケース

## Non-scope

- PX-50 で作成する `dump-node-context-to-spec.js` の設計判断は一切含めない
- `resolveSpecPath()` 以外の既存関数のリファクタリングは含めない
- `dump-ticket-graph-commands.js` のテストファイル作成は含めない

## Investigation

### 現状のコード詳細

`/Users/kawata/shyme/zasso/.claude/scripts/rfc-graph/dump-ticket-graph-commands.js`

- L287-321: `resolveSpecPath(ticketKey)` — 常に `null` を返す
- L329-333: `appendToSpec(specPath, section)` — ファイル追記関数自体は正常
- L450-466: `main()` 内の spec 追記ループ — `resolveSpecPath` が null なのでスキップされる
- テストファイル: `tests/dump-ticket-graph-commands.test.cjs` — 既存テストは spec 追記をテストしていない

### パス解決の正しい方法

チケットキーから spec ファイルパスを解決するには、Tickets.json を読み込んで該当チケットの `referenceSection` フィールドを取得するのが最も信頼性が高い。なぜなら:

- spec ファイル名は `create-spec.js` によって生成される
- `add-ticket.js` に渡すチケットJSON の `referenceSection` フィールドに spec パスが設定される
- したがって `referenceSection` が Tickets.json にあれば、ファイルシステムの名前解決よりも正確

現在の `resolveSpecPath()` は spec ディレクトリのファイル名から推測しようとするが、以下2点の理由で脆弱であるため、実装しない:
- spec ファイル名の `ticketId` とチケットキーの `ticketID` が同一とは限らない（異なる採番体系の場合がある）
- spec ファイル名の slug とチケットキーの間に直接の対応関係がない
- 不確実な推測で誤ったファイルに追記するリスクを避けるため、`referenceSection` がない場合は null を返す方針とする

### 解決方法

`resolveSpecPath(ticketKey)` を以下の実装に書き換える:

```javascript
function resolveSpecPath(ticketKey, ticketsJsonPath) {
  // ticketKey から phaseId と ticketId をパース (例: "P0-1" → {phaseId: 0, ticketId: 1})
  // "PX-1" の場合は phaseId = -1
  // Tickets.json を読み込み、該当チケットの referenceSection を取得
  // referenceSection が存在する場合のみ、絶対パスに解決して返す
  // 存在しない場合は null（呼び出し元でスキップ。推測による誤追記を避ける）
}
```

このためには `resolveSpecPath` のシグネチャ変更が必要。現在は `ticketKey` のみを受け取るが、`ticketsJsonPath` も引数として受け取れるようにする。

### 修正戦略

最小限の修正（Surgical Diff）:
1. `resolveSpecPath` のシグネチャを `(ticketKey, ticketsJsonPath?)` に拡張
2. Tickets.json を読み込んで `referenceSection` からパスを解決するロジックを実装
3. `main()` 内の呼び出し箇所を更新
4. テストファイルを更新（`resolveSpecPath` の新テストを追加）

## Test Plan

### ユニットテスト計画

既存テスト `tests/dump-ticket-graph-commands.test.cjs` にテストケースを追加する:

1. **正常系: チケットキーから spec パスを解決できる**
   - PX-49 のキーと Tickets.json のパスを渡し、`tickets/specs/0086-...` が返ることを確認
   
2. **正常系: `referenceSection` が存在しない場合は null**
   - `referenceSection` を持たないチケットキーを渡し、null が返ることを確認

3. **正常系: spec ファイルが存在しないパスでもエラーにならない**
   - 存在しない spec ファイルパスを指す `referenceSection` でも例外を投げず null を返す

4. **異常系: 存在しないチケットキー → null**
   - `P999-999` のような存在しないキーで null が返る

5. **regression: 既存の全テストが passing**
   - 修正前の全テストが新しい実装でも通過する

### ユニットテスト不可能な項目（例外）

- 該当なし（全ロジックは純粋関数としてテスト可能）

## Boy Scout Rule — 翻訳可能性計画

- `resolveSpecPath` を「チケットキーからTickets.jsonを経由してspecパスを解決する」という一責務の関数に明確化する（現在はファイル名からの推測と referenceSection のハイブリッド未満の状態）
- `main()` で使われている `graphFileExists` 変数名のスコープを見直す（現在は関数全体で1回しか使われていない）
- ハードコードされた spec ディレクトリ名は定数として定義する
- 関数内の条件分岐は早期 return で浅くする

## Acceptance Criteria

- [x] 実装要件を満たしている
- [ ] `resolveSpecPath("PX-49", "./Tickets.json")` が `tickets/specs/0086-dump-ticket-graph-commandsjs-spec.md` を返す
- [ ] `referenceSection` がないチケットに対して null を返す（エラーにしない）
- [ ] 既存テストケースが全件パスする
- [ ] 修正後、dump-ticket-graph-commands.js --tickets=Tickets.json --graph=... --source=... で spec にセクションが追記される
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テストが通過している

## Notes

### 依存関係

- **PX-50** (dump-node-context-to-spec.js): 本チケットの修正後、PX-50 のスクリプトでも同様の spec パス解決ロジックを利用できるようにすること。**PX-49 で `scripts/lib/` に共通モジュール `resolve-spec-path.js` として抽出する**。PX-50 はそれを import して使用する。
- **PX-51** (make-ticket.md): 本チケットの成果物を Step 7 で利用する

### パイプライン情報連携における位置づけ

```
graphify → boundify → split
                            \
                             → make-ticket (PX-49, PX-50, PX-51)
                                ↑ ここで spec への情報書き込み経路を確立する
                                → plan-ticket
                                → start-ticket
                                → review-ticket
```

PX-49 はこの経路のうち「query.js コマンド」の書き込み経路を修復する。PX-50 が「ノード詳細・エッジ関係・ファイルパス」の書き込み経路を新設し、PX-51 が全体を統合する。

### 関連チケット

- **PX-50** (依存: 本チケットの成果を利用する): `resolveSpecPath` の実装パターンを参考にする
- **PX-51** (依存: 本チケットの成果を利用する): Step 7 で dump-ticket-graph-commands.js を実行
- **PX-1-37〜PX-1-41** (phasify 基盤のチケット群): 本バグが phasify/チケット化の後工程に影響を与えていることはないか確認済み
- **PX-1-42** (default_files スキーマ追加): default_files の spec 自動書き込みは PX-50 で対応

### 設計判断

- `resolveSpecPath` は Tickets.json の `referenceSection` を信頼する方針とした。ファイル名の推測は脆弱であるため
- `appendToSpec` は既に正常動作しているため修正不要
- テストは既存テストファイル（test.cjs）に追加することで、regression テストを容易にする
