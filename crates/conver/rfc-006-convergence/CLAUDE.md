# RFC_006: 数学的定式化・収束制御 — 設計全体マップ

> このファイルは `/formulate-tickets` によって自動生成されました。
> **生成元:** crates/conver/rfc-006-convergence/RFC_006.md
> **生成日:** 2026-06-23

## 目的とスコープ

conver オーケストレータの数学的基盤を規定する。以下の6領域を形式的に定義する：
1. **開発空間 D = S × I**: 仕様空間と実装空間の直積として開発状態を形式化
2. **RFCツリー T = (V, E_h, E_d, σ)**: 親子関係と依存関係を併せ持つDAG
3. **乖離関数 Δ = αM + βC + γU + δX**: 仕様と実装の乖離を定量化
4. **観測ベクトル o_r**: 各ループ反復の状態を11フィールドで記録
5. **収束ループ制御**: Δ>0の場合のフィードバック決定とループ上限管理
6. **人間介入モデル H(d,u) → d'**: 制御系外部からの9種の介入演算子

**実装crate:** `conver-core`（crates/conver/rfc-002-core/）— 新規crate不要

## アーキテクチャ概要

```
                   ┌─────────────────────┐
                   │   OmissionsLedger   │  ← M/C/U/X の乖離エントリを保持
                   └────────┬────────────┘
                            │
                   ┌────────▼────────────┐
                   │ DeviationCalculator │  ← Δ = αM + βC + γU + δX
                   └────────┬────────────┘
                            │
              ┌─────────────┼──────────────┐
              ▼             ▼              ▼
   ┌──────────────────┐ ┌──────────┐ ┌──────────────┐
   │ObservationVector │ │ConvergenceController│ │CompletionVerifier│
   │   o_r (11 fields)│ │ feedback_phase()    │ │ verify()        │
   └────────┬─────────┘ │ converge_round()   │ │ 6 conditions    │
            │           └──────────┬──────────┘ └────────────────┘
            ▼                      │
   ┌─────────────────┐            │
   │ObservationRecorder│           │
   │ append / latest /│           ▼
   │ all              │   ┌──────────────┐
   └──────┬──────────┘   │  RoundManager │
          │              │ max_rounds=3  │
          ▼              └──────────────┘
   round_log.jsonl
   (append-only)

   ┌─────────────────────┐
   │  Intervention       │  ← 人間介入演算子（9種）
   │  InterventionKind   │     制御系外部からのd→d'変換
   └─────────────────────┘
```

### ファイル構成

| ファイル | 主要構造体 | 層 |
|---------|-----------|-----|
| `deviation.rs` | OmissionKind, OmissionEntry, OmissionsLedger, DeviationComponents, DeviationScore, DeviationCalculator | Layer 0 + 1 |
| `observation.rs` | ObservationVector, ObservationRecorder, InterventionKind, Intervention | Layer 0 + 1 + 2 |
| `convergence.rs` | RoundManager, ConvergenceController, ConvergenceResult, ConvergenceError, CompletionVerifier, CompletionReport, CompletionError | Layer 1 |

### 外部依存型（既存: RFC_002 / RFC_004）

| 型 | 提供元 | 用途 |
|---|--------|------|
| `WorkflowState` | RFC_002 (state.rs) | 収束ループのフィードバック先 |
| `DeviationSettings` | RFC_002 (settings) | 重みパラメータαβγδ |
| `StorageBackend` | RFC_004 (storage) | 観測ベクトルの永続化 |
| `StorageError` | RFC_004 (storage) | I/Oエラー |
| `TicketDag`, `TicketRecord`, `TicketStatus` | RFC_002 (tickets) | 完了条件検証 |
| `StubEntry`, `ReviewResult` | RFC_002 (stubs) | 実装スナップショット |

## 主要な型とデータ構造

```text
OmissionKind enum           — M / C / U / X の4分類
OmissionEntry struct        — kind + rfc_node_id + ticket_id + description + ...
OmissionsLedger struct      — Vec<OmissionEntry> + count_by_kind() + has_kind()
DeviationComponents struct  — m: usize, c: usize, u: usize, x: usize
DeviationScore struct       — delta: f64, components: DeviationComponents, per_node: Vec<(String, f64)>
DeviationCalculator struct  — alpha, beta, gamma, delta + calculate() + calculate_per_node()
ObservationVector struct    — r, delta, m, c, u, x, v_count, k_count, duration_secs, debt_index, interventions
ObservationRecorder struct  — append() + latest() + all() via StorageBackend
InterventionKind enum       — 9 variants (InjectContext, ReviseRfcNode, SplitRfcNode, ...)
Intervention struct         — kind + timestamp + reason + summary()
RoundManager struct         — current_round + max_rounds + start_next_round()
ConvergenceController       — RoundManager + DeviationCalculator + determine_feedback_phase() + converge_round()
ConvergenceResult enum      — Converged(DeviationScore) | Feedback{round, score, feedback_to}
ConvergenceError enum       — LoopLimitExceeded{current, max}
CompletionVerifier struct   — verify() checking 6 conditions
CompletionReport struct     — converged: bool, delta: f64
CompletionError enum        — NotConverged(Vec<String>)
```

## モジュール／コンポーネント間の関係

### 依存グラフ

```
OmissionKind
    → OmissionEntry (kind フィールド)
        → OmissionsLedger (Vec<OmissionEntry>)
            → DeviationCalculator.calculate() (カウント取得)
            → ConvergenceController.determine_feedback_phase() (has_kind判定)
            → CompletionVerifier.verify() (is_empty確認)
DeviationComponents
    → DeviationScore (components フィールド)
        → DeviationCalculator.calculate() (戻り値)
        → ObservationVector.new() (deviationから展開)
        → ConvergenceResult::Converged (DeviationScore保持)
InterventionKind
    → Intervention (kind フィールド)
        → ObservationVector.interventions (Vec<String>)
DeviationSettings (ext)
    → DeviationCalculator.from_settings()
WorkflowState (ext)
    → ConvergenceController.converge_round() (state変異)
    → ConvergenceResult::Feedback (feedback_to: WorkflowState)
StorageBackend (ext)
    → ObservationRecorder.append() / latest() / all()
```

### フェーズ分割

| フェーズ | チケット範囲 | 内容 | 外部依存 |
|---------|------------|------|---------|
| Phase I | M1-1 〜 M1-9 | 純粋ロジック全般 | chrono, serde |
| Phase II | M2-1 | Storage I/O層 | StorageBackend(RFC_004) |
| Phase III | M3-1 | 統合コンポーネントテスト | 全コンポーネント |
| Phase IV | M4-1 | 受入テストバイナリ | conver-core 全体 |

## スタブ一覧と解決計画

本設計書の段階では実装前のためスタブは存在しない。
各チケットの実装時に以下の箇所で `[::STUB::]` が発生する可能性がある：

1. **`DeviationCalculator::calculate()`** の `per_node: Vec::new()`: 基本計算では空ベクトルを返し、`calculate_per_node()` で初めて設定される。基本計算とノード別計算の分離は設計上の選択であり、スタブではない。
2. **`CompletionVerifier::verify()`** の条件6（凍結・停止）: 設計書§7に「（フラグが別途管理される）」とある。実装時は条件6のチェックを `[::STUB::]` としてマークし、Phaser IIIで解決する。
3. **`ConvergenceController`** の `DeviationCalculator` 統合: `ConvergenceController::new()` で `DeviationCalculator` を内包するが、設定の動的変更は Phase III の範囲とする。
