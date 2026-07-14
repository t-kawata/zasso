# /formulate-tickets 改修: Tickets.md → Tickets.json 移行

> **最終更新日:** 2026-06-24
> **対象:** `.claude/commands/formulate-tickets.md`
> **スクリプト数:** 14（新規13・変更1）

## 改修の目的

`/formulate-tickets` の出力を Markdown（Tickets.md）から JSON（Tickets.json）に移行。
JSON Schema によるバリデーションと全 CRUD 操作を備えた生きた計画書とする。

---

## インターフェース

```bash
/formulate-tickets <設計書パス>
# → 設計書同階層に Tickets.json を自動生成（固定）
```

第2引数（出力先指定）と標準出力出力は廃止。

---

## データモデル

### 構造（2階層: Phase → Ticket）

```
Root
├── title: string (required)
├── metadata
│   ├── source: string (required) — 生成元設計書パス
│   ├── generatedAt: string (required) — YYYY-MM-DD
│   ├── analyzedSections: string
│   ├── dependencyModel: string
│   └── additionalProperties: true
├── phases: array
│   └── phase
│       ├── id: integer (required, >= 0) — フェーズを一意に識別
│       ├── name: string (required)
│       ├── externalDependencies: string
│       ├── characteristics: string
│       └── tickets: array
│           └── ticket
│               ├── id: integer (required, >= 1) — フェーズ内で自動インクリメント
│               ├── phaseId: integer (required, >= 0) — 所属フェーズID
│               ├── title: string (required)
│               ├── status: enum(todo/done/reviewed)
│               ├── referenceSection: string
│               ├── scope: string[]
│               ├── testUnit: string[]
│               ├── instrumentation: string
│               └── additionalProperties: true
└── dependencyMap: string
```

### status とチェックボックス

| status | 意味 | 表示 |
|--------|------|------|
| `todo` | 未着手 | `[ ]` |
| `done` | 実装完了 | `[/]` |
| `reviewed` | レビュー完了 | `[x]` |

### 外部キー形式

CLI 上では `P{phaseId}-{ticketId}`（例: `P0-1`）でチケットを特定する。
`parseTicketKey()` 関数でパース → `{ phaseId, ticketId }`。

---

## スクリプト一覧（14 ファイル）

### スキーマ・バリデータ

| ファイル | 役割 |
|----------|------|
| `tickets/tickets-schema.json` | JSON Schema (draft-07)。全 CRUD の検証基準 |
| `lib/validate-tickets.js` | 手書きバリデータ。`validateTickets()`, `validateTicketRecord()`, `parseTicketKey()` をエクスポート。CLI としても使用可 |

### C（作成）

| スクリプト | CLI | 説明 |
|-----------|-----|------|
| `write-tickets-json-template.js` | `node write-tickets-json-template.js <path> '{"title":...,"source":...}'` | 空 skeleton（phases: []）を生成 |
| `add-phase.js` | `echo '{"name":"..."}' \| node add-phase.js <path>` | フェーズ追加。id は 0 から自動採番 |
| `add-ticket.js` | `echo '{"title":...}' \| node add-ticket.js <path> P{id}` | チケット追加。id はフェーズ内で 1 から自動インクリメント |
| `bulk-add-tickets.js` | `echo '[{"phaseId":0,"tickets":[...]}]' \| node bulk-add-tickets.js <path>` | 複数チケット一括追加。phaseId/phaseName でフェーズ指定 |

### R（読み取り）

| スクリプト | CLI | 説明 |
|-----------|-----|------|
| `get-ticket.js` | `node get-ticket.js <path> P{phaseID}-{ticketID}` | 単一取得。phaseId + id の複合キーで検索 |
| `search-tickets.js` | `node search-tickets.js <path> <query>` | 全文検索（title/background/scope/referenceSection） |
| `all-tickets.js` | `node all-tickets.js <path> [status-filter]` | 全一覧。status フィルタ可能 |
| `list-phases-and-tickets.js` | `node list-phases-and-tickets.js <path>` | チェックリスト出力。status に応じて [ ]/[x]/[/] |

### U（更新）

| スクリプト | CLI | 説明 |
|-----------|-----|------|
| `update-ticket.js` | `echo '{"status":"done"}' \| node update-ticket.js <path> P{phaseID}-{ticketID}` | 単一更新。id/phaseId は変更不可 |
| `bulk-update-tickets.js` | `echo '[{"id":"P0-1","updates":{...}}]' \| node bulk-update-tickets.js <path>` | 複数一括更新 |

### D（削除）

| スクリプト | CLI | 説明 |
|-----------|-----|------|
| `delete-ticket.js` | `node delete-ticket.js <path> P{phaseID}-{ticketID}` | 単一削除 |
| `bulk-delete-tickets.js` | `echo '["P0-1","P1-2"]' \| node bulk-delete-tickets.js <path>` | 複数一括削除 |

---

## ワークフロー（formulate-tickets.md）

```
Step 0: 引数パース（単一）+ Malfeasance.json 初期化
Step 1: 設計書の検証と情報抽出
Step 2: CLAUDE.md 生成（変更なし）
Step 3: 依存グラフ構築（5層モデル）（変更なし）
Step 4: フェーズ設計（変更なし）
Step 5: Tickets.json スケルトン生成（phases: []）
Step 6: フェーズ追加（add-phase.js、ID 自動採番）
Step 7: チケット追加（add-ticket.js / bulk-add-tickets.js）
Step 8: 完了チェックリスト出力（list-phases-and-tickets.js）
```

---

## 削除した機能・概念

- **マイルストーン**: 完全廃止。Phase → Ticket の2階層に
- **第2引数**: 廃止。出力先は設計書同階層の Tickets.json に固定
- **標準出力**: 廃止。常にファイル書き出し
- **サブチケット P0-1.5**: 未実装のためドキュメントから削除
- **文字列 ID**: `"P0-1"` から数値 `id` + `phaseId` に変更

---

## テスト

```bash
bash test.sh        # 13 テスト・約 35 断言
```

| # | テスト | 確認内容 |
|---|--------|----------|
| 1 | validate（スケルトン） | 空 phases の JSON がパスすること |
| 2 | add-phase | フェーズが id=0, 1 で自動採番されること |
| 3 | add-ticket | P0-1, P0-2 が自動採番されること |
| 4 | bulk-add-tickets | 3件一括追加できること |
| 5 | get-ticket | P0-1 が取得でき、id/phaseId が正しいこと |
| 6 | search-tickets | 部分一致検索が動作すること |
| 7 | all-tickets | 全5件 + status フィルタが動作すること |
| 8 | update-ticket | status が done に更新されること |
| 9 | bulk-update-tickets | 2件同時更新 + reviewed 確認 |
| 10 | delete-ticket | 削除 + 不在再削除のエラー確認 |
| 11 | bulk-delete-tickets | 3件同時削除 |
| 12 | list-phases-and-tickets | P0: / P0-3 / [x] 表示確認 |
| 13 | validate（異常系） | phaseId 不整合を検出すること |

---

## 共通パターン

- **CommonJS**: `require('fs')`, `require('path')`, `require('../lib/validate-tickets')`
- **同期 I/O**: `readFileSync`, `writeFileSync`, `existsSync`
- **JSON-over-stdout**: 成功 `{ success: true, ... }`、エラー `{ success: false, error: "..." }` + exit 1
- **argv ベース**: 位置引数、引数パーサ不使用
- **stdin でデータ受信**: 複雑なペイロードは stdin から JSON
- **書き込み前スキーマ検証**: `validateTickets()` 実行、失敗時は保存しない（ロールバック）
- **main ガード**: `if (require.main === module) main(); module.exports = { main }`
