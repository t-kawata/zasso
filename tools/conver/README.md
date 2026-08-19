# conver — RFC収束型4ループ開発パイプライン

conver は、**「正典 RFC へ実装を収束させる」** と同時に、**「正典自体を安全に進化させ続ける」** ことを可能にする、4つのループから成る開発パイプラインです。

## なぜ必要か — 変化し続けるビジネスと「再投資可能性」

ソフトウェアは「一度作って完成」ではありません。市場は刻一刻と変化し、ビジネスはその変化に**進化という形で常に適応**し続けなければ生き残れません。機能追加・方向転換・新要件への対応——これらはすべて「開発への再投資」です。

しかし長期にわたる開発で最も恐ろしいのは、**「変化がシステムを矛盾だらけにする」**ことです。過去の設計判断がどこに記録されたか分からなくなり、実装が設計から乖離し、テストが嘘をつき始める——そうなると再投資はリスクにしかならず、ビジネスは変化を諦めるか、破壊的な作り直しを強いられます。

conver はこの問題を、**「正典 RFC」を中心とした4つのループ**で解決します。

- **上流ループ（分解）**: AIと人間が共同で 正典 RFC を書き、論理グラフ化し、ディレクトリ境界を決め、チケットに分解する
- **実装ループ（収束）**: AIが全チケットを自動実装し、RFC 設計とのギャップを計測・解消して収束させる
- **出荷ループ（商品化判定）**: 「ユーザーにとっての使い方がユーザーにとって素敵か」という視点から実装を解析・検証し、不足（RESIDUE）を洗い出す。RESIDUE がゼロになり、「ユーザーにとって素敵な使い方」が README.md として書き上がり、実装とテストがそれを満たすことが点検突破した状態を「出荷」とする。
- **進化ループ（再投資）**: 正典 RFC・グラフ・ディレクトリ構造・チケットを「差分」として矛盾なく進化させ、新たなチケットを生み出す。ビジネスの再投資と進化・適応を安全に進めるための装置である。

**すべての設計判断は正典 RFC に集約され、実装はそこへ機械的に収束します。** そして正典自体を変化させる時も、グラフ・ディレクトリ構造・チケット・実装・テストが**矛盾なく連動して進化**するため、「安全な連続性を失わないビジネス上の再投資可能性」が技術的・物理的に保証されます。

---

## 全体像 — 4つのループが出荷に至るまで

```
  上流ループ（分解・人間＋AI 実行）
    /grill-me-for-rfc → /graphify-rfc → /boundify-graph → /split-to-tickets
    正典RFC → *-GRAPH.json → *-Dirs-Tree.json → Tickets.json
        │
        ▼ チケット
  実装ループ（収束・AI 自動実行）
    make → plan → start → review → resolve → consolidate → find
        │ 実装起因のギャップは omission として Tickets.json へマージし、収束するまで再実装
        ▼ find が数ラウンドで収束したら
  出荷ループ（商品化判定・人間＋AI）
    /crystalize-readme <*-GRAPH.json>
      使い方 README をセクション単位で「完全な記述 or RESIDUE」に判定
        ├─ RESIDUE あり → 証拠＋実装補強設計を README に残置 → 進化ループへ
        └─ RESIDUE ゼロ → 「ユーザーにとって素敵な使い方」が README.md に書き上がり、
                          実装とテストがそれを満たすことを点検突破 → 出荷
        ▼
  進化ループ（正典の進化・再投資・適応）
    /drill-rfc-down
      入力: crystalize の RESIDUE / ユーザーとの自由会話 / 与えられた資料
      grill（詳細確定）→ graphify → boundify → split を「差分」として内部実行
      → 正典RFC・GRAPH・Dirs-Tree・Tickets を矛盾なく更新 → 積み増しチケットを実装ループへ
```

| ループ | 実行主体 | コマンド | 責務 |
|--------|----------|----------|------|
| **上流ループ** | 人間＋AI（Claude Code 上で実行） | `/grill-me-for-rfc` → `/graphify-rfc` → `/boundify-graph` → `/split-to-tickets` | RFC 設計書の作成 → 論理グラフ化 → ディレクトリ境界生成 → チケット分解 |
| **実装ループ** | AI（`conver.js` が自動実行） | `/make-ticket` → `/plan-ticket` → `/start-ticket` → `/review-ticket` → `/resolve-ticket` → `/consolidate-stubs` → `/find-omissions` | チケット実装 → 品質検証 → 警告・犯罪・スタブ解決 → スタブのチケット単位束ね直し → 契約ギャップ計測 → 収束 |
| **出荷ループ** | 人間＋AI（Claude Code 上で実行） | `/crystalize-readme` | 使い方 README をセクション単位で「ユーザーにとって素敵か」の視点で検証し、書けないセクションを RESIDUE として洗い出す。RESIDUE ゼロで「素敵な使い方」が README.md に書き上がり、実装とテストがそれを満たす点検突破で出荷 |
| **進化ループ** | 人間＋AI（Claude Code 上で実行） | `/drill-rfc-down` | RESIDUE・自由会話・資料を入力に grill で詳細を確定し、正典RFC・GRAPH・Dirs-Tree・Tickets を差分として矛盾なく進化させる。ビジネスの再投資と進化・適応を安全に進める |

---

## 収束の設計思想

**RFC 設計書が正典（canon）です。** 実装ループはチケット単位で実装を RFC に近づけ、`/find-omissions` が「設計と実装のギャップ」を計測します。さらに出荷ループの `/crystalize-readme` は「ユーザーにとって素敵な使い方の完成度」を、進化ループの `/drill-rfc-down` は「正典そのものの妥当性」をそれぞれ検証・更新します。計測されるギャップは次のように分類されます。

| ギャップの起因 | 計測器 | 対処 | ループ |
|----------------|--------|------|--------|
| **実装起因**（契約がテストに正しく翻訳されていない、未実装、バグ等） | `/find-omissions` | omission チケットとして記録し、`Tickets.json` にマージ → 実装ループで再実装 | 実装ループ内で収束 |
| **商品起因**（「ユーザーにとって素敵な使い方」として不完全・危険・欠落がある） | `/crystalize-readme` | README に RESIDUE（証拠＋実装補強設計）として記録 → `/drill-rfc-down` がチケット化 → 実装ループで再実装 | 出荷ループ経由で収束 |
| **設計起因**（RFC 自体の考慮不足・欠落、市場変化による進化・適応要求） | `/drill-rfc-down`（grill） | 正典RFC・GRAPH・Dirs-Tree・Tickets を差分として矛盾なく更新 → 実装ループで再実装 | 進化ループ経由で収束 |

実装ループを回すだけでは解消できないギャップに遭遇したとき、それが `/crystalize-readme`（商品起因）や `/drill-rfc-down`（設計起因・進化・適応要求）の出番です。

---

## 再投資可能性 — 正典が安全に進化できるための5つの整合性

**再投資可能性（reinvestment capability）** とは、ビジネスが市場の変化に応じて**何度でも安全に開発へ再投資できる**構造のことです。conver はこれを技術的・物理的に保証します。

実装を安全に中断・再開できることもその一部ですが、本質は「**正典自体が安全に変化・進化できる**」ことです。その安全性は、次の5つの整合性が**同時に**満たされることで成り立ちます。

| # | 整合性 | 内容 |
|---|--------|------|
| 1 | **正典RFCが安全に変化・進化できる** | 変化の起点は常に正典 RFC であり、その変化は grill によって設計判断として確定・追跡される |
| 2 | **グラフ（`*-GRAPH.json`）に一切の矛盾を発生させない** | 正典の変化は graphify によって I/O 境界単位のノード・エッジへ機械的に反映され、検証を通過する |
| 3 | **グラフを実体化した Dirs-Tree（`*-Dirs-Tree.json`）に一切の矛盾を発生させない** | グラフの変化は boundify によってディレクトリ境界へ矛盾なく反映される |
| 4 | **実装が以上と完全に一致する** | 変化は split によってチケット化され、実装ループが実装を正典へ収束させる |
| 5 | **テストコードがそれを完全に保証する** | `/find-omissions` が契約→テスト翻訳を全チケット検査し、収束を機械的に計測する |

**進化とはこれら5つの整合性を壊すことではなく、全てをロックステップで一段上げること**です。このハーネスが存在するからこそ、「安全な連続性を失わないビジネス上の再投資可能性」が技術的・物理的に保証され、ビジネスは市場の変化へ進化・適応という形で応え続けられます。

---

## /crystalize-readme — 出荷ループの入口

**役割**: RFC グラフ（`*-GRAPH.json`）を入力に、**ユーザー向けの「使い方 README」**を生成します。判定基準は**「ユーザーにとっての使い方がユーザーにとって素敵か」**です。各 README セクションを1つずつ検証し、**「そのセクションに書かれた使い方が完全に動作する実装が現在存在するか」**を判定します。書けるセクションは「完全な記述」として確定し、書けないセクションは「RESIDUE 記述」として README 内に証拠と実装補強設計を残します。

**RESIDUE とは**: 「なぜ書けないか」のメモではなく、**「README と examples の実装を完全にするための実装チケットの素材」**です。危険・欠落・矛盾・不備の具体的な証拠と、実装を補強するための設計が、README 内の `<::README-RESIDUE::>`（または examples 用の `<::EXAMPLES-RESIDUE::>`）マーカーと共に厳密に記述されます。RESIDUE は後に `/drill-rfc-down` によってチケット化されます。

**2つの実行モード**:

- **fresh**: README.md / CRYSTALIZE-Status.json が存在しない初回実行。ゼロから開始します
- **refine**: 過去の実行成果物が存在する再実行。見出しを再確定し、全セクションを再解析して洗練・更新します

**ワークフロー**:

1. **Preflight**: `derive-output-paths.js` がグラフを構造検証し、出力先と実行モードを決定（決定論）
2. **Step 1 — 目次 grill**: 使い方に焦点を当てた README の見出し階層（H1, H1-1, …）をユーザーとの対話で確定し、骨子を README へ機械出力（各セクションに `<::TEMPLATE-README::>` マーカーを付与）
3. **Step 2 — セクション単位検査ループ**: 各セクションについて、対応するチケットの spec → 実装を読み、証拠に基づいて「書ける／書けない」を判定。書ける → `resolve-section`、書けない → `mark-residue`。AI が README を直接編集することは禁止
4. **Step 3 — Examples 専用ステップ**: 末尾の「Examples（実装サンプル）仕様と設計」を仕上げ、`<::TEMPLATE-EXAMPLES::>` を解決するか RESIDUE 化する

**収束と出荷**: 全セクションが「完全な記述」または「RESIDUE 記述」になればループは収束します。RESIDUE が残っていれば `/drill-rfc-down` へ渡して実装を補強し、refine モードで再検証します。**RESIDUE がゼロになり、「ユーザーにとって素敵な使い方」が README.md として書き上がり、実装とテストがそれを満たすことを点検が突破した状態——それが「出荷」です。**

---

## /drill-rfc-down — 進化の扉

**役割**: 正典 RFC を「進化ステージ」ごと一段上げる、**唯一の進化の扉**です。入力（crystalize の RESIDUE / 事前のユーザーとの自由会話 / 与えられた資料）に対して **grill 方式の質問攻め**で設計判断を確定させ、確定した差分を既存の `*-GRAPH.json` / `*-Dirs-Tree.json` / `Tickets.json` へ**矛盾なく反映**します。つまり内部で **grill → graphify → boundify → split を「差分」に対して実行**します。

**ループ内の位置付け**: 実装ループの `/find-omissions` が計測したギャップのうち「実装側で埋められない設計起因のもの」、および出荷ループの `/crystalize-readme` が残した RESIDUE を解消します。さらに、市場変化や新たな要件（ユーザーとの自由会話・資料）を正典へ取り込む**進化ループ**の入口でもあります。

**編集方針**:

- 追記優先。全文書き換え・セクション削除・破壊的変更は禁止
- DesignTree / Status / CheckList は `/grill-me-for-rfc` と同一機構を再利用（既存セッションがあれば継続）
- 質問 → 回答 → 追記 → CheckList 照合 → 再 grill 判定のサイクルで品質を高める
- I/O 境界参照情報を追記し、後段の graphify / boundify が安全に分割できるようにする
- 確定した差分に対して graphify → boundify → split を実行し、`*-GRAPH.json` / `*-Dirs-Tree.json` / `Tickets.json` を矛盾なく更新して積み増しチケットを生成する

**この機能の意味**: 正典・グラフ・ディレクトリ構造・チケットが常にロックステップで更新され続けるため、開発プロジェクトは「安全な連続性を失わないビジネス上の再投資可能性」を担保できます。ビジネスの再投資と進化・適応（方向転換・機能追加・要件変化への対応）は、いつでもこの扉を通じて正典を進化させることで、年単位の長期開発を矛盾なく続けられます。

---

## コマンド一覧

### 上流ループ（人間＋AI 実行）

#### `/grill-me-for-rfc <調査情報パス> <RFC出力パス>`

調査情報をもとに、RFC 設計書を対話型セッション（grill）で書き上げます。

- **入力**: 調査情報のファイル/ディレクトリパス + RFC 出力先 `.md`
- **プロセス**: `init.js` が DesignTree / Status.json / CheckList.md を初期化 → AI が設計判断を質問（Yes/No または選択肢形式）→ DesignTree のノードを resolved にしていく → 全ノード解決で CheckList 生成 → RFC 執筆 → I/O 境界参照情報を追記
- **制約**: 完全網羅・スコープ委譲禁止・スタブ禁止。TBD / TODO / 委譲の混入禁止。各設計判断にコードスニペット必須。IETF スタイル（Abstract / Motivation / Design / Implementation / Appendix）

#### `/graphify-rfc <RFCファイルパス>`

長大な Markdown 設計文書を **I/O 境界単位の細粒度ノード** に分割し、属性付きエッジで結んだグラフ構造（`*-GRAPH.json`）として永続化します。

- **7 Step 進行制御**: 見出し重複排除 → ノード分割（4軸: セクション階層 / 単一 kind / 外部依存の有無 / 言語割当）→ エッジ付与（12種 + 契約 annotation）→ 機械検証（未カバー行・孤立ノード）→ 自己検証（headingRefs 解決性）→ ランダム抜き打ち品質検査 → 最終品質検証（全グラフ要約）
- **常にチケット粒度より細かく分割（発散）** する。後段 `/split-to-tickets` / `/boundify-graph` が粗い粒度で抽出・束ねる
- 生成されたグラフは `/boundify-graph` と `/split-to-tickets` の入力となり、`/make-ticket` 〜 `/review-ticket` でも設計参照に利用される

#### `/boundify-graph <GRAPHファイルパス>`

`/graphify-rfc` が生成したグラフ JSON を入力に、検証・自己修復ループを経て**安全な境界を持つ実装ディレクトリツリー**（`*-Dirs-Tree.json`）とテンプレートファイルを生成します。graphify（論理グラフ）→ boundify（物理ディレクトリ）の直列パイプラインを構成します。

- **自己修復ループ**: 5軸検証（ノードID/エッジ/headingRefs/孤立ノード/ソース網羅）で graphify→boundify 接合部の整合を確認し、問題があればスクリプトの指示に従って修正・再実行。`/graphify-rfc` へ戻る必要なし
- **Prune 規則**: 子 2 未満のディレクトリは除去、単一子は親へ平坦化
- **宣言スタブ**: 実装のない空ファイルには言語・kind に応じた宣言スタブ（関数シグネチャ + 実装 TODO）を自動付与
- **Prose 除外**: `rationale` / `glossary` / `requirement` の 3 kind はファイル生成対象外（設計情報は接続先ファイルのヘッダコメントに相互参照として埋め込む）
- 循環依存の検出と警告

#### `/split-to-tickets <RFCファイルパス> <GRAPHファイルパス> <Dirs-Treeファイルパス>`

設計文書を依存関係に基づく**フェーズとチケットに分解**し、`Tickets.json` を生成します。`/make-ticket` 以降の全コマンドはこの `Tickets.json` を参照・更新します。

- **機械的フェーズ設計**: `phasify-graph-and-dirs-files-tree.js` が GRAPH と Dirs-Tree を入力に、重み付きトポロジカルソート + SCC 縮約で全ノードを実装フェーズへグループ化
- **1チケット・1不変条件**: ノード群を安全な I/O 境界でチケットに束ね、各チケットに `nodeIds` / `contracts` / `default_files` を付与
- **詳細度ガイドライン**: `background` 300字以上 / `scope` を型シグネチャ付きで列挙 / `notes` 複数セクション 500字以上 / `testUnit`・`testIntegration`・`testExceptions` を明記（TDD 必須）
- **フェーズ統合**: 3 チケット未満のフェーズは後方のフェーズへ自動マージ（Step 5-3）
- 出力先は RFC と同階層の `Tickets.json`（既存ファイルがあれば上書き確認）

### 実装ループ（AI 自動実行）

#### `/make-ticket <P{phaseID}-{ticketID}>`

実装仕様書（spec）を作成・詳細化します。status を `made` に遷移します。

- チケット情報を `show-ticket-context.js` で取得 → 11 フィールドにテンプレートマーカーを挿入
- **Phase 1（TDD）**: `testUnit` / `testIntegration` / `testExceptions` を先に固める
- **Phase 1.5（契約定義・展開）**: Contracts（Precondition/Postcondition/Invariant）をテスト可能な形へ翻訳し、各要素を `testUnit` に対応付ける（Gate M で検証）
- 調査 → マーカー置換 → **契約カバレッジ検証**（`verify-make-contracts.js`）→ STUB 列挙・検証 → spec 出力（`specs/P{id}-{n}.md`）→ status `made`

#### `/plan-ticket <P{phaseID}-{ticketID}>`

チケットの実装計画を策定し、承認を得ます。status を `planned` に遷移します。

- **Step 3.5（契約→テストコード翻訳）**: 各契約要素を実コードパターンとして `planTestCode` フィールドに書き出す（Gate P で検証）
- 犯罪・スタブ点検（Malfeasance.json / `[::STUB::]`）を実施し、計画承認条件を満たす
- 実装計画は「実装時未知数ゼロに近い」コードスニペットを含む高密度情報であることが必須
- 計画完了後、spec を再出力して status `planned`

#### `/start-ticket <P{phaseID}-{ticketID}>`

計画に従い TDD（Red→Green→Refactor）で実装を実行します。status を `done` に遷移します。

- **犯罪最優先解決**: 未解決犯罪（Malfeasance.json）があれば本チケットより優先して解決
- **Red**: 100% カバレッジの失敗テストを先に書く。契約の Pre/Post/Invariant を `@verifies` アノテーション付きテストへ翻訳
- **Green**: 一般化された正しい実装（ハードコード・入力分岐・スタブでの偽装は禁止）
- 実装ファイルに `[::TICKET::]` プロビナンス注釈を付与（`annotate-ticket-context-by-git-diff.js`）
- コンパイル検証・テスト・品質チェック通過後に status `done`

#### `/review-ticket <P{phaseID}-{ticketID}>`

`done` チケットの品質検証を行います。通過後 status を `reviewed` に遷移し、パイプライン変更をコミットします。

- 犯罪・スタブ点検、未完了実装の能動的探索（7パターン）、ticket-key 注釈の検証
- コンパイル検証・全テスト実行・静的品質チェック・翻訳可能性チェック
- 設計情報（Step 1）に対するリスク・漏れ・矛盾・欠落の能動的探索
- 最終契約充足検証（`verify-final-contracts.js` / `validate-ticket-targets.js`）通過後に status `reviewed` + `completedAt` 記録
- **Step 12: コミットするが、決して push しない**（push はユーザーの明示的操作）

#### `/resolve-ticket [P{phaseID}-{ticketID}]`

指定ディレクトリ配下の警告・エラー・スタブ・犯罪を一括解決します。**チケットの status は一切変更しません。**

- コンパイルチェック・テストで警告/エラーを捕捉 → 即時解決 or `insert-stub.js` で解決予定チケットを紐づけて抑止
- スタブ一覧・犯罪一覧（ディレクトリスコープ）を取得し、全て解決するまで完了と宣言しない
- 引数にチケットキーを指定すると、そのチケットの targetStubs/targetCrimes の列挙・検証も実行（Step 7.5）

#### `/consolidate-stubs`

既存の `[::STUB::]` マーカーを**解決キーの正規化によりチケット単位へ束ね直し**ます。`/find-omissions` の**必須前提**です。

- マーカーを単一の成果物（unit）単位にグループ化し、unit ごとの resolve key を 1 つに正規化（マーカー行の編集のみ。チケットは作成しない）
- グループ化結果を `./manifests/CONSOLIDATED-MANIFEST-<ts>.json` として出力（`/find-omissions` Step 1 が消費する成果物）
- 完了ゲート `consolidate-stubs-gate.sh` が非ゼロなら次へ進めない（terminal excuse・不正キー・非消費マニフェストの検出）
- `/find-omissions` はこのマニフェストが存在しないと pre-flight で失敗する（`require-consolidated-manifest.js`）

#### `/find-omissions <GRAPHファイルパス>`

reviewed チケットの**契約（Contracts）がテストコードへ正確に翻訳されているか**を全チケット検査し、ギャップを構造化された omission として記録します。実装ループの収束判定を担う計測器です。

- **必須前提**: 実行前に `/consolidate-stubs` を完了し、`./manifests/CONSOLIDATED-MANIFEST-*.json` を生成しておく（pre-flight の `require-consolidated-manifest.js` が検証し、無ければ exit 2 で中止）
- **Step 1（再チケット化）**: マニフェストを `batch-create-resolving-tickets.js` に渡し、`(sourceKey, unit)` 単位で resolving チケットを機械的に作成（人間への確認はしない）
- **ABC 検査基準**:
  - **A（契約翻訳）**: Precondition→テスト入力、Postcondition→アサーション、Invariant→不変条件検証が存在するか
  - **B（違反検出）**: 契約違反が既存テストのアサーションで検出可能か（違反を入れたら必ず失敗するか）
  - **C（テスト精度）**: アサーションが曖昧でなく、負のテスト・境界テスト・循環論法の排除がされているか
- 発見したギャップは `passed=false` の評価として**発見即記録**（証拠ファイル:行を添える）
- 全チケット検査後、`phasify-omissions.js` が omission を `Tickets.json` に**機械的にマージ**（新規フェーズは `Omissions: ` プレフィックスで命名、round をインクリメント）
- 成功時にマニフェストとロールバックバックアップを削除（`clean-consolidation-artifacts.js`）。再実行には新たな `/consolidate-stubs` が必要
- マージされた omission チケットは実装ループに戻り、**収束するまで再実装が繰り返される**

### 出荷ループ（人間＋AI 実行）

#### `/crystalize-readme <GRAPHファイルパス>`

RFC グラフを入力に「使い方 README」をセクション単位で検証・生成します。書けないセクションは RESIDUE（証拠＋実装補強設計）として README 内に残し、`/drill-rfc-down` のチケット化素材とします。RESIDUE ゼロで出荷判定。詳細は「[/crystalize-readme — 出荷ループの入口](#crystalize-readme--出荷ループの入口)」を参照。

### 進化ループ（人間＋AI 実行）

#### `/drill-rfc-down <RFCファイルパス>`

正典 RFC を進化させます。入力（crystalize の RESIDUE / ユーザーとの自由会話 / 与えられた資料）を grill で確定し、GRAPH・Dirs-Tree・Tickets を差分として矛盾なく更新して積み増しチケットを生成します。詳細は「[/drill-rfc-down — 進化の扉](#drill-rfc-down--進化の扉)」を参照。

---

## conver.js — ACP ベースのチケット処理パイプライン

`conver.js` はこのプロジェクトの中心的な成果物です。`@agentclientprotocol/claude-agent-acp` を通じて Claude Code のセッションをプログラムから制御し、`Tickets.json` に定義されたチケットに対して make → plan → start → review → resolve → consolidate-stubs → find の一連の工程を自動実行します。

### 使用方法

```bash
node dist/conver.js -k <DeepSeek_API_Key> -s <Slack_Webhook_URL> [options]
# .claude/scripts/conver/ に配置されたバンドルからも実行可能
node .claude/scripts/conver/conver.js -k <api_key> -s <slack_url>
```

### CLI オプション

| フラグ | 説明 | デフォルト |
|--------|------|-----------|
| `-k`, `--api-key` | DeepSeek API Key（必須） | — |
| `-s`, `--slack-url` | Slack Incoming Webhook URL（必須） | — |
| `-t`, `--tickets` | Tickets.json のパス | `./Tickets.json` |
| `-c`, `--count` | 最大処理チケット数 | `999999` |
| `-r`, `--resolve-every` | Nチケット完了ごとに resolve | `3` |
| `-p`, `--push` | resolve 毎に jpush-branch 実行（0/1） | `1` |
| `-m`, `--model` | 使用モデル | `deepseek-v4-flash` |
| `-v`, `--verbose` | 詳細表示（0/1） | `1` |
| `--timeout` | 各コマンドのタイムアウト（秒） | `1800` |
| `-b`, `--bind-review-in-one-session` | review を同一セッションに結合（0/1） | `1` |
| `-w`, `--watcher` | Watcher 設定ファイルのパス（指定時は Watcher モード起動） | — |
| `-n`, `--no-find` | 全 reviewed 後の find-omissions をスキップ（0/1） | `0` |
| `-h`, `--help` | ヘルプ表示 | — |
| `--version` | バージョン表示 | — |

### セッションアーキテクチャ

```
チケット P0-1 の処理フロー:

   [Session A]  /make-ticket → /plan-ticket → /start-ticket
        │                        （-b 1 デフォルトでは review も同一セッション）
        ▼ dispose
   [Session B]  /review-ticket
        │
        ▼
   reviewedCount % resolveEvery === 0
        ▼
   [Session C]  /resolve-ticket →（任意）→ /jpush-branch
        │
        ▼
   全チケット reviewed → [Session D] /find-omissions <GRAPH.json>
        │
        ▼
   次のチケット P0-2 へ
```

- `-b 0` を指定すると review が別セッションで独立実行されます
- `-p 1`（デフォルト）では resolve 後に `/jpush-branch` で日本語コミット＋プッシュします（`/epush-branch` は英語コミット版）
- 全チケットが reviewed になったことを検知すると `/find-omissions` を自動実行します（`-n 1` でスキップ）。`/find-omissions` は実行前に `/consolidate-stubs` の完了（マニフェスト生成）が必須です

### チケットのステータス遷移

```
todo ─(make)→ made ─(plan)→ planned ─(start)→ done ─(review)→ reviewed
```

| status | 表示 | 意味 |
|--------|------|------|
| `todo` | `[ ]` | 未着手 |
| `made` | `[_]` | spec 作成完了 |
| `planned` | `[|]` | 実装計画承認済み |
| `done` | `[/]` | 実装完了（未レビュー） |
| `reviewed` | `[x]` | レビュー完了 |
| `remanded` | `[!]` | `/find-omissions` が検査対象として一時的に差し戻した状態 |
| `R<N>` | `[R<N>]` | round 対応ステータス。omission マージ後、既存レビュー済みチケットは `R1`, `R2`… とラウンドが進む |

- `/resolve-ticket` は status を変更しません（警告・エラー・スタブ・犯罪の解決専用）
- フェーズのチェックボックスは配下の全チケットが `reviewed`（または round 済み）の場合のみ `[x]` になる（動的評価）

### Watcher モード — 定期実行による半自律運用

`-w <config.json>` を指定すると、通常の 1 回実行ではなく **Watcher モード** で起動します。node-cron を用いて一定間隔で `runLoop` を自動再実行し、時間枠内でのみ動作します。

```json
{
  "intervalMinutes": 60,
  "startTime": "09:00",
  "endTime": "19:00",
  "timezone": "Asia/Tokyo"
}
```

| フィールド | 説明 | 制約 |
|-----------|------|------|
| `intervalMinutes` | ループ実行間隔（分） | 1 以上、525,600（1年）以下、整数 |
| `startTime` | 稼働開始時刻（HH:mm、24時間表記） | 例: `"09:00"` |
| `endTime` | 稼働終了時刻（HH:mm、24時間表記） | 例: `"19:00"` |
| `timezone` | IANA タイムゾーン名 | 例: `"Asia/Tokyo"`, `"America/New_York"` |

**動作フロー**:
1. `-w config.json` で起動すると `runWatcherMode` が呼ばれる
2. 設定ファイルを読み込み、全フィールドをバリデーション（不正値はエラー終了）
3. 現在時刻が時間枠外なら即時終了
4. `CronScheduler` を起動 — `intervalMinutes` 間隔で `runLoop` を定期実行
5. 各 `runLoop` 内で各チケット処理前に `checkStepDeadline` を実行 — 時間枠外ならそのチケットをスキップしループ終了
6. SIGINT/SIGTERM でグレースフルシャットダウン

---

## データモデル

### Tickets.json

`/split-to-tickets` が生成し、実装ループの全コマンドが参照・更新する、開発の単一情報源です。

```
Tickets.json
├── title: string
├── round: integer（omission マージのたびにインクリメント）
├── metadata: { source, generatedAt, ... }
├── phases[]
│   ├── id: integer (-1 は PX: 独立フェーズ)
│   ├── name: string
│   └── tickets[]
│       ├── id: string（P{phaseID}-{ticketID} の複合キー）
│       ├── title: string
│       ├── status: "todo"|"made"|"planned"|"done"|"reviewed"|"remanded"|"R<N>"
│       ├── nodeIds: string[]（GRAPH ノード N0001〜 との対応）
│       ├── contracts: { id, sourceEdge, precondition, postcondition, invariant }[]
│       ├── default_files: string[]
│       ├── background, scope[], testUnit[], testIntegration[], testExceptions[]
│       ├── acceptanceCriteria[], invariants
│       ├── planTestCode[]（/plan-ticket で設定）
│       ├── changes[], instrumentation, notes
│       ├── startedAt, completedAt（YYYY-MM-DD）
│       └── relatedTicketIds
```

### OMISSIONS（`/find-omissions` の成果物）

`/find-omissions` は検査中に `_tmp-omissions-<timestamp>.json` へ記録し、完了時に `OMISSIONS-<timestamp>.json` として残します。その後 `phasify-omissions.js` が `Tickets.json` へ機械的にマージします。

```
OMISSIONS-<timestamp>.json
├── 各 omission チケット
│   ├── originalTicketKey: string（検査対象チケット）
│   ├── severity: "critical"|"major"|"minor"
│   ├── recommendation: string
│   └── evaluations[]
│       ├── criterion: "A"|"B"|"C"（契約翻訳 / 違反検出 / テスト精度）
│       ├── passed: boolean（false = omission）
│       ├── reason: string（ファイル+行の根拠付き・自己完結）
│       └── evidence: { file, line }[]
```

### GRAPH / Dirs-Tree（上流ループの成果物）

```
*-GRAPH.json（/graphify-rfc の出力）
├── sourceFile: string
├── mainLanguage: string
├── nodes[]: { id(N0001〜), title, kind(12種), summary, language, slug, headingRefs }
└── edges[]: { from, to, type(12種), attributes(strength/bidirectional), contracts[] }

*-Dirs-Tree.json（/boundify-graph の出力）
├── nodes[], edges[], trees[], dependencyDirections[]
└── 実装ディレクトリ境界（languageRules による言語別可視性）
```

### CRYSTALIZE（`/crystalize-readme` の成果物）

`/crystalize-readme` は、ユーザー向け使い方説明である **README.md**（RFC と同階層に出力）と、進捗・判定結果を記録する **CRYSTALIZE-Status.json** を生成・更新します。

```
README.md（rfcDir/README.md に出力）
├── 使い方セクション: 完全な記述 or <::README-RESIDUE::>（証拠＋実装補強設計）
└── 末尾: Examples セクション: 完全な設計 or <::EXAMPLES-RESIDUE::>

CRYSTALIZE-Status.json
├── mode: "fresh"|"refine"（実行モード）
├── headings[]: { id, heading, confirmedContent }（目次 grill の確定結果）
├── sections[]: { id, status: "complete"|"residue"|"template", content }（セクション単位の判定）
├── examplesApproved: boolean
└── 各 Step の進行状態（/crystalize-readme の update-step-status.js が更新）
```

---

## スクリプトリファレンス

### 上流ループ（`.claude/scripts/rfc-graph/`）

| カテゴリ | スクリプト |
|----------|-----------|
| グラフ CRUD（唯一の書き込み経路） | `crud.js` |
| graphify | `deduplicate-headings.js` / `resolve-by-heading.js` / `verify.js` / `validate-slug.js` / `query.js` / `test-query-all.js` / `query-fix-hints.js` / `analyze-source-structure.js` / `show-graph-summary-markdown.js` / `update-step-status.js` |
| boundify | `boundify-graph-to-dirs.js` / `validate-dirs-tree-schema.js` / `verify-graph-integrity.js` / `generate-all-dir-templates.js` / `generate-dir-template.js` / `update-boundify-step-status.js` |
| split | `phasify-graph-and-dirs-files-tree.js` / `show-phase-nodes.js` / `write-phase-name-summary.js` / `check-phase-names-summaries.js` / `consolidate-phase-tickets.js` / `update-split-step-status.js` |

### 実装ループ（`.claude/scripts/tickets/`）

| カテゴリ | スクリプト |
|----------|-----------|
| チケット CRUD | `add-ticket.js` / `get-ticket.js` / `update-ticket.js` / `delete-ticket.js` / `bulk-add-tickets.js` / `bulk-update-tickets.js` / `bulk-delete-tickets.js` |
| 表示・検索 | `list-phases-and-tickets.js` / `all-tickets.js` / `search-tickets.js` / `get-ticket-as-markdown.js` |
| フェーズ管理 | `add-phase.js` / `add-px-phase.js` / `write-tickets-json-template.js` / `rename-phases.js` |
| make/plan/start/review | `show-ticket-context.js` / `ensure-ticket.js` / `insert-field-template.js` / `list-remaining-stubs.js` / `check-ticket-status.js` / `verify-make-contracts.js` / `verify-plan-contracts.js` / `verify-red-coverage.js` / `verify-final-contracts.js` / `validate-ticket-targets.js` / `annotate-ticket-context-by-git-diff.js` / `resolve-ambiguous-markers.js` |
| consolidate | `batch-update-stub.js` / `batch-create-resolving-tickets.js` / `consolidate-stubs-gate.sh` / `require-consolidated-manifest.js` / `preflight-stub-cleanup.js` / `validate-no-external-excuses.js` / `clean-consolidation-artifacts.js` |
| find | `get-next-check-target-ticket.js` / `add-omission-ticket.js` / `create-tmp-omissions.js` / `validate-graph-arg.js` / `phasify-omissions.js` |
| 犯罪・スタブ | `scan-crimes.sh` / `malfeasance-create.js` / `malfeasance-update.js` / `insert-stub.js` / `scan-incomplete-implementations.js` / `ensure-malfeasance.js` |
| 品質・検証 | `review/run-quality-checks.js` / `review/find-all-stubs.js` / `review/generate-report.js` / `lib/validate-tickets.js` / `lib/validate-omissions.js` |

### 出荷ループ（`.claude/scripts/crystalize-readme/`）

`derive-output-paths.js`（Preflight・モード判定）/ `update-step-status.js`（Step 進行管理・確認記録）/ `validate-toc-proposal.js`（目次提案の構造検証）/ `emit-readme-skeleton.js`（骨子の機械出力）/ `loop-drive-readme.js`（セクション検査ループの駆動・resolve-section / mark-residue / resolve-examples / mark-examples-residue）/ `validate-marker-grammar.js`（マーカー文法の単一情報源）

### grill / drill-rfc-down（`.claude/scripts/grill-me-for-rfc/`）

`/drill-rfc-down` は grill 機構を再利用します。`init.js` / `init-for-drill-rfc-down.js` / `update-tree.js` / `tree-query.js` / `update-status.js` / `session-status.js` / `check-all-schema.js` / `generate-checklist.js` / `list-files.js` / `validate-question-format.js` / `extract-io-boundary.js` / `insert-io-boundary-template.js` / `check-io-stubs.js`

---

## 第一級規則 — `[::STUB::]` マーカー絶対義務

不完全な実装（スタブ・モック・仮実装・プレースホルダー等）にはすべて `[::STUB::]` マーカーを付与しなければなりません。Malfeasance.json に記録し、解決するまで次ステップに進めません。

- マーカー挿入は **`insert-stub.js` 経由のみ**（ソース直接編集は禁止）。`--resolve-by-ticket` は既存チケットのみ許可され、`MUST RESOLVE` は引数レベルで拒否されます
- 対象パターン: `todo!()` / `unimplemented!()` / `panic!()` / 空の関数本体 / `return Ok(())` / コメントアウトコード / `TODO` / `FIXME` / `HACK` / `XXX` / Mock / `#[allow(...)]`
- 各フェーズで Malfeasance.json を確認し、未解決犯罪があれば優先解決します

---

## インストール

conver の `.claude` ディレクトリ（スラッシュコマンド群・チケット管理スクリプト群）を別プロジェクトに導入するには、同梱の `install.js` を使用します。

### 依存関係

```bash
npm install
```

ランタイム依存は `@agentclientprotocol/sdk ^1.0.0`、`@agentclientprotocol/claude-agent-acp ^0.52.0`、`node-cron ^4.5.0` です。

### ビルド

```bash
npm run build
```

`npm run build` は esbuild で単一ファイルにバンドルし、`dist/conver.js` を生成します。`make build-conver` はさらに `.claude/scripts/conver/conver.js` にも配置します。

| コマンド | 説明 |
|---------|------|
| `npm run build` | esbuild で TypeScript を単一ファイルにバンドル |
| `npm run typecheck` | TypeScript の型チェックのみ（`tsc --noEmit`） |
| `make build-conver` | esbuild バンドル＋`.claude/scripts/conver/` に配置 |
| `make typecheck` | `npm run typecheck` と同じ |
| `make test-conver` | conver.js 本体のユニットテスト（tsc コンパイル後 `node --test`） |
| `make test-rfc-graph` | rfc-graph 全スクリプトのテスト |
| `make run-conver` | `ARGS` を指定して conver.js を実行 |
| `make deploy TARGET=path` | esbuild バンドルをビルドし配置 |
| `make list-tickets` | チケット一覧をチェックリスト形式で表示 |
| `make list-active-tickets` | 未完了（`[x]` 以外）チケット一覧を表示 |
| `make stubs` | `[::STUB::]` マーカーを含む全ファイルを検索 |
| `make crimes` | 全 Malfeasance.json の犯罪レコードを集約表示 |

`.claude/scripts/conver/` に `package.json`（`{"type": "module"}`）が配置されており、ESM として正しく実行されます。

```bash
# カレントディレクトリに関わらず正しく動作します
install.js -t /path/to/target/.claude
```

ターゲットに同名ファイルが存在する場合、1ファイルごとに上書き確認のプロンプトが表示されます。全ての上書きを自動承認するには `-y` フラグを指定します：

```bash
install.js -y -t /path/to/target/.claude
```

`install.js` はスクリプト自身の位置（`__dirname`）から相対的に `.claude` ディレクトリを特定するため、どのカレントディレクトリから実行しても正しく動作します。

---

## はじめかた

### スラッシュコマンド経由（Claude Code 内）

1. `/grill-me-for-rfc` で設計判断を確定し、RFC 設計書を書く
2. `/graphify-rfc` で RFC を論理グラフ化（`*-GRAPH.json`）
3. `/boundify-graph` で実装ディレクトリツリーを生成（`*-Dirs-Tree.json`）
4. `/split-to-tickets` でフェーズ・チケットに分解（`Tickets.json`）
5. `conver.js` が実装ループを自動実行（make → plan → start → review → resolve）
6. `/consolidate-stubs` が `[::STUB::]` マーカーをチケット単位へ束ね直す（`/find-omissions` の必須前提）
7. `/find-omissions` がギャップを計測し、実装起因の omission を `Tickets.json` にマージ → 収束するまで再実装
8. find の積み増しが数ラウンドで収束したら、`/crystalize-readme` で「ユーザーにとって素敵か」の視点から使い方 README をセクション単位で検証（出荷ループ）
9. RESIDUE が出たら `/drill-rfc-down` がチケット化して積み増し → 手順5へ戻って再実装。RESIDUE がゼロになり、「ユーザーにとって素敵な使い方」が README.md に書き上がり、実装とテストがそれを満たすことを点検突破したら出荷
10. 市場変化や新要件があれば `/drill-rfc-down` で正典を進化させ（進化ループ）、積み増しチケットを手順5から再実装

### CLI 直接実行

```bash
# Tickets.json を用意した上で
node dist/conver.js -k <api_key> -s <slack_url>

# 最大5チケット処理、resolve 間隔2、push 有効
node dist/conver.js -k <api_key> -s <slack_url> -c 5 -r 2 -p 1
```
