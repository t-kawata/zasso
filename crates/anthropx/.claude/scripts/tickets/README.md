# スクリプトリファレンス — `scripts/tickets/`

この文書は、`scripts/tickets/` 配下の全スクリプトを網羅する。AI は各コマンドの実行中に必要に応じてこの文書を参照し、適切なスクリプトを選択・実行すること。

## スクリプトの実行方法

すべてのスクリプトは `$_R/scripts/tickets/` に配置されている。`$_R` の取得方法は以下の通り：

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/<script-name>.js" "<args>"
```

`_R` はプロジェクトルートからの絶対パスで取得する（`cd` でカレントディレクトリが変わっても正しく `.claude/` を参照できる）。

## 出力形式

全スクリプトは JSON を stdout に出力する。成功時は `{ "success": true, ... }`、失敗時は `{ "success": false, "error": "..." }` の形式。

---

## カテゴリ別スクリプト一覧

### ライフサイクル（4 コマンドから使用）

| # | スクリプト | コマンド | 用途 |
|---|-----------|---------|------|
| 1 | `create-ticket.js` | `/make-ticket` | 新規チケット作成 |
| 2 | `resolve-ticket.js` | 全コマンド | チケットID から spec パス・ステータス等を解決 |
| 3 | `read-frontmatter.js` | `/make-ticket`, `/plan-ticket` | フロントマター読み取り |
| 4 | `update-frontmatter.js` | `/make-ticket` | フロントマター更新 |
| 5 | `check-status.js` | `/plan-ticket`, `/start-ticket` | ステータス確認 |
| 6 | `update-ticket-status.js` | `/start-ticket`, `/review-ticket` | ステータス遷移 |
| 7 | `list-tickets.js` | `/make-ticket` | チケット一覧 |
| 8 | `count-tickets.js` | `/make-ticket` | チケット件数 |
| 9 | `validate-structure.js` | `/review-ticket` | 構造整合性検証 |
| 10 | `review/run-quality-checks.js` | 各コマンド | 静的品質分析 |
| 11 | `review/generate-report.js` | 各コマンド | 品質レポート生成 |
| 12 | `review/find-all-stubs.js` | `/review-ticket`, 各コマンド | `[::STUB::]` マーカー一覧取得 |

### Malfeasance（犯罪記録 — /plan-ticket, /start-ticket, /review-ticket, /make-ticket）

| # | スクリプト | 用途 |
|---|-----------|------|
| 13 | `ensure-malfeasance.js` | Malfeasance.json 初期化（不在時のみ作成） |
| 14 | `scan-crimes.sh` | 犯罪スキャン共通ラッパー（不在時初期化→スキャン） |
| 15 | `malfeasance-schema.json` | Malfeasance.json の JSON Schema (draft-07) 定義ファイル |
| 15 | `malfeasance-create.js` | 新規犯罪レコード作成 |
| 16 | `malfeasance-get.js` | ID 指定でレコード取得 |
| 17 | `malfeasance-search.js` | 条件（フィールド指定/全フィールド）検索 |
| 18 | `malfeasance-all.js` | 全件取得（status フィルタ付き） |
| 19 | `malfeasance-update.js` | レコード更新（ホワイトリスト + 自動 resolved_at） |
| 14 | `malfeasance-schema.json` | Malfeasance.json の JSON Schema (draft-07) 定義ファイル |
| 15 | `malfeasance-create.js` | 新規犯罪レコード作成 |
| 16 | `malfeasance-get.js` | ID 指定でレコード取得 |
| 17 | `malfeasance-search.js` | 条件（フィールド指定/全フィールド）検索 |
| 18 | `malfeasance-all.js` | 全件取得（status フィルタ付き） |
| 19 | `malfeasance-update.js` | レコード更新（ホワイトリスト + 自動 resolved_at） |
| 20 | `malfeasance-delete.js` | レコード削除（確認プロンプト必須） |

### ユーティリティ（必要時に AI が判断して使用）

| # | スクリプト | 用途 |
|---|-----------|------|
| 21 | `search-tickets.js` | キーワード検索 |
| 21 | `find-by-slug.js` | スラッグ検索 |
| 22 | `delete-ticket.js` | チケット削除（復元不可） |
| 23 | `backup-ticket.js` | チケットバックアップ |
| 24 | `restore-ticket.js` | チケット復元 |
| 25 | `create-draft.js` | 下書き作成 |
| 26 | `promote-draft.js` | 下書き → spec 昇格 |
| 27 | `ensure-ticket-structure.js` | ディレクトリ構造初期化 |
| 28 | `resync-queue.js` | キュー再同期 |

---

## ライフサイクルスクリプト

### 1. `create-ticket.js`

**用途**: 新規チケットを作成する。チケットID は自動採番（空文字列を渡す）か明示指定可能。spec ファイルとコンテキストディレクトリを作成し、キューに追加する。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | `""`（空文字列）または数値 | 実質必須 | 空文字列で自動採番、数値で指定 ID |
| 3 | タイトル文字列 | 必須 | チケットのタイトル |
| 4 | ステータス（省略時 `draft`） | 任意 | 初期ステータス |

stdin からの JSON 入力にも対応（`{ "title": "...", "status": "..." }`）。

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/create-ticket.js" "" "ユーザー認証の実装"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "title": "ユーザー認証の実装", "slug": "user-auth", "status": "draft", "specPath": "...", "contextDir": "..." }
```

**いつ使うか**: ユーザーからの新規チケット作成依頼時。`/make-ticket` コマンドの新規作成フローで使用する。

---

### 2. `resolve-ticket.js`

**用途**: チケットID から spec ファイルのパスやステータス、スラッグなどのメタデータを解決する。指定された ID のチケットが存在するかの確認にも使う。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 解決したいチケットの ID |

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/resolve-ticket.js" "5"
```

**出力**:
```json
{ "success": true, "exists": true, "ticketId": 5, "title": "ユーザー認証の実装", "slug": "user-auth", "status": "approved", "specPath": "/path/to/0005-user-auth.md", "contextDir": "/path/to/0005-user-auth/" }
```

**いつ使うか**: 任意の処理の最初のステップとして、チケットの存在確認とメタデータ取得のために使用する。`exists` が `false` なら該当チケットなし。

---

### 3. `read-frontmatter.js`

**用途**: チケットの spec ファイルから YAML フロントマターを読み取る。特定フィールドのみの取得も可能。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 読み取り対象のチケット |
| 3 | フィールド名（省略時は全フィールド） | 任意 | 特定フィールドのみ取得 |

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/read-frontmatter.js" "5"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "attrs": { "ticket_id": 5, "title": "ユーザー認証の実装", "slug": "user-auth", "status": "approved", "created_at": "2026-05-16", "updated_at": "2026-05-16", "background": "...", "scope": "...", "boy_scout_rule": "...", "acceptance_criteria": "..." } }
```

**いつ使うか**: spec のメタデータ（ステータス、タイトル、スコープ等）を確認したいとき。`/plan-ticket` での spec 内容確認、`/make-ticket` での深掘り時に使用する。

---

### 4. `update-frontmatter.js`

**用途**: チケットの spec ファイルのフロントマターにある特定フィールドの値を更新する。**1 回の呼び出しで 1 フィールドのみ。**

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 更新対象のチケット |
| 3 | フィールド名（キー） | 必須 | 例: `title`, `background`, `scope` |
| 4 | 新しい値 | 必須 | フィールドに設定する値 |

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/update-frontmatter.js" "5" "status" "approved"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "field": "status", "value": "approved" }
```

**いつ使うか**: チケットのメタデータを直接編集したいとき。通常は `update-ticket-status.js` でステータス変更を行うが、それ以外のフィールド（タイトル、背景、スコープ等）の更新に使用する。

---

### 5. `check-status.js`

**用途**: チケットが特定のステータスであるかどうかを確認する。ガード条件として使用する。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 確認対象のチケット |
| 3 | 期待するステータス | 必須 | `draft`, `reviewing`, `approved`, `implementing`, `done`, `reviewed`, `blocked` |

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/check-status.js" "5" "approved"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "currentStatus": "approved", "expectedStatus": "approved", "matches": true }
```

**いつ使うか**: 処理の前提条件として、チケットが正しいステータスにあることを確認する。`matches` が `false` なら後続処理を実行せずユーザーに報告する。

---

### 6. `update-ticket-status.js`

**用途**: チケットのステータスを別のステータスに遷移させる。不正な遷移はエラーになる。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 更新対象のチケット |
| 3 | 新しいステータス | 必須 | `draft`, `reviewing`, `approved`, `implementing`, `done`, `reviewed`, `blocked` |

**許可される遷移**:
- `draft` → `reviewing`
- `reviewing` → `approved`, `blocked`
- `approved` → `implementing`, `blocked`
- `implementing` → `done`, `approved`（中断時）, `blocked`
- `blocked` → 任意のステータス
- `done` → `reviewed`, `implementing`（差し戻し）
- `reviewed` → 遷移不可（終端）

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/update-ticket-status.js" "5" "implementing"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "from": "approved", "to": "implementing", "transitionAllowed": true }
```

**いつ使うか**: チケットのライフサイクルを進めるとき。`/start-ticket` では `approved` → `implementing`、`/review-ticket` では `done` → `reviewed` の遷移に使用する。

---

### 7. `list-tickets.js`

**用途**: 全チケットを一覧表示する。特定のステータスでフィルタリング可能。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | ステータス（省略時は全件） | 任意 | `draft`, `reviewing`, `approved`, `implementing`, `done`, `reviewed`, `blocked` |

**使用例**:
```bash
# 全チケット表示
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/list-tickets.js"

# approved のチケットのみ表示
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/list-tickets.js" "approved"
```

**出力**:
```json
{ "success": true, "count": 3, "tickets": [{ "ticketId": 1, "title": "...", "slug": "...", "status": "draft" }, ...] }
```

**いつ使うか**: 現在のチケット状況を俯瞰したいとき。例えば「承認済みのチケットはどれですか？」と聞かれた場合に `list-tickets.js "approved"` を実行する。

---

### 8. `count-tickets.js`

**用途**: ステータス別のチケット件数を集計する。

**引数**: なし

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/count-tickets.js"
```

**出力**:
```json
{ "success": true, "total": 12, "counts": { "draft": 3, "reviewing": 2, "approved": 4, "implementing": 1, "done": 2, "blocked": 0 } }
```

**いつ使うか**: チケット全体の進捗状況を簡潔に把握したいとき。

---

### 9. `validate-structure.js`

**用途**: 全チケットの spec ファイルの構造整合性を検証する。必須フィールドの欠落、重複 ID、不正なステータス、キューと実ファイルの不整合などを検出する。

**引数**: なし

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/validate-structure.js"
```

**出力（正常時）**:
```json
{ "success": true, "valid": true, "issuesCount": 0, "issues": [] }
```

**出力（不整合時）**:
```json
{ "success": true, "valid": false, "issuesCount": 2, "issues": [{ "type": "missing_field", "file": "0003-task.md", "detail": "..." }, { "type": "orphan_queue_entry", "detail": "..." }] }
```

**いつ使うか**: `/review-ticket` での品質チェックの一環、または何らかの不整合が疑われる場合に任意で実行する。

---

### 10. `review/run-quality-checks.js`

**用途**: 指定されたソースファイルに対して静的品質チェックを実行する。対象言語: `.rs`, `.js`, `.ts`, `.tsx`, `.jsx`, `.vue`, `.go`。

**チェック項目**:

| チェック | 重大度 | 検出対象 |
|---------|--------|---------|
| `unwrap()` / `expect()` | major | エラー握りつぶし |
| 1 文字変数名 | minor | 翻訳可能性を損なう命名 |
| ハードコードされたポート番号 | major | 設定値の直接埋め込み |
| TODO / FIXME / HACK / XXX | minor | 未完了タスク |
| コメントアウトされたコード | minor | デッドコードの放置 |
| デバッグ出力 | major | `console.log`, `println!` 等 |
| unsafe ブロック（Rust） | major | 安全でない操作 |
| 空の catch / else ブロック | major | エラー握りつぶし |
| 多パラメータ関数 | minor | 関数の責務過多 |

**引数**: 検査対象のファイルパス（1 つ以上）

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/review/run-quality-checks.js" src/main.rs src/lib.rs
```

**出力**:
```json
{ "success": true, "totalIssues": 3, "checks": { "findUnwrap": { "label": "unwrap() / expect() usage", "severity": "major", "findings": [{ "line": 42, "match": ".unwrap()", "file": "src/main.rs" }] }, ... } }
```

**いつ使うか**: 実装後またはレビュー時に、変更ファイルの品質を自動検証する。`generate-report.js` にパイプして可読性の高いレポートを生成してからユーザーに提示すること。

---

### 11. `review/generate-report.js`

**用途**: `run-quality-checks.js` の JSON 出力を入力として受け取り、Markdown レポートを生成する。

**引数**: なし（stdin から JSON を読み取る）

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/review/run-quality-checks.js" src/main.rs | node "$_R/scripts/tickets/review/generate-report.js"
```

**出力**: Markdown 文字列（stdout）
```markdown
# Quality Check Report

**Total issues found: 3**

## Major Issues

### unwrap() / expect() usage

- `src/main.rs:42` — .unwrap()
```

**いつ使うか**: `run-quality-checks.js` の出力をユーザーに提示する前に、常にこのスクリプトに通す。可読性が大幅に向上する。

---

### 12. `review/find-all-stubs.js`

**用途**: 指定ディレクトリ以下を再帰的に走査し、`[::STUB::]` マーカーを含むソース行を一覧する。スタブの塩漬け防止と解決状況の把握に使用する。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | ディレクトリパス | 必須 | 走査対象のディレクトリ |

**スキップ**: `.` で始まるディレクトリ、`node_modules/`、`target/`、`.claude/`

**対象拡張子**: `.rs`, `.js`, `.ts`, `.tsx`, `.jsx`, `.vue`, `.go`（`CFG.review.targetExtensions` に準拠）

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/review/find-all-stubs.js" "$(git rev-parse --show-toplevel)/src"
```

**出力**:
```json
{ "success": true, "count": 2, "stubs": [
  { "file": "/path/to/src/main.rs", "line": 42, "content": "// [::STUB::] M3-1 で置き換え" },
  { "file": "/path/to/src/lib.rs", "line": 15, "content": "// [::STUB::] 要解決: レジストリ実装未完了" }
] }
```

**いつ使うか**: `/review-ticket` での品質チェックで全スタブの把握と評価に使用する。`/make-ticket`、`/plan-ticket`、`/start-ticket` でもスタブ解決機会の特定に使用する。

---

## Malfeasance 操作スクリプト

### 13. `ensure-malfeasance.js`

**用途**: Malfeasance.json が存在しなければ空のレコード配列を持つ初期 JSON を作成する。既に存在する場合は何も変更しない。formulate-tickets.md から自動的に呼び出される。

**引数**: `[directory]`（省略時は CWD）

**使用例**:
```bash
# CWD に作成
node .claude/scripts/tickets/ensure-malfeasance.js

# 指定ディレクトリに作成（CLAUDE.md と同じ階層を想定）
node .claude/scripts/tickets/ensure-malfeasance.js "crates/ggufrs"
```

**出力**:
```json
{ "success": true, "action": "created", "path": "/path/to/project/Malfeasance.json" }
```

または（既存時スキップ）:
```json
{ "success": true, "action": "skipped", "path": "/path/to/project/Malfeasance.json" }
```

**いつ使うか**: プロジェクトの初期化時や formulate-tickets.md の実行時。通常は手動で実行する必要はない。

---

### 14. `scan-crimes.sh`

**用途**: Malfeasance.json が存在しない場合に `ensure-malfeasance.js` で自動初期化し、未解決の犯罪一覧を表示する共通ラッパー。全 make/plan/start/review コマンドから犯罪点検・犯罪解決の最初のステップとして呼び出される。

**引数**: なし

**使用例**:
```bash
# 犯罪スキャンを実行（初回時は自動初期化）
"$(git rev-parse --show-toplevel)/.claude/scripts/tickets/scan-crimes.sh"
```

**出力**:
```json
{ "success": true, "count": 0, "records": [] }
```

**いつ使うか**: 各コマンドファイル（make-ticket.md, plan-ticket.md, start-ticket.md, review-ticket.md）の犯罪点検・犯罪解決セクションで使用する。直接手動で実行することも可能。

---

### 15. `malfeasance-schema.json`

**用途**: Malfeasance.json の JSON Schema (draft-07) 定義ファイル。各操作スクリプトがスキーマ検証に使用する。

**位置**: `$_R/scripts/tickets/malfeasance-schema.json`

**内容**: ルートオブジェクト（`version` + `records` 配列）、各レコードの必須フィールド（`id`, `file`, `line`, `description`, `detected_at`, `status`）と型制約、`status` の enum 値（`open` / `resolved` / `false_positive`）、`resolved_at` の条件付き必須を定義する。

---

### 15. `malfeasance-create.js`

**用途**: Malfeasance.json に新規犯罪レコードを作成する。同一ファイル＋同一行の open レコードが存在する場合は重複エラー。`id` は自動採番、`detected_at` は現在日時自動設定。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | ファイルパス | 必須 | 犯罪コードが存在するファイルの相対パス |
| 3 | 行番号 | 必須 | 犯罪コードの開始行番号（正の整数） |
| 4 | 説明 | 必須 | 犯罪の内容説明 |
| 5 | 備考 | 任意 | 任意の備考 |

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/malfeasance-create.js" "src/main.rs" "42" "未マーカーの不完全実装" "要調査"
```

**出力**:
```json
{ "success": true, "ticketId": 1, "record": { "id": 1, "file": "src/main.rs", "line": 42, "description": "未マーカーの不完全実装", "detected_at": "2026-06-21T12:00:00.000Z", "status": "open", "note": "要調査" } }
```

**いつ使うか**: 不完全実装に `[::STUB::]` マーカーが未付与であることを発見したとき。他チケットの実装中やレビュー中に犯罪を発見したら、マーカー追加とともに本スクリプトで記録する。

---

### 16. `malfeasance-get.js`

**用途**: 指定された ID の犯罪レコードを取得する。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | ID | 必須 | 取得するレコードの数値 ID |

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/malfeasance-get.js" "1"
```

**出力**:
```json
{ "success": true, "record": { "id": 1, "file": "src/main.rs", "line": 42, "description": "未マーカーの不完全実装", "detected_at": "2026-06-21T12:00:00.000Z", "status": "open" } }
```

**いつ使うか**: 特定の犯罪レコードの詳細を確認したいとき。`malfeasance-search.js` や `malfeasance-all.js` で ID を特定した後の詳細取得に使用する。

---

### 17. `malfeasance-search.js`

**用途**: 条件を指定して犯罪レコードを検索する。フィールド指定検索（`status`, `file`, `id`, `description`）と全フィールド部分一致検索に対応。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | キー | 任意 | `status` / `file` / `id` / `description`。省略時は全フィールド検索 |
| 3 | 値 | キー指定時必須 | 検索値（`id` は数値、`status` は完全一致、他は部分一致・大文字小文字区別なし） |

**使用例**:
```bash
# status=open の犯罪を検索
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/malfeasance-search.js" "status" "open"

# ファイル名で部分一致検索
node "$_R/scripts/tickets/malfeasance-search.js" "file" "src/main"

# 全フィールドからキーワード検索
node "$_R/scripts/tickets/malfeasance-search.js" "" "TODO"
```

**出力**:
```json
{ "success": true, "count": 2, "records": [{ "id": 1, "file": "src/main.rs", ... }, { "id": 3, ... }] }
```

**いつ使うか**: 特定のファイル、ステータス、またはキーワードに関連する犯罪を検索したいとき。

---

### 18. `malfeasance-all.js`

**用途**: Malfeasance.json の全レコードを取得する。`status` フィルタによる絞り込みが可能。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | フィルタ | 任意 | `open` / `resolved` / `false_positive`。省略時は全件 |

**使用例**:
```bash
# 全レコード取得
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/malfeasance-all.js"

# 未解決の犯罪のみ取得
node "$_R/scripts/tickets/malfeasance-all.js" "open"
```

**出力**:
```json
{ "success": true, "count": 5, "records": [{ ... }, ...] }
```

**いつ使うか**: 全犯罪レコードの俯瞰や、特定ステータスの犯罪一覧を取得するとき。`/plan-ticket`、`/start-ticket`、`/review-ticket` での犯罪点検の最初のステップとして使用する。

---

### 19. `malfeasance-update.js`

**用途**: 犯罪レコードの特定フィールドを更新する。書き込み前にスキーマ検証を実施する。`status` を `resolved` に変更すると `resolved_at` が自動設定される。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | ID | 必須 | 更新対象のレコード ID |
| 3 | フィールド | 必須 | `status` / `resolved_by_ticket` / `note`（`resolved_at` の単独設定は不可） |
| 4 | 値 | 必須 | 設定する値（`status` は `open` / `resolved` / `false_positive`） |

**制約**:
- 更新可能フィールドは `status`, `resolved_by_ticket`, `note` のみ
- `id`, `file`, `line`, `description`, `detected_at` は変更禁止
- `resolved_at` の単独設定は禁止（`status` を `resolved` に変更すると自動設定される）

**使用例**:
```bash
# 犯罪を解決済みに変更
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/malfeasance-update.js" "1" "status" "resolved"

# 備考を更新
node "$_R/scripts/tickets/malfeasance-update.js" "1" "note" "M3-1 の実装とともに解決"
```

**出力**:
```json
{ "success": true, "record": { "id": 1, "status": "resolved", "resolved_at": "2026-06-21T14:00:00.000Z", ... } }
```

**いつ使うか**: 犯罪が解決されたとき（`status` を `resolved` に）、誤検出と判明したとき（`false_positive` に）、または備考を更新したいとき。

---

### 20. `malfeasance-delete.js`

**用途**: 犯罪レコードを完全に削除する。削除前に確認プロンプトが必要（`y/N`）。削除は復元不可能。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | ID | 必須 | 削除するレコードの数値 ID |

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/malfeasance-delete.js" "1"
# Delete record #1 (file: src/main.rs, line: 42)? [y/N] y
```

**出力**:
```json
{ "success": true, "deleted": { "id": 1, "file": "src/main.rs", "line": 42 } }
```

**いつ使うか**: 誤って記録した犯罪レコードを完全に消去するとき。**削除前にユーザーの明示的な確認を取ること。**

---

## ユーティリティスクリプト

### 12. `search-tickets.js`

**用途**: キーワードでチケットを検索する。チケットID、タイトル、スラッグに対して部分一致検索を行う。ステータスによるフィルタリングも可能。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | キーワード | 必須 | 検索文字列（大文字小文字を区別しない） |
| 3 | ステータス（省略時は全ステータス） | 任意 | 特定ステータスのみに絞り込む |

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/search-tickets.js" "認証"

# approved のチケットから "api" を検索
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/search-tickets.js" "api" "approved"
```

**出力**:
```json
{ "success": true, "keyword": "認証", "count": 2, "tickets": [{ "ticketId": 5, "title": "ユーザー認証の実装", "slug": "user-auth", "status": "approved" }, ...] }
```

**いつ使うか**: チケット名を覚えていないが内容の一部を覚えている場合や、特定のテーマに関連するチケットを探したいとき。

---

### 13. `find-by-slug.js`

**用途**: スラッグ（URL-friendly な識別子）でチケットを検索する。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | スラッグ文字列 | 必須 | 例: `user-auth` |

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/find-by-slug.js" "user-auth"
```

**出力**:
```json
{ "success": true, "found": true, "ticketId": 5, "title": "ユーザー認証の実装", "slug": "user-auth", "status": "approved" }
```

**いつ使うか**: ファイル名や URL からスラッグが判明している場合に、対応するチケットを特定する。

---

### 14. `delete-ticket.js`

**用途**: チケットを完全に削除する。spec ファイル、コンテキストディレクトリ、下書きファイル、キューエントリのすべてを削除する。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 削除対象のチケット |

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/delete-ticket.js" "5"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "deleted": ["/path/to/0005-user-auth.md", "/path/to/0005-user-auth/"], "queueCleaned": true }
```

**いつ使うか**: 誤作成したチケットを完全に消去するとき。**削除前にユーザーの明示的な確認を取ること。**

---

### 15. `backup-ticket.js`

**用途**: チケットの spec ファイルをバックアップディレクトリにコピーする。タイムスタンプ付きで保存される。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | バックアップ対象のチケット |

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/backup-ticket.js" "5"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "backupPath": "/path/to/backups/0005-2026-05-16-1234567890.md" }
```

**いつ使うか**: 重要な変更（ステータス遷移、内容の大幅な編集）を行う前に、安全のためバックアップを取っておきたいとき。複数回実行するとバックアップが蓄積される。

---

### 16. `restore-ticket.js`

**用途**: バックアップからチケットを復元する。最新のバックアップが使用される。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 復元対象のチケット |

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/restore-ticket.js" "5"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "restoredFrom": "/path/to/backups/0005-2026-05-16-1234567890.md", "specPath": "/path/to/0005-user-auth.md" }
```

**いつ使うか**: 誤ってチケットを編集してしまい、バックアップ時点の状態に戻したいとき。復元前に現在の状態のバックアップを取ることを検討する。

---

### 17. `create-draft.js`

**用途**: 下書きチケットを作成する。`create-ticket.js` と異なり、最小限の情報で下書きファイルを `drafts/` ディレクトリに作成する。spec ファイルやキューエントリは作成しない。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 作成するチケットの ID |
| 3 | タイトル（省略時は自動生成） | 任意 | チケットのタイトル |

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/create-draft.js" "42" "新機能の検討"
```

**出力**:
```json
{ "success": true, "ticketId": 42, "title": "新機能の検討", "slug": "new-feature", "draftPath": "/path/to/drafts/0042-new-feature.md" }
```

**いつ使うか**: チケットの内容がまだ具体化しておらず、正式な spec として作成する前の下書き段階で保存したいとき。

---

### 18. `promote-draft.js`

**用途**: 下書きチケットを正式な spec に昇格させる。下書きから情報を読み取り、spec ファイルを作成し、キューに追加する。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 昇格させるチケットの ID |

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/promote-draft.js" "42"
```

**出力**:
```json
{ "success": true, "ticketId": 42, "title": "新機能の検討", "slug": "new-feature", "specPath": "/path/to/0042-new-feature.md", "draftPath": "/path/to/drafts/0042-new-feature.md" }
```

**いつ使うか**: 下書きが十分に具体化され、正式なチケットとして管理したいとき。

---

### 19. `ensure-ticket-structure.js`

**用途**: チケット管理に必要なディレクトリ構造（specs、contexts、drafts、queue ファイル）が存在することを確認し、不足があれば作成する。

**引数**: なし

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/ensure-ticket-structure.js"
```

**出力**:
```json
{ "success": true, "created": ["specs/", "contexts/", "drafts/", "queue.tasks"], "existed": [] }
```

**いつ使うか**: プラグインのセットアップ時または不整合が疑われるときに実行する。通常は初回チケット作成時に自動的に構造が作られるため、明示的に実行する必要はほとんどない。

---

### 20. `resync-queue.js`

**用途**: キュー定義ファイル（`queue.tasks`）をディスク上の実ファイル一覧から再生成する。手動でファイルを追加・削除した場合などの不整合を修復する。

**引数**: なし

**使用例**:
```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/resync-queue.js"
```

**出力**:
```json
{ "success": true, "count": 12, "queuePath": "/path/to/queue.tasks" }
```

**いつ使うか**: キューと実ファイルの間に不整合が発生した場合。`validate-structure.js` で `orphan_queue_entry` や `missing_queue_entry` が報告されたときに修復手段として実行する。
