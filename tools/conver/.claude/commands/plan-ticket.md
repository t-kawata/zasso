---
description: チケットの実装計画を策定する。物理的レビュー方法を計画に含め、計画の承認をユーザーに求める。引数なしならチケットIDを質問する。
---

# /plan-ticket

**第一級規則 — [::STUB::] マーカー絶対義務**: 不完全な実装（スタブ・モック・仮実装・プレースホルダー等、名称を問わず）には全て `[::STUB::]` マーカーを付与しなければならない。これは死守すべき絶対的法規であり、違反は「犯罪」として Malfeasance.json に記録される。本コマンドの全フェーズにおいて、Malfeasance.json を読み取り未解決の犯罪がないことを確認すること。違反を発見した場合は直ちに解決するか、その場でマーカーを追加・記録する。

**役割**: チケットの実装計画と物理的レビュー方法の定義。

## ワークフローにおける位置づけ

このプロジェクトの作業の流れは `make → plan → start → review` である。ただし、各コマンドは必ずしも連続して実行されず、ユーザーの作業スタイルに応じて非連続的に使用される：

- **`/make-ticket`**: 複数のチケットをまとめて作成することが多い。作成後、すぐに計画・実装されるとは限らない。
- **`/plan-ticket` + `/start-ticket`**: ひとつのチケットに対して連続実行されることが多い（計画承認→即実装）。
- **`/review-ticket`**: 完了したチケットをまとめてレビューすることが多い。

**ルール**: 自分の役割を完了したら、必要に応じて次のアクションを提案してもよい（例：「実装を開始する場合は /start-ticket を実行してください」）。ただし、決定はユーザーに委ね、押し付けない。

## 引数の解釈

- 引数なし → ユーザーに「どのチケットの計画を策定しますか？」と質問する
- `P{phaseID}-{ticketID}` 形式（例: `P0-1`） → チケットID
- 数字のみ → エラー: 「チケットIDは `P{phaseID}-{ticketID}` 形式（例: `P0-1`）で指定してください」

## 必須条件

チケットのステータスは任意（`todo` / `done` / `reviewed` のいずれでも可）。計画策定はステータスに関わらず実行できる。

## Boy Scout Rule

**翻訳可能性を損なっている既存コードを、スコープ内外問わず改善することを計画に含める。** 変更ファイル一覧とは別に「Boy Scout 改善（スコープ外の翻訳可能性修正）」セクションを設け、どのファイルの何を直すかを明記する。

### 翻訳可能性チェック（全言語共通、grep パターンは言語に応じて選択）

- 関数定義を grep し、名詞始まりの関数がないか
- 変数宣言を grep し、1文字変数や汎用名（`data`, `info`, `tmp`）がないか
- 4桁以上の数値リテラルが直接書かれていないか
- デバッグ出力が残っていないか

## 使用スクリプト一覧

`.claude/scripts/tickets/` 配下。詳細は `.claude/scripts/tickets/README.md` を参照。

| スクリプト | 引数 | 説明 |
|---|---|---|
| `get-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` | チケット情報の取得 |
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}`（stdin: 更新JSON） | チケットフィールドの更新 |
| `all-tickets.js` | `<PATH of Tickets.json> [status-filter]` | 全チケット一覧 |
| `search-tickets.js` | `<PATH of Tickets.json> <query>` | 全文検索 |
| `review/run-quality-checks.js` | `<files...>` | 静的品質チェック |
| `review/generate-report.js` | （stdin経由） | 品質レポート生成 |

## ワークフロー

### Step 1: 存在確認 + チケット情報取得

Tickets.json のパスを決定する（カレントディレクトリの Tickets.json を優先）。

```bash
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "$ARGUMENTS"
```

`success` が `false` → 終了。以下のステップでは、この出力の `ticket` オブジェクトを参照する。

出力された `ticket` オブジェクトの全フィールド（`title`, `status`, `background`, `scope`, `referenceSection`, `testVerification`, `testExceptions`, `notes`, `relatedTicketIds` 等）を読み取り、以下の観点で情報を把握する：

- **チケットの基本情報**: `title`, `status`, `background`
- **フィールドの充足度**: 各フィールドが空か埋まっているか
- **既存計画の有無**: `testVerification` や `notes` に計画らしき内容が含まれていれば既存の計画が存在する。空または未設定なら新規に計画を策定する。

### Step 2: Investigation の再検証

spec 作成時から時間が経過している場合、当時記録された Investigation セクションの物理的証拠が現在のコードベースと一致しているとは限らない。以下の観点で再検証する：

- Investigation に記載されたファイルの該当行が現在も同じ内容か確認する
- 既に修正・改善されていたり、逆に新たな問題が発生していないか grep やテスト実行で確認する
- 検証結果に基づき、Investigation の情報を最新の状態に更新する

**計画は常に現在のコードベースの状態に基づいて策定しなければならない。**

### Step 3: 依存・関連チケットID の検証

チケットの `relatedTicketIds` フィールドで記述された依存関係を点検する：

1. `get-ticket.js` でチケット全フィールドを読み取り、`relatedTicketIds` の記述を確認する
2. 参照先チケットID が実在することを `get-ticket.js` で確認する
3. 循環依存がないか確認する（AがBに先行実装必須、かつBがAに先行実装必須 → 矛盾）
4. 不足がある場合は補完する

```bash
# チケットから依存・関連チケットID の記述を抽出
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "$ARGUMENTS"

# 各参照先チケットの存在確認
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "P{phaseID}-{ticketID}"
```

### Step 4: 犯罪・スタブの点検（必須 — 第一級規則）

Malfeasance.json を読み取り、未解決の犯罪がないか確認する。**計画承認の条件**として、以下のいずれかを満たさなければならない：

- **条件 A**: Malfeasance.json に `open` レコードが存在しない
- **条件 B**: `open` レコードが存在する場合、本チケットの実装計画内にそれらを解消する具体的ステップが含まれている

```bash
# 犯罪スキャンを実行（初回時は自動初期化）
.claude/scripts/tickets/scan-crimes.sh
```

条件 B の場合、計画内に各犯罪の解消ステップを明記すること。

併せて、`[::STUB::]` マーカーが計画に影響するか検証する：

1. `find-all-stubs.js` でスタブを一覧する
2. このチケットで解決可能なスタブがあるか評価する
3. `[::STUB::]` 未付与のスタブを発見したらマーカーを追加し、`malfeasance-create.js` で犯罪として記録する
4. 解決可能なスタブは計画の実装スコープに含める
5. 解決不可能なスタブは注記として計画に残し、将来のチケットとの関係を明記する

```bash
# スタブの検索
node .claude/scripts/tickets/review/find-all-stubs.js .
```

**能動的コード探索**: 計画対象のソースツリーにおいて、CLAUDE.md の「対象となるコード」に定義された 7 パターンの不完全実装が既存コードに存在しないか grep で確認する。発見した場合は `[::STUB::]` マーカーを追加し、`malfeasance-create.js` で犯罪として記録する。この探索結果は計画の「リスク」または「Boy Scout 改善」セクションに反映すること。

```bash
# 不完全実装パターンの grep
grep -rE "todo!\(\)|unimplemented!\(\)|panic!\(" . --include="*.rs" --include="*.ts" --include="*.vue" | grep -v "\[::STUB::\]" || true
grep -rE "TODO|FIXME|HACK|XXX" . --include="*.rs" --include="*.ts" --include="*.vue" | grep -v "\[::STUB::\]" || true
grep -rE "#\[allow" . --include="*.rs" --include="*.ts" --include="*.vue" | grep -v "\[::STUB::\]" || true
```

### Step 5: 計画策定

チケットフィールド（`background`, `scope`, `referenceSection`, `relatedTicketIds`）をもとに以下の構造で提示する：

- 要件の再確認
- 変更ファイル一覧（| ファイル | 種別 | 内容 |）
- Boy Scout 改善（スコープ外の翻訳可能性修正）
- テスト計画
  - **基本方針**: ユニットテストの網羅性を最優先する。ユニットテストでカバーできる範囲は全てユニットテストで検証し、どうしてもテスト不可能な部分だけを「ユニットテスト不可能な項目」として理由付きで例外扱いする
  - **ユニットテスト計画**: 正常系・異常系・境界値の各ケース、モック/スタブの要否、カバレッジ目標
  - **ユニットテスト不可能な項目（例外）**: 各項目の理由を明示
  - spec の Test Plan を確認し、不足があれば補完する
- 実装手順
- 物理的レビュー方法（`run-quality-checks.js` + 翻訳可能性 grep、**テストが全て通ることの確認を含む**）
- リスク

### Step 6: ユーザー承認待ち

**明示的な承認を得るまで実装に入らない。**

### Step 7: 計画の保存

ユーザーの承認を得た後、計画内容を `update-ticket.js` でチケットの JSON フィールドに保存する。これにより計画内容が Tickets.json に記録される。

```bash
echo '{
  "scope": ["変更ファイル一覧（ファイルパス・種別・内容）"],
  "testVerification": ["UT: 正常系ケース...", "UT: 異常系ケース...", "UT: 境界値ケース..."],
  "testExceptions": ["ユニットテスト不可能な項目とその理由"],
  "notes": "実装手順:\n1. ...\n2. ...\n\nレビュー方法:\n- run-quality-checks\n- 翻訳可能性 grep\n\nリスク:\n- ..."
}' | node ".claude/scripts/tickets/update-ticket.js" "Tickets.json" "$ARGUMENTS"
```

これにより、後でチケットを確認したときに「どのような計画で実装されたか」を追跡できる。
