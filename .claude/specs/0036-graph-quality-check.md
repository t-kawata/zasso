---
ticket_id: 13
title: グラフ品質点検機構の整備
slug: untitled-2
status: draft
created_at: 2026-07-09
updated_at: 2026-07-09
---
# グラフ品質点検機構の整備

## Summary

graphify-rfc.md Step 4「AI による品質点検」に、ランダムサンプリングによる機械的目視確認プロトコルを導入する。`query-all-nodes.sh` で全ノードの query.js 結果を `_quality/` に保存し、総ノード数の8%（切り捨て）を乱数で選出、`get-node-for-check.js` で個別点検を可能にする。`_quality/` ディレクトリは cleanup 対象とする。

## Background

graphify-rfc.md Step 4「AI による品質点検」は6つの点検観点を列挙しているが、手段が明記されているのは観点6（test-query-all.js による headingRefs 解決確認）のみ。観点1〜3は query.js による目視確認が必須だが、全ノードに対して query.js を実行した結果は膨大で、AI が一度に読むことは不可能である。

解決策：
1. `query-all-nodes.sh` が全ノードの query.js 結果を個別ファイルとして `_quality/` に書き出す（一度に読む必要がない）
2. 総ノード数の8%（切り捨て）を乱数で重複なく選出し、`get-node-for-check.js` のコマンド一覧を提示する
3. AI は提示されたコマンドを1つずつ実行して目視確認する
4. `_quality/` は cleanup で削除対象とする

## Scope

1. `query-all-nodes.sh` の新規作成（`.claude/scripts/rfc-graph/`）
   - 全ノードに対して `query.js --hops=2` を実行し、結果を `_quality/Nxxxx.md` に保存
   - 総ノード数を取得
   - 8%（切り捨て）のノードを乱数で重複なく選出
   - 選出されたノードの `get-node-for-check.js` コマンド一覧を stdout
2. `get-node-for-check.js` の新規作成（`.claude/scripts/rfc-graph/`）
   - 引数 `Nxxxx` を受け取り、`_quality/Nxxxx.md` の内容を表示
   - 末尾に3つの点検項目を追加表示
3. `graphify-rfc.md` の改修
   - 「AI による品質点検」セクションを新プロトコルで置き換え
   - cleanup 対象に `_quality/` を追加

## Non-scope

- query.js 本体の改修（別チケット）
- test-query-all.js の改修（PX-35 で対応済み）

## Investigation

### `query-all-nodes.sh` の動作仕様

- カレントディレクトリに `_quality/` を作成
- グラフJSONの全ノードに対して `node .claude/scripts/rfc-graph/query.js --graph=<g> --source=<s> --id=Nxxxx --hops=2` を実行
- 各ノードの出力を `_quality/Nxxxx.md` に保存（既存ファイルは上書き）
- stdoutに選出ノードのコマンド一覧を出力：

```
全168件のノードのうち13件を選出した。以下のコマンドで内容を表示し、下記「点検項目」を点検しなさい。

node .claude/scripts/rfc-graph/get-node-for-check.js N0002
node .claude/scripts/rfc-graph/get-node-for-check.js N0024
node .claude/scripts/rfc-graph/get-node-for-check.js N0107
```

### `get-node-for-check.js` の動作仕様

- `_quality/Nxxxx.md` の内容を表示
- 末尾に以下を追記：

```
# 点検項目
1. 他のノードとの関係性が設計文書の記述を正しく反映しているか
2. 各ノードの内容が設計文書の該当箇所を過不足なくカバーしているか
3. /formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドがこのグラフからチケット分解する際に、不足している情報がないか
```

### 選出アルゴリズム

- 選出個数 = `Math.floor(totalNodes * 0.08)`
- 1未満の場合は必ず1件選出
- bash `$RANDOM` を使用（実行ごとに結果が変わる）
- 重複なく選出（選出済みIDは除外）
- ノードID一覧を配列化し、Fisher-Yates の先頭N件を取る方式で安定

### 関連チケット

- PX-33: query.js 改修（query.js の呼び出しが依存）
- PX-34: graphify-rfc.md cleanup 対象拡張（本チケットでさらに拡張）

## Test Plan

### ユニットテスト計画

スクリプトのため動作検証で代替：

| 検証項目 | 検証方法 |
|---------|---------|
| `_quality/` に全ノード分のファイル生成 | `ls _quality/*.md \| wc -l` で総数確認 |
| 選出ノード数が正しい | `total * 0.08` 切り捨てと一致 |
| 選出に重複なし | 選出IDがユニーク |
| get-node-for-check.js 表示 | 1ノード実行して内容確認 |
| 実行ごとに選出が異なる | 2回実行して異なることを確認 |
| cleanup で削除 | cleanup 後にディレクトリ不在確認 |

### ユニットテスト不可能な項目（例外）

- query.js の正しい動作（別チケット検証済み）

## Boy Scout Rule — 翻訳可能性計画

新規スクリプト：
- 関数名は動詞句
- 変数名はドメイン概念
- 一関数一責務
- ハードコード値は名前付き定数（SAMPLE_RATE=0.08）
- エラーは stderr に報告し exit 1

## Acceptance Criteria

- [ ] `query-all-nodes.sh` が全ノードの `_quality/Nxxxx.md` を生成する
- [ ] 選出ノード数が `Math.floor(totalNodes * 0.08)` と一致する
- [ ] 選出ノードに重複がない
- [ ] 実行ごとに選出結果が異なる
- [ ] `get-node-for-check.js Nxxxx` が内容＋点検項目を表示する
- [ ] 存在しないノードIDでエラーメッセージを表示
- [ ] graphify-rfc.md の品質点検セクションが書き換わっている
- [ ] cleanup に `_quality/` 削除が含まれている

## Notes

- 全ファイルとも `tools/conver/.claude/` 内に限る
- 新規: `.claude/scripts/rfc-graph/query-all-nodes.sh`
- 新規: `.claude/scripts/rfc-graph/get-node-for-check.js`
- 改修: `.claude/commands/graphify-rfc.md`
- 選出個数が1未満の場合は必ず1件選出
