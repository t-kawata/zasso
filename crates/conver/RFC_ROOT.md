# conver: 自律収束開発オーケストレータ

## Abstract

conver は「人間が情報収集と grill による徹底的な RFC 策定に集中し続けられる状況を作る」
ための自律収束開発オーケストレータである。

```bash
conver loop --rfc ./RFC_ROOT.md --docs ./research
```

この1コマンドで二層の自己収束ループが開始される。slah-command を自律連鎖実行し、
Rust は順序制御・DAG 検証・乖離計算・可視化のみを行う。Claude Code は全知的作業
（grill・RFC 分解・実装・レビュー）をスラッシュコマンド経由で自律実行する。

conver は Claude Code の代替ではなく、**Claude Code を何度も呼び出す制御装置**
である。Rust は「思考」しない。

本RFCを実装した単一crateが `crates/conver/` である。実装は以下の7モジュールで構成される。

| モジュール | 内容 |
|-----------|------|
| `main.rs` | CLIエントリポイント |
| `loop.rs` | LoopController・LoopPhase・ループ制御 |
| `dag.rs` | petgraph DAG検証 |
| `deviation.rs` | 乖離関数Δ計算 |
| `storage.rs` | FileBackend・AtomicWriter・Sha256改竄検出・Checkpoint |
| `report.rs` | ConvergenceReporter（収束レポート・50マス充足度バー） |
| `settings.rs` | Settings構造体（5セクション7フィールド） |

## Motivation

### 背景

現在の開発ワークフローでは、人間が Claude Code に `/grill-me-for-rfc` を手動で
実行し、grill 完了後に `/grill-me-to-split-rfc-as-tree` を実行し、さらに
`/formulate-tickets`、`/start-ticket`、`/review-ticket`、`/find-omissions-for-next-rfc`
と個別に実行している。この連鎖を人間が手動で管理しているため：

1. **中断と再開が手動**: 長時間の開発中に PC をシャットダウンすると、どのフェーズの
   どこまで進んだかを人間が覚えて再開する必要がある。
2. **ループ管理が手動**: 乖離（omissions）が検出されたとき、どのフェーズに戻って
   再実行すべきかの判断と実行を人間が行っている。
3. **収束の可視化がない**: 仕様空間と実装空間の距離が縮まっているかどうかを
   人間が主観で判断している。

### 達成目標

- **1コマンド起動**: `conver loop --rfc --docs` で全開発ループを自律実行する
- **二層自己収束**: 大域収束（Phase 1→7）と局所収束（チケットリトライ）を自動反復
- **耐障害性**: PC シャットダウン後も同一コマンド再実行で resume
- **形式的完了**: 乖離関数 Δ = 0 を唯一の完成条件とする
- **可視化**: 収束の様子（Δ推移・ノード別充足度）を 50 マスバーで表示する
- **ACP 経由実行**: Claude Code との全通信を Agent Client Protocol で標準化する

### 原則：Rust は思考しない

| 層 | 担当 | 実装 |
|----|------|------|
| 知的作業 | grill・RFC分解・実装・レビュー・乖離の意味的分析 | Claude Code（スラッシュコマンド） |
| 機械的検証 | DAG循環チェック・SHA-256改竄検出・Δ計算 | Rust |
| 制御 | 順序・ループ・リトライ・checkpoint | Rust |
| 可視化 | Δ推移グラフ・充足度バー | Rust |
| 補助スクリプト | スキーマ検証・質問フォーマット検証・STUBスキャン | nodejs/sh（conver init で展開） |

## Design

### 1. システム構造

```text
crates/conver/
├── Cargo.toml
├── RFC_ROOT.md                # 本ファイル（頂点RFC）
├── RFC_TREE.json              # DAG構造（SHA-256内蔵）
├── Status.json                # ループ状態
├── round_log.jsonl            # 観測ベクトル時系列
├── settings.json              # 設定（5セクション7フィールド）
├── OMISSIONS-<N>.json         # 乖離レコード
└── src/
    ├── main.rs                # エントリポイント
    ├── loop.rs                # LoopController・LoopPhase
    ├── dag.rs                 # petgraph DAG検証
    ├── deviation.rs           # 乖離関数Δ計算
    ├── storage.rs             # FileBackend・AtomicWriter・SHA-256・Checkpoint
    ├── report.rs              # ConvergenceReporter
    └── settings.rs            # Settings
```

### 2. 設定モデル

最小限の5セクション7フィールド。

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub runtime: RuntimeSettings,
    pub retry: RetrySettings,
    pub report: ReportSettings,
    pub deviation: DeviationSettings,
    pub paths: PathSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSettings   { pub backend: String } // "acp"

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetrySettings     { pub ticket_retry_limit: u32 } // 3

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportSettings    { pub convergence_loop_limit: u32 } // 3

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviationSettings {
    pub alpha: f64,  // 2.0
    pub beta: f64,   // 2.0
    pub gamma: f64,  // 1.0
    pub delta: f64,  // 1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathSettings { pub workspace_root: String } // "."
```

### 3. CLI コマンド

```rust
#[derive(clap::Subcommand)]
pub enum Command {
    /// 開発ループ開始
    Loop {
        #[arg(long)] rfc: PathBuf,
        #[arg(long)] docs: PathBuf,
    },
    /// ループ状態表示
    Status,
    /// ループ強制停止
    Abort,
    /// 機械的処理（スラッシュコマンドMarkdown内から呼び出される）
    #[command(subcommand, hide = true)]
    Cmd(CmdCommand),
}

/// スラッシュコマンドMarkdownから呼び出される機械的処理。
/// 各サブコマンドは conver なしでもスラッシュコマンドが機能するよう、
/// フォールバック処理と共にMarkdown内に記述される。
#[derive(clap::Subcommand)]
pub enum CmdCommand {
    /// DAG検証: RFC_TREE.jsonの循環・矛盾をpetgraphで検証
    ValidateDag { path: PathBuf },
    /// 乖離計算: OMISSIONS-<N>.jsonからΔ = αM+βC+γU+δXを計算
    ComputeDeviation { path: PathBuf },
    /// 改竄検出: ファイルのSHA-256ハッシュを照合
    CheckTamper { path: PathBuf },
}
```

### 4. ACP クライアント

conver と Claude Code の全通信は ACP（Agent Client Protocol）で行う。
ACP は JSON-RPC over stdio で、`session/prompt` により multi-turn 対話を
標準サポートする。

ACP クライアントの実装には既存のオープンソース crate
`claude-code-acp-rs`（<https://github.com/soddygo/claude-code-acp-rs>）を使用する。

```toml
# Cargo.toml
[dependencies]
claude-code-acp = { git = "https://github.com/soddygo/claude-code-acp-rs" }
```

この crate が提供する主な機能：

- `AcpClient::connect()` — ACP エージェントとの接続を確立
- `client.session.new(cwd)` — 新規セッション開始
- `client.session.load(id)` — 既存セッション再開（resume）
- `client.session.prompt(message)` — プロンプト送信（応答をストリームで受信）

`conver` 側の `prompt()` 呼び出し：

```rust
use claude_code_acp::AcpClient;

impl LoopController {
    async fn prompt_slash_command(&mut self, cmd: &str) -> Result<(), LoopError> {
        self.acp_client.session.prompt(cmd).await
            .map_err(|e| LoopError::AcpError(e.to_string()))?;
        Ok(())
    }
}
```

### 5. ループ実行エンジン（LoopController）

```rust
// conver-core/src/loop_controller.rs

pub enum LoopPhase {
    Grill,              // Phase 1: /grill-me-for-rfc
    TreeSplit,          // Phase 2: /grill-me-to-split-rfc-as-tree
    TicketFormulate,    // Phase 3: /formulate-tickets（全RFCノードに繰り返し）
    TicketExecute,      // Phase 4: /start-ticket → /review-ticket（第二層ループ）
    OmissionDetect,     // Phase 6: /find-omissions-for-next-rfc + Δ計算
    ConvergenceCheck,   // Phase 7: Δ判定・フィードバック先決定
    Done,
}

pub struct LoopController {
    phase: LoopPhase,
    rfc_path: PathBuf,
    docs_path: PathBuf,
    acp: AcpClient,
    storage: FileBackend,
    last_delta: Option<f64>,
}

impl LoopController {
    pub fn new(rfc_path: PathBuf, docs_path: PathBuf) -> Result<Self, LoopError>;

    pub async fn start(&mut self) -> Result<(), LoopError> {
        // checkpoint が存在すれば resume
        self.load_checkpoint()?;

        loop {
            match self.phase {
                LoopPhase::Grill => {
                    self.acp.prompt("/grill-me-for-rfc-ja").await?;
                    self.phase = LoopPhase::TreeSplit;
                }
                LoopPhase::TreeSplit => {
                    self.acp.prompt("/grill-me-to-split-rfc-as-tree").await?;
                    self.validate_dag()?;
                    self.phase = LoopPhase::TicketFormulate;
                }
                LoopPhase::TicketFormulate => {
                    for node in self.list_rfc_nodes()? {
                        self.acp.prompt(
                            &format!("/formulate-tickets {}", node)
                        ).await?;
                        self.validate_ticket_dag(&node)?;
                    }
                    self.phase = LoopPhase::TicketExecute;
                }
                LoopPhase::TicketExecute => {
                    // 第二層ループ: 全チケット完了まで繰り返し
                    let mut retries = 0u32;
                    while let Some(ticket) = self.next_pending_ticket()? {
                        self.acp.prompt(
                            &format!("/start-ticket {}", ticket)
                        ).await?;
                        if self.is_ticket_done(&ticket)? {
                            continue;
                        }
                        retries += 1;
                        if retries >= self.settings.retry.ticket_retry_limit {
                            self.report_limit_exceeded()?;
                            return Err(LoopError::TicketLimitExceeded);
                        }
                    }
                    self.phase = LoopPhase::OmissionDetect;
                }
                LoopPhase::OmissionDetect => {
                    // 機械的検出（Structural Inconsistency）
                    let structural = self.detect_structural_inconsistency()?;
                    // Claude Code に残り3分類を依頼
                    self.acp.prompt("/find-omissions-for-next-rfc").await?;
                    // Δ計算
                    self.last_delta = Some(
                        self.calculate_delta_from_files()?
                    );
                    self.phase = LoopPhase::ConvergenceCheck;
                }
                LoopPhase::ConvergenceCheck => {
                    if self.last_delta == Some(0.0) {
                        self.phase = LoopPhase::Done;
                    } else {
                        self.phase = self.determine_feedback_phase()?;
                        self.increment_round()?;
                    }
                }
                LoopPhase::Done => {
                    println!("収束完了。Δ=0");
                    return Ok(());
                }
            }
            // 各Phase終了時にcheckpointをcommit（機械的に副作用として）
            self.storage.commit_checkpoint()?;
        }
    }

    /// Omissionの種類に応じてフィードバック先を決定する。
    fn determine_feedback_phase(&self) -> Result<LoopPhase, LoopError> {
        let omissions = self.read_omissions()?;
        if omissions.has("StructuralInconsistency") {
            Ok(LoopPhase::TreeSplit)       // → Phase 2
        } else if omissions.has("SpecificationDeficiency") {
            Ok(LoopPhase::Grill)            // → Phase 1
        } else {
            Ok(LoopPhase::TicketExecute)    // → Phase 4
        }
    }
}
```

### 6. 実行フロー

```text
$ conver loop --rfc ./RFC_ROOT.md --docs ./research

[conver loop] Starting — Phase 1: Grill
  (ACP経由で /grill-me-for-rfc を実行。stdin開放、ユーザーがQ&Aに回答)
[conver loop] Phase 2: Tree Split
  (ACP経由で /grill-me-to-split-rfc-as-tree を実行)
  DAG validation: OK (petgraph, cycle-free)
[conver loop] Phase 3: Ticket Formulate
  CLI module: 5 tickets generated
  Core module: 5 tickets generated
  ...
[conver loop] Phase 4: Ticket Execution
  T001: PASS
  T002: FAIL → retry 1/3 → PASS
  T003: PASS
  ...
[conver loop] Phase 6: Omission Detection
  Structural: OK. LLM check: 2 omissions found
  Δ = 3.0 (M:2, C:1, U:0, X:0)
[conver loop] Phase 7: Convergence Check
  Δ > 0 → feedback to Phase 4

[conver loop] Round 2 — Continuing
  (未完了チケットをPhase 4で再実行)
  ...
[conver loop] Phase 7: Convergence Check
  Δ = 0 → DONE
```

### 7. DAG 検証

Rust（petgraph）の責務。RFC ツリーとチケット DAG の二種を検証する。

```rust
pub fn validate_rfc_tree_dag(json: &str) -> Result<(), DagError> {
    let nodes: Vec<RfcNode> = serde_json::from_str(json)?;
    let mut graph = DiGraph::<(), ()>::new();
    let indices: HashMap<&str, _> = nodes.iter()
        .map(|n| (n.id.as_str(), graph.add_node(())))
        .collect();
    // 依存辺のみ追加（階層辺はツリー構造で自己矛盾しないため不要）
    for node in &nodes {
        if let Some(&to) = indices.get(node.id.as_str()) {
            for dep in &node.depends_on {
                if let Some(&from) = indices.get(dep.as_str()) {
                    graph.add_edge(from, to, ());
                }
            }
        }
    }
    if is_cyclic_digraph(&graph) {
        return Err(DagError::CycleDetected);
    }
    Ok(())
}
```

### 8. 乖離関数 Δ

```rust
pub fn calculate_deviation(omissions: &OmissionsLedger, s: &DeviationSettings) -> f64 {
    let m = omissions.count("ImplementationMissing");
    let c = omissions.count("ImplementationContradiction");
    let u = omissions.count("SpecificationDeficiency");
    let x = omissions.count("StructuralInconsistency");
    s.alpha * x as f64 + s.beta * c as f64 + s.gamma * u as f64 + s.delta * m as f64
}
```

### 9. 収束可視化

```text
$ conver loop status

[conver] Round 3 — Convergence Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Δ = 5.0  (M:2  C:1  U:0  X:2)

 ▼ Per-module deviation vector (bar: 50 segments)
   cli               Δ=0    ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ 100%
   core              Δ=2    ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■□□□□□□□□□□□□  70%
   storage           Δ=0    ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ 100%
   deviation         Δ=0    ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ 100%
   reporting         Δ=3    ■■■■■■■■■■■■■■■■■■■■■■■■■□□□□□□□□□□□□□□□□□□□□□□□□  50%
   convergence       Δ=0    ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ 100%

 Status: CONVERGING (3 rounds / limit 3)
```

各ノードの充足度バーは `Δ=0` を 100%（50個すべて塗り潰し）とする。

### 10. チェックポイントと再開

各 Phase 完了時に checkpoint を機械的に（LLM 呼出しなしで副作用として）commit する。
保存内容は `Status.json` + `loop_phase` + `round_number` の最小スナップショット。

```rust
fn commit_checkpoint(&mut self) -> Result<(), StorageError> {
    self.storage.write_json("Status.json", &LoopStatus {
        phase: self.phase,
        round: self.round,
        rfc_path: self.rfc_path.clone(),
        docs_path: self.docs_path.clone(),
    })?;
    Ok(())
}

fn load_checkpoint(&mut self) -> Result<(), LoopError> {
    if self.storage.exists("Status.json") {
        let status: LoopStatus = self.storage.read_json("Status.json")?;
        self.phase = status.phase;
        self.round = status.round;
    }
    Ok(())
}
```

再開は `conver loop --rfc --docs` を同一引数で再実行するだけ。
`conver loop resume` のようなサブコマンドは実装しない。
プロセス終了時（正常・エラー・Ctrl+C）、シェルに制御が復帰する。

### 11. 永続化の耐久性保証

全ファイル書き込みは `write-temp → fsync → rename` の atomic パターンに従う。
これにより書き込み途中のクラッシュでファイルが破損しないことを保証する。

### 12. 改竄検出

各ファイルの SHA-256 ハッシュを `RFC_TREE.json` ノードの `sha256` フィールドに
内蔵する。`RFC_TREE.json` 自身のハッシュは `.conver/manifest.json` に保存する。
conver 起動時および各 Phase 完了後に自動検証を実行する。

### 13. 補助スクリプト

以下の既存 nodejs/sh スクリプトは `conver init` で `.claude/scripts/` に展開される。
Claude Code がスラッシュコマンド経由で呼び出すため、Rust 移植は不要である。

| スクリプト | 用途 |
|-----------|------|
| `check-all-schema.js` | Status/DesignTree スキーマ検証 |
| `validate-question-format.js` | grill 質問フォーマット検証 |
| `run-quality-checks.js` | 品質チェック |
| `scan-crimes.sh` | [::STUB::] マーカー検出 |
| その他全41スクリプト | 各スラッシュコマンドから呼び出し |

### 14. スラッシュコマンド設計原則

#### 14.1 致命制約：conver非依存

**スラッシュコマンドは `conver` なしでも直接 Claude Code から実行可能でなければならない。**
conver loop が ACP 経由でスラッシュコマンドを送信するのは「自動化のため」であって、
スラッシュコマンドを conver にロックインするためではない。

```
✅ 正しい: スラッシュコマンドMarkdown内で `conver cmd validate-dag` を呼ぶ
            と同時に、conver がない環境では nodejs スクリプトがフォールバック
            として動作するよう記述する。

❌ 禁止: スラッシュコマンドMarkdown内で `conver cmd ...` だけを書き、
         conver なしでは動作しない状態にすること。
```

#### 14.2 `conver cmd` サブコマンド

スラッシュコマンドMarkdown内から呼び出される機械的処理は `conver cmd` として実装する。
これにより conver が存在する環境では高精度な機械的検証が追加され、存在しない環境では
nodejs フォールバックが動作する。

```bash
# スラッシュコマンドMarkdown内の記述例
1. RFC_TREE.json を生成する
2. DAG 検証を実行する:
   - `conver cmd validate-dag --path ./RFC_TREE.json` が利用可能なら実行
   - 不可能なら `node .claude/scripts/check-all-schema.js` で代替
3. 検証結果に応じて処理を続行する
```

`conver cmd` が提供する機械的処理：

| サブコマンド | 機能 | フォールバック |
|------------|------|--------------|
| `conver cmd validate-dag` | petgraphによるDAG循環検証 | `node check-all-schema.js` |
| `conver cmd compute-deviation` | Δ = αM+βC+γU+δX の計算 | 手動計算（または省略） |
| `conver cmd check-tamper` | SHA-256改竄検出 | `sha256sum` 等 |

#### 14.3 新規スラッシュコマンド定義

##### `/grill-me-to-split-rfc-as-tree`

```
# /grill-me-to-split-rfc-as-tree

## 概要
RFC_ROOT.md を分析し、論理的な構成単位に分解して RFC_TREE.json
（DAG構造）と各 RFC_XXX.md ファイルを生成する。

## 使い方
/grill-me-to-split-rfc-as-tree <rfc-root-path>

## 動作
1. <rfc-root-path>/RFC_ROOT.md を読み込む
2. 設計の論理的構成単位（サブシステム・crate境界等）を分析
3. 各ノードが5チケット前後で完了可能な粒度のDAG構造を生成
4. RFC_TREE.json を出力（フラットnodes配列形式、children + depends_on）
5. 各ノードに対応するディレクトリと RFC_XXX.md（雛形）を作成
6. DAG検証を実行:
   - `conver cmd validate-dag --path <rfc-tree-json>` を推奨
   - フォールバック: `node check-all-schema.js`
7. 検証不合格 → 問題点を分析して再生成
8. 検証合格 → 完了

## 出力
- <rfc-root-path>/RFC_TREE.json
- <rfc-root-path>/<node-path>/RFC_XXX.md
```

##### `/find-omissions-for-next-rfc`

```
# /find-omissions-for-next-rfc

## 概要
RFC と実装コードの乖離（omissions）を4分類で検出し、
OMISSIONS-<round>.json に保存する。

## 使い方
/find-omissions-for-next-rfc <rfc-root-path>

## 動作
1. 以下の全アーティファクトを分析:
   - 頂点RFC（RFC_ROOT.md）
   - 分解RFC群（RFC_XXX.md）
   - RFC_TREE.json
   - Tickets.json
   - 実装ソースコード
   - STUB台帳
2. 以下の乖離を検出:
   - Implementation Missing (M): RFC記述あり未実装
   - Implementation Contradiction (C): 実装がRFCと矛盾
   - Specification Deficiency (U): 実装発見のRFC抜け
   - Structural Inconsistency (X): ファイル構造の不整合
3. X（構造不整合）は `conver cmd check-tamper --path <path>` で機械的検出
4. M/C/U は意味的理解が必要なためClaude Codeが検出
5. 結果を OMISSIONS-<round>.json に保存
6. Δ計算は `conver cmd compute-deviation --path <omissions-json>` で実行
7. Δ = 0 なら収束完了

## 出力
- <rfc-root-path>/OMISSIONS-<round>.json
- Δ値（画面上に表示）
```

#### 14.4 既存スラッシュコマンドの調整方針

既存の7スラッシュコマンドは最小限の変更でループ対応する。

| コマンド | 調整内容 |
|---------|---------|
| `/grill-me-for-rfc-ja` | 変更不要（grillは対話型。完了後DesignTree.jsonが自動保存される） |
| `/formulate-tickets` | DAG検証の合格/不合格を終了ステータスとして出力する |
| `/start-ticket` | 開始前に依存チケットの完了確認。DAG整合性確認結果を出力 |
| `/review-ticket` | レビュー合格/不合格を構造化JSONで出力する |
| `/resolve-ticket` | STUB解決状態を報告。第二層ループ継続判定に使用 |
| `/make-ticket` / `/plan-ticket` | 変更不要（ループ内で直接使用されない） |

全ての調整は「終了ステータスの構造化」に限定し、既存の手動実行フローを
壊さない。conver loop はこの構造化出力を読み取って次のアクションを判断する。`Status.json` の更新は `conver`（Rust）が担当する。これはLLM非依存の機械的制御を維持するためである。

## Implementation

### Crate 構成

```text
crates/conver/
├── Cargo.toml
└── src/
    ├── main.rs          # エントリポイント (clap: Command enum)
    ├── loop.rs          # LoopController・LoopPhase
    ├── dag.rs           # petgraph DAG検証
    ├── deviation.rs     # 乖離関数Δ計算
    ├── storage.rs       # FileBackend・AtomicWriter・SHA-256・Checkpoint
    ├── report.rs        # ConvergenceReporter（50マス充足度バー）
    └── settings.rs      # Settings（5セクション7フィールド）
```

### Cargo.toml

```toml
[package]
name = "conver"
edition = "2021"

[dependencies]
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
petgraph = "0.6"
sha2 = "0.10"
hex = "0.4"
tokio = { version = "1", features = ["full"] }
claude-code-acp = { git = "https://github.com/soddygo/claude-code-acp-rs" }
```

## Appendix

### A. 完成条件

1. 乖離関数 Δ = 0（OMISSIONS が空）
2. 全 SHA-256 ハッシュが一致（改竄なし）
3. DAG 検証が全巡回で OK
4. RFC 本文に未実装プレースホルダ 0 件

### B. 補助スクリプト一覧

`conver init` で展開される全スクリプト。既存のまま改変不要。

| カテゴリ | ファイル | 引継ぎ元 |
|---------|---------|---------|
| grill | `check-all-schema.js`, `generate-checklist.js`, `init.js`, `list-files.js`, `session-status.js`, `tree-query.js`, `update-status.js`, `update-tree.js`, `validate-question-format.js` | `docs/claude/scripts/grill-me-for-rfc/` |
| tickets | `check-status.js`, `count-tickets.js`, `create-ticket.js`, `ensure-malfeasance.js`, `list-tickets.js`, `malfeasance-all.js`, `malfeasance-create.js`, `malfeasance-update.js`, `read-artifact.js`, `read-frontmatter.js`, `resolve-ticket.js`, `save-artifact.js`, `scan-crimes.sh`, `search-tickets.js`, `update-frontmatter.js`, `update-ticket-status.js`, `validate-structure.js` | `docs/claude/scripts/tickets/` |
| review | `find-all-stubs.js`, `generate-report.js`, `run-quality-checks.js` | `docs/claude/scripts/tickets/review/` |
| lib | `malfeasance-utils.js`, `ticket-config.js`, `tickets.js`, `validate-malfeasance.js` | `docs/claude/scripts/lib/` |

### C. 過剰設計として削除したもの

今回のトリミングで以下の要素を削除した。いずれも「Claude CodeがやるべきことをRustで再実装しようとした」過剰設計である。

| 削除要素 | 理由 |
|---------|------|
| WorkflowController trait + 全ハンドラ | LoopController が acp.prompt() を直接呼べば十分 |
| WorkflowRequest enum（28バリアント） | スラッシュコマンド文字列で代替可能 |
| RuntimeBackend/RuntimeSession/StructuredPayloadExtractor trait群 | ACP の session/prompt で標準化済み |
| JsonExtractor（3形式パース） | ACP は JSON-RPC で構造化データを返す |
| RetryExtractor | ACP セッション内で Claude Code が処理 |
| SchemaValidator / QuestionFormatValidator / DesignTreeValidator | 既存 nodejs スクリプトが検証 |
| TicketController / TicketDag の全管理メソッド | Claude Code が /formulate-tickets, /start-ticket 等で管理 |
| MalfeasanceController の全管理 | 既存 scan-crimes.sh がスキャン |
| Settings 9セクションのうち不要4セクション | ACP 固定により不要 |

### D. 将来の拡張：並列チケット実行

現在のループは全チケットを逐次実行する。以下の拡張により、DAG上で依存関係にない
チケットを並列実行できる。

```rust
// 将来の拡張イメージ
async fn execute_tickets_parallel(&mut self) -> Result<(), LoopError> {
    let mut handles = Vec::new();
    loop {
        // frontier = 入次数0の未完了チケット（petgraphトポロジカルソート）
        let frontier = self.compute_frontier()?;
        if frontier.is_empty() { break; }
        
        // 各frontierチケットを並列実行（ACPセッションはチケットごとに独立）
        for ticket in frontier {
            // 注意: 同一ファイルへの同時編集を防ぐため、同一RFCノード配下の
            // チケットは直列化する。異なるRFCノードのチケットのみ並列実行可能。
            if !self.conflicts_with_running(&ticket) {
                handles.push(tokio::spawn(async move {
                    acp.prompt(&format!("/start-ticket {}", ticket.id)).await
                }));
            }
        }
        
        for handle in handles {
            handle.await??;
        }
    }
    Ok(())
}
```

**この拡張が不要な理由（現時点）:**
- ループの収束に並列実行は本質的ではない（逐次でも収束する）
- ACP セッションを複数同時に起動するためのリソース管理が複雑
- 並列実行による速度向上はLLM処理時間が支配的であり、逐次でも実用的

**将来、以下の条件が揃ったときに実装を検討する:**
1. チケット数が常時20以上になる
2. 異なるRFCノード間でファイル競合がないことが保証できる
3. ACP エージェントの複数起動がリソース的に許容できる
