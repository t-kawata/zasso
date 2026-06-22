---
ticket_id: 188
title: M6-8: inference/raw.rs 削除
slug: m6-8-inferencerawrs
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
plan_path: 
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0188-m6-8-inferencerawrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0188-m6-8-inferencerawrs/review.md
---
# M6-8: inference/raw.rs 削除

## Summary

`inference/raw.rs` の物理ファイル削除と、`inference/mod.rs` に残るコメントアウトされた `pub mod raw` 宣言の完全除去を行う。M6-5 で `InferenceEngine` トレイトから `send_raw` メソッドが削除されたことに伴う後片付けチケット。

## Background

M6-5（`InferenceEngine` トレイト3メソッド化）において、llama-cpp-2 には mistralrs の `RequestBuilder` に相当する概念がないため、`send_raw` メソッドがトレイトから削除された。これに伴い：

1. `pub mod raw` 宣言がコメントアウトされ（`[::STUB::]` マーカー付与）、ファイル自体は残っていた
2. M6-5 実装完了後、`inference/raw.rs` は物理的に削除されたが、`inference/mod.rs` のコメントアウト行が残存している

本チケットはこの残存コメントのクリーンアップを行う。

## Scope

- `inference/mod.rs` の `// pub mod raw;  // [::STUB::] M6-8:` 行を削除する（コメントアウトされたモジュール宣言と `[::STUB::]` マーカーの完全除去）
- `[::STUB::]` マーカーが解決されたことを確認する（後続のスタブスキャンで検出されなくなる）

## Non-scope

以下の `send_raw` 参照は M6-9（サーバー層置き換え）のスコープであり、本チケットでは扱わない：

- `server/openai.rs` — `engine.send_raw()` 呼び出し（76行目、137行目）
- `server/router.rs` テスト — `mock.expect_send_raw()` 参照（154行目、257行目、317行目、370行目）
- `inference/generate.rs` の `no_send_raw_in_generate_module` テスト（468〜476行目） — これは send_raw が generate モジュールに存在しないことを**検証する**テストであり、削除対象ではない

## Investigation

### 物理的証拠

**1. `inference/raw.rs` の不在確認**

```bash
$ ls crates/ggufrs/src/inference/raw.rs
ls: crates/ggufrs/src/inference/raw.rs: No such file or directory
```

→ ファイルは既に物理削除済み。

**2. `inference/mod.rs` の残存参照**

`crates/ggufrs/src/inference/mod.rs` 20行目：

```rust
// pub mod raw;  // [::STUB::] M6-8: 削除予定（mistralrs の RequestBuilder 依存のため）
```

→ コメントアウトされたモジュール宣言と `[::STUB::]` マーカーのみが残存。

**3. `send_raw` 参照の分布**

| ファイル | 行数 | 内容 | 所属 |
|---------|------|------|------|
| `server/openai.rs` | 76, 106, 137 | `engine.send_raw()` 呼び出し | M6-9 |
| `server/router.rs` | 153-154, 161-162, 182, 216, 257, 315, 317, 370 | `mock.expect_send_raw()` | M6-9 |
| `inference/mod.rs` | 20 | `// pub mod raw;` コメントアウト | **本チケット** |
| `inference/generate.rs` | 468-475 | `send_raw` 不在確認テスト（削除対象外） | 正常系 |

**4. スタブスキャン結果**

```json
{"count":8,"stubs":[
  {"file":"settings.rs","line":19,"content":"dead_code 抑制"},
  {"file":"error.rs","line":12,24,91,194,321,"content":"M6-11 差し替え予定"},
  {"file":"inference/mod.rs","line":20,"content":"M6-8: 削除予定"},
  {"file":"server/router.rs","line":130,"content":"M6-11 差し替え予定"}
]}
```

→ `inference/mod.rs:20` のスタブが本チケットの対象。

**5. 犯罪スキャン結果**

```
0 records — 未解決の犯罪なし
```

**6. 依存関係**

| チケット | 状態 | 関係 |
|---------|------|------|
| M6-5 (#185) | ✅ done | 先行必須。`send_raw` をトレイトから削除済み |
| M6-6 (#186) | ✅ done | generate.rs 書き換え完了。send_raw 参照なし |
| M6-7 (#187) | ✅ done | stream.rs 書き換え完了。raw.rs 非依存 |
| M6-9 | ⏳ pending | 後続。`send_raw` 参照をサーバー層から除去 |

## Test Plan

### ユニットテスト計画

- **対象**: なし（既存テストを変更しない）
- **検証方法**: `cargo check` の成功で確認
- **追加テスト**: 不要。既存の `no_send_raw_in_generate_module` テストが `send_raw` のトレイト不在を検証している

### ユニットテスト不可能な項目（例外）

- 該当なし

## Boy Scout Rule — 翻訳可能性計画

- `inference/mod.rs` のコメントアウト行を削除するのみ。既存コードの翻訳可能性に影響はない
- 該当するスコープ内の翻訳可能性改善項目はなし

## Acceptance Criteria

- [ ] `cargo check` が成功すること
- [ ] `inference/mod.rs` から `pub mod raw` の記述が完全に除去されていること
- [ ] スタブスキャンで `inference/mod.rs` の M6-8 スタブが検出されなくなること
- [ ] 既存テストがすべて通過すること

## Notes

### 成果物

- 計画: context/0188-m6-8-inferencerawrs/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0188-m6-8-inferencerawrs/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0188-m6-8-inferencerawrs/review.md（未作成、/review-ticket 全チェック通過後に作成）
