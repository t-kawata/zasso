---
ticket_id: 2
title: find-omissions リファクタリング — スキーマ拡張・ワークフロー細分化・steps追跡
slug: find-omissions-steps
status: draft
created_at: 2026-06-25
updated_at: 2026-06-25
---

# find-omissions リファクタリング — スキーマ拡張・ワークフロー細分化・steps追跡

## Summary

`/find-omissions-for-next-rfc` の OMISSIONS JSON スキーマを拡張し、RFC理解情報（rfcUnderstanding 14フィールド）とワークフロー進捗追跡（steps）を追加する。あわせて、RFC理解・比較分析・記録の各工程を独立したスクリプトで段階的に実行するワークフローに再構成する。

## Background

現在の `OMISSIONS-XXX.json` は omission リストのみを格納しており、RFCの目的・ゴール・アーキテクチャ全体像といった理解情報を保持する場がない。また、`/find-omissions-for-next-rfc` のワークフローは「Step 2: RFC読解 → Step 3: コード比較」が1塊になっており、段階的な実行と進捗追跡ができない。

具体的な問題：
- Step 2 で把握したRFCの全体像が揮発し、後のステップで再利用できない
- ソースコード調査・比較分析のたびにRFCを再読する必要がある
- omission を発見した時点で即座に記録できず、記憶に頼るリスクがある
- 長いワークフローの中で「今どのステップまで終わっているか」を追跡できない
- AIが一度に多くのフィールドを書き込もうとして情報密度が落ちる

## Scope

### スキーマ拡張（1ファイル変更）
- `omissions-schema.json`: `rfcUnderstanding`（14フィールド）と `steps`（階層ステータス管理）を追加

### 新規スクリプト（10本）
| # | スクリプト | 説明 |
|---|-----------|------|
| 1 | `create-omissions.js` | スケルトン生成 + 番号採番 + 検証を一体化 |
| 2 | `add-omissions-meta.js` | summary 書き込み |
| 3 | `add-omissions-rfc-goal.js` | purpose, goals, successCriteria, nonScope 書き込み |
| 4 | `add-omissions-rfc-architecture.js` | architecture, componentRelations, designDecisions 書き込み |
| 5 | `add-omissions-rfc-detail-1.js` | typeDefinitions, apiSignatures, dependencyGraph, externalDependencies 書き込み |
| 6 | `add-omissions-rfc-detail-2.js` | testRequirements, errorHandling, configuration 書き込み |
| 7 | `show-omissions-rfc-understanding.js` | rfcUnderstanding 全体の整形表示 |
| 8 | `show-omissions-steps.js` | ワークフローステップの進捗表示 |
| 9 | `update-omissions-step.js` | ステップの status 更新 |
| 10 | `add-omission.js` | 発見した omission を即座に1件追加（id自動採番） |

### コマンドファイル変更（1ファイル）
- `find-omissions-for-next-rfc.md`: 6段階ワークフローに再構成

### 既存スクリプト変更（1ファイル）
- `validate-omissions.js`: `rfcUnderstanding` + `steps` の検証追加

### テスト追加（1ファイル）
- `test.sh`: 新スクリプト群のテスト追加

## Non-scope

- PX-1 で実装済みの `next-omissions-number.js`, `list-omissions.js` の変更
- 既存の ticket CRUD スクリプトの変更
- 既存の grill スクリプトの変更
- READMD.md の更新

## Investigation

本チケットの設計は以下の plan ファイルに完全に記述されている：
`.claude/plans/grill-formulate-make-plan-start-review-r-shimmering-hummingbird.md`

### 既存のスキーマ構造

`omissions-schema.json` は現在50行、以下の構造：
- parentRfcPath, parentRfcTitle, generatedAt (YYYY-MM-DD), summary
- omissions[] → id (O-XXX), type (7種enum), severity (4段階), rfcSection, description, details, affectedFiles[], suggestedResolution, resolvedInNextRfc

不足しているもの：
- RFC理解情報（purpose, goals, architecture 等）→ rfcUnderstanding
- ワークフローステップ進捗 → steps

### 既存のワークフローの問題点

`find-omissions-for-next-rfc.md` の現在の構成：
- Step 0: 引数パース
- Step 1: OMISSIONS 番号決定（next-omissions-number.js）
- Step 2: RFC読解（一塊）
- Step 3: 実装コード調査（一塊）
- Step 4: 比較分析（一塊）
- Step 5-7: 検証・出力

問題：Step 2-4 がAI任せの一塊になっており、中間状態の記録・追跡ができない。

### 既存スクリプトのパターン（参考実装）

- `update-ticket.js`: マージ処理パターン（stdin JSON → 該当フィールドのみ上書き）→ 新規書き込みスクリプト群の参考
- `list-phases-and-tickets.js`: チェックリスト表示パターン → show-omissions-steps.js の参考
- `write-tickets-json-template.js`: スケルトン生成パターン → create-omissions.js の参考
- `add-ticket.js`: 自動ID採番パターン → add-omission.js の参考

## スキーマ設計

### rfcUnderstanding — Step 2 の全3層を14フィールドでカバー

```json
{
  "rfcUnderstanding": {
    "purpose": "RFC全体の目的とスコープ",
    "goals": "解決すべき問題・課題・達成すべき目標",
    "successCriteria": "成功条件 — 何が満たされたら目的達成か",
    "nonScope": "意図的に対象外とした領域",
    "architecture": "アーキテクチャ概要と設計思想",
    "componentRelations": "コンポーネント間の関係とデータの流れ",
    "designDecisions": "設計上のトレードオフと選択理由",
    "typeDefinitions": "型定義（構造体・列挙型・トレイト・型エイリアス）",
    "apiSignatures": "関数シグネチャ（公開API・非公開・async・エラー型）",
    "dependencyGraph": "依存関係グラフ（コンポーネント間・モジュール間）",
    "externalDependencies": "外部依存（I/O、LLM、DB、乱数、ネットワーク）",
    "testRequirements": "テスト要件と検証方法",
    "errorHandling": "エラー処理・異常系の定義",
    "configuration": "設定・構成パラメータ"
  }
}
```

全14フィールド、全て optional（スケルトン時は空文字）

### steps — ワークフロー進捗の階層追跡

```json
{
  "steps": [
    {"id":"1","label":"スケルトン生成","status":"done","children":[
      {"id":"1a","label":"OMISSIONS番号採番","status":"done"},
      {"id":"1b","label":"雛形JSON書き出し","status":"done"}
    ]},
    {"id":"2","label":"RFC理解","status":"todo","children":[
      {"id":"2a-1","label":"目的とゴールの把握","status":"todo"},
      {"id":"2a-2","label":"メタ情報の記録","status":"todo"},
      {"id":"2b","label":"アーキテクチャ把握","status":"todo"},
      {"id":"2c-1","label":"実装詳細（型・API・依存）","status":"todo"},
      {"id":"2c-2","label":"実装詳細（テスト・エラー処理・設定）","status":"todo"},
      {"id":"2-review","label":"RFC理解の全体確認","status":"todo"}
    ]},
    {"id":"3","label":"ソースコード比較分析","status":"todo","children":[
      {"id":"3a","label":"目的とゴールの実装反映確認","status":"todo"},
      {"id":"3b","label":"アーキテクチャの実装一致確認","status":"todo"},
      {"id":"3c-1","label":"型・API・依存関係の確認","status":"todo"},
      {"id":"3c-2","label":"テスト・エラー処理・設定の確認","status":"todo"}
    ]},
    {"id":"4","label":"発見漏れ確認","status":"todo"},
    {"id":"5","label":"最終検証","status":"todo","children":[
      {"id":"5a","label":"スキーマ検証","status":"todo"},
      {"id":"5b","label":"犯罪点検","status":"todo"}
    ]},
    {"id":"6","label":"完了報告","status":"todo"}
  ]
}
```

各ステップは `id`, `label`, `status`（todo/in_progress/done）を持ち、children による階層構造を許容。

### create-omissions.js が生成するスケルトン（全フィールド空）

```json
{
  "parentRfcPath": "<RFCファイルの絶対パス>",
  "parentRfcTitle": "<RFCから抽出したタイトル>",
  "generatedAt": "YYYY-MM-DD",
  "summary": "",
  "rfcUnderstanding": {
    "purpose": "", "goals": "", "successCriteria": "", "nonScope": "",
    "architecture": "", "componentRelations": "", "designDecisions": "",
    "typeDefinitions": "", "apiSignatures": "", "dependencyGraph": "",
    "externalDependencies": "", "testRequirements": "", "errorHandling": "",
    "configuration": ""
  },
  "omissions": [],
  "steps": [ ...上記の全6ステップ... ]
}
```

## ワークフロー設計（find-omissions-for-next-rfc.md 改訂版）

### Step 1: スケルトン生成（機械的）
`create-omissions.js <RFC_PATH>` でスケルトン生成。`next-omissions-number.js` は内部処理に統合。

### Step 2: RFC理解（6子ステップ）
各サブステップで独立した書き込みスクリプトを使用。AIは一度に多くのフィールドを書き込まず、1スクリプトの担当範囲だけを丁寧に記述する。

| 子ステップ | スクリプト | 書き込むフィールド |
|-----------|-----------|-------------------|
| 2a-1: 目的とゴールの把握 | add-omissions-rfc-goal.js | purpose, goals, successCriteria, nonScope |
| 2a-2: メタ情報 | add-omissions-meta.js | summary |
| 2b: アーキテクチャ把握 | add-omissions-rfc-architecture.js | architecture, componentRelations, designDecisions |
| 2c-1: 実装詳細（型・API・依存） | add-omissions-rfc-detail-1.js | typeDefinitions, apiSignatures, dependencyGraph, externalDependencies |
| 2c-2: 実装詳細（テスト・エラー処理・設定） | add-omissions-rfc-detail-2.js | testRequirements, errorHandling, configuration |
| 2-review: 全体確認 | show-omissions-rfc-understanding.js | 読み取り専用 |

各子ステップ完了後、update-omissions-step.js で status を更新。

### Step 3: ソースコード比較分析（4子ステップ + 発見即記録）
**発見即記録の原則**: omission を1件発見するたびに add-omission.js で即座に OMISSIONS へ追加。まとめて記憶して後で書き込む方法は禁止。

| 子ステップ | 参照フィールド | 調査観点 |
|-----------|---------------|---------|
| 3a: 目的とゴール | purpose, goals, successCriteria, nonScope | 実装がRFCの目的を達成しているか |
| 3b: アーキテクチャ | architecture, componentRelations, designDecisions | 構造・データフローが設計と一致するか |
| 3c-1: 型・API・依存 | typeDefinitions, apiSignatures, dependencyGraph, externalDependencies | 全型・全関数が実装されているか |
| 3c-2: テスト・エラー処理・設定 | testRequirements, errorHandling, configuration | テスト網羅・エラー処理が設計通りか |

### Step 4: 発見漏れの確認
list-omissions.js で一覧確認 → 発見漏れがあれば即座に add-omission.js で追加。

### Step 5: 最終検証
5a: validate-omissions.js でスキーマ検証。5b: scan-crimes.sh で犯罪点検。

### Step 6: 完了報告
list-omissions.js で全 omission 表示。全ステップを done にして完了宣言。

## Test Plan

### ユニットテスト計画

| テスト対象 | ケース数 | 主要ケース |
|-----------|---------|-----------|
| create-omissions.js | 4 | 正常生成、検証通過、不在ファイル、引数なし |
| add-omissions-meta.js 等(5本) | 各2 | 正常書き込み、不正JSON |
| show-omissions-rfc-understanding.js | 2 | あり→表示、空→空表示 |
| show-omissions-steps.js | 1 | 階層表示確認 |
| update-omissions-step.js | 3 | 正常更新、不在ID、不正status |
| add-omission.js | 2 | 正常追加＋ID採番、必須欠落 |
| validate-omissions.js拡張 | 2 | rfcUnderstanding検証、steps検証 |

### ユニットテスト不可能な項目
- コマンドファイル（.md）は Claude Code 上での手動実行でのみ検証可能
- ワークフロー一貫性テスト（Step1→2→3→4→5→6 の連続実行）は手動確認

## Boy Scout Rule — 翻訳可能性計画

新規スクリプト群では以下を徹底する：
- 関数名は動詞句（createSkeleton, validateUnderstanding, showSteps）
- 変数名はドメイン概念（omissionsFilePath, stepId, rfcUnderstanding）
- 一関数一責務（各書き込みスクリプトが担当するフィールド群は明確に限定）
- エラーは JSON 形式で返し握りつぶさない
- console.log は全て JSON stdout プロトコルの意図的利用のみ

既存コードの翻訳可能性問題はスコープ外。

## Acceptance Criteria

- [ ] omissions-schema.json に rfcUnderstanding（14フィールド）と steps が定義されている
- [ ] validate-omissions.js が rfcUnderstanding と steps の検証を通す
- [ ] create-omissions.js がスケルトン生成＋スキーマ検証を一体化して行う
- [ ] 5本の add-omissions-*.js が各担当フィールドのみを更新する
- [ ] show-omissions-rfc-understanding.js が全フィールドを整形表示する
- [ ] show-omissions-steps.js が階層構造の進捗を表示する
- [ ] update-omissions-step.js がステータスを更新する
- [ ] add-omission.js が omission を1件追加し id を自動採番する
- [ ] find-omissions-for-next-rfc.md が6段階ワークフローに再構成されている
- [ ] 各ワークフローステップの先頭で show-omissions-steps.js による現在位置確認が明記されている
- [ ] Step 3 内で「発見即記録」と add-omission.js の使用が明記されている
- [ ] bash test.sh が全テスト PASS する

## Notes

- PX-1 からの依存関係: PX-1 で作成した omissions-schema.json, validate-omissions.js, next-omissions-number.js, list-omissions.js, find-omissions-for-next-rfc.md を本チケットで拡張・改修する
- next-omissions-number.js は create-omissions.js の内部処理に統合されるが、既存の単独利用も可能なまま維持する
- list-omissions.js は変更不要（既存の omission 一覧表示としてそのまま利用）
- 実装順序は14ステップ：スキーマ拡張→validate更新→create-omissions→add-omissions-meta→rfc-goal→rfc-architecture→rfc-detail-1→rfc-detail-2→show-understanding→show-steps→update-step→add-omission→findコマンド更新→test.sh
