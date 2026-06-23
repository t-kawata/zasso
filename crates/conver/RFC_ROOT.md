# conver: RFC・チケット・レビュー・ワークフローのための決定論的 Rust オーケストレータ

## Abstract

本RFCは、RFC grilling（ソクラテス型対話による設計収束）、RFCツリー階層分解、
チケット管理、malfeasance追跡、artifact管理、review自動化、乖離検出、および
自己収束ループのための全機能を単一バイナリで提供する決定論的 Rust オーケストレータ
**conver** を規定する。

conver は機械的決定論性を最大化しつつ、pause/resume/abort/rollback の明示的制御点
において人間のオーバーライドを保持する。全設計判断は 79 の DesignTree ノードとして
形式化され、本RFCがそれらを完全網羅する。

本RFCは頂点RFC（親RFC）である。conver の設計は以下の6つの子RFCに分解されており、
各子RFCは独立した実装・検証・再利用が可能な単位として設計されている。

| 子RFC | ディレクトリ | 内容 |
|-------|-------------|------|
| RFC_001 | `crates/conver/rfc-001-cli/` | CLI レイヤ（conver-cli crate） |
| RFC_002 | `crates/conver/rfc-002-core/` | コア状態機械（conver-core crate） |
| RFC_003 | `crates/conver/rfc-003-runtime/` | ランタイム抽象化（conver-runtime crate） |
| RFC_004 | `crates/conver/rfc-004-storage/` | 永続化ストレージ（conver-storage crate） |
| RFC_005 | `crates/conver/rfc-005-validation/` | プロジェクション・検証（conver-projection + conver-validation crate） |
| RFC_006 | `crates/conver/rfc-006-convergence/` | 数学的定式化・収束制御（conver-core内） |

システムは以下の7つのlogical crateで構成される：

```text
crates/
  conver/             ← 統合crate（ワークスペースルート兼最終成果物）
  rfc-001-cli/        # conver-cli crate — RFC_001
  rfc-002-core/       # conver-core crate — RFC_002
  rfc-003-runtime/    # conver-runtime crate — RFC_003
  rfc-004-storage/    # conver-storage crate — RFC_004
  rfc-005-validation/ # conver-projection + conver-validation crate — RFC_005
  rfc-006-convergence/# 数学的モデル文書（実装はrfc-002-core内） — RFC_006
```

## Motivation

### 背景

現在の workflow は単一で一貫した execution kernel ではなく、分散した script suite
（`init.js`、`update-tree.js`、`session-status.js`、`generate-checklist.js`、
`create-ticket.js`、`resolve-ticket.js` 等）として実装されている。
RFC grilling は `Status.json`、`DesignTree.json`、`CheckList.md` を persistent
coordination artifact として用い、schema validation と session-step derivation を
個別スクリプトへ処理が分散している。Ticketing、artifact management、frontmatter update、
malfeasance bookkeeping、review check も多数の script entrypoint に分解されている。

この分散アーキテクチャには以下の問題がある：

1. **Authority の分裂**: Slash command、script behavior、human intent の 3 つの
   textual authority が存在し、競合解決ルールが暗黙的である。
2. **実行セマンティクスの不在**: Interruption、durable restart、runtime abstraction
   の統一モデルがない。長時間実行中の PC シャットダウンに耐えられない。
3. **フェーズ間の接続の欠如**: Grill → チェックリスト → RFC執筆 → チケット実行 →
   乖離検出 → 収束 の一貫した状態機械がない。

conver はこれらの問題を、単一のワークフローコントロールプレーンとして解決する。

### 達成目標

- RFC が Single Source of Truth として機能する
- 長大RFCは再帰的に分解され、各ノードが独立検証可能な単位となる
- 分解後のRFC群は DAG として妥当性が保証される
- DAG上で独立なチケット群は並列実行可能である
- 完成判定は主観ではなく乖離関数 Δ = 0 の形式的基準による
- 全数値閾値は `settings.json` で設定可能である

### 従来との運用比較

```bash
# Before: 分散スクリプト群
node .claude/scripts/grill-me-for-rfc/init.js "$RESEARCH_PATH" "$RFC_OUTPUT_PATH"
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" add '{...}'
node .claude/scripts/grill-me-for-rfc/session-status.js "$RFC_DIR"
node .claude/scripts/grill-me-for-rfc/generate-checklist.js "$RFC_DIR"

# After: conver 単一バイナリ
conver rfc grill --research "$RESEARCH_PATH" --output "$RFC_OUTPUT_PATH"
conver rfc status
conver rfc checklist generate
```

## Design

### 1. システムモデル

conver は唯一の workflow control plane である。Human operator は command を開始し、
`resume` / `abort` / `rollback` の明示的操作を通じてのみ介入できる。Runtime backend
（Claude Code）は境界づけられた execution work を担う。Persistent store は canonical
workflow state、tree、ticket、ledger、artifact、checkpoint を記録する。

```rust
pub trait WorkflowController {
    fn execute(&mut self, request: WorkflowRequest) -> Result<WorkflowResult, WorkflowError>;
    fn resume(&mut self, run_id: RunId) -> Result<WorkflowResult, WorkflowError>;
    fn interrupt(&mut self, run_id: RunId, action: UserAction) -> Result<(), WorkflowError>;
}

pub enum UserAction {
    Resume,
    Abort,
    RollbackToLastCheckpoint,
    Stop,
}
```

### 2. Authority モデル

Authority stack は 5 層の全順序を持つ。上位層が下位層と矛盾する場合、上位層が優先される。

1. **RFC text**: 最上位。単一の source of truth。
2. **RFC_TREE.json**: RFC text から導出された構造化制約モデル。
   - 基本構造（見出し・リスト・コードブロック）はプログラムで機械抽出
   - 意味的制約（scope / acceptance criteria）は Claude Code（LLM）が抽出し
     JSON schema で検証
3. **Canonical conver command semantics**: 本RFCで定義されるコマンド意味論。
4. **Generated slash-command bodies**: `conver init` により配布される実装。
5. **Runtime invocation payloads**: Claude Code 実行時の具体的パラメータ。

```rust
pub enum AuthorityLayer {
    RfcText,
    StructuralModel,
    CanonicalCommand,
    SlashCommandTemplate,
    RuntimePayload,
}

pub fn resolve_conflict(conflict: Conflict) -> AuthorityLayer {
    match conflict {
        Conflict::AgainstRfcText => AuthorityLayer::RfcText,
        Conflict::AgainstStructuralModel => AuthorityLayer::StructuralModel,
        Conflict::AgainstCanonicalCommand => AuthorityLayer::CanonicalCommand,
        Conflict::AgainstSlashCommand => AuthorityLayer::SlashCommandTemplate,
        Conflict::AgainstRuntimePayload => AuthorityLayer::RuntimePayload,
    }
}
```

### 3. 設定モデル

設定は 5 層の優先順位でマージされる：

```text
built-in defaults < global config < project config < -f config < CLI flags
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub runtime: RuntimeSettings,
    pub ui: UiSettings,
    pub retry: RetrySettings,
    pub resume: ResumeSettings,
    pub report: ReportSettings,
    pub paths: PathSettings,
    pub install: InstallSettings,
    pub quality: QualitySettings,
    pub deviation: DeviationSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSettings {
    pub backend: String, // デフォルト: "claude-code"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiSettings {
    pub display_mode: DisplayMode, // デフォルト: ColorizedCLI
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetrySettings {
    pub structured_output_limit: u32, // デフォルト: 3
    pub dag_validation_limit: u32,    // デフォルト: 3
    pub final_mode: String,           // デフォルト: "reformat_only"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportSettings {
    pub pause_mode: PauseMode,           // デフォルト: Soft
    pub checkpoint_interval: u32,        // デフォルト: 5
    pub ticket_completion_interval: u32, // デフォルト: 10
    pub convergence_loop_limit: u32,     // デフォルト: 3
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviationSettings {
    pub alpha: f64, // デフォルト: 2.0 (Structural Inconsistency)
    pub beta: f64,  // デフォルト: 2.0 (Implementation Contradiction)
    pub gamma: f64, // デフォルト: 1.0 (Specification Deficiency)
    pub delta: f64, // デフォルト: 1.0 (Implementation Missing)
    pub visualization_bars: u32, // デフォルト: 50 (充足度バー分割数)
}
```

### 4. CRUD 操作モデル

conver は全データ（`.md` / `.json` / `.toml`）の CRUD を独占する。Claude Code は
conver コマンドを経由してのみデータを操作する。

```rust
pub trait CrudStore {
    // Read operations
    fn search(&self, query: &str) -> Result<Vec<RecordRef>, StoreError>;
    fn get(&self, id: &RecordId) -> Result<Record, StoreError>;
    fn all(&self) -> Result<Vec<Record>, StoreError>;

    // Write operations (individual)
    fn create(&mut self, record: Record) -> Result<RecordId, StoreError>;
    fn update(&mut self, id: &RecordId, record: Record) -> Result<(), StoreError>;
    fn delete(&mut self, id: &RecordId) -> Result<(), StoreError>;

    // Write operations (selective batch)
    fn batch_update(&mut self, updates: Vec<(RecordId, Record)>) -> Result<(), StoreError>;
    fn batch_delete(&mut self, ids: &[RecordId]) -> Result<(), StoreError>;
}
```

各コマンド実行時は関連する全ファイルを書き換える。部分的な整合性チェックではなく、
常に全体の整合性が保証される。

### 5. ワークフロー状態機械

#### 大域状態機械

6 状態で Phase 0–7 の全行程をカバーする。

```rust
pub enum WorkflowState {
    Grilling,          // Phase 1 (頂点RFC策定)
    ChecklistPending,  // Phase 1→2 遷移
    ChecklistApproved, // Phase 2–3 (RFCツリー分解・チケット分解)
    Writing,           // Phase 4 (RFC執筆 / 実装)
    Reviewing,         // Phase 5–6 (乖離検出・負債管理)
    Done,              // Δ = 0 達成
}
```

状態遷移は以下の第一層ループ回数をプログラムが管理する。

```rust
pub struct RoundRecord {
    pub round_number: u32,
    pub state: WorkflowState,
    pub entered_at: chrono::DateTime<chrono::Utc>,
}
```

#### チケット局所状態機械

```rust
pub enum TicketStatus {
    Created,
    Making,
    Made,
    Planning,
    Planned,
    Starting,
    Started,
    Reviewing,
    Reviewed,
    Done,
    Blocked,
    Retrying,
    RolledBack,
    Aborted,
}
```

### 6. RFCツリー管理

#### RFC_TREE.json スキーマ

フラット nodes 配列形式。petgraph で DAG 検証可能。

```json
{
  "version": 1,
  "root_rfc_id": "rfc-conver",
  "root_path": ".",
  "updated_at": "2026-06-23T15:00:00+09:00",
  "nodes": [
    {
      "id": "rfc-conver",
      "title": "conver: 決定論的 Rust オーケストレータ",
      "path": ".",
      "status": "draft",
      "children": ["rfc-001", "rfc-002"],
      "depends_on": [],
      "sha256": ""
    },
    {
      "id": "rfc-001",
      "title": "CLI レイヤ（conver-cli）",
      "path": "rfc-001-cli",
      "status": "pending",
      "children": [],
      "depends_on": [],
      "sha256": ""
    },
    {
      "id": "rfc-002",
      "title": "コア状態機械（conver-core）",
      "path": "rfc-002-core",
      "status": "pending",
      "children": [],
      "depends_on": [],
      "sha256": ""
    }
  ]
}
```

#### DAG 検証

`petgraph::algo::is_cyclic_digraph` による循環検出。依存辺のみ DAG 検証対象とし、
階層辺（children）はツリー構造として自己無矛盾とする。

```rust
use petgraph::graph::DiGraph;
use petgraph::algo::is_cyclic_digraph;
use petgraph::visit::Topo;

pub struct RfcDag {
    graph: DiGraph<RfcNode, EdgeKind>,
}

pub enum EdgeKind {
    Hierarchy, // parent-child (ツリー構造、DAG検証不要)
    Depends,   // dependency (DAG検証対象)
}

impl RfcDag {
    pub fn validate(&self) -> Result<(), DagError> {
        // 依存辺のみ抽出したサブグラフで循環検出
        let dep_graph = self.extract_dep_subgraph();
        if is_cyclic_digraph(&dep_graph) {
            return Err(DagError::CycleDetected);
        }
        // 意味的矛盾の検証（親が子に依存する等）
        self.validate_semantic_constraints()?;
        Ok(())
    }

    fn validate_semantic_constraints(&self) -> Result<(), DagError> {
        for edge in self.graph.edge_references() {
            if matches!(edge.weight(), EdgeKind::Depends) {
                let parent = edge.source();
                let child = edge.target();
                // 親→子の依存は禁止
                if self.is_parent_of(parent, child) {
                    return Err(DagError::ParentToChildDep(parent.index(), child.index()));
                }
            }
        }
        Ok(())
    }
}
```

#### 改竄検出

各ファイルの SHA-256 ハッシュを `RFC_TREE.json` ノードの `sha256` フィールドに内蔵する。
`RFC_TREE.json` 自身のハッシュは `.conver/manifest.json` に保存する。

```rust
use sha2::{Sha256, Digest};

pub struct TamperDetector;

impl TamperDetector {
    pub fn verify_all(nodes: &[RfcNode], manifest: &Manifest) -> Result<Vec<String>, TamperError> {
        let mut violations = Vec::new();
        for node in nodes {
            let path = &node.path;
            let content = std::fs::read(path)
                .map_err(|_| TamperError::FileNotFound(path.clone()))?;
            let actual_hash = hex::encode(Sha256::digest(&content));
            if actual_hash != node.sha256 {
                violations.push(format!("{}: hash mismatch", path));
            }
        }
        // manifest.json 自身のハッシュ検証
        let manifest_content = std::fs::read(manifest.path())?;
        let manifest_hash = hex::encode(Sha256::digest(&manifest_content));
        if manifest_hash != manifest.expected_hash {
            return Err(TamperError::ManifestTampered);
        }
        Ok(violations)
    }
}
```

検出タイミングは conver 起動時および全書込操作完了後。検出時は AI が修正案を提示し
ハッシュをリフレッシュする。

#### ファイルシステム同期

RFC_TREE.json が source of truth である。プログラムは JSON から機械的にディレクトリ
ツリーを生成する。人間編集は改竄として検出される。

```rust
pub fn sync_tree_to_fs(root: &RfcDag, fs: &dyn FileSystem) -> Result<(), SyncError> {
    for node in root.nodes() {
        fs.ensure_dir(&node.path)?;
    }
    // 宣言されていないディレクトリを検出
    let declared: HashSet<&Path> = root.nodes().iter().map(|n| &n.path).collect();
    let actual = fs.list_dirs(root.base_path())?;
    for dir in actual {
        if !declared.contains(dir) {
            fs.quarantine(dir)?;
        }
    }
    Ok(())
}
```

### 7. DesignTree ガバナンス

#### ノードモデル

```rust
pub struct DesignNode {
    pub id: String,
    pub title: String,
    pub status: DesignStatus,
    pub kind: DesignNodeKind,
    pub blocking: bool,      // 可視化ヒントのみ、完了条件には影響しない
    pub depends_on: Vec<String>,
    pub covered_by_question_ids: Vec<String>,
    pub questions: Vec<QuestionRecord>,
    pub children: Vec<DesignNode>,
}

pub enum DesignNodeKind {
    DecisionGroup,
    ImplementationDetail,
    InfoOnly,
}

pub enum DesignStatus {
    Open,
    Resolved,
}
```

#### Grill 完了条件

完了条件は **全 open count = 0** である。blocking フラグは grill セッション中の
優先順位表示にのみ使用し、完了条件には影響しない。

```rust
pub fn is_grill_complete(nodes: &[DesignNode]) -> bool {
    count_open(nodes) == 0
}

pub fn count_open(nodes: &[DesignNode]) -> usize {
    nodes.iter()
        .map(|n| usize::from(n.status == DesignStatus::Open) + count_open(&n.children))
        .sum()
}
```

### 8. チケット管理

#### Tickets.json

各 RFC ディレクトリの `Tickets.json` に DAG 構造を持つチケット一覧を保存する。

```json
{
  "rfc_id": "rfc-module-a",
  "version": 1,
  "updated_at": "2026-06-23T14:00:00+09:00",
  "tickets": [
    {
      "id": "T001",
      "title": "Implement core trait",
      "description": "WorkflowController trait の実装",
      "status": "created",
      "depends_on": [],
      "acceptance_criteria": "全メソッドの unit test 通過",
      "scope": "conver-core/src/controller.rs",
      "verification": "cargo test -p conver-core",
      "predicted_side_effects": [],
      "rfc_node_id": "rfc-module-a",
      "artifact_ids": []
    },
    {
      "id": "T002",
      "title": "Implement CLI parser",
      "description": "clap による CLI パース",
      "status": "created",
      "depends_on": ["T001"],
      "acceptance_criteria": "全サブコマンドのパース確認",
      "scope": "conver-cli/src/parser.rs",
      "verification": "cargo test -p conver-cli",
      "predicted_side_effects": [],
      "rfc_node_id": "rfc-module-a",
      "artifact_ids": []
    }
  ]
}
```

#### TicketRecord 構造体

```rust
pub struct TicketRecord {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: TicketStatus,
    pub depends_on: Vec<String>,
    pub acceptance_criteria: String,
    pub scope: String,
    pub verification: String,
    pub predicted_side_effects: Vec<String>,
    pub rfc_node_id: String,
    pub artifact_ids: Vec<String>,
}
```

#### Malfeasance Ledger

```rust
pub struct MalfeasanceRecord {
    pub id: String,
    pub rfc_node_id: String,
    pub ticket_id: Option<String>,
    pub description: String,
    pub status: MalfeasanceStatus,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub resolved_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub enum MalfeasanceStatus {
    Open,
    Resolved,
    FalsePositive,
}
```

#### DAG 編成フロー（2段階）

```text
Step 1: Claude Code が title + description + depends_on の骨格 Tickets.json を出力
         ↓ (DAG 検証)
Step 2: プログラムが petgraph でトポロジカルソート
         ↓
Step 3: プログラムが acceptance_criteria / scope / verification 等の
         詳細フィールドを書き込む
```

DAG 検証失敗時は問題点の構造化通知（循環パス・不足ノードID・違反エッジ一覧）を
Claude Code に渡して再生成する。上限 3 回（`settings.retry.dag_validation_limit`）。

### 9. ランタイム抽象化

Claude Code をデフォルト runtime としつつ、trait 抽象化により将来の backend 変更に
備える。

```rust
pub trait RuntimeBackend {
    type Session: RuntimeSession;
    fn start_run(&self, req: RuntimeRequest) -> Result<Self::Session, RuntimeError>;
}

pub trait RuntimeSession {
    fn stream_events(&mut self) -> Result<Vec<RuntimeEvent>, RuntimeError>;
    fn cancel(&mut self) -> Result<(), RuntimeError>;
    fn await_result(self) -> Result<RuntimeResult, RuntimeError>;
}

pub trait StructuredPayloadExtractor {
    fn extract_structured_payload(&self, text: &str) -> Result<StructuredPayload, ExtractError>;
}

pub enum RuntimeEvent {
    StdoutChunk(String),
    StderrChunk(String),
    StructuredCandidate(String),
    Progress { message: String },
    Completed,
}
```

#### JSON 抽出リトライ戦略

```rust
pub fn retry_extract_json(
    extractor: &dyn StructuredPayloadExtractor,
    output: &str,
    limit: u32,
) -> Result<StructuredPayload, RetryError> {
    for attempt in 1..=limit {
        match extractor.extract_structured_payload(output) {
            Ok(payload) => return Ok(payload),
            Err(err) if attempt < limit => {
                // 次回試行: concrete failure reason + 期待schema を返す
                continue;
            }
            Err(err) => {
                // 最終試行: reformat-only mode（新規推論禁止、構造補正のみ）
                return Err(RetryError::Exhausted(err));
            }
        }
    }
    unreachable!()
}
```

全試行失敗時は `failed_structured_output` として記録し、エラー報告の上ユーザーの
指示を待つ。

### 10. チェックポイントと実行永続化

チェックポイントは conver の全操作に共通する耐久性保証の基盤である。
grill / RFC執筆 / チケット実行 / インストールの全フェーズで使用される。

```rust
pub fn commit_checkpoint(
    ctx: &mut WorkflowContext,
    payload: StructuredPayload,
) -> Result<CheckpointId, CommitError> {
    // 1. Structured payload 検証
    validate_structured_payload(&payload)?;
    // 2. 全 validation gate 通過
    run_validation_gates(ctx, &payload)?;
    // 3. state/file mutation 適用
    apply_state_mutations(ctx, &payload)?;
    // 4. 永続化
    let checkpoint = persist_checkpoint(ctx, payload)?;
    Ok(checkpoint.id)
}
```

- **粒度**: 全操作完了単位（grill Q&A ノード解決、チケット完了、フェーズ遷移、
  ファイル書込完了）
- **保存内容**: `Status` / `DesignTree` / `RunRecord` の最新 JSON スナップショットのみ
- **実行主体**: 各コマンドの副作用として機械的に実行。Claude Code の LLM 呼出しを
  誘発しない

```rust
pub struct RunRecord {
    pub run_id: String,
    pub command: String,
    pub args: Vec<String>,
    pub runtime: String,
    pub checkpoint_id: CheckpointId,
    pub checkpoint_state: String,
    pub pending_user_action: Option<UserAction>,
    pub retry_counters: HashMap<String, u32>,
}
```

#### 中断・再開

```rust
pub fn request_stop(session: &mut dyn RuntimeSession) -> Result<InterruptState, RuntimeError> {
    session.cancel()?;
    Ok(InterruptState::CancelRequested)
}

pub fn resume_from_checkpoint(
    record: &RunRecord,
) -> ResumeRequest {
    ResumeRequest {
        checkpoint_id: record.checkpoint_id.clone(),
        committed_state: record.checkpoint_state.clone(),
        discarded_uncommitted_output: true,
    }
}
```

### 11. 検証ゲート

3 種の検証ゲートは常時必須であり、全状態変更操作の後に自動実行される。

```rust
pub trait Validator<T> {
    fn validate(&self, target: &T) -> Result<(), ValidationErrors>;
}

pub struct SchemaValidator;     // Status/DesignTree/CheckList 構造検証
pub struct QuestionFormatValidator; // grill 質問フォーマット検証
pub struct QualityGate;        // 全open=0 / 全checklist完了 / 禁止表現不在 検証
```

各ゲートは必要なタイミングで自律実行される。実行順序の暗黙的な前提として
改竄検出が最初に位置する（改竄ファイルでの後続検証は無意味であるため）。

### 12. 表示モード

```rust
pub enum DisplayMode {
    Tui,
    ColorizedCli, // デフォルト
    Plain,
}
```

実行開始時に明示的に選択され、実行中に auto-switch 不可。

#### 収束レポート（conver status）

```text
[conver] Round 3 — Convergence Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Δ = 5  (M:2  C:1  U:0  X:2)

 ▼ Per-RFC-node deviation vector (bar: 50 segments)
   rfc-conver      Δ=0  ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ 100%
   rfc-module-a    Δ=2  ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■□□□□□□□□□□□□  70%
   rfc-module-b    Δ=3  ■■■■■■■■■■■■■■■■■■■■■■■■■□□□□□□□□□□□□□□□□□□□□□□□□  50%

 Status: CONVERGING (3 rounds / limit 3)
```

充足度バーの分割数は `deviation.visualization_bars = 50`（2% 単位）。

### 13. 並列実行モデル

二種類の DAG はともに `petgraph` で管理される。

```rust
use petgraph::graph::DiGraph;
use petgraph::algo::toposort;

type TicketDiGraph = DiGraph<TicketNode, ()>;

pub fn compute_frontier(tickets: &TicketDiGraph) -> Vec<TicketNode> {
    // トポロジカルソート順で入次数0の未完了チケットを収集
    let sorted = toposort(tickets, None).expect("DAG expected");
    sorted.into_iter()
        .filter(|node| tickets[*node].status == TicketStatus::Created)
        .filter(|node| {
            tickets.neighbors_directed(*node, petgraph::Incoming).count() == 0
        })
        .map(|idx| tickets[idx].clone())
        .collect()
}
```

同一チケット内部の `plan → start → review` は逐次実行（並列化不可）。
依存関係にないチケットは並列実行される。

Resource compatibility は DAG の依存関係で表現する。同一リソース（ファイル・crate・
ポート等）に副作用を持つチケット同士は、DAG 上で依存辺を明示的に張ることで直列化
される。純粋な依存関係とは別に resource tag を各チケットに付与し、同じ tag を持つ
未完了チケットは同時に frontier に含めない方式を採る。これは完全な resource lock
解法（NP困難）に対する実用的な近似戦略である。

### 14. インストールとアップグレード

```rust
pub struct EmbeddedAsset {
    pub logical_name: String,       // "grill-me-for-rfc"
    pub relative_path: PathBuf,     // ".claude/commands/grill-me-for-rfc.md"
    pub bytes: &'static [u8],
    pub sha256: String,
    pub asset_kind: AssetKind,
}

pub struct ManifestAsset {
    pub logical_name: String,
    pub relative_path: PathBuf,
    pub sha256: String,
    pub asset_kind: AssetKind,
    pub version: String,
    pub compatible_runtimes: Vec<String>,
    pub dependencies: Vec<String>,
}

pub enum UpdateDecision {
    NoChange,
    NeedsUpdate,
}

pub fn should_update(installed: &ManifestAsset, embedded: &EmbeddedAsset) -> UpdateDecision {
    if installed.sha256 == embedded.sha256 {
        UpdateDecision::NoChange
    } else {
        UpdateDecision::NeedsUpdate
    }
}
```

衝突ポリシーは `preserve_and_suffix` をデフォルトとし、`overwrite_if_forced` も
設定可能。

### 15. テスト戦略

全テスト種別を今回の開発で実装する。フェーズ分割禁止。

```rust
// ユニットテスト: state transition / authority / retry / pause
#[test]
fn grill_finishes_only_when_open_count_is_zero() {
    let status = StatusRecord::grilling();
    let tree = DesignTree::with_nodes(vec![DesignNode::resolved("n1")]);
    assert!(can_finish_grill(&status, &tree));
}

#[test]
fn config_merge_precedence() {
    let builtin = Settings::defaults();
    let cli = Settings { runtime: RuntimeSettings { backend: "test".into() }, ..Default::default() };
    let merged = merge_settings(builtin, cli);
    assert_eq!(merged.runtime.backend, "test");
}
```

プロパティテスト（tree sync / config merge）、結合テスト（grill → checklist →
writing → review → done の full flow）、Golden テスト（Markdown/JSON projection）
も同様に実装する。

### 16. 永続化層

永続化ファイルは `RFC_TREE.json` の構造と完全一致するディレクトリツリーに配置される。

```text
rfc-conver/
  RFC_ROOT.md
  RFC_TREE.json
  Status.json
  DesignTree.json
  CheckList.md
  round_log.jsonl
  .conver/
    manifest.json
    malfeasance.json
    run_record.json
  rfc-module-a/
    RFC_001.md
    Tickets.json
  rfc-module-b/
    RFC_002.md
    Tickets.json
```

全書き込みは `write-temp → fsync → rename` の atomic パターンに従う。バックエンドは
ファイルベースのみであり、SQLite は使用しない。これは Q1 で確定した設計判断である。

```rust
pub fn atomic_write(path: &Path, content: &[u8]) -> std::io::Result<()> {
    let tmp_path = path.with_extension("tmp");
    {
        let mut file = std::fs::File::create(&tmp_path)?;
        file.write_all(content)?;
        file.sync_all()?;
    }
    std::fs::rename(&tmp_path, path)?;
    Ok(())
}
```

### 17. 数学的定式化

#### 開発空間

開発空間は仕様空間と実装空間の直積として定義する。

\[
\mathcal{D} = \mathcal{S} \times \mathcal{I}
\]

- \(\mathcal{S}\): 仕様空間。頂点RFC、分解RFC群、RFC_TREE、チケット仕様群から成る。
- \(\mathcal{I}\): 実装空間。実ソースコード、テスト、生成物、STUB台帳、レビュー結果。

任意の時刻の開発状態は \(d_t = (s_t, i_t) \in \mathcal{D}\) と表される。

#### 乖離関数

\[
\Delta(s,i) = \alpha M(s,i) + \beta C(s,i) + \gamma U(s,i) + \delta X(s,i)
\]

| 記号 | 分類 | デフォルト重み |
|------|------|---------------|
| M | Implementation Missing（RFC記述あり未実装） | δ = 1.0 |
| C | Implementation Contradiction（実装がRFCと矛盾） | β = 2.0 |
| U | Specification Deficiency（実装から見つかったRFC抜け） | γ = 1.0 |
| X | Structural Inconsistency（JSONとMDの不整合） | α = 2.0 |

構造不整合と矛盾はシステムの信頼性を直接損なうため重みを 2.0 としている。

```rust
pub fn calculate_deviation(
    omissions: &OmissionsLedger,
    settings: &DeviationSettings,
) -> DeviationScore {
    let m = omissions.count_by_kind(OmissionKind::ImplementationMissing);
    let c = omissions.count_by_kind(OmissionKind::ImplementationContradiction);
    let u = omissions.count_by_kind(OmissionKind::SpecificationDeficiency);
    let x = omissions.count_by_kind(OmissionKind::StructuralInconsistency);

    DeviationScore {
        delta: settings.alpha * x as f64
             + settings.beta * c as f64
             + settings.gamma * u as f64
             + settings.delta * m as f64,
        components: DeviationComponents { m, c, u, x },
    }
}
```

#### 観測ベクトル

各第一層ループ反復 \(r\) に対して観測ベクトルを記録する。

\[
\mathbf{o}_r = (r, |V_r|, |K_r|, \Delta_r, \vec{\Delta}_r, \tau_r, \rho_r, \eta_r)
\]

```rust
pub struct ObservationVector {
    pub r: u32,                    // ループ回数
    pub v_count: u32,              // |V_r|: RFCノード数
    pub k_count: u32,              // |K_r|: 全チケット数
    pub delta: f64,                // Δ_r: 大域乖離スコア
    pub per_node_delta: Vec<(String, f64)>, // ノード別乖離ベクトル
    pub duration_secs: u64,        // τ_r: ラウンド所要時間
    pub debt_index: f64,           // ρ_r: STUB密度/レビュー失敗率
    pub interventions: Vec<String>, // η_r: 人間介入イベント列
}
```

#### Omissions Ledger

乖離検出は4分類の性質に応じてハイブリッド方式で実行される。

| 分類 | 検出主体 | 方法 |
|------|---------|------|
| Structural Inconsistency (X) | **プログラム（機械的）** | RFC_TREE.json の構造とファイルシステム上の RFC_XXX.md 群の親子・依存・状態を突き合わせる |
| Implementation Missing (M) | **Claude Code（LLM）** | RFC の各セクションが実装コードに存在するか意味的に比較 |
| Implementation Contradiction (C) | **Claude Code（LLM）** | 実装の挙動が RFC の記述と矛盾していないか意味的に検証 |
| Specification Deficiency (U) | **Claude Code（LLM）** | 実装中に発見されたが RFC に未記述の項目を抽出 |

検出は checkpoint 完了時およびフェーズ遷移時に自動実行される。
構造化された問題点は Claude Code に渡され、次のループでの修正入力となる。

```rust
pub enum OmissionKind {
    ImplementationMissing,
    ImplementationContradiction,
    SpecificationDeficiency,
    StructuralInconsistency,
}

pub struct OmissionDetector {
    mechanical: StructuralValidator,   // X の検出
    llm: ClaudeCodeAdapter,            // M/C/U の検出
}

impl OmissionDetector {
    pub fn run(&self, rfc_tree: &RfcDag, sources: &Codebase) -> OmissionsLedger {
        let mut omissions = OmissionsLedger::new();
        // Structural Inconsistency: 機械的検出
        omissions.extend(self.mechanical.check(rfc_tree));
        // Implementation Missing / Contradiction / Deficiency: LLM検出
        if let Ok(llm_result) = self.llm.detect_omissions(rfc_tree, sources) {
            omissions.extend(llm_result);
        }
        omissions
    }
}
```

検出された乖離は `OMISSIONS-<suffix>.json` に保存される。`<suffix>` はループ番号で
区別し、複数ラウンドの乖離履歴を保持可能にする。

```json
{
  "round": 3,
  "detected_at": "2026-06-23T15:00:00+09:00",
  "omissions": [
    {
      "kind": "implementation_missing",
      "rfc_node_id": "rfc-module-a",
      "ticket_id": "T003",
      "description": "RFC_001 §3.2 に記載されたバリデーションロジックが未実装",
      "code_location": "conver-core/src/validation.rs:42",
      "stub_id": "STUB-004",
      "severity": "major",
      "detected_at": "2026-06-23T15:00:00+09:00"
    }
  ]
}
```

#### 収束ループ制御

Δ > 0 の場合、omissions の種類に応じてフィードバック先が異なる。

| 検出された乖離の種類 | フィードバック先 |
|---------------------|----------------|
| Structural Inconsistency (X) | Phase 2: RFCツリー再構成 |
| Specification Deficiency (U) | Phase 1: 頂点RFC改訂 |
| Implementation Missing (M) | Phase 4: チケット再実行 |
| Implementation Contradiction (C) | Phase 4: チケット再実行 |

```rust
pub fn determine_feedback_phase(omissions: &OmissionsLedger) -> WorkflowState {
    if omissions.has_kind(OmissionKind::StructuralInconsistency) {
        return WorkflowState::ChecklistPending; // Phase 2相当
    }
    if omissions.has_kind(OmissionKind::SpecificationDeficiency) {
        return WorkflowState::Grilling; // Phase 1相当
    }
    // Implementation Missing / Contradiction
    WorkflowState::ChecklistApproved // Phase 4相当
}
```

ループ上限は `settings.report.convergence_loop_limit`（デフォルト 3）。
上限到達時はエラー報告の上ユーザーの判断を仰ぐ。

## Implementation

### ワークスペース・統合crate構造

全子RFC（RFC_001–006）の実装完了後、`crates/conver/` をワークスペースルート兼
統合crateとして構成する。この統合crateが最終成果物であり、以下の責務を負う：

1. **単一バイナリ `conver` の生成**: 全サブcrateを依存関係として統合し、
   `crates/conver/src/main.rs` をエントリポイントとする単一バイナリを生成する。
2. **ライブラリ `conver` の提供**: 他のRustプロジェクトが `cargo add conver` で
   依存可能なライブラリとしても公開する。ライブラリとしての公開APIは
   `WorkflowController` / `Settings` / `RuntimeBackend` 等の主要traitを含む。
3. **crates.io公開**: バージョン管理・ドキュメント生成・公開を可能にする。

```text
crates/conver/
├── Cargo.toml              # ワークスペース定義 + 統合crate
├── src/
│   ├── main.rs             # 統合バイナリエントリポイント
│   └── lib.rs              # ライブラリ公開API
├── rfc-001-cli/
│   ├── Cargo.toml          # crate: conver-cli
│   └── src/
│       ├── lib.rs
│       ├── main.rs         # test-run用
│       ├── parser.rs
│       ├── config.rs
│       ├── router.rs
│       ├── init.rs
│       └── compat.rs
├── rfc-002-core/
│   ├── Cargo.toml          # crate: conver-core
│   └── src/
│       ├── lib.rs
│       ├── controller.rs
│       ├── state.rs
│       ├── designtree.rs
│       ├── ticket.rs
│       ├── malfeasance.rs
│       ├── deviation.rs
│       ├── observation.rs
│       ├── convergence.rs
│       ├── tree.rs
│       └── settings.rs
├── rfc-003-runtime/
│   ├── Cargo.toml          # crate: conver-runtime
│   └── src/
│       ├── lib.rs
│       ├── backend.rs
│       ├── session.rs
│       ├── event.rs
│       ├── extractor.rs
│       ├── claude.rs
│       ├── timeout.rs
│       ├── logging.rs
│       └── error.rs
├── rfc-004-storage/
│   ├── Cargo.toml          # crate: conver-storage
│   └── src/
│       ├── lib.rs
│       ├── backend.rs
│       ├── crud.rs
│       ├── atomic.rs
│       ├── checkpoint.rs
│       ├── round_log.rs
│       ├── tamper.rs
│       ├── manifest.rs
│       ├── path.rs
│       └── error.rs
├── rfc-005-validation/
│   ├── Cargo.toml          # crate: conver-projection + conver-validation
│   └── src/
│       ├── lib.rs
│       ├── checklist.rs
│       ├── omissions_md.rs
│       ├── report.rs
│       ├── template.rs
│       ├── schema.rs
│       ├── question_fmt.rs
│       ├── quality.rs
│       └── dag.rs
└── rfc-006-convergence/
    └── RFC_006.md           # 数学的モデル文書（実装はrfc-002-core内）
```

#### 統合crateのCargo.toml

```toml
# crates/conver/Cargo.toml（ワークスペース兼統合crate）
[package]
name = "conver"
version.workspace = true
edition.workspace = true
description = "決定論的 Rust オーケストレータ — RFC/Ticket/Review ワークフロー制御"
license = "MIT"
repository = "https://github.com/your-org/conver"

[dependencies]
conver-cli = { path = "./rfc-001-cli" }
conver-core = { path = "./rfc-002-core" }
conver-runtime = { path = "./rfc-003-runtime" }
conver-storage = { path = "./rfc-004-storage" }
conver-projection = { path = "./rfc-005-validation", package = "conver-projection" }
conver-validation = { path = "./rfc-005-validation", package = "conver-validation" }

[workspace]
members = [
    "rfc-001-cli",
    "rfc-002-core",
    "rfc-003-runtime",
    "rfc-004-storage",
    "rfc-005-validation",
]
```

#### 統合バイナリエントリポイント

```rust
// crates/conver/src/main.rs
fn main() {
    // 全サブcrateを統合したエントリポイント
    // 実際のエントリは rfc-001-cli の main.rs に委譲
    conver_cli::main();
}
```

#### ライブラリ公開API

```rust
// crates/conver/src/lib.rs
//! # conver — 決定論的 Rust オーケストレータ
//!
//! `conver` は RFC grilling、RFCツリー分解、チケット管理、malfeasance追跡、
//! 乖離検出、自己収束ループのための全機能を提供する。
//!
//! 他のRustプロジェクトからは以下のように利用する：
//!
//! ```toml
//! [dependencies]
//! conver = "0.1"
//! ```
//!
//! 使用例：
//! ```rust,no_run
//! use conver::prelude::*;
//!
//! let mut controller = WorkflowControllerImpl::new(
//!     FileBackend::new(".").unwrap(),
//!     ClaudeCodeBackend::new(),
//!     Settings::defaults(),
//! );
//! let result = controller.execute(WorkflowRequest::ShowStatus(
//!     StatusRequest { rfc_dir: ".".into() }
//! )).unwrap();
//! println!("{}", result.message);
//! ```

pub use conver_core::controller::{WorkflowController, WorkflowRequest, WorkflowResult};
pub use conver_core::state::WorkflowState;
pub use conver_core::settings::Settings;
pub use conver_core::deviation::{DeviationCalculator, DeviationScore, OmissionKind};
pub use conver_core::ticket::TicketRecord;
pub use conver_core::malfeasance::MalfeasanceRecord;
pub use conver_core::observation::ObservationVector;
pub use conver_core::convergence::ConvergenceController;

pub use conver_cli::ConfigResolver;

pub use conver_storage::StorageBackend;
pub use conver_storage::FileBackend;

pub use conver_runtime::RuntimeBackend;
pub use conver_runtime::ClaudeCodeBackend;

pub mod prelude {
    pub use super::*;
}
```
      lib.rs
      markdown.rs      # RFC_XXX.md / CheckList.md / OMISSIONS.md 生成
      json_out.rs      # JSON artifact 生成
      report.rs        # 収束レポート（conver status）
  conver-validation/
    src/
      lib.rs
      schema.rs        # Status/DesignTree/CheckList スキーマ検証
      question_fmt.rs  # 質問フォーマット検証
      quality.rs       # 品質ゲート（全open=0 / プレースホルダ禁止）
      dag.rs           # petgraph DAG検証
      tamper.rs        # SHA-256 改竄検出
  conver-compat/
    src/
      lib.rs
      cmd.rs           # `conver cmd` 互換レイヤ
```

### CLI コマンドサーフェス

```rust
#[derive(clap::Parser)]
#[command(name = "conver")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(clap::Subcommand)]
pub enum Command {
    /// プロジェクト初期化（埋め込みスラッシュコマンド配布）
    Init(InitCommand),
    /// RFC ワークフロー（grill / status / checklist）
    Rfc(RfcCommand),
    /// チケット管理（create / resolve / status）
    Ticket(TicketCommand),
    /// Malfeasance ledger 管理
    Malfeasance(MalfeasanceCommand),
    /// 品質検証実行
    Quality(QualityCommand),
    /// ランタイム操作（Claude Code 実行）
    Runtime(RuntimeCommand),
    /// レガシースクリプト互換
    Cmd(CompatCommand),
}
```

### 永続化の実装

#### ファイルバックエンド

`StorageBackend trait` を core が定義し、storage が実装する。

```rust
// conver-core/src/lib.rs
pub trait StorageBackend {
    fn read_json<T: DeserializeOwned>(&self, path: &Path) -> Result<T, StorageError>;
    fn write_json<T: Serialize>(&mut self, path: &Path, data: &T) -> Result<(), StorageError>;
    fn exists(&self, path: &Path) -> bool;
    fn remove(&mut self, path: &Path) -> Result<(), StorageError>;
}

// conver-storage/src/file.rs
pub struct FileBackend {
    base_path: PathBuf,
}

impl StorageBackend for FileBackend {
    fn write_json<T: Serialize>(&mut self, path: &Path, data: &T) -> Result<(), StorageError> {
        let full_path = self.base_path.join(path);
        let json = serde_json::to_string_pretty(data)?;
        atomic_write(&full_path, json.as_bytes())?;
        Ok(())
    }
    // ...
}
```

#### round_log.jsonl（append-only）

```rust
pub fn append_observation(record: &ObservationVector) -> Result<(), StorageError> {
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("round_log.jsonl")?;
    let line = serde_json::to_string(record)?;
    writeln!(file, "{}", line)?;
    file.sync_all()?;
    Ok(())
}
```

### 検証の実装

コードスニペット例（質問フォーマット検証）：

```rust
pub struct QuestionFormatValidator;

impl Validator<String> for QuestionFormatValidator {
    fn validate(&self, question: &str) -> Result<(), ValidationErrors> {
        let mut errors = Vec::new();

        // ルール0: Q<番号> ID
        if !question.contains(|c: char| c.is_ascii_digit()) {
            errors.push("質問ID（Q<番号>）が必要".into());
        }

        // ルール1: 理由・背景
        let has_reasoning = ["理由", "ため", "trade-off"]
            .iter().any(|k| question.contains(k));
        if !has_reasoning {
            errors.push("理由・背景の説明が必要".into());
        }

        // ルール2: A/B/C 選択肢
        let has_choice = ["A)", "B)", "C)"]
            .iter().any(|c| question.contains(c));
        if !has_choice {
            errors.push("A/B/Cの選択肢が必要".into());
        }

        // ルール3: 自由記述禁止
        let open_ended = ["どう思いますか", "自由にお書きください"]
            .iter().any(|k| question.contains(k));
        if open_ended {
            errors.push("自由記述を求めないこと".into());
        }

        // ルール4: 選択肢は改行リスト、推奨あり
        // ...

        if errors.is_empty() { Ok(()) } else { Err(ValidationErrors(errors)) }
    }
}
```

### 結合テスト例

```rust
#[test]
fn full_grill_to_done_flow() {
    // Arrange: テスト用ディレクトリに調査ファイルを配置
    let dir = tempfile::tempdir().unwrap();
    let research = dir.path().join("research.md");
    fs::write(&research, "# Research\nSome context").unwrap();
    let rfc_path = dir.path().join("RFC_ROOT.md");

    // Act: grill → checklist → writing → review
    let mut controller = WorkflowControllerImpl::new(FileBackend::new(dir.path()));
    controller.execute(WorkflowRequest::GrillRfc(
        GrillRfcRequest {
            research_path: research,
            output_path: rfc_path.clone(),
        }
    )).unwrap();

    // 全ノード解決をシミュレート
    // ...

    controller.execute(WorkflowRequest::GenerateChecklist).unwrap();
    let checklist = fs::read_to_string(dir.path().join("CheckList.md")).unwrap();
    assert!(checklist.contains("§1"));

    // Assert: RFCが生成されている
    assert!(rfc_path.exists());
}
```

## Appendix

### A. Settings.json 完全スキーマ

```json
{
  "runtime": {
    "backend": "claude-code",
    "request_timeout_seconds": 1800
  },
  "ui": {
    "display_mode": "ColorizedCLI",
    "color": true
  },
  "retry": {
    "structured_output_limit": 3,
    "dag_validation_limit": 3,
    "final_mode": "reformat_only"
  },
  "resume": {
    "policy": "checkpoint_only",
    "discard_uncommitted_output": true
  },
  "report": {
    "pause_mode": "soft",
    "checkpoint_interval": 5,
    "ticket_completion_interval": 10,
    "convergence_loop_limit": 3
  },
  "paths": {
    "workspace_root": ".",
    "global_config": "~/.config/conver/settings.json"
  },
  "install": {
    "conflict_policy": "preserve_and_suffix",
    "write_manifest": true
  },
  "quality": {
    "require_schema_gates": true,
    "require_question_format_gate": true
  },
  "deviation": {
    "alpha": 2.0,
    "beta": 2.0,
    "gamma": 1.0,
    "delta": 1.0,
    "visualization_bars": 50
  }
}
```

### B. ファイル一覧

このRFCツリーの全ファイル構成。`crates/conver/` をルートディレクトリとする。

```text
crates/conver/
├── Cargo.toml                  # ワークスペース定義 + 統合crate
├── RFC_ROOT.md                 # 本ファイル（頂点RFC） — 本RFC
├── RFC_TREE.json               # RFCツリーDAG構造（SHA-256内蔵）
├── Status.json                 # ワークフロー状態
├── DesignTree.json             # Grill設計判断ツリー
├── CheckList.md                # RFC要件チェックリスト
├── round_log.jsonl             # 観測ベクトル時系列（append-only）
├── OMISSIONS-<N>.json          # 乖離レコード（N=ループ番号）
├── .conver/
│   ├── manifest.json           # インストールマニフェスト + RFC_TREE.jsonハッシュ
│   ├── malfeasance.json        # Malfeasance ledger
│   └── checkpoints/
│       ├── cp_0001/            # チェックポイントスナップショット
│       ├── cp_0002/
│       └── latest → cp_0002    # 最新へのシンボリックリンク
├── rfc-001-cli/                # RFC_001 — CLI レイヤ（conver-cli）
│   ├── Cargo.toml
│   ├── RFC_001.md
│   └── src/
├── rfc-002-core/               # RFC_002 — コア状態機械（conver-core）
│   ├── Cargo.toml
│   ├── RFC_002.md
│   └── src/
├── rfc-003-runtime/            # RFC_003 — ランタイム抽象化（conver-runtime）
│   ├── Cargo.toml
│   ├── RFC_003.md
│   └── src/
├── rfc-004-storage/            # RFC_004 — 永続化ストレージ（conver-storage）
│   ├── Cargo.toml
│   ├── RFC_004.md
│   └── src/
├── rfc-005-validation/         # RFC_005 — プロジェクション・検証
│   ├── Cargo.toml
│   ├── RFC_005.md
│   └── src/
└── rfc-006-convergence/        # RFC_006 — 数学的定式化・収束制御
    ├── Cargo.toml
    ├── RFC_006.md
    └── src/
```

### C. 状態遷移図

```text
[大域状態機械]
GRILLING → CHECKLIST_PENDING → CHECKLIST_APPROVED → WRITING → REVIEWING → DONE
    ↑                     ↑                            ↑         ↓
    └──── Specification ──┘    ┌──── Implementation ────┘         │
    │                          │   Missing / Contradiction        │
    └── Structural ────────────┘                                  │
    Inconsistency                                                 │
                                                                  │
    (Δ > 0 の場合, 種類別にフィードバック) ←───────────────────────┘

[チケット局所状態機械]
CREATED → MAKING → MADE → PLANNING → PLANNED → STARTING → STARTED
    ↓                                                         ↓
    ──→ BLOCKED ──→ RETRYING ──→ ROLLED_BACK                  │
    ↓                                                         ↓
    ───────────────────────────────────────────────────────→ REVIEWING
                                                               ↓
                                                            REVIEWED
                                                               ↓
                                                            DONE
                                                               ↓
                                                            ABORTED
```

### D. 設計原則

1. **機械的決定論性**: Claude Code の非決定論的生成は Runtime adapter 層で隔離され、
   上位の制御系（WorkflowController）には影響しない。
2. **単一権威**: RFC text + RFC_TREE.json の組が最上位 authority であり、
   競合が生じた場合は必ずこの組が優先される。
3. **改竄即停止**: SHA-256 ハッシュ照合に失敗したファイルは即座に検出され、
   検証ゲートが後続処理をブロックする。
4. **自己収束**: 乖離関数 Δ の各成分（M/C/U/X）が検出・記録・フィードバックされる
   ことで、ループ反復ごとに Δ → 0 へ収束する。
5. **全数値設定可能**: retry上限・DAG検証上限・収束ループ上限・重みαβγδ・
   可視化解像度はすべて `settings.json` のデフォルト値でありユーザーが上書き可能。
6. **階層的RFC分解**: 本RFCは親RFCであり、RFC_001–006の子RFCに分解される。
   各子RFCは独立した実装・検証・再利用が可能で、全子RFCの実装完了後に
   `crates/conver/` 統合crateが単一バイナリ兼ライブラリとして完成する。

### E. 本RFCの自己分解計画（/grill-me-to-split-rfc-as-tree 適用例）

本RFCは以下のRFCツリーに分解される。これにより各サブRFCが約5チケット前後で
完結可能な粒度となり、独立した実装・検証・再利用が可能になる。

```text
RFC_ROOT.md (この文書) ─── conver 全体設計
  │
  ├─ RFC_001.md ─── CLI レイヤ（conver-cli）
  │   チケット: (5)
  │     T001: clap コマンド定義（Command enum, 全サブコマンド）
  │     T002: 設定解決（layered config merge, path canonicalization）
  │     T003: WorkflowRequest 変換（domain handler への routing）
  │     T004: init コマンド（embedded asset 展開 + manifest 書出）
  │     T005: compat ラッパ（conver cmd → domain request 変換）
  │
  ├─ RFC_002.md ─── コア状態機械（conver-core）
  │   チケット: (5)
  │     T001: WorkflowController trait + 実装
  │     T002: WorkflowState / TicketStatus 状態遷移 + ループ回数管理
  │     T003: DesignTree ノードモデル + Grill 完了判定
  │     T004: チケット管理（CRUD + DAG 編成フロー）
  │     T005: Malfeasance ledger + STUB 管理
  │
  ├─ RFC_003.md ─── ランタイム抽象化（conver-runtime）
  │   チケット: (4)
  │     T001: RuntimeBackend / RuntimeSession trait
  │     T002: Claude Code adapter（run / stream / cancel）
  │     T003: StructuredPayloadExtractor + retry 戦略
  │     T004: RuntimeEvent モデル
  │
  ├─ RFC_004.md ─── 永続化ストレージ（conver-storage）
  │   チケット: (4)
  │     T001: StorageBackend trait + FileBackend 実装
  │     T002: CrudStore trait + CRUD 操作
  │     T003: チェックポイント永続化（commit / resume / rollback）
  │     T004: round_log.jsonl append-only + 改竄検出
  │
  ├─ RFC_005.md ─── プロジェクション・検証（conver-projection + conver-validation）
  │   チケット: (5)
  │     T001: Markdown projection（RFC_XXX.md / CheckList.md / OMISSIONS.md）
  │     T002: JSON artifact 生成（RFC_TREE.json, Tickets.json, OMISSIONS.json）
  │     T003: 収束レポート（conver status 表示）
  │     T004: Schema / QuestionFormat / Quality 検証ゲート
  │     T005: petgraph DAG 検証（RFC tree + Ticket）
  │
  └─ RFC_006.md ─── 数学的定式化・収束制御（conver-core）
      チケット: (4)
        T001: 乖離関数 Δ 計算（4 分類 + αβγδ 重み）
        T002: 観測ベクトル o_r 記録
        T003: Omissions ledger（OMISSIONS-<suffix>.json）
        T004: 収束ループ制御（determine_feedback_phase）
```

この分解に対応する RFC_TREE.json：

```json
{
  "version": 1,
  "root_rfc_id": "rfc-conver",
  "root_path": ".",
  "updated_at": "2026-06-23T15:00:00+09:00",
  "nodes": [
    { "id": "rfc-conver", "title": "conver: 決定論的 Rust オーケストレータ", "path": ".",                             "status": "draft",   "children": ["rfc-001","rfc-002","rfc-003","rfc-004","rfc-005","rfc-006"], "depends_on": [], "sha256": "" },
    { "id": "rfc-001",    "title": "CLI レイヤ（conver-cli）",                 "path": "rfc-001-cli",               "status": "pending", "children": [], "depends_on": [], "sha256": "" },
    { "id": "rfc-002",    "title": "コア状態機械（conver-core）",               "path": "rfc-002-core",              "status": "pending", "children": [], "depends_on": [], "sha256": "" },
    { "id": "rfc-003",    "title": "ランタイム抽象化（conver-runtime）",         "path": "rfc-003-runtime",           "status": "pending", "children": [], "depends_on": ["rfc-002"], "sha256": "" },
    { "id": "rfc-004",    "title": "永続化ストレージ（conver-storage）",         "path": "rfc-004-storage",           "status": "pending", "children": [], "depends_on": ["rfc-002"], "sha256": "" },
    { "id": "rfc-005",    "title": "プロジェクション・検証（conver-projection + conver-validation）", "path": "rfc-005-validation", "status": "pending", "children": [], "depends_on": ["rfc-004"], "sha256": "" },
    { "id": "rfc-006",    "title": "数学的定式化・収束制御（conver-core）",      "path": "rfc-006-convergence",        "status": "pending", "children": [], "depends_on": ["rfc-002"], "sha256": "" }
  ]
}
```


### E. 設計資料（crates/conver/docs/）の利活用

`crates/conver/docs/` ディレクトリには本RFCおよび全子RFCの設計に先立って
収集・生成された設計資料が格納されている。これらの資料は以下のように利活用する。

#### 構成

| パス | 内容 | 本RFCとの関係 |
|------|------|-------------|
| `docs/conver-rfc-design-ja.md` | オリジナルRFC草案 | 本RFCの前身。grillセッションのインプットとして使用された |
| `docs/rfc_tree_self_converging_development_design.md` | 完全版設計記述 | 自己収束開発サイクルの理論的背景。数学的定式化の原典 |
| `docs/EVALUATION.md` | 専門家による設計評価 | 本RFCで解決された6つの指摘を含む評価レポート |
| `docs/claude/commands/*.md` | 7種のスラッシュコマンド定義 | `conver init` で配布されるコマンドの参考実装。互換性検証に使用 |
| `docs/claude/scripts/grill-me-for-rfc/*.js` | 9種のgrill用スクリプト | conver-cli の各機能のリファレンス実装。Rust移植の検証用 |
| `docs/claude/scripts/tickets/*.js` | 17種のチケット管理スクリプト | conver-core のチケット操作のリファレンス実装 |
| `docs/claude/scripts/tickets/review/*.js` | 3種のレビュー・品質スクリプト | conver-validation の品質ゲートのリファレンス実装 |
| `docs/claude/scripts/lib/*.js` | 4種の共通ライブラリ | 各crateの共通ロジックの参考実装 |

#### 利活用方法

1. **互換性検証**: `cargo run --bin test-run` の出力と従来スクリプトの実行結果を
   比較することで、Rust移植の正しさを機械的に検証できる。
2. **リファレンス実装**: 各Node.jsスクリプトは対応するRustモジュールの
   リファレンス実装として機能する。仕様の曖昧な部分は従来スクリプトの
   動作を確認することで補完できる。
3. **回帰テスト**: 従来スクリプトのテストケースをRustのテストコードとして
   再利用することで、機能退行を防止する。
4. **ドキュメント原典**: `docs/rfc_tree_self_converging_development_design.md` は
   数学的定式化の原典であり、RFC_006の理論的根拠として参照する。


### F. 完成条件

以下の全条件が満たされた場合のみ RFC 完成を宣言する：

1. DesignTree の全ノードが `resolved`（`open-count` = 0）
2. CheckList の全項目が ✅
3. RFC_ROOT.md 本文に未実装プレースホルダ（将来実装先送り表現）が 0 件
4. 乖離関数 Δ = 0（OMISSIONS-<N>.json が空）
5. 全ファイルの SHA-256 ハッシュが一致
6. 未解決 STUB がゼロ

### G. 互換性マッピング一覧

全レガシースラッシュコマンドおよびスクリプトの `conver` コマンドへの対応関係。

#### スラッシュコマンド→conver コマンド

| レガシースラッシュコマンド | 相当する conver コマンド | 状態 |
|--------------------------|------------------------|------|
| `/grill-me-for-rfc-ja` | `conver rfc grill` | 新規実装 |
| `/grill-me-to-split-rfc-as-tree` | `conver rfc tree split` | 新規実装 |
| `/formulate-tickets` | `conver ticket formulate` | 新規実装 |
| `/make-ticket` | `conver ticket create` | 互換維持 |
| `/plan-ticket` | `conver ticket plan` | 互換維持 |
| `/start-ticket` | `conver ticket start` | 互換維持 |
| `/review-ticket` | `conver ticket review` | 互換維持 |
| `/resolve-ticket` | `conver ticket resolve` | 互換維持 |
| `/find-omissions-for-next-rfc` | `conver rfc omissions` | 新規実装 |

各レガシースラッシュコマンドは `conver cmd` 互換レイヤを経由して同等の動作を提供する。
新規コマンドは domain-oriented な `conver` サブコマンドとして直接実装される。

#### レガシースクリプト→Rust 実装

| スクリプト | Rust 代替 | 担当 crate | モジュール |
|-----------|----------|-----------|-----------|
| `init.js` | `execute(WorkflowRequest::Init)` | `conver-cli` | `main.rs` → `conver-core::controller` |
| `session-status.js` | `SessionStatus::derive()` | `conver-core` | `state.rs` |
| `generate-checklist.js` | `ChecklistGenerator::generate()` | `conver-projection` | `checklist.rs` |
| `validate-question-format.js` | `QuestionFormatValidator::validate()` | `conver-validation` | `question_fmt.rs` |
| `check-all-schema.js` | `SchemaValidator::validate_all()` | `conver-validation` | `schema.rs` |
| `list-files.js` | `FileBackend::all()` | `conver-storage` | `file.rs` / `store.rs` |
| `tree-query.js` | `RfcDag::query()` / `DesignTree::query()` | `conver-core` | `tree.rs` |
| `update-tree.js` | `RfcDag::update_node()` / `DesignTree::update_node()` | `conver-core` | `tree.rs` |
| `update-status.js` | `WorkflowState::transition()` | `conver-core` | `state.rs` |
| `create-ticket.js` | `TicketController::create()` | `conver-core` | `ticket.rs` |
| `resolve-ticket.js` | `TicketController::resolve()` | `conver-core` | `ticket.rs` |
| `search-tickets.js` | `TicketController::search()` | `conver-core` | `ticket.rs` |
| `save-artifact.js` | `ArtifactStore::save()` | `conver-storage` | `artifact.rs` |
| `read-artifact.js` | `ArtifactStore::read()` | `conver-storage` | `artifact.rs` |
| `count-tickets.js` | `TicketController::count()` | `conver-core` | `ticket.rs` |
| `list-tickets.js` | `TicketController::list()` | `conver-core` | `ticket.rs` |
| `update-ticket-status.js` | `TicketController::update_status()` | `conver-core` | `ticket.rs` |
| `check-status.js` | `SessionStatus::derive()` で代替 | `conver-core` | `state.rs` |
| `validate-structure.js` | `DagValidator::validate_all()` | `conver-validation` | `dag.rs` |
| `malfeasance-schema.json` | `MalfeasanceRecord` の `serde` スキーマで代替 | `conver-core` | `malfeasance.rs` |
| `malfeasance-create.js` | `MalfeasanceController::create()` | `conver-core` | `malfeasance.rs` |
| `malfeasance-update.js` | `MalfeasanceController::update()` | `conver-core` | `malfeasance.rs` |
| `malfeasance-all.js` | `MalfeasanceController::list()` | `conver-core` | `malfeasance.rs` |
| `ensure-malfeasance.js` | `MalfeasanceController::ensure()` | `conver-core` | `malfeasance.rs` |
| `scan-crimes.sh` | `MalfeasanceController::scan_all()` | `conver-core` | `malfeasance.rs` |
| `read-frontmatter.js` | `FrontmatterStore::read()` | `conver-storage` | `frontmatter.rs` |
| `update-frontmatter.js` | `FrontmatterStore::update()` | `conver-storage` | `frontmatter.rs` |
| `review/run-quality-checks.js` | `QualityController::run_all()` | `conver-validation` | `quality.rs` |
| `review/find-all-stubs.js` | `StubScanner::find_all()` | `conver-core` | `malfeasance.rs` |
| `review/generate-report.js` | `ReportGenerator::generate()` | `conver-projection` | `report.rs` |
| `lib/tickets.js` | 個別関数のインライン化 | `conver-core` | `ticket.rs` |
| `lib/malfeasance-utils.js` | 個別関数のインライン化 | `conver-core` | `malfeasance.rs` |
| `lib/ticket-config.js` | `Settings::ticket` フィールドで代替 | `conver-core` | `settings.rs` |
| `lib/validate-malfeasance.js` | `MalfeasanceSchema::validate()` | `conver-validation` | `schema.rs` |

### H. スラッシュコマンド設計

`conver init` により `.claude/commands/` に配布されるスラッシュコマンドの
Markdown 定義。各コマンドは `conver <subcommand>` を内部で呼び出す。

#### H.1 `grill-me-for-rfc`（新設）

```markdown
# /grill-me-for-rfc

## 概要
RFC設計書を grill で書き上げる。conver rfc grill を呼び出す。

## 使い方
/grill-me-for-rfc <research-path> <rfc-output-path>
（改行後に補足情報を自由記述可能）

## 動作
1. conver rfc grill --research <research-path> --output <rfc-output-path>
2. 全ノード解決後、conver rfc checklist generate
3. AI目視チェック後、conver rfc checklist approve
```

#### H.2 `grill-me-to-split-rfc-as-tree`（新設）

```markdown
# /grill-me-to-split-rfc-as-tree

## 概要
頂点RFCをDAG構造に分解する。conver rfc tree split を呼び出す。

## 使い方
/grill-me-to-split-rfc-as-tree <rfc-root-path>

## 動作
1. conver rfc tree split --rfc <rfc-root-path>
2. Claude Code が DAG JSON を出力
3. プログラムが JSON を petgraph で検証
4. 検証成功 → ディレクトリツリーを機械生成
5. 検証失敗 → 問題点をClaude Codeに渡して再生成（上限3回）
```

#### H.3 `formulate-tickets`（新設）

```markdown
# /formulate-tickets

## 概要
RFCノードをチケットDAGに分解する。conver ticket formulate を呼び出す。

## 使い方
/formulate-tickets <rfc-node-path>

## 動作
1. conver ticket formulate --rfc-node <path>
2. Claude Code が Tickets.json 骨格（title+description+depends_on）を出力
3. プログラムが petgraph で DAG 検証
4. 検証成功 → トポロジカルソート → 詳細フィールドを書き込み
5. 検証失敗 → 問題点をClaude Codeに渡して再生成（上限3回）
```

#### H.4 `make-ticket`（既存・互換維持）

```markdown
# /make-ticket

## 概要
新規チケットを作成する。conver ticket create を呼び出す。

## 使い方
/make-ticket <title> --rfc-node <id>

## 動作
conver ticket create --title <title> --rfc-node <id>
```

#### H.5 `plan-ticket`（既存・互換維持）

```markdown
# /plan-ticket

## 概要
チケットの実装計画を策定する。conver ticket plan を呼び出す。

## 使い方
/plan-ticket <ticket-id>
```

#### H.6 `start-ticket`（既存・互換維持）

```markdown
# /start-ticket

## 概要
チケットの実装を開始する。conver ticket start を呼び出す。

## 使い方
/start-ticket <ticket-id>
```

#### H.7 `review-ticket`（既存・互換維持）

```markdown
# /review-ticket

## 概要
チケットのレビューを実行する。conver ticket review を呼び出す。

## 使い方
/review-ticket <ticket-id>
```

#### H.8 `resolve-ticket`（既存・互換維持）

```markdown
# /resolve-ticket

## 概要
チケットを解決済みにする。conver ticket resolve を呼び出す。

## 使い方
/resolve-ticket <ticket-id>
```

#### H.9 `find-omissions-for-next-rfc`（新設）

```markdown
# /find-omissions-for-next-rfc

## 概要
RFCと実装の乖離を検出する。conver rfc omissions を呼び出す。

## 使い方
/find-omissions-for-next-rfc <rfc-root-path>

## 動作
1. conver rfc omissions --rfc <path>
2. Structural Inconsistency: プログラムが機械検出
3. Implementation Missing/Contradiction/Deficiency: Claude Code が検出
4. 結果を OMISSIONS-<round>.json に保存
5. Δ > 0 の場合、収束ループを開始
```

### I. CLI コマンド詳細

#### I.1 `conver rfc grill`

```text
conver rfc grill --research <path> --output <path>
                 [--runtime <backend>] [--display <mode>]

  --research  調査情報のファイルまたはディレクトリ（必須）
  --output    RFC出力先パス（必須）
  --runtime   実行バックエンド（デフォルト: claude-code）
  --display   表示モード（デフォルト: ColorizedCLI）

状態遷移: IDLE → GRILLING → (全ノード解決) → CHECKLIST_PENDING
```

#### I.2 `conver rfc status`

```text
conver rfc status [--rfc-dir <path>]

  --rfc-dir  対象RFCディレクトリ（デフォルト: .）

出力: 現在のワークフロー状態、DesignTree統計、
      乖離関数Δ、収束レポート（ノード別充足度バー表示）
```

#### I.3 `conver rfc checklist generate`

```text
conver rfc checklist generate [--rfc-dir <path>]

  --rfc-dir  対象RFCディレクトリ（デフォルト: .）

出力: CheckList.md
状態遷移: CHECKLIST_PENDING → (承認後) CHECKLIST_APPROVED
```

#### I.4 `conver rfc tree split`

```text
conver rfc tree split --rfc <path>

  --rfc  頂点RFCのパス（必須）

動作: Claude Code が RFC_TREE.json (DAG構造) を出力
      → petgraph 検証 → ディレクトリツリー生成
```

#### I.5 `conver ticket formulate`

```text
conver ticket formulate --rfc-node <path>

  --rfc-node  RFCノードのパス（必須）

動作: Claude Code が Tickets.json 骨格を出力
      → petgraph DAG検証 → トポロジカルソート
      → 詳細フィールド書き込み
```

#### I.6 `conver ticket create`

```text
conver ticket create --title <string> --rfc-node <id>
                     [--depends-on <ids>...]

  --title       チケットタイトル（必須）
  --rfc-node    所属RFCノードID（必須）
  --depends-on  依存チケットID列（任意）
```

#### I.7 `conver ticket plan`

```text
conver ticket plan <ticket-id>

状態遷移: SPECIFIED/PLANNING → PLANNED
```

#### I.8 `conver ticket start`

```text
conver ticket start <ticket-id>

状態遷移: PLANNED → STARTING → STARTED
```

#### I.9 `conver ticket review`

```text
conver ticket review <ticket-id>

状態遷移: STARTED → REVIEWING → REVIEWED
出力: 品質チェック結果、乖離検出
```

#### I.10 `conver ticket resolve`

```text
conver ticket resolve <ticket-id>

状態遷移: REVIEWED → DONE
```

#### I.11 `conver rfc omissions`

```text
conver rfc omissions --rfc <path>

  --rfc  RFCルートパス（必須）

動作: Structural Inconsistency機械検出
      → Claude Code LLM検出 (M/C/U)
      → OMISSIONS-<round>.json 保存
      → Δ計算 → 収束判定
```

#### I.12 `conver malfeasance`

```text
conver malfeasance create --description <string> [--rfc-node <id>] [--ticket <id>]
conver malfeasance resolve <malfeasance-id>
conver malfeasance list [--status open|resolved|all]
conver malfeasance scan

scan サブコマンドは全ソースをスキャンし [::STUB::] マーカーを検出する。
対応: scan-crimes.sh の全機能＋α
```

#### I.13 `conver quality run`

```text
conver quality run [--gate <schema|question|all>]

  --gate  実行する検証ゲート（デフォルト: all）

実行: 改竄検出 → スキーマ検証 → DAG検証 → 品質ゲート
対応: review/run-quality-checks.js
```
