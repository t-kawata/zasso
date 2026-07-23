---
ticket_id: 90
title: Tickets.json metadata スキーマ拡張 — resolvedPaths 導入
slug: ticketsjson-metadata-resolvedpaths
status: made
created_at: 2026-07-13
updated_at: 2026-07-13
---

# Tickets.json metadata スキーマ拡張 — `resolvedPaths` 導入

## Summary

現在の Tickets.json の `metadata.source` は単一の文字列フィールドで「RFC文書(.md)」「GRAPH.json」「スポットモードの引数文字列」の3つの異なる意味を担っており、値の意味を機械的に判定できない。これを解決するため、`metadata.resolvedPaths` ブロックを新設し、RFC文書・GRAPH.json・Dirs-Tree.json の3パスを**明示的かつ独立に**保持する。

`metadata.source` は後方互換性のため残すが、新規生成時には全ての経路で `resolvedPaths` に書き込む。`resolve-ticket-context.js` は `resolvedPaths` を最優先で参照し、存在しない場合のみ従来の `metadata.source` 解釈にフォールバックする。

## Background

### 問題: `metadata.source` の意味の曖昧さ

`metadata.source` は Tickets.json の生成経路によって全く異なる値を取る:

| 生成経路 | `metadata.source` の実値 | コード上の設定箇所 |
|---------|------------------------|------------------|
| split-to-tickets (phasify) | `.../RFC-ROOT-GRAPH.json`（絶対パス） | `phasify-graph-and-dirs-files-tree.js` L196: `source: graphPath` |
| formulate-tickets | RFC文書のパス | `formulate-tickets.md` L329: `source: <DOC_PATH>` |
| formulate-tickets-for-next | NEXT_RFC.md の絶対パス | `init-tickets-json.js` L70: `source: resolvedRfcPath` |
| スポットモード（新規） | `$ARGUMENTS`（引数そのもの） | `make-ticket.md` L88: `source: $ARGUMENTS` |

この結果、`resolve-ticket-context.js` は `metadata.source` の値だけでは DOC_PATH（RFC文書パス）が何かを機械的に決定できず、拡張子を見て「.md ならそのまま」「.json なら置換」と推測する応急処置を強いられている。

### 解決策: `resolvedPaths` ブロック

3つのパスを明示的に保持するブロックを `metadata` に追加する:

```json
{
  "metadata": {
    "source": "...",
    "generatedAt": "2026-07-13",
    "resolvedPaths": {
      "rfcPath": "tools/conver/RFC_ROOT.md",
      "graphPath": "tools/conver/RFC_ROOT-GRAPH.json",
      "dirsTreePath": "tools/conver/RFC_ROOT-Dirs-Tree.json"
    }
  }
}
```

このブロックがあれば、`resolve-ticket-context.js` は推測なしで機械的に3パスを取得できる。

### 検証: 現行の Tickets.json の状態

- `crates/siprs/Tickets.json`: `metadata.source` のみ存在（GRAPH.json パス）。`resolvedPaths` なし
- `tools/conver/Tickets.json`: `metadata.source` のみ存在（RFC.md への相対パス）。`resolvedPaths` なし

よって本チケットは**新規生成時のみ `resolvedPaths` を書き込む**。既存の Tickets.json は変更しない（`resolve-ticket-context.js` が `resolvedPaths` 不在時に従来の推測にフォールバックする）。

### 依存関係

- **PX-52** (前提): `resolve-ticket-context.js` が本チケットの修正対象
- **PX-49/50/51**: 影響なし（`resolvedPaths` を参照しない）

## Scope

### 変更対象一覧

| # | ファイル | 種別 | 内容 |
|---|---------|------|------|
| 1 | `.claude/scripts/tickets/write-tickets-json-template.js` | 🔧 修正 | 第2引数のJSONから `resolvedPaths` を受け取り、metadata に書き込む |
| 2 | `.claude/scripts/lib/validate-tickets.js` | 🔧 修正 | `metadata.source` を必須から任意に変更。`metadata.resolvedPaths` のバリデーション追加 |
| 3 | `.claude/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js` | 🔧 修正 | `ensureTicketsJsonExists()` で `resolvedPaths` を書き込む |
| 4 | `.claude/scripts/tickets/init-tickets-json.js` | 🔧 修正 | `resolvedPaths` を書き込む |
| 5 | `.claude/scripts/tickets/resolve-ticket-context.js` | 🔧 修正 | `resolvedPaths` を最優先で読み、なければ従来の推測にフォールバック |
| 6 | `tools/conver/.claude/commands/formulate-tickets.md` | 🔧 修正 | `write-tickets-json-template.js` 呼び出し時に `resolvedPaths` を渡す |
| 7 | `tools/conver/.claude/commands/split-to-tickets.md` | 🔧 修正 | `phasify` に `resolvedPaths` を渡すよう指示（phasify 側で自動導出されるので不要か確認） |
| 8 | `tests/validate-tickets.test.cjs` | ✨ 新規 or 🔧 修正 | `resolvedPaths` のバリデーションテスト追加 |

### スキーマ定義（新設）

`metadata.resolvedPaths` は以下の型を持つオプショナルなオブジェクト:

```typescript
interface ResolvedPaths {
  rfcPath: string;      // RFC文書(.md)のパス。必須（resolvedPaths 存在時）
  graphPath: string;    // GRAPH.json のパス。必須
  dirsTreePath: string; // Dirs-Tree.json のパス。必須
}
```

3フィールドは **すべてが揃っているか、すべてが欠けているか** のいずれか。部分的な設定は許可しない。

### 各修正の詳細

#### 1. `write-tickets-json-template.js`

第2引数のJSONスキーマを拡張し、`resolvedPaths` を受け取れるようにする:

```javascript
const skeleton = {
  title: data.title || "",
  metadata: {
    source: data.source || "",
    generatedAt: data.generatedAt || "",
    analyzedSections: data.analyzedSections || "",
  },
  phases: [],
};
// resolvedPaths が指定されていれば追加
if (data.resolvedPaths) {
  skeleton.metadata.resolvedPaths = data.resolvedPaths;
}
```

#### 2. `validate-tickets.js`

- `metadata.source` を必須から任意に変更（空文字列を許容）
- `metadata.resolvedPaths` のバリデーションを追加:
  - 存在する場合はオブジェクトであること
  - `rfcPath` / `graphPath` / `dirsTreePath` がすべて非空文字列であること
  - 部分的な設定（1つだけ欠けている等）をエラーとする

#### 3. `phasify-graph-and-dirs-files-tree.js`

`ensureTicketsJsonExists()` 内で、`resolvedPaths` を計算して書き込む:

```javascript
// 現在: source: graphPath のみ
const metadata = JSON.stringify({
  title: '...',
  source: graphPath,
  generatedAt: '...',
  analyzedSections: '...',
  resolvedPaths: {
    rfcPath: rfcPath,       // graphPath から -GRAPH.json → .md に置換して導出
    graphPath: graphPath,   // そのまま
    dirsTreePath: dirsTreePath, // graphPath から -GRAPH.json → -Dirs-Tree.json に置換
  },
});
```

`rfcPath` の導出:
```javascript
const rfcPath = graphPath.replace(/-GRAPH\.json$/, '.md');
```

#### 4. `init-tickets-json.js`（formulate-tickets-for-next 経路）

`resolvedPaths` を計算して書き込む:

```javascript
const metadata = JSON.stringify({
  title: rfcName + " 実装チケット分解設計書",
  source: resolvedRfcPath,
  generatedAt: generatedAt,
  analyzedSections: analyzedSections,
  resolvedPaths: {
    rfcPath: resolvedRfcPath,
    graphPath: resolvedRfcPath.replace(/\.md$/, '-GRAPH.json'),
    dirsTreePath: resolvedRfcPath.replace(/\.md$/, '-Dirs-Tree.json'),
  },
});
```

#### 5. `resolve-ticket-context.js`

`metadata.source` を読む前に `metadata.resolvedPaths` をチェックする:

```javascript
function resolveDocPath(rawSource, ticketsDir, resolvedPaths) {
  // 最優先: resolvedPaths が存在する場合
  if (resolvedPaths &&
      resolvedPaths.rfcPath && resolvedPaths.graphPath && resolvedPaths.dirsTreePath) {
    const docPath = path.resolve(ticketsDir, resolvedPaths.rfcPath);
    const graphPath = path.resolve(ticketsDir, resolvedPaths.graphPath);
    const dirsTreePath = path.resolve(ticketsDir, resolvedPaths.dirsTreePath);
    // 実在確認して返す（1つでも欠ければフォールバック）
    if (fs.existsSync(docPath) && fs.existsSync(graphPath) && fs.existsSync(dirsTreePath)) {
      return { docPath, graphPath, dirsTreePath, docPathSource: 'resolvedPaths' };
    }
  }
  // フォールバック: 従来の metadata.source 解釈
  // ...（現行の resolveDocPath ロジック）
}
```

#### 6. `formulate-tickets.md`

`write-tickets-json-template.js` の呼び出し時に `resolvedPaths` を渡す:

```bash
node .claude/scripts/tickets/write-tickets-json-template.js "$TICKETS_PATH" '{
  "title": "...",
  "source": "<DOC_PATH>",
  "generatedAt": "<YYYY-MM-DD>",
  "analyzedSections": "...",
  "resolvedPaths": {
    "rfcPath": "<DOC_PATH>",
    "graphPath": "<DOC_PATHの.mdを-GRAPH.jsonに置換>",
    "dirsTreePath": "<DOC_PATHの.mdを-Dirs-Tree.jsonに置換>"
  }
}'
```

#### 7. `make-ticket.md`（スポットモード）

**変更不要**。スポットモードではパイプライン情報が存在しないため、`resolvedPaths` を書き込まない。`resolve-ticket-context.js` は `resolvedPaths` 不在を検出し、従来通りスポットモードとして扱う。

### 変更しないもの

- `add-ticket.js` / `add-phase.js` / `add-px-phase.js` — チケット追加処理に metadata 操作は含まれない
- `ensure-tickets-json.js` — `write-tickets-json-template.js` を呼び出すのみで、metadata の内容には関与しない
- `dump-ticket-graph-commands.js` / `dump-node-context-to-spec.js` — resolvedPaths を参照しない
- `make-ticket.md` のスポットモード — 変更不要
- 既存の Tickets.json ファイル — マイグレーション不要（`resolve-ticket-context.js` がフォールバック）

## Non-scope

- 既存 Tickets.json のマイグレーションは含めない（フォールバックで対応）
- `resolve-ticket-context.js` の `resolveDocPath()` に既に実装済みの `.md` / `.json` 推測ロジックは削除せず、フォールバックとして維持する
- `validate-tickets.js` 以外のスキーマ定義ファイル（`tickets-schema.json` 等）の更新は、存在する場合のみ含める

## Investigation

### 現状のコード（物理的証拠）

**`phasify-graph-and-dirs-files-tree.js` L194-198:**
```javascript
const metadata = JSON.stringify({
  title: 'phasify 自動生成チケット分解設計書',
  source: graphPath,          // ← GRAPH.json の絶対パスが入る
  generatedAt: ...,
  analyzedSections: ...,
});
```

**`init-tickets-json.js` L68-73:**
```javascript
const metadata = JSON.stringify({
  title: rfcName + " 実装チケット分解設計書",
  source: resolvedRfcPath,    // ← NEXT_RFC.md の絶対パスが入る（正しい）
  generatedAt: generatedAt,
  analyzedSections: analyzedSections,
});
```

**`write-tickets-json-template.js` L45-53:**
```javascript
const skeleton = {
  title: data.title || "",
  metadata: {
    source: data.source || "",
    generatedAt: data.generatedAt || "",
    analyzedSections: data.analyzedSections || "",
  },
  phases: [],
};
```
`data.source` を受け取って `metadata.source` に格納する。`resolvedPaths` 用のコードは存在しない。

**`validate-tickets.js` L13:**
```javascript
if (!data.metadata.source || typeof data.metadata.source !== 'string')
  errors.push('metadata.source: required');
```
`metadata.source` は**必須**。空文字列も許容しない（`!data.metadata.source` でチェック）。

**`resolve-ticket-context.js`**（現行）:
`resolvedPaths` を参照するコードは存在しない。`metadata.source` のみを読み、拡張子で解釈を切り替える `resolveDocPath()` がフォールバックとして機能している。

### 呼び出し元一覧（`write-tickets-json-template.js` を呼ぶ全箇所）

1. `phasify-graph-and-dirs-files-tree.js` → `ensureTicketsJsonExists()` → child_process 経由
2. `init-tickets-json.js` → child_process 経由
3. `formulate-tickets.md` → コマンドファイルの bash コード
4. `make-ticket.md`（スポットモード） → コマンドファイルの bash コード（`source: $ARGUMENTS`）

### resolvedPaths の整合性ルール

`resolvedPaths` の3パスは以下の命名規則に従う:

```
rfcPath:       .../RFC_ROOT.md
graphPath:     .../RFC_ROOT-GRAPH.json     ← rfcPath の .md → -GRAPH.json に置換
dirsTreePath:  .../RFC_ROOT-Dirs-Tree.json ← rfcPath の .md → -Dirs-Tree.json に置換
```

この規則は `/graphify-rfc` と `/boundify-graph` の出力命名規則と一致する。

## Test Plan

### ユニットテスト計画

**テスト対象: `validate-tickets.js` のバリデーション:**

1. **正常系: `resolvedPaths` なし（従来の Tickets.json）→ バリデーション通過**
2. **正常系: `resolvedPaths` が完全（rfcPath/graphPath/dirsTreePath 全てあり）→ 通過**
3. **異常系: `resolvedPaths` が部分的（1つ欠けている）→ エラー**
4. **異常系: `resolvedPaths.rfcPath` が空文字列 → エラー**

**テスト対象: `resolve-ticket-context.js` の `resolveDocPath()`:**

5. **正常系: `resolvedPaths` が存在し全ファイル実在 → `resolvedPaths` から3パスを取得**
6. **正常系: `resolvedPaths` が存在するがファイルが実在しない → 従来の metadata.source 推測にフォールバック**
7. **正常系: `resolvedPaths` なし → 従来の metadata.source 推測（現行通り）**

### ユニットテスト不可能な項目（例外）

- **実際の Tickets.json 生成フロー**: phasify / formulate-tickets / make-ticket の各経路で正しく resolvedPaths が書き込まれることの確認は E2E 手動テスト

## Boy Scout Rule — 翻訳可能性計画

- `resolveDocPath()` に「最優先 path」「フォールバック path」の2段構えのロジックが入る。関数の責務が増えるため、`tryResolvedPaths()` と `fallbackFromSource()` の2関数に分割して可読性を維持する
- `validate-tickets.js` の `metadata.source` 必須チェックを任意に変更する際、関連するエラーメッセージも同時に更新する
- `resolvedPaths` の導出パターン（`.md` → `-GRAPH.json`、`.md` → `-Dirs-Tree.json`）は全修正箇所で共通なので、補助関数として抽出することを検討する（ただし共通モジュール化は本チケットの範疇を超える可能性があるため、各所で独立して実装してもよい）

## Acceptance Criteria

- [x] 実装要件を満たしている
- [ ] `write-tickets-json-template.js` が `resolvedPaths` を受け取り `metadata.resolvedPaths` に書き込める
- [ ] `validate-tickets.js` が `metadata.source` を必須から任意に変更、`resolvedPaths` のバリデーションを追加
- [ ] `phasify-graph-and-dirs-files-tree.js` の `ensureTicketsJsonExists()` が `resolvedPaths` を書き込む
- [ ] `init-tickets-json.js` が `resolvedPaths` を書き込む
- [ ] `resolve-ticket-context.js` が `resolvedPaths` を最優先で読み、なければ従来の推測にフォールバックする
- [ ] `formulate-tickets.md` の呼び出しが `resolvedPaths` を渡す
- [ ] スポットモード（`make-ticket.md`）は変更不要で、`resolve-ticket-context.js` が `resolvedPaths` 不在を検出してスポット扱いする
- [ ] 既存テスト（P-49/50/52）が全件 PASS する（regression）
- [ ] 翻訳可能性の検証が通っている

## Notes

### 依存関係

- **PX-52** (前提): `resolve-ticket-context.js` が本チケットの修正対象。PX-52 で新設した `resolveDocPath()` を改修する
- **PX-49/50/51**: 影響なし。これらのスクリプトは `metadata.source` を参照しない

### 実装順序

```
1. validate-tickets.js   → source 任意化 + resolvedPaths バリデーション
2. write-tickets-json-template.js → resolvedPaths 受け取り
3. phasify-graph-and-dirs-files-tree.js → resolvedPaths 書き込み
4. init-tickets-json.js → resolvedPaths 書き込み
5. formulate-tickets.md → resolvedPaths 渡し
6. resolve-ticket-context.js → resolvedPaths 優先読み取り
7. テスト実行（regression + 新規テスト）
```

1→2→3/4/5→6 の順で依存。3/4/5 は並行可能。

### フォールバック階層

```
resolveDocPath() の判定順:
  1. metadata.resolvedPaths が存在し、全3パスが実在する
     → resolvedPaths から DOC_PATH/GRAPH_PATH/DIRS_TREE_PATH を取得（docPathSource='resolvedPaths'）
  2. metadata.source が実在する .md ファイル
     → source から derivePaths（docPathSource='metadata.source.md'）
  3. metadata.source が実在する .json ファイル
     → source から -GRAPH.json を .md に置換（docPathSource='metadata.source.json'）
  4. いずれも該当なし
     → DOC_PATH なし（docPathSource='none' / 'not_found' / 'unknown'）
```

`resolvedPaths` は**最優先**で判定する。これにより、すべての経路で「推測の必要なし」の状態になる。
