# RFC Tree–Driven Self-Converging Development Cycle Design

本書は、RFC-Driven Self-Converging Development Cycle を、長大RFCの階層分解、二層ループ、DAG検証、並列実行可能性、Rust製外部制御ランタイム、および数学的観測可能性を含む完全版アーキテクチャとして再定式化した設計記述である。元の手法では RFC を形式的契約とし、チケット直列実行・技術的負債の構造的追跡・RFCと実装の差分検出ループによって自己収束を実現することが基本構想とされていたが、本設計ではその単一RFC中心モデルを、RFCツリーを中間表現とする多層構造へ拡張する。[file:1]

## 設計目的

本手法の目的は、仕様空間と実装空間を分離したまま両者の乖離を反復的に減衰させ、かつ大規模・長期・高依存性の開発対象に対しても局所的な独立実装単位を保ちながら収束可能な開発制御系を構築することである。[file:1]

具体的には、次の制約を同時に満たすことを要求する。

- RFCは Single Source of Truth として機能すること。[file:1]
- 長大な完全版RFCは、5チケット前後で完了可能な独立検証可能・再利用可能単位へ再帰的に分解されること。
- 分解後のRFC群は深さ無制限の階層構造を取りうること。
- RFC群とチケット群は、それぞれ形式的DAGとして妥当性が保証されること。
- チケット内部の `make -> plan -> start -> review` は逐次実行される一方、DAG上で独立なチケット群は並列実行可能であること。
- Phase 0 の人間主導工程を除き、Phase 1 以降のループは Rust 製オーケストレータが Claude Code のスラッシュコマンド群を制御する構造であること。
- 完成判定は主観ではなく、RFC系アーティファクトと実装系アーティファクトの差分がゼロであることに基づく形式的基準であること。[file:1]

## 概念モデル

本手法は、仕様記述系、構造管理系、実装実行系、差分検出系、観測系、外部介入系の6層から成る。

1. **仕様記述系**: 完全版RFC、分解RFC群、OMISSIONS群。
2. **構造管理系**: `RFC_TREE.json`、RFC間依存、チケット依存、状態遷移ログ。
3. **実装実行系**: Claude Code スラッシュコマンド群によるチケットライフサイクル実行。
4. **差分検出系**: RFC・RFC_TREE・Tickets・コード・STUBの整合検証。
5. **観測系**: 乖離スコア、ノード状態、ラウンド履歴、失敗分類、進捗指標。
6. **外部介入系**: 人間によるコンテキスト注入、ノード修正、分割統合、実行停止、ロールバック。

この構成により、開発プロセスそのものを観測可能な分散制御対象として扱うことができる。[file:1]

## 改訂フェーズモデル

### Phase 0: 目的定義と情報収集

Phase 0 は唯一ループ外に存在する独立フェーズであり、人間のみが実行主体となる。ここでは開発目標、非機能要件、制約、外部技術文脈、先行事例、API仕様、法的・運用的境界条件を収集し、以後の推論と設計の上限制約を与える初期コンテキスト集合を確定させる。[file:1]

### Phase 1: 頂点RFC策定 (`/grill-me-for-rfc`)

Phase 1 では、Phase 0 で収集されたコンテキストを入力として、ソクラテス型対話を通じて曖昧性・前提矛盾・未定義領域を縮減し、長大かつ完全な頂点RFCを生成する。このRFCは実装に直接投入される一次作業単位ではなく、以後の構造分解の原典仕様として機能する上位契約である。[file:1]

### Phase 2: RFCツリー分解 (`/grill-me-to-split-rfc-as-tree`)

Phase 2 は、本改訂設計における中核追加フェーズである。長大な頂点RFCを、5チケット前後で完了可能な粒度を持ち、独立検証可能性と再利用性を持つ単位RFCへ再帰分解する。ここでいう「子」「孫」は説明上の例示にすぎず、実際の階層深さには上限を設けない。

各分解ノードは次の条件を満たさなければならない。

- 単一RFCノードが、おおむね5チケット前後で収束可能なスコープを持つこと。
- ノード単位で受入条件・公開境界・依存境界・検証方法が記述されること。
- ノードが独立に再利用可能であること。Rust 文脈では小規模 crate、subcrate、あるいは明確な public interface を持つ module/package 相当を想定する。
- ノードが自身の親・祖先・依存先・被依存先を把握し、親は子孫を列挙可能であること。
- 各 `RFC_XXX.md` と `RFC_TREE.json` の内容が完全一致していること。

このフェーズの出力は少なくとも次を含む。

- 頂点RFCから分解された `RFC_001.md` 〜 `RFC_NNN.md`
- RFC階層・依存・状態を保持する `RFC_TREE.json`
- ノードごとの検証境界、スコープ、見積チケット数、受入条件、依存条件

### Phase 3: 断片RFCごとのチケット分解 (`/formulate-tickets`)

Phase 3 では、Phase 2 で得られた各 RFC ノードを実装単位として扱い、各ノードに対して個別に `/formulate-tickets` を実行する。対象は単一の巨大RFCではなく、RFCツリーを構成する任意深度の末端または中間ノードであり、チケット分解は各ノードのローカル仕様境界に閉じた形で行われる。

生成されるチケットは、少なくとも次を持つ。

- 所属RFCノードID
- スコープ定義
- 受入条件
- 実装前提
- 依存チケットID列
- 予想副作用領域
- 検証手順

Phase 3 の重要要件は、生成されたチケット集合が局所DAGであるのみならず、RFCノード間依存を含めた全体チケットグラフとしてもDAGであることを保証する点にある。

### Phase 4: DAG準拠チケット実行

Phase 4 では、RFCツリーとチケット依存が正式なDAGであることを前提として、トポロジカル順序制約を守りながら並列実行可能なチケット群を探索し、実行する。ただし、個々のチケットの内部ライフサイクルである `make -> plan -> start -> review` は厳密逐次であり、この部分のみは並列化不可能なクリティカルシーケンスとみなす。[file:1]

したがって、本フェーズの並列化単位は「チケット」であり、「チケット内部ステージ」ではない。形式的には、ある時点で入次数0の未完了チケット集合を frontier とし、その frontier 上の各チケットを独立ワーカーへ割り当てうる。ただし各ワーカーが実行する内部状態遷移は次の有限状態機械に従う。

`CREATED -> SPECIFIED(make) -> PLANNED(plan) -> IMPLEMENTED(start) -> REVIEWED(review) -> DONE`

ここで失敗遷移や差戻し遷移も存在しうる。

### Phase 5: 技術的負債の構造的管理 (`[::STUB::]`, `/resolve-tickets`)

実装途中の不完全性は暗黙状態として放置してはならず、`[::STUB::]` マーカー付きのコメント、メタデータ、または専用台帳により一級アーティファクトとして明示化される。[file:1]

制約は次の通りである。[file:1]

- STUBマーカーなし不完全実装は仕様違反である。
- STUBが解決予定ノードまたはチケットのスコープを越えて残存する場合も違反である。
- 各STUBには少なくとも、発生箇所、責務所有者、親RFCノード、関連チケット、想定解決時期、違反レベルが付与される。
- STUB解決は `/resolve-tickets` による系統的処理対象となる。[file:1]

このフェーズは単独フェーズというより、Phase 4 の実行に内在する負債観測・負債制御ループとして働く。

### Phase 6: 乖離検出と omissions 抽出 (`/find-omissions-for-next-rfc`)

Phase 6 では、少なくとも以下のアーティファクト群の整合性を静的に突き合わせる。

- 頂点RFC
- 分解RFC群 (`RFC_XXX.md`)
- `RFC_TREE.json`
- 各RFCに対応するチケット記述
- 実装ソースコード
- STUB台帳
- レビュー結果

従来手法では RFC と実装コードの差分を検出して `OMISSIONS.md` を生成することが中核であったが、本改訂では検出対象を仕様階層構造まで拡張する。[file:1]

検出される乖離は最低でも以下の4類型に分類される。

- **Implementation Missing**: RFCに記述されたが未実装。
- **Implementation Contradiction**: 実装がRFC意図と矛盾。
- **Specification Deficiency**: 実装中に顕在化したがRFC未記述。
- **Structural Inconsistency**: `RFC_XXX.md` 群と `RFC_TREE.json` の親子・依存・状態記述が不一致。

このフェーズの出力は、構造化 `OMISSIONS.md` または JSON 化された omission ledger であり、各 omission がどの RFC ノード、どのチケット、どのコード領域、どの構造制約に対応するかを持つ。

### Phase 7: 自己収束ループ

Phase 7 では omissions を次周回の入力として再注入し、頂点RFCの改訂、RFCツリーの再構成、ノードの再分割・統合、依存関係修正、チケット再生成を誘発する。元手法が `OMISSIONS.md` を次の RFC 策定へ戻すことで自己収束を達成する構造であったのに対し、本設計では「仕様内容」と「仕様構造」の両方を収束対象に含める。[file:1]

## ループ構造

### 第一層ループ

第一層ループは Phase 1 から Phase 7 までを含む大域ループである。これは RFC 系アーティファクト全体を再編成しつつ、仕様空間と実装空間の大域的整合性を収束させる上位ループである。

### 第二層ループ

第二層ループは、ユーザ指摘に基づき Phase 4 から Phase 5 に存在する局所ループである。ここでは、ある RFC ノードまたはチケット群に対して、実装実行と技術的負債解消を局所的に反復し、当該ノードの内部整合性を高める。Phase 6 は第二層ループ終了後の大域検査に相当する。

この二層構造は、制御理論的には coarse-grained outer loop と fine-grained inner loop に対応し、外側が仕様構造収束、内側が実装整合収束を担う。

## 実行アーキテクチャ

### Claude Code と Rust オーケストレータの責務分離

Claude Code は実行ランタイムであり、スラッシュコマンドにより局所的な知的変換を実施する実働エージェントである。他方、第一層・第二層ループの制御主体は Claude Code 自身ではなく Rust 製オーケストレータである。

Rust オーケストレータの責務は次の通りである。

- フェーズ遷移制御
- RFC_TREE.json とチケットDAGの検証
- 実行可能 frontier の探索
- 並列ジョブスケジューリング
- Claude Code 呼出しと結果収集
- エラー分類とリトライ制御
- STUB台帳管理
- omission 集計
- 人間介入要求の停止点管理
- 全観測ログの永続化

この責務分離により、推論と制御が分離され、Claude Code が非決定的生成系として振る舞っても、上位制御系が再現可能な実行秩序を維持できる。

## DAG保証メカニズム

RFCツリーとチケット群の双方に対し、正式なDAG保証が必要である。保証は「生成時検証」と「更新時検証」の二段階で実施される。

### RFCツリーDAG検証

`RFC_TREE.json` に対して少なくとも以下を検証する。

- ノードID一意性
- 親子辺の整合性
- 依存辺の整合性
- 自己ループの不存在
- 有向閉路の不存在
- 孤立禁止または孤立許容ポリシーの明示
- 祖先・子孫キャッシュの再計算一致
- `RFC_XXX.md` 側メタデータとの完全一致

### チケットDAG検証

- チケットID一意性
- 所属RFCノードの実在性
- 依存先チケットIDの実在性
- RFC境界を跨ぐ依存の正当性
- 有向閉路の不存在
- 実行順序制約と依存制約の矛盾不存在
- チケット集合の到達可能性

Rust 実装では Kahn 法または DFS による cycle detection を利用できるが、重要なのはアルゴリズム選択そのものより、検証結果が実行前条件として強制されることである。

## 並列実行モデル

チケット実行の並列性は DAG の frontier 並列として定式化される。すなわち、未完了グラフにおいて入次数0のノード集合を逐次求め、その集合内で競合しないチケットをワーカープールへ投入する。

ただし次の制約がある。

- 同一チケット内部の `make/plan/start/review` は逐次。
- 同一リソース集合へ副作用を持つチケット同士は、たとえDAG上独立でも実行互換性制約により直列化されうる。
- RFCノード境界を跨ぐ共有資源競合がある場合、純粋依存関係とは別に resource lock graph を導入する必要がある。

したがって実際のスケジューリングは、`dependency DAG ∩ resource compatibility constraints` を満たす最大独立集合近似問題として実装されるのが自然である。

## 数学的定式化

### 開発空間

開発空間は、仕様空間と実装空間の直積として定義する。

\[
\mathcal{D} = \mathcal{S} \times \mathcal{I}
\]

ここで、

- \(\mathcal{S}\): 仕様空間。頂点RFC、分解RFC群、RFC_TREE、チケット仕様群から成る。
- \(\mathcal{I}\): 実装空間。実ソースコード、テスト、生成物、STUB台帳、レビュー結果から成る。

任意の時刻の開発状態は \(d_t = (s_t, i_t) \in \mathcal{D}\) と表される。

### RFCツリーの形式化

RFCツリーは、実際には単純木ではなく、親子関係と依存関係を併せ持つ有向非巡回グラフであり、次の四つ組で定義する。

\[
T = (V, E_h, E_d, \sigma)
\]

- \(V\): RFCノード集合
- \(E_h \subseteq V \times V\): 階層辺（parent-child）
- \(E_d \subseteq V \times V\): 依存辺（depends-on）
- \(\sigma\): 各ノードのメタデータ関数

各ノード \(v \in V\) に対し、\(\sigma(v)\) は最低でも次を含む。

- `id`
- `title`
- `scope`
- `acceptance_criteria`
- `estimated_ticket_count`
- `status`
- `parents`
- `children`
- `depends_on`
- `required_by`
- `verification_boundary`
- `reusability_boundary`

DAG条件は \((V, E_h \cup E_d)\) に閉路が存在しないことで与えられる。

### チケットDAGの形式化

各 RFC ノード \(v\) に対してチケットグラフを

\[
G_v = (K_v, D_v)
\]

と定義する。ここで \(K_v\) は RFC \(v\) に属するチケット集合、\(D_v\) は局所依存辺集合である。全体チケットグラフは

\[
G_{all} = \left(\bigcup_{v \in V} K_v,\ \bigcup_{v \in V} D_v \cup D_{cross}\right)
\]

であり、\(D_{cross}\) は RFC ノードを跨る依存を表す。実行可能性の必要条件は \(G_{all}\) がDAGであることである。

### 乖離関数

仕様と実装の収束状況を定量化するため、乖離関数

\[
\Delta : \mathcal{S} \times \mathcal{I} \to \mathbb{R}_{\geq 0}
\]

を導入する。最小構成では、

\[
\Delta(s,i) = \alpha M(s,i) + \beta C(s,i) + \gamma U(s,i) + \delta X(s,i)
\]

とする。

- \(M\): implementation missing 件数
- \(C\): implementation contradiction 件数
- \(U\): specification deficiency 件数
- \(X\): structural inconsistency 件数
- \(\alpha, \beta, \gamma, \delta > 0\): 重要度重み

終了条件は

\[
\Delta(s^*, i^*) = 0
\]

であり、これは元手法における「RFCと実装の乖離ゼロ」を、RFC_TREE 整合まで拡張した形式化である。[file:1]

### 観測ベクトル

各第一層ループ反復 \(r\) に対して観測ベクトル

\[
\mathbf{o}_r = (r, |V_r|, |K_r|, \Delta_r, \vec{\Delta}_r, \tau_r, \rho_r, \eta_r)
\]

を記録する。

- \(|V_r|\): RFCノード数
- \(|K_r|\): 全チケット数
- \(\Delta_r\): 大域乖離スコア
- \(\vec{\Delta}_r\): RFCノード別乖離ベクトル
- \(\tau_r\): ラウンド所要時間
- \(\rho_r\): STUB密度やレビュー失敗率を含む負債指標
- \(\eta_r\): 人間介入イベント列

この時系列が開発空間の収束軌跡を形成する。

## 状態機械

Rust オーケストレータは、少なくとも次の二種類の状態機械を保持する。

### 大域状態機械

`IDLE -> PHASE0_READY -> RFC_AUTHORING -> RFC_TREE_SPLITTING -> TICKET_FORMULATING -> EXECUTING -> DEBT_RESOLVING -> OMISSION_ANALYZING -> RESTRUCTURING -> CONVERGED | FAILED | SUSPENDED`

### チケット局所状態機械

`CREATED -> MAKING -> MADE -> PLANNING -> PLANNED -> STARTING -> STARTED -> REVIEWING -> REVIEWED -> DONE`

補助遷移として `BLOCKED`, `RETRYING`, `ROLLED_BACK`, `ABORTED` が存在しうる。

## 人間介入モデル

Phase 0 完了後も、人間は完全に排除されるわけではなく、制御系外部からの介入演算子として定義される。介入は、開発状態 \(d \in \mathcal{D}\) に対する外部変換

\[
\mathcal{H}(d, u) \to d'
\]

として表すことができる。ここで \(u\) は介入意図である。

主要な介入型は次の通りである。

- `INJECT_CONTEXT`: 追加調査・制約・方針を注入
- `REVISE_RFC_NODE`: 特定RFCノードの手動改訂
- `SPLIT_RFC_NODE`: ノード分割
- `MERGE_RFC_NODES`: ノード統合
- `PATCH_TREE_EDGE`: 親子辺または依存辺の修正
- `ABORT_TICKET`: チケット中断
- `ROLLBACK_ROUND`: 過去ラウンドへの巻戻し
- `OVERRIDE_CONVERGENCE`: 非ゼロ乖離のまま強制終了
- `FREEZE_SUBGRAPH`: 特定サブグラフの改変禁止

介入発生時には、Rust オーケストレータが DAG 再検証、状態再計算、ログ追記、必要に応じた再スケジューリングを実施する。

## 観測可能性とログ設計

本手法では observability を設計の中心に据える。STUBが技術的負債の観測可能性を担うという元設計思想を拡張し、RFC構造・チケット実行・差分収束・人間介入の全てをイベントストリームとして永続化する。[file:1]

最低限必要なログ系列は次の通りである。

- `round_log.jsonl`: 第一層ループ反復ログ
- `ticket_events.jsonl`: チケット状態遷移ログ
- `stub_ledger.jsonl`: STUB生成・更新・解消ログ
- `omissions.jsonl`: omission分類ログ
- `tree_mutations.jsonl`: RFC_TREE変更ログ
- `human_interventions.jsonl`: 介入ログ
- `scheduler_decisions.jsonl`: 並列実行決定ログ

これにより、事後解析、収束失敗診断、再実行、監査証跡、再現可能研究が可能になる。

## 期待される合理性

本改訂により、元の手法が持っていた「仕様と実装を二つの独立表現として扱い、その差分を収束させる」という本質を保持しつつ、次の点で構造合理性が増す。[file:1]

- 長大RFCを直接実装へ落とさないため、認知負荷と変更半径が局所化される。
- RFCノードが独立検証可能単位であるため、部分再実装・部分再利用・部分ロールバックが容易になる。
- RFC構造自体が観測・改訂対象となり、仕様体系の歪みを明示的に修正できる。
- DAG保証により、並列実行と正当性維持が両立できる。
- Rust製オーケストレータに制御を外出しすることで、Claude Code の知的能力を活かしつつ、決定論的実行秩序を上位から与えられる。
- 二層ループにより、大域収束と局所収束を分離できる。

## 実装上の最小必須アーティファクト

本設計を成立させる最小セットは次である。

- `ROOT_RFC.md` または頂点RFC
- `RFC_XXX.md` 群
- `RFC_TREE.json`
- `Tickets_<RFC_ID>.md` 群または等価JSON
- `stub_ledger.json`
- `omissions.json`
- `round_log.jsonl`
- Rust オーケストレータ本体
- Claude Code 呼出しアダプタ
- DAG validator
- scheduler
- rollback / intervention manager

## 形式的完了条件

完了条件は、単にすべてのチケットが終了したことではない。少なくとも次の論理積が必要である。

- `RFC_TREE.json` と全 `RFC_XXX.md` の整合性が成立
- 全チケットDAGが完了状態
- 未解決STUBがゼロ、または明示的 override 下にある
- omission ledger が空
- 乖離関数 \(\Delta = 0\)
- 強制停止や暫定凍結が残っていない

このとき初めて、開発状態は形式的収束点に到達したとみなされる。[file:1]

## 総括的定義

要するに、本手法は「人間が定義した目的コンテキストを起点として、Claude Code を実行ランタイム、Rust プログラムを上位制御ランタイムとし、長大RFCを再帰的RFC-DAGへ分解し、各ノードをチケットDAGとして並列実行可能にしつつ、仕様・構造・実装・負債・差分をすべて観測可能アーティファクトとして記録し、二層収束ループの反復によって \(\Delta = 0\) の形式的完成点を目指す開発制御系」である。[file:1]
