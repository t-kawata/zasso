---
ticket_id: 29
title: process-registry: Watchdogラッパーによる全OS統一の親死検知機構
slug: process-registry-watchdogos
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
plan_path: context/0029-process-registry-watchdogos/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0029-process-registry-watchdogos/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0029-process-registry-watchdogos/review.md
---
# process-registry: Watchdogラッパーによる全OS統一の親死検知機構

## Summary

`crates/procreg` に、小さな監視専用バイナリ（Watchdog）を同梱し、`spawn_one()` がサイドカープロセスを直接起動する代わりに Watchdog を仲介させる。Watchdog は独立したプロセスとして親PIDを監視し、親が死んだ場合はサイドカーを強制終了する。

これにより、**Linux/macOS/Windows の全プラットフォームで「子が親を監視して自殺する」が同一の方式で実現される。**

## Background

現在の process-registry の親死検知機構はプラットフォームごとに異なる方式で実装されており、一貫性と信頼性に問題がある：

| OS | 現在の方式 | 問題 |
|----|-----------|------|
| **Linux** | `prctl(PR_SET_PDEATHSIG, SIGTERM)` via `pre_exec` | ✅ 完全だが、Linux 固有 |
| **macOS** | `install_parent_monitor()` の `std::thread` | ❌ 親が SIGKILL されるとスレッドも死ぬ |
| **Windows** | 未実装 | ❌ 何も動かない |

チケット #28 の `install_parent_monitor()` は「親プロセス内の自己監視スレッド」であり、**本物の「子が親を監視する」ではない。** 親が exit() や SIGKILL で死んだ瞬間に監視スレッドも同時に死ぬため、macOS ではカバレッジに穴がある。

チケット #27（ポート競合検出）が後ろ盾になっているとはいえ、設計の一貫性を考えると全 OS で同一の機構で「子→親監視」を実装すべきである。

また、チケット #28 で追加した `install_parent_monitor()` のスレッド方式と Linux の `pre_exec` pdeathsig の2つが混在しており、メンテナンス性を損なっている。

## Scope

1. **Watchdog バイナリの作成** — 独立プロセスとして動作する最小限の監視プログラム
   - `crates/procreg/src/watchdog/` に配置
   - 環境変数 `PROCREG_WATCHDOG_PARENT_PID` で親PIDを受け取る
   - 環境変数 `PROCREG_WATCHDOG_CHILD_PID` で監視対象子PIDを受け取る
   - 1秒間隔で親PIDの生存確認 → 親が死んだら子を kill して exit
   - 子が先に死んだら自身も exit（子の終了コードを継承）
   - stdin/stdout/stderr は子に透過的に継承する
2. **Watchdog バイナリのビルドとバンドル** — build.rs + include_bytes!
   - build.rs で watchdog をコンパイルし、ライブラリに埋め込む
   - assets.rs 相当のモジュールで展開インターフェースを提供
3. **`spawn_one()` の改写** — 直接コマンドを起動せず、Watchdog をラッパーとして使用
   - Watchdog → 実コマンド の入れ子起動に変更
   - stdout/stderr パイプは Watchdog を経由（Watchdog が子の出力を継承する）
4. **`install_parent_monitor()` の削除** — Watchdog が代替するため不要になる
5. **Linux `pre_exec` pdeathsig の削除** — Watchdog が代替するため不要になる
6. **テスト**: Watchdog の基本動作、spawn_one 統合、回帰テスト

## Non-scope

- Tauri 側の `ExitRequested` ハンドラ改善（別チケット）
- process-registry 以外のクレートの修正

## Investigation

### 証拠1: 現在の parent.rs（install_parent_monitor）は「親プロセス内のスレッド」

**ファイル**: `crates/procreg/src/parent.rs:28-58行目`

```rust
pub fn install_parent_monitor(registry: ProcessRegistry) {
    let parent_pid = std::process::id();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            if !crate::platform::is_process_alive(parent_pid) {
                // 親プロセスが死んでいる → ...
            }
        }
    });
}
```

`std::thread::spawn` で生成されたスレッドは親プロセスのアドレス空間内で動作する。
親プロセスが SIGKILL / exit() される ＝ スレッドも強制終了される。検知の機会がない。

### 証拠2: 現在の spawn.rs は platform 固有のコードを含む

**ファイル**: `crates/procreg/src/spawn.rs:96-111行目`

```rust
#[cfg(target_os = "linux")]
{
    cmd.pre_exec(|| {
        unsafe {
            libc::prctl(
                libc::PR_SET_PDEATHSIG,
                libc::SIGTERM as libc::c_ulong,
                0, 0, 0,
            );
        }
        Ok(())
    });
}
```

この `#[cfg(target_os = "linux")]` ブロックは macOS/Windows では動作しない。
Watchdog 導入後は全プラットフォーム共通のコードになる。

### 証拠3: Bifrost の assets.rs が include_bytes! のパターンを確立している

**ファイル**: `src-tauri/src/bifrost/assets.rs`

バイナリをコンパイル時に埋め込み、実行時に展開するパターンが既に存在する。
process-registry の Watchdog も同一パターンを踏襲できる。

### 証拠4: Watchdog は独立プロセスのため親の生死に影響されない

Watchdog は `tokio::process::Command::spawn()` で生成される独立した OS プロセス。
親プロセスが SIGKILL されても Watchdog プロセスは生存し続け、監視を継続できる。

## Test Plan

### ユニットテスト計画

| # | テスト | 場所 | 内容 | 種別 |
|---|-------|------|------|------|
| 1 | `is_process_alive` 機能確認 | platform.rs | 既存テストでカバー済み（変更なし） | 回帰 |
| 2 | `spawn_one_with_watchdog` | spawn.rs | Watchdog 経由でプロセスが正しく起動する | 統合 |
| 3 | `bundle_extract_and_execute` | assets/module | 埋め込まれた Watchdog バイナリが実行可能 | 統合 |
| 4 | `parent_death_detection` | watchdog/ | 親が死んだときに Watchdog が子を kill する | E2E |
| 5 | `child_death_propagation` | watchdog/ | 子が先に死んだら Watchdog も終了する | E2E |
| 6 | `install_parent_monitor_removed` | parent.rs | 関数が削除されたことのコンパイル確認 | コンパイル |

カバレッジ目標: Watchdog 展開・起動コード 90% 以上

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| 実際の親 kill による孤児検知 | 実際のプロセス kill が必要。統合テストカテゴリ |
| Watchdog 内部の監視ループ分岐 | 独立バイナリの内部ロジックは統合テストでのみ確認可能 |

## Boy Scout Rule — 翻訳可能性計画

- `spawn_one()` から `#[cfg(target_os = "linux")]` の条件付きコードが消え、全プラットフォームで同一のパスになる → 翻訳可能性が向上する
- `install_parent_monitor()` の全削除により、親プロセス内監視という設計上の嘘がなくなる
- Watchdog の PID 監視ループは「一定秒数ごとに親PIDを確認し、死んでいたら子を殺して自身も終了する」と読めるように実装する

## Acceptance Criteria

- [ ] Watchdog バイナリが process-registry クレートに同梱され、include_bytes! で埋め込まれている
- [ ] `spawn_one()` が Watchdog をラッパーとして使用し、全OSで同一の親死検知が動作する
- [ ] `install_parent_monitor()` が削除されている
- [ ] Linux `pre_exec` / `prctl` のコードが `spawn.rs` から削除されている
- [ ] `PROCREG_PARENT_PID` 環境変数は維持または `PROCREG_WATCHDOG_PARENT_PID` に移行
- [ ] process-registry 既存テストが全パスする（ガード: 85 → 変更後も同等以上）
- [ ] コンパイルが全ターゲット（macOS/Linux/Windows）で成功する

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0029-process-registry-watchdogos/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0029-process-registry-watchdogos/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0029-process-registry-watchdogos/review.md（未作成、/review-ticket 全チェック通過後に作成）
