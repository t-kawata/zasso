# RFC OMISSIONS-002 — find の収束問題と Goal Gate の導入

## Abstract

find のループを重ねると omission が減らず発散する問題を分析し、目的（purpose）・目標（goals）・成功条件（successCriteria）にもとづく Goal Gate フィルタと、機械的な収束検知・重複排除スクリプトを導入する。これにより、find が「開発の収束」ではなく「開発の発散」に向かう傾向を根本的に解決する。

## Motivation

### 問題: find のループを重ねると omission が発散する

最初の数回の find はある程度的を得た OMISSIONS の抽出を行った。しかし、ループ回数を重ねると、最初の方では指摘しなかったような「重箱の隅をつつく」OMISSIONS が増加した。find を重ねても OMISSIONS があまり数として減らず、粗探し的動作が強まっていった。

### 原因分析: ノルムの定義欠如

conver の数学的メタファーにおいて、「設計ベクトルと実装ベクトルの差」の大きさを測るノルムが定義されていない。現状の find は「差があるかどうか」しか判定しておらず、「その差が目的に対してどれほど重要か」を評価していない。結果として：

| 要因 | メカニズム |
|------|-----------|
| **再現率偏重** | omission を1件でも多く見つける = 良い仕事。見逃すリスクを避けるため保守的に「差がある」と報告する |
| **Goal へのフィードバック欠如** | Step 2a で purpose/goals/successCriteria は読み込むが、Step 3 の比較でそれらとの照合がない |
| **発見量の質的評価がない** | omission の数自体は減っても「質が低下している（low/cosmetic ばかり）」ことを検知できない |
| **過去との重複排除がない** | 同じファイル・同じ観点の omission がループごとに再発見される |

### 「発散」の検出基準

以下の状態が観測されたとき、find は発散していると判定する：

- low severity の omission 比率がループを重ねるごとに増加している
- 前回と同じファイル・同じ領域の omission が連続して発見される
- omission の総数が減少していない（または増加している）
- successCriteria の達成に直接関係しない omission が増加している

## Design

### 全体構造

既存の find ワークフロー（Step 0〜Step 6）は維持した上で、以下の3つの拡張を追加する：

```
Step 3（比較分析）: AI が判断（非決定論）← 現状維持
  └── 発見即記録: add-omission.js

[新設] Step 3.5（機械的フィルタリング）: スクリプトが処理（決定論）
  ├── dedup-omissions-by-history.js  → 過去との重複を機械的に排除
  ├── materiality-filter.js          → Goal 阻害度を機械的にスコアリング
  └── diminishing-returns.js         → 発散/収束の傾向を判定

Step 4（確認）: AI が確認（非決定論に決定論の制約を与える）
  スクリプトの出力を制約として受け入れ、残った判断のみ AI が処理
```

### 設計原則: 決定論と非決定論のバランス

```
決定論で確定できること → スクリプトが確定判断（AI は受け入れるのみ）
非決定論が不可欠なこと → AI が判断（ただし決定論の結果を制約として与える）
```

| 項目 | 決定論（スクリプト） | 非決定論（AI） |
|------|-------------------|--------------|
| 同一ファイル+同一セクション+同一种別の omission | 完全重複として自動skip | — |
| `stub_remaining` かつ low severity | `cosmetic` に自動格下げ | — |
| 同一ファイルで3回以上連続 omission | `repeated_area` タグ付与 | 根本原因の分析 |
| successCriteria に明示された関数の型不一致 | `high` 確定 | — |
| ファイルは異なるが実質同じ指摘 | 参考情報の提供 | 類似性の最終判断 |
| purpose との文脈照合 | スコア/根拠の提供 | 最終的な severity 判断 |
| omission 種別が「改善提案」に近い | スコアリング | purpose に照らした取捨選択 |

### Proposal A: Goal Gate

**目的**: 各 omission を RFC の purpose / goals / successCriteria と照合し、Goal 達成を阻害しない omission の severity を機械的に格下げする。

#### Goal Gate の照合階層

| 要素 | 照合の観点 | 重み |
|------|-----------|------|
| **purpose** | 「この omission はRFCの存在意義に関わるか？」 | 3（最重要） |
| **goals** | 「この omission は達成目標を阻害するか？」 | 2 |
| **successCriteria** | 「この omission が残っていてもpass条件を満たせるか？」 | 1（最具体的） |

3階層すべてで「阻害しない」と判断された omission は `cosmetic` に格下げされる。

#### Goal Gate の適用タイミング

Step 3 の各子ステップ終了時（3a, 3b, 3c-1, 3c-2 のそれぞれ）に発見済み omission に対して適用する：

```
各サブステップ終了
  ↓
発見済み omission リストを取得（list-omissions.js）
  ↓
各 omission に対して materiality-filter.js を実行
  ├── purpose 阻害判定 → スコア加算
  ├── goals 阻害判定 → スコア加算
  └── successCriteria 阻害判定 → スコア加算
  ↓
合計スコアに応じて severity を機械的に調整：
  スコア 0 → cosmetic（check-final通過可能）
  スコア 1-2 → low（優先度低）
  スコア 3-5 → medium
  スコア 6+ → high
```

### Proposal B: 機械的収束スクリプト群

#### B-1: `dedup-omissions-by-history.js`

**役割**: 今回追加しようとしている omission が、過去の OMISSIONS で既に同じファイル・同じ観点で指摘済みかを機械的に判定し、完全重複を自動排除する。

**入力**:
- 現在の OMISSIONS ファイルパス（変更中）
- 同ディレクトリの過去 OMISSIONS ファイル一覧

**処理（すべて決定論）**:

```
決定論的ルール3種:
  Rule 1 - 完全重複（同一ファイル + 同一セクション + 同一种別）→ 自動skip（AI に渡さない）
  Rule 2 - low severity の stub_remaining → cosmetic に自動格下げ
  Rule 3 - 同一ファイルで3回以上連続 omission → repeated_area タグ + 要確認フラグ
```

**出力例**:

```json
{
  "autoSkipped": [{ "description": "完全重複: 過去の O-005 と同じ指摘" }],
  "downgraded": [{ "id": "O-012", "from": "low", "to": "cosmetic" }],
  "repeatedAreas": [{ "file": "src/watcher.ts", "consecutiveRounds": 3 }],
  "pendingForAI": [{ "id": "O-013", "similarPast": ["O-008"], "note": "新規性を確認要" }]
}
```

#### B-2: `materiality-filter.js`

**役割**: 各 omission を RFC の purpose / goals / successCriteria と突き合わせて Goal 阻害度を機械的にスコアリングする。このスクリプトの出力は **決定論** であり、AI が覆せない。

**処理**:
1. `rfcUnderstanding` から purpose / goals / successCriteria を読み取る
2. 各 omission に対して以下を機械的に評価：
   - `affectedFiles` と successCriteria のキーワード一致率
   - omission 種別と阻害する criteria の数の積
   - purpose に照らした影響範囲の広さ
3. スコアを出力（決定論として確定）

**出力例**:

```
O-003 の Goal 阻害分析:
  type: missing_implementation
  description: "xxx 関数の戻り値の型が RFC 定義と異なる"

  purpose: "高可用性ログ収集" → 阻害しない（ログ収集の根本には影響なし）[0/3]
  goals: "99.9% uptime" → 阻害しない（戻り値の差は uptime に無関係）[0/2]
  successCriteria: "GET /api/v1/logs が 200 を返す" → 阻害する（型が異なると 500 になる）[1/1]

  → Goal阻害スコア: 1
  → 推奨 severity: low（優先度低）
```

#### B-3: `diminishing-returns.js`

**役割**: find のループ回数と omission 発見数の時系列を分析し、収束しているか発散しているかを機械的に判定する。

**処理**:
1. 全 `OMISSIONS-*.json` から omission 数を種別・severity 別に集計
2. `low / (high + medium + low)` 比率の推移を計算
3. 前回比で omission 総数が増加していれば発散フラグ
4. low 比率が 50% 以上かつ増加傾向なら発散警告

**出力例**:

```
OMISSIONS 発見数推移:
  OMISSIONS-001: 12 omissions (high: 3, medium: 5, low: 4)
  OMISSIONS-002: 8 omissions (high: 1, medium: 3, low: 4)
  OMISSIONS-003: 9 omissions (high: 0, medium: 2, low: 7) ★

判定: 発散傾向アリ（low 比率 33% → 50% → 78% と増加）
推奨: 次回 find では Goal Gate を厳格に適用し、low は基本スキップすること
```

### ワークフロー統合

以上の拡張を既存の find ワークフローに統合すると、以下のようになる：

```
Step 0: 引数パース（現行通り）
Step 1: スケルトン生成（現行通り）
Step 2: RFC 理解（現行通り）
  ├── 2a-1: 目的とゴール
  ├── 2a-2: メタ情報
  ├── 2b: アーキテクチャ
  ├── 2c-1: 型・API・依存
  ├── 2c-2: テスト・エラー処理・設定
  └── 2-review: 全体確認

Step 2.5: 前回からの発散傾向確認（新設）
  └── diminishing-returns.js を実行
  ※ 発散傾向が強い場合、Step 3 の Goal Gate を厳格適用するよう AI に指示

Step 3: ソースコード比較分析（現行通り + 各サブステップ終了時に Goal Gate 適用）
  ├── 3a: 目的↔実装 → 終了時 materiality-filter.js で全 omission の Goal 阻害度評価
  ├── 3b: アーキ↔実装 → 同上
  ├── 3c-1: 型↔実装 → 同上
  └── 3c-2: テスト・エラー↔実装 → 同上

Step 3.5: 機械的フィルタリング（新設）
  ├── dedup-omissions-by-history.js → 過去との重複排除
  ├── materiality-filter.js → Goal 阻害度による severity 確定（全 omission 最終評価）
  └── diminishing-returns.js → 発散/収束の最終判定

Step 4: 発見漏れ確認（AI はスクリプトの結果を読み、pendingForAI のみ追加判断）
Step 5: 最終検証（現行通り + dedup 済 omission で検証）
Step 6: 完了報告（現行通り + 発散傾向があれば注意書き）
```

### ループ学習の仕組み

ループを重ねるごとに、以下のフィードバックが蓄積される：

```
ループ1回目:
  決定論: 20%（初回の既知ルールのみ）
  非決定論: 80%（AI がほぼすべて判断）
  → 追加ルールを抽出（「このパターンは毎回出る」をルール化）

ループ3回目:
  決定論: 50%（よく出るパターンがスクリプト化）
  非決定論: 50%（新しいパターンのみ）
  → さらにルール強化

ループN回目:
  決定論: 80%以上（安定パターンはすべてスクリプト化）
  非決定論: 20%未満（真に新しい発見のみ AI が判断）
```

### check-final との関係

`check-final` は独立した二重計測としての役割を持つ。Goal Gate 導入後は：

- Goal Gate により `cosmetic` に格下げされた omission のみ残っている状態 → **check-final 通過**
- Goal Gate 通過後も medium / high が残っている → **check-final FAIL**
- check-final 自身も Goal Gate を適用する（ただし find とは独立した観点で検証する）

## Implementation

### 新規スクリプト一覧

| スクリプト | 種類 | 決定論度 |
|-----------|------|---------|
| `dedup-omissions-by-history.js` | 新規 | 100%（決定論） |
| `materiality-filter.js` | 新規 | 80%（決定論）+ 20%（AI への情報提供） |
| `diminishing-returns.js` | 新規 | 100%（決定論） |

### find-omissions-for-next-rfc.md の変更点

既存の Step 3（4子ステップ）と Step 4 の間に、Step 3.5 として3つのスクリプト実行を追加する。既存の Step 構造は維持する。

```bash
### Step 3.5: 機械的フィルタリング

全比較ステップ完了後、発見・記録された全 omission に対して機械的フィルタリングを実行する。

# B-1: 過去との重複排除
node .claude/scripts/tickets/dedup-omissions-by-history.js "$OMISSIONS_PATH"
# → autoSkipped は自動削除、downgraded は severity 変更

# B-2: Goal 阻害度評価
node .claude/scripts/tickets/materiality-filter.js "$OMISSIONS_PATH" "$RFC_PATH"
# → 全 omission の severity が確定（決定論ルールにより最終決定）

# B-3: 発散傾向判定
node .claude/scripts/tickets/diminishing-returns.js "$OMISSIONS_PATH"
# → 発散傾向が強ければ注意書きを表示

node .claude/scripts/tickets/update-omissions-step.js "$OMISSIONS_PATH" "3.5" "done"
```

### 影響範囲

| モジュール | 変更内容 |
|-----------|---------|
| `.claude/commands/find-omissions-for-next-rfc.md` | Step 3.5 追加、Step 4 説明修正 |
| `scripts/tickets/create-omissions.js` | steps 配列に `3.5` を追加 |
| `scripts/tickets/dedup-omissions-by-history.js` | 新規作成 |
| `scripts/tickets/materiality-filter.js` | 新規作成 |
| `scripts/tickets/diminishing-returns.js` | 新規作成 |
| `scripts/tickets/add-omission.js` | 変更なし（発見即記録の原則は維持） |
| `scripts/tickets/list-omissions.js` | 変更なし |

### チケット設計（実装単位）

| フェーズ | チケット | 内容 |
|---------|---------|------|
| P0 | P0-1 | `dedup-omissions-by-history.js` の実装 |
| P0 | P0-2 | `materiality-filter.js` の実装 |
| P0 | P0-3 | `diminishing-returns.js` の実装 |
| P1 | P1-1 | `create-omissions.js` の steps 配列更新 |
| P1 | P1-2 | `find-omissions-for-next-rfc.md` に Step 3.5 追記 |
| P1 | P1-3 | Goal Gate 連携の結合テスト |

## Appendix

### 決定論 vs 非決定論の判断基準

```
100% 決定論 ←─────── 境界 ───────→ 100% 非決定論

同一文字列比較                意味的類似性判断
数値の一致/大小              文脈に依存する重要性評価
正規表現マッチ                複合的な影響範囲の判断
キーワード一致                トレードオフの総合評価
過去データの集計              「これは重箱の隅か？」の判断
severity の機械的変換         purpose 達成に本当に必要か？
```

この境界を意識して各スクリプトを設計する。**可能な限り決定論に寄せる** が、文脈判断が必要な部分は潔く非決定論（AI）に任せ、決定論の結果を制約として与える。

### 発散防止の3層防御

```
Layer 1（Step 3 各子ステップ終了時）: 即時 Goal Gate
  → 発見直後に materiality を評価。低いものは cosmetic に格下げ。

Layer 2（Step 3.5）: 機械的フィルタリング
  → 重複排除 + 全 omission の最終 severity 確定 + 発散傾向検知

Layer 3（check-final）: 独立した二重計測
  → find とは独立に Goal Gate を適用し、cosmetic のみなら PASS
```

3層すべてを通過してもなお high/medium の omission が存在する場合、それは真の未完了タスクであり、次の RFC 世代で対処すべきである。
