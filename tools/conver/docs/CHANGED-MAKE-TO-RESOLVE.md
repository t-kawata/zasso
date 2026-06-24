# make/plan/start/review/resolve 改修: 旧スクリプト→新CRUD + queue.md 統合

> **最終更新日:** 2026-06-24
> **対象:** `.claude/commands/make-ticket.md`, `plan-ticket.md`, `start-ticket.md`, `review-ticket.md`, `resolve-ticket.md`
> **改修基点:** `docs/CHANGED-FORMULATE-TICKETS.md`（Tickets.md→Tickets.json 移行）

---

## 改修の目的

`/formulate-tickets` の出力が Markdown（Tickets.md）から JSON（Tickets.json）に移行されたことに伴い、後続工程を担う5つのスラッシュコマンドを新データモデルに整合させる。あわせて、旧キューシステム（queue.md）が担っていた実装開始日・完了日の記録を Tickets.json のフィールドとして統合する。

### 背景

旧システムは以下を前提としていた：
- **データ形式**: 個別 Markdown ファイル（specs/NNN-slug.md）+ キュー（queue.md）+ アーティファクト（contexts/NNN/{plan,implementation,review}.md）
- **チケットID**: 単一整数（例: `42`）
- **ステータス**: `draft` → `approved` → `implementing` → `done` → `reviewed`
- **スクリプト**: `create-ticket.js`, `resolve-ticket.js`, `read-frontmatter.js`, `update-frontmatter.js`, `list-tickets.js`, `count-tickets.js`, `check-status.js`, `update-ticket-status.js`, `read-artifact.js`, `save-artifact.js`, `validate-structure.js`

新システムは以下に変わった：
- **データ形式**: 単一 JSON ファイル（Tickets.json）に全データを集約
- **チケットID**: 複合キー `P{phaseID}-{ticketID}`（例: `P0-1`）
- **ステータス**: `todo` → `done` → `reviewed`（3値）
- **スクリプト**: 14の新 CRUD スクリプト（`add-ticket.js`, `get-ticket.js`, `update-ticket.js` 等）

---

## 変更の概要

### 5つのコマンドファイルの修正

| ファイル | 変更規模 | 主な内容 |
|---------|---------|---------|
| `make-ticket.md` | 大 | スクリプト再調整、ID形式変更、spec 定義ワークフロー復元＋JSON連携 |
| `plan-ticket.md` | 大 | `approved` 削除、read-artifact/save-artifact→get-ticket/update-ticket、全ステップ再採番 |
| `start-ticket.md` | 大 | `approved`/`implementing` 削除、startedAt 導入、done 遷移を update-ticket に |
| `review-ticket.md` | 中 | validate-structure 削除、completedAt 導入、save-artifact→update-ticket |
| `resolve-ticket.md` | 小 | 変更なし（独立スクリプトのみ使用のため） |

### アーティファクト→JSONフィールド対応

旧システムで別ファイル管理されていたアーティファクトは、チケットの JSON フィールドに統合された：

| 旧アーティファクト | 新 JSON フィールド |
|-------------------|-------------------|
| spec（調査・背景・要件） | `background`, `scope[]`, `referenceSection`, `relatedTicketIds` |
| plan（実装計画） | `scope[]`（詳細）, `testVerification[]`, `testExceptions[]`, `notes` |
| implementation（実装サマリ） | `changes[]`, `notes` |
| review（レビュー報告書） | `instrumentation`, `notes`, `rfcDiscrepancies[]` |

### queue.md 統合

旧キューシステムが担っていた役割は以下のように Tickets.json に委譲された：

| queue.md の役割 | 移行先 |
|-----------------|--------|
| 実装開始日（startedAt） | チケットの `startedAt` フィールド（YYYY-MM-DD）→ `/start-ticket` で自動記録 |
| 完了日（completedAt） | チケットの `completedAt` フィールド（YYYY-MM-DD）→ `/review-ticket` で自動記録 |
| チェック済み（checked） | `status: "reviewed"` で代替（旧システムから既に同等） |
| キュー順序 | `phases[].tickets[]` 配列インデックスで代替（旧システムから既に同等） |
| 期限切れアーカイブ | Tickets.json は全データ一ファイルのため不要 |

---

## 各ファイルの詳細な変更内容

### 1. `make-ticket.md`

#### 引数の解釈
- **旧**: `数字 → 既存チケットIDとして深掘り`
- **新**: `P{phaseID}-{ticketID} 形式（例: P0-1）→ 既存チケットの複合キーとして深掘り`
- **新**: `数字のみ → エラーで新形式を案内`

#### 使用スクリプト一覧
旧8スクリプトから新7スクリプトに全置換：

| 旧 | 新 |
|----|----|
| `create-ticket.js "" <title>` | `create-spec.js`（spec スケルトン生成）＋ `add-ticket.js`（Tickets.json 登録） |
| `resolve-ticket.js <id>` | `get-ticket.js <PATH to Tickets.json> P{phaseID}-{ticketID}` |
| `read-frontmatter.js <id>` | （同上 `get-ticket.js` で代用） |
| `update-frontmatter.js <id> <key> <val>` | `update-ticket.js <PATH to Tickets.json> P{phaseID}-{ticketID}`（stdin: 更新JSON） |
| `list-tickets.js [status]` | `all-tickets.js <PATH to Tickets.json> [status-filter]` |
| `count-tickets.js` | 削除（`all-tickets.js` の `count` フィールドで代用） |
| `search-tickets.js <query>` | `search-tickets.js <PATH to Tickets.json> <query>`（パス追加のみ） |
| （なし） | `add-phase.js <PATH to Tickets.json>`（フェーズ作成） |
| （なし） | `list-phases-and-tickets.js <PATH to Tickets.json>`（フェーズ一覧） |
| （なし） | `write-tickets-json-template.js <PATH to Tickets.json> <metadata-json>`（スケルトン生成） |

#### ワークフロー変更
- **新規作成**: Tickets.json のパス決定 → 既存フェーズ確認（`list-phases-and-tickets.js`）→ なければ `add-phase.js` で作成 → `add-ticket.js` でチケット作成（`P{phaseID}` で所属指定）
- **証拠の記録**: spec ファイルの `## Investigation` セクションに記録（主）＋ `update-ticket.js` で JSON フィールドにも反映（パイプライン連携用）
- **依存関係**: `resolve-ticket.js` → `get-ticket.js`、依存情報は `relatedTicketIds` フィールドに記録

---

### 2. `plan-ticket.md`

#### ステータス概念の削除
- **旧**: チケットが `approved` ステータスであることが必須。なければ自動的に `approved` に遷移
- **新**: ステータス不問（`todo` / `done` / `reviewed` いずれでも可）。ステータス変更は行わない

#### 使用スクリプト一覧
旧8スクリプトから新5スクリプトに置換：

| 旧 | 新 |
|----|----|
| `resolve-ticket.js <id>` | `get-ticket.js <PATH to Tickets.json> P{phaseID}-{ticketID}` |
| `check-status.js <id> approved` | 削除 |
| `read-frontmatter.js <id>` | （同上 `get-ticket.js` で代用） |
| `update-frontmatter.js <id> <key> <val>` | （同上 `update-ticket.js` で代用） |
| `read-artifact.js <id> spec` | `get-ticket.js <PATH to Tickets.json> P{phaseID}-{ticketID}`（フィールド読み取り） |
| `read-artifact.js <id> plan` | 同上 |
| `save-artifact.js <id> plan` | `update-ticket.js <PATH to Tickets.json> P{phaseID}-{ticketID}`（stdin: 計画JSON） |
| `review/run-quality-checks.js` | 維持（独立スクリプト） |
| `review/generate-report.js` | 維持（独立スクリプト） |

#### ステップ再構成

旧9ステップ → 新9ステップ：

| 旧 | 新 | 変更内容 |
|----|----|---------|
| Step 1: 存在確認 | Step 1: 存在確認 | `resolve-ticket.js`→`get-ticket.js` |
| Step 2: spec の自動承認 | **削除** | `approved` ステータスが存在しないため |
| Step 3: spec 読み取り | Step 2: チケットフィールド読み取り | `read-artifact.js`→`get-ticket.js` |
| Step 4: 既存計画の確認 | Step 3: 既存計画の確認 | `read-artifact.js`→`get-ticket.js` |
| Step 5: Investigation 再検証 | Step 4 | 内容維持 |
| Step 6: 依存・関連チケットID 検証 | Step 5 | `read-artifact.js`+`resolve-ticket.js`→`get-ticket.js` |
| Step 7: 犯罪・スタブ点検 | Step 6 | 内容維持 |
| Step 8: 計画策定 | Step 7 | spec→チケットフィールド |
| Step 9: ユーザー承認待ち | Step 8 | 内容維持 |
| Step 10: 計画の保存 | Step 9 | `save-artifact.js`→`update-ticket.js`（`scope`, `testVerification`, `notes` に保存） |

---

### 3. `start-ticket.md`

#### ステータス概念の削除
- **旧**: `approved` 確認 → `implementing` 遷移 → 実装 → `done` 遷移
- **新**: 存在確認のみ（todo 以外は注意表示）→ 実装 → `done` 遷移
- `implementing` という中間ステータスを完全に廃止。代わりに `startedAt` フィールドで開始日を記録

#### 使用スクリプト一覧
旧8スクリプトから新5スクリプトに置換：

| 旧 | 新 |
|----|----|
| `resolve-ticket.js <id>` | `get-ticket.js <PATH to Tickets.json> P{phaseID}-{ticketID}` |
| `check-status.js <id> approved` | 削除 |
| `update-ticket-status.js <id> implementing` | 削除 |
| `update-ticket-status.js <id> done` | `update-ticket.js` で `{"status":"done"}` |
| `read-artifact.js <id> spec` | `get-ticket.js` でフィールド読み取り |
| `read-artifact.js <id> plan` | 同上 |
| `save-artifact.js <id> implementation` | `update-ticket.js` で `changes`, `notes` に保存 |
| `update-frontmatter.js <id> <key> <val>` | `update-ticket.js` |
| `check-status.js <ref> done` | `get-ticket.js` で status 確認 |
| `review/run-quality-checks.js` | 維持 |
| `review/generate-report.js` | 維持 |

#### startedAt の導入
実装開始時に `startedAt` を自動記録する Step 2 を追加：

```json
{"startedAt":"2026-06-24"}
```

---

### 4. `review-ticket.md`

#### 使用スクリプト一覧
旧9スクリプトから新4スクリプトに削減：

| 旧 | 新 |
|----|----|
| `resolve-ticket.js <id>` | `get-ticket.js <PATH to Tickets.json> P{phaseID}-{ticketID}` |
| `check-status.js <id> done` | `get-ticket.js` の `.ticket.status` 確認 |
| `update-ticket-status.js <id> reviewed` | `update-ticket.js` で `{"status":"reviewed","completedAt":"..."}` |
| `update-ticket-status.js <id> implementing` | `update-ticket.js` で `{"status":"todo"}`（差し戻し） |
| `read-artifact.js <id> spec` | `get-ticket.js` でフィールド読み取り |
| `read-artifact.js <id> implementation` | 同上 |
| `save-artifact.js <id> review` | `update-ticket.js` で `instrumentation`, `notes` に保存 |
| `validate-structure.js` | **削除**（旧Markdownファイル構造検証、JSON には不要） |
| `check-status.js <ref> done` | `get-ticket.js` で status 確認 |
| `review/run-quality-checks.js` | 維持 |
| `review/generate-report.js` | 維持 |

#### completedAt の導入
`reviewed` 遷移時に `completedAt` を同時記録：

```json
{"status":"reviewed","completedAt":"2026-06-24"}
```

#### 差し戻し先の変更
- **旧**: `implementing` に戻す
- **新**: `todo` に戻す

#### 構造整合性チェックの削除
旧 `validate-structure.js` は Markdown ファイル構造（specs/ ディレクトリ、フロントマター、キュー整合性）を検証するスクリプト。JSON モデルでは不要なため削除。

---

### 5. `resolve-ticket.md`

**変更なし。** 本コマンドは「指定ディレクトリの警告・エラー・スタブ・犯罪の解決」を行う独立した機能であり、チケット CRUD システムに依存しない。参照するスクリプト（`find-all-stubs.js`, `scan-crimes.sh`, `malfeasance-create.js` 等）はいずれも独立スクリプトであり、新旧いずれのチケットデータモデルにも影響されない。

---

## 共通パターン

全コマンドファイルに適用された共通の変更パターン：

| パターン | 旧 | 新 |
|---------|----|----|
| チケットID | 単一整数 `42` | 複合キー `P{phaseID}-{ticketID}` |
| 存在確認 | `resolve-ticket.js` → `exists: true/false` | `get-ticket.js` → `success: true/false` |
| フィールド読み取り | `read-frontmatter.js` / `read-artifact.js` | `get-ticket.js` |
| フィールド更新 | `update-frontmatter.js` / `save-artifact.js` | `update-ticket.js`（stdin: JSON） |
| ステータス変更 | `update-ticket-status.js <id> <status>` | `update-ticket.js <path> P{ID}` で `{"status":"..."}` |
| 全件表示 | `list-tickets.js [status]` | `all-tickets.js <path> [status]` |
| 検索 | `search-tickets.js <query>` | `search-tickets.js <path> <query>` |
| Tickets.json パス | （概念なし） | 第1引数として指定（デフォルト: `Tickets.json`） |

---

## スキーマ拡張

`tickets-schema.json` にキュー統合のためのフィールドを追加：

| フィールド | 型 | 必須 | 説明 |
|-----------|----|------|------|
| `startedAt` | string (YYYY-MM-DD) | 任意 | 実装開始日。`/start-ticket` で自動記録 |
| `completedAt` | string (YYYY-MM-DD) | 任意 | レビュー完了日。`/review-ticket` で status=reviewed と同時記録 |

これらのフィールドは `additionalProperties: true` により後方互換性を維持したまま追加可能。

また、`lib/validate-tickets.js` の `strFields` 配列に `startedAt` / `completedAt` を追加し、文字列型としての検証対象とした。

---

## テスト

```bash
bash test.sh        # 17 テスト・約 40 断言
```

### 追加されたテスト

| # | テスト名 | 説明 |
|---|---------|------|
| 8b | `update-ticket with startedAt/completedAt` | startedAt 設定→取得確認→completedAt+reviewed 設定→取得確認 |
| 14 | `write-tickets-json-template` | スケルトン生成→バリデーション通過確認 |

### queue.md 役割委譲のテスト網羅

queue.md の各役割がテストでカバーされていることの対応表：

| queue.md の役割 | テスト | アサーション |
|----------------|--------|------------|
| startedAt | 8b | `d.updated.startedAt == "2026-06-01"`, `d.ticket.startedAt == "2026-06-01"` |
| completedAt | 8b | `d.updated.completedAt == "2026-06-10"`, `d.ticket.completedAt == "2026-06-10"`, `d.ticket.status == "reviewed"` |
| チェック済み | 9（既存） | `d.ticket.status == "reviewed"` |
| キュー順序 | 12（既存） | `P0-3 shown`（配列順で表示） |
| 期限切れアーカイブ | — | Tickets.json 一ファイル設計のため不要 |
