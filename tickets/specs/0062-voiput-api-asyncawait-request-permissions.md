---
ticket_id: 62
title: Voiput API — async/await 完全対応 + request_permissions 実装
slug: voiput-api-asyncawait-request-permissions
status: reviewed
ticket_ref: "M7-1"
created_at: 2026-06-12
updated_at: 2026-06-12
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0062-voiput-api-asyncawait-request-permissions/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0062-voiput-api-asyncawait-request-permissions/review.md
---

# Voiput API — async/await 完全対応 + request_permissions 実装

## Background

RFC §4.2 では `Voiput::start()` / `stop()` が `async fn` として定義されているが、現在の実装は同期関数である。また、RFC §4.2 で定義されている `request_permissions()` が未実装であり、利用者が権限取得フローを自力実装する必要がある。

これらの乖離は RFC との🔴矛盾（P0）に分類される。修正により RFC 完全準拠と、利用者体験の統一（権限管理の crate 内蔵）を達成する。

## Scope

### やること

1. **`src/voiput.rs` — `start()` / `stop()` を `async fn` に変更**
   - シグネチャ: `pub async fn start(&mut self) -> Result<()>` / `pub async fn stop(&mut self) -> Result<()>`
   - 内部で `tokio::spawn` されたタスクとの同期を `.await` で行う
   - `is_running` フラグも async コンテキストで安全にアクセス

2. **`src/voiput.rs` — `request_permissions()` を新規実装**
   - シグネチャ: `pub async fn request_permissions(&self) -> Result<bool>`
   - macOS: `SFSpeechRecognizer.requestAuthorization()` を FFI 経由で呼び、i32 権限ステータスを返す
   - Windows: `health_check()` の bit 2（Permission フラグ）を確認して返す
   - 非対応OS: `Ok(false)` を返す

3. **`src/binary/test-run.rs` — `test_voiput()` の async 化**
   - `voiput.start().await` / `request_permissions().await` を使用
   - `tokio::runtime::Runtime` でブロックオン駆動

4. **`tests/integration_test.rs` — async 対応テストに更新**
   - `#[tokio::test]` を活用した非同期テストの追加

### やらないこと

- SpeechRecognizer の引数整理（M7-2）
- UnsupportedEngine 型修正（M7-2）
- health_check 完全実装（M7-3）
- Cargo.toml include 設定（M7-3）

## Investigation

### 現状のコード調査

**`src/voiput.rs` — 現在の start() / stop() シグネチャ:**

```rust
// 現在: 同期関数
pub fn start(&mut self) -> Result<()> {
    self.recognizer.start()
}

pub fn stop(&mut self) -> Result<()> {
    self.recognizer.stop()
}
```

RFC §4.2 では `async fn start(&mut self) -> Result<()>` / `async fn stop(&mut self) -> Result<()>` が要求されている。

**`recognizer.rs` — SpeechRecognizer の start()/stop():**

SpeechRecognizer の start() は OpenAI バックエンドで `tokio::spawn` を使用して非同期タスクを起動している。同期ラッパーになっているため、非同期タスクの完了待ちが適切に行われていない。

**`voiput.rs` — request_permissions() 不在:**

現在の Voiput 構造体には `request_permissions()` メソッドが存在しない。権限取得は利用者側で実装する必要がある。

**macOS FFI — 権限取得関数:**

`native/mac_ffi.rs` に `speech_helper_request_authorization` の extern 宣言があると仮定（確認が必要）。RFC §7.14 および付録E で定義。

**現状のテスト (`tests/integration_test.rs`):**

`#[tokio::test]` が既に使用可能かどうか確認が必要。`dev-dependencies` に `tokio` が features `["rt", "macros"]` で追加されているか確認する。

### 物理的証拠（要確認項目）

1. `src/voiput.rs` の start/stop が同期関数であること → ファイル内容確認済み
2. `native/mac_ffi.rs` に `speech_helper_request_authorization` の extern 宣言が存在するか → 確認が必要
3. Windows の health_check bit 2 が Permission フラグであることの確認 → `native/win_ffi.rs` 確認
4. `Cargo.toml` の dev-dependencies に tokio があるか → 確認が必要

## Test Plan

### ユニットテスト計画

**テスト対象: `src/voiput.rs`（Voiput 構造体のメソッド）**

| # | テストケース | 種別 | 説明 |
|---|-------------|------|------|
| 1 | `Voiput::request_permissions()` が macOS で i32 を返す | 正常系 | FFI 経由で権限ステータスが整数で返る |
| 2 | `start().await` が `request_permissions()` 呼び出し後に正常開始 | 正常系 | 権限確認 → start のシーケンス |
| 3 | `stop().await` が正常終了する | 正常系 | 稼働中の認識器を停止 |
| 4 | `stop().await` が冪等（2回呼んでもエラーにならない） | 異常系 | 既停止状態での stop |
| 5 | `flush().await` が既存動作を維持する | 回帰 | M5-2 で実装済みの flush 動作が壊れない |
| 6 | 非同期コンテキスト外で start/start を呼ぶとコンパイルエラー | 型検証 | `.await` なしでの呼び出しがコンパイル時に検出される |
| 7 | 非対応OS で `request_permissions()` が `Ok(false)` を返す | 異常系 | `#[cfg(not(any(target_os = "macos", target_os = "windows")))]` 条件 |
| 8 | `request_permissions()` が Windows で `health_check()` の bit 2 を確認 | 正常系 | Permission フラグの読み取り |

**カバレッジ目標**: 90%以上（クリティカルパス: start/stop/flush）

**モック/スタブ**: SpeechRecognizer のモックは不要。mpsc チャネル経由のイベント駆動でテスト可能。

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| macOS 実機での権限ダイアログ表示テスト | 実機/CI での macOS 実環境が必要。ユーザー操作が必要なダイアログのため自動化不可 |
| Windows 実機での health_check bit 2 確認 | Windows 実機/CI 環境でのみ実行可能。WinRT ネイティブライブラリが必要 |

## Boy Scout Rule — 翻訳可能性計画

### スコープ内改善

- `src/voiput.rs`: `start()`/`stop()` の async 化に伴い、内部のタスク管理ロジックを明確な関数名で抽出する（`spawn_listener_task()`, `spawn_ticker_task()` 等が該当すれば関数に切り出す）
- `src/voiput.rs`: `request_permissions()` 実装時、OS 条件分岐を `request_permissions_macos()`, `request_permissions_windows()` 等の内部ヘルパーに分割して読みやすくする

### スコープ外改善（Boy Scout Rule）

- 既存の `flush()` 内の `stop` → `next_event` ループ → `start` のシーケンスが散文的に読めるようになっているか確認し、コメントではなくコードで意図が伝わるよう改善

## Acceptance Criteria

- [ ] `voiput.start().await?` がコンパイル可能であること
- [ ] `voiput.stop().await?` がコンパイル可能であること
- [ ] `voiput.request_permissions().await?` がコンパイル可能であること
- [ ] 全既存テストが通過すること（回帰ゼロ）
- [ ] macOS で `request_permissions()` が `SFSpeechRecognizer.requestAuthorization()` を FFI 経由で呼ぶこと
- [ ] Windows で `request_permissions()` が `health_check()` の bit 2 を確認すること
- [ ] 非対応OS で `request_permissions()` が `Ok(false)` を返すこと
- [ ] 非同期コンテキスト外で start/stop を呼ぶとコンパイルエラーになること
- [ ] 翻訳可能性チェック通過（動詞句関数名、変数名がドメイン概念を表現）
- [ ] 品質チェッカー指摘ゼロ

## Notes

### 成果物

- 計画: context/0062-voiput-api-asyncawait-request-permissions/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0062-voiput-api-asyncawait-request-permissions/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0062-voiput-api-asyncawait-request-permissions/review.md（未作成、/review-ticket 全チェック通過後に作成）
