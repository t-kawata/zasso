---
ticket_id: 26
title: process-registry による宣言的サイドカー管理基盤（Fate Sharing）
slug: process-registry-fate-sharing
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
plan_path: /Users/kawata/shyme/zasso/tickets/context/0026-process-registry-fate-sharing/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0026-process-registry-fate-sharing/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0026-process-registry-fate-sharing/review.md
---
# process-registry による宣言的サイドカー管理基盤（Fate Sharing）

## Summary

`src-tauri` が Tauri の `setup()` フック内で `process-registry` クレートを使用し、Bifrost をはじめとする全サイドカープロセスを宣言的に起動・監視・停止するための基盤を実装する。アプリケーションと全サイドカーは運命共同体（Fate Sharing）として動作し、通常終了・SIGTERM・パニックのいずれの経路でも孤児プロセスが残留しないことを保証する。

新しいサイドカーの追加は `Vec<ProcessDef>` への1エントリ追加のみで完了する、宣言的かつメンテナブルな設計とする。

## Background

現在、`src-tauri/src/lib.rs` の `setup()` フックは以下の順序で動作している：

```
① ensure_edition_data_dir()
② init_edition_home() → edition_home()
③ ensure_bifrost_binary(edition_home)   ← バイナリ展開のみ。起動はしていない
```

Bifrost のバイナリは展開されているが、プロセスとして起動されていない。今は不要でも、近い将来 Bifrost・TensorZero 等のサイドカーを同一の安全な枠組みで管理する必要がある。

`crates/procreg/` には process-registry クレートが既に存在し、以下が実装済みである：
- `ProcessRegistry`（`Arc<Mutex<Inner>>`、`Clone + Send + Sync`、Tauri State 適合）
- `ProcessDef` による宣言的プロセス定義（name, program, args, env, depends_on, restart, ready）
- `RestartPolicy::OnCrash / Always / Never`（指数バックオフ付き再起動）
- `ReadyCondition::TcpPort / LogContains / Delay / Immediate`（起動完了条件）
- `ChildGuard`（SIGTERM→wait→SIGKILL の Graceful Shutdown）
- `install_panic_hook`（パニック時安全網）+ `install_sigterm_handler`（Unix）
- `ProcessState`（serde対応、フロントエンドからJSON参照可能）
- 76件のユニットテスト全件パス

しかし、このクレートは `src-tauri` から参照されておらず、実際のサイドカー管理に使われていない。

## Scope

1. **`src-tauri/Cargo.toml` に `process-registry` 依存を追加**（path = "../crates/procreg"）
2. **`src-tauri/src/sidecar.rs` を新規作成** — 全サイドカーの `ProcessDef` 定義を集約する宣言的モジュール
   - `fn sidecar_defs(edition_home: &Path) -> Vec<ProcessDef>` を公開
   - 初期エントリ: Bifrost 1つのみ（`name: "bifrost"`）
   - 将来の追加はこの関数内に `ProcessDef` エントリを追加するだけで完了
3. **`src-tauri/src/lib.rs` の `setup()` フックを変更** — `ensure_bifrost_binary()` 完了後に以下を実行：
   - `ProcessRegistry::new()` でレジストリ作成
   - `sidecar_defs()` で定義を取得
   - `registry.start_all(defs).await` でサイドカー起動（依存順序自動解決）
   - `install_panic_hook(registry.clone())` でパニック安全網
   - `install_sigterm_handler` は Tauri の `on_stop` または `app.on_window_event` で代替
   - `ProcessRegistry` を `tauri::State` として管理可能な形で保持
4. **`app.on_window_event(CloseRequested)`** または Tauri の適切なフックで `registry.shutdown_all().await` を呼び出し、アプリ終了時の Graceful Shutdown を保証
5. **テスト**: process-registry の既存76テストが引き続きパスすること。必要に応じて統合テストで Bifrost（実際の tar.gz 展開〜起動）を確認

## Non-scope

- Bifrost 以外のサイドカー定義の追加（TensorZero 等は別チケット）
- **process-registry クレート自体の修正**（すでに MVP として完成しているため。バグ発見時のみ修正）
- Tauri フロントエンドからの ProcessRegistry 操作 UI（スナップショット表示等は将来）
- src-tauri 以外のバイナリ（server-core, server）での process-registry 利用

## Investigation

### 証拠1: 現在の setup() フック — バイナリ展開後、起動がない

**ファイル**: `src-tauri/src/lib.rs`（19-28行目）
```rust
.setup(|_app| {
    consts::ensure_edition_data_dir()
        .map_err(|e| Box::<dyn std::error::Error>::from(e.as_str()))?;
    consts::init_edition_home()
        .map_err(|e| Box::<dyn std::error::Error>::from(e.as_str()))?;
    let edition_home = consts::edition_home()
        .map_err(|e| Box::<dyn std::error::Error>::from(e.as_str()))?;
    bifrost::ensure_bifrost_binary(edition_home)  // ← 展開のみ
        .map_err(|e| Box::<dyn std::error::Error>::from(e.as_str()))?;
    Ok(())
})
```

`ensure_bifrost_binary()` の戻り値は `Result<(), String>` であり、バイナリが `EDITION_HOME/bifrost/bifrost-http` に配置されたことだけを保証する。プロセスの起動・監視・停止は行われていない。

### 証拠2: src-tauri/Cargo.toml に process-registry 依存がない

**ファイル**: `src-tauri/Cargo.toml`（20-30行目）
```
[dependencies]
tauri = { version = "2", features = ["macos-private-api"] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
dirs = "6.0.0"
flate2 = "1.1.9"
tar = "0.4.46"
```

`process-registry` のエントリが存在しない。追加が必要。

### 証拠3: process-registry クレートの全実装が完了している

**ファイル**: `crates/procreg/`

全マイルストーン（M0-1〜M11-1, M13-1）が完了し、76件のユニットテストがパスしている。
```
test result: ok. 76 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s
```

統合テストも2件あり、`test_fate_sharing` は Node.js TCP Echo サーバを使った実プロセス運命共同体テスト（ignore付き）。

### 証拠4: Bifrost のバイナリパスとポート

- **展開先**: `EDITION_HOME/bifrost/bifrost-http`（`deploy.rs:49` の `binary_filename()` 参照）
- **リッスンポート**: `BIFROST_PORT = 3912`（`CLAUDE.md:31` および `rules/rust/patterns.md:431` 参照）
- **バイナリ**: `bundled_archive()` で `include_bytes!` 埋め込み、初回 or バージョン不一致時のみ展開

### 証拠5: ProcessRegistry は Tauri State として適合する

**ファイル**: `crates/procreg/src/registry.rs:26-38行目`
```rust
pub struct ProcessRegistry {
    inner: Arc<Mutex<RegistryInner>>,
}

impl Clone for ProcessRegistry {
    fn clone(&self) -> Self {
        Self { inner: Arc::clone(&self.inner) }
    }
}
```

`Clone + Send + Sync` を満たすため、`tauri::State<ProcessRegistry>` として管理可能。

### 証拠6: ProcessState は serde 対応

**ファイル**: `crates/procreg/src/state.rs:13行目`
```rust
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum ProcessState { ... }
```

JSON シリアライズ可能であり、Tauri フロントエンドにそのまま返却できる。

## Test Plan

### ユニットテスト計画

process-registry クレート側は既存76テストでカバー済みのため、本チケットのテスト範囲は **src-tauri の sidecar 統合部分**に限定する：

| # | テスト対象 | 内容 | 種別 |
|---|-----------|------|------|
| 1 | `sidecar_defs()` | Bifrost の ProcessDef が正しく生成される（name, program, args, dependson, restart, ready の全フィールド確認） | ユニット |
| 2 | `sidecar_defs()` | 返される Vec の要素数が期待値（現在は1）と一致する | ユニット |
| 3 | `sidecar_defs()` | program パスが `edition_home/bifrost/bifrost-http` の形式になる | ユニット |
| 4 | `sidecar_defs()` | ready が `TcpPort { host: 127.0.0.1, port: BIFROST_PORT }` である | ユニット |
| 5 | `setup()` 内の実行順序 | `ensure_bifrost_binary()` → `registry.start_all()` の順で呼ばれること（コンパイル時に型で保証） | コンパイル時検証 |
| 6 | `process-registry` 既存テスト | 依存追加後も `cargo test --lib` が全パスすること | 回帰 |

カバレッジ目標: sidecar モジュールは 90% 以上（`sidecar_defs()` は純粋関数のため容易に達成可能）

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| 実際の Bifrost プロセス起動 | 実バイナリ（tar.gz 展開が必要）に依存する。process-registry クレートの統合テスト（`test_fate_sharing`）が実プロセス運命共同体を検証済み |
| Tauri の `on_window_event` と `shutdown_all` の結合 | Tauri ランタイム全体が必要。手動テストまたは将来の E2E で確認 |
| パニックフックによる停止 | `std::panic::set_hook` の動作確認は process-registry 側で実施済み |

## Boy Scout Rule — 翻訳可能性計画

修正対象は `src-tauri/src/lib.rs` の `setup()` フックおよび新規作成する `sidecar/mod.rs`。

- **`lib.rs`** の `setup()` は現在1つのクロージャにすべての責務（ディレクトリ作成 → ホーム初期化 → バイナリ展開 → 初回起動）が詰め込まれている。各ステップが関数として抽出された構造になっているが、`sidecar` 関連の処理を追加する際に責務の混在が起きないよう注意する
- **`sidecar_defs()`** は関数名が動詞句になっており、散文として「サイドカー定義を返す」と読める。命名維持
- Bifrost 以外のサイドカー追加時は `sidecar_defs()` 内で `vec![...]` にエントリを追加するだけで済む設計。この意図をコメントで明記する
- `BIFROST_PORT` などのポート番号は既に `CLAUDE.md` で定数管理されている。`sidecar.rs` でもハードコードせず、`consts` 経由または定数を参照する

## Acceptance Criteria

- [ ] `src-tauri` が `process-registry` を依存に含み、ビルドが通る
- [ ] `sidecar::sidecar_defs(edition_home)` が正しい `ProcessDef` を返す（テスト3件以上）
- [ ] `setup()` フック内で `ensure_bifrost_binary()` → `registry.start_all(sidecar_defs())` の順に実行される
- [ ] `install_panic_hook` によりパニック時の孤児プロセス防止が機能する
- [ ] アプリ終了時に `shutdown_all()` が呼ばれ Graceful Shutdown される
- [ ] process-registry クレートの既存76テストが全パスする
- [ ] `cargo build` が成功する

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0026-process-registry-fate-sharing/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0026-process-registry-fate-sharing/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0026-process-registry-fate-sharing/review.md（未作成、/review-ticket 全チェック通過後に作成）
