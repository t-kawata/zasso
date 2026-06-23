# RFC_002: コア状態機械（conver-core）— 設計全体マップ

> このファイルは `/formulate-tickets` によって自動生成されました。
> **生成元:** crates/conver/rfc-002-core/RFC_002.md
> **生成日:** 2026-06-23

## 目的とスコープ

`conver-core` はワークフロー状態機械、チケット局所状態機械、DesignTree ガバナンス、
チケット CRUD と DAG 編成、Malfeasance ledger、乖離関数Δの計算、観測ベクトル管理、
収束ループ制御、RFCツリーDAG管理の10モジュールから構成される。

本crateは全crateの中で唯一、ワークフローの「意味」を理解する層である。
CLIパース（conver-cli）、Runtime実行（conver-runtime）、永続化（conver-storage）、
プロジェクション（conver-projection）、検証（conver-validation）はいずれも
本crateの状態と判断に依存する。

## アーキテクチャ概要

```text
conver-core/src/
├── lib.rs              # モジュール宣言 + WorkflowError/TicketError 再公開
├── controller.rs       # WorkflowController trait + WorkflowControllerImpl + ハンドラ群
├── state.rs            # WorkflowState + TicketStatus + RoundManager + RoundRecord
├── designtree.rs       # DesignTree + DesignNode + enum群 + クエリ
├── ticket.rs           # TicketRecord + TicketDag + TicketController
├── malfeasance.rs      # MalfeasanceLedger + MalfeasanceController + StubScanner
├── deviation.rs        # DeviationCalculator + OmissionsLedger + DeviationScore
├── observation.rs      # ObservationVector + ObservationRecorder
├── convergence.rs      # ConvergenceController + ConvergenceResult
├── tree.rs             # RfcDag + RfcNode + EdgeKind + TreeError
└── settings.rs         # Settings + 9サブ構造体
```

## 依存関係（5層モデル）

### Layer 0（型定義）— 外部依存なし
| ファイル | 主要型 | 依存先 |
|---------|--------|--------|
| settings.rs | Settings, RuntimeSettings, UiSettings, RetrySettings, ResumeSettings, ReportSettings, PathSettings, InstallSettings, QualitySettings, DeviationSettings | — |
| lib.rs | WorkflowError, TicketError | — |
| state.rs | StateError | — |
| tree.rs | TreeError, TreeErrorKind, EdgeKind, RfcNode, RfcTreeJson | — |
| convergence.rs | ConvergenceError, ConvergenceResult | WorkflowState |
| observation.rs | ObservationVector | — |
| deviation.rs | OmissionKind, OmissionEntry, OmissionsLedger, DeviationScore, DeviationComponents | — |
| malfeasance.rs | MalfeasanceRecord, MalfeasanceStatus, MalfeasanceLedger, StubEntry | — |
| designtree.rs | DesignNodeKind, DesignStatus, QuestionRecord, DesignNode, DesignTree, TreeError | — |
| ticket.rs | TicketRecord, TicketDag, DagValidationReport, TicketError | TicketStatus, petgraph |

### Layer 1（純粋関数）— 外部I/Oなし
| ファイル | 関数 | 依存先 |
|---------|------|--------|
| state.rs | WorkflowState::allowed_transitions, transition, force_transition | WorkflowState |
| state.rs | TicketStatus::allowed_transitions | TicketStatus |
| state.rs | RoundManager::new, start_next_round, current_round, reset | — |
| designtree.rs | DesignNode::count_open_recursive, find_mut | DesignNode |
| designtree.rs | DesignTree::new, from_research, count_open, is_grill_complete, resolve_node, add_child, find_node, delete_node, format_tree, search, path_to, delete_recursive, format_node, search_recursive, path_recursive | DesignNode |
| malfeasance.rs | MalfeasanceLedger::open_count, debt_index | MalfeasanceRecord |
| malfeasance.rs | classify_stub (pure string → severity) | — |
| deviation.rs | OmissionsLedger::count_by_kind, has_kind, is_empty | OmissionEntry |
| deviation.rs | DeviationCalculator::calculate | OmissionsLedger, OmissionKind |
| deviation.rs | calculate_deviation (free function) | DeviationCalculator |
| convergence.rs | ConvergenceController::determine_feedback_phase | OmissionsLedger, WorkflowState |
| observation.rs | ObservationRecorder::latest_delta | ObservationVector |
| ticket.rs | TicketDag::validate_dag, topological_sort, compute_frontier, detect_cycle_path, dfs_cycle | TicketRecord, petgraph |
| controller.rs | WorkflowController trait (定義のみ), WorkflowRequest enum, WorkflowResult struct | 全State型 |

### Layer 2（ファイルI/O操作）
| ファイル | 関数 | 依存先 |
|---------|------|--------|
| malfeasance.rs | StubScanner::scan_all | walkdir, std::fs |
| tree.rs | RfcDag::from_fs | std::fs |
| observation.rs | ObservationRecorder::append | StorageBackend trait |
| observation.rs | append_observation | StorageBackend trait |
| malfeasance.rs | MalfeasanceController::scan_and_record | StubScanner, uuid |

### Layer 3（コントローラー統合）
| ファイル | 関数 | 依存先 |
|---------|------|--------|
| controller.rs | WorkflowControllerImpl::new | StorageBackend, RuntimeBackend |
| controller.rs | handle_grill, handle_create_ticket, handle_detect_omissions, handle_show_status | StorageBackend, RuntimeBackend, 全モジュール |
| ticket.rs | TicketController::extract_skeleton, validate_with_retry | RuntimeBackend |

## モジュール間の関係

```text
controller.rs ──→ state.rs ──→ (依存なし)
              ├──→ designtree.rs
              ├──→ ticket.rs ──→ state.rs
              ├──→ malfeasance.rs
              ├──→ deviation.rs
              ├──→ observation.rs
              ├──→ convergence.rs ──→ state.rs, deviation.rs
              ├──→ tree.rs
              ├──→ settings.rs
              └──→ conver-storage, conver-runtime (外部crate)
```

## スタブ一覧と解決計画

本RFCの実装では以下のスタブが発生する可能性がある：

| スタブ | 発生箇所 | 解決チケット |
|--------|---------|------------|
| DesignTree::from_research (空実装の可能性) | designtree.rs | M2-2（本RFCでは簡易実装で可） |
| RfcDag::detect_cycle (簡略化: Vec::new) | tree.rs | M4-6（petgraph cycle detect の本実装へ置換） |
| delete_node 内の fs::remove_file (DesignTree) | designtree.rs | M2-3（Layer 2 I/O） |
