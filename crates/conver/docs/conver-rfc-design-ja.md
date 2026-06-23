# conver RFC: RFC・チケット・レビュー・ワークフローのための決定論的 Rust オーケストレータ

## Abstract

本書は、RFC の grill、チェックリスト生成、チケット管理、malfeasance 追跡、artifact 管理、および review 自動化のために現在用いられている Node.js スクリプト群およびシェルスクリプト群を置き換える、単一バイナリの Rust オーケストレータ **conver** を規定する。[cite:3][cite:10][cite:14] conver は権威的な workflow control plane として設計される。すなわち、状態遷移、durable execution record、checkpoint commit、validation gate、slash command 配布、および Claude Code と将来の互換 backend の runtime coordination を所有する。[cite:3][cite:10][cite:14] 第一目標は、pause、resume、abort、inject-comment、rollback-to-last-checkpoint といった明示的にモデル化された制御点において専門的人間オーバーライドを保持しつつ、機械的決定論性を最大化することである。[cite:3][cite:14]

conver の配備には、埋め込み slash-command corpus、決定論的 command surface、階層 RFC tree model、durable run/checkpoint store、strict structured-output extraction with retry policy、および machine-verifiable workflow gate が含まれる。[cite:3][cite:10] その結果として得られるシステムは、現在の `grill-me-for-rfc`、`tickets`、および `tickets/review` スクリプト群にまたがる execution semantics を標準化しつつ、実行基盤としての外部 Node.js または Python ヘルパースクリプトへの依存を排除する。[cite:3][cite:10]

### Minimal CLI example

```bash
conver init --into /path/to/project/.claude
conver rfc grill --research ./research --output ./rfc/conver.md --runtime claude-code --display tui
```

## Motivation

現在の workflow は、単一で一貫した execution kernel としてではなく、分散した script suite として実装されている。[cite:3][cite:10][cite:14] RFC grilling は `Status.json`、`DesignTree.json`、および `CheckList.md` を persistent coordination artifact として用い、schema validation と session-step derivation を個別スクリプトへ委譲している。[cite:10][cite:14] Ticketing、artifact management、frontmatter update、malfeasance bookkeeping、および review check もまた多数の script entrypoint に分解されており、shared hidden library を伴うため、運用上の能力は高い一方で、authority、error handling、および restart semantics が runtime とファイルにまたがって分裂している。[cite:20][cite:21][cite:23][cite:24][cite:25][cite:26][cite:27][cite:29][cite:30][cite:31][cite:32][cite:33][cite:34][cite:35][cite:36][cite:37]

現在の grilling flow は、すでに強く機械的なプロセスを前提としている。引数は canonical variable に束縛され、mutating step の後には schema validation が必須であり、grill 質問はユーザーに提示される前に validation gate を通過しなければならず、session progression は state と未解決 design node から導出される。[cite:3][cite:10][cite:14][cite:18] この既存の規律は、workflow がすでに形式的 state machine に近いことを示している。欠けているのは、重要な遷移を独立した script 群に外部委譲するのではなく、全 operational semantics を所有する単一実装である。[cite:3][cite:14]

現在の設計には、interruption、durable restart、および runtime abstraction の統一モデルも欠けている。[cite:3][cite:14] ユーザーは、long-running loop は checkpoint-based continuation により shutdown をまたいで生き残らなければならず、定期 progress report は設定された threshold に達した際に soft または hard pause を強制し得て、stop semantics は runtime の force-kill ではなく cooperative でなければならないと確定した。[cite:3] これらの要求は、commit、rollback、output validity、および human・orchestrator・runtime backend 間の control handoff の定義を変更するため、後付けでは扱えない。[cite:3][cite:14]

最後に、現在のシステムには複数の textual authority が存在する。すなわち、slash command、script behavior、および human intent である。[cite:3] ユーザーは、RFC text と、その RFC から抽出された machine-extracted structural constraint model が together して最上位 authority を形成し、slash-command body は subordinate executable template になる、というより厳密なモデルを確定した。[cite:3] conver は、この hierarchy を executable にするために存在する。

### Before/after operational contrast

```bash
# Before
node .claude/scripts/grill-me-for-rfc/init.js "$RESEARCH_PATH" "$RFC_OUTPUT_PATH"
node .claude/scripts/grill-me-for-rfc/update-tree.js "$RFC_DIR" add '{...}'
node .claude/scripts/grill-me-for-rfc/session-status.js "$RFC_DIR"
node .claude/scripts/grill-me-for-rfc/generate-checklist.js "$RFC_DIR"

# After
conver rfc grill --research "$RESEARCH_PATH" --output "$RFC_OUTPUT_PATH"
conver rfc status --rfc-dir "$RFC_DIR"
conver rfc checklist generate --rfc-dir "$RFC_DIR"
```

## Design

### System model

conver は唯一の workflow control plane である。Human operator は command を開始し、明示的にモデル化された action を通じてのみ介入できる。Runtime backend は境界づけられた execution work を担う。Persistent store は canonical workflow state、tree、ticket、ledger、artifact、および checkpoint を記録する。Readable な Markdown および JSON file は user-facing artifact surface の一部として残るが、workflow state を遷移させてよい唯一の component は orchestrator である。[cite:3][cite:10][cite:14]

システムは以下の logical subsystem から構成される。

| Subsystem | Responsibility |
|---|---|
| CLI layer | Command を parse し、settings を resolve し、path を bind し、runtime を select し、domain handler へ route する。 |
| Workflow core | State machine、transition rule、validation order、pause/resume semantics、および authority resolution を所有する。 |
| Runtime adapter | Backend run を開始し、event を stream し、cooperative cancel を要求し、completion を await し、strict structured payload を抽出する。 |
| Persistence layer | RFC tree、DesignTree、run record、checkpoint、ticket、manifest、および derived index を保存する。 |
| Projection layer | Canonical state から Markdown、JSON、および slash-command file を materialize する。 |
| Validation layer | Schema gate、question-format gate、quality gate、および completion gate を強制する。 |

#### Core responsibility boundary

```rust
pub trait WorkflowController {
    fn execute(&mut self, request: WorkflowRequest) -> Result<WorkflowResult, WorkflowError>;
    fn resume(&mut self, run_id: RunId) -> Result<WorkflowResult, WorkflowError>;
    fn interrupt(&mut self, run_id: RunId, action: UserAction) -> Result<(), WorkflowError>;
}
```

### Authority model

conver における最高 authority は、RFC text と、その RFC から導出された machine-extracted structural constraint model の組である。[cite:3] Slash-command source text、compatibility command alias、および runtime prompt は、この高次仕様の subordinate executable projection である。[cite:3] もし slash-command body が RFC あるいは machine-extracted structural constraint model と conflict する場合、conver はその slash-command body を追従してはならず、invalid とみなして regenerate または reject しなければならない。[cite:3]

したがって authority stack は strict かつ total である。

1. RFC text.
2. Machine-extracted structural constraint model.
3. Canonical conver command semantics.
4. Generated slash-command bodies.
5. Runtime-specific invocation payloads.

#### Authority resolver sketch

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

### Resource model

現在の grilling workflow は、`Status.json`、`DesignTree.json`、および `CheckList.md` という 3 つの persistent artifact を既に定義しており、それらに mandatory schema validation を課している。[cite:10] conver は、それら artifact の可視性上の利点を保持しつつ、より強い canonical data model を導入する。Machine-facing state は canonical structured form に格納されなければならない。Human-facing Markdown および JSON file は、その state から投影されてもよく、backwards-compatible workflow のためには、既存の inspection habit を保つよう継続して出力されるべきである。[cite:3][cite:10]

Resource graph は次の通りである。

- RFC tree root.
- RFC node directory.
- RFC document.
- DesignTree projection.
- Checklist projection.
- Ticket record.
- Artifact record.
- Malfeasance ledger.
- Run record.
- Checkpoint record.
- Embedded slash-command manifest.

#### Canonical RFC tree JSON example

```json
{
  "version": 1,
  "root_rfc_id": "rfc-conver",
  "updated_at": "2026-06-23T13:01:00+09:00",
  "nodes": [
    {
      "id": "rfc-conver",
      "title": "conver RFC",
      "path": "./rfc/conver",
      "status": "draft",
      "children": []
    }
  ]
}
```

### RFC tree and directory synchronization

ユーザーは、`RFC_TREE.json` が source of truth であり、filesystem layout はそれから同期されなければならず、逆ではないと確定した。[cite:3] したがって conver は、canonical tree を parse し、意図された filesystem shape を計算し、drift を検出し、directory tree を canonical graph に一致するよう repair する、一方向 reconciliation loop を実装しなければならない。[cite:3] 宣言されていない local filesystem edit は drift とみなされ、policy に応じて archive、quarantine、または report されてもよいが、canonical tree を黙って上書きしてはならない。

各 RFC node は専用 directory に対応しなければならない。Tree root は全体 RFC tree manifest を保持し、child node は recursive に nested されるか、宣言された relative path により参照されなければならない。この model は、全体 graph の可視性を保ちつつ、各 node が独立に実装可能単位として機能できるというユーザー要求を満たす。[cite:3]

#### Synchronization sketch

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RfcTreeNode {
    pub id: String,
    pub title: String,
    pub path: PathBuf,
    pub status: RfcNodeStatus,
    pub children: Vec<RfcTreeNode>,
}

pub fn sync_tree_to_fs(root: &RfcTreeNode, fs: &dyn FileSystem) -> Result<(), SyncError> {
    fs.ensure_dir(&root.path)?;
    for child in &root.children {
        fs.ensure_dir(&child.path)?;
        sync_tree_to_fs(child, fs)?;
    }
    Ok(())
}
```

### DesignTree governance

grilling 中、`DesignTree.json` は first-class coverage-management medium である。[cite:3] 現在の script は、DesignTree が numeric `version`、timestamped `updatedAt`、recursive node array、unique ID、`open|resolved` status value、question record、および child array を持つことを検証している。[cite:10] conver は、今回のセッションでユーザーが確定した governance model に合わせて、`kind`、`blocking`、`depends_on`、および `covered_by_question_ids` といった field を各 node に追加しつつ、これらの invariant を保持しなければならない。[cite:3]

grill session は、blocking node が resolved になっただけでは終了してはならない。ユーザーは、RFC writing 開始前にすべての open node が 0 でなければならないという、より厳しい条件を確定した。[cite:14] したがって conver は、grill completeness を「critical node の部分集合」ではなく、全 unresolved count から計算しなければならない。

#### Extended DesignTree node example

```json
{
  "id": "runtime-abstraction-and-streaming",
  "title": "実行ランタイム抽象化・リアルタイム表示・出力境界",
  "status": "resolved",
  "kind": "decision-group",
  "blocking": true,
  "depends_on": [],
  "covered_by_question_ids": ["Q8", "Q9"],
  "questions": [
    {
      "resolvedAt": "2026-06-23T12:32:00+09:00",
      "answer": "Claude Code をデフォルト runtime としつつ trait 抽象化。"
    }
  ],
  "children": []
}
```

#### Open-count derivation sketch

```rust
pub fn count_open(nodes: &[DesignNode]) -> usize {
    nodes.iter()
        .map(|n| usize::from(n.status == DesignStatus::Open) + count_open(&n.children))
        .sum()
}
```

### Ticket and ledger model

添付された ticket script 群は、spec file、frontmatter update、ticket creation と resolution、artifact read/write、queue/status mutation、および review-time structural check を中心とする workflow を示している。[cite:21][cite:26][cite:27][cite:29][cite:30][cite:31][cite:32][cite:33][cite:34][cite:35][cite:36][cite:37] Shared hidden library の存在は、これら visible script が孤立ツールではなく、共通 domain logic の façade であることを示している。[cite:20][cite:21][cite:23][cite:24][cite:25][cite:26][cite:27][cite:29][cite:30][cite:31][cite:32][cite:33][cite:34][cite:35][cite:36]

conver は、ticket を stable ID、lifecycle state、artifact association、および RFC graph への link を持つ canonical record として reify しなければならない。現在の file/frontmatter model は projection または import surface として残ってよいが、deterministic scheduling、query、filtering、および DAG expansion を可能にするため、canonical representation は正規化されるべきである。Malfeasance record に対しても同様である。現在の script は、versioned record と open、resolved、false positive といった state transition を持つ明示的 JSON ledger を示している。[cite:23][cite:24][cite:25] conver は、malfeasance を RFC、ticket、または subgraph scope への明示 ownership reference を持つ first-class ledger domain としてモデル化しなければならない。

#### Ticket record sketch

```rust
pub struct TicketRecord {
    pub id: TicketId,
    pub title: String,
    pub status: TicketStatus,
    pub spec_path: PathBuf,
    pub artifact_ids: Vec<ArtifactId>,
    pub rfc_node_id: Option<String>,
    pub depends_on: Vec<TicketId>,
}
```

### Command surface

Public conver command surface は、script-name-oriented ではなく domain-oriented である。ユーザーは、external API family を `conver rfc`、`conver ticket`、`conver malfeasance`、`conver quality`、`conver runtime`、および `conver init` として固定し、legacy script-shaped invocation のために `conver cmd ...` を compatibility layer として保持すると確定した。[cite:3] この分割は、将来方向の明快さと migration の現実性を両立する。

#### Top-level CLI skeleton

```rust
#[derive(clap::Subcommand, Debug)]
pub enum Command {
    Init(InitCommand),
    Rfc(RfcCommand),
    Ticket(TicketCommand),
    Malfeasance(MalfeasanceCommand),
    Quality(QualityCommand),
    Runtime(RuntimeCommand),
    Cmd(CompatCommand),
}
```

#### Compatibility command skeleton

```rust
#[derive(clap::Subcommand, Debug)]
pub enum CompatCommand {
    GrillMeForRfc(CompatGrillCommand),
    Tickets(CompatTicketsCommand),
    Review(CompatReviewCommand),
}
```

### Naming and distribution

Tool name は `conver` で固定されている。[cite:3] Slash command は separate source-of-truth asset ではなく、`conver init into=/path/to/.claude` により配布される embedded binary resource である。[cite:3] ユーザーはさらに、full command body を binary 内に完全保持し、manifest-driven diff process により install する方針を確定しており、既存 Node/Python helper script へ execution substrate を委譲してはならない。[cite:3]

この設計は、次の 3 つの operational benefit をもたらす。

- Binary semantics と installed slash-command text の version coherence。
- Deployed command body の cryptographic verification。
- Higher-level RFC authority が変更された際の deterministic regeneration。

#### Embedded asset model sketch

```rust
pub struct EmbeddedAsset {
    pub logical_name: String,
    pub relative_path: PathBuf,
    pub bytes: &'static [u8],
    pub sha256: String,
    pub asset_kind: AssetKind,
}
```

### Init manifest and upgrade policy

ユーザーは、`logical_name`、`relative_path`、`sha256`、`asset_kind`、`version`、`installed_by`、`updated_at` に加え、dependency relation、compatible runtime declaration、および build provenance を含む詳細 manifest shape を確定した。[cite:3] conver は installation manifest を target environment に書き出し、それを用いて idempotent update を計算しなければならない。Local file が last installed digest から diverge している場合、policy engine は preserve-and-suffix、reject-and-report、または overwrite-if-forced のような明示 conflict rule を適用しなければならない。

#### Manifest JSON example

```json
{
  "version": 1,
  "installed_by": "conver 0.1.0",
  "updated_at": "2026-06-23T13:01:00+09:00",
  "assets": [
    {
      "logical_name": "grill-me-for-rfc",
      "relative_path": ".claude/commands/grill-me-for-rfc.md",
      "sha256": "abc123...",
      "asset_kind": "slash_command",
      "version": "0.1.0",
      "compatible_runtimes": ["claude-code"],
      "dependencies": [],
      "build_info": { "git_rev": "deadbeef" }
    }
  ]
}
```

#### Upgrade decision sketch

```rust
pub fn should_update(installed: &ManifestAsset, embedded: &EmbeddedAsset) -> UpdateDecision {
    if installed.sha256 == embedded.sha256 {
        UpdateDecision::NoChange
    } else {
        UpdateDecision::NeedsUpdate
    }
}
```

### Runtime abstraction and streaming

Runtime abstraction は、backend-specific invocation mechanic から conver を隔離しつつ、共通 control model を保持しなければならない。[cite:3] ユーザーは、Claude Code backend を default としつつ、将来 backend のために trait-based abstraction を要求した。[cite:3] Runtime session boundary には、run creation、live event streaming、cooperative cancellation、completion waiting、および terminal output から strict structured payload を抽出する処理が含まれる。[cite:3]

#### Runtime traits

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
```

### Execution semantics

Checkpoint は唯一の durable continuation boundary である。[cite:3] ユーザーは、その正確な意味を固定した。すなわち checkpoint は、structured output が valid であり、設定されたすべての validation gate を通過し、対応する state/file mutation がすべて成功裏に完了した後にのみ committed となる。[cite:3] それ以前に生成されたものはすべて non-authoritative であり、tentative として扱われなければならない。

このことから、以下の semantic rule が導かれる。

- Checkpoint commit 前に stream された runtime text は observational であり、authoritative ではない。
- Structured payload extraction failure は partial commit ではなく retry policy を trigger する。[cite:3]
- Commit 前の user interruption は non-authoritative output を破棄し、last committed checkpoint に revert する。[cite:3]
- Workflow transition は conver が commit した後にのみ発生する。

#### Checkpoint commit sketch

```rust
pub fn commit_checkpoint(ctx: &mut WorkflowContext, payload: StructuredPayload) -> Result<CheckpointId, CommitError> {
    validate_structured_payload(&payload)?;
    run_validation_gates(ctx, &payload)?;
    apply_state_mutations(ctx, &payload)?;
    let checkpoint = persist_checkpoint(ctx, payload)?;
    Ok(checkpoint.id)
}
```

### Suspend, resume, and durable runs

ユーザーは、long-running execution は PC shutdown をまたいで survive しなければならず、replay は arbitrary textual summary からではなく、last durable checkpoint から restart されなければならないと固定した。[cite:3] したがって conver は、少なくとも `run_id`、`command`、`args`、`runtime`、`checkpoint_id`、`checkpoint_state`、`pending_user_action`、`retry_counters`、および `latest_json_excerpt` を含む run record を persist しなければならない。[cite:3] Resume operation は、その record を reload し、committed checkpoint から workflow state を reconstruct し、runtime adapter に対して structured `resume_from_checkpoint` instruction を発行しなければならない。[cite:3]

#### Run record sketch

```json
{
  "run_id": "run_20260623_130100_001",
  "command": "rfc grill",
  "args": ["--research", "./research", "--output", "./rfc/conver.md"],
  "runtime": "claude-code",
  "checkpoint_id": "cp_0007",
  "checkpoint_state": "awaiting_user_review",
  "pending_user_action": "resume",
  "retry_counters": { "structured_output": 1 },
  "latest_json_excerpt": "{\"next_step\":\"ask_q29\"}"
}
```

#### Resume request sketch

```json
{
  "type": "resume_from_checkpoint",
  "checkpoint_id": "cp_0007",
  "committed_state": "awaiting_user_review",
  "discarded_uncommitted_output": true,
  "next_required_action": "continue_from_step_3"
}
```

### JSON retry policy

ユーザーは、structured-output extraction attempt の default retry ceiling を 3 に固定し、settings により設定可能であるとした。[cite:3] 各 retry は、concrete failure reason、期待 schema または sentinel format、および concise issue summary を返さなければならない。Final retry では conver は reformat-only mode に入り、新しい reasoning を禁止し、構造補正のみを要求しなければならない。[cite:3] すべての retry に失敗した場合、result は auditability のため `failed_structured_output` として記録されなければならない。[cite:3]

#### Retry loop sketch

```rust
pub fn retry_extract_json(extractor: &dyn StructuredPayloadExtractor, output: &str, limit: usize) -> Result<StructuredPayload, RetryError> {
    for attempt in 1..=limit {
        match extractor.extract_structured_payload(output) {
            Ok(payload) => return Ok(payload),
            Err(err) if attempt < limit => continue,
            Err(err) => return Err(RetryError::Exhausted(err)),
        }
    }
    unreachable!()
}
```

### User interrupt and comment injection

ユーザーは、stop 後の formal operation として `resume`、`abort`、`inject-comment`、および `rollback-to-last-checkpoint` の 4 つを固定した。[cite:3] また、stop semantics は cooperative cancel only であり、force-kill は許可されないと確定した。[cite:3] したがって conver は、runtime session に cancel request を送信し、cooperative acknowledgement または terminal completion のいずれかを待ち、last committed checkpoint を唯一の recovery anchor として保持しなければならない。

この model では、human intervention は primary operating mode ではなく exception-handling pathway として位置づけられる。Operator は runtime が目に見えて逸脱した場合に interrupt してよいが、system は ad hoc state edit なしで定義可能でなければならない。[cite:3]

#### User action model sketch

```rust
pub enum UserAction {
    Resume,
    Abort,
    InjectComment { text: String },
    RollbackToLastCheckpoint,
    Stop,
}
```

#### Cooperative cancel transition sketch

```rust
pub fn request_stop(session: &mut dyn RuntimeSession) -> Result<InterruptState, RuntimeError> {
    session.cancel()?;
    Ok(InterruptState::CancelRequested)
}
```

### Configuration model

ユーザーは、`built-in defaults < global config < project config < -f config < CLI flags` という precedence chain を確定した。[cite:3] conver は、その正確な順序で layered configuration merge を実装しなければならない。Unknown key は strict mode で reject されてもよいが、default behavior は malformed structure を reject しつつ、schema version により宣言された場合に限って forward-compatible additive versioning を許容すべきである。

ユーザーはさらに、configuration を `runtime`、`ui`、`retry`、`resume`、`report`、`paths`、`install`、および `quality` section に grouping することを確定した。[cite:3] この grouping は conver の subsystem decomposition と直接対応し、untyped flat key namespace を回避する。

#### Settings struct sketch

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
}
```

#### Settings JSON example

```json
{
  "runtime": { "backend": "claude-code" },
  "ui": { "display_mode": "tui" },
  "retry": { "structured_output_limit": 3 },
  "resume": { "policy": "checkpoint_only" },
  "report": {
    "pause_mode": "hard",
    "checkpoint_interval": 5,
    "ticket_completion_interval": 10
  },
  "paths": { "workspace_root": "." },
  "install": { "conflict_policy": "preserve_and_suffix" },
  "quality": { "require_schema_gates": true }
}
```

### Reporting and pause policy

ユーザーは、checkpoint 数および ticket completion 数に基づく strict reporting threshold を system がサポートし、設定に応じて passive notification ではなく report 後に pause し得ることを確定した。[cite:3] したがって conver は、run ごとの monotonic counter を維持し、checkpoint commit のたび、および ticket の terminal transition のたびに pause policy を評価しなければならない。

2 種類の pause mode をサポートしなければならない。

- `soft`: report を出力し、自動的に継続する。
- `hard`: report を出力し、明示的 continuation が与えられるまで `awaiting_user_resume` へ遷移する。

#### Pause policy sketch

```rust
pub fn evaluate_report_pause(policy: &ReportSettings, counters: &RunCounters) -> Option<PauseReason> {
    if counters.checkpoints % policy.checkpoint_interval == 0 {
        return Some(PauseReason::CheckpointThreshold);
    }
    if counters.tickets_completed % policy.ticket_completion_interval == 0 {
        return Some(PauseReason::TicketThreshold);
    }
    None
}
```

### Display mode selection

ユーザーは、display mode は run start 時に明示的に選択され、実行中に auto-switch してはならないと確定した。[cite:3] したがって conver は `tui`、`colorized-cli`、および `plain` を startup mode としてのみ公開しなければならない。Terminal resize や backend verbosity のような runtime condition は rendering detail に影響してよいが、選択された display class 自体を変更してはならない。

#### Display mode model sketch

```rust
pub enum DisplayMode {
    Tui,
    ColorizedCli,
    Plain,
}
```

### Quality and governance

現在の workflow は、mutating script 後の schema gate と、grill 質問提示前の question-format gate を要求している。[cite:3][cite:10][cite:18] Session progression は current state と DesignTree open-count から導出される。[cite:14] conver は、これら gate を first-class validation stage として internalize しなければならない。

最低限 mandatory な gate は次の通りである。

- RFC grilling artifact に対する state/schema validation。[cite:10]
- Grill prompt に対する question-format validation。[cite:18]
- Ticket workflow に対する ticket structure および quality review validation。[cite:33][cite:35][cite:36]
- Resolved DesignTree、completed checklist、および RFC text 中の forbidden placeholder 0 件を要求する completion gate。[cite:3][cite:14]

#### Grill completion derivation sketch

```rust
pub fn can_finish_grill(status: &StatusRecord, design_tree: &DesignTree) -> bool {
    status.state == WorkflowState::Grilling && count_open(&design_tree.nodes) == 0
}
```

## Implementation

### Module layout

実装は、legacy script name 単位ではなく domain module 単位に編成されなければならない。Reference layout は次の通りである。

```text
crates/
  conver-cli/
  conver-core/
  conver-runtime/
  conver-storage/
  conver-projection/
  conver-validation/
  conver-compat/
```

`conver-cli` は command parsing と top-level process startup を担う。`conver-core` は workflow、state machine、policy evaluation、および transition を担う。`conver-runtime` は Claude Code などの backend adapter を担う。`conver-storage` は JSON/SQLite persistence を担う。`conver-projection` は Markdown、slash-command file、および compatibility artifact の生成を担う。`conver-validation` は schema/quality gate を担う。`conver-compat` は legacy command alias と argument translation を担う。

### CLI implementation strategy

CLI parser は domain command を strongly typed request object へ写像しなければならない。Request は settings resolution、path canonicalization、policy derivation、runtime selection、および transaction-scoped execution を経由しなければならない。`conver cmd` を通じた legacy command invocation は、それ以降の処理に入る前に canonical request object へ変換されなければならず、実装経路は 1 本でなければならない。

#### Canonical request sketch

```rust
pub enum WorkflowRequest {
    GrillRfc(GrillRfcRequest),
    GenerateChecklist(GenerateChecklistRequest),
    CreateTicket(CreateTicketRequest),
    ResolveTicket(ResolveTicketRequest),
    RunQualityChecks(RunQualityChecksRequest),
}
```

### Runtime adapter implementation

Claude Code adapter は runtime trait を実装し、transport detail から独立した normalized event model を公開しなければならない。Streaming output は observational event と terminal candidate payload に partition されなければならない。Adapter 自身は workflow state を commit してはならず、workflow core に event と terminal result を提供するだけでなければならない。

#### Event model sketch

```rust
pub enum RuntimeEvent {
    StdoutChunk(String),
    StderrChunk(String),
    StructuredCandidate(String),
    Progress { message: String },
    Completed,
}
```

### Persistence implementation

ユーザーの現在の system は file-centric であるため、conver は canonical JSON record を materialize する file-backed persistence mode をサポートすべきである。[cite:10] しかし、ticket と DAG scheduling は normalized index から大きく恩恵を受けるため、conver は ticket、ledger、および checkpoint domain に対して、特に SQLite-backed canonical mode も定義すべきである。[cite:20][cite:21][cite:23][cite:24][cite:25][cite:26][cite:31][cite:34]

Storage layer は、flat file backend であっても core に対して transaction semantic を公開しなければならない。File mode では、write-temp、fsync、rename、および commit journal 技法により transaction を実現できる。SQLite mode では、標準 ACID transaction で十分である。

### Validation implementation

現在の `check-all-schema.js` は、必須 Status field、DesignTree structure、および checklist heading の存在を検証している。[cite:10] 現在の `validate-question-format.js` は、question ID の存在、reasoning/background、closed answerability、non-open-endedness、line-separated option、および explicit recommendation text を強制している。[cite:18] conver は、RFC 定義によりより厳しい rule が上書きされない限り、これらの behavior を Rust validator へ port し、その semantic を保持しなければならない。[cite:10][cite:18]

#### Validator trait sketch

```rust
pub trait Validator<T> {
    fn validate(&self, target: &T) -> Result<(), ValidationErrors>;
}
```

### Install and upgrade implementation

Installer は embedded asset を iterate し、manifest entry と比較し、conflict policy を適用しなければならない。Asset は atomically に書き込まれなければならない。Installer は installation provenance を記録すべきであり、後続 audit がどの conver build がどの slash-command revision を書き込んだかを追跡できるようにすべきである。

### Compatibility implementation

各 visible legacy entrypoint は、documented canonical command に対応づけられなければならない。例を挙げる。

| Legacy script | Canonical conver command |
|---|---|
| `init.js` | `conver rfc init` |
| `session-status.js` | `conver rfc status` |
| `generate-checklist.js` | `conver rfc checklist generate` |
| `create-ticket.js` | `conver ticket create` |
| `resolve-ticket.js` | `conver ticket resolve` |
| `run-quality-checks.js` | `conver quality run` |

この compatibility mapping は explicit かつ finite であるべきである。Rust wrapper の下で旧 script-oriented architecture を再導入するような hidden reflection layer へ変質してはならない。

### Testing strategy

実装には、次を含めなければならない。

- State transition rule、authority resolution、retry ceiling、および pause threshold に対する unit test。
- Tree synchronization および config merge precedence に対する property test。
- 現在の session-state step model から導出される grill → checklist → writing → review → done の full flow に対する integration test。[cite:14]
- Markdown および JSON projection に対する golden test。
- 現在の script behavior から import した fixture に対する regression test。[cite:10][cite:18][cite:36]

#### Example transition test

```rust
#[test]
fn grill_finishes_only_when_open_count_is_zero() {
    let status = StatusRecord::grilling();
    let tree = DesignTree::with_nodes(vec![DesignNode::resolved("n1")]);
    assert!(can_finish_grill(&status, &tree));
}
```

## Appendix

### Workflow state model

現在の state machine は、`GRILLING`、`CHECKLIST_PENDING`、`CHECKLIST_APPROVED`、`WRITING`、`REVIEWING`、および `DONE` を valid workflow state として認識している。[cite:10] Session status は、state と DesignTree open-count から current operational step を導出し、その中には「grill 完了、checklist 遷移待ち」の専用 step と、review loop が 3 を超えた際の warning も含まれる。[cite:14] conver は、internal enum が Rust 的 naming convention を使うとしても、projection layer においては compatibility のためこれら state name を保持しなければならない。[cite:10][cite:14]

```rust
pub enum WorkflowState {
    Grilling,
    ChecklistPending,
    ChecklistApproved,
    Writing,
    Reviewing,
    Done,
}
```

### DesignTree projection constraints

現在の schema は以下を要求する。

- `version` は numeric かつ 1 以上であること。[cite:10]
- `updatedAt` は parseable date であること。[cite:10]
- `nodes` は array であること。[cite:10]
- Recursive node set 全体で string ID が unique であること。[cite:10]
- `status` は `open|resolved` に属すること。[cite:10]
- `questions` array の要素は `resolvedAt` と `answer` を持つこと。[cite:10]
- `children` は array であること。[cite:10]

これらの constraint は、human-facing projection compatibility のため今後も有効であり続けなければならない。

### Checklist projection constraints

現在の checklist validator は、`# RFC 要件チェックリスト` という heading の存在を要求する。[cite:10] また grilling command は、grill 完了後に checklist を生成し、その後 approval 前に visual review と supplement を行うことを要求している。[cite:3] したがって conver は heading を正確に生成しなければならず、approval 前の post-generation enrichment stage も保持しなければならない。[cite:10][cite:3]

### Question-format constraints

現在の grill-question constraint には、`Q<number>` identifier、十分な reasoning/background、Yes/No または A/B/C による closed answerability、open-ended prompt の禁止、line-separated option、および option list 後の explicit recommendation が含まれる。[cite:18] conver は、RFC が明示的に改訂しない限り、grill-mode question generation に対してこれらの constraint を保持しなければならない。[cite:18]

### Example complete settings file

```json
{
  "runtime": {
    "backend": "claude-code",
    "request_timeout_seconds": 1800
  },
  "ui": {
    "display_mode": "tui",
    "color": true
  },
  "retry": {
    "structured_output_limit": 3,
    "final_mode": "reformat_only"
  },
  "resume": {
    "policy": "checkpoint_only",
    "discard_uncommitted_output": true
  },
  "report": {
    "pause_mode": "hard",
    "checkpoint_interval": 5,
    "ticket_completion_interval": 10
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
  }
}
```

### Completion criteria

Grilling command は、すべての DesignTree node が resolved であり、すべての checklist item が complete であり、かつ RFC body に TBD、TODO、stub、または delegation placeholder が 0 件である場合にのみ RFC completion を宣言できると規定している。[cite:3] conver は、これらを RFC workflow の mandatory completion gate として扱わなければならない。[cite:3]
