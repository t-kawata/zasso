---
description: 例: /make-ticket（ヒアリング）/ /make-ticket P0-1（深掘り）/ /make-ticket タイトル（新規作成）。引数なしなら詳細をヒアリングしてAIがタイトルを決定、P0-1形式またはPX-1形式なら既存チケットを深掘り、それ以外ならそのままタイトルとして spec を新規作成。
---

# /make-ticket

**第一級規則 — [::STUB::] マーカー絶対義務**: 不完全な実装（スタブ・モック・仮実装・プレースホルダー等、名称を問わず）には全て `[::STUB::]` マーカーを付与しなければならない。これは死守すべき絶対的法規であり、違反は「犯罪」として Malfeasance.json に記録される。本コマンドの全フェーズにおいて、Malfeasance.json を読み取り未解決の犯罪がないことを確認すること。違反を発見した場合は直ちに解決するか、その場でマーカーを追加・記録する。

**役割**: 実装仕様（spec）の詳細文書の作成と詳細化。

## ワークフローにおける位置づけ

このプロジェクトの作業の流れは `make → plan → start → review` である。ただし、各コマンドは必ずしも連続して実行されず、ユーザーの作業スタイルに応じて非連続的に使用される：

- **`/make-ticket`**: 複数の spec をまとめて作成することが多い。作成後、すぐに計画・実装されるとは限らない。
- **`/plan-ticket` + `/start-ticket`**: ひとつのチケットに対して連続実行されることが多い（計画承認→即実装）。
- **`/review-ticket`**: 完了したチケットをまとめてレビューすることが多い。

**ルール**: 自分の役割を完了したら、必要に応じて次のアクションを提案してもよい（例：「次に計画を策定する場合は /plan-ticket を実行してください」）。ただし、決定はユーザーに委ね、押し付けない。

## 引数の解釈

- 引数なし → 実装したい内容を詳しくユーザーにヒアリングし、それに基づいてAIが適切なタイトルを決定する
- `P{phaseID}-{ticketID}` 形式（例: `P0-1`）または `PX-{ticketID}` 形式（例: `PX-1`） → 既存チケットの複合キーとして深掘り
- 数字のみ → エラー: 「チケットIDは `P{phaseID}-{ticketID}` 形式（例: `P0-1`）または `PX-{ticketID}` 形式（例: `PX-1`）で指定してください」
- 上記以外 → 新規 spec のタイトルとして作成

## Boy Scout Rule

新規作成時、spec の「Boy Scout Rule — 翻訳可能性計画」セクションに以下を必ず含める：関数名は動詞句、変数名はドメイン概念、一関数一責務、ハードコード値は名前付き定数、エラー握りつぶし禁止。**スコープ内外問わず、翻訳可能性を損なう既存コードを積極的に改善する計画を記載する。**

## 使用スクリプト一覧

`.claude/scripts/tickets/` 配下。詳細は `.claude/scripts/tickets/README.md` を参照。

| スクリプト | 引数 | 説明 |
|---|---|---|
| `add-ticket.js` | `<PATH of Tickets.json> P{phaseID}`（stdin: チケットJSON） | チケット追加。ticketID はフェーズ内で自動インクリメント |
| `add-phase.js` | `<PATH of Tickets.json>`（stdin: フェーズJSON） | フェーズ追加。phaseID は 0 から自動採番 |
| `get-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` | 単一取得。複合キーで検索 |
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}`（stdin: 更新JSON） | 更新。phaseId/ticketID は変更不可 |
| `all-tickets.js` | `<PATH of Tickets.json> [status-filter]` | 全一覧。status フィルタ可能 |
| `search-tickets.js` | `<PATH of Tickets.json> <query>` | 全文検索（title/background/scope/referenceSection） |
| `list-phases-and-tickets.js` | `<PATH of Tickets.json>` | チェックリスト形式で表示 |
| `create-spec.js` | `"" <title>`（引数: specファイル名のタイトル） | spec ファイルのスケルトン生成（Investigation セクション付き） |
| `add-px-phase.js` | `<PATH of Tickets.json>` | PX フェーズ（id=-1）を追加。既存の場合はエラー |

## ワークフロー

### 新規作成

#### Step 1: ヒアリングとタイトル決定

$ARGUMENTS が空なら、何を実装したいのか詳しくユーザーにヒアリングする（目的、背景、期待する動作など）。得られた情報をもとにAIが適切なタイトルを決める。

#### Step 2: spec スケルトン作成

```bash
node ".claude/scripts/tickets/create-spec.js" "" "タイトル"
```

出力の `ticketId`（識別用の整数ID）と `specPath`（spec ファイルのパス）を保持する。
`create-spec.js` は Summary / Background / Scope / Investigation / Test Plan / Boy Scout Rule / Acceptance Criteria の各セクションを持つテンプレートを生成する。以降のステップはこの spec ファイルを埋めていく作業となる。

#### Step 3: Tickets.json の存在確認と作成

Tickets.json のパスを決定する（カレントディレクトリの Tickets.json を優先）。Tickets.json が存在するか確認する。

**分岐 A: Tickets.json が存在する場合**

既存のフェーズを確認し、適切なフェーズを指定してチケットを登録する：

```bash
node ".claude/scripts/tickets/list-phases-and-tickets.js" "Tickets.json"
```

```bash
echo '{"title":"タイトル","referenceSection":"spec/0042-type-defs.md"}' | node ".claude/scripts/tickets/add-ticket.js" "Tickets.json" "P0"
```

出力の `ticketKey`（例: `P0-1`）を保持する。以降の操作ではこのキーでチケットを特定する。

**分岐 B: Tickets.json が存在しない場合**

1. `write-tickets-json-template.js` でスケルトンを生成する：

   ```bash
   node ".claude/scripts/tickets/write-tickets-json-template.js" "Tickets.json" '{"title":"アドホックチケット","source":"'$ARGUMENTS'","generatedAt":"'$(date +%Y-%m-%d)'"}'
   ```

2. `add-px-phase.js` で PX フェーズ（id=-1）を作成する：

   ```bash
   node ".claude/scripts/tickets/add-px-phase.js" "Tickets.json"
   ```

3. `add-ticket.js` で PX フェーズにチケットを追加する：

   ```bash
   echo '{"title":"タイトル","referenceSection":"spec/0042-type-defs.md"}' | node ".claude/scripts/tickets/add-ticket.js" "Tickets.json" "PX"
   ```

   出力の `ticketKey`（例: `PX-1`）を保持する。以降の操作ではこのキーでチケットを特定する。

#### Step 4: ソースコード調査

問題の原因や実装に必要な情報を、ソースコードの解析、grep、調査解析、解析調査用テストコードの作成、テスト実行、ログ確認などを通じて調査する。エラーメッセージやスタックトレースなど**物理的な証拠**を収集する。

#### Step 5: 証拠の記録

調査で得られた証拠（エラー箇所のファイル名・行番号、実際の出力、再現手順など）を spec ファイルの `## Investigation` セクションに書き込む。あわせて、パイプラインから参照可能にするため、チケットの JSON フィールド（`background`, `referenceSection`, `notes`）にも反映する。

```bash
echo '{"background":"調査結果の詳細...","referenceSection":"参照ファイル: src/foo.rs:42","notes":"再現手順: ..."}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "P0-1"
```

#### Step 6: 仕様の具体化

証拠に基づいて Background / Scope / Test Plan / Acceptance Criteria をユーザーと対話しながら具体化する。spec ファイルの各セクションに直接記述し、完了後に JSON フィールドにも反映する。

Test Plan は spec のテンプレート（以下の構造）に従い、**ユニットテストの網羅性を最優先して設計する**：

```markdown
### ユニットテスト計画
- どの関数／モジュールに対してテストを書くか
- 正常系・異常系・境界値の各ケース
- モック・スタブが必要な外部依存
- カバレッジ目標（目安: 80%以上、クリティカルパスは90%以上）

### ユニットテスト不可能な項目（例外）
- 理由の明示（外部API結合、ハードウェア依存等）
```

**例外ルール**: ユニットテストではどうしてもテスト不可能な部分だけを「ユニットテスト不可能な項目」として理由付きで列挙する。それ以外の全ての検証はユニットテストでカバーする。極限の網羅性でユニットテストを設計しておくことで、実装段階でほぼすべての不具合が発見・修正され、結果として E2E テストはほぼ成功すると考えられる状態を目指す。

Test Plan 具体化後、JSON フィールドに反映する:
```bash
echo '{"scope":["範囲1","範囲2"],"testVerification":["正常系ケース...","異常系ケース..."],"testExceptions":["例外理由..."]}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "P0-1"
```

#### Step 7: 依存・関連チケットID の点検

関連する既存チケットを検索し、依存関係を spec の `## Notes` セクションに記述する。各参照先チケットの存在確認および循環依存の有無を確認する。

```bash
node ".claude/scripts/tickets/search-tickets.js" "Tickets.json" "<キーワード>"
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "P{phaseID}-{ticketID}"
```

依存関係は `relatedTicketIds` フィールドにも反映する:
```bash
echo '{"relatedTicketIds":"P0-1 (先行実装必須), P1-2 (関連)"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "P0-1"
```

#### Step 8: 犯罪の点検（必須 — 第一級規則）

Malfeasance.json を読み取り、未解決の犯罪（`[::STUB::]` 未付与の不完全実装）がないか確認する。これは**絶対的法規に基づく必須ステップ**であり、スキップを禁止する。

未解決の犯罪が存在する場合、本チケットの spec 内にそれらを解消する具体的計画を**必ず**盛り込む。解消計画には各犯罪の ID・内容・解決方法・本チケットのスコープ内か否かの判断を含めること。犯罪を単に「既知の状態」として放置するだけの記述は許可されない。

```bash
.claude/scripts/tickets/scan-crimes.sh
```

併せて、`[::STUB::]` マーカーの状態も点検し、未マーカーのスタブを発見したらその場で `[::STUB::]` を追加し、`malfeasance-create.js` で犯罪として記録する。

```bash
node .claude/scripts/tickets/review/find-all-stubs.js .
```

#### Step 9: ステータス更新

全工程完了後、チケットの status を `made` に更新する。

```bash
echo '{"status":"made"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

#### Step 10: ユーザー確認

調査結果の書き込みと仕様の具体化が完了しました。以下のコマンドを実行して計画を策定できます: `/plan-ticket $ARGUMENTS`

### 深掘り

`$ARGUMENTS` が `P{phaseID}-{ticketID}` 形式（例: `P0-1`）または `PX-{ticketID}` 形式（例: `PX-1`）の場合、既存チケットの深掘りとして扱う。

#### Step 1: チケット取得

Tickets.json のパスを決定する（カレントディレクトリの Tickets.json を優先）。Tickets.json が存在しない場合は「Tickets.json が見つかりません。先に新規作成でチケットを作成するか、/formulate-tickets を実行してください」と表示して終了する。

```bash
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "$ARGUMENTS"
```

出力の `success` が `false` なら終了。存在すれば取得した JSON フィールド（`title`, `background`, `scope`, `referenceSection`, `testVerification`, `notes` 等）を読み取り、不足セクションを補完する。

#### Step 2: フィールド補完

```bash
echo '{"background":"補完した背景情報...","scope":["範囲1","範囲2"]}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

#### Step 3: 依存・関連チケットID の点検

既存の依存関係記述に不足・矛盾がないか検証する。必要に応じて `search-tickets.js` で関連チケットを検索し、依存関係を補完する。

```bash
node ".claude/scripts/tickets/search-tickets.js" "Tickets.json" "<キーワード>"
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "P{phaseID}-{ticketID}"
```

#### Step 4: 犯罪の点検（必須 — 第一級規則）

Malfeasance.json を読み取り、未解決の犯罪がないか確認する。これは**絶対的法規に基づく必須ステップ**であり、スキップを禁止する。未解決の犯罪が存在する場合、本チケットの spec 内に解消計画を必ず盛り込む。

```bash
.claude/scripts/tickets/scan-crimes.sh
node .claude/scripts/tickets/review/find-all-stubs.js .
```

#### Step 10: ステータス更新

全工程完了後、チケットの status を `made` に更新する。

```bash
echo '{"status":"made"}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```
