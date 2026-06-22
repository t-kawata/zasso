---
ticket_id: 11
title: M1-1: RestartPolicy::on_crash_default と next_delay の実装
slug: m1-1-restartpolicyon-crash-default-next-delay
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0011-m1-1-restartpolicyon-crash-default-next-delay/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0011-m1-1-restartpolicyon-crash-default-next-delay/review.md
---
# M1-1: RestartPolicy::on_crash_default と next_delay の実装

## Summary

`RestartPolicy` に2つの純粋関数を実装する。`on_crash_default()` はよく使うデフォルト設定（最大3回、1秒から指数バックオフ）を返すコンストラクタ。`next_delay()` は再起動試行回数に基づく指数バックオフ遅延を計算する。いずれも外部I/O・非同期ランタイムに依存しない純粋関数。

## Background

プロセスが異常終了した際、watch_loop は `RestartPolicy` に基づいて再起動を判断する。`next_delay()` はその際の待機時間を計算する。指数バックオフにより、短時間の連続再起動を防止し、システム全体の安定性を確保する。`on_crash_default()` は最も一般的な設定（OnCrash、最大3回、1s→2s→4s→...、最大30s）をワンタッチで構築するためのショートカット。

**参照設計書:** docs/RFC-001-process-registry.md (§5.2)

## Scope

- `crates/procreg/src/lib.rs` に `impl RestartPolicy` ブロックを追加（M0-1 の定義にメソッドを追加）
  - `pub fn on_crash_default() -> Self` — デフォルト値の `OnCrash` バリアントを返す
  - `pub(crate) fn next_delay(&self, attempt: u32) -> Option<Duration>` — 指数バックオフ計算
- ユニットテスト（既存の `#[cfg(test)] mod tests` 内に追加）

## Non-scope

- `wait_ready` でのタイムアウト制御（M5-1 のスコープ）
- `watch_loop` での再起動ループ（M7-1 のスコープ）
- `child: Option<ChildGuard>` の操作（M3-1 のスコープ）

## Investigation

### コードベース調査結果

```
crates/procreg/src/lib.rs:  `RestartPolicy` 列挙型は M0-1 で定義済み（3バリアント、PartialEq 付き）
  └── impl ブロックは未実装（M1-1 で追加予定）
  └── 既存テストは 13 件（M0-1: 13 テスト）
```

- **発見1**: `RestartPolicy` の型定義は `src/lib.rs` の65〜103行目に存在。`impl RestartPolicy` ブロックは未定義。
- **発見2**: `on_crash_default()` は `pub` で、クレート外部からも利用可能にする必要がある（Tauri 統合時など）。
- **発見3**: `next_delay()` は `pub(crate)` で、クレート内部からのみ呼び出す（watch_loop が使用）。
- **発見4**: 指数バックオフの計算式: `delay = initial_delay * (backoff_factor ^ attempt)`、`max_delay` で上限クランプ。
- **発見5**: `factor.powi(attempt as i32)` で整数乗計算が可能（`f64::powi`）。
- **発見6**: `Never` バリアントの場合は常に `None` を返す（再起動しない）。
- **発見7**: `OnCrash` と `Always` でバックオフ計算ロジックは同一（違いは再起動条件のみ）。
- **発見8**: `Duration::from_secs_f64()` を使用することで `f64` → `Duration` 変換が可能。負の値は panic するが、`max_delay` が正である前提で良い。

### RFC §5.2 の実装

```rust
impl RestartPolicy {
    /// よく使うデフォルト: クラッシュ時に3回まで再起動、1秒から指数バックオフ
    pub fn on_crash_default() -> Self {
        Self::OnCrash {
            max_retries: 3,
            initial_delay: Duration::from_secs(1),
            backoff_factor: 2.0,
            max_delay: Duration::from_secs(30),
        }
    }

    /// バックオフ計算: delay * factor^attempt (max_delayで上限クランプ)
    pub(crate) fn next_delay(&self, attempt: u32) -> Option<Duration> {
        let (max_retries, initial, factor, max_d) = match self {
            Self::Never => return None,
            Self::OnCrash { max_retries, initial_delay, backoff_factor, max_delay } =>
                (*max_retries, *initial_delay, *backoff_factor, *max_delay),
            Self::Always { max_retries, initial_delay, backoff_factor, max_delay } =>
                (*max_retries, *initial_delay, *backoff_factor, *max_delay),
        };
        if attempt >= max_retries {
            return None;
        }
        let secs = initial.as_secs_f64() * factor.powi(attempt as i32);
        Some(Duration::from_secs_f64(secs.min(max_d.as_secs_f64())))
    }
}
```

### 設計上の制約

- `next_delay` は純粋関数で副作用ゼロ
- `Never` の場合は常に `None`（attempt 値に依存しない）
- `max_delay` によるクランプは必須（指数バックオフが際限なく伸びるのを防止）
- `Duration::from_secs_f64()` は値が負の場合 panic するが、`initial_delay` と `max_delay` は正である前提で設計

## Test Plan

### ユニットテスト計画

既存の `lib.rs` 内 `#[cfg(test)] mod tests` に追加する。

| # | テストケース | 種別 | 検証内容 |
|---|-------------|------|---------|
| 1 | `on_crash_default_values` | 正常系 | `on_crash_default()` が `OnCrash { max_retries: 3, initial_delay: 1s, backoff_factor: 2.0, max_delay: 30s }` を返すこと |
| 2 | `next_delay_attempt_zero` | 正常系 | `OnCrash` で attempt=0 → `initial_delay`（1s）が返ること |
| 3 | `next_delay_attempt_one` | 正常系 | `OnCrash` で attempt=1 → `initial_delay * factor`（2s）が返ること |
| 4 | `next_delay_attempt_two` | 正常系 | `OnCrash` で attempt=2 → `initial_delay * factor^2`（4s）が返ること |
| 5 | `next_delay_retries_exhausted` | 異常系 | attempt >= max_retries → `None` |
| 6 | `next_delay_max_delay_clamp` | 境界系 | 計算値が `max_delay` を超える場合、`max_delay` でクランプされること |
| 7 | `next_delay_never_returns_none` | 異常系 | `Never` の場合は attempt 値にかかわらず常に `None` |
| 8 | `next_delay_deterministic` | 特性確認 | 同一入力→同一出力（100回繰り返して同じ値が返ることを確認） |
| 9 | `next_delay_always_same_as_on_crash` | 特性確認 | `Always` と `OnCrash` で同一パラメータの場合、同一の遅延値が返ること |

**カバレッジ目標:** 全分岐網羅 100%。`Never`、`OnCrash`、`Always` の全バリアント。attempt = 0, 1, 2, max の境界値。

### ユニットテスト不可能な項目（例外）

なし。本チケットの全実装は純粋関数であり、メモリ内完結。

## Boy Scout Rule — 翻訳可能性計画

1. **関数名は動詞句**: `on_crash_default()` — 「クラッシュ時のデフォルトを取得する」、`next_delay()` — 「次の遅延を計算する」
2. **変数名はドメイン概念**: `max_retries`（最大リトライ回数）、`initial_delay`（初回遅延）、`backoff_factor`（バックオフ係数）、`max_delay`（最大遅延）
3. **計算式が散文として読める**: `initial.as_secs_f64() * factor.powi(attempt)` → 「初期遅延に factor の attempt 乗を掛ける」
4. **コメントは「なぜ」を説明**: `max_delay` でのクランプ理由（指数バックオフの暴走防止）を doc コメントで説明

## Acceptance Criteria

- [ ] `RestartPolicy::on_crash_default()` が `OnCrash { max_retries: 3, initial_delay: 1s, backoff_factor: 2.0, max_delay: 30s }` を返す
- [ ] `RestartPolicy::next_delay()` が指数バックオフを正しく計算する
- [ ] `Never` バリアントでは常に `None` を返す
- [ ] attempt >= max_retries で `None` を返す
- [ ] 計算値が `max_delay` を超える場合はクランプされる
- [ ] 全9テストケースが通過する
- [ ] `cargo check` が警告なく通過する
- [ ] 既存の 32 テストが引き続き通過する

## Notes

### 依存関係

```
M0-1 (RestartPolicy) ── M1-1 (本チケット) ── M7-1 (watch_loop: next_delay を使用)
```

- M1-1 は M0-1 で定義された `RestartPolicy` にメソッドを追加するだけ
- 既存の 32 テストに影響を与えず、9 テストを追加して 41 テストになる
- `next_delay()` は `pub(crate)` のため、クレート外からは直接呼び出せない

### 成果物

- 計画: context/0011-m1-1-restartpolicyon-crash-default-next-delay/plan.md（未作成）
- 実装サマリ: context/0011-m1-1-restartpolicyon-crash-default-next-delay/implementation.md（未作成）
- レビュー報告書: context/0011-m1-1-restartpolicyon-crash-default-next-delay/review.md（未作成）
