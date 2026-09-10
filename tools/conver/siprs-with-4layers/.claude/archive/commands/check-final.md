---
description: 例: /check-final conver/RFC-ROOT.md。第1引数に最上位親RFCのパスを指定すると、find-omissions と同一の分析を実行し、新たな漏れがないことを確認した上で開発完了条件をチェックする最終ゲート。引数が空ならユーザーに質問する。
---

# /check-final

**第一級規則 — [::STUB::] マーカー絶対義務**: 不完全な実装（スタブ・モック・仮実装・プレースホルダー等、名称を問わず）には全て `[::STUB::]` マーカーを付与しなければならない。これは死守すべき絶対的法規であり、違反は「犯罪」として Malfeasance.json に記録される。ルートディレクトリ（RFCファイルがあるディレクトリ）配下で発見した全ての [::STUB::] マーカー及び犯罪は全て「漏れ・矛盾・不足」であると判断し、OMISSIONS-XXX.json に記録しなければならない。[::STUB::] マーカー及び犯罪は、「漏れ・矛盾・不足」の一種に過ぎないのであって、「漏れ・矛盾・不足」の全てではないと理解すること。

**役割**: RFCを正典とし、RFCの設計内容とルートディレクトリ（RFCファイルがあるディレクトリ）配下の実装コードを比較しながら漏れ・矛盾・不足を発見して `OMISSIONS-XXX.json` に出力する。その後、全チケットの完了状態を検証して開発完了を宣言する。

## 引数の解釈

- **第1引数（必須）**: 最上位の親RFCファイルのパス（parent-rfc を持たない最初のRFC）。このファイルがあるディレクトリが「ルートディレクトリ」となる。
  - 例: `conver/RFC-ROOT.md`
  - 出力先: `{RFC_DIR}/OMISSIONS-XXX.json`（XXXは001からの連番）

## 出力先

- RFCファイルと同じディレクトリに `OMISSIONS-XXX.json` を生成する
- XXX は既存の `OMISSIONS-*.json` の最大番号 + 1
- 初回は `OMISSIONS-001.json`

## 使用スクリプト一覧

### スケルトン生成
| スクリプト | 引数 | 説明 |
|---|---|---|
| `create-omissions.js` | `<RFC_FILE_PATH> [--check-final]` | スケルトン生成 + 番号採番 + 検証一体化（--check-final で9ステップ） |
| `validate-omissions.js` | `<OMISSIONS_FILE_PATH>` | OMISSIONS JSON スキーマ検証 |

### RFC理解書き込み（stdin で JSON を受け取り、該当フィールドのみ更新）
| スクリプト | 引数 | 説明 |
|---|---|---|
| `add-omissions-meta.js` | `<OMISSIONS_FILE_PATH>` | summary 書き込み |
| `add-omissions-rfc-goal.js` | `<OMISSIONS_FILE_PATH>` | purpose, goals, successCriteria, nonScope 書き込み |
| `add-omissions-rfc-architecture.js` | `<OMISSIONS_FILE_PATH>` | architecture, componentRelations, designDecisions 書き込み |
| `add-omissions-rfc-detail-1.js` | `<OMISSIONS_FILE_PATH>` | typeDefinitions, apiSignatures, dependencyGraph, externalDependencies 書き込み |
| `add-omissions-rfc-detail-2.js` | `<OMISSIONS_FILE_PATH>` | testRequirements, errorHandling, configuration 書き込み |
| `show-omissions-rfc-understanding.js` | `<OMISSIONS_FILE_PATH>` | rfcUnderstanding 全体の整形表示 |

### OMISSIONS 追記・表示
| スクリプト | 引数 | 説明 |
|---|---|---|
| `add-omission.js` | `<OMISSIONS_FILE_PATH>`（stdin） | omission を1件追加（id自動採番） |
| `list-omissions.js` | `<OMISSIONS_FILE_PATH>` | OMISSIONS 一覧表示 |
| `show-omissions-steps.js` | `<OMISSIONS_FILE_PATH>` | 進捗チェックリスト表示 |
| `update-omissions-step.js` | `<OMISSIONS_FILE_PATH> <STEP_ID> <STATUS>` | ステップ status 更新 |
| `convert-omissions-to-markdown.js` | `<OMISSIONS_FILE_PATH>` | JSON→Markdown 変換

### 犯罪管理
| スクリプト | 引数 | 説明 |
|---|---|---|
| `scan-crimes.sh` | `[RFC_DIR]` | 犯罪スキャン |
| `malfeasance-create.js` | `<FILE_PATH> <LINE> <DESCRIPTION> [NOTE]` | 犯罪記録 |
| `malfeasance-update.js` | `<ID> <KEY> <VALUE>` | 犯罪更新 |

### チケット確認
| スクリプト | 引数 | 説明 |
|---|---|---|
| `all-tickets.js` | `<PATH of Tickets.json> [status-filter]` | 全チケット一覧 |

## ワークフロー

全ステップの先頭で `show-omissions-steps.js` を実行し、現在の進捗を確認する。既に完了したステップはスキップする。各サブステップ完了後、ただちに `update-omissions-step.js` で status を更新する。

```bash
# 冒頭の確認
OMISSIONS_PATH="{RFC_DIR}/OMISSIONS-XXX.json"
node .claude/scripts/tickets/show-omissions-steps.js "$OMISSIONS_PATH"
```

---

以下の Step 1〜6 は `/find-omissions-for-next-rfc` と全く同一の処理を実行し、新たな漏れ・矛盾・不足が発生していないかを確認する。

---

### Step 0: 引数パース + ルートディレクトリ決定

```bash
RFC_PATH="${ARGUMENTS%% *}"
RFC_DIR="$(dirname "$RFC_PATH")"

if [ ! -f "$RFC_PATH" ]; then
  echo "エラー: RFCファイルが見つかりません: $RFC_PATH"
  exit 1
fi
```

---

### Step 1: スケルトン生成（機械的処理）

`create-omissions.js` がスケルトン生成・番号採番・スキーマ検証を一貫して行う。
`--check-final` フラグにより、9ステップのスケルトンが生成される。

```bash
RESULT=$(node .claude/scripts/tickets/create-omissions.js "$RFC_PATH" --check-final)
echo "$RESULT"
# {"success":true, "path":"...", "omissionsFilePath":".../OMISSIONS-001.json", "nextNumber":1}
```

出力の `omissionsFilePath` を `OMISSIONS_PATH` として保持する。この時点で `OMISSIONS-XXX.json` には全 `rfcUnderstanding` フィールド（空文字）と全9つの `steps` が初期値として書き込まれている。

---

### Step 2: RFC 理解（6 子ステップ）

RFCファイルを読み込み、**抽象度の高い層から順に**設計内容を完全に理解する。各サブステップの理解結果は独立したスクリプトで OMISSIONS ファイルに書き込む。AI は一度に多くのフィールドを書き込もうとせず、1スクリプトの担当範囲だけを丁寧に記述する。

#### 2a-1: 目的とゴールの把握（前回の再利用 + 検証）

前回の OMISSIONS に purpose/goals/successCriteria/nonScope が記録されていれば、その値を検証して正しければそのまま使用する。誤りがあれば修正する。前回データがなければ新規分析する。

```bash
RFC_GOAL=$(bash .claude/scripts/tickets/get-before-rfc-understanding.sh "$RFC_DIR" "purpose")
```

- `$RFC_GOAL` が空でなければ前回の値を取得できた証拠 → RFC と照合して検証。正しければそのまま使用。誤りがあれば修正して使用する。
- `$RFC_GOAL` が空なら前回データなし → 以下の観点で新規分析する：

RFCの目的・ゴール・成功条件・非スコープを把握する：
- RFC全体の目的とスコープ — この設計で何を実現したいのか
- 解決すべき問題・課題 — なぜこの設計が必要なのか
- 成功条件 — 何が満たされたらこのRFCの目的は達成されたと言えるのか
- 非スコープ — このRFCが意図的に対象外とした領域はどこか

```bash
echo '{"purpose":"...","goals":"...","successCriteria":"...","nonScope":"..."}' | node .claude/scripts/tickets/add-omissions-rfc-goal.js "$OMISSIONS_PATH"
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "2a-1" "done"
```

#### 2a-2: メタ情報の記録（前回の再利用 + 検証）

前回の summary を取得し、検証して正しければそのまま使用する。

```bash
RFC_SUMMARY=$(bash .claude/scripts/tickets/get-before-rfc-understanding.sh "$RFC_DIR" "summary")
```

- `$RFC_SUMMARY` が空でなければ前回の値を検証して正しければそのまま使用。
- 空なら新規作成。

```bash
echo '{"summary":"<RFC全体の要約>"}' | node .claude/scripts/tickets/add-omissions-meta.js "$OMISSIONS_PATH"
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "2a-2" "done"
```

#### 2b: アーキテクチャ把握（前回の再利用 + 検証）

前回の architecture/componentRelations/designDecisions を取得し、検証して正しければそのまま使用する。

```bash
RFC_ARCH=$(bash .claude/scripts/tickets/get-before-rfc-understanding.sh "$RFC_DIR" "architecture")
```

- `$RFC_ARCH` が空でなければ前回の値を検証して正しければそのまま使用。
- 空なら以下の観点で新規分析する：

RFCが描くシステム全体の姿を理解する：
- アーキテクチャの概要と設計思想 — 全体はどのような構造か、なぜその構造なのか
- 主要コンポーネントとその責務 — どのような部品が何を担当するのか
- コンポーネント間の関係とデータの流れ — 情報はどのように伝達されるのか
- 設計上のトレードオフと選択理由 — なぜ他の方式ではなくこの方式を選んだのか

```bash
echo '{"architecture":"...","componentRelations":"...","designDecisions":"..."}' | node .claude/scripts/tickets/add-omissions-rfc-architecture.js "$OMISSIONS_PATH"
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "2b" "done"
```

#### 2c-1: 実装詳細（型・API・依存） — 前回の再利用 + 検証

前回の typeDefinitions/apiSignatures/dependencyGraph/externalDependencies を取得し、検証して正しければそのまま使用する。

```bash
RFC_TYPEDEF=$(bash .claude/scripts/tickets/get-before-rfc-understanding.sh "$RFC_DIR" "typeDefinitions")
```

- `$RFC_TYPEDEF` が空でなければ前回の値を検証して正しければそのまま使用。
- 空なら以下の観点で新規分析する：

具体的な実装定義を漏れなく把握する：
- 型定義（構造体、列挙型、トレイト、型エイリアス）
- 関数シグネチャ（公開API、非公開関数、asyncの有無、エラー型）
- トレイト境界とジェネリクス制約
- 依存関係グラフ（コンポーネント間・モジュール間）
- 外部依存（I/O、LLM、DB、乱数生成、ネットワーク）

```bash
echo '{"typeDefinitions":"...","apiSignatures":"...","dependencyGraph":"...","externalDependencies":"..."}' | node .claude/scripts/tickets/add-omissions-rfc-detail-1.js "$OMISSIONS_PATH"
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "2c-1" "done"
```

#### 2c-2: 実装詳細（テスト・エラー処理・設定） — 前回の再利用 + 検証

前回の testRequirements/errorHandling/configuration を取得し、検証して正しければそのまま使用する。

```bash
RFC_TEST=$(bash .claude/scripts/tickets/get-before-rfc-understanding.sh "$RFC_DIR" "testRequirements")
```

- `$RFC_TEST` が空でなければ前回の値を検証して正しければそのまま使用。
- 空なら以下の観点で新規分析する：

- テスト要件と検証方法
- エラー処理・異常系の定義
- 設定・構成パラメータ

```bash
echo '{"testRequirements":"...","errorHandling":"...","configuration":"..."}' | node .claude/scripts/tickets/add-omissions-rfc-detail-2.js "$OMISSIONS_PATH"
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "2c-2" "done"
```

#### 2-review: RFC理解の全体確認

`show-omissions-rfc-understanding.js` で全 `rfcUnderstanding` を表示し、RFCとの齟齬がないか確認する。齟齬があれば該当する add-omissions-* スクリプトで修正し、齟齬がなくなるまで繰り返す。

```bash
node .claude/scripts/tickets/show-omissions-rfc-understanding.js "$OMISSIONS_PATH"
```

**目的とゴール（2a）を最初に理解しなければ、機械的な実装定義（2c）の比較だけでは「設計の意図が実装に反映されていない」という種類の漏れを発見できない。必ず上位層から理解すること。**

```bash
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "2-review" "done"
```

---

### Step 3: ソースコード比較分析（4 子ステップ）

各サブステップは Step 2 の対応する層と1対1で対応する。まず `show-omissions-rfc-understanding.js` で該当フィールドを参照し、その観点でコードを調査する。

**発見即記録の原則**: omission を1件発見するたびに、`add-omission.js` で即座に OMISSIONS ファイルに追加する。まとめて記憶して後で書き込む方法は禁止。これにより「発見したのに忘れた」を防止する。

```bash
# 発見したら即座に1件追加
echo '{"type":"missing_implementation","severity":"high","rfcSection":"§3.2","description":"Xxxトレイトが実装されていない","affectedFiles":["src/lib.rs"],"suggestedResolution":"Xxxトレイトを実装する"}' | node .claude/scripts/tickets/add-omission.js "$OMISSIONS_PATH"
# → {"success":true, "omissionId":"O-001"}
```

#### 3a: 目的とゴールの実装反映確認

`show-omissions-rfc-understanding.js` で `purpose`, `goals`, `successCriteria`, `nonScope` を参照しながら、実装がRFCの目的を達成しているか、非スコープ領域に実装が漏れていないかを確認する。

```bash
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "3a" "done"
```

#### 3b: アーキテクチャの実装一致確認

`architecture`, `componentRelations`, `designDecisions` を参照しながら、モジュール構造・データフローが設計と一致するか、選択された設計判断がコードに現れているかを確認する。

```bash
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "3b" "done"
```

#### 3c-1: 型・API・依存関係の確認

`typeDefinitions`, `apiSignatures`, `dependencyGraph`, `externalDependencies` を参照しながら、定義された全型・全関数が実装されているか、依存関係が設計通りかを確認する。

```bash
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "3c-1" "done"
```

#### 3c-2: テスト・エラー処理・設定の確認

`testRequirements`, `errorHandling`, `configuration` を参照しながら、テスト網羅・エラー処理実装・設定機構が設計通りかを確認する。

```bash
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "3c-2" "done"
```

---

### Step 4: 発見漏れの確認

全比較ステップ完了後、`list-omissions.js` で現在の omission 一覧を確認し、「この観点では発見漏れがないか」を最終確認する。発見漏れがあれば即座に `add-omission.js` で追加する。

```bash
node .claude/scripts/tickets/list-omissions.js "$OMISSIONS_PATH"
```

```bash
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "4" "done"
```

---

### Step 5: 最終検証

5a: `validate-omissions.js` で OMISSIONS JSON のスキーマ整合性を確認する。
5b: `scan-crimes.sh` で犯罪を点検する。

```bash
node .claude/scripts/lib/validate-omissions.js "$OMISSIONS_PATH"
.claude/scripts/tickets/scan-crimes.sh "$RFC_DIR"
```

```bash
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "5a" "done"
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "5b" "done"
```

---

### Step 6: 完了報告

`list-omissions.js` で全 omission の一覧を表示し、全ステップを `done` にして完了を宣言する。

```bash
node .claude/scripts/tickets/list-omissions.js "$OMISSIONS_PATH"

# OMISSIONS JSON を Markdown に変換（次段階 /grill-me-for-next-rfc-ja が読み取る）
node .claude/scripts/tickets/convert-omissions-to-markdown.js "$OMISSIONS_PATH"

node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "6" "done"
node .claude/scripts/tickets/show-omissions-steps.js "$OMISSIONS_PATH"
```

出力例:
```
親RFC: docs/RFC-001-process-registry.md

[!] O-001 [missing_implementation] §3.2: Xxxトレイトが未実装
      src/lib.rs
[ ] O-002 [test_missing] §4.1: Yyy関数の異常系テストがない
```

---

### Step 7: 新規OMISSIONSの評価

check-final の自己分析で生成した OMISSIONS-XXX.json の各 omission を、1件ずつ severity と判断理由とともに評価する。

```bash
node .claude/scripts/tickets/list-omissions.js "$OMISSIONS_PATH"
```

各 omission に対して以下の評価を行う：

| 評価 | 基準 | 対応 |
|------|------|------|
| **許容 (low)** | 軽微な問題。コードスタイルの乱れ、コメントの不備、テストケースの不足など | 理由を添えて最終報告に記載。直ちに対応する必要はない |
| **許容 (medium)** | 中程度の問題。ただし次RFCを書くほどではない、現状の運用でカバー可能 | 理由を添えて最終報告に記載。必要に応じて別チケットで対応を示唆 |
| **要対応 (high)** | 設計上の重要な問題、バグ、未実装の機能。次RFCが必要 | 理由を添えて最終報告に記載 → **FAIL** |

```bash
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "7" "done"
```

---

### Step 8: 全チケット reviewed 確認

```bash
RESULT=$(node ".claude/scripts/tickets/all-tickets.js" "Tickets.json")
```

全チケットの status が `reviewed` であること。未了があれば FAIL として列挙する。

```bash
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "8" "done"
```

---

### Step 9: 最終結果報告

全9ステップの完了確認：

```bash
node .claude/scripts/tickets/show-omissions-steps.js "$OMISSIONS_PATH"
```

全9ステップが全て `done` であることを確認する。

**PASS** — 全条件クリア 🎉:
```
✅ PASS: 開発完了条件を満たしています。
- 自己分析: new 0件（全て許容評価済み）
- 全チケット: reviewed
- 全9ステップ: 完了
```

自己分析で発見された omission が全て low/medium と判断され、かつ全チケットが reviewed であれば PASS とする。

**FAIL** — 未達条件あり:
```
❌ FAIL: 以下の条件が未達です。
- Step 7: high severity omission がN件:
    O-001: Xxxが未実装 → high (理由: ...)
    O-002: Yyyにバグ → high (理由: ...)
- 許容/軽微な omission:
    O-003: コメント不備 → low (理由: ...)
- Step 8: 未reviewedチケット: PX-N

次のアクション:
→ high の omission は /formulate-tickets-for-next で対応。
→ 軽微な omission および未reviewedチケットは /plan-ticket から対応。
```

```bash
node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "9" "done"
```
