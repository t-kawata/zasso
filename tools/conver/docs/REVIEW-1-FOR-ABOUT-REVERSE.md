# conver reverse — 調査・設計レビュー

> 対象: `ABOUT-REVERSE.md` が提示する `/workspacify-reverse` と R0〜R8 の逆回転パイプライン。
>
> 結論の要旨: 設計の中心原理――「決定論を極大化し、AI の判断面積を小さくし、証拠を給仕する」「成功判定は人間に残す」「追認 RFC を禁じる」――は妥当である。しかし、現案のままでは **証拠の独立性・観測スコープ・反証可能性・時間軸・外部境界・運用時の変化** を十分にモデル化していない。これらを足さずに RFC を生成すると、追認 RFC をより精巧に生成する装置になる危険が高い。

---

## 1. 前提と評価基準

### 1.1 この調査で区別するもの

逆回転で混同してはならない4種類の命題を明示的に分ける。

| 種別 | 例 | 逆回転成果物での扱い |
|---|---|---|
| 観測事実 | `src/a.ts:42` が `db.delete()` を呼ぶ | 出所、対象コミット、抽出器版、行範囲を伴う evidence として格納 |
| 実行時事実 | 特定のテスト／トレースで `delete` が呼ばれた | workload・環境・トレース範囲を伴う evidence として格納 |
| 推論 | `a` は `b` の provider である可能性が高い | evidence へのリンクと反証条件を持つ inferred claim |
| 規範 | 削除には常に tenant 認可が必要 | 人間承認済みの RFC 命題。既存挙動だけから昇格させない |

「実装から観測された」は規範ではない。規範的 RFC へ昇格できるのは、少なくとも反証探索を受け、競合する証拠・未観測域・判断者を明示した命題だけである。

### 1.2 成果物の追加原則

ORIGIN-LONG-SPEC、TREE-MANIFEST、RFC-SEED、RFC の各命題に、最低限次を持たせる。

- `claim_id`: 安定 ID
- `claim_type`: observed / inferred / normative / unresolved
- `confidence`: 確率ではなく証拠強度の序数
- `support`: 独立した evidence group の一覧
- `counterevidence`: 競合・反例・観測不能性
- `scope`: commit、環境、tenant、feature flag、設定、時刻範囲
- `falsification`: 何を観測／変異すれば棄却されるか
- `owner`: 実装 owner ではなく、命題の判断責任者
- `review_state`: 未レビュー／要専門家確認／承認済み／撤回済み

これは「AI に根拠を添えさせる」ためではない。後から推論を再評価・撤回・更新し、規範と実装のずれを管理するためのデータモデルである。

---

## 2. 調査結果 — 追加すべき手法

以下は既存の §7.2 に列挙されている静的解析、CPG、Daikon、Synoptic、動的トレース、record/replay、ファジング、シンボリック実行、mutation、PBT、DSM、歴史解析、要求工学、バイナリ解析等を前提に、それだけでは埋まらない手法を選んだものである。

| # | 手法 | 何をするか | 実績・参考 | 適用条件 | 限界 | 主に抑える失敗 |
|---:|---|---|---|---|---|---|
| 1 | **Reflexion Modeling（反射モデル）** | 人間が暫定の高水準モデルと実装要素→モデル要素のマッピングを置き、実装依存を `convergent / divergent / absent` として差分化する。復元結果を「真実」とせず、反復的に整合と逸脱を扱える。 | ACTool を用いた実務内ケーススタディがあり、継続的な architecture recovery の実践的性質を分析している。 | 最低限、候補コンポーネントと許容依存を人間が仮置きできること。 | 初期モデルやマッピングは人間依存。正しい意図を自動発見しない。 | F1 追認RFC、F3 誤境界、F9 未解決事項の隠蔽 |
| 2 | **Multi-view architecture recovery / information fusion** | 依存、コード語彙、ディレクトリ、配置、デプロイ、実行時、履歴を別ビューとして保持し、単一クラスタリングで潰さず融合する。 | SARIF は dependencies・code text・folder structure を融合し、比較対象より平均36.1%高い精度を報告している。ただし研究評価であり、一般化は別途検証が要る。 | 複数の独立した素材があること。 | 融合規則自体が誤る。精度値を対象プロジェクトへ外挿不可。 | F3、F4 動的結合漏れ、F5 証拠不足 |
| 3 | **Runtime architecture reconstruction / distributed tracing correlation** | OpenTelemetry 等の trace context、RPC、キュー、DB、outbox、job を相関し、実行時の service interaction graph と因果候補を抽出する。 | 分散システムの観測性基盤として広く実運用される。Synoptic/Dynoptic 系はログから FSM/通信状態機械を推定する研究系を提供する。 | 本番相当または安全な代表 workload、相関 ID、サンプリング方針、PII 管理。 | 未実行経路、サンプリング、欠落 instrumentation、非同期の親子関係欠落を「不存在」と扱えない。 | F4、F5、F6 契約欠落、F8 観測範囲の過信 |
| 4 | **Protocol inference / active automata learning（L*/TTT系）** | API・CLI・プロトコルに入力列を与え、応答・状態遷移から受動ログだけでは見つからない状態機械候補を能動的に学習する。 | automata learning は通信プロトコル解析・状態機械学習で研究蓄積がある。 | 安全にリセットできる sandbox、oracle、入力生成境界、レート制御。 | destructive な操作、無限状態、時間依存、認可状態、外部副作用があるとモデルが歪む。 | F1、F4、F6、F7 AIの推測 |
| 5 | **Differential testing / N-version oracle** | 旧実装と新しい仕様化ハーネス、別実装、旧版、参照 API を同一入力で比較し、差分を例外として記録する。 | 互換性検証・コンパイラ・プロトコル実装で定着した手法。 | 比較可能な oracle が少なくとも二系統あり、データ・時刻・乱数・外部 I/O を制御できること。 | 両者が同じ誤りを共有する場合や、正しい変更を誤差とみなす場合がある。 | F1、F2 偽green、F6、F8 |
| 6 | **Metamorphic testing** | 正解出力を知らなくても、入力変換前後に守るべき関係（例: 順序変更、再試行、冪等、同値表現）を検査する。 | test oracle problem の補助として広く研究・実践される。 | ドメインに不変な変形関係を定義できること。 | 関係自体が誤った規範になりうるため、人間レビューが必要。 | F2、F6、F7 |
| 7 | **Causal change analysis / change coupling** | Git の共変更、時系列、issue/PR、blame、リリース境界を統合し、「同時に変わる」だけでなく変更理由・導入時点・後続修正を証拠として提示する。 | MSR 分野の標準的な分析対象。単純な共変更だけでなく時系列・レビュー文脈を併用すべき。 | 十分に粒度のある履歴、PR/issue/CIログへのアクセス。 | 共変更は因果ではない。squash、mass-format、vendoring、移植履歴で汚染する。 | F1、F3、F5、F9 |
| 8 | **Feature-flag / configuration-space analysis** | 設定スキーマ、環境変数、フラグ定義・参照、CI matrix、デプロイ manifest を抽出し、各命題が有効な構成空間を限定する。 | 実務上の障害原因になりやすい実行時差分を、静的・動的双方で可視化する手法群。 | 設定の入口を特定できること。 | 動的設定、秘密管理、遠隔フラグ、暗黙の default、環境固有の外部依存は漏れる。 | F4、F5、F8、F10 |
| 9 | **Data lineage / schema-evolution analysis** | DB migration、ORM、イベント schema、ETL、cache、検索 index を横断し、データの作成・変換・保持・削除・後方互換の系譜を復元する。 | データ基盤・規制対応・マイクロサービス移行で実務的重要性が高い。 | migration、schema registry、DDL、イベント定義、実環境メタデータへの許可アクセス。 | ad-hoc SQL、外部SaaS、手作業、暗号化 payload、運用スクリプトで断線する。 | F3、F4、F6、F10 |
| 10 | **Policy-as-code extraction and authorization differential checks** | 認証・認可の強制点、principal、tenant、resource、action、deny path を抽出し、各入口・非同期経路で policy が再検査されるかを比較する。 | security architecture recovery の個別ツール群（例: authorization flow analysis）が存在する。 | framework の middleware/interceptor/policy エンジンを解析できること。 | custom policy、DB内権限、外部 IdP、反射、バイパス経路は要動的確認。 | F4、F6、F8、F10 |
| 11 | **SBOM / dependency provenance / build attestation analysis** | lockfile、SBOM、ビルド定義、コンテナ digest、生成器、plugin、コード生成入力を含め、解析対象が何から構成されたかを固定する。 | SLSA、SBOM、再現可能ビルドの実務潮流と整合する。 | build 定義・lockfile・artifact metadata があること。 | hermetic でないビルド、未記録の生成物、private registry、手作業配布は限界。 | F5、F10、生成コード由来のF3/F4 |
| 12 | **Specification-based slicing and change-impact analysis** | RFC候補命題ごとに、関係するプログラム slice、テスト、設定、履歴、トレースを抽出し、「命題→根拠」「変更→影響」の双方向を機械管理する。 | program slicing は成熟した解析概念で、変更影響分析にも広い蓄積がある。 | 言語フロントエンドと依存グラフ、または十分な近似があること。 | alias、reflection、外部 I/O、動的ロードでは過小／過大近似になりうる。 | F1、F5、F6、F7 |
| 13 | **Counterexample-guided abstraction refinement（CEGAR型の反証ループ）** | 粗い契約・状態モデルを作り、モデル検査・生成テスト・トレース差分の反例でモデルを分割・修正する。採用証拠ではなく反証探索を中心に置く。 | 形式検証・抽象解釈で確立した反復原理。 | 明確な抽象境界、反例を生成または観測できるハーネス。 | 状態爆発、抽象化の設計、外部副作用の制御が難しい。 | F1、F2、F6、F7 |
| 14 | **Invariant triage with static discharge** | 動的に推定した invariant をそのまま採用せず、型、SMT、abstract interpretation、model checking、追加テストで「反例なしの観測」から段階的に格上げする。 | Daikon は observed execution に基づく likely invariant を報告するもので、全実行での真理を保証しない。 | 型情報・契約候補・検証可能な部分仕様。 | 完全証明は困難。仕様・環境モデルの誤りが残る。 | F1、F2、F6、F7 |
| 15 | **Architecture decision recovery via decision provenance graph** | ADR、issue、PR、レビュー、コミット、障害報告、ランブックを、実装変更と結び、決定候補と「決定されなかった代替案」を復元する。 | 文書と履歴を個別に読むより、claim 単位でリンクする方が再検証可能。 | tracker／PR／文書へのアクセスと ID の関連付け。 | 文脈欠落、後付け ADR、会話の非保存、組織記憶の喪失を解消しない。 | F1、F3、F5、F9 |

### 2.1 実験的手法の扱い

LLM 単体による architecture recovery を、構造の正解発見器として採用してはならない。近年の研究は有望だが、対象依存性・評価データの偏り・プロンプト依存・再現性の問題が残る。LLM の適切な位置は、候補の説明、矛盾の言語化、未確定点の質問生成、証拠束からの判断カード作成である。

静的な microservice recovery に関する比較研究でも、個別ツールの再現性の制限、heuristic による false positive、単一ツールではなく組合せの有効性が示されている。従って、ツール出力は `observed candidate` であり、canonical fact ではない。複数ビューと独立した反証経路が必要である。

---

## 3. R0〜R8 の再設計

### 3.1 追加すべき段

現行 R0〜R8 の間に、少なくとも次の明示的な概念段を置くべきである。実装上はサブステップでよいが、成果物スキーマでは独立させる。

| 段 | 追加名 | 入力 | 出力 | なぜ必要か |
|---|---|---|---|---|
| R0.5 | Scope & threat ledger | root、権限、コミット、秘密除外、対象環境 | `ANALYSIS-SCOPE.json` | 解析対象、許可、除外、外部送信、観測環境を固定しないと、証拠の意味が変わる |
| R2.5 | Runtime/config/deployment inventory | 静的地図、設定、IaC、CI、observability | `EXECUTION-SURFACE.json` | import graph は実行結合を代表しない。入口・flag・非同期・外部接続を列挙する |
| R3.5 | Evidence triangulation | API・契約候補、テスト、履歴、動的証拠 | `CLAIM-LEDGER.json` | evidence の数ではなく独立性、範囲、競合、反証条件を命題ごとに管理する |
| R5.5 | Oracle adequacy / test semantics | mutation、テスト、契約候補、観測面 | `ORACLE-GAP.json` | mutation score を contract coverage と誤認しない。観測点・oracle・入力空間を分離する |
| R6.5 | Active falsification | red plan、sandbox、状態モデル、差分oracle | `COUNTEREXAMPLE-PLAN.json` と結果 | red の再建を「mutation実行」だけに縮退させず、反例探索計画として扱う |
| R7.5 | Human norm-setting | 高リスク・低証拠・競合命題 | 承認／棄却／保留した normative claims | AI が実装記述を規範へ昇格させないための唯一の適切な境界 |

### 3.2 段別の配置

| 現行段 | 置くべき解析・ゲート | なぜここか | 精度への効果 | ここでしてはいけないこと |
|---|---|---|---|---|
| R0 lock project root | commit、submodule、worktree、SBOM/lockfile、生成器、ライセンス・権限、秘密除外、分析環境 digest を固定。適格性を数値化せず evidence profile として出す | 後段のすべての証拠を再現可能にする起点 | 解析対象の取り違え、秘密混入、生成物誤認を抑える | 「適格／不適格」の自動断定、既存ツリーの改変 |
| R1 measure tree | 言語・生成物・vendor・test・docs・IaC・migration・workflow・runbook・observability config を資産台帳化。コード量ではなく可観測性・履歴・実行可能性も測る | R2以降の coverage denominator を定義する | 「読んだ src だけで全体」と誤認しない | ディレクトリ名だけで責務を確定する |
| R2 import graph | language-aware call/type/dataflow graph、CPG、build graph、codegen relation、external dependency、config reference、DB/event topic reference、依存の根拠種別を抽出 | 静的骨格と候補境界を作る場所 | 多種類の関係を混ぜず、後段で照合できる | import graph だけから architecture / ownership を決定する |
| R2.5 execution surface | entrypoint、DI、reflection、plugin、feature flag、環境変数、scheduler、queue、RPC、sidecar、deployment、service discovery、外部SaaSを列挙。可能なら安全な代表 workload を実行し trace を採る | 静的に見えない結合をR3以前に露出させる | F4型の欠落を「未知」として保持できる | 観測されなかった経路を不存在と書く |
| R3 contract candidates | public API、error、guard、effect、state候補、データlineage、authz flow、状態機械候補を抽出。各候補を `observed` として格納 | RFCに近い材料を作る段 | 契約候補と実装パターンを分ける | candidate を invariant / requirement と命名する |
| R3.5 claim ledger | 同一 claim に静的・動的・テスト・履歴・文書の evidence を束ね、互いに独立か、対象範囲が一致するか、反例があるかを記録 | 追認の循環を構造的に検出する要 | AI の根拠選択を制約できる | 同じテスト由来の複数証拠を独立証拠として加算する |
| R4 mine history | logical coupling、導入コミット、revert/fix、issue/PR/ADR、障害・移行履歴を命題単位へリンク。履歴品質と欠落も出力 | 「なぜ」と偶然の分離を助ける | 意図の仮説に時系列的反証可能性を加える | commit message を設計意図の証明として扱う |
| R5 detect gaps | dead/untested/tautological test、comment drift、stubに加え、未観測 configuration、未追跡外部I/O、未対応 schema evolution、観測不能 boundary、生成コード由来を検出 | 何が分からないかを意図的に出す段 | false confidence の最大原因を可視化する | gapが少ないことを品質・成功と解釈する |
| R5.5 oracle gap | mutationの生存原因を、equivalent mutant、到達不能、観測点不足、oracle不足、入力不足、環境不足に分類。metamorphic/differential oracle候補を作る | Red再建の前に、テストの意味を検査する | mutationの誤解釈を防ぎ、契約ごとのred計画が可能になる | 全体mutation scoreの閾値で通過判定する |
| R6 plan red reconstruction | claimごとに mutation、negative test、property/metamorphic、differential、active learning、trace assertion を選び、対象・副作用・reset・oracle・期待redを計画 | redは契約単位で再構成する必要がある | 実装を壊すだけの mutation を減らし、規範の反証力を測れる | production状態への能動探索、停止不能な外部副作用 |
| R6.5 active falsification | sandboxでR6計画を実行し、反例・未殺 mutant・挙動差分を claim ledger へ逆流させる | 生成より反証を優先する | 「もっともらしいRFC」の淘汰が進む | red失敗を自動的に仕様誤りと結論する |
| R7 packet origin | AIへ渡す packet を claim slice 単位にし、観測・推論・競合・未確定・反証結果・禁止された飛躍を含める。複数仮説を強制する | AI の判断面積を実質的に縮小する | 文章生成より、比較判断・質問・保留に集中できる | 巨大な全リポジトリ要約を渡し単発にRFC生成させる |
| R7.5 human norm-setting | 安全・金銭・認可・データ保持・削除・外部互換・不可逆性の命題は、証拠が強くても人間が規範として承認する | 規範の起源を明示する | 追認RFCの最終防壁になる | `APPROVED`をAIのみで付与する |
| R8 emit origin spec | `ORIGIN-LONG-SPEC`には claim ledger の射影、未確定、coverage、反証失敗、scope を含める。Markdownは閲覧面、JSONを機械的正本とする | 下流へ不確実性を落とさない | RFC-SEEDと後続チケットが証拠を遡及できる | 未確定を自然言語で埋めて消す |

### 3.3 §6.10 データフローに追加すべき辺

既存の直線的 R0→…→R8 フローに加え、次の逆向き／横断辺が必要である。

| 辺 | 意味 | 必要性 |
|---|---|---|
| R2.5 → R2 | 実行時観測が静的関係の候補・重み・未知領域を更新 | 静的 graph と runtime graph の不一致を残す |
| R3.5 → R1/R2/R2.5 | evidence不足の claim が追加解析スコープを要求 | coverage を成果物生成後に閉じる |
| R4 → R3.5 | 履歴・ADR・issue が claim の支持／反証へ流入 | history を付録にせず判断に使う |
| R5/R5.5 → R6 | gapの種別がred再建手法を選ぶ | 一律 mutation の誤用を避ける |
| R6.5 → R3/R3.5/R4 | 反例が契約候補・証拠評価・意図仮説を撤回／分割 | 反証を一回限りのテスト結果にしない |
| R7.5 → R3.5/R8 | 人間の規範判断を claim ledger と origin spec に書き戻す | 人間判断を会話ログだけに残さない |
| R8 → R0 | 後続ループで対象commit／環境／生成器が変われば、旧証拠を stale 化 | temporal drift を管理する |
| `/crystalize-readme` RESIDUE → R3.5/R5/R6 | 商品観点の欠落を逆回転 evidence/gap/red計画に戻す | RESIDUEをRFC差分だけに直結すると根拠鎖が切れる |
| `/find-omissions` → claim ledger | omission をテスト不足だけでなく claim・scope・oracleのどこが欠けるかとして記録 | omissionの再発と循環を追える |

---

## 4. AI判断支援の再設計

### 4.1 §7.4 の8仕掛けに足りないもの

既存の decision card、二者／敵対レビュー、複数証拠、evidence/unresolvedの分離、grill、AIの断定抑制は方向として正しい。ただし「カードを作る」だけでは、同一原因から生じた証拠の水増しと、未観測域の消失を防げない。追加すべきは以下である。

| 仕掛け | 具体化 | AIの判断面積をどう削るか |
|---|---|---|
| Evidence independence graph | evidence をソースではなく生成因果でグループ化。例: 同じ実装を前提にしたunit test・comment・READMEは独立3本ではない | 「証拠数を数える」判断を機械側に移す |
| Scope lattice | commit、環境、flag、tenant、入力分類、時刻、負荷、deploymentを命題の適用範囲として機械比較 | 「常に成立」をAIが推測する余地を消す |
| Claim status automaton | observed → corroborated → challenged → human-approved normative などを状態遷移として定義 | AIが文章上の強い語で勝手に昇格することを防ぐ |
| Counterexample budget | 高リスク命題は、採用前に最低N種の反証探索を要求。ただしNは証拠数でなく独立手段・リスクで決める | AIに「十分そう」と判断させない |
| Competing-hypothesis packet | 各境界・意図について少なくとも2仮説と、それぞれを分ける観測を提示 | 単一のもっともらしい物語への収束を防ぐ |
| Calibration / abstention ledger | 後で人間が訂正したAI判断をタイプ別に記録し、確信表示の校正誤差を測る | 不確実性表現を運用上学習する |
| Change-staleness propagation | ファイル・設定・schema・依存・runtime環境の変更から、どのclaim/RFC/テストが再審査かを機械算出 | 「古い証拠をAIが再利用する」問題を減らす |
| Safety-critical policy lane | authz、秘密、金銭、削除、tenant、暗号、監査、互換性を別laneに分類し、人間承認と強い反証を必須化 | AIに規範決定を委ねない |

### 4.2 判断カードの粒度

カードの最小単位は「ファイル」でも「クラス」でもなく、**一つの可反証な命題**である。推奨する粒度は次のいずれか一つだけを主語にする。

- 一つの境界越え: `consumer C が provider P の capability X を条件 Y で呼ぶ`
- 一つの状態遷移: `state A から B への遷移には guard G が必要`
- 一つの不変条件: `resource R の tenant_id は principal の tenant と一致する`
- 一つの失敗／回復契約: `timeout時に operation O は再試行可能で冪等である`
- 一つのデータ系譜命題: `field F は ingress I から sink S へ変換 T を経て到達する`

カードを分割する判断は機械化できる。以下のいずれかが異なれば別カードにする。

- 主語・対象resource・状態機械
- 適用scope（flag、環境、tenant、API version）
- 反証方法またはoracle
- authority（誰が規範を決めるか）
- risk class

逆に、同一scope・同一oracle・同一authorityで同じsliceから検査できる複数の局所条件は、一枚の「契約束」としてまとめてよい。上限はトークン量でなく、反証計画が一意に書けるかで決める。

### 4.3 人間を入れる場所

人間の専門家を最も有効に使う地点は、全文 RFC の最終レビューだけでは遅い。次の三つの小さな介入が高レバレッジである。

1. **R0.5: scope・権限・危険境界の確認**
   - 本番ログ・PII・秘密・外部サービス・破壊的テストの扱いを決める
2. **R3.5/R4: 高価値かつ高不確実な命題の二択・三択判断**
   - 「このDB直結は意図された層越えか、負債か」「この拒否挙動はセキュリティ要件か、偶然か」など、選択肢と証拠を示して答えてもらう
3. **R7.5: 規範への昇格の承認**
   - 安全・法務・データ・互換性・課金・不可逆操作は必ず人間のauthorityを記録する

人間に自由記述の「設計を説明してください」を投げない。カードごとの選択肢、根拠、反証、影響範囲、回答しない場合の保留結果を渡す。

---

## 5. 妥当性レビューと失敗モード

### 5.1 現案に対する重大な指摘

| # | 依頼 | 対象 | 指摘 | 根拠・理由 | 提案する変更 | 確信度 |
|---:|---|---|---|---|---|---|
| 1 | 4 | §3.3, §6.2, §7.7 | 「成功判定は人間」という原則は正しいが、人間に渡す品質尺度が不足すると判断責任を単に先送りする | 人間は証拠のscope・独立性・未観測域が見えなければもっともらしいRFCを承認する | human review packet に claim ledger、coverage、counterevidence、staleness、反証結果を必須化 | 高 |
| 2 | 4 | §3.4 | 追認RFCの防止を理念に置くだけでは不十分で、RFC命題の昇格規則が無い | 実装・テスト・コメント・履歴は同じ既存設計から派生し、相互参照しても独立な規範根拠にならない | observed / inferred / normative をスキーマで分離し、normative昇格にはauthorityと反証記録を要求 | 高 |
| 3 | 4 | §3.5, R5-R6 | mutationはred再建の重要手段だが、mutation scoreは仕様・契約coverageの証明ではない | equivalent mutant、到達不能、弱いoracle、入力空間不足、外部副作用により解釈が変わる | contractごとのmutation目的と未殺分類、metamorphic/differential/negative testを併用 | 高 |
| 4 | 4 | R2 | import graph中心では実行時依存が構造的に欠ける | DI、reflection、plugin、queue、feature flag、service discovery、IaCはimport関係で表れない | R2.5 execution surface を追加し、静的・設定・deploy・traceを別relationとして管理 | 高 |
| 5 | 4 | R3 | guard/assert/errorの抽出は「実装にある条件」であり、precondition/postcondition/invariantの区別を保証しない | 防御的チェック、性能最適化、暫定workaround、誤実装が同じ形で現れる | contract candidate は観測命題として保持し、反証・履歴・人間承認を経て分類 | 高 |
| 6 | 4 | R4 | git履歴の存在を適格条件に入れるだけでは、履歴の質・可読性・改変履歴の欠落を扱えない | squash、mass reformat、vendor投入、移植、秘匿会話でlogical couplingが汚れる | `history_quality_profile` を出し、信頼度を命題単位で下げる | 高 |
| 7 | 4 | R0-R8 | 対象commitだけでなく、設定、依存解決、生成器、コンテナ、外部API version、観測環境を固定しないと再現性が崩れる | 同一ソースでもfeature flag、remote config、schema、dependency、imageで挙動が変わる | scope ledgerとbuild/deploy provenanceをR0.5に追加 | 高 |
| 8 | 4 | §6.10 | 一方向のdata flowでは反例が上流の仮説を撤回・分割する構造が弱い | 逆回転は演繹ではなくアブダクションであり、反証が最重要の更新入力 | R6.5→R3/R3.5/R4、R8→R0などのfeedback edgeを明示 | 高 |
| 9 | 4 | §7.4 | 判断カードの「証拠数」または複数ソース要求だけでは証拠独立性を保証しない | テスト、コメント、README、commit messageが同一実装上の物語を繰り返すだけの場合がある | evidence independence graph と source-causality group を追加 | 高 |
| 10 | 4 | §3.6 | 適格条件は必要条件の列挙として有用だが、不可逆性・安全性・観測可能性・ドメインauthorityが抜けている | build/test/gitが揃っても、本番のみの経路や不可逆副作用では能動検証できない | capability profileに sandbox/reset、trace、data access、domain steward、external dependency を加える | 高 |
| 11 | 4 | §7.7 | 段階戦略をRESIDUE 0に近づく階層だけで測ると、巨大系で危険境界が後回しになる | セキュリティ、金銭、削除、tenant分離は小範囲でも先に扱うべき | 進行順序を「リスク×証拠不足×変更頻度」で優先付け。RESIDUE 0は成果、進行指標ではない | 高 |
| 12 | 4 | tree/allocate reverse mode | 既存ディレクトリ構造を完全に守ることは、既存の誤境界をcanonical化する危険がある | 物理構造は実装制約として保存すべきだが、論理境界まで同一視すべきではない | physical layout と logical architecture を二層モデルにし、mismatchをfirst-class residueにする | 高 |
| 13 | 4 | reverse mode | 新設reverse側に解析を閉じ込める方針は順回転保護に良いが、出力スキーマが既存正典に過剰適合すると不確実性が消える | TREE-MANIFESTのCOMPLETE語彙は、逆回転の意味論と衝突しうる | reverse専用artifactは `COMPLETE` ではなく `evidence_complete_for_scope` 等の限定状態を持ち、正典採用と分離 | 中 |
| 14 | 4 | §3.5 | 「違反注入でred」を必須化しても、破壊的・外部I/O・分散非決定性の領域には安全に適用できない | production副作用、レース、時間依存、第三者API、データ破壊ではmutation実行が不適切 | sandbox、record/replay、fault injection、model-level mutation、canaryをリスク別に選択 | 高 |
| 15 | 4 | §7.6 | F1〜F10は重要だが、時間・運用・データ進化・authority・security boundaryの失敗を独立に扱う必要がある | 実装が一時点で整合していても、運用設定・schema・権限が変わればRFCが急速に古くなる | 下記F11〜F18を追加し、stalenessを自動追跡 | 高 |

### 5.2 追加すべき失敗モード

既存F1〜F10の定義を尊重しつつ、次を追加する。番号は実装時に既存体系へ合わせて再採番してよい。

| ID | 失敗モード | 何が起きるか | 検出／緩和 |
|---|---|---|---|
| F11 | **証拠独立性の錯覚** | 同じ実装由来のテスト・コメント・文書・履歴を複数根拠と誤数えし、追認を強化したと誤認する | provenance/causality group、独立ビュー最小数、反証経路の強制 |
| F12 | **未観測域の不存在化** | trace・検索・テストに現れないflag、tenant、障害時、負荷時、古いAPI版を「存在しない」と扱う | scope lattice、coverage denominator、unknown edge、環境matrix |
| F13 | **時間的ドリフト** | RFC再建後に依存、設定、schema、外部API、デプロイが変わり、証拠と規範が静かに古くなる | claim→artifact dependency、staleness propagation、再審査SLO |
| F14 | **論理境界と物理境界の同一視** | 既存フォルダ・repo・deploy unitを、本来の責務境界として固定してしまう | physical/logical二層モデル、Reflexion差分、mismatch residue |
| F15 | **安全・権限境界の追認** | 現在の認可不足・tenant混線・秘密管理の不備を「既存契約」として昇格する | security lane、policy extraction、negative authz tests、人間authority |
| F16 | **データ系譜・schema進化の断線** | DB migration、イベントversion、ETL、cache、検索index、削除・保留義務がRFCに反映されない | lineage graph、schema compatibility、migration/replay tests |
| F17 | **oracle共犯** | 実装、テスト、仕様化ハーネスが同じ仮定を共有し、差分もmutationも見逃す | differential/metamorphic oracle、外部参照、独立実装、手動例示 |
| F18 | **authority漂流** | 誰が「これは規範」と決めたか不明になり、AI出力や古い会話が実質的な正典になる | norm-setting record、期限、owner、撤回・再承認フロー |
| F19 | **生成物・供給網の見落とし** | 生成コード、plugin、lockfile、build script、コンテナ、sidecarが動作を決めるのにsrcだけで復元する | build graph、SBOM、codegen provenance、artifact attestation |
| F20 | **観測による攪乱** | tracing、fault injection、debug flagが性能・順序・タイミングを変え、誤った挙動を観測する | low-overhead instrumentation、観測差分試験、sampling metadata、再現試験 |

### 5.3 「この設計では成功しない」条件

以下の条件では、逆回転を正典RFC再建として進めるべきではない。限定的な理解・安全化・移行計画へ目的を下げるべきである。

- 規範を決める人間authorityが存在せず、リスクの高い挙動について誰も選択できない
- 安全な実行・reset・隔離環境がなく、重要な状態遷移を反証できない
- 外部サービス、運用設定、データschema、秘密管理が主要動作を決めるが、観測または記録への許可がない
- テストが緑でも、観測点・oracle・入力空間が不明で、mutationや差分検証で評価できない
- 物理ディレクトリの保存が絶対条件である一方、その構造が既知の組織的・論理的負債であり、mismatchを記録することすら許されない

この場合の成功定義は「RFCの完全再建」ではなく、たとえば「高リスク境界の観測可能化」「外部契約の在庫化」「変更影響範囲の可視化」「移行前の安全網作成」に限定する。

---

## 6. 実装提案

### 6.1 新規成果物

```text
reverse/
  ANALYSIS-SCOPE.json
  ASSET-INVENTORY.json
  STATIC-RELATIONS.json
  EXECUTION-SURFACE.json
  CLAIM-LEDGER.json
  HISTORY-PROVENANCE.json
  GAP-REGISTER.json
  ORACLE-GAP.json
  COUNTEREXAMPLE-PLAN.json
  COUNTEREXAMPLE-RESULTS.json
  HUMAN-NORM-DECISIONS.json
  ORIGIN-LONG-SPEC.json
  ORIGIN-LONG-SPEC.md
```

`ORIGIN-LONG-SPEC.json` は上記の要約ではなく、各artifactへの content-addressed reference を持つ射影にする。巨大な生証拠は別artifactに残し、manifestにはhash、生成器version、対象scopeを記録する。

### 6.2 最小のclaim schema例

```json
{
  "claim_id": "clm-authz-delete-tenant-001",
  "claim_type": "inferred",
  "statement": "DeleteSession requires that principal.tenant_id equals session.tenant_id.",
  "scope": {
    "commit": "<git-sha>",
    "environment": ["test", "staging"],
    "feature_flags": {"new_authz": "on"},
    "api_versions": ["v2"]
  },
  "risk_class": "security-critical",
  "support": [
    {"evidence_id": "ev-static-18", "group": "source-static", "relation": "supports"},
    {"evidence_id": "ev-trace-41", "group": "runtime-trace", "relation": "supports"}
  ],
  "counterevidence": [
    {"evidence_id": "ev-test-77", "relation": "scope-conflict"}
  ],
  "falsification": [
    "Run cross-tenant delete in isolated staging with v2 and new_authz=on; expect deny before database effect.",
    "Mutate tenant equality guard; the negative test must fail."
  ],
  "review_state": "requires_domain_approval",
  "normative_authority": null
}
```

重要なのは `confidence` の数値化ではなく、support/counterevidence/scope/falsification が機械検査できることだ。security-critical な命題は `normative_authority` が空のまま RFC の規範条項へ出力されてはならない。

### 6.3 段階的な導入順

1. **Phase A: 証拠の正直さ**
   - R0.5、R2.5、R3.5、R8を導入する
   - 正典RFCを生成しない。observed / inferred / unresolved を出し分ける
2. **Phase B: 反証可能性**
   - R5.5、R6.5を導入する
   - 高リスク境界で mutation、negative、metamorphic、differential のどれが使えるか測る
3. **Phase C: 人間による規範設定**
   - R7.5とauthority記録を導入する
   - 少数の高リスク命題だけを規範RFCへ昇格させる
4. **Phase D: forward loopへの接続**
   - RFC-SEED、TREE-MANIFEST、ALLOCATE-MANIFESTへ不確実性・根拠参照・stalenessを保ったまま接続する
   - `COMPLETE`は解析完了ではなく、対象scope内の成果物完全性に限定する
5. **Phase E: 継続運用**
   - 変更影響でclaimをstale化し、再解析・再承認を差分運用する

### 6.4 完了条件の置換

次のような単一の「解析完了」判定は避ける。

- `all claims are true`
- `architecture recovered`
- `mutation score >= threshold`
- `ORIGIN-LONG-SPEC COMPLETE`

代わりに、範囲付き・否定可能な状態を使う。

| 状態 | 意味 |
|---|---|
| `evidence_collected_for_scope` | 指定scopeで予定した証拠収集が完了した。真実性は主張しない |
| `claims_triaged` | observed/inferred/unresolved/normative候補が分類済み |
| `critical_claims_falsification_attempted` | 高リスク命題に対し定義済み反証探索を実施済み |
| `normative_claims_human_approved` | authorityを伴う規範命題だけが承認済み |
| `stale` | 入力依存の変更により再評価が必要 |
| `blocked_by_observability` | 必要な観測または安全な実験ができず、結論を出せない |

RESIDUE 0は最終的な人間の出荷判断に残してよい。しかし逆回転側の機械ゲートは「成功」を語らず、上記の証拠状態だけを語るべきである。

---

## 7. 参考と根拠

- Schneider et al., *Comparison of Static Analysis Architecture Recovery Tools for Microservice Applications*。13ツールを特定し、9ツールを共通データセットで比較。個別最良F1 0.86、4ツール組合せ0.91を報告。再現性やheuristic由来の誤検出にも言及。
- Zhang et al., *Software Architecture Recovery with Information Fusion (SARIF)*。依存、コードテキスト、ディレクトリの三種を融合し、既存比較手法より平均36.1%高い精度を報告。
- Murphy, Notkin, Sullivan系の Reflexion Modeling と、ACToolの実務内研究。実装と高水準モデルの差分を反復的に扱う枠組み。
- Ernst et al., *Daikon*. 実行トレースに基づく likely invariant 検出。観測された実行に真だった性質であり、全実行での真理を保証しない。
- Beschastnikh et al., *Synoptic*. ログからFSMを推定し、event ordering invariantをモデルに保存。受動ログに現れない挙動は復元できない。
- Jia and Harman 等、mutation testing survey。mutationはテスト十分性・テスト生成の強い手段だが、equivalent mutantとコスト、oracle意味論の限界がある。

---

## 最終判断

現提案は、逆回転を「AIによるコード要約」ではなく「証拠に基づき、規範を再設定し、反証可能性を回復する工程」と捉えており、方向性は正しい。

ただし成功の鍵は R0〜R8 に解析器を足すことそのものではない。**命題ごとの証拠独立性、適用scope、反証計画、人間authority、時間的stalenessを、機械可読な一次成果物として保持し続けること**である。これを欠くと、豊富な解析・検索・LLM・mutationを投入しても、既存実装の物語をもっともらしく再話する「高性能な追認装置」になる。

---

この追加前提を踏まえると、前回の R7.5 は「人間の承認待ちレーン」ではなく、既存の **residual → grill → RFC／進化差分** の正規経路へ完全に吸収すべきです。つまり authority はワークフロー状態ではなく、grill で確定した選択の**出所・適用範囲・再審査条件を記録するプロベナンス**として扱うのが整合的です。workspacify は既に residual を構造化し、未解決の問いを後続の人間 grill へ渡す設計なので、この規律を拡張する形が最も安全です。 

## Q1. R7.5 を residual/grill に統合する

### 結論

`Human norm-setting` という独立段・承認待ち状態は不要です。代わりに、既存の residual を **「規範化判断が必要な問い」** まで表現できるように拡張し、`/grill-me-for-rfc` の対話で選択された結果を RFC 命題に書き戻します。

重要なのは、`authority` を「誰かの許可待ち」ではなく、**選択済み規範の決定プロベナンス**としてのみ格納することです。問いは必ず選択肢・証拠・選ばなかった場合の既定値を持ち、回答がなくてもパイプラインは `chosen_default` を採用して進めます。これは既存の residual 規律と一致します。 

### residual に追加すべきフィールド

既存の次の核は維持します。

```text
topic
alternatives
chosen_default
why_unresolved
grill_question
```

その上で、逆回転専用の `normative_context` を加えるのがよいです。

```json
{
  "residual_id": "rev-res-authz-delete-001",
  "topic": "Cross-tenant session deletion authorization rule",
  "alternatives": [
    {
      "id": "A",
      "statement": "Require principal.tenant_id === session.tenant_id before deletion.",
      "consequences": [
        "Preserves tenant isolation.",
        "Requires explicit support path for platform administrators."
      ],
      "supporting_evidence": ["ev-static-18", "ev-trace-41"],
      "counterevidence": ["ev-test-77"]
    },
    {
      "id": "B",
      "statement": "Permit deletion when an administrative role is present.",
      "consequences": [
        "Supports centralized support operations.",
        "Requires auditable role verification and tenant-scoped audit records."
      ],
      "supporting_evidence": ["ev-history-12"],
      "counterevidence": []
    }
  ],
  "chosen_default": {
    "alternative_id": "A",
    "reason": "Lowest-privilege behavior consistent with observed reject paths.",
    "default_is_normative": false,
    "requires_revalidation_if": [
      "admin support workflow is discovered",
      "external authorization policy is supplied",
      "tenant model changes"
    ]
  },
  "why_unresolved": "Observed code, tests, and traces disagree on whether administrative override is intentional.",
  "grill_question": "Which tenant-deletion policy is intended: A strict tenant match, or B an audited administrator override? If neither is selected, A remains a provisional default and is emitted as unresolved rather than normative.",

  "normative_context": {
    "risk_class": "security-critical",
    "normative_candidate_id": "nrm-authz-delete-tenant-001",
    "scope": {
      "commit": "<git-sha>",
      "environments": ["test", "staging"],
      "feature_flags": {
        "new_authz": "on"
      },
      "api_versions": ["v2"]
    },
    "evidence_groups": [
      {
        "group_id": "source-static",
        "evidence_ids": ["ev-static-18"]
      },
      {
        "group_id": "runtime-trace",
        "evidence_ids": ["ev-trace-41"]
      },
      {
        "group_id": "test-oracle",
        "evidence_ids": ["ev-test-77"]
      }
    ],
    "falsification_plan": [
      "Run isolated cross-tenant delete under v2 and new_authz=on; database effect must be absent.",
      "Mutate the tenant equality guard; the negative authorization test must become red."
    ],
    "default_output_mode": "unresolved-contract-candidate",
    "escalation_policy": "must-grill-before-normative-rfc"
  }
}
```

### grill の結果として記録すべきもの

grill の結果は「承認済み／未承認」という待機状態ではなく、**選択イベント**として記録します。回答があれば選択を記録し、なければ `chosen_default` を採用します。ただし高リスク命題では、既定値を規範に昇格させず、`unresolved-contract-candidate` のまま RFC に残します。

```json
{
  "normative_decision_id": "nd-authz-delete-tenant-001",
  "residual_id": "rev-res-authz-delete-001",
  "decision_kind": "grill-selection",
  "selected_alternative_id": "A",
  "selection_source": "human-grill",
  "authority_record": {
    "authority_kind": "domain-steward",
    "authority_ref": "team-or-role-stable-id",
    "decision_session_ref": "grill-session-2026-09-10-001",
    "decision_timestamp": "2026-09-10T16:53:00+09:00",
    "decision_basis": [
      "ev-static-18",
      "ev-trace-41",
      "ev-history-12",
      "counterexample-result-09"
    ]
  },
  "normative_effect": {
    "state": "normative-for-scope",
    "scope_ref": "scope-authz-delete-v2",
    "review_on": [
      "authorization-policy change",
      "tenant model change",
      "admin role change",
      "external IdP integration change"
    ]
  },
  "rejected_alternatives": [
    {
      "alternative_id": "B",
      "reason": "No authoritative support workflow or audit requirement was supplied."
    }
  ]
}
```

ここで `authority_ref` は氏名の自由文ではなく、チームや職責、または組織の安定 ID を推奨します。たとえば `security-domain-steward`、`billing-policy-owner`、`platform-architecture-council` のような識別子です。個人が替わっても、権限の所在と再審査の責任が残ります。

### 「回答なし」の扱い

| リスク | 人間が答えなかった場合 | 下流への出力 |
|---|---|---|
| 低リスク | `chosen_default` を provisional contract として採用 | RFC に scope つきの暫定条項として記載 |
| 中リスク | default を採用するが、反証計画と再審査条件を必須化 | RFC に `provisional`、RESIDUE 候補にも残す |
| 高リスク | default は解析の進行用にのみ使い、規範条項へ昇格させない | unresolved / grill question を RFC と RESIDUE に保持 |
| 安全・権限・金銭・削除・暗号 | 正式な選択がなければ「禁止的な安全側既定」を採用可能。ただしそれは既存実装の意図の断定ではない | RFC は「未確定の保守的制約」として書き、設計確定とは扱わない |

この設計なら、`ask the human` や `waiting for approval` を payload に置かず、問いは常に完結しています。「返答がなければ何をするか」も既定値として定義済みです。一方で、その既定値を無条件に正典へ昇格させないため、追認 RFC と安全性の両方を防げます。 

## Q2. 限定状態と COMPLETE の分離

### 結論

その切り分けは正しいです。順回転の `WORKSPACIFY-TREE-MANIFEST.json` と `WORKSPACIFY-ALLOCATE-MANIFEST.json` における `COMPLETE` は、既存の構造・整合性・公開・再読込・WIG・manifest 完全性に関する機械的な意味を持つため、逆回転の認識論的不確実性を理由に変更してはいけません。既存の `COMPLETE` は「与えられた入力に対して、定義された成果物を整合的に生成・検証した」という意味に保つべきです。 

ただし、reverse 成果物が `COMPLETE` ではないことだけでは下流の不確実性保持になりません。`/grill-me-for-rfc` が Markdown を読み込む過程で、観測・推論・規範候補・未解決を文章に平坦化すると、不確実性は失われます。

従って、必要なのは状態名の変更ではなく、**不確実性を持つ sidecar 正本と、下流成果物への安定 ID 参照を二重に維持すること**です。

### 状態を置く層

| 層 | 置くもの | 状態の意味 |
|---|---|---|
| `/workspacify-reverse` の独自 artifact | `ANALYSIS-SCOPE.json`、`CLAIM-LEDGER.json`、`GAP-REGISTER.json`、`COUNTEREXAMPLE-RESULTS.json` | 観測範囲と証拠の完全性。規範の正しさを宣言しない |
| `ORIGIN-LONG-SPEC.json` | claim の射影、artifact hash、scope、未解決、residual 参照 | 下流に渡す機械可読な逆回転正本 |
| `ORIGIN-LONG-SPEC.md` | JSON の人間可読ビュー | 読み物。機械的な最終権威にしない |
| reverse mode の TREE-MANIFEST | `status: COMPLETE` は維持し、入力 provenance と reverse-sidecar への hash 参照を保持 | ツリー・所有権・依存・境界・DAGがスキーマ上完全であること |
| reverse mode の ALLOCATE-MANIFEST | `status: COMPLETE` は維持し、RFC-SEED ごとの claim bundle hash を保持 | seed配置・契約registry・WIG・公開の完全性 |
| RFC-SEED | 各構造項目に `claim_id`、`claim_type`、`scope_ref`、`residual_id` を注入 | grill が規範化の候補と未解決を失わない |
| `/grill-me-for-rfc` の対話出力 | `normative_decision` と `residual resolution` | 選択された規範、選ばれなかった案、authority、再審査条件 |
| Canonical RFC | 規範文に加え、命題ID・scope・authority・根拠参照・残余問いの索引 | 正典本文と不確実性の出所を接続 |
| GRAPH／Dirs-Tree／Tickets | ノード・エッジ・チケットに origin claim ID と risk / residual link | 下流実装で根拠鎖を追跡可能にする |
| `/find-omissions` と README RESIDUE | `claim_id` と `residual_id` を持つ omission / RESIDUE | 発見された不足を元の不確実性へ戻す |

### 具体的な不変条件

reverse 側に限定状態を導入しても、順回転に影響させないためには、以下の不変条件を追加するべきです。

1. reverse artifact の状態語彙は、順回転の manifest `status` と同じフィールドを共有しない  
   - `analysis_state`、`evidence_state`、`claim_state` のように namespaced field にする  
   - 順回転の `status: COMPLETE` を意味変更しない

2. `COMPLETE` は常に構造完全性だけを意味する  
   - 逆回転 mode の TREE／ALLOCATE においても、`COMPLETE` は「入力パケットと成果物がスキーマ・ゲート・公開規律を満たした」こと  
   - 「復元したアーキテクチャが正しい」「RFC が規範的に妥当」は意味しない

3. 規範条項は必ず provenance を遡れる  
   - `RFC clause → normative_decision_id → residual_id / claim_id → evidence artifact hash` の鎖を必須化する  
   - この鎖がない規範条項は、reverse 起点 RFC では `normative` に分類できない

4. 未解決を本文の注釈だけに置かない  
   - Markdown の脚注や自然言語だけでは、GRAPH・Tickets・RESIDUEへ確実に伝播しない  
   - `residual_id` と `claim_id` を機械可読な構造として残す

5. stale を伝播させる  
   - 対象 commit、設定、schema、依存 lockfile、生成器、外部 API 契約、デプロイ定義が変わったら、依存する claim と RFC 条項を `stale` にする  
   - `stale` は `COMPLETE` を取り消す状態ではなく、「正典の再審査が必要」という別軸の警告

### 推奨する reverse provenance envelope

すべての reverse 起点の正典化可能な要素に、次のような小さな共通 envelope を入れるのが実装上扱いやすいです。

```json
{
  "origin": {
    "mode": "reverse",
    "origin_claim_ids": [
      "clm-authz-delete-tenant-001"
    ],
    "residual_ids": [
      "rev-res-authz-delete-001"
    ],
    "analysis_scope_hash": "sha256:<...>",
    "evidence_bundle_hash": "sha256:<...>",
    "claim_state": "normative-for-scope",
    "staleness_state": "fresh",
    "scope_ref": "scope-authz-delete-v2"
  }
}
```

これは TREE-MANIFEST の既存の owner・dependency・boundary・WIG 完全性を置き換えません。単に「この reverse 起点の要素は、何を根拠に、どの範囲で、どの residual を解消または残したか」を追跡する追加メタデータです。既存のハッシュ、原子的公開、entry parity、seed parity、WIG、実装順序の規律とも矛盾しません。 

## Q3. 低コスト・高効果の上位3つ

実装コストと効果を、既存 R0〜R8・evidence tree・residual・provenance 三分類・R7 packet・R8 JSON/Markdown 出力が既にあるという前提で評価すると、上位3つは以下です。 

| 優先 | 失敗モード | なぜ最優先か | 最小実装 | 主な効果 |
|---:|---|---|---|---|
| 1 | **F11 証拠独立性の錯覚** | 追認 RFC の根本原因であり、複雑な動的解析を待たずに今すぐ軽減できる。同一コード由来のテスト・コメント・README・履歴を別々の証拠として数えると、AIの確信だけが不当に増える | evidence に `source_kind`、`derivation_group`、`origin_commit`、`depends_on_claim_ids` を追加。R7 packet で「独立 evidence group 数」と「同起源の繰返し」を機械表示 | AIが「根拠が多い」と誤認する面積を即座に縮小 |
| 2 | **F12 未観測域の不存在化** | 静的検索・テスト・トレースのヒットなしを「存在しない」と扱う誤りは、DI・flag・環境差・非同期・外部サービスで必ず起きる | claim に `scope` と `coverage_status` を追加。R0/R1 で環境・flag・入口・外部I/Oの台帳を作り、R7で未観測セルを表示 | 「確認済み」と「未観測」を機械的に分離し、静かな過信を防ぐ |
| 3 | **F13 時間的ドリフト** | 初回復元が正しくても、設定・schema・依存・生成器・外部契約の変化で直ちに古くなる。逆回転は一回限りの作業ではなく、再投資可能性の入口である | artifact hash と入力依存の reverse index を作る。Git diff、lockfile、IaC、schema、設定変更から関連 `claim_id` を `stale` 化する | 再投資ループへの接続を実際に機能させ、古い根拠を正典として残さない |

### なぜ F15 ではないか

F15「安全・権限境界の追認」は、被害の重大性だけなら最優先です。しかし低コストとは言いにくいです。認可は principal・resource・action・tenant・ロール・middleware・非同期経路・外部 IdP・DB 内ポリシー・監査を横断するため、専用の抽出器と動的な negative test が必要になります。

ただし、対象が決済・認証・暗号・マルチテナントのような高リスク領域なら、一般順位を無視して F15 を1位に繰り上げるべきです。その場合は F11 と F12 に加え、F15 を最初のスコープに含めます。

### F11 の最小スキーマ

```json
{
  "evidence_id": "ev-test-77",
  "source_kind": "unit-test",
  "derivation_group": "implementation-derived-authz-v2",
  "origin_commit": "<git-sha>",
  "independence_class": "not-independent-from-source",
  "supports_claim_ids": [
    "clm-authz-delete-tenant-001"
  ]
}
```

`derivation_group` は「同じ原因から派生した可能性のある証拠群」を表します。たとえば、同一 PR で実装・テスト・README が同時に導入されたなら、それらは3本の独立根拠ではありません。

## Q4. カード駆動 Reflexion Modeling

### 結論

成立します。ただし、古典的な Reflexion Modeling の「人間が高水準モデルを自由に書く」という入口を使いません。conver では、機械が抽出した複数の候補モデルとマッピングを**decision card の選択肢**として提示し、人間は採否・既定値・許容逸脱だけを選びます。

つまり、人間はモデルの作者ではなく、候補間の意味的な裁定者になります。これは「AI の判断面積を減らす」という conver の原理にも合います。

### 具体的な4成果物

```text
STATIC-RELATIONS.json
  └─ ソース、型、呼出、データ、設定、履歴から得た関係

RUNTIME-RELATIONS.json
  └─ trace、ログ、eBPF、record/replay などで観測した関係

CANDIDATE-ARCHITECTURES.json
  └─ 複数の高水準モデル、クラスタ、許容依存、候補マッピング

REFLEXION-DELTA.json
  └─ convergence / divergence / absence / unknown と根拠
```

### 候補モデルの生成

機械側は、少なくとも次の候補を生成します。

| 候補 | 生成規則 | 用途 |
|---|---|---|
| P1 物理モデル | 現行ディレクトリ／package／workspace をそのまま上位要素にする | 実装制約を忠実に表す |
| P2 依存クラスタモデル | CPG、call graph、dataflow、共変更、凝集度、外部境界からクラスタリング | 論理的責務候補を出す |
| P3 実行時モデル | trace、queue、RPC、DB、job、external API を中心に分割 | 運用時の結合を露出する |
| P4 層規律モデル | foundation、protocol、ports、adapters、core、interfaces、conformance の既存語彙へ仮写像 | workspacify の層ルールとの衝突を見つける |
| P5 セキュリティ／データ横断モデル | principal、tenant、secret、PII、payment、deletion、audit、schema を横断 concern として分離 | 機能クラスタリングで消えやすい高リスク境界を保護する |

AI は候補を新規発明するのではなく、各候補の差分を説明し、カードを組み立てます。

### カードの例

```json
{
  "card_id": "rm-boundary-auth-db-001",
  "kind": "reflexion-boundary-choice",
  "topic": "auth と db の関係を論理境界としてどう扱うか",
  "observed_relations": {
    "static": {
      "import_edges": 23,
      "call_edges": 41,
      "dataflow_edges": 12
    },
    "runtime": {
      "trace_count": 184,
      "observed_transactions": 71
    },
    "history": {
      "cochange_ratio": 0.62,
      "introducing_commit": "<sha>"
    }
  },
  "alternatives": [
    {
      "id": "A",
      "model": "auth is a consumer of db through an explicit port",
      "mapping": {
        "src/auth": "auth-core",
        "src/db": "persistence-adapter"
      },
      "predicted_reflexion_delta": {
        "convergent": 31,
        "divergent": 23,
        "absent": 2,
        "unknown": 9
      },
      "consequences": [
        "Direct imports become migration debt rather than intended architecture.",
        "A port contract and transition tickets are required."
      ]
    },
    {
      "id": "B",
      "model": "auth and db form one persistence-oriented subsystem",
      "mapping": {
        "src/auth": "identity-persistence-subsystem",
        "src/db": "identity-persistence-subsystem"
      },
      "predicted_reflexion_delta": {
        "convergent": 54,
        "divergent": 0,
        "absent": 4,
        "unknown": 7
      },
      "consequences": [
        "Current implementation has fewer divergences.",
        "The subsystem has weaker separation for future provider replacement."
      ]
    }
  ],
  "chosen_default": {
    "alternative_id": "B",
    "reason": "Current evidence favors a single subsystem, but this does not establish whether the structure is desired."
  },
  "grill_question": "Is the direct auth-to-db coupling an intentional permanent subsystem boundary (B), or should it be treated as migration debt toward a port (A)? If unanswered, B is used only as the descriptive model and the architectural intent remains residual.",
  "residual_on_default": true
}
```

### 人間の選択肢

人間に許す入力は、既存の規律に合わせて限定できます。

- 候補 A を採用する
- 候補 B を採用する
- 候補 A を「現状記述」として採用し、規範は未確定とする
- 候補 B を「現状記述」として採用し、規範は未確定とする
- より保守的な既定値を採用する
- いずれも選ばず、`chosen_default` の記述モデルを採用して residual を維持する

この最後の選択肢が重要です。人間が「どちらも正典にしたくない」と言えるため、自由記述を求めずに、追認と強制的な設計確定を避けられます。

### Reflexion delta の意味を拡張する

古典的な3分類に加え、逆回転では `unknown` を第一級にしてください。

| delta | 意味 | 後続処理 |
|---|---|---|
| `convergent` | 候補モデルが許す関係が、対象scopeで観測された | 観測事実として記録。規範化は別判断 |
| `divergent` | 観測関係が候補モデルで禁止または未宣言 | migration debt、例外、またはモデル誤りとして residual/card 化 |
| `absent` | 候補モデルが要求するが、観測されない | dead feature、未実装、未観測、またはモデル誤りとして調査 |
| `unknown` | 動的設定、観測不足、生成物、外部依存などで判定不能 | 絶対に absent と合算せず、scope 拡張・トレース・grill の入力にする |

この `unknown` を導入しない Reflexion Modeling は、逆回転では危険です。特に DI、reflection、feature flag、プラグイン、非同期キュー、デプロイ・sidecar・外部 API は、静的な `absence` に偽装されやすいからです。 

## Q5. 「成功しない条件」の機械的な判断材料

### 結論

5項目の最終判定を機械に委ねるべきではありません。しかし、各項目の**能力・可観測性・再現性・危険性のプロファイル**はかなり機械化できます。

出力は `eligible: true/false` ではなく、`capability profile`、`evidence profile`、`blocker`、`risk`、`unknown` とすべきです。人間は、その材料を見て「正典 RFC 再建を目指すか」「限定的な安全化・移行計画へ目的を下げるか」を決めます。これは §3.3 の「機械は成功／失敗を判定しない」という原則と一致します。 

### 5条件ごとの機械化可能な指標

| 条件 | 機械化できる指標 | 出力例 | 自動判定してはいけないこと |
|---|---|---|---|
| 規範を決める authority がいない | `residual` 中の high-risk / must-grill 件数、対応する authority role の解決率、過去の norm decision の存在、役割マッピングの鮮度 | `high_risk_claims=18; authority_resolved=4/18; decision_history=0` | authority 不在ならプロジェクトが失敗、と断定すること |
| 安全な実行・reset・隔離環境がない | CI／sandboxの有無、テストのexit code、DB reset時間、fixture再生成成功率、外部I/Oのmock率、破壊的operationの隔離率、record/replay可否 | `destructive_transition_isolated=2/11; reset_p95=14m; external_effect_mocked=35%` | 実行可能なら十分安全、と断定すること |
| 外部サービス・設定・schemaが主要動作を決めるが観測不能 | config key inventory、flag参照率、外部endpoint／topic／DB table／schema検出数、runtime trace coverage、秘密・remote configで未観測の割合 | `external_boundary_claims=42; observed=15; opaque=19; unknown=8` | 未観測の外部依存が多いから正典化不可能、と自動決定すること |
| テストのoracleと入力空間が不明 | test discovery率、実行成功率、mutation分類、assertion密度、negative test率、property/metamorphic/differential test存在、入力generatorの有無、critical path の trace-to-test 比率 | `critical_claims=27; direct-oracle=9; negative=3; metamorphic=0; mutation-unclassified=41%` | mutation scoreが高いから契約が正しい、と結論すること |
| 誤った物理構造を保存せざるを得ない | physical cluster と logical candidate cluster の NMI／ARI、cross-boundary static/runtime edge比率、SCC跨ぎ、change coupling、Reflexion divergence、mismatch残数 | `physical-logical mismatch=0.48; cross-boundary runtime edges=37%; divergent high-risk edges=12` | 乖離が大きいから必ず再編すべき、と断定すること |

### 推奨する capability profile

```json
{
  "artifact_kind": "reverse-capability-profile",
  "analysis_scope_hash": "sha256:<...>",
  "dimensions": {
    "authority": {
      "high_risk_residuals": 18,
      "authority_resolved": 4,
      "authority_unknown": 14,
      "decision_history_coverage": 0.22
    },
    "safe_experimentation": {
      "build_reproducible": true,
      "tests_executable": true,
      "isolated_destructive_transitions": {
        "covered": 2,
        "total": 11
      },
      "reset_p95_seconds": 840,
      "external_effect_mock_ratio": 0.35,
      "record_replay_available": false
    },
    "observability": {
      "external_boundary_claims": 42,
      "trace_observed": 15,
      "statically_observed_only": 8,
      "opaque": 19,
      "feature_flag_inventory_coverage": 0.68
    },
    "oracle_strength": {
      "critical_claims": 27,
      "negative_oracle_covered": 3,
      "differential_oracle_covered": 1,
      "metamorphic_oracle_covered": 0,
      "mutation_results_unclassified_ratio": 0.41
    },
    "architecture_fit": {
      "physical_logical_cluster_agreement": 0.52,
      "cross_boundary_runtime_edge_ratio": 0.37,
      "high_risk_reflexion_divergences": 12,
      "unknown_relations": 29
    }
  },
  "machine_statement": {
    "can_prove": [
      "The listed evidence was collected for the declared scope.",
      "High-risk claims with no resolved authority exist.",
      "Several destructive transitions cannot currently be tested in isolation."
    ],
    "cannot_prove": [
      "The recovered RFC is normatively correct.",
      "The project is unsuitable for reverse rotation.",
      "The existing physical structure is architecturally wrong."
    ]
  },
  "recommended_human_grill_topics": [
    "Decide whether authority coverage must increase before normative RFC generation.",
    "Decide whether to provision a resettable staging environment for destructive transitions.",
    "Decide whether logical/physical boundary mismatches are debt or intended design."
  ]
}
```

### 指標を閾値にしない理由

たとえば `authority_resolved < 80%`、`trace coverage < 60%`、`mutation score < 70%` のような固定閾値をゲートにすると、対象ドメイン・規制・規模・テストスタイルに無関係な偽の基準になります。

代わりに、機械は次を算出します。

- 高リスク命題の数
- そのうち authority が解決している数
- 反証可能な命題の比率
- 未観測外部境界の数
- 安全にresetできない状態遷移の数
- 物理構造と論理候補の乖離
- stale な命題の数
- unknown のまま残る relation の数

人間は「どの未確定が受容不能か」を決めます。たとえば小規模な社内ツールでは外部境界の未知が数件でも進める判断があり得ますが、認証・決済・医療・マルチテナント基盤では、同じ値が正典化停止の理由になります。

## 統合後の最小変更案

既存実装を極力壊さず、最初に入れるなら次の順が最も整合的です。

1. reverse 側に `CLAIM-LEDGER.json` と `ANALYSIS-SCOPE.json` を追加する  
2. existing residual に `normative_context` を追加する  
3. `/grill-me-for-rfc` が、選択済みの結果を `normative_decision` として RFC の命題 ID へ結びつける  
4. reverse mode の TREE／ALLOCATE manifest は `COMPLETE` を維持し、`reverse_provenance` の hash 参照だけを追加する  
5. RFC-SEED、RFC、GRAPH、Tickets、omission、RESIDUE に `claim_id`／`residual_id` を伝播する  
6. F11、F12、F13を最初の実装対象にする  
7. その後、カード駆動 Reflexion Modeling と high-risk security lane を導入する  

この形であれば、conver が既に持つ「人間への作業丸投げを禁じる」「問いと既定値を構造化する」「残余を次ループへ渡す」という強い規律を損なわず、逆回転固有の規範プロベナンスと不確実性管理を追加できます。

---

最適解は**案2を基礎に、RFC／GRAPH／Tickets／omission／RESIDUEへ「最小の安定参照」を選択的に伝播する案2.5**です。全成果物へ不確実性の全フィールドを複製する案1は順回転を侵食し、RFCだけに閉じる案3は進化・omission・RESIDUEから元の論点へ戻る鎖が途中で切れます。 

## 推奨案：案2.5

不確実性の**正本**は reverse 側 sidecar に一元化し、順回転成果物には情報を複製せず、用途に必要な粒度の参照だけを加算的・任意に持たせます。

```text
reverse sidecar（正本）
  ANALYSIS-SCOPE.json
  CLAIM-LEDGER.json
  RESIDUAL-REGISTRY.json
  NORMATIVE-DECISIONS.json
  EVIDENCE-REGISTRY.json
  STALENESS-INDEX.json

順回転成果物（参照のみ）
  RFC-SEED.md             ← claim/residual の局所索引
  Canonical RFC           ← 規範条項ごとの provenance anchor
  *-GRAPH.json            ← node/edge ごとの origin refs
  *-Dirs-Tree.json        ← package/boundary 単位の集約 refs
  Tickets.json            ← ticket/spec 単位の driving refs
  omission                ← discovered gap の return refs
  RESIDUE                 ← product-level gap の return refs
```

ここで重要なのは、`authority`、`scope`、`staleness`、evidence independence の全内容を各成果物へコピーしないことです。詳細は常に sidecar の `claim_id`／`residual_id` を引いて取得します。

順回転成果物に許すのは、次のような**薄い provenance envelope**だけです。

```json
{
  "reverse_origin": {
    "claim_ids": ["clm-authz-delete-tenant-001"],
    "residual_ids": ["rev-res-authz-delete-001"],
    "analysis_scope_hash": "sha256:<scope-artifact-hash>",
    "evidence_bundle_hash": "sha256:<ledger-or-slice-hash>",
    "staleness_ref": "stl-authz-delete-001"
  }
}
```

この envelope は reverse mode でのみ任意に出現し、forward mode には一切出力しません。`authority` や evidence の詳細は sidecar の正本へ残し、順回転 artifact 側には持ち込みません。

## 案ごとの判定

| 案 | (a) provenance 鎖 | (b) 順回転保護 | (c) 進化ループ | (d) omission / RESIDUE の還流 | 判定 |
|---|---|---|---|---|---|
| 案1：全成果物に全ID・状態を伝播 | 最も直接的だが重複・乖離しやすい | 悪い。既存schema、canonical JSON、hash、reload、WIG周辺に広く変更が波及 | 強いが、不要な詳細が全層に漏れる | 強い | 不採用 |
| 案2：sidecar参照だけ | 正本の一貫性は最良。ただし参照点が粗いと条項単位で辿れない | 最良。順回転の既存規律をほぼ維持できる | sidecarを能動的に読む実装が必要 | omission / RESIDUE に直接参照がなければ弱い | 基礎として採用 |
| 案3：RFC-SEED／RFCのみ | RFC条項までは辿れる | 良い | GRAPH、ticket、実装ギャップから論点を逆引きしにくい | 弱い。後段の不足がRFC全体へぼやけて戻る | 不採用 |
| **案2.5：sidecar正本＋用途別の薄い参照** | 条項・境界・チケット・不足から安定IDで辿れる | 良い。任意のreverse extensionに閉じる | 強い。進化対象をclaim/residual単位で特定できる | 強い。欠落を元の未確実性・証拠・scopeへ戻せる | **推奨** |

`WORKSPACIFY-TREE-MANIFEST.json` と `WORKSPACIFY-ALLOCATE-MANIFEST.json` は、既に ownership、dependencies、boundaries、WIG、implementation order、integrity、manifest hash を持つ強い機械成果物です。reverse 不確実性を完全複製すると、既存の「構造的完全性」の意味を認識論的な「規範の確実性」と混線させる危険があります。 

## 正本と参照の分離

### sidecar にのみ置く情報

以下は更新頻度が高く、命題単位で詳細であり、各成果物にコピーすると乖離を生みやすいため、reverse 側の正本に一元化します。

| 情報 | 正本 | 理由 |
|---|---|---|
| `claim_id` の本文・分類 | `CLAIM-LEDGER.json` | observed / inferred / normative / unresolved の状態遷移を一箇所で管理する |
| 根拠行・トレース・履歴・設定 | `EVIDENCE-REGISTRY.json` | 大量であり、hash・生成器版・対象commit・証拠独立性を一元管理する |
| evidence independence | `EVIDENCE-REGISTRY.json` | 同一PR・同一実装・同一テスト由来を因果グループとして管理する |
| `scope` の詳細 | `ANALYSIS-SCOPE.json` と claim ledger | commit、環境、flag、tenant、API version、workload を繰返しコピーしない |
| `authority` の詳細 | `NORMATIVE-DECISIONS.json` | grill の選択、選ばなかった代替案、判断根拠、再審査条件を保持する |
| `staleness` の判定根拠 | `STALENESS-INDEX.json` | diff、lockfile、IaC、schema、外部契約変更から一元的に伝播させる |
| residual の選択肢・既定値 | `RESIDUAL-REGISTRY.json` | `topic / alternatives / chosen_default / why_unresolved / grill_question` の正本を保つ |

既存 workspacify では、stage one の TREE-MANIFEST が単一正典であり、stage two は渡された証明済み素材を再計算・再解釈しないという規律があります。reverse provenance についても、各下流成果物が個別に authority や evidence independence を再計算しない構造にするべきです。 

### 順回転成果物に置く参照

次の表のように、各成果物が自身の役割に必要な最小限だけを持ちます。

| 成果物 | 持たせる最小情報 | 持たせない情報 | 目的 |
|---|---|---|---|
| `RFC-SEED.md` | `claim_id`、`residual_id`、`scope_ref`、risk class、sidecar bundle hash | 全証拠本文、authority詳細、independence graph | grill が論点の出所と未確実性を把握する |
| Canonical RFC | 規範条項ごとの `claim_id`、`normative_decision_id`、`residual_id`、scope ref | 根拠の全文・トレース生データ | 規範条項を人間の選択と証拠鎖へ接続する |
| `*-GRAPH.json` | node／edgeごとの `origin_claim_ids`、`open_residual_ids`、risk class | authority、詳細scope、証拠グループ | graphify・boundify が「どの境界が未確定か」を保持する |
| `*-Dirs-Tree.json` | package／boundary単位の `origin_claim_ids`、`residual_summary_ref` | claim本文・詳細evidence | 物理境界と論理境界の不一致を追跡する |
| `Tickets.json` | `driving_claim_ids`、`driving_residual_ids`、`origin_kind` | evidence全文、authority詳細 | 実装チケットが何を確定・検証・移行するためのものかを保持する |
| ticket `spec` | claim slice hash、反証計画ID、scope ref | reverse artifact 全文 | Red／Green、契約テスト、migration を元の命題へ接続する |
| omission | `affected_claim_ids`、`origin_residual_ids`、`scope_ref`、oracle gap ref | authority全文 | omissionを「テスト不足」ではなく元の仮説・規範・scopeの不足へ戻す |
| RESIDUE | `affected_claim_ids`、`residual_ids`、`product-scenario-ref` | evidence全文 | 商品観点の不足を RFC／grill の論点へ戻す |

## (a) provenance 鎖

最小コストで「規範条項の provenance 鎖を遡れる」ようにするには、**RFC 条項にだけは必ず直接アンカーが必要**です。

最低限の鎖は以下です。

```text
Canonical RFC clause
  → claim_id
  → normative_decision_id
  → residual_id
  → evidence_bundle_hash
  → evidence records
  → source / trace / test / history / config
```

`normative_decision_id` は、grill の結果であり、承認待ちを表しません。既存 residual の選択肢から何が選ばれたか、誰のどの役割が決定権を持ったか、既定値を採用したのか、規範化せず保留したのかを記録する選択イベントです。

RFC 条項の例は次の程度で十分です。

```markdown
### Tenant-scoped session deletion

A request to delete a session must be rejected unless the requester is
authorized for that session's tenant.

<!-- reverse-origin:
claim=clm-authz-delete-tenant-001
normative-decision=nd-authz-delete-tenant-001
scope=scope-authz-delete-v2
residual=rev-res-authz-delete-001
-->
```

または RFC の本文を汚したくなければ、同じディレクトリに `RFC-PROVENANCE.json` を置き、条項アンカーだけを本文へ置く方法でもよいです。

```json
{
  "clause_id": "rfc-7.3.2",
  "origin_claim_ids": ["clm-authz-delete-tenant-001"],
  "normative_decision_id": "nd-authz-delete-tenant-001",
  "residual_ids": ["rev-res-authz-delete-001"],
  "scope_ref": "scope-authz-delete-v2",
  "evidence_bundle_hash": "sha256:<...>"
}
```

この条項レベルのアンカーがなければ、案2は「sidecar はあるが、どの RFC 文がどの根拠に基づくのか追えない」設計になり、追認 RFC 防止には不十分です。

## (b) 順回転を壊さない境界

順回転保護のため、次を明確な不変条件とします。

1. forward mode の artifact byte 列、schema、有効性、hash、ゲート挙動を変えない  
2. reverse mode の追加項目は既存フィールドを再定義せず、`reverse_origin` のような名前空間に閉じる  
3. existing `status: COMPLETE` の意味を変えない  
4. WIG、owner 一意性、依存DAG、実装順序、seed parity、reload validation は reverse provenance を評価しない  
5. reverse provenance の欠落は、構造ゲートの FAIL ではなく `residual` または reverse sidecar の `incomplete_for_scope` として表現する  
6. sidecar の hash だけは、reverse mode の manifest integrity に含めてもよい。ただし既存の `manifest_hash` の正規化・意味を変更せず、reverse extension の一部として扱う  

特に危険なのは、`semantic_review.status === "APPROVED"` と reverse の `authority` を混同することです。前者は既存 workspacify の semantic review に関する構造的な公開条件であり、後者は RFC の個別規範命題が grill でどのように選ばれたかという出所です。両者は別の責務であり、同一フィールドに統合すべきではありません。 

## (c) /drill-rfc-down に必要な情報

`/drill-rfc-down` が必要とするのは、不確実性の詳細全文ではなく、**何を進化させるべきかを特定する索引**です。

そのため、進化ループへは最低限次が必要です。

```text
RFC clause
  → claim_id
  → residual_id
  → risk class
  → staleness reference
  → affected graph node / boundary / ticket
  → required grill question or counterexample plan
```

### RFC に必要なもの

- 規範条項ごとの `claim_id`
- `normative_decision_id` または `residual_id`
- scope reference
- `staleness_ref`
- risk class
- 変更時に再検討すべき条件

RFC は「なぜこの条項を今変えるべきか」を示す入口です。ここに provenance anchor がなければ、進化ループは RFC 差分を見ても、その条項が古い根拠に依存しているのか、もともと未確定だったのか、どの grill に戻すべきかを判断できません。

### GRAPH に必要なもの

- node／edge の `origin_claim_ids`
- `open_residual_ids`
- boundary risk class
- `staleness_ref`

`/drill-rfc-down` は RFC の進化を GRAPH、Dirs-Tree、Tickets の差分へ落とします。その際、RFC 条項だけに ID があって GRAPH のノード・契約エッジに紐付かなければ、「どの論理境界・契約・依存を更新するか」を再探索する必要があります。これは進化を再び非決定論に戻します。

従って GRAPH には、少なくとも node／edge 単位の薄い参照が必要です。

### Dirs-Tree に必要なもの

Dirs-Tree は論理グラフの物理化であるため、詳細な claim を全コピーする必要はありません。必要なのは package／boundary 集約の参照です。

- `origin_claim_ids`
- `open_residual_ids`
- `logical_physical_mismatch_ref`
- `staleness_ref`

これにより、既存ディレクトリを保持する reverse mode でも、「この物理配置は構造的に存在するが、論理境界としては未確定または負債候補」という状態を失わずに済みます。 

### Tickets に必要なもの

Tickets は実装ループの単一情報源であるため、ここには直接参照が必要です。

- `driving_claim_ids`
- `driving_residual_ids`
- `counterexample_plan_ids`
- `origin_kind: reverse | forward | evolution | omission | residue`
- `staleness_ref`

チケットが「何を実装するか」だけを持ち、「何を確定させる／反証するか」を持たないと、逆回転由来の不確実性は実装時に消えます。特に Red 再建チケットには `counterexample_plan_id` が必要です。

## (d) omission と RESIDUE の還流

案3では、`/find-omissions` と `/crystalize-readme` が見つけた不足を RFC 全体へ戻すことはできます。しかし、**元の claim、scope、未解決選択肢、authority、証拠の独立性へ正確に戻せません**。

たとえば omission が「セッション削除に cross-tenant negative test がない」と検出した場合、戻る先が RFC 章だけでは不足です。必要なのは以下の鎖です。

```text
omission
  → affected_claim_id
  → residual_id
  → scope_ref
  → oracle_gap_ref
  → counterexample_plan_id
  → normative_decision_id
```

これにより、omission は次を区別できます。

- テスト実装が漏れているだけなのか
- RFC の規範条項が未確定なのか
- scope に feature flag が含まれていなかったのか
- mutation が未殺だが equivalent mutant の疑いがあるのか
- authority が選択した規範と実装が食い違うのか
- runtime 観測が不足しているのか

同様に、README の RESIDUE は商品シナリオを起点にするため、次の最小参照を持つべきです。

```json
{
  "residue_id": "res-product-session-delete-001",
  "scenario_ref": "scenario-cross-tenant-support-delete",
  "affected_claim_ids": [
    "clm-authz-delete-tenant-001"
  ],
  "origin_residual_ids": [
    "rev-res-authz-delete-001"
  ],
  "scope_ref": "scope-authz-delete-v2",
  "next_route": "drill-rfc-down"
}
```

これで `/drill-rfc-down` は、単に README の文章を補うチケットを作るのではなく、元の規範選択・テストoracle・境界契約・実装責務のどこを進化させるべきかを追えます。

## 実装優先度

最小変更で案2.5へ移るなら、以下の順番を勧めます。

1. reverse 側に `CLAIM-LEDGER.json`、`RESIDUAL-REGISTRY.json`、`NORMATIVE-DECISIONS.json`、`STALENESS-INDEX.json` を置く  
2. `ORIGIN-LONG-SPEC.json` に sidecar bundle hash と claim/residual の安定IDを持たせる  
3. `RFC-SEED.md` と Canonical RFC に条項単位の provenance anchor を導入する  
4. `*-GRAPH.json` の node／edgeへ `origin_claim_ids` と `open_residual_ids` を任意の reverse extension として加える  
5. `Tickets.json`、ticket spec、omission、RESIDUEに、claim/residualの最小参照を加える  
6. `*-Dirs-Tree.json` は package／boundary集約の参照だけに留める  
7. `WORKSPACIFY-TREE-MANIFEST.json` と `WORKSPACIFY-ALLOCATE-MANIFEST.json` には、reverse sidecar bundle hash と manifest-level summary のみを置く  

この配分なら、順回転の既存スキーマ・ゲート・ハッシュ・WIG・実装順序の意味を壊さず、逆回転の最重要要件――「規範条項の出所へ遡れる」「未確実性を下流で消さない」「omissionとRESIDUEを元の問いへ還流できる」――を満たせます。
