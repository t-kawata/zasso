# ABOUT-REVERSE — 既存プロジェクトを conver の4層ループへ反転させる「逆回転」パイプライン

> **この文書の目的**: conver を初めて見る専門家が、背景・文脈・設計意図をすべて理解したうえで、**逆回転（リバースエンジニアリング）パイプラインの設計を批判的にレビューし、不足している解析・手法・ステップを提案できる**ようにすること。
>
> **この文書は説明文書ではなく依頼文書である。** 我々の提案は**出発点にすぎない**。リバースエンジニアリングはエンジニアリングの中で最大級に難しく、成功率が極めて低い。
>
> **何を求めているかの全体は §0 に集約した。まず §0 を読まれたい。** 要約すると次の4点である。
>
> 1. **世界中で実績のある手法の提供** — 我々が知らないものを教えてほしい（依頼 1）
> 2. **どの解析をどの段に置くかの設計** — どこに・何を・なぜそこに（依頼 2）
> 3. **非決定論的な AI の判断を助ける設計** — 判断面積をさらに削るには（依頼 3）
> 4. **本提案の欠陥の指摘** — 何が間違っているか。**最も価値が高い**（依頼 4）
>
> **読み進め方**: 時間が無ければ **§0 → 3章 → 4章 → 6.2 節 → 7章** の順で拾われたい。conver を初めて見る読者は 1章 → 2章と進み、**初出語で止まったら 1.6 節**を参照されたい。設計を具体的に批判するには **2.6 節（成果物の具体形）と 2.7 節（既存実装の現物構成）** が要る。配置を評価するには **6.10 節（データフロー）と 6.11 節（Worked example）** を、失敗の議論には **7.6 節（失敗モード）** を、着手判断には **3.6 節（適格条件）と 7.7 節（段階的戦略）** を参照されたい。
>
> **第1ラウンドの専門家レビューは完了し、そこで残った論点もすべて解決済みである。** 採用33項目・修正4項目・却下/保留6項目・**解決した論点7項目（11.5節）**、および**対立点の裁定**は **11章** に記録した。**計画自体の自己監査で見つけた6つの欠陥は 11.9 節**に、確定した実装フェーズ（**Phase −1〜4**）は **6.13 節**に、**新設ゲートの受け入れ基準**は **6.14 節**にある。**同じ指摘を繰り返す必要はない。**

---

## 0. 専門家への依頼（この文書の中心）

**この文書は依頼文書である。** 1〜6章と8章は、7章の依頼に正確に答えるための前提にすぎない。**時間が限られている読者は、本節を読み、3章・4章・6.2節だけを拾って7章へ進まれたい。**

### 0.1 誰に頼んでいるか

次の領域のいずれかに**実務経験または研究経験**のある方。**全領域に通じている必要はない。** どの領域に強いかによって、答える範囲を決めてほしい。

| 領域 | 主に対応する依頼 |
|---|---|
| プログラム解析（静的解析・データフロー・型システム・CPG） | 依頼 1・2 |
| 動的解析（トレース・ファジング・シンボリック実行・プロファイリング） | 依頼 1・2 |
| 仕様マイニング・不変条件推論・状態機械推論 | 依頼 1・2 |
| アーキテクチャ復元・ソフトウェア進化・MSR（Mining Software Repositories） | 依頼 1・2・4 |
| 要求工学（要求の復元・ゴールモデル） | 依頼 1・2 |
| **レガシー近代化・リバースエンジニアリングの実務** | **依頼 4（最も価値が高い）** |
| LLM／エージェント設計・human-in-the-loop 設計 | 依頼 3 |
| テスト理論（ミューテーション・プロパティベース） | 依頼 1・2・4 |

### 0.2 依頼は4つである

#### 依頼 1 — 手法の提供（我々が知らないものを教えてほしい）

我々は §7.2 に手法の一覧を挙げたが、**それは我々が名前を知っているものに過ぎない。** 次を求めている。

- §7.2 に**挙げていない**手法・ツール・研究
- 各手法について: **名称 / 何をするか（1〜2文）/ 実績（どの程度使われているか）/ 適用条件 / 既知の限界 / 参考実装・文献**
- とくに「**その手法が §7.6 のどの失敗モードを潰せるか**」の観点で教えてほしい

#### 依頼 2 — 配置の設計（どこに置くか、なぜそこか）

- §6.2 の **R0〜R8 のどの段に、どの手法を入れるか**
- **なぜその段なのか**（その段の何が改善するか）
- **逆回転の精度がどう上がるか**（定量でなくてよい。定性的な因果でよい）
- 逆に「**その段には入れないほうがよい**」という指摘も歓迎する
- §6.10 のデータフローに**欠けている辺**はないか

#### 依頼 3 — 判断支援の設計（AI をどう助けるか）

- §7.4 の8つの仕掛けで十分か。**何が足りないか**
- **AI の判断面積をさらに削る**設計はあるか（＝ いま非決定論に置いているもののうち、決定論に落とせるものはどれか）
- 人間の専門家（ドメイン知識保有者）を**どこでループに入れる**のが最も効果的か
- **判断カードの粒度**をどう決めるべきか（粗ければ判断が雑に、細かければ枚数が爆発する）

#### 依頼 4 — 妥当性の検証（何が間違っているか）

**4つの依頼の中で最も価値が高い。**

- §6・§7 の提案の**欠陥・誤り・危険**
- §7.6 の失敗モード F1〜F21 に**漏れ**はないか（**F1〜F21 のどれよりも危険な失敗は存在しないか**）
- §3.6 の適格条件、§7.7 の段階戦略・部分成功の定義の妥当性
- **「この設計では成功しない」という結論**も、根拠があれば歓迎する

### 0.3 回答の形式

**次の表形式で返してほしい。1行が1つの指摘である。**

| # | 依頼 | 対象節 | 指摘（1文） | 根拠・実績 | 提案する変更 | 確信度 |
|---|---|---|---|---|---|---|
| 1 | 4 | §6.2 R2 | 実行時結合の実測が無く、DI 経由の依存が落ちる | （文献・実務経験） | R2 に ◯◯ を追加 | 高 |
| 2 | 1 | §7.2 (c) | ◯◯ が抜けている | | | 中 |

- **確信度**は `高 / 中 / 低 / 未検証` で明記する。**「未検証」を未検証と書いてくれることが、もっともらしい断定より価値が高い**
- 長さは問わない。**1つの確信ある指摘のほうが、網羅的な一般論より価値がある**
- 文献・実装・事例への参照があれば添えてほしい

### 0.4 求めていないもの

| 求めていない | 理由 |
|---|---|
| **設計の全面的な書き直し** | 改善を求めている。置換ではない。**順回転（既存の4層ループ）は壊せない** |
| **一般論・教科書的な説明** | この文書を読めば分かることは不要。**この設計に固有の指摘**を求める |
| **賞賛** | 判断材料にならない |
| **実装コードそのもの** | 求めているのは設計判断である |
| **「検討します」で終わる回答** | 何をどう変えるべきかまで書いてほしい |

### 0.5 時間が限られている場合の優先順位

1. **依頼 4**（欠陥の指摘）— 最も価値が高い
2. **依頼 1**（我々が見落としている手法）
3. **依頼 2**（配置）
4. **依頼 3**（判断支援）

### 0.6 前提として必ず読むべき節

誤解したまま提案されると噛み合わない箇所を挙げる。

| 節 | なぜ必須か |
|---|---|
| **§3.3** | 「成功の判定は人間が行う」。ここを機械化可能と誤解すると、提案の方向が根本的にずれる |
| **§4.5** | 設計原理（決定論の極大化・非決定論の極小化・給仕の極大化）。**すべての提案はこの原理と整合している必要がある** |
| **§6.0** | 順回転を壊さないための不変条件。回避策を提案する場合はこれを前提にすること |
| **§6.2** | R0〜R8 の現状。配置を論じる土台 |
| **§7.1** | 我々が**既に認識している**穴。ここに挙げたものを再度指摘する必要はない |

> **§7.5 と §7.8 は、本節の依頼を別の角度から具体化したものである。** §7.5 は依頼 1〜4 の要約、§7.8 は依頼 4 を中心としたチェックリストになっている。**依頼の本体は本節（§0）である。**

### 0.7 第1ラウンドは完了している（第2ラウンド以降の読者へ）

**2名の専門家による第1ラウンドのレビューは完了し、その結果は本文に反映済みである。**

| 参照先 | 内容 |
|---|---|
| **11章** | 採用33項目／修正4項目／却下・保留6項目の記録、**専門家が対立した論点とその裁定**、実装側が独自に追加した判断 |
| **6.12節** | 対立点の技術的な裁定（不確実性をどこに置くか） |
| **6.13節** | 確定した実装フェーズ **Phase −1〜4**（Phase −1 は計画の基盤固め） |
| **6.14節** | **新設ゲートの受け入れ基準**（何を検出したら FAIL か） |
| **11.9節** | **計画自体の自己監査**で発見した6つの欠陥と対処 |
| **11.5節** | 第1ラウンドで残った**7つの論点とその解決**（R-1〜R-7） |

**0.2 の依頼 1〜4 は引き続き有効である。** ただし**11.2〜11.4 で既に採用・却下した内容を再度指摘する必要はない。**

第2ラウンドで優先してほしいのは次の2つである。

1. **11.5 節の解決（R-1〜R-7）そのものへの批判** — これらは我々が今回新たに確定した設計判断であり、**まだ外部の検証を受けていない**。とくに **R-1（動的解析を命題の分類で決める）** と **R-3（PBT 自動生成の範囲限定）** は、実務での妥当性を確認したい
2. **11.2〜11.4 に無い新しい視点** — とくに**我々が挙げていない手法**と、**この設計では成功しないという具体的な反論**

---

## 1. 背景 — conver とは何か

### 1.1 解こうとしている課題

ソフトウェアは「一度作って完成」ではない。市場が変化するたびに、機能追加・方向転換・新要件対応という形で**開発へ再投資**し続けなければならない。長期開発で最も恐ろしいのは、**変化がシステムを矛盾だらけにすること**である。過去の設計判断がどこに記録されたか分からなくなり、実装が設計から乖離し、テストが嘘をつき始める。そうなると再投資はリスクにしかならず、ビジネスは変化を諦めるか、破壊的な作り直しを強いられる。

conver はこれを、**「正典 RFC」を中心とした4つのループ**で解決する。Claude Code 上で動作する強力なスラッシュコマンドハーネスの総体である。

### 1.2 4つのループ

| ループ | 実行者 | コマンド | 責務 |
|---|---|---|---|
| **上流ループ（分解）** | 人間＋AI | `/grill-me-for-rfc` → `/graphify-rfc` → `/boundify-graph` → `/split-to-tickets` | 正典 RFC を書く → 論理グラフ化 → ディレクトリ境界生成 → チケット分解 |
| **実装ループ（収束）** | **AI 自動**（`conver.js` が ACP 経由で駆動） | `/make-ticket` → `/plan-ticket` → `/start-ticket` → `/review-ticket` → `/resolve-ticket` → `/consolidate-stubs` → `/find-omissions` | チケット実装 → 品質検証 → スタブ解決 → 契約ギャップ計測 → 収束 |
| **出荷ループ（商品化判定）** | 人間＋AI | `/crystalize-readme` | 使い方 README をセクション単位で「ユーザーにとって素敵か」判定。書けない部分を RESIDUE として残す |
| **進化ループ（再投資）** | 人間＋AI | `/drill-rfc-down` | RESIDUE／会話／資料を grill で確定し、RFC・GRAPH・Dirs-Tree・Tickets を**差分**として矛盾なく更新 |

### 1.3 収束の設計思想 — 3種のギャップを、3つの計測器で分ける

**RFC 設計書が正典（canon）である。** 実装ループはチケット単位で実装を RFC に近づけ、`/find-omissions` が「設計と実装のギャップ」を計測する。

| ギャップの起因 | 計測器 | 対処 | ループ |
|---|---|---|---|
| **実装起因**（契約がテストに翻訳されていない、未実装、バグ） | `/find-omissions` | omission チケットとして `Tickets.json` にマージ → 再実装 | 実装ループ内 |
| **商品起因**（「ユーザーにとって素敵な使い方」として不完全・危険・欠落） | `/crystalize-readme` | README に RESIDUE として記録 → `/drill-rfc-down` がチケット化 | 出荷ループ経由 |
| **設計起因**（RFC 自体の考慮不足、市場変化による進化要求） | `/drill-rfc-down`（grill） | 正典 RFC・GRAPH・Dirs-Tree・Tickets を差分更新 | 進化ループ経由 |

### 1.4 再投資可能性 — 5つの整合性

**再投資可能性（reinvestment capability）** とは、ビジネスが市場変化に応じて**何度でも安全に開発へ再投資できる**構造のことである。その安全性は、次の5つの整合性が**同時に**満たされることで成り立つ。

| # | 整合性 |
|---|---|
| 1 | **正典 RFC が安全に変化・進化できる**（変化の起点は常に RFC、grill で設計判断として確定・追跡される） |
| 2 | **グラフ（`*-GRAPH.json`）に一切の矛盾を発生させない** |
| 3 | **グラフを実体化した Dirs-Tree（`*-Dirs-Tree.json`）に一切の矛盾を発生させない** |
| 4 | **実装が以上と完全に一致する** |
| 5 | **テストコードがそれを完全に保証する** |

**進化とはこれら5つを壊すことではなく、全てをロックステップで一段上げること**である。

### 1.5 順回転の大前提

**4つのループはすべて「正典 RFC が既に根元に存在する」ことを前提にしている。** これが順回転（forward rotation）の大前提であり、同時に**最大の制約**である。RFC が無ければ、graphify も boundify も split も、ましてや収束判定も始まらない。

### 1.6 初出語の定義 — 読者が最初に押さえるべき登場人物

以降を読み進めるために必要な最小限の語をここで定義する。網羅的な用語集は第10章にある。

| 語 | 定義 |
|---|---|
| **チケット（ticket）** | 実装の最小単位。`Tickets.json` に `P{phaseID}-{ticketID}` の複合キーで格納される |
| **フェーズ（phase）** | 依存関係に基づいてチケットを束ねた実装の段階。重み付きトポロジカルソートと SCC 縮約で機械的に決まる。3 チケット未満のフェーズは後方へ自動マージされる |
| **`Tickets.json`** | 実装ループの**単一情報源**。`phases[] → tickets[]` の構造を持ち、各チケットが `status`（`todo` → `made` → `planned` → `done` → `reviewed`）を遷移する |
| **契約（Contract）** | ノード間の I/O 境界に付与される **Precondition / Postcondition / Invariant**。`/graphify-rfc` がグラフのエッジに annotation として付ける |
| **`*-GRAPH.json`** | RFC を I/O 境界単位の細粒度ノード（`N0001`〜）と属性付きエッジに分割した論理グラフ。**常にチケット粒度より細かく分割（発散）**し、後段のコマンドが粗い粒度で束ね直す |
| **`*-Dirs-Tree.json`** | グラフを物理ディレクトリ境界へ写したもの。`languageRules` による言語別可視性を持つ |
| **spec** | `/make-ticket` が作るチケット単位の実装仕様書（`specs/P{id}-{n}.md`）。契約を**テスト可能な形へ翻訳**した内容を含む |
| **omission** | `/find-omissions` が検出する「契約がテストへ正しく翻訳されていない」ギャップ。`Tickets.json` にマージされ、実装ループへ戻る |
| **RESIDUE** | `/crystalize-readme` が README 内に残す「書けないセクション」。**「なぜ書けないか」のメモではなく、実装を補強するためのチケットの素材**である |
| **residual** | workspacify の self-grill が解けなかった問い。`grill_question` を伴い、**後段の人間 grill へ構造化して引き継がれる** |
| **`[::STUB::]`** | 不完全実装を示す必須マーカー。`Malfeasance.json` に記録され、解決するまで次の工程に進めない（conver の第一級規則） |

> **注意**: conver は「契約 → テスト」の翻訳を**機械的に計測**する。したがって契約は、**テスト可能な形に翻訳できない限り仕様として未完成**とみなされる。この厳格さが、後述する逆回転の難しさの源泉でもある（**逆回転では、この翻訳が「既に済んでいる」ように見えてしまう**）。

---

## 2. 第五層 — workspacify とは何か

### 2.1 位置づけ

`/workspacify-tree` と `/workspacify-allocate` は、4つのループを**包み込む外殻**である。ループ間の辺ではなく、**第5層**にあたる。

4ループが「1つのモジュール内の設計と実装」を扱うのに対し、workspacify は**「仕様書全体を、どのモジュールにどう切るか」**を決め、その**切断面（結合契約）を機械可読な形で確定させる**。

```
spec.md ─[/workspacify-tree]→ WORKSPACIFY-TREE-MANIFEST.json      (stage 1: 分割設計)
                                      │
        [/workspacify-allocate]→ 実ディレクトリ + 各pkg/RFC-SEED.md
                                  + WORKSPACIFY-ALLOCATE-MANIFEST.json (stage 2: 実体化)
                                      │
                    以後は 各ディレクトリで 4ループ:
                    /grill-me-for-rfc → /graphify-rfc → /boundify-graph → /split-to-tickets
                      → 実装ループ → /crystalize-readme → /drill-rfc-down
```

### 2.2 `/workspacify-tree`（stage one）

- **入力**: Markdown 仕様書 1枚のみ（ATX 見出しを1つ以上含む）
- **出力**: カレントディレクトリに `WORKSPACIFY-TREE-MANIFEST.json`（**単一の正典**）
- **6 Step**: `parse`(G0/G1 入力ロック) → `extract`(G2 候補ハーベスト) → decision JSON 執筆 → `gate`(G3/G4 自己修復ループ) → `finalize`(G5 原子的公開) → report
- **ゲート階層**: G0 入力ロック → G1 構造 → G2 要求インベントリ → G3 ワークスペース（カタログ／owner 一意性／過分割／必須責務）→ G4 依存（DAG／層規則／循環／**実装順序の証明**）→ G5 成果物完全性。**親が PASS でない子は決して PASS にならない**

### 2.3 `/workspacify-allocate`（stage two）

- **入力**: stage one の manifest のみ（**受け取った証明済み素材を再計算・再解釈しない**）
- **出力は3種のみ**: 実ディレクトリツリー / 各パッケージの `RFC-SEED.md` / `WORKSPACIFY-ALLOCATE-MANIFEST.json`
- **ゲート階層**: G0 入力ロック → G2 転送基礎・安全性 → G3 seed レンダ・局所検査 → **G3.7 self-grill と residual の到達** → G4 双方向契約 → G5 **WIG**（Workspace Integration Graph: 誰も履行できない結合・二重 owner・二重変更・検証者なき証明を違反として検出）＋実装順序 → G6 公開・reload・cleanup
- **`RFC-SEED.md`** は完成 RFC ではなく `/grill-me-for-rfc` の**種**。14見出し固定で、**§1（Identity/Position）と §2（Coupling Contracts）は機械注入 — AI は書けない**

**self-grill（G3.7）** は最重要の機構である。AI が自分自身を敵対的に5焦点（`implementer` / `counterpart` / `test` / `grill` / `adversarial`）でレビューし、**最終パスで findings が 0 になるまで収束**させる。解けなかった問いだけが residual となり、後段の**人間 grill へ構造化して引き継がれる**。`TODO` / `TBD` / `ask the human` / `waiting for approval` 等は**全文禁止**（人間への差し戻し表現を機械が拒否する）。

### 2.4 順回転が物理的に保証しているもの

| 保証 | 実装 |
|---|---|
| **何も存在しないこと** | `fresh-workspace only`。既存パスがあれば **BLOCKED**。マージ・上書き・削除をしない |
| **壊れない公開** | temp → fsync → read-back → rename の原子的公開 |
| **片側バイパスの不在** | stage one の finalize が **stage two の entry gate をそのまま呼ぶ**（同一述語・二重ゲート） |
| **AI の承認なき COMPLETE の不在** | `semantic_review.status === "APPROVED"` が無ければ機械は COMPLETE を出さない |

### 2.5 三層の境界 — 機械 / AI / 人間

| 層 | 担うもの | 性質 |
|---|---|---|
| **機械** | 解析・確定判断・検証・**給仕** | 決定論。極限まで拡大する |
| **AI** | 意味論的・非決定論的な理解・解釈・判断 | **面積を極小化**し、材料を最大化する |
| **人間** | **パイプラインが成功したかどうかの最終判定** | **機械的判定を放棄する** |

既存の設計は「**決定論で確定できることはスクリプトが確定判断を下し、AI はその結論を受け入れるのみ。非決定論が不可欠なことだけを AI が判断する（ただし決定論の結果を制約として与える）**」という原則で貫かれている。加えて重要なのは、**過剰機械化の回避**である。抽出器は候補のハーベストまで、検証器は制約の確認まで、境界レビューは「リスク候補の発見」までしか行わない。

### 2.6 workspacify の入出力の具体形

配置を批判するには、**現在の成果物が実際にどのような形をしているか**を知る必要がある。以下は実装済みスキーマに基づく主要フィールドである。

**`WORKSPACIFY-TREE-MANIFEST.json`（stage one の成果物・単一の正典）**

| フィールド | 内容 |
|---|---|
| `artifact_kind` / `schema_version` / `status` | `workspacify-tree-manifest` / バージョン / `COMPLETE` |
| `input` | `{ path, source_hash }` — 入力仕様書とその SHA-256。**以後の全段が entry gate でこのハッシュを再検証する** |
| `workspace[]` | パッケージ配列。`id` / `name` / `path` / `layer`（`foundation` / `protocol` / `ports` / `adapters` / `core` / `interfaces` / `conformance`）/ `kind` / `responsibilities`（非空必須）/ `seed_required` / `owns`（`objects` / `claims` / `invariants` / `state_machines` / `error_codes` / `required_tests`） |
| `tree[]` | ディレクトリツリー。**葉ディレクトリのパス集合がパッケージのパス集合と一致**することが必須 |
| `ownership[]` | `{ objectId, packageId }` — 候補の一意な所有者。全カテゴリで `unallocated == 0` が要求される |
| `dependencies[]` | `{ from, to, reasonCode, reason }`。**`reasonCode` は 26 語の閉じた語彙**（`canonical-value` / `merkle-proof` / `payment-settlement` 等）から選ぶ。語彙外は G4 が拒否する |
| `boundaries[]` | 依存エッジと1対1に対応する契約境界。**エッジと境界の双方向カバレッジが強制される**（片側宣言は通らない） |
| `adapters` | `ports` と `databasePolicy`（RDBMS 永続化が必要な場合のみ `applicable: true`）。生 SQL と DB 型の漏洩は機械検出される |
| `implementation_order` | `{ serial, levels }` — **provider が consumer より前**。DAG の循環数は 0 でなければならない |
| `stage2_handoff` | stage two へ渡す証明済み素材（`contract_boundaries` / `residual_questions` / `eligible`） |
| `semantic_review` | `{ status: "APPROVED", statement, approver }` — **無ければ機械は COMPLETE を出さない** |
| `final_audit` | 各カウント（`unallocated_count` / `ownership_disagreement_count` / `cycle_count` / `raw_sql_count` …）。**FAIL の原因はここに数値で現れる** |

**`WORKSPACIFY-ALLOCATE-MANIFEST.json`（stage two の機械最終権威）**

| フィールド | 内容 |
|---|---|
| `input_tree_manifest` | `{ path, hash, spec: { path, sha256 } }` — 証明済みの stage one 成果物 |
| `seed_index[]` | `{ package, path, sha256 }` — 公開された全 seed |
| `source_coverage` | `segments_total` / `segments_covered` / `material_segments` / `non_material_segments` / `uncovered`（**常に空**） |
| `contract_registry[]` | 検証済みの結合契約（`contract_id` / `boundary_id` / `consumer` / `provider` / `connection_kind` / `owners` / `clauses` / `source_refs`） |
| `wig` | `summary`（層別・種別のノード/エッジ数）/ `counts` / `hash` / `violations`（**常に空**） |
| `implementation_order` | stage one の証明と一致することが検証される |
| `self_grill` | `passes` / `converged` / `focuses` / `rounds[]`（pass, focus, status, finding_count）/ `residual_count` |
| `handoff_summary` | 人間 grill への引き継ぎ。`unresolved[]` / `grill_questions[]` / `risky_boundaries[]` |
| `integrity` | 正規化方式 / ハッシュアルゴリズム / `manifest_hash`（自己ハッシュ）/ `reload_validation` |

**`RFC-SEED.md` の14見出し（固定順）**

```text
§1  Identity and Position in the Whole System      <- 機械注入
§2  Coupling Contracts (I/O Boundary)              <- 機械注入
§3  Source Coverage and Allocation Index           <- 機械注入
§4  In-Scope Objects, Claims, Predicates, State and Invariants
§5  Incoming Dependencies and Consumer Obligations
§6  Outgoing Provider Obligations
§7  State Ownership and State-Transition Material
§8  Side-Effect and External-I/O Boundaries
§9  Canonicalization, Signatures and Proof Responsibilities
§10 Failure, Rejection, Recovery and Finality Material
§11 Required Unit, Integration, Exception and Malfeasance Test Material
§12 Grill Questions and Explicitly Unresolved Design Choices
§13 Forbidden Dependencies, Non-Interference Boundaries and Non-Goals
§14 Source Traceability Index                      <- 機械注入
```

§3 の **Allocation Index** は、manifest の所有者割当と**全パッケージ横断の全単射**（欠落 0 / 重複 0 / 未知 0 / 他 seed への漏洩 0）であることが機械検証される唯一の表である。**自パッケージが所有する項目だけを載せる**：

```markdown
| Category | Inventory ID | Canonical Name |
| --- | --- | --- |
| object | obj-000001 | Alpha Record |
| invariant | inv-1 | alpha-invariant |
```

### 2.7 既存実装の現物構成 — どこに何を足すのか

**具体的な提案をするには、現時点の実装の姿が必要である。**

**`/workspacify-tree`（`.claude/scripts/workspacify-tree/`）**

| 種別 | ファイル |
|---|---|
| エントリ | `run.mjs`（サブコマンド: `parse` / `extract` / `gate` / `finalize`） |
| スキーマ | `schemas/workspacify-tree-manifest.schema.json` / `schemas/workspacify-tree-decisions.schema.json` |
| 入力・正規化 | `lib/normalization.mjs` / `lib/hash.mjs` / `lib/headings.mjs` / `lib/segmentation.mjs` / `lib/markdown.mjs` |
| 抽出・在庫 | `lib/extraction.mjs` / `lib/inventory-report.mjs` / `lib/traceability.mjs` |
| モデル | `lib/workspace-model.mjs` / `lib/ownership.mjs` / `lib/segment-ownership.mjs` / `lib/dependencies.mjs` / `lib/dag.mjs` |
| 境界・契約 | `lib/boundary-review.mjs` / `lib/contract-clauses.mjs` / `lib/dependency-review.mjs` / `lib/spec-pulse.mjs` / `lib/spec-defects.mjs` |
| 決定入力 | `lib/decision-input.mjs` / `lib/decision-apply.mjs` / `lib/entry-parity.mjs` |
| ポリシー | `lib/adapters.mjs` / `lib/database-policy.mjs` / `lib/alias-normalization.mjs` |
| 出力 | `lib/render.mjs` / `lib/report.mjs` / `lib/canonical-json.mjs` / `lib/manifest-schema.mjs` |
| 安全・助言 | `lib/fs-safe.mjs` / `lib/atomic-publish.mjs` / `lib/gate-advice.mjs` / `lib/errors.mjs` / `lib/validation.mjs` |

**`/workspacify-allocate`（`.claude/scripts/workspacify-allocate/`）**

| 種別 | ファイル |
|---|---|
| エントリ | `run.mjs`（`validate` / `plan` / `packet` / `gate` / `finalize`）、`publish-allocate-manifest.mjs`、`walk-seed-contracts.mjs`、`cleanup-workspace-artifacts.mjs` |
| スキーマ | `schemas/workspacify-allocate-decisions.schema.json` |
| 入力検証 | `lib/tree-manifest-input.mjs` / `lib/manifest-format.mjs` |
| 計画・安全 | `lib/directory-plan.mjs` / `lib/path-safety.mjs` / `lib/tree-staging.mjs` |
| seed | `lib/seed-model.mjs` / `lib/seed-render.mjs` / `lib/seed-parse.mjs` / `lib/seed-parity.mjs` / `lib/seed-local-checks.mjs` / `lib/seed-authoring-packet.mjs` / `lib/reference-block.mjs` |
| 契約・証明 | `lib/contract-model.mjs` / `lib/contract-gate.mjs` / `lib/coverage-proof.mjs` / `lib/wig.mjs` / `lib/implementation-order.mjs` |
| self-grill | `lib/self-grill.mjs` |
| 公開・再検証 | `lib/allocate-manifest.mjs` / `lib/allocate-reload.mjs` / `lib/allocation-model.mjs` |

> **専門家への示唆**: 逆回転で最も重い追加は `/workspacify-reverse`（**新規ディレクトリ**）に集中する。既存2コマンドへの変更は、`mode === "reverse"` の分岐と新ゲートの追加に留めるのが、順回転保護の観点から安全である。**既存の `lib/` は「計測器」としてよく整備されており、逆回転で不足するのは主に「材料屋」の層である。**

---

## 3. 逆回転が必要な理由

### 3.1 順回転の入口が閉じている

| コマンド | 現行の入力要件 | 既存プロジェクトに対して |
|---|---|---|
| `/workspacify-tree` | **ATX 見出しを含む Markdown 仕様書** | そんな文書は存在しない |
| `/workspacify-allocate` | **fresh-workspace only**（既存パスは BLOCKED） | **原理的に通れない** |

つまり、**既に実装が進んだプロジェクト**は、conver の恩恵を一切受けられない。これが逆回転を必要とする理由である。

### 3.2 逆回転の全流れ

```
/workspacify-reverse      ← 新設。既存プロジェクトを解析し ORIGIN-LONG-SPEC.{json,md} を生成
  → /workspacify-tree     ← リバースモード。既存ディレクトリ構造を完全に守って TREE-MANIFEST を生成
  → /workspacify-allocate ← リバースモード。既存構造を守り、全ディレクトリに RFC-SEED.md を配置
  → /grill-me-for-rfc     ← RFC-SEED から、既存実装を完全に踏まえた正典 RFC をディレクトリ単位で作成
  → /graphify-rfc
  → /boundify-graph
  → /split-to-tickets
  → { /make-ticket → /plan-ticket → /start-ticket → /review-ticket
      → /resolve-ticket → /consolidate-stubs → /find-omissions }
  → /crystalize-readme
  → /drill-rfc-down
```

**順回転は既に完全に機能している。逆回転の実装は順回転を破壊してはならない。**

### 3.3 逆回転の成功条件は「RESIDUE 0」であり、それは人間が判断する

`/crystalize-readme` の **RESIDUE が 0** になることが成功条件である。これは**ループを複数回回したうえで、人間が確認する以外に到達手段がない**。

`/find-omissions` の omission 0 は**成功条件ではない**。omission は自動ではほぼ到達せず、**人間が「このまま `/crystalize-readme` へ入るか」を判断する材料**（示唆）である。これは conver の手動訓練の心得——「**2周目が必要かどうかを AI に判断させるな。人間が完全に判断せよ**」——と同じ思想である。

> **したがって、リバースエンジニアリングの成否を機械が判定するゲートを作ってはならない。**
> 機械が出してよいのは「**証明できた / 証明できなかった**」だけであり、「**成功した / 失敗した**」は機械の語彙ではない。既存の `REVIEW_REQUIRED` / `BLOCKED` は「成否の判定」ではなく「**機械が、証明できないことを証明したふりをしない**」という規律として理解する。

### 3.4 「追認 RFC」という最大の失敗モード

逆回転で最も陥りやすい失敗は、**既存コードを文章化しただけの追認 RFC** を生成してしまうことである。そうすると5つの整合性は表面上すべて成立するが、`/find-omissions` は**循環論法で全通過**する。これは conver の最高法規が禁じる**偽の green** そのものである。

逆回転に本当に要求されるのは「実装と一致する RFC を書く」ことではなく、**「実装の正しさを判定できる規範的 RFC を再建する」**ことである。説明のつかない既存挙動は、黙って追認せず **omission / RESIDUE として露出させる**。

### 3.5 Red の再建 — 逆回転に固有の最深の論点

conver の最高法規は「**red 無き green は違反**」「偶然 green になったテストは無効」と定める。しかし**既存実装のテストは最初から green である**。したがって逆回転では、`/start-ticket` の Red フェーズが要求する「実装が無いから失敗する」という証拠を、**遡って生成し直さなければならない**。

既存アーキテクチャに唯一の同型物がある——`/find-omissions` の **B基準（違反検出：違反を注入したら必ず失敗するか）** である。逆回転では、**違反注入／mutation によって red を再証明する工程**を実装ループに組み込まねばならない。これが無ければ、リバースエンジニアリングから始めた全体が**最初から偽の green** になる。

### 3.6 逆回転の適格条件 — どういうプロジェクトなら成立しうるか

**すべてのプロジェクトが逆回転の対象になるわけではない。** 成功率が極めて低いという事実を踏まえ、**着手前に適格性を評価すべきである**。

**適格の必要条件（1つでも欠ければ成功率は大きく下がる）**

| 条件 | 理由 |
|---|---|
| **ビルドできる** | ビルドできないプロジェクトは、依存関係も公開面も機械的に確定できない |
| **テストが存在し、実行できる** | テストが無ければ Red 再建の土台が無く、契約の裏付けをゼロから作ることになる |
| **git 履歴が存在する** | 「意図か偶然か」の判別材料（`git blame` / 共同変更 / コミットメッセージ）が失われる |
| **主要言語が解析可能** | SCIP / Tree-sitter / LSP / 各言語の型基盤を持つ言語（Rust / Go / TypeScript / Java / Python 等） |
| **ディレクトリ構造に意味がある** | 完全に平坦、または全面的に自動生成された構造では、境界の推定が原理的に不可能 |
| **ドキュメント・コメントが何らか残っている** | 「なぜ」の手がかりがゼロだと、AI の判断がすべて推測になる |

**危険信号（該当が多いほど、ゼロからの作り直しを選ぶべき可能性が高い）**

- テストが無い、または通らない
- 履歴が無い（スカッシュ済み、別 VCS からの移行）
- コード生成物がコードベースの大半を占める
- 動的言語 + メタプログラミング（reflection / eval / DI コンテナ）が支配的
- 業務知識が特定の個人に閉じている
- 大規模すぎて、機械的解析のコストが現実的でない

> **この評価自体を機械化し、`/workspacify-reverse` の R0 で提示すべきである。** 繰り返すが、これは「成功するかどうかの判定」ではない——**人間が着手可否を判断するための材料**である（3.3節）。9章の設計問題 6（スコープの動的縮小）と 7.7 節（段階的戦略）を参照。

---

## 4. なぜこれほど困難か

### 4.1 人間のプロでも成功率が極めて低い

リバースエンジニアリングは、プロの現場でも**最も成功率が低い挑戦の一つ**である。事実、ほとんどのケースでは**リバースエンジニアリングを成功させることを諦め、新規にゼロから作り直すことが選択される**。

### 4.2 順方向と逆方向の非対称性

| | 順方向（既に機能） | 逆方向（これから作る） |
|---|---|---|
| 起点 | spec.md（規範テキスト） | **既存実装のみ（src / tests / git 履歴 / 設定 / ドキュメント）** |
| RFC | **公理**として与えられる | **推認**しなければならない（演繹ではなく**アブダクション**） |
| graphify / boundify / split | RFC から**機械的に導出** | 既存ディレクトリ構造に一致するよう**逆算** |
| プロベナンス | 構成によって証明される | **既に切れている。復元は不可能**。張り直すしかない |
| 正しさの基準 | RFC との一致 | **RFC 自身の妥当性**を誰も保証していない |

逆回転は「既存スクリプトを逆順に回す」ことではない。**起源が欠落した証明の鎖を張り直す（再証明する）**作業である。

### 4.3 コードは「なぜ」を語らない

コードは「何をしているか」を語るが、「**なぜそうなっているか**」を語らない。しかも：

- 意図的な設計判断と、歴史的偶然の産物が、**同じ見た目**をしている
- 動的ディスパッチ、reflection、DI、コード生成、マクロ、feature flag、環境変数、非同期キュー、plugin は**静的検索だけで欠落しやすい**
- コメントは嘘をつく。テストは仕様の一部しか写していない。コミットメッセージは当時の文脈を欠く

### 4.4 判断面積が広すぎると AI は失敗する

**AI が如何に賢いエンジニアリングエキスパートであろうとも、AI 自身が判断しなければならない領域が多すぎれば失敗する。** これは逆回転の成否を分ける中心的命題である。

### 4.5 設計原理

> **機械的に解析可能な部分は極限までスクリプトに機械的に解析させる。**
> **エンジニアリングエキスパートとして AI が非決定論的・意味論的に高度な理解・解釈・判断をしなければならない部分だけを AI に思考させる。**
> **さらに、その残った判断領域に対して、高度な解析スクリプトが十分な情報提供を極めて親切に行えるように張り巡らせる。**

すなわち成否を分けるのは「AI の賢さ」ではなく、**AI に残る判断の面積をどれだけ削り、残った面積にどれだけ濃い材料を供給できるか**である。

**スクリプトの役割は二重である**：

- **計測器** — 決定論的に**確定判断を下す**（owner 一意性、循環、パス一致、ハッシュ、網羅性…）。AI はその結論を受け入れるのみ
- **材料屋** — 非決定論的判断の**直前で、その判断に必要な情報を親切に差し出す**

前者だけのスクリプトは「AI を検査するが育てない」。逆回転では**後者の質が成否を決める**。なぜなら**既存コードは沈黙しており、文脈（なぜそうなっているか）が失われている**ので、掘り起こして差し出す量と質が、そのまま AI の判断品質になるからである。

### 4.6 リバースエンジニアリング自身の成否判定は人間の仕事

**`/crystalize-readme` の RESIDUE 0 は、ループを複数回回して人間が確認する以外に方法がない。機械的判定は諦める。**

したがって今回の実装が完全集中すべきは、**「成功を証明する装置」ではなく「人間が成功を判断できるようにする装置」**を作ることである。具体的には：

1. **決定論的解析の極大化** — 既存プロジェクトから機械的に取り出せるものは、構造・依存・契約・不変条件・テスト・状態遷移・エラー・所有者候補・証拠に至るまで**残らず**取り出す
2. **AI の判断面積の極小化** — 機械が確定できる判断を AI に渡さない
3. **残った判断面積への給仕の極大化** — 判断の直前に必要な材料を極めて親切に差し出す
4. **既存ツリーの絶対不可侵** — 破壊しない。追加は `RFC-SEED.md` と manifest のみ

---

## 5. 出力形式の原則（重要）

### 5.1 JSON と Markdown の使い分け

**JSON は AI にとっても読みにくい。** 形式は「AI が読んで判断する」という用途から逆算して選ぶ。

| 用途 | 形式 | 理由 |
|---|---|---|
| 他スクリプトが消費する／スキーマ検証する／ハッシュを取る／ゲートの述語になる | **JSON** | **構造的な理由がある場合のみ** |
| **AI が読んで理解・解釈・判断する** | **Markdown + 意味論を含む自然言語の英語。極めて親切に** | これが原則 |

### 5.2 「極めて親切」の定義

出力は、読んだ AI が**そのまま判断に入れる**ものでなければならない。次を含む：

- 何を見つけたか
- どこに証拠があるか（`file:line` / `sha256` は prose の中に埋め込む）
- **なぜそれが重要か**
- **何が判断を要するか**
- どんな選択肢があり、それぞれ何が起きるか
- 何が未解決で、誰に渡るのか

例：

> `src/auth` holds 2 invariants and receives 14 inbound references from 3 directories; it reads as a boundary. However, the call into `src/db` crosses from protocol into adapter without a port. Decide whether this is an intended layering or an accident of history — the git history shows it was introduced in a single commit with no design note.

これは**テンプレート＋抽出語彙で機械的に生成できる**。意味論的**判断**は AI の領分だが、**判断材料の提示は意味論を含んでよい**。

### 5.3 既存アーキテクチャに先例がある

各ゲートが失敗時に stderr へ出す **`[guide]`（何が問題か / なぜ重要か / どう直すか）** がまさにこの思想である。これを「失敗時の例外」ではなく、**全 AI 向け出力に一般化する**。

### 5.4 evidence の必須化

- 全ての解析結果は `file:line` と `sha256` を持ち、**R0 の tree hash に紐づく**
- 陳腐化した証拠（索引後に変更されたファイル）を検出する
- 機械可読が必要な箇所のみ sidecar JSON を併置する

### 5.5 provenance 4値

逆回転で生まれる全ての記述は、次のいずれかに分類され、**その分類自体が機械検証される**：

| 分類 | 意味 | 必須 | 出所 |
|---|---|---|---|
| `observed` | コードから機械的に確定した事実 | **evidence 必須** | 実装の観測 |
| `inferred` | AI の設計判断としての推認 | **根拠必須** | AI の判断 |
| **`normative`** | **規範として確定した命題** | **`normative_decision_id` 必須**（grill での選択記録） | **人間の選択** |
| `unresolved` | 判断できなかったもの | **`grill_question` 必須**（後段の人間 grill へ） | 保留 |

> **`normative` の追加が最重要である。** 「実装から観測された」は**規範ではない**。実装・テスト・コメント・履歴は同じ既存設計から派生しており、相互参照しても独立な規範根拠にはならない。規範へ昇格できるのは、**反証探索を受け、競合する証拠・未観測域・判断者を明示した命題だけ**である。

**規範条項の provenance 鎖（必須）**: 逆回転起点の RFC において、規範条項は次の鎖が途切れていてはならない。

```text
RFC clause → claim_id → normative_decision_id → residual_id
           → evidence_bundle_hash → evidence records
           → source / trace / test / history / config
```

**鎖の無い規範条項は `normative` に分類できない。** この検査は機械化される。

#### 5.5.1 各命題が最低限持つフィールド

| フィールド | 内容 |
|---|---|
| `claim_id` | 安定 ID |
| `claim_type` | `observed` / `inferred` / `normative` / `unresolved`。**`observed` はソーステキスト／構文木から読めた事実のみ**。実行時挙動・動的ディスパッチ先・生成後コードは、実行・ビルド・トレースの証拠なしには `observed` ではない（5.5.2節、`evidence_mode`） |
| `scope` | commit / 環境 / feature flag / tenant / API version / 時刻範囲 — **「常に成立」を AI が推測する余地を消す** |
| `support` | **強い系譜関係で折りたたんだ後の**独立成分の一覧（**証拠の本数ではない**。5.5.2 節） |
| `counterevidence` | 競合・反例・観測不能性 |
| `falsification` | **何を観測／変異すれば棄却されるか** |
| `review_state` | 未レビュー / 要専門家確認 / 承認済み / 撤回済み |
| `normative_authority` | 規範の場合のみ。役割・チームの安定 ID（**個人名ではない**） |

これは「AI に根拠を添えさせる」ためではない。**後から推論を再評価・撤回・更新し、規範と実装のずれを管理するためのデータモデルである。**

#### 5.5.2 証拠独立性 — 証拠の「本数」を数えない

**同じ実装を前提にした unit test・comment・README は、独立した3本の証拠ではない。** 同一原因から派生した証拠を独立と誤認することは、**偽の green の逆回転版**である（F11）。

> **訂正（2026-09-10、専門家の回答による）。** 旧版は `derivation_group` という**単一 ID** で「同じ原因から派生した証拠群」を表していた。**これは誤りである。** コード・テスト・コメントが同じ人間の同じ設計判断から生じたかは、ファイルの内容だけからは識別できない。機械が計算できるのは**観測可能な系譜の近似**だけであり、その差をスキーマ上で隠せば、誤った独立性判定が「証明」として扱われる。本節はしたがって、**系譜グラフと、明示的に保存される集計ポリシー**に置き換える。検証記録は `docs/ABOUT-ANALYSIS-TECH.md` §7 にある。

evidence は**ソースではなく、観測可能な系譜関係でグラフ化**する：

```json
{
  "evidence_id": "ev-test-77",
  "source_kind": "unit-test",
  "evidence_mode": "source_static",
  "source_span": { "file": "src/authz.rs", "line": 42 },
  "lineage_edges": [
    {
      "relation": "same_guard",
      "target": "ev-impl-31",
      "confidence": "high",
      "basis": ["src/authz.rs:42-46"]
    },
    {
      "relation": "same_commit",
      "target": "ev-readme-12",
      "confidence": "medium",
      "basis": ["git:<sha>"]
    }
  ],
  "independence_assessment": "unknown",
  "supports_claim_ids": ["clm-authz-delete-tenant-001"]
}
```

**関係の語彙は閉じており、強さが宣言されている。**

| 関係 | 意味 | 強さ | 集計での扱い |
|---|---|---|---|
| `same_syntax_span` | 同じ AST ノード・同じソース範囲 | 高 | 折りたたむ |
| `same_generator` | 同じ生成器・同じ入力・同じ生成ハッシュ | 高 | 折りたたむ |
| `same_commit` / `same_patch` | 同一コミット・同一 PR・同一 patch-id | 中 | 折りたたむ |
| `same_guard` / `same_error_path` | 同じ定義・同じ guard・同じ失敗経路を参照 | 中 | 折りたたむ |
| `similar_wording` | コメント・テスト名・docstring の類似 | 弱 | **自動では折りたたまない。** 人間レビューの候補に留める |

**証拠の本数は、強い関係で結ばれた連結成分を1票として数える。** この集計は `independence_policy` として evidence と一緒に保存する。**ポリシーと入力の辺を保存しておけば、後から人間が訂正できる。** ポリシーを暗黙にすれば、それがそのまま答えになってしまう。

`independence_assessment: "unknown"` は**正当な値であり、失敗ではない。** 二つの成果物が一つの設計判断に由来するかはファイル内容から計算できないのだから、**推測してそれを証明と呼ぶより、不明と記録するほうが正しい。**

**同一 PR で実装・テスト・README が同時に導入されたなら、それらを1グループとして扱う根拠にはなる。** ただし共同変更は同じ設計意図を証明しない。**`same_commit` は「独立でない」方向の根拠にはなるが、「独立である」ことの根拠にはならない。**

**さらに、`observed` はソーステキスト／構文木から読めた事実のみを指す。** 実行時挙動・動的ディスパッチ先・条件コンパイル後の構成・生成後コードは、実行・ビルド・トレースの証拠なしに `observed` ではない。したがって evidence は `evidence_mode`（`source_static` / `build_semantic` / `runtime_dynamic`）を必ず持つ。

---

## 6. 提案する解析スクリプトと配置

### 6.0 前提となる不変条件（順回転の保護）

| 不変条件 | 内容 |
|---|---|
| **モードは入力から決まる** | 既存入力に `mode` フィールドが無ければ `forward`。逆方向の分岐は全て `mode === "reverse"` の内側に閉じる |
| **加算のみ** | 既存出力のキー・順序・正規化を変えない。新規キーは逆方向時のみ出現 |
| **回帰の証明可能性** | 既存の順方向フィクスチャで、改修前後で `manifest_hash` が**バイト一致**することを回帰テストにする。これが「順回転を壊していない」の唯一の証明 |
| **モードの伝播** | `mode: "reverse"` と由来情報が `TREE-MANIFEST` → `ALLOCATE-MANIFEST` → `RFC-SEED.md §1`（機械注入）→ `/grill-me-for-rfc` と**途切れず伝播**し、各段で決定論的に再計算できる |
| **名前空間の分離** | 逆回転の状態は `analysis_state` / `evidence_state` / `claim_state` に置く。順回転の `status: COMPLETE` とは**フィールドを共有しない**（意味を再定義しない） |
| **`COMPLETE` の意味を変えない** | 逆回転 mode の TREE / ALLOCATE でも `COMPLETE` は「**入力パケットと成果物がスキーマ・ゲート・公開規律を満たした**」ことのみを意味する。「復元したアーキテクチャが正しい」「RFC が規範的に妥当」は意味しない |
| **`semantic_review` と `authority` を混同しない** | `semantic_review.status === "APPROVED"` は**成果物公開の構造条件**、`normative_authority` は**個別規範命題の出所**。**同一フィールドに統合してはならない** |
| **既存ゲートは reverse provenance を評価しない** | WIG・owner 一意性・依存 DAG・実装順序・seed parity・reload validation は、逆回転の provenance を**判定に用いない** |
| **provenance の欠落は FAIL にしない** | 逆回転 provenance の欠落は構造ゲートの FAIL ではなく、**`residual` または sidecar の `incomplete_for_scope`** として表現する |
| **manifest は構造完全性のみ** | reverse mode の manifest に追加してよいのは `reverse_provenance`（sidecar bundle hash と件数要約）のみ。**既存の `manifest_hash` の正規化・意味を変更しない** |

### 6.1 全体配置図

| 段 | 追加の性格 | 解析ロジックの量 |
|---|---|---|
| `/workspacify-reverse` | **全面新設** | **最大**（R0〜R8 ＋ 専門家レビューで追加した R0.5 / R2.5 / R3.5 / R5.5 / R6.5 の**14段**） |
| `/workspacify-tree` | リバースモード＋新ゲート4本 | 大 |
| `/workspacify-allocate` | リバースモード＋安全保証の反転＋packet 拡張 | 大 |
| `/grill-me-for-rfc` | 逆方向質問の機械生成 | 中 |
| `/graphify-rfc` | 実在ファイル接地検証＋契約突合 | 中 |
| `/boundify-graph` | 既存構造の保存＋ヘッダ後付け | 中 |
| `/split-to-tickets` | 既存テスト→チケット対応＋**Red 再建チケット生成** | 大 |
| 実装ループ以降 | 最小（Red 再建手順のみ） | 小 |

**重みは上流7段、特に `/workspacify-reverse` に集中する。**

### 6.2 `/workspacify-reverse`（新設）— R0〜R8

出力は `ORIGIN-LONG-SPEC.json` と、そこから機械生成される `ORIGIN-LONG-SPEC.md`（`/workspacify-tree` の正規入力形式）。

| 段 | スクリプト | 決定論 | 何を確定し、何を給仕するか |
|---|---|---|---|
| **R0 入力ロック** | `lock-project-root.mjs` | 100% | ルート境界の確定、除外規則（`.git`/`node_modules`/`target`/`dist`/`vendor`/生成物）、追跡/未追跡の区別、**tree hash**（以後の全 evidence の基準点） |
| | `classify-project.mjs` | 100% | 言語・ビルド系・パッケージマネージャ・テストフレームワーク・スキーマ系の同定 |
| **R0.5 解析スコープ確定** | `lock-analysis-scope.mjs` | 100% | 権限・ライセンス・対象 commit・サブモジュール、**秘密除外**、対象環境、外部送信方針を `ANALYSIS-SCOPE.json` に固定。**ここを固定しないと、以後の全 evidence の意味が変わる** |
| | `inventory-build-provenance.mjs` | 100% | lockfile / SBOM / ビルド定義 / コンテナ digest / 生成器 / コード生成入力を在庫化する。**解析対象が何から構成されたかを固定する**（F19） |
| **R1 構造実測** | `measure-tree.mjs` | 100% | 実測ディレクトリツリー・ファイル数・言語分布・行数・最終更新 |
| | `classify-artifacts.mjs` | 100% | 手書き／生成物／テスト／設定／スキーマ／マイグレーションの同定（生成物は以後の母集団から外す） |
| **R2 依存実測** | `extract-import-graph.mjs` | 100% | ファイル間依存の実測 |
| | `detect-cycles.mjs` | 100% | SCC 縮約と循環の全数列挙 |
| | `measure-cohesion.mjs` | 100% | ディレクトリ境界候補ごとの内部結合／外部結合、クラスタリング |
| | `extract-external-deps.mjs` | 100% | 外部依存の実測（lockfile 含む） |
| **R2.5 実行面の実測** | `inventory-execution-surface.mjs` | 90% | entrypoint・DI・reflection・plugin・feature flag・環境変数・scheduler・queue・RPC・sidecar・deployment・service discovery・外部 SaaS を列挙し `EXECUTION-SURFACE.json` を出す。**import グラフは実行結合を代表しない**（F4） |
| | `measure-dynamic-coupling.mjs` | 80% | 可能なら安全な代表 workload を実行し、trace / プロファイリングから**実行時の呼び出し関係**を実測。静的グラフとの**差分**を計測し、差の大きいモジュールを判断カードの**危険フラグ**として給仕する |
| | `inventory-config-space.mjs` | 100% | 設定スキーマ・環境変数・フラグ定義と参照・CI matrix・デプロイ manifest を抽出し、**各命題が有効な構成空間を限定**する |
| **R3 意味論素材** | `extract-public-api.mjs` | 100% | 公開面（export / public fn / 型シグネチャ）の実測 |
| | `extract-types.mjs` | 100% | 型・スキーマ・enum の実測 |
| | `extract-errors.mjs` | 100% | エラー型・エラーコード・例外の全数 |
| | `extract-guards.mjs` | 90% | precondition 痕跡（guard clause / assert / 入力検査） |
| | `extract-invariants.mjs` | 90% | invariant 痕跡（`assert!` / `debug_assert` / 不変条件コメント） |
| | `extract-state-machines.mjs` | 90% | 状態フィールド・遷移関数・enum 遷移の痕跡 |
| | `extract-effects.mjs` | 100% | 副作用・外部 I/O（ファイル／ネット／DB／時刻／乱数／env）の実測 |
| | `extract-tests.mjs` | 100% | テスト名・アサーション・対象・`@verifies` の実測 |
| | `extract-contract-candidates.mjs` | 80% | **給仕の核**。呼び出し境界ごとに pre/post/invariant の候補を証拠付きで差し出す。**guard / assert / error は「実装にある条件」であり、pre/post/invariant の区別を保証しない**（防御的チェック・性能最適化・暫定 workaround が同じ形で現れる）。よって候補は `observed` として保持し、**分類は反証・履歴・人間承認を経て確定する** |
| **R3.5 証拠の三角測量** | `build-claim-ledger.mjs` | 100% | 同一 claim に静的・動的・テスト・履歴・文書の evidence を束ね、**互いに独立か / 対象 scope が一致するか / 反例があるか**を記録して `CLAIM-LEDGER.json` を生成する。**追認の循環を構造的に検出する要**（F11） |
| | `measure-evidence-independence.mjs` | 100% | evidence を**生成因果でグループ化**し独立性を判定する。R7 packet に「独立 group 数」と「同起源の繰り返し」を表示する。**同じテスト由来の複数証拠を独立証拠として加算してはならない** |
| **R4 意図の考古学** | `mine-history.mjs` | 90% | git 変遷（生成・移動・削除）、変動頻度＝不安定領域、コミット種別分布、**共同変更（logical coupling）** |
| | `extract-rationale.mjs` | 80% | コメント／doc／ADR／CHANGELOG／TODO から「なぜ」を抽出 |
| | `recover-decision-provenance.mjs` | 80% | ADR・issue・PR・レビュー・障害報告・ランブックを**実装変更と結び**、決定候補と**決定されなかった代替案**を復元する。**commit message を設計意図の証明として扱ってはならない** |
| | `measure-history-quality.mjs` | 100% | `history_quality_profile` を出す。squash・mass reformat・vendoring・移植・秘匿会話による**共同変更の汚染度**を測り、命題単位で履歴証拠の信頼度を下げる（F5・F11） |
| **R5 欠落と矛盾** | `detect-dead-code.mjs` | 100% | 参照ゼロ・未使用 export |
| | `detect-untested-surface.mjs` | 100% | **テストの無い公開面＝Red 不在候補**（最重要） |
| | `detect-tautological-tests.mjs` | 90% | 循環論法・無意味アサーションの候補 |
| | `detect-comment-code-drift.mjs` | 80% | コメントと実装の矛盾候補 |
| | `inventory-stubs.mjs` | 100% | `[::STUB::]`／TODO／FIXME／空実装の全数 |
| | `detect-unobserved-surface.mjs` | 90% | **未観測の構成・経路・外部境界**を検出する。未観測の flag / tenant / 障害時 / 負荷時 / 旧 API 版を「存在しない」と扱うことを禁ずる（F12）。**gap が少ないことを品質・成功と解釈してはならない** |
| | `quarantine-suspicious-semantics.mjs` | 80% | エラーハンドリングの非対称性・デッドロック可能性等の code smell を検出し、**`observed` な仕様として確定させず `unresolved`（人間への residual）へ隔離**する。**既存のバグや未定義動作を正典化しない**（F21） |
| **R5.5 oracle の妥当性** | `classify-mutation-survivors.mjs` | 90% | mutation の生存原因を **equivalent mutant / 到達不能 / 観測点不足 / oracle 不足 / 入力不足 / 環境不足** に分類し `ORACLE-GAP.json` を出す。**mutation score を契約 coverage の証明と誤認しない**（F17）。**全体 mutation score の閾値で通過判定してはならない** |
| | `filter-equivalent-mutants.mjs` | 100% | 変異コードを正規化（各言語の正規化器。JS/TS なら SWC / Babel / TypeScript Compiler API）し、**元コードと正規化 AST が一致すれば、名指しした構成の下で構文的に等価**として機械的に廃棄し、**どの梯子段で廃棄したかを記録する**（TCE。**意味的等価ではない**） |
| **R6 Red 再建基盤** | `plan-red-reconstruction.mjs` | 100% | 各テストに対し「どの実装を変異させれば落ちるべきか」の候補と手順を列挙（**実行はしない**）。**claim ごとに mutation / negative test / property / metamorphic / differential / trace assertion を選び**、対象・副作用・reset・oracle・期待 red を計画する |
| | `measure-coverage.mjs` | 100% | カバレッジ実測（取得可能な場合のみ） |
| **R6.5 能動的反証** | `run-counterexample-plan.mjs` | 80% | 隔離環境で反証計画を実行し、**反例・未殺 mutant・挙動差分**を `COUNTEREXAMPLE-RESULTS.json` に記録する。結果を **claim ledger へ逆流**させ、契約候補・証拠評価・意図仮説を**撤回または分割**する。**red の失敗を自動的に仕様誤りと結論してはならない** |
| | `generate-property-tests.mjs` | 80% | R3 の不変条件から **PBT（プロパティベーステスト）を自動生成**する。既存単体テストが緑でも反例が出た瞬間に **Red が確定**し、**oracle 共犯が破れる**（F17） |
| **R7 仕様構造化** | `validate-origin-spec.mjs` | 100% | AI が書いた `ORIGIN-LONG-SPEC.json` を機械検証：スキーマ／全 `observed` に evidence 実在／全 `unresolved` に `grill_question`／全 `normative` に provenance 鎖／provenance 4値 |
| | `packet-origin.mjs` | 100% | 判断点ごとに材料を束ねて差し出す（**Markdown の給仕**） |
| **R8 仕様出力** | `emit-origin-spec-md.mjs` | 100% | JSON→MD。ATX 見出しで入力要件を満たす。**MD→JSON の再パース一致（往復証明）** |

**AI が判断する面積（ここだけ）**: パッケージ境界の最終確定、所有者割当、レイヤ推定、契約の意味確定、過分割の判定、`observed`/`inferred`/`normative`/`unresolved` の分類。

> **`R7.5 Human norm-setting` という独立段は新設しない。** 人間の規範設定は、既存の **residual → grill → RFC** の正規経路へ完全に吸収する（6.12節・11章）。逆回転専用の「承認待ち状態」を作ると、conver の既存規律（payload 中の `TODO` / `TBD` / `ask the human` / `waiting for approval` を機械が拒否する）と衝突するためである。

### 6.3 `/workspacify-tree`（リバースモード）

既存 G0〜G5 は不変。追加は4本：

| 追加 | 内容 |
|---|---|
| **T1 構造一致** | manifest の package パス集合 ≡ 実測ディレクトリ集合（双方向）。相違は FAIL して**名前を挙げる** |
| **T2 行動損失ゼロ** | 既存ソースファイルが全て所有されている。順方向の「転送損失ゼロ」の逆向き対応物 |
| **T3 接地** | 全ノードが実在ファイルパスに接地している |
| **T4 実装順序の実測** | 順方向は「設計から証明」。逆方向は「実測 DAG から証明」し、**両者の一致を要求** |
| **T5 論理／物理の分離** | 物理レイアウトは保存するが、**論理アーキテクチャは別層として持つ**。既存の `mappedNodeIds` の上に不一致を記録し、**mismatch を first-class な residual にする**（F14）。物理＝論理と仮定すると、既存の負債を正典として永久凍結する |
| **T6 reverse provenance の記録** | reverse mode の manifest に `reverse_provenance`（sidecar bundle hash と件数要約）のみを加算する。**`COMPLETE` の意味は変えず、既存の `manifest_hash` の正規化も変えない** |

**給仕**: tree 設計の判断を AI からほぼ奪う（実測が tree を決める）。AI に残るのは「実測された境界が正しいか」のみ。材料として凝集度・依存密度・変遷履歴・**境界跨ぎの呼び出し回数**を差し出す。

### 6.4 `/workspacify-allocate`（リバースモード）

| 変更 | 内容 |
|---|---|
| **A1 安全保証の反転** | `fresh-workspace only` → **「既存構造が証明済み計画と完全一致。1つでも余分なら BLOCKED」** |
| **A2 追加のみ** | トップレベル rename を**しない**。書き込みは `RFC-SEED.md` と manifest のみ |
| **A3 packet 拡張** | 各パッケージに「既存実装の抜粋／契約候補／既存テスト／既存 I/O」を束ねる。**給仕の極大化の中心** |
| **A4 RFC-SEED 逆回転索引** | **§1（Identity and Position in the Whole System）の機械注入内容を拡張する。**逆由来の来歴（`claim_id` / `residual_id` / `scope_ref` / risk class / sidecar bundle hash）と既存実装の実態をここに載せる。**15番目の見出しを作ってはならない**（`seed-parse.mjs` が `headings.length !== SEED_REQUIRED_SECTIONS.length` で完全一致を強制しており、見出し数を変えると順回転に波及する） |
| **A5 既存流用** | seed parity（Allocation Index ↔ ownership）はそのまま効く |
| **A6 provider packet の実装文脈** | 各パッケージの packet に、そのパッケージを**使っている側**（incoming dependencies）の実装抜粋を必ず含める。**外部からの利用文脈が無いと、AI は「なぜその関数が存在するのか」を判断できない** |

> **注意**: 現行の「トップレベルエントリの原子的 rename」は、逆方向では rename 対象が**既存の `src/` や `tests/` そのもの**になる。無改修で通すと既存ツリーを破壊する。ここは**同等の強度のまま逆向きに張り直す**必要がある。

### 6.5 `/grill-me-for-rfc`（逆対応）

| 変更 | 内容 |
|---|---|
| **G1 質問の機械生成** | RFC-SEED の逆方向節から grill の初期質問候補を機械生成し、AI が確定する |
| **G2 追認の防止** | **「この挙動は意図か、偶然か」を必ず問う質問を機械が強制挿入**。これが無いと追認 RFC になる |
| **G3 residual 引き継ぎ** | 上流の未解決を逐語で引き継ぐ（既存の規律をそのまま） |
| **G4 規範選択の記録** | grill の結果を**承認待ち状態ではなく選択イベント**として `normative_decision` に記録する。回答が無ければ `chosen_default` を採用し、**高リスク命題では既定値を規範へ昇格させず `unresolved-contract-candidate` のまま RFC に残す** |
| **G5 authority の記録** | `normative_authority` は**個人名ではなく役割・チームの安定 ID**（`security-domain-steward` 等）で記録する。人は替わるが、権限の所在と再審査の責任は残らねばならない（F18） |

### 6.6 `/graphify-rfc`（逆対応）

| 変更 | 内容 |
|---|---|
| **GF1 接地検証** | 全ノード→実在ファイルの接地を新規ゲート化 |
| **GF2 契約突合** | R3 の契約候補と RFC 由来の契約を突合。**差分＝「説明のつかない既存挙動」**として omission / RESIDUE 候補に落とす（黙って追認しない） |

### 6.7 `/boundify-graph`（逆対応）

| 変更 | 内容 |
|---|---|
| **B1 既存構造の保存** | 新規ファイル生成をしない |
| **B2 ヘッダ後付け** | 既存 `refresh-file-headers.js`（既存ヘッダ更新・本体不変）の前例を流用 |
| **B3 対応表** | 生成しなかったファイル＝既存ファイルの対応表を出力 |

### 6.8 `/split-to-tickets`（逆対応）— 2番目に重い

| 変更 | 内容 |
|---|---|
| **S1 テスト・マッピング** | 既存テストを `testUnit` / `testIntegration` / `testExceptions` へ機械マッピング |
| **S2 契約↔テスト対応** | 対応の無い契約を検出＝**Red 不在** |
| **S3 実装の実測埋め込み** | `default_files` を実測で埋める。既存実装ありフラグ |
| **S4 Red 再建チケット生成** | テストの無い契約に対し、**Red を再建するチケット**を自動生成（R6 の計画を入力に） |
| **S5 counterexample_plan_id の付与** | Red 再建チケットに `counterexample_plan_id` を必ず持たせる。**「何を実装するか」だけでなく「何を確定させ／反証するか」を持たないと、逆回転由来の不確実性は実装時に消える** |
| **S6 driving refs の付与** | チケットに `driving_claim_ids` / `driving_residual_ids` / `origin_kind`（`reverse` / `forward` / `evolution` / `omission` / `residue`）を**任意フィールドとして**加算する（6.12節） |

### 6.9 横断の仕掛け

1. **給仕インターフェースの統一** — 全ての AI 判断点の直前に `packet` を置く。`packet` は「所有候補・出典抜粋・境界文脈・禁止事項・未解決」を **Markdown で**差し出す。既存 `workspacify-allocate packet` を共通形に昇格させる
2. **provenance 4値** — 全項目が `observed` / `inferred` / `normative` / `unresolved` のいずれか（5.5節）
3. **evidence の必須化と陳腐化検出**（5.4節）
4. **証拠独立性グループ** — evidence をソースではなく生成因果でグループ化し、R7 packet に「独立 evidence group 数」と「同起源の繰り返し」を機械表示する（5.5.2節）
5. **scope と coverage_status** — 命題の適用範囲を機械比較し、**未観測を「確認済み」と分離**する。「観測されなかった経路を不存在と書く」ことを禁ずる
6. **状態フィールドの名前空間分離** — 逆回転は `analysis_state` / `evidence_state` / `claim_state`。順回転の `status: COMPLETE` とは**フィールドを共有しない**（6.12節）
7. **`stale` は別軸の警告** — `COMPLETE` を取り消す状態ではなく「正典の再審査が必要」を表す
8. **正本と参照の分離** — 不確実性の正本は reverse sidecar に一元化し、順回転成果物には**複製しない**（6.12節）

### 6.10 R0〜R8 のデータフロー — どの出力がどの入力になるか

スクリプト名の列挙だけでは配置の妥当性を判断できない。**データの流れ**を示す。

```text
                      (既存プロジェクトルート)
                                │
  R0 lock-project-root ─────────┼──→ tree hash / 除外規則 / 追跡ファイル一覧
  R1 measure-tree ──────────────┼──→ 実測ツリー / 言語分布 / 生成物判定
  R2 extract-import-graph ──────┼──→ ファイル間依存 / SCC / 凝集度 ──┐
  R3 extract-* (9本) ───────────┼──→ 公開面 / 型 / エラー / 契約候補  │
  R4 mine-history ──────────────┼──→ 変遷 / 共同変更 / 「なぜ」       │
  R5 detect-* (5本) ────────────┼──→ 死コード / Red不在 / 矛盾        │
  R6 plan-red-reconstruction ───┼──→ 変異候補と手順                  │
                                ▼                                    ▼
                       R7 packet-origin ──→ 【AI の判断】──→ ORIGIN-LONG-SPEC.json
                                                                    │
                       R8 emit-origin-spec-md ◄─────────────────────┘
                                │
                                ▼
                        ORIGIN-LONG-SPEC.md ──→ /workspacify-tree（リバースモード）
```

| 産出元 | 産物 | 消費者 |
|---|---|---|
| R0 | `tree hash` / 除外規則 / 追跡一覧 | **全段の evidence の基準点**、R5 の生成物判定、R8 の往復証明 |
| R1 | 実測ディレクトリツリー | R2 のクラスタリング入力、**T1（構造一致）の期待値** |
| R2 | ファイル間依存 / SCC / 凝集度 / 実装順序 | R3 の契約候補スコープ、**T4（実装順序の実測）**、AI の境界判断材料 |
| R3 | 公開面 / 型 / エラー / guard / invariant / 状態機械 / 副作用 / テスト / **契約候補** | R5 の Red 不在判定、R6、R7、**GF2（契約突合）**、S1〜S3 |
| R4 | 変遷 / 共同変更 / コミット種別 / 「なぜ」 | R7 の判断カード（偶然か意図か）、R5 の矛盾判定 |
| R5 | 死コード / Red 不在 / 循環論法 / コメント齟齬 / スタブ全数 | R6、**S2**、**S4**、residual 候補 |
| R6 | 変異候補と手順 / カバレッジ | **S4（Red 再建チケット）** |
| R7 | `ORIGIN-LONG-SPEC.json` + provenance 4値 | R8、そして下流の全段 |
| R8 | `ORIGIN-LONG-SPEC.md` | `/workspacify-tree` |

> **設計上の要点**: **R0 の tree hash が全ての evidence の基準点**である。逆回転の途中で対象が変われば、それ以前の evidence はすべて無効になる。これを機械的に検出するのが 5.4 節の「陳腐化検出」であり、R0 で worktree を固定することが強く推奨される理由である。

#### 6.10.1 直線フローでは足りない — 反証は上流を撤回させる

**逆回転は演繹ではなくアブダクションであり、反証が最重要の更新入力である。** したがって上記の直線フローに加えて、**逆向き／横断の辺**が必要になる。

| 辺 | 意味 | 必要性 |
|---|---|---|
| R2.5 → R2 | 実行時観測が、静的関係の候補・重み・**未知領域**を更新する | 静的グラフと実行時グラフの不一致を残す（F4） |
| R3.5 → R1 / R2 / R2.5 | evidence 不足の claim が**追加の解析スコープを要求する** | coverage を成果物生成後に閉じる |
| R4 → R3.5 | 履歴・ADR・issue が claim の**支持／反証**へ流入する | 履歴を付録にせず判断に使う |
| R5 / R5.5 → R6 | gap の**種別**が Red 再建の手法を選ぶ | 一律 mutation の誤用を避ける（F17） |
| **R6.5 → R3 / R3.5 / R4** | **反例が契約候補・証拠評価・意図仮説を撤回／分割する** | **反証を一回限りのテスト結果にしない** |
| R7.5（＝grill）→ R3.5 / R8 | 人間の規範判断を claim ledger と origin spec に**書き戻す** | 人間判断を会話ログだけに残さない |
| **R8 → R0** | 後続ループで対象 commit／環境／生成器が変われば、旧証拠を `stale` 化する | 時間的ドリフトの管理（F13） |
| `/crystalize-readme` RESIDUE → R3.5 / R5 / R6 | 商品観点の欠落を逆回転の evidence / gap / red 計画へ戻す | RESIDUE を RFC 差分だけに直結すると根拠鎖が切れる |
| `/find-omissions` → claim ledger | omission を「テスト不足」だけでなく **claim / scope / oracle のどこが欠けるか**として記録する | omission の再発と循環を追える |

> **この表が示すこと**: 逆回転のデータフローは**一方向ではなく、反証が上流の仮説を撤回させる循環を持つ**。直線フローだけを実装すると、反例が得られても契約候補が更新されず、**反証が死ぬ**。

### 6.11 Worked example — 1つの境界を R0〜R8 がどう扱うか

抽象論だけでは配置の妥当性を判断できない。具体例で示す。

**シナリオ**: 既存プロジェクトに `src/auth/`（認証）と `src/db/`（永続化）があり、`auth` が `db` を直接呼んでいる。両者の間にポートが無い。

| 段 | AI に差し出される材料の実例 |
|---|---|
| R1 | `src/auth` は 14 ファイル / 1,820 行。`src/db` は 9 ファイル / 2,140 行。両者とも手書き（生成物判定に非該当） |
| R2 | `auth → db` の依存は **23 箇所**。逆向きは 0。`auth` の外部結合は 3 ディレクトリ、内部結合は 41。SCC に属さない（循環なし） |
| R3 | `auth` が持つ invariant 痕跡 2 件（`assert!(token.expires_at > now)` 等）。`db` が持つエラー型 4 件。**契約候補**: `auth → db` の境界に pre/post 候補 6 件（うち 2 件はアサーションから直接導出） |
| R4 | `auth → db` の直接呼び出しは**単一コミットで導入**され、コミットメッセージは `wip`。以降 3 年間変更なし。設計ノート無し |
| R5 | `db` の公開面のうち **5 件がテスト無し**（＝ Red 不在候補）。`auth` 側の `revokeSession()` にテストはあるが、アサーションは戻り値のみで DB 状態を見ていない（＝ 循環論法候補） |
| R6 | `revokeSession()` のテストは、`db.delete()` の呼び出しを除去しても**落ちない**と予測される（＝ その変異に対する red が無い） |
| R7 | **判断カード**（AI に差し出される）— **問い**: 「`auth → db` の直接依存は意図か偶然か」。**選択肢**: (a) 層違反として port を挿入する / (b) 現状を維持し境界として認める / (c) `residual` として人間 grill へ渡す。**支持する証拠**: R2 の一方向 23 箇所（一貫している）/ R3 の pre/post 候補 6 件 / R4 の 3 年間安定。**反例**: R4 の `wip` コミットと設計ノートの不在は、偶然の産物である可能性を示す |

**AI が決めるのは最後の1行だけ**であり、そこに至るまでの材料はすべて機械が揃える。これが 4.5 節の設計原理の具体的な姿である。

### 6.12 逆回転 provenance の設計 — 不確実性をどこに置くか

**専門家2名のレビューで、この論点は正面から対立した**（一方は「全成果物へ薄く伝播」、他方は「RFC-SEED と RFC のみ」）。実装を確認した結果、**どちらとも異なる第三の設計**が最適と判断した。以下が根拠と確定設計である。

#### 6.12.1 決定的な事実 — 順回転成果物は既に連結した索引グラフを形成している

```text
RFC 見出し
   ↑ headingRefs        （rfc-graph/crud.js — GRAPH ノードが RFC 見出しを参照）
*-GRAPH.json ノード
   ↑ nodeIds            （tickets/add-tickets-for-phase.js — nodeToDirMap で解決）
Tickets.json
   ↑ originalTicketKey  （tickets/add-omission-ticket.js）
omission チケット

*-GRAPH.json ノード
   ↑ mappedNodeIds      （rfc-graph/boundify-helpers.js — Dirs-Tree が既にノードへ写像）
*-Dirs-Tree.json ファイル
```

**つまり `RFC ← GRAPH ← Dirs-Tree / Tickets ← omission` は既に機械的に辿れる。** したがって「下流は RFC を間接参照する」という主張は事実である。**ただし辿れるのは見出し粒度までであり、claim は見出しより細かい。** また join を実装しない限り「自動的に」は遡れない。

#### 6.12.2 裁定 — 案2.5-refined

| 案 | 判定 | 理由 |
|---|---|---|
| 案1（全成果物に全 ID・状態を伝播） | **不採用** | ハッシュ・WIG・reload に広く波及し、順回転を侵食する |
| 案2（sidecar 参照のみ） | **基礎として採用** | 正本一元化は正しい。ただし参照点が粗いと条項単位で辿れない |
| 案3（RFC-SEED / RFC のみ） | **一部採用** | 見出し粒度までしか辿れず、claim の粒度に届かない |
| **案2.5-refined** | **採用** | 正本は sidecar、**順回転成果物へのフィールド追加はゼロ**。sidecar が**順方向参照**を持つ |

**要点は「参照を成果物に埋める」のではなく「成果物の既存の索引を sidecar 側から辿る」ことである。**

```json
{
  "claim_id": "clm-authz-delete-tenant-001",
  "forward_refs": {
    "rfc_heading_refs": ["rfc-7.3.2"],
    "graph_node_ids": ["N0042"],
    "boundary_ids": ["boundary-auth-db-01"],
    "dirs_tree_paths": ["src/auth", "src/db"],
    "ticket_ids": ["P3-7"],
    "ref_hashes": { "graph": "sha256:…", "dirs_tree": "sha256:…" }
  }
}
```

これにより二つの利点が同時に得られる：

1. **順回転を一切変更しない**（`*-GRAPH.json` / `*-Dirs-Tree.json` にフィールドを足さない）
2. **GRAPH に埋めるより粒度が上がる**（1ノードに複数 claim がある場合も区別できる）
3. `ref_hashes` により、GRAPH が再生成されてノード ID が変われば **`stale` として機械検出**される

#### 6.12.3 正本（sidecar）と参照の分離

**更新頻度が高く、命題単位で詳細な情報は sidecar に一元化する。** 各下流成果物が authority や evidence independence を**個別に再計算してはならない**（stage two が stage one の証明済み素材を再解釈しないという既存規律と同じ）。

| sidecar | 内容 |
|---|---|
| `ANALYSIS-SCOPE.json` | 権限・対象 commit・秘密除外・対象環境・外部送信方針 |
| `EVIDENCE-REGISTRY.json` | 根拠行・トレース・履歴・設定。**hash / 生成器版 / 対象 commit / evidence 独立性** |
| `CLAIM-LEDGER.json` | 命題の本文・分類・scope・support・counterevidence・falsification |
| `RESIDUAL-REGISTRY.json` | `topic` / `alternatives` / `chosen_default` / `why_unresolved` / `grill_question` の正本 |
| `NORMATIVE-DECISIONS.json` | grill の選択、選ばなかった代替案、判断根拠、再審査条件、authority |
| `STALENESS-INDEX.json` | diff・lockfile・IaC・schema・外部契約変更からの陳腐化伝播 |
| `ARCHITECTURE-DELTA.json` | 論理候補モデルと物理レイアウトの**不一致**（`mappedNodeIds` の上に載せる） |
| `EXECUTION-SURFACE.json` / `ORACLE-GAP.json` / `COUNTEREXAMPLE-PLAN.json` / `COUNTEREXAMPLE-RESULTS.json` / `HISTORY-PROVENANCE.json` / `GAP-REGISTER.json` | 各段の産物 |

**順回転成果物に置くのは用途に必要な最小参照だけ**である：

| 成果物 | 層 | 持たせる最小情報 |
|---|---|---|
| `RFC-SEED.md` | **A（必ず）** | **§1 の機械注入内容を拡張**して逆回転索引を載せる（`claim_id` / `residual_id` / `scope_ref` / risk class / sidecar bundle hash）。**見出し数は 14 のまま変えない**（`seed-parse.mjs` が完全一致を強制しているため、15番目の見出しは順回転を壊す） |
| Canonical RFC | **A（必ず）** | 条項ごとの anchor（`claim_id` / `normative_decision_id` / `residual_id` / `scope_ref`）。本文を汚したくなければ併置 `RFC-PROVENANCE.json` に逃がす |
| `omission` | **B（任意）** | `affected_claim_ids` / `origin_residual_ids` / `scope_ref` / `oracle_gap_ref` — **還流のため** |
| `RESIDUE` | **B（任意）** | `affected_claim_ids` / `origin_residual_ids` / `scenario_ref` / `next_route` |
| `Tickets.json` / ticket `spec` | **B（任意）** | `driving_claim_ids` / `driving_residual_ids` / `counterexample_plan_ids` / `origin_kind` / `staleness_ref` |
| `TREE-MANIFEST` / `ALLOCATE-MANIFEST` | **C** | `reverse_provenance`（sidecar bundle hash と件数要約）**のみ**。他は追加しない |
| `*-GRAPH.json` / `*-Dirs-Tree.json` | **C** | **一切追加しない。** sidecar が順方向参照を持つ |

> **落とし穴**: 層 B・C の追加はすべて **reverse mode でのみ出現する任意フィールド**でなければならない。`ref_hashes` の不一致（＝グラフ再生成などでノード ID が変わった）を `stale` として検出する仕組みが、この設計の前提である。

### 6.13 実装フェーズ（コスト対効果の順）

| Phase | 内容 | 順回転への影響 |
|---|---|---|
| **−1** | **計画そのものの基盤固め**（下表）。**コードを書く前に終わらせる。** | **なし**（基盤と設計確定のみ） |
| **0** | ① reverse sidecar 群＋順方向参照＋`ref_hashes` ② 証拠の系譜グラフと独立性の集計ポリシー（`lineage_edges` / `independence_policy` / `evidence_mode`）③ scope と `coverage_status`（`unknown` を `absent` と合算しない）④ residual の `normative_context` 拡張 ⑤ invariant mutation ＋ TCE ⑥ テスト import/mock → R2 凝集度への逆流辺 ⑦ capability profile ⑧ **順回転回帰ゲート** ⑨ `SCOPE-BOUNDARY.json`（`in_scope` / `out_of_scope` / `undetermined`） | **なし**（reverse 専用） |
| **0.5** | **動的解析基盤の構築** — sandbox / record-replay / 隔離 DB / リセット手順。**R-1 が要求する動的証拠を取得する環境**（これが無いと W3 の撤退条件が常時成立してしまう） | なし |
| **1** | **物理／論理の二層化**（`mappedNodeIds` の上に mismatch を記録）＋ カード駆動 Reflexion ＋ 2-Pass Hybrid | なし（再利用のみ） |
| **2** | **反証の中心化** — R6.5、反例予算、PBT 自動生成、反例の claim ledger への逆流。**Red 再建の実行経路を含む**（作業ツリー隔離・`conver.js` への組み込み） | なし |
| **3** | **staleness 伝播 → `/drill-rfc-down` への入力** | なし（入力追加のみ） |
| **4** | security lane（F15）— 認可・テナント・秘密・削除・監査の横断 | なし |

**Phase 0 だけで、両専門家が指摘した最大の危険（高性能な追認装置になること）の主要部分は潰せる。**

#### 6.13.1 Phase −1 — 計画そのものの基盤固め

**1695行の計画はまだ1行も実装されていない。**「精密に AI を助けられる」は現時点では仮説である。**コードを書く前に、仮説を検証し、回帰の基盤を固定する。**

| # | 項目 | 完了条件 | なぜ先か |
|---|---|---|---|
| **−1-a** | **回帰ゲートの基盤固め** | 順方向フィクスチャで **改修前に** ベースライン `manifest_hash` を採取・固定する。`tests/workspacify-allocate/fixtures/` を追加する | ゴールデン manifest が**保存されていない**ため、今のままでは「一切破壊しない」を証明できない。**allocate 側は fixtures 自体が無い** |
| **−1-b** | **RFC-SEED 逆回転索引の格納先確定** | §1 の機械注入内容を拡張する設計を確定し、`seed-parse.mjs` の見出し数チェック（完全一致）を**変更しない**ことを確認する | 15番目の見出しは順回転を壊す（6.4節 A4） |
| **−1-c** | **最小スパイク（R0.5 → R3.5 → R7）** | 1本の垂直スライスで設計仮説を検証し、**claim 数・カード枚数・`unresolved` 率・AI 判断時間・人間介入回数**を実測する（R-7） | **設計仮説そのものを最小コストで先に知る。** Phase 0 の後に置くと手遅れになる |
| **−1-d** | **新設ゲートの受け入れ基準** | 6.14節の表をテストケースに落とす | 受け入れ基準の無いゲートは、**効いているか分からない**ので存在しないのと同じ |
| **−1-e** | **Phase 0 の依存順序の確定** | 下記 6.13.2 の順序を確定する | 9項目が集合のままだと着手できない |
| **−1-f** | **実行側の3穴の Phase への組み込み** | 動的解析基盤（→ Phase 0.5）／`zg` の給仕層への組み込み（→ Phase 0）／Red 再建の実行経路（→ Phase 2） | 分析側だけ精密でも、**実行できなければ意味がない** |

#### 6.13.2 Phase 0 の依存順序

| 順 | 項目 | 依存 |
|---|---|---|
| 1 | **−1-a のベースライン固定** | **改修前**でなければならない |
| 2 | reverse sidecar の骨格（`ANALYSIS-SCOPE` / `SCOPE-BOUNDARY`） | 1 |
| 3 | `CLAIM-LEDGER` ＋ 証拠の系譜グラフと独立性ポリシー（`lineage_edges` / `independence_policy`） | 2 |
| 4 | `ref_hashes` と順方向参照 | 3 |
| 5 | residual の `normative_context` 拡張 | 2 |
| 6 | invariant mutation ＋ TCE | 独立 |
| 7 | テスト import/mock → R2 凝集度への逆流辺 | 独立 |
| 8 | capability profile | 2・3 |
| 9 | `zg` を給仕層へ組み込む（R1〜R4 の候補発見） | 独立 |
| — | **順回転回帰ゲートは 2〜9 の各項目の後に毎回実行する** | 1 |

#### 6.13.3 Phase 0 の完了条件

1. **順回転回帰ゲートが通ること** — 順方向フィクスチャの `manifest_hash` が改修前後でバイト一致する（⑧）
2. **スパイク計測レポートの提出** — claim 数・カード枚数・`unresolved` 率・AI 判断時間・人間介入回数の実測と全体への外挿（R-7）
3. **`observed` 分類の拒否が機能すること** — 動的機構が関与する命題に動的証拠が無いとき、機械が `observed` を拒否する（R-1）

### 6.14 新設ゲートの受け入れ基準

**受け入れ基準の無いゲートは、効いているか分からないので存在しないのと同じである。** 以下は各ゲートの「何を検出したら FAIL か」。**実装時はこの表をそのままテストケースに落とす。**

> **共通原則**: 逆回転のゲートは**「一致していること」ではなく「不一致が記録されていること」を PASS とすることがある**（T5・GF2・S2）。**差分ゼロや不一致ゼロは、正常ではなく異常のシグナルである場合がある**（F1）。

#### 6.14.1 `/workspacify-tree` リバースモード

| ゲート | FAIL 条件 | PASS 条件 | 備考 |
|---|---|---|---|
| **T1 構造一致** | manifest の package パス集合 ≠ 実測ディレクトリ集合（双方向） | 完全一致 | 相違は**名前を挙げる**（余分／欠落の別を明示） |
| **T2 行動損失ゼロ** | 手書きソースファイルのうち、どの package の `owns` にも属さないものが1件以上 | 0件 | 生成物・vendor は母集団から除外済み |
| **T3 接地** | GRAPH ノードのうち実在ファイルパスに解決できないものが1件以上 | 0件 | |
| **T4 実装順序の実測** | 実測 DAG から導いた順序 ≠ manifest の `implementation_order` | 一致 | 循環があれば当然 FAIL |
| **T5 論理／物理の分離** | `ARCHITECTURE-DELTA` に**記録されていない**不一致が存在する | **すべての不一致が記録されている** | **一致は PASS 条件ではない。**「不一致を黙って通した」ことが FAIL |
| **T6 reverse provenance** | reverse mode なのに `reverse_provenance` が無い、または sidecar bundle hash が解決できない | 存在し解決できる | **forward mode では発火しない**（フィールドが無いことが正常） |

#### 6.14.2 `/workspacify-allocate` リバースモード

| ゲート | FAIL 条件 | PASS 条件 | 備考 |
|---|---|---|---|
| **A1 安全保証の反転** | 既存パスが計画に無い、または計画のパスが既存でない | 完全一致 | 1つでも余分なら BLOCKED |
| **A2 追加のみ** | 書き込み対象が `RFC-SEED.md` と manifest 以外、またはトップレベルエントリの rename が発生 | 追加のみ | **既存ツリーを破壊しない** |
| **A3 packet 拡張** | incoming dependencies の抜粋が空のパッケージが存在する（reverse mode） | 全パッケージで非空 | 「なぜその関数が存在するのか」を判断できるようにする |
| **A4 §1 索引** | §1 に逆回転索引が無い、**または見出し数が 14 でない** | §1 に索引があり見出し数は 14 | `seed-parse.mjs` の完全一致チェックを変更しない |
| **A5 seed parity** | （既存のまま）Allocation Index ↔ ownership の全単射が崩れている | 0 missing / 0 duplicated / 0 leaked | |
| **A6 provider packet** | A3 に統合 | — | |

#### 6.14.3 `/grill-me-for-rfc` 逆対応

| ゲート | FAIL 条件 | PASS 条件 | 備考 |
|---|---|---|---|
| **G4 規範選択の記録** | `normative` 命題に対し `normative_decision` が無い | 全 `normative` に対応する選択イベントがある | **承認待ち状態は作らない** |
| **G5 authority** | `normative_authority` が空、または個人名と判定できる値 | 役割・チームの安定 ID | 人は替わるが権限の所在は残る |

#### 6.14.4 `/graphify-rfc` 逆対応

| ゲート | FAIL 条件 | PASS 条件 | 備考 |
|---|---|---|---|
| **GF1 接地検証** | T3 と同じ | 0件 | |
| **GF2 契約突合** | 契約候補と RFC 由来契約の差分が**記録されずに消えている** | **差分がすべて omission / RESIDUE 候補として記録されている** | **差分ゼロは PASS ではない**（F1 のシグナル） |

#### 6.14.5 `/boundify-graph` 逆対応

| ゲート | FAIL 条件 | PASS 条件 | 備考 |
|---|---|---|---|
| **B1 既存構造の保存** | 逆回転モードで新規ファイルが生成された | 0件 | |
| **B2 ヘッダ後付け** | **ファイル本体が変更された**（ヘッダ以外の差分が存在） | ヘッダのみの差分 | |
| **B3 対応表** | 生成しなかったファイルの対応表が無い | 存在する | |

#### 6.14.6 `/split-to-tickets` 逆対応

| ゲート | FAIL 条件 | PASS 条件 | 備考 |
|---|---|---|---|
| **S1 テスト・マッピング** | 既存テストのうちどのチケットにもマップされないものがある | 全テストがマップ済み | |
| **S2 契約↔テスト対応** | **Red 不在の契約が検出されずに通っている** | Red 不在がすべて記録されている | **不在ゼロは PASS ではない** |
| **S3 実装の実測埋め込み** | 既存実装があるのに `default_files` が空のチケットがある | 全チケットに実測ファイル | |
| **S4 Red 再建チケット生成** | Red 不在の契約に対しチケットが生成されていない | 1対1対応 | |
| **S5 counterexample_plan_id** | Red 再建チケットに `counterexample_plan_id` が無い | 全件にある | これが無いと不確実性が実装時に消える |
| **S6 driving refs** | （任意フィールドのため FAIL にしない） | 付与が試みられ解決できた | 解決失敗のみ記録する |

#### 6.14.7 逆回転固有の判定（ゲートではなく分類の強制）

| 判定 | FAIL（＝機械が拒否する）条件 | 備考 |
|---|---|---|
| **`observed` の拒否** | 動的機構が関与する命題に動的証拠が無いのに `observed` と分類されている | R-1。`inferred` または `unresolved` へ落とす |
| **`normative` の拒否** | provenance 鎖（RFC clause → claim → normative_decision → residual → evidence bundle → evidence）が途切れている | 5.5節 |
| **証拠独立性の加算拒否** | 強い系譜関係で結ばれた evidence を独立証拠として複数計上している | 5.5.2節（F11） |
| **`out_of_scope` の保護** | スコープ外を「存在しない」と記述している | R-6（F12） |

---

## 7. 我々の提案が届いていない領域（レビュー依頼の核心）

**以下の認識が本節の出発点である：我々の提案は1回の設計会話から出たものであり、この領域を進めるのに十分な厚みを持っていない。リバースエンジニアリングは、あなた（読者）の知見を必要としている。**

### 7.1 我々の提案の構造的な穴

| 穴 | 内容 |
|---|---|
| **動的解析が完全に不在** | 提案は静的解析のみである。実行時挙動・実データ・実トレースを見ていない。**動的ディスパッチ、reflection、DI、コード生成、マクロ、feature flag、環境変数、非同期キュー、plugin は静的検索だけで欠落する** |
| **不変条件の「推論」が無い** | 痕跡の抽出（`extract-invariants`）はあるが、**実行観測から不変条件を推論する**手法が無い |
| **状態機械の「推論」が無い** | 痕跡の抽出はあるが、**ログ／トレースから有限状態機械を自動推論する**手法が無い |
| **要求の復元が無い** | コードから**ゴールモデル／要求**を復元する要求工学的な逆方向手法が無い |
| **アーキテクチャ復元の理論が無い** | 凝集度によるクラスタリングだけである。**リフレクションモデル、DSM、アーキテクチャ違反検出**の体系が無い |
| **言語横断のシンボル解決が無い** | 正規表現と簡易パースに依存している。**正確な名前解決**の基盤が無い |
| **バイナリ・実行時成果物が対象外** | コンパイル済み成果物、コンテナイメージ、DB スキーマ実体、設定実体が対象外 |
| **テストの意味の復元が無い** | テストが**何を仕様として主張しているか**を復元する手段が無い |
| **人間の暗黙知の取り込みが無い** | ドメイン専門家の知識を構造化して取り込む経路が無い（residual → 人間 grill のみ） |
| **再現性の保証が無い** | 決定論的部分の再現性（同じ入力から同じ `ORIGIN-LONG-SPEC` が出るか）の検証設計が無い |

### 7.2 我々が検討すべき既存手法（情報提供の依頼）

以下は我々が**名前は知っているが、conver 逆回転への組み込み方を設計できていない**手法の一覧である。**どれを・どの段に・どう組み込むべきか、また我々が挙げていない手法は何か**について、読者の知見を求めている。

**(a) 精密なシンボル解決・コード表現**

- **SCIP / LSIF / Kythe** — 言語非依存のコードインテリジェンス索引。正確な定義・参照・型の解決
- **Tree-sitter** — 言語横断の構文木。パース誤りの無い構造抽出
- **LSP** — 各言語の言語サーバを解析器として利用
- **Joern（CPG: Code Property Graph）** — AST + CFG + PDG を統合したグラフ。データフロー・テイント・到達可能性
- **CodeQL / Semgrep** — クエリベースの意味パターン検索。「〜という構造が存在するか」を証明可能に問う
- **言語別の型・SSA 基盤** — Rust（`cargo metadata` / rustdoc JSON / MIR / clippy）、Go（`go/packages` / `go/types` / `x/tools/go/ssa`）、TypeScript（Compiler API / ts-morph）、Python（`ast` / `libcst` / mypy / pyright）、Java（Soot / WALA / Tai-e / Doop）

**(b) 不変条件・仕様の推論**

- **Daikon** — 実行トレースからの**動的不変条件推論**。`extract-invariants` の痕跡抽出を「推論」へ引き上げる
- **状態機械推論** — Synoptic / Perracotta / Texada / MINT / k-tails / ReverX。ログから有限状態機械を復元
- **API 誤用マイニング** — 典型的な使用パターンと違反の抽出
- **仕様マイニング** — テスト・実行履歴からの事前条件／事後条件の抽出

**(c) 動的解析**

- **実行トレース / システムコール** — strace / ltrace / eBPF / DTrace
- **デバッガ / record & replay** — gdb / lldb / rr。決定論的再生による再現可能な観測
- **カバレッジ誘導ファジング** — AFL++ / libFuzzer。到達不能・異常経路の発見
- **コンコリック実行 / シンボリック実行** — KLEE / angr / SAGE / DART / CUTE。経路制約からの事前条件復元
- **プロファイリング / 実行時結合** — 実際の呼び出し関係（静的解析の到達可能性を実測で補正）

**(d) ミューテーション・テスト品質**

- **Mutation testing** — Stryker / PIT / mutmut / cargo-mutants。**Red 再建の中核**
- **プロパティベーステスト** — QuickCheck / Hypothesis / fast-check / proptest。復元した不変条件の検証
- **差分カバレッジ / MC-DC** — テストが実際に何を保証しているかの測定

**(e) アーキテクチャ・進化の復元**

- **ソフトウェアリフレクションモデル** — 設計意図と実装の差分を明示的に扱う
- **依存構造行列（DSM）とクラスタリング** — ACDC / LIMBO / アーキテクチャ違反検出
- **論理結合・共同変更のマイニング** — git 履歴から「一緒に変わるべきもの」を推定
- **コードオーナーシップの復元** — 誰がどの領域の判断者か
- **要求工学の逆方向** — ゴールモデル復元（KAOS / i*）、requirements recovery / reengineering
- **設計判断の復元** — ADR（Architecture Decision Record）の逆抽出

**(f) バイナリ・非ソース成果物**

- Ghidra / IDA / BSim（バイナリ類似性）、デコンパイル成果物の索引化
- コンテナイメージ、DB スキーマ実体、実設定、IaC 定義の解析

### 7.3 どこに何を入れると精度が上がるか（我々の暫定案 — 要検証）

| 段 | 追加候補 | 期待される精度向上 |
|---|---|---|
| R1 | **SCIP / Tree-sitter / LSP による正確な索引** | 正規表現ベースの抽出誤りを排除。全 evidence の信頼性が上がる |
| R2 | **Joern(CPG) / CodeQL によるデータフロー・テイント** | import グラフでは見えない**実行時の依存**を捕捉。境界推定の誤りが減る |
| R2 | **実行時プロファイリングによる実結合** | 静的な到達可能性と実呼び出しの乖離を解消 |
| R3 | **Daikon による動的不変条件推論** | 痕跡ではなく**推論**。契約候補の質が根本的に上がる |
| R3 | **状態機械推論（Synoptic / Texada）** | ログから状態遷移を復元。追認 RFC の最大の穴を埋める |
| R4 | **論理結合マイニング** | 歴史的偶然か設計意図かの判別材料になる |
| R5 | **Mutation testing** | **Red 不在の検出**と Red 再建の計画精度 |
| R6 | **シンボリック実行による事前条件復元** | 境界値・失敗経路の契約を機械的に導出 |
| R7 | **リフレクションモデル / DSM** | 設計意図と実装の乖離を**明示的な差分として**提示できる |
| R7 | **要求復元（ゴールモデル）** | 「なぜこのモジュールが存在するか」の言語化。AI の判断面積を削る |
| 全体 | **再現性検証（同一入力→同一 ORIGIN-LONG-SPEC）** | 決定論的部分の信頼性を証明 |

### 7.4 非決定論的な AI の判断を極限まで助ける設計（提案）

決定論では解けない領域に対して、**AI の判断そのものを助ける**仕掛けを提案する。これらは「計測」ではなく「思考支援」であり、**本設計の成否を分ける**と考えている。

1. **判断カード（decision card）** — 判断点ごとに「問い / 選択肢 / 各選択肢の帰結 / 支持する証拠 / 反例 / 現状の既定値」を Markdown で差し出す。AI は自由記述ではなく**構造化された問い**に答える
2. **対立仮説の強制** — 各判断に対し**必ず2つ以上の解釈**を立てさせ、棄却理由を記録させる。「意図的な設計」と「歴史的偶然」の両方を必ず検討させる
3. **反例生成器（adversarial verifier）** — AI の仮説を壊す証拠を探す専用のステップ。既存の self-grill の `adversarial` 焦点を、逆回転では**証拠探索つきで**強化する
4. **「偶然か意図か」の判別手続き** — 機械が次の材料を束ねて差し出す：(a) `git blame` の時系列（一度に入ったか、段階的か）、(b) コミットメッセージ、(c) 対応するテストの有無、(d) 呼び出し側の一貫性、(e) 類似箇所での一貫性。**判断は AI が行うが、材料は機械が揃える**
5. **確信度の構造化** — evidence の強さを段階化（直接観測 / 複数証拠の一致 / 単一の弱い痕跡 / 推測のみ）。`unresolved` への落とし方を機械が助言する
6. **質問の依存グラフ** — grill の質問順序を機械が設計する。前提が未確定の質問を先に投げない
7. **判断の差分追跡** — AI の判断を記録し、再実行時に**同じ判断が再現されるか**を比較する。判断の揺れは設計の弱点のシグナルである
8. **語彙の事前供給** — 解析で抽出したドメイン語彙（型名・エラーコード・契約名・ディレクトリ名）を、判断前に AI へ提示する。**用語の揺れが判断の揺れを生む**
9. **カード駆動 Reflexion Modeling** — 人間は**モデルの作者ではなく候補間の裁定者**になる。機械が候補モデルを生成し、人間は採否と既定値だけを選ぶ
10. **2-Pass Hybrid（垂直 → 水平）** — Pass 1 で境界契約、Pass 2 で内部不変条件。**Pass 2 では他パッケージとの相互作用を考慮不要にし、AI の判断面積をパッケージ局所に限定する**
11. **claim status automaton** — `observed` → `corroborated` → `challenged` → `human-approved normative` を状態遷移として定義する。**AI が文章上の強い語で勝手に昇格することを防ぐ**
12. **反例予算（counterexample budget）** — 高リスク命題は採用前に最低 N 種の反証探索を要求する。**N は証拠数ではなく独立手段とリスクで決める**。AI に「十分そう」と判断させない
13. **calibration / abstention ledger** — 後で人間が訂正した AI 判断をタイプ別に記録し、**確信表示の校正誤差を測る**
14. **safety-critical policy lane** — 認可・秘密・金銭・削除・tenant・暗号・監査・互換性を別レーンに分類し、**人間 authority と強い反証を必須化する**

#### 7.4.1 判断カードの粒度

カードの最小単位は「ファイル」でも「クラス」でもなく、**一つの可反証な命題**である。主語は次のいずれか**一つだけ**にする。

- 一つの境界越え: `consumer C が provider P の capability X を条件 Y で呼ぶ`
- 一つの状態遷移: `state A から B への遷移には guard G が必要`
- 一つの不変条件: `resource R の tenant_id は principal の tenant と一致する`
- 一つの失敗／回復契約: `timeout 時に operation O は再試行可能で冪等である`
- 一つのデータ系譜命題: `field F は ingress I から sink S へ変換 T を経て到達する`

**分割の判断は機械化できる。** 次のいずれかが異なれば別カードにする：主語・対象 resource・状態機械／適用 scope（flag・環境・tenant・API version）／反証方法または oracle／authority（誰が規範を決めるか）／risk class。

逆に、同一 scope・同一 oracle・同一 authority で同じ slice から検査できる複数の局所条件は、**一枚の「契約束」としてまとめてよい**。上限はトークン量ではなく、**反証計画が一意に書けるか**で決める。

> **判断疲れ（F7）への対策**: カードを「境界レベル（粗）」「契約レベル（細）」に階層化し、**境界レベルのカードが `unresolved` になった場合、その内部の契約レベルカードを生成しない**（遅延評価）。これでカードの爆発を防ぐ。

### 7.5 読者への具体的な依頼

> **本節は §0.2 の依頼 1〜4 を要約したものである。依頼の本体・回答形式・優先順位は §0 を参照。**

1. 7.1 の穴のうち、**我々が見落としているもの**は何か
2. 7.2 の手法のうち、**逆回転のどの段に・どの順序で**入れるべきか。また**挙げていない手法**は何か
3. 7.3 の暫定案のうち、**効果が薄いもの・危険なもの**は何か
4. 7.4 の思考支援の設計は十分か。**AI の判断面積をさらに削る**設計はあるか
5. **成功率が低いという事実**に対して、設計で打てる手は他にあるか（早期打ち切り、段階的検証、スコープ縮小、部分成功の定義など）

### 7.6 逆回転の失敗モード・カタログ

成功率が低いという事実を設計に反映するには、**どこでどう失敗するか**を先に列挙しておく必要がある。以下は我々が現時点で想定している失敗モードである。**この一覧に漏れがあることが十分にありうる**（7.8 節 D）。

| # | 失敗モード | 症状 | 検出手段 | 設計で打てる手 |
|---|---|---|---|---|
| **F1** | **追認 RFC** | 5つの整合性が表面上成立し、`/find-omissions` が循環論法で全通過する | 契約候補と RFC 由来契約の差分（GF2）。**差分ゼロは正常ではなく異常** | 判断カードで「偶然か意図か」を強制。差分を omission として必ず露出させる |
| **F2** | **赤の偽装** | 既存テストが green のまま Red 再建が省略される | R6 の変異候補に対する red の不在（`detect-untested-surface` / `detect-tautological-tests`） | S4 で Red 再建チケットを必ず生成。**red の証拠が無いチケットを `reviewed` にしない** |
| **F3** | **境界の誤推定** | 実装の偶然のディレクトリ割りが正典として固定される | T1（構造一致）は通るが、R2 の凝集度が低い / 境界跨ぎ呼び出しが過多 | 凝集度・境界跨ぎ回数を材料に差し出し、`/workspacify-tree` の AI 判断で過分割・誤境界を棄却 |
| **F4** | **静的解析の盲点** | DI / reflection / コード生成 / feature flag 経由の依存が丸ごと欠落する | 動的解析との差分。プロファイリングで観測された呼び出しがグラフに無い | 動的解析（7.2節 (c)）を必須または強く推奨に。少なくとも差分レポートを必ず出す |
| **F5** | **証拠の陳腐化** | 解析中に対象が変わり、evidence が指す行が別物になる | tree hash の不一致（5.4節） | R0 のハッシュを全 evidence に紐づけ、不一致を機械検出。worktree 固定を推奨 |
| **F6** | **契約の空文化** | 契約は書かれるがテストに翻訳されず、次の周回で omission が爆発する | `/find-omissions` の A / B / C 基準 | 契約の段階で「テスト可能な形に翻訳できるか」を機械検証（`testUnit` への対応付け） |
| **F7** | **判断疲れ** | AI の判断点が多すぎ、後半で判断が雑になる | 判断の差分追跡（7.4節 7）で揺れを検出 | 判断面積の削減（機械化）と給仕の強化。**判断カードの枚数そのものを指標にする** |
| **F8** | **スコープ爆発** | 大規模プロジェクトで解析が終わらない | 段ごとの所要時間・件数の計測 | 段階的・増分戦略（7.7節）へ切り替える |
| **F9** | **暗黙知の欠落** | 業務ルールがコードに現れず、RFC が技術的記述に終始する | `unresolved` の偏り（業務用語がゼロ） | residual を人間 grill へ確実に渡す。ドメイン専門家への質問を構造化して生成する |
| **F10** | **順回転の破壊** | 逆回転のための改修で順方向の出力が変わる | **順方向フィクスチャの `manifest_hash` のバイト不一致** | `mode` 分岐の徹底と加算のみの原則（6.0節）。回帰テストを必須ゲートにする |

> **F1 と F2 は「静かに成功する」失敗である。** 逆回転が最も危険なのは、派手に壊れるときではなく、**正しく見えたまま偽物ができる**ときである。

**専門家レビューで追加された失敗モード（F11〜F21）。** F1〜F10 を尊重しつつ、**時間・運用・データ進化・authority・security boundary** の失敗を独立に扱う。

| # | 失敗モード | 何が起きるか | 検出／緩和 |
|---|---|---|---|
| **F11** | **証拠独立性の錯覚** | 同じ実装由来のテスト・コメント・文書・履歴を複数の根拠と誤数えし、**追認を強化したと誤認する** | `lineage_edges` による系譜グラフ化と、保存された独立性集計ポリシー、独立ビュー最小数、反証経路の強制（5.5.2節） |
| **F12** | **未観測域の不存在化** | trace・検索・テストに現れない flag / tenant / 障害時 / 負荷時 / 旧 API 版を**「存在しない」と扱う** | scope lattice、coverage denominator、`unknown` を `absent` と合算しない、環境 matrix |
| **F13** | **時間的ドリフト** | RFC 再建後に依存・設定・schema・外部 API・デプロイが変わり、**証拠と規範が静かに古くなる** | claim → artifact 依存の index、`STALENESS-INDEX.json` による伝播、再審査の運用（Phase 3） |
| **F14** | **論理境界と物理境界の同一視** | 既存フォルダ・repo・deploy unit を**本来の責務境界として固定**してしまう | 物理／論理の二層モデル（T5）、`mappedNodeIds` 上の mismatch 記録、mismatch の residual 化 |
| **F15** | **安全・権限境界の追認** | 現在の認可不足・tenant 混線・秘密管理の不備を**「既存契約」として昇格**する | security lane、policy 抽出、negative authz テスト、人間 authority（Phase 4） |
| **F16** | **データ系譜・schema 進化の断線** | migration・イベント version・ETL・cache・検索 index・削除／保留義務が RFC に反映されない | lineage graph、schema 互換性、migration/replay テスト（**DB を持つプロジェクトのみ**） |
| **F17** | **oracle 共犯** | 実装・テスト・仕様化ハーネスが**同じ仮定を共有**し、差分も mutation も見逃す | differential / metamorphic oracle、**PBT 自動生成**、外部参照、独立実装、手動例示 |
| **F18** | **authority 漂流** | 誰が「これは規範」と決めたか不明になり、**AI 出力や古い会話が実質的な正典になる** | norm-setting record、`normative_authority`（役割 ID）、期限、撤回・再承認フロー |
| **F19** | **生成物・供給網の見落とし** | 生成コード・plugin・lockfile・build script・コンテナ・sidecar が動作を決めるのに **`src` だけで復元する** | build graph、SBOM、codegen provenance、artifact attestation（R0.5） |
| **F20** | **観測による攪乱** | tracing・fault injection・debug flag が**性能・順序・タイミングを変え、誤った挙動を観測する** | 低オーバーヘッド計装、観測差分試験、sampling metadata、再現試験 |
| **F21** | **未定義動作・バグの正典化** | 既存のバグや「たまたま動いている」未定義動作を**絶対の仕様として正典化**する。後続の順回転がそのバグを忠実に守るテストと実装を生成し続ける | R5 の `quarantine-suspicious-semantics.mjs` が code smell（エラーハンドリングの非対称性・デッドロック可能性等）を検出し、**`observed` な仕様として確定させず `unresolved` へ隔離**する |

> **F11 と F17 は同じ根を持つ。** どちらも「**同じ原因から生まれた証拠を、独立した複数の証拠と誤認する**」問題である。**F21 は F1 の最も危険な変種**であり、「既存の挙動を追認する」ことが「**既存のバグを仕様にする**」に達する。

### 7.7 段階的・増分戦略 — 「全部やる」以外の道

成功率が低い以上、**全域を一度に逆回転させる設計は賭けである**。次の段階的戦略を検討すべきである。

| 戦略 | 内容 | 長所 | 短所 |
|---|---|---|---|
| **スパイク方式** | 1ディレクトリで全工程を1周し、成否を人間が判定してからスコープを広げる | **「成功するか否か」を最も安く知れる** | 判定は人間の仕事（3.3節） |
| **ディレクトリ単位** | 対象を1モジュールに限定し、R0〜R8 をその範囲で実行する | 成功確率が高い。既存 workspacify の「ディレクトリ単位で回す」思想と一致 | モジュール間の境界契約が後回しになる |
| **境界優先** | 依存密度の高い境界から順に逆回転する | 効果の大きい箇所から確実に | 全体像が見えるまで時間がかかる |
| **テスト優先** | テストが充実した領域から着手する | Red 再建が容易 | テストが薄い領域（＝最も危険な領域）が最後になる |
| **並行逆回転** | 複数ディレクトリを並行して逆回転する | 時間短縮 | 境界契約の整合が後段で爆発しやすい |

> **推奨**: **スパイク方式から始める。** 1ディレクトリで `/workspacify-reverse` から `/crystalize-readme` まで1周し、そこに RESIDUE がどう出るかを人間が確認する。ここで成立しなければ、スコープを広げても成立しない可能性が高い。**これは「成功を機械が判定する」のではなく、「人間が判断する材料を最も安く得る」設計である。**

> **ただしスパイク方式には原理的な限界がある（専門家レビューによる指摘）。** 逆回転はボトムアップであり、**モジュール `A` の契約は、`B` が `A` をどう使っているか（incoming dependencies）を見なければ確定しない。** 1ディレクトリ単体で回すと外部からの利用文脈が欠落し、AI は矮小化された追認 RFC を生成しやすい。
>
> **対策は 2-Pass Hybrid への切り替えである**（下図）。1ディレクトリではなく、**1つの主要ユースケースが通る実行パス（垂直スライス）を先に走らせて境界契約を確定し、その後にパッケージ単位の水平掃海で内部契約を取る。** スパイクはこの垂直パスを最小構成で1本通す形に読み替える。

#### 7.7.1 2-Pass Hybrid — 垂直で境界、水平で内部

```text
Pass 1: 垂直スライス (Vertical Pass)
  └─ 主要ユースケースの実行パスに沿ってパッケージ間の「結合契約（I/O Boundary）」を確定する。

Pass 2: パッケージ水平掃海 (Horizontal Sweep)
  └─ Pass 1 で確定した境界の内側に閉じ、パッケージ単体のテストと AST 解析で
     「内部不変条件・状態遷移」を全数抽出する。
```

**この分離により、Pass 2 の実行時には他パッケージとの相互作用を考慮する必要がなくなり、AI の判断面積がパッケージ局所に限定される。**

#### 7.7.2 スコープ選択は人間が行う（3パス・メニュー）

機械は**解読可能性のプロファイル**（Feasibility Index 等）を提示するが、**閾値による自動ルーティングを行ってはならない**（固定閾値は対象ドメイン・規制・規模に無関係な偽の基準になる）。提示された材料を見て、**人間が次のいずれかを選ぶ**。

| メニュー | 前提の目安 | パイプラインの動作 | 手戻りリスク |
|---|---|---|---|
| **[A] フル逆回転** | ビルド・テスト・履歴・観測が揃っている | 全パッケージに対し R0〜R8 を走らせる | 低 |
| **[B] ドメイン垂直スライス指定** | 一部の前提が欠ける | 特定のコアパスにスコープを閉じて逆回転する | 中（境界外は未確定のまま残す） |
| **[C] 構造定義のみのスケルトン出力** | 前提が大きく欠ける | ディレクトリ構造と型シグネチャ（R1〜R3）のみを抽出。**契約は生成しない** | 高（RFC は手動主導） |

> **これは「機械が可否を判定する」のではない。** スコアは材料であり、**どの未確定が受容不能かは人間が決める**（3.3節）。小規模な社内ツールでは外部境界の未知が数件でも進める判断があり得るが、認証・決済・医療・マルチテナント基盤では同じ値が正典化停止の理由になる。

#### 7.7.3 部分成功の定義（9章の設計問題 6 に対する回答）

| 水準 | 状態 |
|---|---|
| **L0** | 解析は走るが、RFC が追認に終始している（F1） |
| **L1** | 一部のディレクトリで RESIDUE 0 に到達 |
| **L2** | 全ディレクトリで RESIDUE 0。ただし Red 再建が未完（F2） |
| **L2.5** | 静的・動的な型／依存／境界カバレッジが 100% 証明され、**機械が証明できなかった oracle 共犯の疑い（テストが `isNotNull` しか見ていない等）が全件 `unverified_oracle_risk` として `Tickets.json` にマーキング済み**。人間がそのリスク一覧を確認する |
| **L3** | RESIDUE 0、かつ Red 再建の証拠が全チケットに存在し、**人間が成功と判断** |

**L3 以外を「成功」と呼んではならない。** ただし L1・L2・L2.5 は**価値のある中間成果**であり、人間が次にどこへ投資するかを決める材料になる。**L2.5 は「機械は『100% 成功した』と嘘をつかず、機械的証明の限界に達してリスクを全数可視化した」状態**である。

### 7.8 専門家へのレビュー観点チェックリスト

> **本節は §0.2 依頼 4（妥当性の検証）を中心としたチェックリストである。回答形式は §0.3 を参照。**
>
> **第1ラウンドのレビューは完了し、残った論点も解決済みである。** 本チェックリストは**第2ラウンド以降の読者**のために保持する。第1ラウンドの指摘と裁定（採用／修正／却下）は **11章** に、**7つの論点の解決は 11.5 節**に記録した。**同じ指摘を繰り返す必要はない。**

以下は、本設計に対して我々が明示的に答えを求めている問いである。**すべてに答える必要はない。確信のあるものから指摘してほしい。**

**A. 原理について**

- [ ] 4.5 節の設計原理（決定論の極大化・非決定論の極小化・給仕の極大化）は正しい方向か。**原理自体に欠陥はないか**
- [ ] 3.3 節「成功の判定は人間が行う」は妥当か。それとも機械化できる部分が残っているか
- [ ] 6.0 節の「順回転を壊さない」ための不変条件（モード分岐・加算のみ・ハッシュ一致）で十分か

**B. 解析の配置について**

- [ ] 6.2 節の R0〜R8 の**順序**は妥当か。入れ替えるべき段はあるか
- [ ] 6.10 節のデータフローに**欠けている辺**はないか
- [ ] 7.3 節の「段 × 追加候補」の対応で、**誤った段に置いているもの**はないか
- [ ] 各段で**新たに必要になる決定論的ゲート**は何か

**C. 手法について**

- [ ] 7.2 節に**挙げていない手法**は何か（とくに実務で効果が実証されているもの）
- [ ] 挙げた手法のうち、**逆回転には向かないもの**は何か
- [ ] 動的解析を**どこまで必須**にすべきか（コストと精度のトレードオフ）

**D. 失敗について**

- [ ] 7.6 節の失敗モードに**漏れ**はないか（**F1〜F21 のどれよりも危険な失敗があるか**）
- [ ] 各失敗モードの「設計で打てる手」は十分か
- [ ] **この挑戦を中止すべき判断基準**は何か（早すぎる撤退も、遅すぎる撤退も避けたい）

**E. 判断支援について**

- [ ] 7.4 節の8つの仕掛けは十分か。**AI の判断面積をさらに削る**設計はあるか
- [ ] 判断カードの粒度は適切か（粗すぎれば判断が雑に、細かすぎれば枚数が爆発する）
- [ ] 人間の専門家（ドメイン知識保有者）を**どこでループに入れる**のが最も効果的か
- [ ] 3.6 節の適格条件は妥当か。**見落としている前提条件**はないか

---

## 8. zg（zvec-grep）の活用

詳細は別紙 **`ZG-FOR-REVERSE.md`** を参照。ここでは conver 逆回転への組み込み方と、環境構築の要点を記す。

### 8.1 zg とは

`zg` は **zvec-grep** の CLI である。ローカルワークスペースを索引化し、4つの検索経路を単一の操作系に統合する。

| 検索経路 | 使う場面 | 代表例 |
|---|---|---|
| ripgrep 互換（`--rg`） | 文字列・識別子・パス・正規表現を**漏れなく**探す | `AuthService`、`/v1/token`、エラーコード |
| BM25（`--fts`） | 既知の語を関連度順に集める | `session revoke`、`TLS handshake` |
| ベクトル（`--vector`） | 実装上の命名を知らず、**概念から**探す | 「資格情報はどこで検証されるか」 |
| ハイブリッド（既定の `zg query`） | 語と意味の両方で、入口不明の構造を探索する | 「起動時に設定を復元する流れ」 |

**これが逆回転に効く理由**: 索引検索はファイル・シンボル・行などの**出所情報を伴う候補**を返す。したがって、LLM や人間の「もっともらしい説明」を採用するのではなく、**検索結果のパス・行・原文を一次証拠として読み、結論を検証する**用途に向く。これは本設計の「evidence 必須」原則と完全に一致する。

### 8.2 逆回転への組み込み方（提案）

| 段 | zg の使い方 | 注意 |
|---|---|---|
| R1 / R2 | `--rg` による識別子・パス・エラー文字列の**完全列挙** | 決定論的な確定に使える |
| R3 | 既定ハイブリッド／`--vector` で**契約候補・不変条件・状態機械の候補を発見** | **候補発見であり完全列挙ではない** |
| R4 | コミットメッセージ・CHANGELOG・コメントから「なぜ」の候補を収集 | 候補発見 |
| R5 | エラーコード・設定キー・feature flag の全参照列挙 | `--rg -F` で完全確認 |
| 全段 | 発見した結論は**必ず原文を開いて検証**し、パス・行を証拠として記録 | 検索ヒットだけで制御フローを確定しない |

> **重要な位置づけ**: zg のベクトル／BM25 検索は**モデル依存であり決定論ではない**。したがって zg は **「給仕（材料屋）」の層**に置く。**確定（証明）には使わない**。確定は `--rg` による完全列挙と、AST／型に基づく決定論的解析で行う。この切り分けは 2.5 節の三層の境界と一致する。

### 8.3 環境構築（完全情報）

**(1) Node.js 22 以上と zg の導入**

```bash
node --version          # 22 以上が必要
npm --version
npm install -g @zvec/zvec-grep
zg version
zg help
zg help index
zg help query
```

`npm` 成功後も `zg: command not found` なら、npm のグローバル bin が `PATH` に無い。mise / nvm / fnm / Volta 等の設定を確認し、再ログイン後に `command -v zg` を実行する。

> **オプションはリリースで変わり得る。本節の例を流用する前に、導入した版の `zg help <command>` を正とすること。**

**(2) 対象の固定と衛生確認**

```bash
git clone <authorized-repository-url> target-repo
cd target-repo
git status --short
git rev-parse HEAD
git submodule status --recursive
find . -maxdepth 3 \( -name '.env' -o -name '*.pem' -o -name '*.key' \) -print
```

解析の再現性を優先するなら、**専用 worktree または固定コミット**を使う。ビルドや依存取得の**前に**初回索引を行えば、`node_modules` 等のノイズを持ち込む危険を減らせる。

**(3) 埋め込みモデルの選択**（ローカルモデルの既定ダウンロード先は `~/.zvec-grep/models`）

| プロジェクト特性 | 推奨開始モデル | 留意点 |
|---|---|---|
| 主にコード、初回の速度重視 | `local/potion-code-16m-v2` | Potion 系は GPU で高速化されない |
| 日本語を含む仕様・コメント・多言語文書 | `local/potion-multilingual-128m` または `local/multilingual-e5-small` | 初回時間・メモリを測定する |
| 多言語かつ長いコード・文書 | `local/jina-embeddings-v2-base-code` | ONNX Q8。CPU/GPU 設定を検証する |
| 品質優先の多言語コード・文書 | `local/embeddinggemma-300m` または `local/qwen3-embedding-0.6b` | 端末性能・レイテンシを測る |

Transformer/GGUF 系は `ZVEC_GREP_DEVICE=auto|cpu|metal|vulkan|cuda` を設定できる。Apple Silicon なら `metal`、CUDA 環境なら `cuda` を試す価値がある。**モデルを変えるとベクトル空間が変わるため、既存索引のまま比較してはいけない。モデル変更には再構築が必要である。**

**(4) 初回索引**

```bash
cd /absolute/path/to/target-repo
zg index --embedding local/potion-code-16m-v2
zg status
```

`.zvec-grep/` がワークスペース直下に作られる。**Git 管理しない**：

```bash
printf '\n# local zg index\n.zvec-grep/\n' >> .gitignore
```

> 既に追跡済みの `.zvec-grep/` がある場合は、チームの合意を得て `git rm -r --cached .zvec-grep` を行う。これは Git の追跡状態を変更する操作なので、勝手に実行しない。

成功後、4経路を一度ずつ実行して対象が期待通り読めているか確認する：

```bash
zg query --human --limit 8 "起動時に設定を読み込み、永続化状態を復元する処理"
zg query --fts --human --limit 10 "authentication session token"
zg query --vector --human --limit 8 "where access credentials are validated and rejected"
zg query --rg -n -F "AuthService" src
```

失敗・スキップが疑われる場合：

```bash
zg index --debug
zg status --mode direct --debug
zg query --debug "authentication flow"
```

大規模リポジトリでは、いきなり全域を索引せず、`zg help index` で関連ディレクトリ・glob・型・ignore・深さ・最大ファイルサイズを確認してスコープする。**スコープ設定は最初の索引に保存され、既存索引はその設定を再利用する**（広げたい場合は `--reset-paths`）。

**(5) エージェント接続（任意）**

```bash
zg install
zg install --target opencode --yes    # 非対話で特定エージェントのみ
```

設定後、エージェントを再起動する。既定で公開される MCP ツールは `zvec_grep_search` のみであり、**索引作成・再構築・削除は明示的 CLI 操作に留められる**（エージェントが勝手に永続索引を変更しない）。

**(6) 索引の鮮度を保つ運用**

| 状況 | 実行 |
|---|---|
| 通常のソース変更を反映 | `zg index`（増分更新） |
| 今のクエリだけ最新で検索したい | `zg query --refresh wait "..."` |
| 対話検索で待ち時間を減らしたい | `zg query --refresh background "..."`（freshness を確認） |
| 状態や失敗を確認 | `zg status`、必要時 `zg status --mode direct --debug` |
| 埋め込みモデルを変更 | `zg index --rebuild --embedding <new-model>` |
| 保存済みスコープを置換 | `zg index --reset-paths ...` |
| 索引を廃棄 | `zg index --drop --yes`（破壊的） |

`--rebuild` を「更新のたび」に使わない。**再構築はモデル変更または保存済み設定を意図的に替える場合に限定する。**

Git hook（`post-merge` / `post-checkout`）で更新を自動化する場合は、並行実行を避けるロック付きラッパーを介する。`.git/hooks/` は通常 Git 管理されないため、チーム配布には `core.hooksPath` やセットアップスクリプトを用いる。バックグラウンド実行は `possibly_stale` な結果を返し得るので、直後の厳密な調査は `--refresh wait` を使う。

**(7) 調査品質のチェックリスト**

- 検索ヒットだけで制御フローを確定しない。呼び出し元・呼び出し先・条件分岐・例外・テストを読む
- 動的ディスパッチ、reflection、DI、コード生成、macro、feature flag、環境変数、非同期キュー、plugin は**静的検索だけで欠落しやすい**。実行時検証を計画する
- `possibly_stale` の結果を設計レビューの確定根拠にしない
- **変更作業をするエージェントと、証拠を集めるエージェントの役割を分ける**。前者にはテスト・diff を、後者にはパス・行・根拠を要求する

**(8) 限界とセキュリティ**

- PDF、Office 文書、アーカイブ、コンパイル成果物、DB、音声・動画、空ファイル、バイナリ判定ファイル、サイズ上限超過ファイルは**既定で索引化されない**
- `zg` は逆コンパイラ、動的トレーサ、デバッガ、SAST の**代替ではない**。バイナリや実行時挙動の解明には Ghidra/IDA、デバッガ、eBPF、テストなどを併用する
- 機密コードでは**ローカル埋め込みモデルのみ**を用いる。**リモート埋め込みは、認証情報の設定だけでは送信許可にならず、明示的な許可が必要である**
- 索引とモデルキャッシュを、共有キャッシュ・外部 artifact・リモートログへ不用意に出さない
- 対象は**自組織のソース、明示的に許可を得た顧客・OSS・監査対象**に限る。アクセス制御の回避、ライセンス違反、秘密情報の持出し、第三者サービスへの不正アクセスを目的とした利用は対象外

---

## 9. 設計問題と現在地

1. **`ORIGIN-LONG-SPEC` の実在ファイル接地** — 逆回転の `ORIGIN-LONG-SPEC` は既存実装を記述するが、順方向の RFC は「これから作るもの」を記述する。同じスキーマで扱えるのか、`languageRules` 相当の拡張が要るのか
2. **逆方向情報の `RFC-SEED.md` への格納先** — **解決**。**§1 の機械注入内容を拡張する**（15番目の見出しは作らない）。`seed-parse.mjs:48` が `headings.length !== SEED_REQUIRED_SECTIONS.length` で完全一致を強制しているため、見出し数を変えると順回転が壊れる
3. **Red 再建の実行主体とタイミング** — `/split-to-tickets` が生成した Red 再建チケットを、実装ループのどこで実行するか。違反注入は既存実装を一時的に壊すため、**作業ツリーの隔離**が必要
4. **既存ファイルへの `[::TICKET::]` プロベナンス注釈の一括後付け** — `drill-rfc-down` の `refresh-file-headers.js` に前例はあるが、プロジェクト全体への一括適用の是非
5. **動的解析の実行許可とコスト** — テスト実行・ファジング・シンボリック実行は時間と計算資源を要する。どこまでを必須とし、どこからを任意とするか
6. **スコープの動的縮小** — 大規模プロジェクトで「全部やる」が不可能なとき、**部分成功をどう定義するか**
7. **再現性の保証水準** — 決定論的部分について「同一入力から同一 `ORIGIN-LONG-SPEC`」をどこまで要求するか
8. **既存実装の「正しさ」の扱い** — 既存実装が仕様に反している可能性を、どの段でどう表面化させるか（追認を避ける機構の具体化）

**第1ラウンドの専門家レビューを経た、各問題の現在地**

| # | 問題 | 現在地 | 参照 |
|---|---|---|---|
| 1 | `ORIGIN-LONG-SPEC` の実在ファイル接地 | **方針確定**（接地検証を T3 として新設。スキーマ拡張の詳細は未了） | 6.3節 |
| 2 | 逆方向情報の `RFC-SEED.md` への格納先 | **解決**（**§1 の機械注入内容を拡張**。15番目の見出しを作らないので `seed-parse.mjs` の見出し数チェックを触らない） | 6.4節 A4 / 6.12.3節 |
| 3 | Red 再建の実行主体とタイミング | **手段確定**（invariant mutation / TCE / PBT 自動生成）。実行順序とツリー隔離は未了 | 6.2節 R5.5・R6.5 / 7.4節 |
| 4 | `[::TICKET::]` の一括後付け | **解決**（**一括適用しない**。ループが触れたファイルに限定し、一括適用は L3 到達後の別作業とする） | 11.5節 R-4 |
| 5 | 動的解析の実行許可とコスト | **解決**（必須／任意を手法で線引きせず、**命題の分類**で決める。動的機構が関与する命題は動的証拠なしに `observed` と名乗れない） | 11.5節 R-1 |
| 6 | スコープの動的縮小 | **方針確定**（3パス・メニューを人間が選ぶ。L0〜L3 を定義） | 7.7.2節・7.7.3節 |
| 7 | 再現性の保証水準 | **方針確定**（順方向フィクスチャの `manifest_hash` バイト一致を必須ゲートに） | 6.0節 |
| 8 | 既存実装の「正しさ」の扱い | **機構確定**（F21 として独立。`quarantine-suspicious-semantics.mjs` で `unresolved` へ隔離） | 7.6節 F21 |

**第1ラウンドの時点で未決だった 4 と 5 も解決した。** これを含め、**11.5 節の7論点（R-1〜R-7）はすべて解決済みである。** 残る作業は設計判断ではなく**実装と実測**（とくに R-7 のスパイク計測）である。

| 論点 | 解決の要点 | 参照 |
|---|---|---|
| **R-1** 動的解析の必須／任意 | 手法で線引きせず**命題の分類**で決める。動的機構が関与する命題は動的証拠なしに `observed` と名乗れない | 11.5節 |
| **R-2** equivalent mutant の言語別実装 | **言語ごとの正規化手段**で比較する。証明するのは**名指しした構成の下での構文等価（TCE）**であり意味的等価ではない。決定不能性は `ORACLE-GAP` への分類で扱う | 11.5節 |
| **R-3** PBT 自動生成 | **生成できる範囲を限定**（入力生成器＋既知カテゴリの性質）。分類できなければ `unresolved` | 11.5節 |
| **R-4** 注釈の一括適用 | **しない。** ループが触れたファイルに限定する | 11.5節 |
| **R-5** 中止判断基準 | 機械は判定しない。**W1〜W6 の観測**を提示し、人間が撤退を決める | 11.5節 |
| **R-6** 境界外の扱い | **`out_of_scope` という第一級の状態**。跨ぐ依存は切らない | 11.5節 |
| **R-7** 判断カードの総量 | **スパイクを計測装置として使う。** Phase 0 の完了条件に計測レポートを含める | 11.5節 |

---

## 10. 用語集

| 語 | 意味 |
|---|---|
| **順回転（forward rotation）** | `spec.md` から始まり、正典 RFC を公理として4層ループを回す既存の流れ |
| **逆回転（reverse rotation）** | 既存実装から始まり、`ORIGIN-LONG-SPEC` を経て4層ループへ合流させる新しい流れ |
| **正典（canon）** | 設計判断の唯一の起点となる RFC |
| **正典 RFC** | 各ディレクトリの設計判断を集約した RFC |
| **workspacify** | 第5層。仕様書をワークスペース／ディレクトリ構造へ分解し、結合契約を機械可読に確定する |
| **RFC-SEED.md** | 各パッケージに1つ置かれる RFC の種。`/grill-me-for-rfc` の入力 |
| **self-grill** | AI が自分自身を敵対的にレビューし、findings が 0 になるまで収束させる機構 |
| **residual** | 解けなかった問い。`grill_question` を伴い、後段の人間 grill へ構造化して引き継がれる |
| **RESIDUE** | `/crystalize-readme` が README 内に残す「書けないセクション」。証拠＋実装補強設計 |
| **omission** | `/find-omissions` が検出する「契約がテストへ正しく翻訳されていない」ギャップ |
| **WIG** | Workspace Integration Graph。抽出された契約が作る結合グラフ。履行不能な結合等を違反として検出 |
| **追認 RFC** | 既存コードを文章化しただけの RFC。5つの整合性が表面的に成立するが実質は偽の green |
| **Red 再建** | 既存実装のテストが最初から green である問題に対し、違反注入等で red の証拠を遡って生成すること |
| **給仕** | 非決定論的判断の直前に、判断に必要な材料を親切に差し出すスクリプトの役割 |
| **`[::STUB::]`** | 不完全実装を示す必須マーカー。`Malfeasance.json` に記録され、解決まで次に進めない |
| **契約（Contract）** | I/O 境界に付与される Precondition / Postcondition / Invariant。テスト可能な形に翻訳されて初めて仕様として成立する |
| **provenance 4値** | 逆回転で生まれる全記述の分類。`observed`（証拠必須）/ `inferred`（根拠必須）/ **`normative`（`normative_decision_id` 必須）** / `unresolved`（`grill_question` 必須） |
| **`normative`** | 人間の選択によって規範として確定した命題。**「実装から観測された」は規範ではない。** 規範条項は provenance 鎖（5.5節）が途切れていてはならない |
| **証拠の系譜グラフ** | `lineage_edges`。証拠間の**観測可能な**関係（同一構文範囲・同一生成器・同一コミット・同一 guard・同一失敗経路）と、その強さ・確信度・根拠。**同一 PR の実装・テスト・README は1グループとして折りたたまれ、3本の独立証拠ではない**（5.5.2節） |
| **独立性の集計ポリシー** | `independence_policy`。強い関係で結ばれた連結成分を1票として数える規則。evidence と一緒に保存され、後から人間が訂正できる。**`independence_assessment: "unknown"` は正当な値であり、失敗ではない**（5.5.2節） |
| **evidence_mode** | `source_static` / `build_semantic` / `runtime_dynamic`。**`observed` はソーステキスト／構文木から読めた事実のみ**を指すため、実行時挙動・動的ディスパッチ先・生成後コードを主張する evidence は、より弱い mode を明示する（5.5.2節） |
| **scope lattice** | 命題の適用範囲（commit / 環境 / flag / tenant / API version / 時刻）を機械比較する仕組み。**未観測域の不存在化（F12）を防ぐ** |
| **判断カード** | AI の判断点ごとに「問い / 選択肢 / 帰結 / 証拠 / 反例 / 既定値」を Markdown で差し出す仕掛け（7.4節） |
| **アブダクション** | 最良の説明への推論。順方向の演繹に対し、逆方向が本質的に必要とする推論形式 |
| **CPG（Code Property Graph）** | AST + CFG + PDG を統合したコードグラフ。Joern が代表実装。データフロー・テイント解析に使う |
| **SCIP / LSIF / Kythe** | 言語非依存のコードインテリジェンス索引。定義・参照・型を正確に解決する |
| **DSM（依存構造行列）** | モジュール間依存を行列で表し、クラスタリングと違反検出に使う |
| **リフレクションモデル** | 設計意図と実装の差分を明示的に扱うアーキテクチャ復元手法 |
| **動的不変条件推論** | 実行トレースから不変条件を推論する手法。Daikon が代表実装 |
| **ミューテーションテスト** | 実装に人工的な欠陥を注入し、テストがそれを検出できるか測る。**Red 再建の中核** |
| **コンコリック実行** | 具体実行とシンボリック実行を組み合わせ、経路制約から事前条件を復元する |
| **ゴールモデル** | 要求工学における目的・目標の階層構造。KAOS / i* が代表。コードからの逆抽出が課題 |
| **仕様マイニング** | テスト・実行履歴・API 使用例から事前条件／事後条件を抽出する手法群 |
| **論理結合（logical coupling）** | git 履歴上「一緒に変更される」ファイル群。設計上の結合の傍証になる |
| **スパイク方式** | 1ディレクトリで全工程を1周し、成否を人間が判定してからスコープを広げる戦略（7.7節） |
| **部分成功 L0〜L3** | 逆回転の中間成果の水準。**L3（RESIDUE 0 かつ Red 再建の証拠が全チケットに存在）以外を成功と呼ばない**（7.7.3節）。**L2.5** は「機械的証明の限界に達し、oracle 共犯の疑いを全件可視化した」状態 |
| **provenance 鎖** | `RFC clause → claim_id → normative_decision_id → residual_id → evidence_bundle_hash → evidence`。**鎖の無い規範条項は `normative` に分類できない**（5.5節） |
| **sidecar 正本** | `CLAIM-LEDGER.json` 等。不確実性の**唯一の正本**であり、順回転成果物は複製を持たない（6.12節） |
| **`ref_hashes`** | sidecar が保持する順方向参照のハッシュ。**GRAPH 再生成などでノード ID が変われば `stale` として機械検出**される（6.12.2節） |
| **judgement の階層化** | 判断カードを「境界レベル（粗）」「契約レベル（細）」に分け、**境界が `unresolved` なら内部のカードを生成しない**（遅延評価。F7 対策） |
| **Phase −1** | コードを書く前に計画の基盤を固める段。**回帰ゲートのベースライン採取・最小スパイク・受け入れ基準の確定**を含む（6.13.1節） |
| **回帰ゲート** | 順方向フィクスチャの `manifest_hash` が改修前後でバイト一致することを検査する gate。**「順回転を一切破壊しない」の唯一の証明** |
| **受け入れ基準** | 各新設ゲートの「何を検出したら FAIL か」。**これが無いゲートは存在しないのと同じ**（6.14節） |
| **`out_of_scope`** | スコープ縮小時の境界外を表す第一級の状態。「不在」と書いてはならない（R-6。F12 と同じ規律） |
| **F1〜F21** | 逆回転の失敗モード・カタログ（7.6節）。**F1（追認 RFC）と F2（赤の偽装）は静かに成功する失敗である**。F11〜F21 は専門家レビューで追加された |
| **Feasibility Index** | プロジェクト解読可能性のプロファイル。**閾値による自動ルーティングを禁ずる**。人間がスコープを選ぶ材料（7.7.2節） |
| **2-Pass Hybrid** | Pass 1 垂直スライスで境界契約、Pass 2 水平掃海で内部契約（7.7.1節） |
| **normative_decision** | grill の結果を「承認待ち」ではなく**選択イベント**として記録するもの。`authority_record` / `normative_effect` / `rejected_alternatives` を持つ |
| **authority_record** | `authority_kind` / `authority_ref`（**役割・チームの安定 ID。個人名ではない**）/ `decision_basis` / `decision_timestamp` |
| **capability profile** | 適格性の可否ではなく、能力・可観測性・反証可能性・危険のプロファイル。`eligible: true/false` を出さない（R0.5） |
| **reverse_provenance** | reverse mode の manifest にのみ載る追加ブロック。sidecar bundle hash と件数要約。**`COMPLETE` の意味は変えない** |
| **案2.5-refined** | 不確実性の正本を sidecar に置き、**順回転成果物へのフィールド追加はゼロ**。sidecar が順方向参照と `ref_hashes` を持つ設計（6.12節） |
| **TCE（Trivial / syntactic / compiler-normalisation Equivalence）** | 変異コードを正規化し、AST 一致で等価ミュータントを機械的に廃棄する手法（R5.5）。**証明するのは名指しした構成の下での構文等価であり、意味的等価ではない。** 一般プログラムの意味等価性は決定不能 |
| **invariant mutation** | コードを変異させず、guard clause・schema 検証・アサーションを No-op 化して Red 不在を確実に判定する手法 |
| **PBT（プロパティベーステスト）** | R3 の不変条件から自動生成し、**oracle 共犯（F17）を破る**手段 |

---

## 11. 専門家レビューの反映 — 採用・修正・却下の記録

### 11.1 実施概要

| 項目 | 内容 |
|---|---|
| レビュアー | 2名（別々に実施。相互の回答は見ていない） |
| ラウンド | 2回（初回レビュー → 追加質問 → 回答） |
| 成果物 | `docs/REVIEW-1-FOR-ABOUT-REVERSE.md` / `docs/REVIEW-2-FOR-ABOUT-REVERSE.md` |
| 本節の目的 | **何を採用し、何を修正し、何を却下したかを記録する。** 特に**両者が対立した論点の裁定根拠**を残し、後から再検証できるようにする |

**両者は主要線で独立に一致した。** 一致した指摘は最も信頼度が高い。対立は1点のみ（6.12節の provenance 伝播）で、これは実装の事実確認により裁定した。

**第1ラウンドで残った7論点も、本節の執筆時点ですべて解決済みである**（11.5節 R-1〜R-7）。**未解決の設計問題は残っていない。** 残る作業は設計判断ではなく実装と実測である。

---

### 11.2 採用（確定）

**A. 命題と証拠のモデル**

| # | 採用内容 | 反映先 |
|---|---|---|
| 1 | **provenance を3値 → 4値**（`observed` / `inferred` / **`normative`** / `unresolved`） | 5.5節 |
| 2 | **`normative` は人間の選択によってのみ成立**し、「実装から観測された」は規範ではない | 5.5節 |
| 3 | **規範条項の provenance 鎖を必須化**（RFC clause → claim → normative_decision → residual → evidence bundle → evidence） | 5.5節 |
| 4 | 命題の必須フィールド（`claim_id` / `claim_type` / `scope` / `support` / `counterevidence` / `falsification` / `review_state` / `normative_authority`） | 5.5.1節 |
| 5 | **証拠の系譜グラフと独立性の集計ポリシー**（`lineage_edges` / `independence_policy` / `evidence_mode`）。**同一実装由来の証拠を独立と数えない** | 5.5.2節 |
| 6 | **scope lattice** と `coverage_status`。**未観測を「確認済み」と分離** | 6.9節・6.2節 R3.5 |
| 7 | **residual の `normative_context` 拡張**（既存5フィールドは不変） | 6.5節 G4 |
| 8 | **`normative_decision` を選択イベントとして記録**（承認待ち状態を作らない） | 6.5節 G4 |
| 9 | **`authority` は役割・チームの安定 ID**（個人名ではない） | 6.5節 G5 |
| 10 | **回答なしのリスク別既定値**（低＝provisional／中＝provisional＋再審査条件／高＝規範へ昇格させず unresolved／安全・権限・金銭・削除＝保守的安全側既定） | 6.5節 G4 |

**B. 段と配置**

| # | 採用内容 | 反映先 |
|---|---|---|
| 11 | **R0.5 解析スコープ確定**（権限・秘密除外・対象環境・外部送信方針・ビルド provenance） | 6.2節 |
| 12 | **R2.5 実行面の実測**（DI / reflection / plugin / flag / queue / RPC / sidecar / 外部 SaaS）＋ 静的・動的の**差分計測** ＋ 構成空間の在庫 | 6.2節 |
| 13 | **R3.5 証拠の三角測量**（claim ledger の構築と独立性判定） | 6.2節 |
| 14 | **R5.5 oracle の妥当性**（mutation 生存原因の分類、equivalent mutant の除去） | 6.2節 |
| 15 | **R6.5 能動的反証**（隔離環境での反証実行、反例の claim ledger への逆流） | 6.2節 |
| 16 | **R7.5 は新設しない** — 人間の規範設定は既存の residual → grill → RFC へ吸収する | 6.2節・6.12節 |
| 17 | **`unknown` を第一級の delta にする**（`convergent` / `divergent` / `absent` / **`unknown`**）。**`unknown` を `absent` と合算しない** | 7.4節 9・7.6節 F12 |
| 18 | **T5 論理／物理の分離**（mismatch を first-class な residual にする） | 6.3節 |
| 19 | **A6 provider packet に incoming dependencies の実装抜粋を含める** | 6.4節 |
| 20 | **S5 counterexample_plan_id の必須化** / **S6 driving refs** | 6.8節 |

**C. 反証と判断支援**

| # | 採用内容 | 反映先 |
|---|---|---|
| 21 | **invariant mutation**（guard / schema / assertion の No-op 化で Red 不在を確実に判定） | 6.2節 R5.5 |
| 22 | **TCE（Trivial Compiler Equivalence）** による等価ミュータントの機械的廃棄 | 6.2節 R5.5 |
| 23 | **PBT 自動生成**による oracle 共犯の破壊 | 6.2節 R6.5 |
| 24 | **カード駆動 Reflexion Modeling**（人間はモデルの作者ではなく候補間の裁定者） | 7.4節 9 |
| 25 | **2-Pass Hybrid**（垂直で境界契約、水平で内部契約） | 7.7.1節 |
| 26 | **判断カードの粒度は「一つの可反証な命題」**、分割規則と階層化（遅延評価） | 7.4.1節 |
| 27 | **claim status automaton** / **反例予算** / **calibration ledger** / **safety-critical lane** | 7.4節 11〜14 |
| 28 | **capability profile**（`eligible: true/false` を出さない。`can_prove` / `cannot_prove` を明示） | 7.7.2節 |
| 29 | **固定閾値をゲートにしない** | 7.7.2節 |

**D. provenance の配置**

| # | 採用内容 | 反映先 |
|---|---|---|
| 30 | **案2.5-refined** — 正本は sidecar、順回転成果物へのフィールド追加はゼロ、sidecar が順方向参照と `ref_hashes` を持つ | **6.12節** |
| 31 | **状態フィールドの名前空間分離**、`COMPLETE` の意味不変、`semantic_review` と `authority` の非統合 | 6.0節 |
| 32 | **`stale` は別軸の警告**（`COMPLETE` を取り消さない） | 6.0節・6.9節 |
| 33 | **実装フェーズ Phase 0〜4** | 6.13節 |

---

### 11.3 修正して採用

| 指摘 | 修正内容 | 理由 |
|---|---|---|
| **Feasibility Score による自動 BLOCKED** | **スコアは提示材料。ルーティングは人間が選ぶ**（7.7.2節） | conver の中核原則「機械は証明だけを語り、成功判定は人間が行う」と真っ向から衝突するため |
| **人間への自由記述（ドメイン語彙のカスタム定義）** | **採用可**。ただし必ず選択肢と既定値を併置する | conver が禁じているのは**作業の差し戻し**（`ask the human` / `waiting for approval`）であって、**人間がドメイン知識を供給すること**ではない。`/grill-me-for-rfc` は元々対話セッションである |
| **claim_id を全成果物へ伝播** | **`reverse_provenance`（manifest）＋ 層 B の任意フィールドに限定**（6.12.3節） | 順回転のスキーマ・ハッシュ・WIG・実装順序を侵食しないため |
| **スパイク方式の推奨** | **2-Pass Hybrid に読み替え**（7.7節） | 逆回転はボトムアップであり、1ディレクトリ単体では外部からの利用文脈が欠落するため |

---

### 11.4 却下・保留

| 対象 | 判定 | 理由 |
|---|---|---|
| 案1（全成果物に全 ID・状態を伝播） | **却下** | ハッシュ・WIG・reload に広く波及し、順回転を侵食する |
| R7.5 独立段（人間承認ゲート） | **却下** | 承認待ち状態は conver の禁止語彙と衝突する。既存 residual → grill へ吸収する |
| 「L3 には到達しない」という断定 | **却下** | 根拠（oracle 共犯）は正しいが結論が強すぎる。PBT 自動生成・differential oracle という破る手段が存在する |
| CEGAR / Datalog ポインタ解析 / Active Automata Learning | **保留** | 学術的に強力だが、JS/TS の実用ツールチェーンでは前提が重い。**対象言語とプロジェクト特性で選ぶ任意段**とする |
| Data lineage / schema 進化解析 | **条件付き採用** | DB を持つプロジェクトでは必須、持たないプロジェクトでは不要（F16） |
| SBOM / ビルド provenance | **採用**（R0.5 に格上げ） | 実務的で安価。`src` だけで復元する誤り（F19）を防ぐ |

---

### 11.5 第1ラウンドで残った論点と、その解決

第1ラウンドで未回答として残った7論点は、**すべて解決済みである。** 以下、各論点への回答を示す。

---

#### R-1 動的解析の必須／任意 — **問いの立て方を変える**

「どの手法を必須にするか」ではなく、**「どの命題が `observed` と名乗れるか」**で決める。

| 命題の種類 | 動的解析 | 理由 |
|---|---|---|
| 静的に確定できる（型・公開面・import・スキーマ・エラー型） | **不要** | 静的解析だけで `observed` と名乗れる |
| **動的機構が関与する**（動的ディスパッチ / DI / reflection / plugin / feature flag / 環境変数 / 非同期キュー / サービスディスカバリ） | **必須** | 動的証拠が無ければ `observed` と名乗れない |
| 動的機構が関与し、**かつ高リスク** | **必須 ＋ 反例計画の対象** | 反証探索まで要求する |

**機械的強制**: `EXECUTION-SURFACE.json` から「その命題が動的機構に関与しているか」を機械判定できる。**関与しているのに動的証拠が無い命題は、`observed` への分類を機械が拒否し、`inferred` または `unresolved` に落とす。**

> **これによりコストは自動的に有界になる。** 動的解析を要するのは「動的機構が関与し、かつ高リスクな命題」だけで、残りは `inferred` として通せる。**「必須／任意」を人手で線引きする必要はない。**

---

#### R-2 equivalent mutant の言語別実装 — **「正規化して比べる」が何を証明するかを明示する**

> **訂正（2026-09-10、専門家の回答による）。** 旧版の見出しは「公式 AST ＋ 公式プリンタで足りる」としていた。**これは C/C++ と Rust で誤りである。** Clang にはソースを忠実に再生成する汎用の公式アンパーサが無く、`clang-format` は整形器であって AST からの逆生成器ではない。Rust の `prettyplease` は `syn` の AST 用のサードパーティ製プリンタであり、`rustc` の公式プリンタではない（コメントが脱落しうる）。**TCE は trivial / syntactic / compiler-normalisation equivalence の略であり、意味的等価ではない。** 一般プログラムの意味等価性は決定不能である。

TCE の本質は「正規化して比較」である。**ただし、何を比べたら何が言えるかは言語ごとに違う。**

| 言語 | 正規化の手段 | 正確に言えること | 言えないこと |
|---|---|---|---|
| JS / TS | SWC / Babel / TypeScript Compiler API の `createSourceFile` + `createPrinter` | 構文木を再印字した一致 | 型検査・モジュール解決・実行時 dynamic property・`eval` の等価 |
| Go | `go/ast` + `go/printer`。**固定バージョンの gofmt で実行し、その出力を保存する** | Go 構文の正規化 | build tags・型情報・整数／浮動小数点／副作用を跨ぐ代数的同値 |
| Rust | `syn` で parse → `prettyplease` で print | `syn` が表せる範囲での AST 丸め | macro 展開後の挙動・trait 解決・cfg 条件下の意味等価。**コメントは脱落しうる** |
| Python | `ast.parse` + `ast.unparse` | 再パースして等価な AST を作る表現 | 元ソース文字列との一致。コメント・書式・メタプログラミングの同値 |
| Java | `com.sun.source` + google-java-format | 固定構成下の構文正規化 | リフレクション・実行時型・クラスロード順を跨ぐ同値 |
| C / C++ | Clang AST。**`compile_commands.json` がある構成に限る** | 固定コンパイルコマンド下の一翻訳単位の AST 事実 | 全構成での意味等価・テンプレート実体化・ODR・マクロ・条件コンパイルを跨ぐ全体同値 |

**比較の梯子は、当てはまった最初の段で止める。その段が証明しないことは言わない。**

1. テキスト同一
2. トークン正規化同一
3. AST 正規化同一
4. 限定規則による局所書換え同値
5. コンパイラ／型検査器が同一 IR または同一診断を出す
6. テスト・property・差分実装で区別できなかった
7. `unknown`

**4 段目以降は、言語・型・評価順・副作用・算術モデル・構成条件を明示しなければ危険である。** 梯子は出力のどこでも「等価」という一語に集約しない。**6 段目で廃棄した mutant と 1 段目で廃棄した mutant は別の主張であり、潰せば未決定の mutant が決定済みとして提示される。**

**macro と生成コードは、展開前と展開後を別物として保持する。** 展開前は人間が保守するソース上の責務・`file:line`・レビュー可能性・設計意図の手がかりであり、展開後は固定構成における名前解決と型検査が見る姿である。両者は `origin_span`・`expansion_span`・`configuration_id`・`generator_identity` を持つ**多対多の来歴グラフ**で結ぶ。呼出地点と展開地点が一対一であると仮定してはならない。

**決定不能性への対処**: equivalent mutant の完全判定は**決定不能**である。したがって TCE は「**確実に等価なものだけを安全側で廃棄する**」道具として使う。**廃棄できなかった survivor は「equivalent の疑い」として `ORACLE-GAP.json` に残す。** 分類できないことを「契約が正しい」と読み替えてはならない（F17）。**どの段で廃棄したかを記録する。**

---

#### R-3 PBT 自動生成 — **生成できる範囲を限定して定義する**

| 種別 | 自動生成 | 手段 |
|---|---|---|
| **入力生成器** | **可** | 型定義から `fast-check` / `proptest` / `Hypothesis` の Arbitrary を機械合成する |
| **保存則・冪等性・可換性・単調性・往復** | **可**（テンプレート） | R3 の不変条件を**既知カテゴリに分類**し、カテゴリ別テンプレートへ流し込む |
| 業務固有の性質 | **不可** | `residual` として人間 grill へ |
| 複雑な状態依存 | **不可** | L2.5（7.7.3節） |

**不変条件が既知カテゴリに分類できなければ、それは PBT 化できない** → `unresolved` に落ちる（5.5節の provenance と整合）。

> **価値は網羅性ではなく一点突破にある。** 生成できた少数のプロパティでも、**反例が出た瞬間に oracle 共犯（F17）が破れる**。網羅を狙って何も生成できないより、確実に生成できるカテゴリだけを対象にする方が成果が大きい。

---

#### R-4 `[::TICKET::]` 注釈の一括適用 — **しない。ループが触れたファイルに限定する**

| 理由 | 内容 |
|---|---|
| **主張の正しさ** | 逆回転が**まだ正しさを証明していない段階**で全ファイルに注釈を付けるのは、**嘘の可能性のある主張**を大規模に書き込むことになる |
| **既存機構の前提** | `refresh-file-headers.js` は「**既存ヘッダの更新・本体不変**」であり、既にヘッダがあるファイルが前提である |
| **Boy Scout Rule** | conver の原則は「**触れたコードをより良くする**」であり、触れていないコードへの一括変更はその外にある |
| **リスク** | F5（証拠の陳腐化）と F10（順回転の破壊）を同時に上げる |

**一括適用は L3 到達後、人間の判断による別作業とする。** 逆回転のパイプラインの一部にはしない。

---

#### R-5 中止判断基準 — **機械は撤退を判定しない。撤退を検討すべき観測を提示する**

| # | 観測 | 意味 |
|---|---|---|
| **W1** | `R2.5` で実行面の過半が観測不能（外部 SaaS / 秘密管理 / 本番のみの経路） | 主要動作を観測できない |
| **W2** | `R3.5` で**高リスク命題の authority 解決率が 0** | 規範を決める人が存在しない |
| **W3** | `R6.5` で反例探索が**隔離環境の不在**により一切実行できない | 反証不能 |
| **W4** | `R5.5` で critical claim の直接 oracle が 0、かつ PBT 生成も 0 | Red を再建する手段がない |
| **W5** | `ARCHITECTURE-DELTA` の不一致が大きく、かつ**不一致の記録すら許されない**と人間が判断 | 誤った構造の凍結を強いられる |
| **W6** | 判断カードの未解決率が高止まりし、減少傾向がない | 判断が収束していない |

**撤退先（目的を下げる）**: 「RFC の完全再建」ではなく、**高リスク境界の観測可能化 / 外部契約の在庫化 / 変更影響範囲の可視化 / 移行前の安全網作成**のいずれか。

**手続き上の制約**:

- 判断は**人間**が行う（機械は観測を提示するのみ。3.3節）
- **早すぎる撤退を避けるため、撤退判断は少なくとも1本の垂直スライスを完走した後に限る**
- 撤退は `residual` として記録し、**「何が観測できなかったか」を残す**

---

#### R-6 スコープ縮小時の境界外 — **「不在」ではなく `out_of_scope` という第一級の状態**

- sidecar に `SCOPE-BOUNDARY.json` を置き、全対象を **`in_scope` / `out_of_scope` / `undetermined`** に分類する
- **スコープを跨ぐ依存は切らない。** `unresolved-contract-candidate` のまま残し、境界契約として未確定を明示する
- **F12 と同じ規律**: 「スコープ外」を「存在しない」と書いてはならない
- **拡張経路**: 次の垂直スライスを選ぶとき、`out_of_scope` のうち**依存密度が高いもの**を優先する（既存の「境界優先」戦略と統合する）

---

#### R-7 判断カードの総量 — **机上で見積もらず、スパイクを計測装置として使う**

見積りは実測でしか出せない。**Phase 0 のスパイクを計測装置として使い、閾値を実測で決める。**

| 計測項目 | 何を決めるためか |
|---|---|
| 1本の垂直スライスに含まれる `claim` 数 | カード枚数の原単位 |
| 生成されたカード枚数 / うち `unresolved` の率 | 判断疲れ（F7）の実測 |
| 1枚あたりの AI 判断時間 | スループット |
| 人間の介入回数と所要時間 | 人間側の負荷 |
| **全体への外挿**（対象ディレクトリ数 × カード/ディレクトリ） | 全体の見積り |

**決定規則**: 1ラウンドで処理しきれない枚数に達したら、**カードを階層化する**（境界レベルが `unresolved` なら内部の契約レベルカードを生成しない。7.4.1節）。**閾値は実測で決める。**

> **したがって Phase 0 の完了条件に「スパイク計測レポートの提出」を含める**（6.13節）。

---

### 11.6 専門家が対立した論点と裁定

**唯一の正面対立は「不確実性を順回転成果物のどこまで伝播させるか」であった。**

| | 専門家1 | 専門家2 |
|---|---|---|
| 主張 | **案2.5** — sidecar を正本とし、RFC-SEED / RFC / GRAPH / Dirs-Tree / Tickets / omission / RESIDUE へ**薄い参照を選択的に伝播** | **案3** — **RFC-SEED と RFC のみ**に伝播し、下流は RFC の ID を間接参照 |
| 根拠 | 条項・境界・チケット・不足から安定 ID で辿れる | conver は「RFC が正典」であり下流は元々 RFC を間接参照する |

**裁定: 案2.5-refined（6.12節）。** 決め手は**実装の事実**であった：

- `headingRefs`（`rfc-graph/crud.js`）/ `nodeIds`（`tickets/add-tickets-for-phase.js`）/ `mappedNodeIds`（`rfc-graph/boundify-helpers.js`）/ `originalTicketKey`（`tickets/add-omission-ticket.js`）により、**`RFC ← GRAPH ← Dirs-Tree / Tickets ← omission` は既に機械的に辿れる**（専門家2の主張は事実）
- **ただし辿れるのは見出し粒度までであり、claim は見出しより細かい**（専門家1の懸念も事実）
- したがって**「参照を成果物に埋める」のではなく「成果物の既存の索引を sidecar 側から辿る」**のが最適であり、これにより**順回転を一切変更せずに、GRAPH に埋めるより細かい粒度**が得られる

**この論点は追加質問1問で決着した。** 3往復目は情報を増やさないと判断し、実施していない。

---

### 11.7 実装側が独自に追加した判断

専門家の指摘をそのまま採るのではなく、実装の事実に照らして次を独自に判断した。

| # | 判断 | 根拠 |
|---|---|---|
| 1 | **既存の索引鎖を再利用する**（新しい写像層を作らない） | 上記の 4 つの既存フィールドを実装で確認した |
| 2 | **物理／論理の二層化は `mappedNodeIds` の上に載せる** | 写像の機械基盤が既に存在するため、「仮想ディレクトリ再構築層の新設」より安い |
| 3 | **claim ledger の最終的な消費者は `/drill-rfc-down`** | `STALENESS-INDEX` は「進化ループが何を進化させるべきか」を知る計器そのもの。両専門家とも行き先を名指ししていない |
| 4 | **`ORIGIN-LONG-SPEC.md` の二重の役割を明示** | `.md` は `/workspacify-tree` がパースし `source_hash` としてロックする**入力仕様**であり、`CLAIM-LEDGER.json` は**不確実性の正本**。役割が違うので競合しない |
| 5 | **順回転回帰ゲートを独立の必須項目にする** | 両者とも「順回転を壊せない」を前提とするが検証手段を述べていない。`manifest_hash` のバイト一致が唯一の証明 |
| 6 | **F21（未定義動作・バグの正典化）を F1 の最危険変種として独立させる** | 専門家2の指摘。F1 を「既存挙動の追認」から「**既存バグの仕様化**」まで拡張する |

---

### 11.8 実装順

**6.13節**に確定版を示した。**Phase −1（計画の基盤固め）→ Phase 0（9項目）→ Phase 0.5（動的解析基盤）→ Phase 1〜4** の順である。Phase 0 だけで、両専門家が指摘した最大の危険——**高性能な追認装置になること**——の主要部分は潰せる。

### 11.9 計画自体の自己監査（第1ラウンド後）

**専門家レビューの反映後、我々は計画自身を実装に照らして監査し、6つの欠陥を発見した。** これらは専門家からは指摘されておらず、**実装を確認して初めて分かったもの**である。

| # | 発見した欠陥 | 検証方法 | 対処 |
|---|---|---|---|
| 1 | **回帰ゲートの基盤が無い** — 「順回転を壊さない」の述語は書いたが、**ゴールデン manifest が保存されていない**（`*MANIFEST*` / `*golden*` / `*expected*` が0件） | リポジトリ検索 | **Phase −1-a**（改修前のベースライン採取） |
| 2 | **allocate 側に fixtures が無い** | `tests/workspacify-allocate/` の構成確認 | **Phase −1-a**（fixtures 追加） |
| 3 | **RFC-SEED の14見出し契約を壊す設計だった** — 逆回転索引を15番目の見出しとして足す計画だったが、`seed-parse.mjs:48` が `headings.length !== SEED_REQUIRED_SECTIONS.length` で**完全一致を強制**している | 実装の確認 | **§1 の機械注入内容を拡張する**方式に変更（見出し数は 14 のまま） |
| 4 | **動的解析基盤の構築が計画に無かった** — R-1 が動的証拠を必須にしたのに、その証拠を取る環境を作る工程が無い。**W3 の撤退条件が常時成立してしまう** | 計画の内部整合 | **Phase 0.5** を新設 |
| 5 | **新設ゲートに受け入れ基準が無かった** — 「何を検出したら FAIL か」が未定義で、実装しても効いているか分からない | 計画の内部整合 | **6.14節** を新設 |
| 6 | **`zg` と Red 再建の実行経路が Phase に現れなかった** — §8 で提案した `zg` が Phase 0〜4 に無く、Red 再建は「実装ループ以降は最小」では済まない（既存実装を壊して red を確認するには作業ツリー隔離が要る） | 計画の内部整合 | `zg` → Phase 0-9、Red 再建 → Phase 2 に組み込み |

> **この監査が示すこと**: 専門家レビューは**設計の欠陥**をよく捉えたが、**実装の事実に由来する欠陥**（#1〜#3）と**計画の内部整合**（#4〜#6）は捉えていなかった。**レビューの回数ではなく、実装との突き合わせが欠陥を減らす。**

**計画は依然として仮説である。** 1695行はまだ1行も実装されていない。**Phase −1-c の最小スパイクが、この仮説を最小コストで検証する最初の機会である。**

---

## 付録: 参考文献

- [Zvec-Grep documentation](https://zvec.org/en/docs/zvec-grep/)
- [Manage an Index](https://zvec.org/en/docs/zvec-grep/indexing/)
- [Search Guide](https://zvec.org/en/docs/zvec-grep/search/)
- [Embedding Models](https://zvec.org/en/docs/zvec-grep/embedding-models/)
- [Supported Content](https://zvec.org/en/docs/zvec-grep/supported-content/)
- [Connect AI Agents](https://zvec.org/en/docs/zvec-grep/agents/)
- [CLI Reference](https://zvec.org/en/docs/zvec-grep/cli/)
- [Troubleshooting](https://zvec.org/en/docs/zvec-grep/troubleshooting/)

`zg` の手順は公開ドキュメントを基にした運用テンプレートである。実行前には必ず利用中のバージョンで `zg help`、`zg help index`、`zg help query` を実行し、オプションと挙動を確認すること。
