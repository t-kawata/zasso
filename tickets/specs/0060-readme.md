---
id: 60
title: "README（最終ドキュメント）"
status: done
ticket_ref: "M6-3"
created_at: "2026-06-12"
updated_at: 2026-06-12
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0060-readme/implementation.md
---

## Background

voiput crate が完成したが、`README.md` が存在しない。利用者が crate を評価・利用開始するためのドキュメントが必要。

## Scope

`crates/voiput/README.md` の新規作成。

## Non-scope

- 既存コードの変更は一切行わない

## Acceptance Criteria

1. `crates/voiput/README.md` が存在すること
2. 以下のセクションを含むこと:
   - **概要**: ポータブル音声入力 crate の説明
   - **クイックスタート**: 最小コード例
   - **対応プラットフォーム**: macOS / Windows / 全プラットフォーム
   - **設定**: VoiputConfig ビルダー
   - **エンジン**: OpenAI / OS ネイティブ
   - **権限設定**: macOS / Windows
   - **モデルファイル**: 自動ダウンロードの説明
   - **開発**: cargo test / test-run.rs
   - **ライセンス**: MIT

## Test Plan

README のためテスト不要。目視確認でレビュー。

## Implementation Steps

### Step 1: README.md を作成

`crates/voiput/README.md` にマークダウンで記述。

## Review Method

1. `test -f crates/voiput/README.md` — ファイル存在
2. 全セクションが含まれていることを目視確認
