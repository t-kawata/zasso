# Q1

OKF実装のために必要な情報を全てまとめて

# A1

実装対象は **Open Knowledge Format（OKF）v0.2** です。必要なのは「Markdown＋YAMLを読む処理」だけではなく、パス解決、グラフ構築、予約ファイル、信頼・鮮度の解釈、検証ポリシーの分離です。公式仕様はこれらを `SPEC.md` にまとめています。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

以前の「探索・到達は決定論的なコードに任せ、AIには判断だけをさせる」という構成にも使えるように、以下を分けて整理します。

- 公式仕様として実装するもの
- 仕様が定めていないため、自分で決めるもの
- エージェント運用で追加するもの

## 1. 正本と実装範囲

### 参照する一次資料

|資料|用途|
|---|---|
|[公式 SPEC.md](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md)|フォーマットとconsumerの規範|
|[公式リポジトリ](https://github.com/GoogleCloudPlatform/open-knowledge-format)|生成エージェント、サンプル、可視化、テスト|
|公式 `bundles/`|実データによる読み込み試験|
|公式 `src/reference_agent/`|producer／consumerの参考実装|

公式リポジトリのエージェントとビューアはproof of conceptです。OKFそのものは特定のモデル、フレームワーク、実行基盤に依存せず、SDKも必須ではありません。 [github](https://github.com/GoogleCloudPlatform/open-knowledge-format)

実装開始時には、仕様のコミットを固定してください。`main` をそのまま適合性の基準にすると、実装と仕様の対応が再現できません。これは以下の実装設計上の提案です。

### 推奨する分割

```text
okf-core       ファイル分類、parse、ID、パス解決、グラフ
okf-validation 公式適合性、診断、独自profile検証
okf-query      一覧、検索、到達集合、context構築
okf-authoring  作成、更新、index生成、リンク更新
okf-runtime    executor／attesterの実行。必要になったら追加
okf-cli        上記のCLI
```

最初に作るべきなのは `core + validation + query + CLI` です。Attested Computationの実行環境は分離します。

## 2. ディスク上の仕様

### バンドル

バンドルはディレクトリツリーです。Gitリポジトリ、アーカイブ、大きなリポジトリ内のサブディレクトリとして配布できます。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

```text
knowledge/
  index.md
  log.md

  rules/
    index.md
    error-handling.md
    authentication.md

  services/
    payment-api.md

  references/
    upstream-policy.md
```

重要な規則：

|項目|公式仕様|
|---|---|
|通常の `.md`|concept文書|
|`index.md`|任意の階層で予約。conceptに使わない|
|`log.md`|任意の階層で予約。conceptに使わない|
|conceptの文字コード|UTF-8|
|concept ID|バンドル内のファイルパスから `.md` を除いたもの|
|ディレクトリ分類|ドメインに応じて自由|
|非Markdownファイル|計算コードなどから参照可能。conceptではない|

例えば `rules/authentication.md` のconcept IDは `rules/authentication` です。`id:` frontmatterが公式の識別子なのではありません。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

したがって、ファイル移動・改名はconcept IDの変更です。安定した業務IDが必要なら、独自フィールドを別に設けます。

### 最小concept

```markdown
---
type: Rule
---

認証失敗時は処理を中断する。
```

conceptは、先頭の `---` で始まるYAML frontmatterと、閉じる `---` 以降のMarkdown本文からなります。常時必須のキーは非空の `type` だけです。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

## 3. Frontmatterの全体像

### 基本フィールド

|フィールド|意味・処理|
|---|---|
|`type`|必須の短い文字列。種類の中央登録制度はない|
|`title`|表示名。なければファイル名から導出可能|
|`description`|1文の要約。indexや検索スニペットに使う|
|`resource`|記述対象の資産を特定するURIなど|
|`tags`|短い文字列のYAMLリスト|
|その他|自由に拡張可能|

未知の `type` や未知のキーを理由に拒否してはいけません。ラウンドトリップ時には未知のキーを保持することが推奨されています。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

以下は、以降の機能を含む例です。`Rule` はこの例で選んだ独自のtype名です。

```markdown
---
type: Rule
title: 認証失敗時の処理
description: 認証に失敗した要求の処理を中断する。
tags: [security, authentication]
status: stable

generated:
  by: process:rules-importer
  at: "2026-11-13T10:00:00Z"

verified:
  - by: human:reviewer
    at: "2026-11-13T11:00:00Z"

stale_after: "2027-02-13T00:00:00Z"

sources:
  - id: security-policy
    resource: /references/security-policy.md
    title: Security Policy

x-rule-id: AUTH-001
---

# Rule

認証失敗時は処理を中断する。[^security-policy]

詳細は[認証サービス](/services/authentication.md)を参照する。

[^security-policy]: Security Policy
```

`x-rule-id` は独自拡張です。`x-` 接頭辞自体もOKFの必須規約ではありません。

### 出典：`sources`

|フィールド|意味|
|---|---|
|`sources[].resource`|entry内で必須。URL、パス、または調査母集団などのscope記述|
|`sources[].id`|本文の脚注との結合キー|
|`sources[].title`|出典の表示名|
|`sources[].author`|出典の作者|
|`sources[].usage_count`|利用回数|
|`sources[].last_modified`|出典自体の更新日時|
|`usage_window`|利用回数の計測期間 `{from, to}`|
|`sources[].usage_window`|その出典だけの計測期間の上書き|

本文の `[^security-policy]` を `sources[].id` に結合します。出典リストの位置ではなく、安定したIDで対応づけます。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

注意点は次の2つです。

- `sources[].resource` は、必ずしも取得できるURIではありません。「プロジェクトX内の全クエリ」のようなscope記述も許容されます。
- `usage_count` は生存性や桁・推移の信号であり、異種の出典間で厳密な信頼順位を作るスコアではありません。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

### 生成・確認：`generated`、`verified`

```yaml
generated:
  by: process:importer
  at: "2026-11-13T10:00:00Z"

verified:
  - by: process:nightly-check
    at: "2026-11-13T11:00:00Z"
  - by: human:alice
    at: "2026-11-13T12:00:00Z"
```

- `generated` は現在の内容を誰が生成したか。
- `generated.at` は内容の最後の意味のある変更時刻。
- `verified` は内容を出典や対象資産に照らして確認したイベント。
- `verified` の単一mapping表記は、consumerが1要素のリストとして扱う必要があります。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

```yaml
verified: { by: human:alice, at: "2026-11-13T12:00:00Z" }
```

actorの規約：

```text
<producer>/<version>  エージェント・ツール
human:<id>            人間
process:<id>          自動プロセス
```

信頼tierは保存値ではなく `verified` から導出します。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

|状態|tier|
|---|---|
|`verified` がない|unverified|
|非 `human:` actorの確認のみ|machine-confirmed|
|`human:` actorによる確認あり|human-reviewed|

これは助言的な信号であり、アクセス制御ではありません。また、生成後に内容が変わったことと再確認されたことは独立です。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

### ライフサイクル・鮮度

```yaml
status: stable
stale_after: "2027-02-13T00:00:00Z"
```

|項目|解釈|
|---|---|
|`status: draft`|未レビュー・不完全の可能性|
|`status: stable`|利用可能|
|`status: deprecated`|履歴とリンクのため残っているが現行ではない|
|`status` なし|`stable`|
|`stale_after` あり|`now >= stale_after` でstale|

OKFの日時値は、明示的UTCオフセット付きISO 8601 datetimeです。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

実装では `now` を引数で注入可能にし、境界時刻を固定してテストできるようにします。

## 4. 本文と予約ファイル

### 本文

本文は自由なMarkdownで、必須セクションはありません。次の見出しは慣習的な意味を持ちます。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

|見出し|用途|
|---|---|
|`# Schema`|列・フィールドなどの構造|
|`# Examples`|利用例|
|`# Computation`|Attested Computationの公認計算|

### `index.md`

任意のディレクトリに配置できます。見出しとリンク付きリストで、そのディレクトリの内容を開示します。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

```markdown
# Rules

* [認証失敗時の処理](authentication.md) - 認証失敗時の中断規則。
* [エラー処理](error-handling.md) - エラーの分類と伝播。
* [サービス](../services/) - 関連するサービス。
```

通常の `index.md` にfrontmatterはありません。例外として、バンドルルートの `index.md` にバージョンを宣言できます。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

```markdown
---
okf_version: "0.2"
---

# Knowledge

* [Rules](rules/) - 実装規則。
```

indexはなくても構いません。consumer側で生成・合成できます。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

### `log.md`

日付ごとのフラットな履歴で、新しいものを先に並べます。日付見出しは `YYYY-MM-DD` 形式です。entry先頭の `Update` などの分類語は慣習であり必須ではありません。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

```markdown
# Directory Update Log

## 2026-11-13

* 認証失敗時の処理規則を追加。

## 2026-11-12

* 初期構造を作成。
```

## 5. パス解決とグラフ

### 公式のリンク規則

```markdown
[絶対バンドル相対](/rules/authentication.md)
[文書相対](../rules/authentication.md)
```

- `/` 始まりはOSのルートではなく、バンドルルート基準。
- 相対パスはリンク元文書を基準に解決。
- 推奨形式は `/` 始まりのバンドル相対。
- 本文リンクは型なしの有向関係。
- 関係の意味は周辺の文章で伝える。
- 壊れたリンクはconsumerが許容する必要がある。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

`resource`、`sources[].resource`、`computation`、`executor.resource`、`attester.resource` も、URL・バンドル相対・相対パスを扱います。ただし前述のscope記述は別扱いです。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

### 推奨する内部モデル

以下は独自の実装設計です。

```ts
type ConceptId = string;

interface Concept {
  id: ConceptId;
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

interface Edge {
  from: ConceptId;
  rawTarget: string;
  resolvedPath?: string;
  to?: ConceptId;
  origin:
    | "body-link"
    | "source"
    | "resource"
    | "computation"
    | "executor"
    | "attester";
  state: "resolved" | "missing" | "external" | "non-concept" | "blocked";
}
```

`origin` は解析上の区別であって、OKF標準の意味論的なエッジ型ではありません。

特に次を分離します。

```text
concept間リンク
directoryへのナビゲーション
出典への参照
非Markdown資産への参照
外部URL
解決不能な参照
```

全部を同じ「concept間依存」として扱うと、到達集合が誤ります。

### 実装側で確定するパス規約

公式仕様は完全なパス解決アルゴリズムやMarkdown方言までは定めていません。以下はローカル仕様として明文化します。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

|論点|推奨方針|
|---|---|
|`..` によるルート外参照|診断を返し、ファイル取得は禁止|
|symlink|実体パスも検査し、ルート外は取得禁止|
|fragment|文書解決と見出し解決を分離|
|query文字列|生の参照を保持し、ローカル解決時の扱いを固定|
|URLエンコード|デコード順序と回数を固定|
|大文字小文字|ホストOS任せにせず、衝突を診断|
|Unicode|勝手に正規化してIDを書き換えない|
|拡張子省略|自動補完するか明示的に決める|
|ディレクトリリンク|conceptではなくdirectoryとして扱う|
|外部URL|parse時に自動取得しない|

リンク抽出は正規表現ではなくMarkdown ASTで行い、コードブロック内の例示リンクを誤認しない構造にします。

## 6. 適合性検証と独自ゲートを分ける

**conformance** と、運用上の厳格な検証を混同しないことが最重要です。

公式の適合条件は次の3つです。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

1. 予約ファイル以外の `.md` に解析可能なYAML frontmatterがある。
2. frontmatterに非空の `type` がある。
3. 存在する `index.md` と `log.md` が、それぞれの規定構造に従う。

一方、次を理由にバンドルを拒否してはいけません。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

- 任意フィールドがない
- 未知のtype
- 未知のキー
- 壊れたリンク
- indexがない

したがってCLIを分けます。

```text
okf validate --mode conformance
okf lint
okf check --profile ./rules-profile.json
```

|レイヤー|目的|例|
|---|---|---|
|conformance|公式構造への適合|frontmatterなし、typeなし|
|lint|品質上の診断|壊れたリンク、期限切れ、出典ID不一致|
|profile|自分の用途の要件|必須規則への未到達、未承認の規則|
|security|安全な処理・実行|パストラバーサル、未承認コード|

`broken link` はconformanceでは許容しつつ、自分の規則バンドルではprofile違反としてCIを落とせます。

## 7. Attested Computation

これは「定義された計算を実際にその方法で実行したか」を検証するためのconceptです。OKF自体は計算を実行しません。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

```markdown
---
type: Attested Computation
title: 年間売上
runtime: bigquery

parameters:
  - name: year
    type: integer
    required: true

executor:
  resource: /references/skills/run-on-bq.md
  receipt: [job_id, executed_sql, result]

attester:
  resource: /references/attesters/revenue.py
---

# Computation

```sql
SELECT SUM(amount) AS revenue
FROM finance.recognized_revenue
WHERE fiscal_year = @year
```
```

上記は文書例で、外側のMarkdown文書内にSQL fenceを置く構造です。

### 契約

|フィールド|意味|
|---|---|
|`runtime`|このtypeで必須。パラメータのbinding意味を決める|
|`parameters`|`{name, type, required}` のリスト|
|`computation`|計算を外部ファイルに置く場合のパス|
|`executor.resource`|実行手順またはコード|
|`executor.receipt`|実行結果として返す証拠フィールド|
|`attester.resource`|receiptを検証する決定論的なコード|

計算本体は、`# Computation` 配下の単一fenced code blockか、`computation` が指すファイルのどちらかです。AIが供給してよいのは宣言済みパラメータの値だけで、計算そのものの作成・編集は禁止です。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

### 実行フロー

```text
contract読込
  → parameter検証
  → 計算へのbinding
  → executor実行
  → receipt取得
  → attester実行
  → verdict
  → 表示・利用ゲート
```

attesterはLLMではなく決定論的コードです。実際に実行された成果物と、公認計算をparameterで展開した成果物を比較し、値についても実行基盤の権威ある記録に照合する設計です。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

ただし、以下は標準化されていません。

- receipt／verdictのwire format
- attester ABI
- sandbox
- 実行ライフサイクル
- attestation cache

この部分はconsumer側で契約を定める必要があります。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

安全な初期実装では、参照先のコードを自動実行せず、allowlistで登録したruntime／executor／attesterだけを呼び出します。

## 8. エージェント向けの決定論的探索・到達保証

ここからはOKF標準ではなく、あなたの用途向けの追加設計です。

### 「リンクがある」と「必須情報が読まれる」は別

OKFは型なしリンクとindexによる探索を提供しますが、タスクからの入口選択、必須規則の意味論、必要情報の全取得までは規定しません。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

そのため、次の集合を分けます。

```text
entry set      タスクから決まる入口
required set   適用条件から決まる必須規則
reachable set  決められたエッジを辿って到達する集合
context set    AIに実際に渡す文書集合
```

検査する不変条件の例：

\[
Required(task) \subseteq Context(task)
\]

ただし、これは「必要文書を供給した」保証です。「AIが理解した」「実装で遵守した」保証ではありません。

### 型付きの必須依存は拡張する

本文中のリンクだけでは「参考」と「必須依存」を機械的に区別できません。独自profileで定義します。

```yaml
x-rule-id: AUTH-001

x-applies-to:
  - api
  - authentication

x-requires:
  - /rules/error-handling.md

x-related:
  - /services/authentication.md
```

この場合の処理：

1. タスクの構造化属性から適用規則を選ぶ。
2. `x-requires` の推移閉包を計算する。
3. 必須参照が欠落したら停止する。
4. ID順などの固定順序でcontextを生成する。
5. 取得集合とハッシュをmanifestに保存する。
6. 検証可能な規則は別のチェックで検証する。

本文リンクすべての閉包を必須contextにすると、参考リンク経由でバンドル全体まで膨張しやすいため、避けます。

### 推奨API

```ts
loadBundle(root): Bundle

getConcept(id): Concept

listDirectory(path): DirectoryEntry[]

resolveReference(fromPath, target): ResolvedReference

getOutgoing(id): Edge[]
getIncoming(id): Edge[]

validateBundle(bundle): Diagnostic[]
lintBundle(bundle): Diagnostic[]

resolveRequired(task, profile): RequiredSet

buildContext(requiredSet, options): ContextArtifact
```

探索の再現性のため、次を固定します。

- ディレクトリ走査順
- IDのソート順
- traversalの順序
- cycle処理
- 重複排除の規則
- contextの切り詰め規則
- 同じ入力・同じ時刻に対する出力

必須集合が予算を超えた場合、黙ってtruncateせず `budget_exceeded` で停止する設計にします。

## 9. Node.jsでの実装構成

以下は推奨構成であり、OKF公式SDKの指定ではありません。

```text
src/
  bundle/
    scan.ts
    classify.ts
    load.ts

  parsing/
    frontmatter.ts
    markdown.ts

  paths/
    resolve.ts
    containment.ts

  graph/
    build.ts
    traverse.ts
    backlinks.ts

  metadata/
    provenance.ts
    trust.ts
    lifecycle.ts

  validation/
    conformance.ts
    lint.ts
    profile.ts

  context/
    resolve-required.ts
    assemble.ts
    manifest.ts

  authoring/
    write.ts
    generate-index.ts

  cli.ts
```

ライブラリ選定では、製品名より次の能力を必須条件にするとよいです。

|用途|必要な能力|
|---|---|
|YAML|安全なparse、重複キー診断、未知キー保持|
|Markdown|AST、リンクの位置情報、参照形式リンク、脚注|
|書き戻し|可能ならYAMLのコメント・順序保持|
|schema検証|coreと独自profileを別schemaにできる|
|ファイル操作|ルート内制約、atomic write|

特に「型付きモデルへ変換したら未知キーが消える」という実装を避け、元のfrontmatterと解釈済みviewを分離します。

```ts
interface ParsedConcept {
  rawFrontmatter: Record<string, unknown>;
  interpreted: {
    type: string;
    title?: string;
    trustTier: string;
    stale?: boolean;
  };
  body: string;
}
```

## 10. 実装前に決める未規定・境界事項

公式仕様は最小限で、すべての不正値・競合状態の処理を定めているわけではありません。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

次を実装判断表として残してください。

|論点|推奨処理|
|---|---|
|空の `verified: []`|unverified扱い＋診断|
|不正な日時|原文保持、診断、鮮度不明|
|未知の `status`|原文保持、未知状態として診断|
|同一 `sources[].id` の重複|曖昧な結合として診断|
|`generated.at` より古い確認|公式tierと、変更後確認の有無を別々に表示|
|`computation` と本文fenceの両方|実行profileでは曖昧として停止|
|YAML重複キー|黙って上書きせず診断|
|巨大YAML／alias展開|資源制限|
|書き込み中のファイル変更|snapshotまたは変更検知|
|未対応バージョン|best-effort読込＋診断|

未対応バージョンでも、即時拒否よりbest-effort consumptionが公式には推奨されています。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

## 11. 最低限のテスト一覧

### フォーマット

- 最小concept
- UTF-8の日本語
- frontmatterなし・閉じ忘れ・YAML構文エラー
- `type` 欠落・空文字・未知のtype
- 未知のキーの保持
- 本文なし
- LF／CRLF

### 予約ファイル

- root indexの `okf_version`
- 下位index
- indexなし
- logの日付形式と並び
- 予約ファイルをconceptとして扱わないこと

### パス・グラフ

- `/` 始まりのバンドル相対リンク
- `./`、`../`
- 存在しないリンクを保持しつつ読み込み成功
- directoryリンク
- 外部URL
- 非Markdown資産
- fragment
- 自己リンク、cycle、重複リンク
- コードブロック内の例示リンク
- root外参照、symlink escape

### 信頼・鮮度・出典

- `verified` のmapping／list同値性
- humanとmachineの混在
- 任意familyなし
- `status` なしはstable
- `now == stale_after` でstale
- timezoneの異なる同一時刻
- 脚注とsource IDの結合
- scope記述をファイル取得しない

### 決定論的context

- 同一入力で同一出力
- requiredの推移閉包
- cycleで停止する
- 必須参照欠落で失敗
- 予算超過で欠落させず失敗
- manifestと本文のハッシュ一致
- 走査順が変わっても出力不変

### Attested Computationを実装する場合

- 未宣言parameterの拒否
- parameter型不一致
- 計算ファイル差し替え
- receipt欠落・改ざん
- 実行成果物の不一致
- attestation失敗を隠さない
- 未承認executor／attesterの実行禁止

## 12. 実装順序と完了条件

|段階|実装内容|完了条件|
|---|---|---|
|1|scan／分類／frontmatter parse|全conceptと予約ファイルを正しく区別|
|2|ID／パス解決|OSルートとバンドルルートを混同しない|
|3|Markdown AST／グラフ|本文リンク、欠損、外部参照を保持|
|4|conformance／lint|公式違反と品質警告を分離|
|5|trust／freshness／sources|正規化と境界時刻のテストが通る|
|6|CLI／index生成|一覧・取得・検証を機械利用可能|
|7|独自profile／required閉包|必須集合の到達・供給を検査可能|
|8|context manifest|入力snapshotと出力を追跡可能|
|9|作成・更新|未知キー保持、atomic write|
|10|attestation runtime|実行許可・receipt・verdictの独自契約が確定|

今回の用途なら、まず段階8までを実装すれば、OKFバンドルを決定論的に探索し、必須規則を欠落なくcontextへ供給する基盤になります。計算の実行証明が必要でなければ、Attested Computationは読み取り・診断への対応に留めて構いません。OKFは実行基盤を要求しないフォーマットです。 [raw.githubusercontent](https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md)

# Q2

nodejs（Javascript）で利用可能なライブラリはない？

# A2

あります。前の回答は調査不足でした。Node.jsから使えるOKF専用ライブラリ・ツールが複数あります。今回の用途では、まず **`@okforest/okf`** が調査対象です。npm上で「OKF v0.2のツリーをconcept・frontmatter・リンクなどのモデルへ読み込む」ライブラリとして公開されています。 [npmjs](https://www.npmjs.com/package/@okforest/okf)

## 利用可能な候補

|パッケージ|形態・用途|確認できた機能・注意点|
|---|---|---|
|[`@okforest/okf`](https://www.npmjs.com/package/@okforest/okf)|読み取り・モデル化ライブラリ|v0.2ツリーからconcept、frontmatter、リンクを読み込む。今回のグラフ探索基盤に最も近い候補。ただし詳細APIは未確認。 [npmjs](https://www.npmjs.com/package/@okforest/okf)|
|[`js-okf`](https://github.com/prabhay759/js-okf)|JS／TSライブラリ|concept作成・更新・読込・一覧、index生成、log追記。Node.js 18以上。READMEはv0.1を基準に説明している。 [github](https://github.com/prabhay759/js-okf)|
|[`@jfomhover/okf-validator`](https://npm.io/package/@jfomhover/okf-validator)|検証ツール|v0.2検証、JSON Schema、文書別の独自schema。Node.js 18以上。作者がexperimentalと明記。 [npm](https://npm.io/package/@jfomhover/okf-validator)|
|[`pi-okf`](https://pi.dev/packages/pi-okf)|Node.js CLI|v0.2の検証・初期化・index生成・pack・inspect。JSON出力あり。PiなしでCLI単体利用可能。 [pi](https://pi.dev/packages/pi-okf)|
|[`@chirag127/okf-knowledge-mcp`](https://www.npmjs.com/package/@chirag127/okf-knowledge-mcp)|MCPサーバー|OKFの検索・読込・書込・自動同期を提供するパッケージ。 [npmjs](https://www.npmjs.com/package/@chirag127/okf-knowledge-mcp)|

「JSからimportして組み込むライブラリ」と「Node.jsで動くCLI／MCP」は分けて選ぶ必要があります。

## `js-okf` はAPIまで確認できる

インストール：

```bash
npm install js-okf
```

JavaScriptのESMから、次のように使えます。公開READMEに記載されたAPIです。 [github](https://github.com/prabhay759/js-okf)

```js
import { OKFBundle } from 'js-okf';

const bundle = new OKFBundle('./knowledge', {
  createIfMissing: true,
});

await bundle.upsert({
  id: 'rules/authentication',
  matter: {
    type: 'Rule',
    title: '認証失敗時の処理',
    'x-rule-id': 'AUTH-001',
    'x-requires': ['/rules/error-handling.md'],
  },
  body: `
# 認証失敗時の処理

認証に失敗した要求は処理を中断する。

[エラー処理](/rules/error-handling.md)を参照する。
`.trim(),
});

const concept = await bundle.read('rules/authentication');
const ids = await bundle.list();

await bundle.updateIndex();
```

主なAPIは以下です。 [github](https://github.com/prabhay759/js-okf)

```js
bundle.upsert(input)
bundle.upsertMany(inputs)
bundle.read(id)
bundle.list(options)
bundle.updateIndex()
bundle.appendLog(entry)
```

ただし、採用前に確認すべき挙動があります。

- frontmatter更新はshallow merge。
- `tags` は置換ではなくunion merge。
- `timestamp` を自動更新。
- READMEには `appendLog()` がfrontmatter付きlogを作ると記載されている。
- 公開API一覧にはリンク解決・グラフ探索APIが記載されていない。 [github](https://github.com/prabhay759/js-okf)

したがって、`js-okf` は作成・更新用の候補ですが、v0.2の厳密な書き出しや決定論的グラフ探索まで任せられるとは、現時点では言えません。

## 今回の用途にどう選ぶか

私なら、次の順で評価します。

1. `@okforest/okf` のモデル・リンク解決・公開APIを確認し、読み取り基盤として使えるか判定する。説明上は必要な領域に最も近いです。 [npmjs](https://www.npmjs.com/package/@okforest/okf)
2. 作成・更新も必要なら、`js-okf` を候補にする。ただし上記のmerge・timestamp・log生成挙動を受け入れられるか検証する。 [github](https://github.com/prabhay759/js-okf)
3. CI検証は `pi-okf` または `@jfomhover/okf-validator` を評価する。前者はJSON出力付きCLI、後者は独自schemaへの対応を明示しています。 [npm](https://npm.io/package/@jfomhover/okf-validator)

アプリケーション側では、採用ライブラリを薄いadapterで包み、`loadBundle`・`resolveReference`・`getOutgoing` などの自前インターフェースに変換する構成がよいです。必須集合の閉包計算、到達保証、context manifestは、その上の独立した層に置きます。

なお、`@okforest/okf` はnpmの概要までは確認できましたが、今回npmページ本文の取得に失敗しています。関数名・安全性・対応範囲まで検証済みではないため、架空のimport例は提示していません。
