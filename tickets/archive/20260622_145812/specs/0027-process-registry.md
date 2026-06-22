---
ticket_id: 27
title: process-registry: ポート競合検出による起動時安全機構
slug: process-registry
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
plan_path: /Users/kawata/shyme/zasso/tickets/context/0027-process-registry/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0027-process-registry/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0027-process-registry/review.md
---
# process-registry: ポート競合検出による起動時安全機構

## Summary

`crates/procreg` の `spawn_one()` に、プロセス起動前に対象ポートが既に使用中かを確認する機構を追加する。ポート使用中が検出された場合、`RegistryError::PortInUse` を返し、起動全体を中断（エラー伝播）させる。

これにより、ゾンビプロセスがポートを占有している場合に新しいアプリケーションの起動がブロックされる。

## Background

チケット #26 の実装後、以下の現象が確認された：

1. `make run-zasso` で Bifrost が起動する
2. Ctrl+C でアプリケーションを終了する → Bifrost が孤児として生き残る（shutdown_all が完了する前にプロセスが終了するため）
3. 孤児 Bifrost は port 3912 を占有したまま生き残る
4. 再度 `make run-zasso` を実行する
5. 新しい Bifrost プロセスはポートバインドに失敗するが、**孤児 Bifrost のポートに対して TcpPort レディネスチェックが成功してしまう**
6. アプリケーションは「正常起動」と判断し、新しい Bifrost プロセスは孤児と入れ替わる形で消滅する

期待する動作は「ポート使用中 = 新規アプリケーション起動不可」であり、安全側に倒す必要がある。

既存の `ReadyCondition::TcpPort` によるレディネスチェックは「プロセスがポートを開いたこと」の確認にはなるが、そのポートを**誰が**開いたかは区別しない。孤児プロセスが開いたポートにも接続成功するため、安全機構として機能していない。

## Scope

1. **`RegistryError` に `PortInUse` バリアントを追加** — ポート競合のエラー情報を伝達する
2. **`spawn_one()` の先頭にポート競合チェックを追加** — `tokio::process::Command::spawn()` の前に実行する
3. **`is_port_free()` 関数の実装** — クロスプラットフォーム（macOS/Linux/Windows）でポート使用中を検出する
4. **テスト**: 正常系（空きポート）、異常系（使用中ポート）のテストを追加

## Non-scope

- 親プロセス生死監視（チケット #28 で対応）
- Tauri 側の `ExitRequested` ハンドラ改善（別チケット）
- process-registry 以外のクレートの修正

## Investigation

### 証拠1: 現在の起動フローは「起動後にポート確認」

**ファイル**: `crates/procreg/src/spawn.rs:61-119行目`

```rust
pub(crate) async fn spawn_one(...) -> Result<SpawnResult, RegistryError> {
    let mut cmd = tokio::process::Command::new(&def.program);
    // ... コマンド設定 ...
    let mut child = cmd.spawn().map_err(|e| RegistryError::SpawnFailed { ... })?;  // ← 先に起動
    // ... 出力キャプチャ ...
    ready::wait_ready(&def.ready, &def.name, output_tx.clone()).await?;  // ← 後でポート確認
    // ...
}
```

プロセスが先に起動され、その後でポートが開くのを待つ。ポートが既に他のプロセスに占有されていても、**そのポートに接続できてしまう**ため起動成功と誤認する。

### 証拠2: TcpPort レディネスチェックは「誰が開いたか」を区別しない

**ファイル**: `crates/procreg/src/ready.rs:79-105行目`

```rust
ReadyCondition::TcpPort { host, port, timeout, poll_interval } => {
    let addr = format!("{host}:{port}");
    let result = tokio::time::timeout(*timeout, async move {
        loop {
            if tokio::net::TcpStream::connect(&addr).await.is_ok() {
                return Ok::<(), ()>(());
            }
            tokio::time::sleep(poll).await;
        }
    })
    .await;
}
```

`TcpStream::connect` は「ポートに接続できること」しか確認しない。孤児プロセスが占有するポートにも接続成功するため、**新しいプロセスが正常起動したかのように振る舞う**。

### 証拠3: RegistryError に PortInUse バリアントがない

**ファイル**: `crates/procreg/src/error.rs`

現在のバリアントは UnknownDependency, CircularDependency, NotFound, SpawnFailed, ReadyTimeout の5種。ポート競合を表現できるバリアントが存在しない。

### 証拠4: ポート競合検出の実装方針

クロスプラットフォームで最も安全かつ単純な方法は `tokio::net::TcpListener::bind()` の挙動を利用すること：

- **空きポート**: `TcpListener::bind(addr)` が成功する → 即座に drop して解放
- **使用中ポート**: `TcpListener::bind(addr)` が `AddrInUse` で失敗する → 競合を検出

この方法は以下の理由で安全：
- macOS/Linux/Windows の全プラットフォームで同一の挙動
- 新しいプロセスを起動する前に検査するため、無駄なプロセス生成が発生しない
- root権限を必要としない（既にプロセスが開いているポートの確認のみ）

注意点：
- `SO_REUSEADDR` が設定されているポートは `bind` が成功する可能性がある
- `TIME_WAIT` 状態のポートはプラットフォームによって動作が異なる
- いずれの場合も「安全側に倒れる」 — 競合を見逃しても TcpPort レディネスチェックでカバーされる

## Test Plan

### ユニットテスト計画

`crates/procreg/src/ready.rs` または新規モジュールにテストを追加：

| # | テスト | 内容 | 種別 |
|---|-------|------|------|
| 1 | `is_port_free_returns_true_for_free_port` | `TcpListener` で予約したポートを解放後、`is_port_free` が true を返す | 正常系 |
| 2 | `is_port_free_returns_false_for_bound_port` | `TcpListener` でポートを bind したまま `is_port_free` を呼び、false を返す | 異常系 |
| 3 | `is_port_free_ipv4_and_ipv6` | IPv4 127.0.0.1 と IPv6 [::1] の両方で動作する | 境界値 |
| 4 | `spawn_one_port_conflict_returns_error` | ポートが使用中の場合 `spawn_one` が `PortInUse` エラーを返す | 統合・異常系 |
| 5 | `spawn_one_port_free_succeeds` | ポートが空いている場合 `spawn_one` が正常に完了する | 統合・正常系 |

カバレッジ目標: 新規追加コードの関数網羅率 100%

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| SO_REUSEADDR が設定されたポートとの競合 | OS レベルのソケットオプション設定が必要。実運用での発生確率が極低いため E2E で確認 |

## Boy Scout Rule — 翻訳可能性計画

- `spawn_one()` の冒頭に追加するポート競合チェックは関数として抽出し（`fn is_port_free(host, port) -> Result<bool>`）、「ポートが空いているか確認する」と読めるようにする
- エラーバリアント名は `PortInUse`（名詞 + 形容詞）ではなく `PortConflict`（名詞）とするか、あるいは動詞的意図を込める
  - → 決定: `PortInUse` とする。「ポート使用中」という状態を表現する名詞句であり、エラーの意味が一目でわかる
- `spawn_one()` 自体はすでに「プロセスを起動する」と読める関数名。ポートチェック追加後もこの責務は変わらない

## Acceptance Criteria

- [ ] `RegistryError::PortInUse { host, port }` が追加されている
- [ ] `is_port_free(host, port) -> Result<bool>` がクロスプラットフォームで実装されている
- [ ] `spawn_one()` 内で `tokio::process::Command::spawn()` の前にポート競合チェックが実行される
- [ ] ポート使用中の場合、`RegistryError::PortInUse` が返り、以降の起動が中断される
- [ ] 新規テスト（正常系・異常系）が全パスする
- [ ] process-registry 既存76テストが全パスする

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0027-process-registry/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0027-process-registry/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0027-process-registry/review.md（未作成、/review-ticket 全チェック通過後に作成）
