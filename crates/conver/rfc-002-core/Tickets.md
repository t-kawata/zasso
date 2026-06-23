# RFC_002: コア状態機械（conver-core）実装チケット分解設計書

> **生成元:** crates/conver/rfc-002-core/RFC_002.md
> **生成日:** 2026-06-23
> **分析済みセクション:** §1–§11、Appendix A–C
> **総チケット数:** 26（Phase 0: 18 / Phase 1: 3 / Phase 2: 3 / Phase 3: 2）

---

## Phase 0: 純粋ロジック・状態機械の完全隔離検証

> **外部依存:** serde, chrono, thiserror, petgraph
> **DB:** メモリ内完結
> **I/O:** なし — 全テストが決定論的・ミリ秒単位で完了

全 Phase 0 チケットは `StorageBackend` / `RuntimeBackend` に依存せず、
メモリ内で完結する純粋関数として実装・検証可能である。

### M0: Foundation Types — 設定・エラー型・観測ベクトル

> **DB:** なし（データ構造のみ）
> **テスト:**
> - type correctness（コンパイル通過）
> - Settings::defaults() がパニックせず全フィールドを埋めること
> - エラー型の Display / Debug  derive が動作すること

---

#### チケット M0-1: Settings 構造体（9サブ構造体 + Defaults）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§Appendix A)
* **依存・関連チケットID:** M0-2（設定値からのエラー生成時に参照される関係 — 並列実装可）
* **対象不変条件 / 規範:** 全9サブ構造体がそれぞれ valid default を持ち、Settings::defaults() が panic なく全フィールドを設定する。default 値は RFC_002 §Appendix A の仕様と一致する。
* **実装の背景と目的:** 全ワークフローの挙動を決定づける唯一の設定集合である。ランタイム選択（RuntimeSettings）、表示モード（UiSettings）、リトライ回数（RetrySettings）、レジュームポリシー（ResumeSettings）、レポート設定（ReportSettings）、パス設定（PathSettings）、インストール設定（InstallSettings）、品質設定（QualitySettings）、乖離関数重み（DeviationSettings）の 9 区分を 1 構造体に集約する。本チケットは全チケットの基盤となる。
* **実装スコープ:**
  - `Settings` 構造体（`settings.rs`）: 9つのサブ構造体フィールド
  - `RuntimeSettings` : `backend: String`
  - `UiSettings` : `display_mode: String`
  - `RetrySettings` : `structured_output_limit: u32`, `dag_validation_limit: u32`, `final_mode: String`
  - `ResumeSettings` : `policy: String`
  - `ReportSettings` : `pause_mode: String`, `checkpoint_interval: u32`, `ticket_completion_interval: u32`, `convergence_loop_limit: u32`
  - `PathSettings` : `workspace_root: String`, `global_config: String`, `config_file: Option<String>`
  - `InstallSettings` : `conflict_policy: String`, `write_manifest: bool`
  - `QualitySettings` : `require_schema_gates: bool`, `require_question_format_gate: bool`
  - `DeviationSettings` : `alpha: f64`, `beta: f64`, `gamma: f64`, `delta: f64`, `visualization_bars: u32`
  - `Settings::defaults()` メソッド
* **テストコードによる検証:**
  1. Settings::defaults() がパニックせず全フィールドを返す
  2. 各サブ構造体のデフォルト値が仕様通りか（α=2.0, β=2.0, γ=1.0, δ=1.0, convergence_loop_limit=3 等）
  3. serde の Serialize/Deserialize が derive により派生される（コンパイル時検証）
  4. 全フィールドが `pub` でアクセス可能（コンパイル時検証）
* **計装方法・観測対象:** コンパイル通過、デフォルト値の内容確認

---

#### チケット M0-2: エラー型階層（WorkflowError, TicketError, StateError, TreeError, ConvergenceError）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§11、§3.3 StateError)
* **依存・関連チケットID:** M0-1（設定値関連エラー — 並列実装可）、M1-1（StateError の使用元 — 本チケットが先行）、M4-4（TreeError の使用元 — 本チケットが先行）
* **対象不変条件 / 規範:** 全エラー型が `thiserror::Error` を derive し、意味のある Display メッセージを提供する。`From` 変換が全てのサブエラー型から WorkflowError へ伝播する。
* **実装の背景と目的:** エラー伝播の基盤である。WorkflowError は全ワークフロー操作の統合エラー型であり、StateError / TicketError / ConvergenceError / TreeError の4種のサブエラーと、conver-storage の StorageError を集約する。サブエラーは個別モジュールで定義し、lib.rs で再公開する。
* **実装スコープ:**
  - `WorkflowError`（lib.rs）: `StateError`, `TicketError`, `ConvergenceError`, `TreeError`, `conver_storage::StorageError`, `Unsupported(&'static str)`
  - `StateError`（state.rs）: `InvalidTransition(String)`
  - `TicketError`（ticket.rs）: `CycleDetectedWithPath(Vec<String>)`, `CycleDetected`, `SkeletonExtractionFailed`, `RetryExhausted`, `RfcNotFound`, `JsonError(serde_json::Error)`, `IoError(std::io::Error)`
  - `ConvergenceError`（convergence.rs）: `LoopLimitExceeded { current: u32, max: u32 }`
  - `TreeError` + `TreeErrorKind`（tree.rs）: `CycleDetected`, `ParentToChildDep`, `NodeNotFound`, `JsonParse(String)`, `Io(String)`
  - `From` impl: `StateError → WorkflowError`, `TicketError → WorkflowError`, `ConvergenceError → WorkflowError`, `TreeError → WorkflowError`, `std::io::Error → TreeError`, `serde_json::Error → TreeError`
* **テストコードによる検証:**
  1. 各エラー型が Error / Display / Debug を derive する（コンパイル時検証）
  2. WorkflowError が From<StateError>, From<TicketError>, From<ConvergenceError>, From<TreeError> を実装する（コンパイル時検証）
  3. 各エラーの Display 出力が readable であること
  4. `StateError::InvalidTransition("test")` のフォーマットが仕様通り
* **計装方法・観測対象:** コンパイル通過、エラーメッセージフォーマット

---

#### チケット M0-3: ObservationVector 構造体

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§8)
* **依存・関連チケットID:** M4-4（ObservationRecorder で使用 — 本チケットが先行）
* **対象不変条件 / 規範:** ObservationVector は11フィールドすべてを必須とし、デフォルト値なしで構築可能である。各フィールドの型が仕様通りであること。
* **実装の背景と目的:** 収束ループの各反復における状態を記録する11フィールドのデータ構造。単なる型定義であり、操作ロジックは ObservationRecorder（後に実装）が担当する。
* **実装スコープ:**
  - `ObservationVector` 構造体（`observation.rs`）: `r: u32`, `delta: f64`, `m: usize`, `c: usize`, `u: usize`, `x: usize`, `v_count: u32`, `k_count: u32`, `duration_secs: u64`, `debt_index: f64`, `interventions: Vec<String>`
  - `ObservationRecorder` 構造体宣言 + `new()`（メソッドは Phase 1 で実装）
* **テストコードによる検証:**
  1. ObservationVector を全フィールド指定で構築可能
  2. serde Serialize/Deserialize が derive される（コンパイル時検証）
* **計装方法・観測対象:** コンパイル通過

---

### M1: State Machines — 大域状態機械＋チケット局所状態機械

> **DB:** なし
> **テスト:**
> - 全6状態の遷移許可/拒否
> - 全14状態の遷移許可/拒否
> - ループ上限超過の検出

---

#### チケット M1-1: WorkflowState（6状態 + 遷移ルール）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§2.1)
* **依存・関連チケットID:** M0-2（StateError — 先行必須）
* **対象不変条件 / 規範:** 大域状態機械の遷移グラフが仕様通りであること。不正な遷移は Err を返す。force_transition は常に成功する。
* **実装の背景と目的:** ワークフローの全行程をカバーする6状態の有限状態機械。Phase 1からPhase 7に対応し、収束ループ制御からのフィードバック遷移を force_transition で実現する。6状態と遷移ルールを「コードで語らせる」最小単位。
* **実装スコープ:**
  - `WorkflowState` enum（`state.rs`）: Grilling, ChecklistPending, ChecklistApproved, Writing, Reviewing, Done
  - `WorkflowState::allowed_transitions() → &[WorkflowState]`: 各状態からの許可遷移先一覧（§2.1の遷移グラフ完全再現）
  - `WorkflowState::transition(&mut self, target) → Result<(), StateError>`: 許可遷移のみ成功
  - `WorkflowState::force_transition(&mut self, target)`: 無条件遷移（収束ループ制御用）
  - `RoundRecord` 構造体: `round_number: u32`, `state: WorkflowState`, `entered_at: DateTime<Utc>`
* **テストコードによる検証:**
  1. 正常系: Grilling → ChecklistPending → ChecklistApproved → Writing → Reviewing → Done の全ライフサイクルが成功すること
  2. 異常系: Grilling → Done の直接遷移が Err を返すこと
  3. 異常系: Writing → ChecklistPending が Err を返すこと（許可されていない）
  4. force_transition が常に成功すること（Grilling → Done でも成功）
  5. allowed_transitions の内容が仕様と一致すること（全6状態の整合性）
* **計装方法・観測対象:** 状態遷移の成功/失敗、force_transition の無条件性

---

#### チケット M1-2: TicketStatus（14状態 + 遷移ルール）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§2.3)
* **依存・関連チケットID:** M1-1（並列実装可 — 型レベルの依存はなし）
* **対象不変条件 / 規範:** チケット局所状態機械の遷移グラフが仕様通りであること。メイン系列10状態（Created→...→Done）と補助系列4状態（Blocked/Retrying/RolledBack/Aborted）の遷移ルールが完全であること。
* **実装の背景と目的:** 各チケットのライフサイクルを14状態で表現する。Completed→Done の代わりに全ライフサイクルの可視化と、Blocked/Retrying によるリカバリフローを定義する。
* **実装スコープ:**
  - `TicketStatus` enum: Created, Making, Made, Planning, Planned, Starting, Started, Reviewing, Reviewed, Done, Blocked, Retrying, RolledBack, Aborted
  - `TicketStatus::allowed_transitions() → &[TicketStatus]`: 全14状態の遷移グラフ
* **テストコードによる検証:**
  1. 正常系: Created → Making → Made → Planning → Planned → Starting → Started → Reviewing → Reviewed → Done の全ライフサイクルが allowed_transitions に含まれること
  2. 正常系: Blocked → Retrying が許可されること
  3. 正常系: Blocked → Aborted が許可されること
  4. 正常系: Retrying → Making が許可されること
  5. 異常系: Done からの遷移先が空であること
  6. 全14状態の allowed_transitions が §2.3 の遷移グラフと完全一致すること
* **計装方法・観測対象:** 遷移の許可/禁止、遷移先配列の空チェック

---

#### チケット M1-3: RoundManager（ループ上限管理）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§2.2)
* **依存・関連チケットID:** M0-2（ConvergenceError — 先行必須）、M3-4（使用元 — 本チケットが先行）
* **対象不変条件 / 規範:** RoundManager は max_rounds を超える start_next_round 呼び出しを確実に拒否する。current_round は 0 から始まり、1-based で増加する。
* **実装の背景と目的:** 収束ループの最大反復回数を管理する。デフォルト3回の制限を超えた場合、ConvergenceError::LoopLimitExceeded を返すことで無限ループを防止する。
* **実装スコープ:**
  - `RoundManager` 構造体（`state.rs`）: `current_round: u32`, `max_rounds: u32`
  - `RoundManager::new(max_rounds: u32) → Self`
  - `RoundManager::start_next_round() → Result<u32, ConvergenceError>`: 上限超過時 Err
  - `RoundManager::current_round() → u32`
  - `RoundManager::reset()`: current_round を 0 に初期化
* **テストコードによる検証:**
  1. 正常系: max_rounds=3 で 3回の start_next_round が成功し、戻り値が 1, 2, 3 となること
  2. 異常系: 4回目の呼び出しで Err(LoopLimitExceeded) が返ること
  3. 初期値: new(5) 直後の current_round() が 0 であること
  4. reset(): 上限到達後に reset→start_next_round が再度成功すること
  5. 境界値: new(0) でも start_next_round が即座に Err を返すこと
* **計装方法・観測対象:** current_round の変化、上限到達時のエラー

---

### M2: DesignTree — 設計判断ツリーガバナンス

> **DB:** なし（メモリ内ツリー構造）
> **テスト:**
> - Open ノード数の再帰カウント
> - ノード追加・解決・削除の整合性
> - grill 完了判定（is_grill_complete）

---

#### チケット M2-1: DesignNode 型定義と再帰操作

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§4.1)
* **依存・関連チケットID:** M0-2（TreeError の間接依存 — 本チケットではエラー型は内部で定義すれば可）
* **対象不変条件 / 規範:** DesignNode の再帰ツリー構造が自己無撞着であること。find_mut は指定IDのノードを正確に返す。count_open_recursive は Open 状態のノードを過不足なくカウントする。
* **実装の背景と目的:** 設計判断ツリーの基本ノード。再帰構造で子ノードを持ち、各ノードは DesignNodeKind（DecisionGroup/ImplementationDetail/InfoOnly）と DesignStatus（Open/Resolved）を持つ。find_mut と count_open_recursive はツリー全体の操作基盤であり、後続の DesignTree CRUD から呼ばれる。
* **実装スコープ:**
  - `DesignNodeKind` enum: DecisionGroup, ImplementationDetail, InfoOnly
  - `DesignStatus` enum + PartialEq: Open, Resolved
  - `QuestionRecord` 構造体: `resolved_at: DateTime<Utc>`, `answer: String`
  - `DesignNode` 構造体: `id: String`, `title: String`, `status: DesignStatus`, `kind: DesignNodeKind`, `blocking: bool`, `depends_on: Vec<String>`, `covered_by_question_ids: Vec<String>`, `questions: Vec<QuestionRecord>`, `children: Vec<DesignNode>`
  - `DesignNode::count_open_recursive() → usize`
  - `DesignNode::find_mut(&mut self, id: &str) → Option<&mut DesignNode>`
* **テストコードによる検証:**
  1. 空のノード: count_open_recursive() == 1（自身が Open）
  2. Resolved ノード: count_open_recursive() == 0
  3. 親子ノードで子が Open、親が Resolved の場合: count_open_recursive() == 1
  4. find_mut: 存在するIDのノードを発見し、可変参照を返せる
  5. find_mut: 存在しないIDで None を返す
  6. ネスト3階層のノードに対して count_open_recursive が正しい合計を返す
  7. serde Serialize/Deserialize の derive（コンパイル時検証）
* **計装方法・観測対象:** 再帰カウントの正確性、ノード検索の完全性

---

#### チケット M2-2: DesignTree CRUD（追加・解決・削除）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§4.2)
* **依存・関連チケットID:** M2-1（DesignNode — 先行必須）
* **対象不変条件 / 規範:** DesignTree の CRUD 操作がツリー構造の整合性を維持する。add_child は子ノードの ID 一意性を検証する。resolve_node はノードの状態を Resolved に変更し、回答記録を追加する。delete_node はノードと子孫を全て削除する。from_research は入力コンテンツから空のルートノードを生成する（簡易実装で可 — 「Claude Codeが行う」と設計書に明記）。
* **実装の背景と目的:** 設計判断ツリー全体を管理するコンテナ。Grill セッション中の質疑応答の記録・解決・削除操作を提供する。from_research はプレースホルダ実装でよく、実際のコンテンツ抽出は Claude Code が行う。
* **実装スコープ:**
  - `DesignTree` 構造体: `version: u32`, `updated_at: DateTime<Utc>`, `nodes: Vec<DesignNode>`
  - `DesignTree::new() → Self`
  - `DesignTree::from_research(research: &str) → Self`
  - `DesignTree::resolve_node(id: &str, answer: &str) → Result<(), TreeError>`
  - `DesignTree::add_child(parent_id: &str, child: DesignNode) → Result<(), TreeError>`
  - `DesignTree::find_node(&self, id: &str) → Option<&DesignNode>`
  - `DesignTree::delete_node(id: &str) → Result<(), TreeError>`
  - 補助関数: `delete_recursive(nodes, id) → bool`
* **テストコードによる検証:**
  1. new(): 空の DesignTree を作成し version==1 を確認
  2. add_child: ルートに子ノード追加 → find_node で発見可能
  3. add_child: 存在しない親ID → Err(TreeError)
  4. add_child: 重複ID → Err(TreeError::DuplicateId) — find_node による事前チェック
  5. resolve_node: 存在するノードを Resolved に変更し、QuestionRecord が追加されること
  6. resolve_node: 存在しないID → Err(TreeError)
  7. delete_node: ノード削除後 find_node が None を返す
  8. delete_node: 子を持つノード削除 → 子孫も全て削除
  9. 決定論性: 同一操作の繰り返しが同一結果を生む
* **計装方法・観測対象:** CRUD 操作の成功/失敗、ツリー状態の事後検証

---

#### チケット M2-3: DesignTree クエリ（count_open, is_grill_complete, 検索・表示）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§4.2–4.3)
* **依存・関連チケットID:** M2-2（DesignTree CRUD — 先行必須）
* **対象不変条件 / 規範:** count_open は全ノードの Open 状態ノード数を再帰的に正しく返す。is_grill_complete は count_open==0 と同値である。format_tree はツリー構造を可視化する。search はキーワードに合致するノードを過不足なく返す。path_to はルートからの経路を正しく返す。
* **実装の背景と目的:** DesignTree に対する読み取り専用クエリ群。状態確認（count_open, is_grill_complete）と探索（search, path_to, format_tree）を提供する。
* **実装スコープ:**
  - `DesignTree::count_open() → usize`: 全ノードの再帰的 Open カウント
  - `DesignTree::is_grill_complete() → bool`: count_open() == 0
  - `DesignTree::format_tree() → String`: 階層表示
  - `DesignTree::search(keyword: &str) → Vec<&DesignNode>`: ID とタイトルの部分一致検索
  - `DesignTree::path_to(id: &str) → Option<Vec<String>>`: ルートからの経路
  - 補助関数: `format_node(node, depth, output)`, `search_recursive(nodes, keyword, results)`, `path_recursive(nodes, id, path)`
* **テストコードによる検証:**
  1. count_open: 空ツリーで 0 を返す
  2. count_open: Open ノード1個で 1、解決後 0
  3. is_grill_complete: 空ツリーで true
  4. is_grill_complete: Open ノードありで false
  5. format_tree: ツリー内容が出力に含まれる
  6. search: 存在するキーワードで該当ノードを返す
  7. search: 存在しないキーワードで空 Vec
  8. path_to: ルート直下のノードにパスが存在
  9. path_to: 存在しないIDで None
  10. 決定論性: 同一ツリー状態からの同一クエリが同一結果を返す
* **計装方法・観測対象:** クエリ結果の完全性・正確性

---

### M3: 乖離関数と収束制御

> **DB:** なし
> **テスト:**
> - Δ = αM + βC + γU + δX（α=2,β=2,γ=1,δ=1）
> - フィードバック位相の4分類
> - OmissionsLedger 操作

---

#### チケット M3-1: 乖離関連型群（OmissionKind, OmissionEntry, OmissionsLedger, DeviationScore, DeviationComponents, DeviationSettings）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§7、Appendix A DeviationSettings)
* **依存・関連チケットID:** M0-1（DeviationSettings — 並列可）、M0-2（エラー型 — 本チケットでは不使用だが一貫性のため）
* **対象不変条件 / 規範:** 乖離の4分類（ImplementationMissing / ImplementationContradiction / SpecificationDeficiency / StructuralInconsistency）が OmissionKind として完全に表現される。DeviationComponents は4成分（M/C/U/X）を持つ。DeviationScore は delta + components + per_node を保持する。
* **実装の背景と目的:** 乖離関数Δの計算に必要な全データ型を定義する。Steel threads パターンにより、まずデータ構造を確定させてから計算ロジック（M3-2）に進む。
* **実装スコープ:**
  - `OmissionKind` enum: ImplementationMissing, ImplementationContradiction, SpecificationDeficiency, StructuralInconsistency（PartialEq を derive）
  - `OmissionEntry` 構造体: `kind: OmissionKind`, `rfc_node_id: String`, `ticket_id: Option<String>`, `description: String`, `code_location: Option<String>`, `stub_id: Option<String>`, `severity: String`, `detected_at: DateTime<Utc>`
  - `OmissionsLedger` 構造体: `round: u32`, `detected_at: DateTime<Utc>`, `omissions: Vec<OmissionEntry>`
  - `DeviationScore` 構造体: `delta: f64`, `components: DeviationComponents`, `per_node: Vec<(String, f64)>`
  - `DeviationComponents` 構造体: `m: usize`, `c: usize`, `u: usize`, `x: usize`
* **テストコードによる検証:**
  1. 全データ構造体が serde Serialize/Deserialize を derive する（コンパイル時検証）
  2. OmissionKind の4バリアントすべてが構築可能
  3. OmissionsLedger の round フィールドが指定値通り
  4. DeviationScore が delta + components + per_node を保持可能
* **計装方法・観測対象:** コンパイル通過、データ構造の完全性

---

#### チケット M3-2: OmissionsLedger 操作 + DeviationCalculator

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§7)
* **依存・関連チケットID:** M3-1（型群 — 先行必須）、M0-1（DeviationSettings — 参照のみ）
* **対象不変条件 / 規範:** Δ = αM + βC + γU + δX の計算が仕様通りであること。オーバーフローしない（f64 演算）。デフォルト重み α=2.0, β=2.0, γ=1.0, δ=1.0 が DeviationCalculator::defaults() で設定される。
* **実装の背景と目的:** 乖離関数Δの計算機。4種の omission カウントに重みを乗じて総合乖離スコアを算出する。設計書の calculate_deviation 関数と DeviationCalculator の2経路が共存するが、calculate_deviation は DeviationCalculator::calculate への委譲とする。
* **実装スコープ:**
  - `OmissionsLedger::new(round: u32) → Self`
  - `OmissionsLedger::count_by_kind(kind: OmissionKind) → usize`
  - `OmissionsLedger::has_kind(kind: OmissionKind) → bool`
  - `OmissionsLedger::is_empty() → bool`
  - `DeviationCalculator` 構造体: `alpha: f64`, `beta: f64`, `gamma: f64`, `delta: f64`
  - `DeviationCalculator::from_settings(settings: &DeviationSettings) → Self`
  - `DeviationCalculator::defaults() → Self`
  - `DeviationCalculator::calculate(&self, omissions: &OmissionsLedger) → DeviationScore`
  - `calculate_deviation(omissions, settings) → DeviationScore`（free function、委譲）
* **テストコードによる検証:**
  1. count_by_kind: 1件の ImplementationMissing → count_by_kind(M) == 1
  2. has_kind: 該当種類がない場合 false
  3. is_empty: 空 ledger で true、omission 追加後 false
  4. Δ計算: M=1 + X=1 → Δ = 1*1 + 2*1 = 3（デフォルト重み）
  5. Δ計算: M=2, C=0, U=0, X=0 → Δ = 2*1 = 2（デフォルト重み）
  6. Δ計算: C=3 → Δ = 3*2 = 6（デフォルト重み）
  7. Δ計算: 空 ledger → Δ = 0.0
  8. カスタム重み: α=3.0 で X=1 → Δ = 3.0*1 = 3.0
  9. 決定論性: 同一 omissions + 同一 settings → 同一結果
* **計装方法・観測対象:** Δ の値、component 別内訳

---

#### チケット M3-3: ConvergenceController（フィードバック位相決定 + 収束ループ）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§9)
* **依存・関連チケットID:** M1-1（WorkflowState — 戻り値型）、M1-3（RoundManager — converge_round で使用）、M3-1（OmissionsLedger, OmissionKind）、M3-2（DeviationCalculator）
* **対象不変条件 / 規範:** フィードバック先が乖離種類に依存する優先順位（X > U > M/C）に従う。Δ=0 の場合は Done を返す。ループ上限超過は Err を返す。
* **実装の背景と目的:** 乖離の種類に応じてフィードバック先の大域状態を決定する収束ループ制御。X（構造不整合）→ ChecklistPending（RFCツリー再構成）、U（仕様不足）→ Grilling（RFC改訂）、M/C（実装不足/矛盾）→ ChecklistApproved（チケット再実行）。Δ=0 → Done。
* **実装スコープ:**
  - `ConvergenceController` 構造体（`convergence.rs`）: `round_manager: RoundManager`, `deviation_calculator: DeviationCalculator`
  - `ConvergenceController::new(max_rounds: u32, deviation_settings: &DeviationSettings) → Self`
  - `ConvergenceController::determine_feedback_phase(omissions: &OmissionsLedger) → Option<WorkflowState>`
  - `ConvergenceController::converge_round(omissions: &OmissionsLedger, state: &mut WorkflowState) → Result<ConvergenceResult, ConvergenceError>`
  - `ConvergenceResult` enum: `Converged(DeviationScore)`, `Feedback { round: u32, score: DeviationScore, feedback_to: WorkflowState }`
* **テストコードによる検証:**
  1. X（構造不整合）→ Some(ChecklistPending) — X のみ
  2. U（仕様不足）→ Some(Grilling) — U のみ
  3. M（実装不足）→ Some(ChecklistApproved) — M のみ
  4. C（実装矛盾）→ Some(ChecklistApproved) — C のみ
  5. 複合: X + U → X 優先（=Some(ChecklistPending)）
  6. 複合: U + M → U 優先（=Some(Grilling)）
  7. なし（Δ=0）→ None
  8. converge_round: Δ=0 → state==Done, Converged(score)
  9. converge_round: Δ>0 → start_next_round 呼び出し
  10. 決定論性: 同一 omissions → 同一 feedback_phase
* **計装方法・観測対象:** フィードバック先の出力、収束結果のバリアント

---

### M4: DAG 管理 — チケットDAG + RFCツリーDAG

> **DB:** なし（petgraph によるメモリ内グラフ操作）
> **テスト:**
> - DAG循環検出（validate_dag）
> - トポロジカルソート順序検証
> - frontier 抽出検証
> - RFC DAG 意味的制約検証

---

#### チケット M4-1: TicketRecord + TicketDag 型定義

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§5.1–5.2)
* **依存・関連チケットID:** M1-2（TicketStatus — フィールド型）、M0-2（TicketError — 先行必須）
* **対象不変条件 / 規範:** TicketRecord は11フィールドを持ち、チケットライフサイクルの全ての属性を表現する。TicketDag は1RFC分のチケットコレクションと version 管理を提供する。DagValidationReport は {valid, node_count, edge_count, cycle_path} を返す。
* **実装の背景と目的:** チケットのデータ構造と DAG コンテナ。この型定義の上に循環検出・トポロジカルソート・frontier 計算が構築される。
* **実装スコープ:**
  - `TicketRecord` 構造体（`ticket.rs`）: `id: String`, `title: String`, `description: String`, `status: TicketStatus`, `depends_on: Vec<String>`, `acceptance_criteria: String`, `scope: String`, `verification: String`, `predicted_side_effects: Vec<String>`, `rfc_node_id: String`, `artifact_ids: Vec<String>`
  - `TicketDag` 構造体: `rfc_id: String`, `version: u32`, `updated_at: DateTime<Utc>`, `tickets: Vec<TicketRecord>`
  - `TicketDag::new(rfc_id: &str) → Self`
  - `DagValidationReport` 構造体: `valid: bool`, `node_count: usize`, `edge_count: usize`, `cycle_path: Vec<String>`
* **テストコードによる検証:**
  1. TicketRecord を全フィールド指定で構築可能
  2. TicketDag::new("test") の version==1, rfc_id=="test", tickets が空
  3. serde Serialize/Deserialize が derive される（コンパイル時検証）
* **計装方法・観測対象:** コンパイル通過、データ構造の完全性

---

#### チケット M4-2: TicketDag::validate_dag（petgraph 循環検出）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§5.2 validate_dag)
* **依存・関連チケットID:** M4-1（TicketDag, TicketRecord — 先行必須）
* **対象不変条件 / 規範:** DAG に循環がある場合、is_cyclic_digraph が true を返し、CycleDetectedWithPath エラーが発生する。循環がない場合、有効な DagValidationReport を返す。
* **実装の背景と目的:** petgraph の is_cyclic_digraph を使用した DAG 検証。depends_on フィールドに基づいて DiGraph を構築し、循環を検出する。
* **実装スコープ:**
  - `TicketDag::validate_dag() → Result<DagValidationReport, TicketError>`: petgraph DiGraph 構築 + is_cyclic_digraph
* **テストコードによる検証:**
  1. 正常系: 循環なしの DAG（T001→T002）→ Ok(report.valid==true)
  2. 異常系: 循環あり（T001↔T002）→ Err(CycleDetected)
  3. 正常系: 孤立ノードのみ → Ok(report.valid==true)
  4. 正常系: 複数依存を持つ DAG（T001→T002→T003）→ Ok
  5. 空 DAG: チケット0件 → Ok
  6. 決定論性: 同一 topology → 同一結果
* **計装方法・観測対象:** 循環検出結果、report.valid、エラーバリアント

---

#### チケット M4-3: TicketDag::topological_sort

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§5.2 topological_sort)
* **依存・関連チケットID:** M4-1（TicketDag, TicketRecord — 先行必須）
* **対象不変条件 / 規範:** トポロジカルソート結果が依存関係を尊重する。依存のないチケットが先に、依存を持つチケットが後に並ぶ。循環がある場合は Err(CycleDetected) を返す。
* **実装の背景と目的:** petgraph の toposort アルゴリズムを使用した依存順序の計算。formulate() フローの詳細書込フェーズで使用される。
* **実装スコープ:**
  - `TicketDag::topological_sort() → Result<Vec<&TicketRecord>, TicketError>`: toposort + idx 逆引き
* **テストコードによる検証:**
  1. 正常系: T001（依存なし）→ T002（T001依存）の順でソートされる
  2. 正常系: 複数依存（T001→T003, T002→T003）→ T001, T002 が T003 より前に
  3. 異常系: 循環あり → Err(CycleDetected)
  4. 決定論性: 同一 DAG → 同一ソート結果
* **計装方法・観測対象:** ソート順序の正当性、循環検出

---

#### チケット M4-4: TicketDag::compute_frontier

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§5.2 compute_frontier)
* **依存・関連チケットID:** M4-3（topological_sort — 内部利用、先行必須）
* **対象不変条件 / 規範:**
  - 戻り値は `TicketStatus::Created` のチケットのみを含む。
  - 戻り値に含まれる各チケットの全依存が解決済み（`TicketStatus::Done`）である。
  - 戻り値の順序はトポロジカルソート順である。
* **実装の背景と目的:** 並列実行可能なチケット一覧（frontier）を計算する。入次数0でかつ Created 状態のチケットを返すことで、次に着手すべきチケットを特定する。
* **実装スコープ:**
  - `TicketDag::compute_frontier() → Vec<&TicketRecord>`: topo_sort + status:Created + deps:all Done
* **テストコードによる検証:**
  1. 正常系: 依存なし Created チケット → frontier に含まれる
  2. 異常系: 依存あり Created チケット → frontier に含まれない
  3. 境界値: 全チケットが依存あり → frontier が空
  4. 境界値: 全が空（0件）→ frontier が空
  5. 正常系: 依存先が Done の場合のみ frontier に含まれる（依存先が Created なら含まれない）
  6. 決定論性: 同一状態 → 同一 frontier
* **計装方法・観測対象:** frontier の要素、空 frontier

---

#### チケット M4-5: TicketDag::detect_cycle_path + dfs_cycle

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§5.2 detect_cycle_path, dfs_cycle)
* **依存・関連チケットID:** M4-2（validate_dag から呼ばれる — 先行必須だが、スタブからの置換として実装）
* **対象不変条件 / 規範:** DFS による循環パス探索が正しく循環パスを検出する。巡回済みノード（visited）と呼び出しスタック（in_stack）の管理が正確である。
* **実装の背景と目的:** validate_dag が循環を検出した際に、構造化された循環パス情報を提供し、Claude Code による再生成を促進する。DAG 検証のエラーメッセージ品質を高める。
* **実装スコープ:**
  - `TicketDag::detect_cycle_path(graph, indices) → Vec<String>`: エントリポイント
  - `TicketDag::dfs_cycle(node_id, indices, visited, in_stack, path) → bool`: DFS 再帰
* **テストコードによる検証:**
  1. 単純循環: T001→T002→T001 → パスに T001, T002 が含まれる
  2. 自己循環: T001→T001 → パスに T001 が含まれる
  3. 複雑循環: T001→T002→T003→T001 → 循環パスが正しい順序で検出される
  4. 非循環: 循環のない DAG → 空 Vec
* **計装方法・観測対象:** 循環パスの内容、エラー通知の質

---

#### チケット M4-6: RfcDag（RFC_TREE.json からの DAG 構築 + 検証）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§10)
* **依存・関連チケットID:** M0-2（TreeError — 先行必須）
* **対象不変条件 / 規範:**
  - from_json が RFC_TREE.json の構造を正しく petgraph DiGraph に変換する
  - validate が依存辺のみの循環を検出する
  - validate_semantic_constraints が親→子の依存辺（ParentToChildDep）を検出する
  - extract_dep_subgraph が Depends 辺のみのサブグラフを正しく抽出する
* **実装の背景と目的:** RFC_TREE.json で定義された RFC ノード間の階層関係と依存関係を petgraph DiGraph で表現し、DAG 検証と意味的制約検証を実行する。RfcDag::from_fs は Phase 1 で実装（ファイル I/O 依存）。
* **実装スコープ:**
  - `EdgeKind` enum: Hierarchy, Depends
  - `RfcNode` 構造体: `id: String`, `title: String`, `path: String`, `status: String`, `children: Vec<String>`, `depends_on: Vec<String>`, `sha256: String`
  - `RfcTreeJson` 構造体（crate-private）: `version: u32`, `root_rfc_id: String`, `root_path: String`, `updated_at: String`, `nodes: Vec<RfcNode>`
  - `RfcDag` 構造体: `graph: DiGraph<RfcNode, EdgeKind>`, `nodes: Vec<RfcNode>`
  - `RfcDag::from_json(json: &str) → Result<Self, TreeError>`: JSON パース + DiGraph 構築
  - `RfcDag::validate() → Result<DagValidationReport, TreeError>`: 循環検出 + 意味的制約
  - `RfcDag::validate_semantic_constraints() → Result<(), TreeError>`: ParentToChildDep 検出
  - `RfcDag::extract_dep_subgraph() → DiGraph<(), ()>`: Depends 辺のみ抽出
  - `RfcDag::is_parent_of(parent, child) → bool`: 階層辺存在確認
  - `RfcDag::detect_cycle() → Vec<String>`: [::STUB::] — petgraph で実装
  - TreeError の From 実装（std::io::Error, serde_json::Error — 先行実装修正）
* **テストコードによる検証:**
  1. from_json: 空ツリーの JSON から構築可能（version, root_rfc_id 設定）
  2. from_json: 2ノード＋1依存辺の JSON を正しくパース
  3. validate: 循環のない DAG → valid==true
  4. validate: 依存辺に循環あり → valid==false
  5. validate_semantic_constraints: 親→子の依存辺 → Err(ParentToChildDep)
  6. validate_semantic_constraints: 子→親の依存辺 → Ok
  7. extract_dep_subgraph: Hierarchy 辺を含まないこと
  8. RfcNode の serde Serialize/Deserialize（コンパイル時検証）
* **計装方法・観測対象:** DAG 検証結果、意味的制約の遵守

---

### M5: Malfeasance Ledger — 違反記録台帳

> **DB:** なし
> **テスト:**
> - debt_index ∈ [0,1]
> - STUB 重要度分類
> - open_count の正確性

---

#### チケット M5-1: MalfeasanceLedger（CRUD + debt_index + open_count）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§6)
* **依存・関連チケットID:** なし（独立して実装可能）
* **対象不変条件 / 規範:**
  - debt_index ∈ [0,1]: 全レコード中の Open レコード比率
  - open_count は Open 状態のレコード数を正しく返す
  - 空 ledger の debt_index == 0.0
* **実装の背景と目的:** `[::STUB::]` マーカー違反の系統的管理。違反レコードの作成・解決・一覧を提供し、負債指標（debt_index）を計算して観測ベクトルの ρ_r フィールドに供給する。
* **実装スコープ:**
  - `MalfeasanceStatus` enum: Open, Resolved, FalsePositive
  - `MalfeasanceRecord` 構造体: `id: String`, `rfc_node_id: String`, `ticket_id: Option<String>`, `description: String`, `status: MalfeasanceStatus`, `created_at: DateTime<Utc>`, `resolved_at: Option<DateTime<Utc>>`
  - `MalfeasanceLedger` 構造体: `version: u32`, `records: Vec<MalfeasanceRecord>`
  - `MalfeasanceLedger::new() → Self`
  - `MalfeasanceLedger::open_count() → usize`
  - `MalfeasanceLedger::debt_index() → f64`
* **テストコードによる検証:**
  1. open_count: 空 ledeger で 0
  2. open_count: Open レコード1件で 1
  3. debt_index: 空 ledeger で 0.0
  4. debt_index: 全1件中1件 Open → 1.0
  5. debt_index: 全2件中1件 Open → 0.5
  6. debt_index: 全0件中0件 Open → 0.0（ゼロ除算防止）
  7. serde Serialize/Deserialize（コンパイル時検証）
* **計装方法・観測対象:** debt_index の値、open_count の正確性

---

#### チケット M5-2: StubEntry + classify_stub（STUB 重要度分類）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§6 classify_stub)
* **依存・関連チケットID:** M5-1（MalfeasanceRecord — scan_and_record で参照、間接的依存）
* **対象不変条件 / 規範:**
  - `unsafe` または `panic!` を含む STUB → "critical"
  - `todo!` または `unimplemented!` を含む STUB → "major"
  - その他の STUB → "minor"
  - マッチは部分一致による（大文字小文字区別なしの指定はないが、原文ママの大文字小文字でマッチ）
* **実装の背景と目的:** [::STUB::] マーカー行の内容から重要度を分類する純粋関数。StubScanner から呼ばれる。本チケットではStubScanner（ファイル I/O 依存）は含まない。
* **実装スコープ:**
  - `StubEntry` 構造体: `file: PathBuf`, `line: usize`, `content: String`, `severity: String`
  - `classify_stub(line: &str) → String`: 重要度分類（critical / major / minor）
* **テストコードによる検証:**
  1. `"// [::STUB::] unsafe: ..."` → "critical"
  2. `"// [::STUB::] panic!(\"not implemented\")"` → "critical"
  3. `"// [::STUB::] todo!()"` → "major"
  4. `"// [::STUB::] unimplemented!()"` → "major"
  5. `"// [::STUB::] fix this later"` → "minor"
  6. 境界値: unsafe と todo! の両方 → "critical"（unsafe 優先）
* **計装方法・観測対象:** 重要度文字列の正確性

---

## Phase 1: ファイル I/O の導入

> **外部依存:** walkdir, std::fs, uuid, chrono
> **DB:** Memory-backed Mock StorageBackend によるテスト

---

### M6: ファイル I/O 操作

> **DB:** テスト時は tempdir を使用
> **テスト:**
> - StubScanner が [::STUB::] を検出
> - RfcDag::from_fs がファイル読み込み
> - ObservationRecorder::append の append-only 特性

---

#### チケット M6-1: StubScanner::scan_all（ファイルシステムスキャン）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§6 StubScanner)
* **依存・関連チケットID:** M5-2（StubEntry, classify_stub — 先行必須）
* **対象不変条件 / 規範:**
  - 指定ディレクトリ以下の全 `.rs` ファイルを再帰的にスキャンする
  - `[::STUB::]` マーカーを含む行を過不足なく検出する
  - ドットで始まるディレクトリ（`.` prefix）はスキップする
  - 各エントリは file path / line number / content / severity を持つ
* **実装の背景と目的:** 実際のファイルシステムから STUB マーカーを収集する。walkdir で再帰的に走査し、行単位で検出する。この情報を元に MalfeasanceController::scan_and_record が違反レコードを生成する。
* **実装スコープ:**
  - `StubScanner` 構造体
  - `StubScanner::scan_all(root: &Path) → Result<Vec<StubEntry>, ScanError>`: walkdir 走査
  - `ScanError` 定義（std::io::Error のラッパー）
* **テストコードによる検証:**
  1. 正常系: STUB を含む .rs ファイルを検出
  2. 正常系: 複数 STUB 行を全件検出
  3. 正常系: .rs 以外のファイルはスキップ
  4. 異常系: 存在しないディレクトリ → Err
  5. 正常系: ドットディレクトリ（`.hidden/`）のスキップ
  6. 正常系: 空ディレクトリ → 空 Vec
* **計装方法・観測対象:** 検出エントリ数、行番号の正確性

---

#### チケット M6-2: RfcDag::from_fs（ファイル読み込み）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§10 from_fs)
* **依存・関連チケットID:** M4-6（RfcDag::from_json — 先行必須）
* **対象不変条件 / 規範:**
  - `RfcDag::from_fs(root_path)` は `{root_path}/RFC_TREE.json` を読み込む
  - ファイル不在時は io::Error を TreeError に変換して Err を返す
* **実装の背景と目的:** ファイルシステムから RFC_TREE.json を読み込み、JSON パース後に from_json に委譲する。このチケットは純粋な I/O ラッパーであり、ビジネスロジックは M4-6 の from_json にある。
* **実装スコープ:**
  - `RfcDag::from_fs(root_path: &Path) → Result<Self, TreeError>`: `std::fs::read_to_string` + `from_json`
* **テストコードによる検証:**
  1. 正常系: 有効な RFC_TREE.json を読み込んでパース成功
  2. 異常系: ファイル不在 → io::Error → TreeError
  3. 異常系: 不正な JSON → serde_json::Error → TreeError
* **計装方法・観測対象:** パース成功/失敗

---

#### チケット M6-3: ObservationRecorder::append + MalfeasanceController::scan_and_record

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§8 ObservationRecorder::append, §6 MalfeasanceController::scan_and_record)
* **依存・関連チケットID:** M0-3（ObservationVector — 先行必須）、M5-1（MalfeasanceLedger — 先行必須）、M6-1（StubScanner::scan_all — 先行必須）
* **対象不変条件 / 規範:**
  - ObservationRecorder::append は round_log.jsonl に JSON Lines 形式で追記する（append-only）
  - latest_delta は最終行の delta 値を返す
  - MalfeasanceController::scan_and_record は STUB スキャン結果から MalfeasanceRecord を生成し、各レコードに一意の UUID を割り当てる
* **実装の背景と目的:** 観測ベクトルの永続化（append-only）と STUB スキャンからの違反レコード自動生成。StorageBackend trait への依存があるため、テストでは Mock を使用する。
* **実装スコープ:**
  - `ObservationRecorder::append(&self, storage: &mut dyn StorageBackend, obs: &ObservationVector) → Result<(), StorageError>`
  - `ObservationRecorder::latest_delta(&self, storage: &dyn StorageBackend) → Option<f64>`
  - `append_observation(storage: &mut dyn StorageBackend, obs: &ObservationVector) → Result<(), StorageError>`（free function）
  - `MalfeasanceController` 構造体（`malfeasance.rs`）: `ledger: MalfeasanceLedger`
  - `MalfeasanceController::new() → Self`
  - `MalfeasanceController::scan_and_record(root: &Path) → Result<Vec<MalfeasanceRecord>, ScanError>`: scan_all + uuid 生成
  - `MalfeasanceController::debt_index() → f64`: 委譲
  - `MalfeasanceController::open_count() → usize`: 委譲
* **テストコードによる検証:**
  1. ObservationRecorder::append: 1行追記 → ファイルに行が存在
  2. latest_delta: 追記後最新の delta を読める
  3. latest_delta: 空ファイルで None
  4. MalfeasanceController::scan_and_record: STUB → MalfeasanceRecord 生成
  5. MalfeasanceController::scan_and_record: 各レコードに UUID 形式の id が付与される
  6. MalfeasanceController::scan_and_record: 空ディレクトリで空 Vec
* **計装方法・観測対象:** 追記内容、UUID 形式、スキャン結果の完全性

---

## Phase 2: WorkflowController — トレイト定義 + Mock/Fake 実装

> **外部依存:** conver-storage（StorageBackend trait）、conver-runtime（RuntimeBackend trait）
> **DB:** Mock StorageBackend / Mock RuntimeBackend によるテスト

---

### M7: WorkflowController トレイト定義 + Impl 骨格

> **DB:** Mock backed
> **テスト:**
> - execute のリクエストディスパッチ
> - WorkflowRequest 全バリアントのカバレッジ
> - WorkflowControllerImpl::new の初期状態

---

#### チケット M7-1: WorkflowController trait + WorkflowRequest + WorkflowResult

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§3.1–3.2)
* **依存・関連チケットID:** M1-1（WorkflowState — 戻り値間接参照）、Phase 0 全チケット（Request のデータ型参照）
* **対象不変条件 / 規範:** WorkflowRequest は全ワークフロー操作をカバーする22バリアントを持つ。WorkflowController trait は execute / resume / interrupt の3メソッドを定義する。WorkflowResult は message + state_changed を持つ。
* **実装の背景と目的:** CLI パーサーからの全コマンドを受け付ける統一インターフェース。Router 層を経由し、WorkflowRequest に変換されたコマンドを WorkflowControllerImpl が処理する。
* **実装スコープ:**
  - `WorkflowRequest` enum（`controller.rs`）: Init, GrillRfc, ShowStatus, GenerateChecklist, SplitRfcTree, DetectOmissions, CreateTicket, PlanTicket, StartTicket, ReviewTicket, ResolveTicket, ListTickets, FormulateTickets, CreateMalfeasance, ResolveMalfeasance, ListMalfeasance, ScanMalfeasance, RunQualityChecks, RuntimeStart, RuntimeStop, RuntimeStatus（22バリアント）
  - InitRequest, GrillRfcRequest, StatusRequest, ChecklistRequest, TreeSplitRequest, OmissionsRequest, CreateTicketRequest, ListTicketsRequest, FormulateRequest, MalfeasanceCreateRequest, QualityRequest のリクエスト構造体
  - `WorkflowResult` 構造体: `message: String`, `state_changed: bool`
  - `WorkflowController` trait: `execute(&mut self, request) → Result<WorkflowResult, WorkflowError>`, `resume(&mut self, run_id) → Result<WorkflowResult, WorkflowError>`, `interrupt(&mut self, run_id, action) → Result<(), WorkflowError>`
  - `UserAction` enum / `RunId` 型（必要に応じて）
* **テストコードによる検証:**
  1. WorkflowRequest 全22バリアントがコンパイル可能（コンパイル時検証）
  2. WorkflowResult の全フィールドにアクセス可能
  3. WorkflowController trait が object-safe でないことの確認（ジェネリック impl を要求）
* **計装方法・観測対象:** コンパイル通過、trait 定義の完全性

---

#### チケット M7-2: WorkflowControllerImpl::new + execute ディスパッチ

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§3.3–3.4)
* **依存・関連チケットID:** M7-1（WorkflowController trait / WorkflowRequest — 先行必須）、Phase 0 全チケット（フィールド型に必要）
* **対象不変条件 / 規範:**
  - WorkflowControllerImpl::new() の初期 state は WorkflowState::Grilling
  - 未実装ハンドラへのリクエストは `Err(WorkflowError::Unsupported(...))` を返す
  - execute の match が全22バリアントを網羅する
* **実装の背景と目的:** ワークフローコントローラーの具象実装。StorageBackend と RuntimeBackend をジェネリックパラメータとして受け取り、各リクエストを対応するハンドラメソッドにディスパッチする。本チケットではディスパッチ構造と new() を実装し、各ハンドラの本体は後続チケットで実装する。
* **実装スコープ:**
  - `WorkflowControllerImpl<S: StorageBackend, R: RuntimeBackend>` 構造体: `state`, `round_manager`, `design_tree`, `ticket_controller`, `malfeasance_controller`, `deviation_calculator`, `convergence_controller`, `observation_recorder`, `storage`, `runtime`, `settings`
  - `WorkflowControllerImpl::new(storage, runtime, settings) → Self`
  - `impl WorkflowController for WorkflowControllerImpl`: `execute()` のリクエストディスパッチ（match: 全バリアント → 各 handle_xxx / Unsupported 返却）
* **テストコードによる検証:**
  1. new(): state == WorkflowState::Grilling
  2. new(): round_manager.current_round() == 0
  3. new(): design_tree.count_open() == 0
  4. 未実装ハンドラ（PlanTicket 等）→ Err(WorkflowError::Unsupported(...))
  5. execute の全 match バリアントが網羅されていること（コンパイル時検証）
* **計装方法・観測対象:** 初期状態、未実装ハンドラのエラー

---

### M8: コントローラーハンドラ実装

> **DB:** Mock StorageBackend / RuntimeBackend
> **テスト:**
> - Grill ハンドラ: 状態遷移 + 永続化 + チェックポイント
> - CreateTicket ハンドラ: チケット作成 + DAG 検証
> - DetectOmissions ハンドラ: 乖離検出 + Δ計算 + 収束判定
> - ShowStatus ハンドラ: 読み取り専用集約

---

#### チケット M8-1: handle_grill + handle_show_status

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§3.4 handle_grill, handle_show_status)
* **依存・関連チケットID:** M7-2（WorkflowControllerImpl 構造体 — 先行必須）
* **対象不変条件 / 規範:**
  - handle_grill: state を Grilling に遷移し、DesignTree を初期化、StatusRecord と DesignTree を永続化、チェックポイントを発行する
  - handle_show_status: 現在の Round, State, DesignTree open count, Ticket 総数, Malfeasance open count, 最新 Δ を集約して表示する（読み取り専用、状態変更なし）
* **実装の背景と目的:** ワークフロー開始（Grill）と状態確認（Status）の2ハンドラ。Grill は最初のフェーズであり、設計書の調査結果から DesignTree を初期化する。ShowStatus は唯一の読み取り専用ハンドラ。
* **実装スコープ:**
  - `GrillRfcRequest` 構造体（または再使用）
  - `StatusRecord` 構造体: `state: WorkflowState`, `round: u32`, `research_path: PathBuf`, `output_path: PathBuf`
  - `WorkflowControllerImpl::handle_grill(&mut self, req: GrillRfcRequest) → Result<WorkflowResult, WorkflowError>`: state transition, storage.read_to_string, DesignTree::from_research, storage.write_json×2, storage.commit_checkpoint
  - `WorkflowControllerImpl::handle_show_status(&self) → Result<WorkflowResult, WorkflowError>`: 各種 count 取得、latest_delta 読込、レポート文字列構築
* **テストコードによる検証:**
  1. handle_grill: state が Grilling に変わる
  2. handle_grill: storage.write_json が StatusRecord で1回呼ばれる
  3. handle_grill: storage.write_json が DesignTree で1回呼ばれる
  4. handle_grill: storage.commit_checkpoint が呼ばれる
  5. handle_show_status: state_changed==false
  6. handle_show_status: メッセージに round, state が含まれる
  7. handle_show_status: エラー時（storage エラー）→ Err(WorkflowError)
* **計装方法・観測対象:** state の変化、storage 操作の発生

---

#### チケット M8-2: handle_create_ticket

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§3.4 handle_create_ticket)
* **依存・関連チケットID:** M7-2（WorkflowControllerImpl — 先行必須）、M4-1（TicketDag — type 依存）、M4-2（validate_dag — 先行必須）
* **対象不変条件 / 規範:**
  - rfc_node_id から Tickets.json パスを構築する
  - 既存 Tickets.json が存在すれば読み込み、なければ new() で作成する
  - ID は既存チケット数 + 1 の T{:03} 形式で自動生成する
  - チケット追加後は必ず validate_dag() を実行する
  - DAG 検証失敗時は Err(TicketError) を返し、Tickets.json は変更されない
* **実装の背景と目的:** チケットの作成ハンドラ。ID 自動生成、DAG 検証による整合性保証、storage 永続化を担当する。
* **実装スコープ:**
  - `CreateTicketRequest` 構造体: `title: String`, `depends_on: Vec<String>`, `rfc_node_id: String`
  - `WorkflowControllerImpl::handle_create_ticket(&mut self, req: CreateTicketRequest) → Result<WorkflowResult, WorkflowError>`: file check → read/new → ID auto-gen → push → validate_dag → write_json
* **テストコードによる検証:**
  1. 正常系: 新規 RFC ノードへの初回チケット作成（Tickets.json 不在）
  2. 正常系: 既存 Tickets.json への追加（ID = T001 → T002）
  3. 異常系: 依存関係に循環がある → Err(TicketError) で Tickets.json 不変
  4. 正常系: depends_on に存在するチケットIDを指定
  5. 状態変更: state_changed==false（チケット作成は大域状態を変更しない）
* **計装方法・観測対象:** チケット ID の自動採番、DAG 検証エラー

---

#### チケット M8-3: handle_detect_omissions（乖離検出ハンドラ）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§3.4 handle_detect_omissions)
* **依存・関連チケットID:** M7-2（WorkflowControllerImpl — 先行必須）、M3-2（DeviationCalculator）、M3-3（ConvergenceController）、M4-6（RfcDag::from_fs）、M6-3（ObservationVector, append_observation）
* **対象不変条件 / 規範:**
  - 乖離検出は X（構造：機械的）→ M/C/U（LLM 補助）の順で実行する
  - Δ > 0 の場合、ConvergenceController のフィードバック先に force_transition する
  - Δ = 0 の場合、state を Done に force_transition する
  - OMISSIONS-{round}.json と round_log.jsonl の両方に記録する
* **実装の背景と目的:** 乖離検出のエンドツーエンドハンドラ。構造的不整合の機械的検出、LLM による意味的乖離検出を経て、Δ 計算→観測記録→収束判定までを実行する。
* **実装スコープ:**
  - `OmissionsRequest` 構造体: `rfc_path: PathBuf`
  - `WorkflowControllerImpl::detect_structural_inconsistency(rfc_dag: &RfcDag) → Result<Vec<OmissionEntry>, WorkflowError>`: [::STUB::] 機械的検出（）
  - `WorkflowControllerImpl::detect_with_llm(rfc_path: &Path) → Result<Vec<OmissionEntry>, WorkflowError>`: [::STUB::] LLM呼び出し — スキップ可（runtime 未実装時）
  - `WorkflowControllerImpl::handle_detect_omissions(&mut self, req: OmissionsRequest) → Result<WorkflowResult, WorkflowError>`: 全方位統合ハンドラ
* **テストコードによる検証:**
  1. 正常系: Δ=0 → state が Done、round_log.jsonl に観測記録
  2. 異常系: 乖離あり（X）→ state が ChecklistPending
  3. 正常系: OMISSIONS-{round}.json に omissions が保存される
  4. 異常系: storage エラー → Err(WorkflowError::StorageError)
  5. 正常系: 戻り値メッセージに M/C/U/X の内訳が含まれる
* **計装方法・観測対象:** state 遷移先、乖離レポート内容、観測ベクトル記録

---

## Phase 3: 2段階フロー統合（RuntimeBackend 連携）

> **外部依存:** conver-runtime（RuntimeBackend trait）
> **DB:** Mock RuntimeBackend
> **テスト:** formulate の2段階フロー + DAG 検証リトライループ

---

### M9: TicketController::formulate — 2段階編成フロー

> **DB:** Mock RuntimeBackend
> **テスト:**
> - skeleton → DAG 検証 → 詳細書込 の2段階フロー
> - DAG 検証失敗時の retry（上限3回）
> - トポロジカルソート順の詳細書込

---

#### チケット M9-1: TicketController 型定義 + formulate（2段階フロー + retry）

* **参照設計書:** crates/conver/rfc-002-core/RFC_002.md (§5.3)
* **依存・関連チケットID:** M4-1（TicketDag, TicketRecord）、M4-2（validate_dag）、M4-3（topological_sort）
* **対象不変条件 / 規範:**
  - formulate は2段階フローの全体を統括する（skeleton 抽出 → DAG 検証ループ → 詳細書込）
  - retry は dag_validation_limit（デフォルト3）回まで
  - 各 ticket は topological_sort 順に詳細フィールドを埋める
  - 最終出力は atomic write で保存される
* **実装の背景と目的:** Claude Code によるチケット骨格生成 → DAG 検証 → 詳細フィールド補完の2段階フロー全体を制御する。RuntimeBackend を介して LLM との通信を行う。
* **実装スコープ:**
  - `TicketController` 構造体（`ticket.rs`）: （必要に応じて内部状態）
  - `TicketController::new() → Self`
  - `TicketController::formulate(&mut self, rfc_node_path: &Path, runtime: &mut dyn RuntimeBackend, retry_limit: u32) → Result<TicketDag, TicketError>`: 2段階フロー統括
  - `TicketController::extract_skeleton(rfc_node_path: &Path, runtime: &mut dyn RuntimeBackend) → Result<TicketDag, TicketError>`: RFC 読み込み + LLM 骨格生成
  - `TicketController::validate_with_retry(dag: TicketDag, runtime: &mut dyn RuntimeBackend, retry_limit: u32) → Result<TicketDag, TicketError>`: DAG 検証 → 失敗時 LLM 再生成
  - `TicketDetail` 構造体: `acceptance_criteria: String`, `scope: String`, `verification: String`, `predicted_side_effects: Vec<String>`
  - `SkeletonRequest` / `RetryRequest` / `TicketDetailRequest` リクエスト構造体
* **テストコードによる検証:**
  1. extract_skeleton: RFC ファイルが存在→RuntimeBackend 呼び出し（Mock で検証）
  2. extract_skeleton: RFC ファイル不在→Err(RfcNotFound)
  3. validate_with_retry: DAG 検証 OK→即座に dag を返す
  4. validate_with_retry: DAG 検証 FAIL→RuntimeBackend 再生成（Mock 検証）
  5. validate_with_retry: retry_limit 超過→Err(RetryExhausted)
  6. formulate: 全体フロー成功時の戻り値が詳細フィールド埋め済み
  7. atomic write がエラーなく完了
* **計装方法・観測対象:** skeleton 抽出の成否、retry 回数、詳細フィールドの反映

---

### Appendix: 本チケット分解における注意事項

1. **実装順序**: チケットID順（M0-1 → M0-2 → ... → M9-1）に実装すること。依存関係はチケットIDの昇順が先行実装を意味する。
2. **テスト独立**: 各チケットのテストは他のチケットの実装に依存してはならない。Phase 0 のテストはすべてメモリ内完結している。
3. **スタブポリシー**: TicketController 内の detect_with_llm など、LLM 呼び出しを含む部分は RuntimeBackend 未実装時でも `[::STUB::]` マーカーを付与せず `Err(WorkflowError::Unsupported("LLM detection not available"))` を返すことでスキップ可能とする。
4. **RfcDag::detect_cycle**: 本設計書 §10 では簡略化（Vec::new()）と記載されているが、これは旧 design の残骸であり、本チケット分解では M4-6 で petgraph の dfs による本実装を前提とする。
