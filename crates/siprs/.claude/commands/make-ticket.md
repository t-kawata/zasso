---
description: 実装仕様（spec）の詳細文書の作成と詳細化。P{phaseID}-{ticketID} 形式のチケットキーが必須。resolve-ticket-context.js が最初に実行され機械的に全てを判断する。
---

# /make-ticket

**第一級規則 — [::STUB::] マーカー絶対義務**: 不完全な実装（スタブ・モック・仮実装・プレースホルダー等、名称を問わず）には全て `[::STUB::]` マーカーを付与しなければならない。これは死守すべき絶対的法規であり、違反は「犯罪」として Malfeasance.json に記録される。本コマンドの全フェーズにおいて、Malfeasance.json を読み取り未解決の犯罪がないことを確認すること。違反を発見した場合は直ちに解決するか、その場でマーカーを追加・記録する。

**役割**: 実装仕様（spec）の詳細文書の作成と詳細化。

## ワークフローにおける位置づけ

このプロジェクトの作業の流れは `make → plan → start → review` である。

- **`/make-ticket`**: 実装仕様（spec）の詳細文書の作成と詳細化。。
- **`/plan-ticket`**: 実装レベルの詳細な計画。
- **`/start-ticket`**: 実装。
- **`/review-ticket`**: 完了したチケットをレビュー。

**ルール**: 自分の役割を完了したら、必要に応じて次のアクションを提案。

## 引数の解釈

- `P{phaseID}-{ticketID}` 形式（例: `P0-1`, `PX-53`） → チケットキー。必須。最初に `resolve-ticket-context.js` に投入する。
- 引数なし → エラーで中断
- 数字のみ → エラーで中断
- 上記以外 → エラーで中断

## Boy Scout Rule

新規作成時、spec の「Boy Scout Rule — 翻訳可能性計画」セクションに以下を必ず含める：関数名は動詞句、変数名はドメイン概念、一関数一責務、ハードコード値は名前付き定数、エラー握りつぶし禁止。**スコープ内外問わず、翻訳可能性を損なう既存コードを積極的に改善する計画を記載する。**

## 使用スクリプト一覧

`.claude/scripts/tickets/` 配下。詳細は `.claude/scripts/tickets/README.md` を参照。

| スクリプト | 引数 | 説明 |
|---|---|---|
| `add-ticket.js` | `<PATH of Tickets.json> P{phaseID}`（stdin: チケットJSON） | チケット追加。内部的に resolve-ticket-context.js から呼ばれる |
| `add-phase.js` | `<PATH of Tickets.json>`（stdin: フェーズJSON） | フェーズ追加 |
| `get-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` | チケット情報取得 |
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}`（stdin: 更新JSON） | チケットフィールド更新 |
| `search-tickets.js` | `<PATH of Tickets.json> <query>` | 全文検索 |
| `create-spec.js` | `"" <title>` | spec スケルトン生成。内部的に resolve-ticket-context.js から呼ばれる |
| `resolve-ticket-context.js` | `--ticket-key=<P{id}-{id}> --title="..."` | 中央判断エンジン。Tickets.json 保証・spec自動作成・チケット追加・パイプライン判定・instruction 発行を単一呼び出しで完了。--title は必須（PX-49〜PX-55） |
| `dump-node-context-to-spec.js` | `--tickets=... --graph=... --dirs-tree=... --ticket-key=...` | 設計コンテキストを spec に自動追記 |

## ワークフロー

### Step 1: コンテキスト解決（単一呼び出し）

`resolve-ticket-context.js` が全ての機械的判断を単一の呼び出しで行う。

```bash
# --title は必須（チケット及びspecファイルのタイトルをAIが考えて入れる）
node .claude/scripts/tickets/resolve-ticket-context.js \
  --ticket-key=$ARGUMENTS \
  --title="チケット及びspecファイルのタイトル"
```

出力の主なフィールド:

| フィールド | シェル変数 | 意味 |
|-----------|-----------|------|
| `ticketKey` | `$TICKET_KEY` | チケットキー（例: PX-53） |
| `specPath` | `$SPEC_PATH` | spec ファイルのパス |
| `docPath` | `$DOC_PATH` | 設計書（RFC）のファイルパス |
| `graphPath` | `$GRAPH_PATH` | GRAPH.json のファイルパス |
| `dirsTreePath` | `$DIRS_TREE_PATH` | Dirs-Tree.json のファイルパス |
| `pipelineAvailable` | `$PIPELINE_AVAILABLE` | パイプライン情報の有無 |
| `instruction` | （文字列） | AI が次に行うべきアクション |

### Step 2: 調査・記述

#### 2a: ソースコード調査

`$PIPELINE_AVAILABLE=true` なら GRAPH.json のノード情報を活用した調査、`false` ならスポット調査。

#### 2b: 証拠の記録

```bash
echo '{"background":"調査結果の詳細...","referenceSection":"src/foo.rs:42","notes":"再現手順: ..."}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$TICKET_KEY"
```

#### 2c: 仕様の具体化

**「設計コンテキスト」ブロックについて**: dump-ticket-graph-commands.js と dump-node-context-to-spec.js によって 2d で自動追記される4セクションを意識して spec を設計する。

Test Plan 具体化後、JSON フィールドに反映:
```bash
echo '{"scope":["範囲..."],"testVerification":["テスト..."],"testExceptions":["例外..."]}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$TICKET_KEY"
```

#### 2d: 設計コンテキストの spec 自動書き起こし

`$PIPELINE_AVAILABLE` が true の場合のみ実行:

```bash
node .claude/scripts/rfc-graph/dump-ticket-graph-commands.js \
  --tickets=Tickets.json --graph=$GRAPH_PATH --source=$DOC_PATH

node .claude/scripts/rfc-graph/dump-node-context-to-spec.js \
  --tickets=Tickets.json --graph=$GRAPH_PATH \
  --dirs-tree=$DIRS_TREE_PATH --ticket-key=$TICKET_KEY
```

#### 2e: 依存・関連チケットID の点検

```bash
node ".claude/scripts/tickets/search-tickets.js" "Tickets.json" "<キーワード>"
```

#### 2f: 犯罪の点検

```bash
.claude/scripts/tickets/scan-crimes.sh
node .claude/scripts/tickets/review/find-all-stubs.js .
```

#### 2g: ステータス更新

```bash
echo '{"status":"made"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```
