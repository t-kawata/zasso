---
ticket_id: 89
title: OrchestratorInput 非録音時自動開始 + 遅延フラッシュ種別追跡
slug: orchestratorinput
status: done
created_at: 2026-06-15
updated_at: 2026-06-15
plan_path: /Users/kawata/shyme/zasso/tickets/context/0089-orchestratorinput/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0089-orchestratorinput/implementation.md
---
# OrchestratorInput 非録音時自動開始 + 遅延フラッシュ種別追跡

## Summary

#88 で実装した OrchestratorInput（Ctrl+Option）に以下の2つの問題がある:

1. **非録音時に Ctrl+Option を押しても無視される**
2. **遅延フラッシュ時のペースト先が未対応** — `execute_pending_flush()` が常にクリップボードペーストを行い、Flushed イベントにならない

## Background

### 問題1: 非録音時無視

ログ:
```
[Hotkey] OrchestratorInput ignored: not recording
```

### 問題2: 遅延フラッシュ先

`pending_flush=true` → `SttCompleted` → `execute_pending_flush()` → 常に clipboard ペースト。

## Scope

### 含むもの

#### 修正1: OrchestratorInput 非録音時自動開始
`is_running()` ガードを削除し、非録音時は録音を開始する（`HotkeyAction::Start` と同じ処理）

#### 修正2: pending_flush 種別追跡
`Voiput` 構造体に `pending_flush_is_orchestrator: bool` を追加し、`execute_pending_flush()` で分岐

### 変更ファイル: `crates/voiput/src/voiput.rs` のみ

## Test Plan

### ユニットテスト計画
- 非録音時 Ctrl+Option → 録音開始
- pending_flush + is_orchestrator → Flushed 発行
- pending_flush + !is_orchestrator → clipboard ペースト
- 既存テスト全件パス

## Acceptance Criteria
- [ ] 非録音中 Ctrl+Option → 録音開始
- [ ] 録音中 Ctrl+Option → Flushed 発行
- [ ] 遅延フラッシュが正しい種別で発行される
- [ ] 既存テスト全件パス
