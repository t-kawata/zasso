---
ticket_id: 3
title: check-final 強化 — find-omissions 同等分析の組み込みと create-omissions 拡張
slug: check-final-find-omissions-create-omissions
status: draft
created_at: 2026-06-25
updated_at: 2026-06-25
---

# check-final 強化 — find-omissions 同等分析の組み込みと create-omissions 拡張

## Summary

開発完了ゲート `check-final.md` を、`find-omissions-for-next-rfc.md` と同一の分析を行った上で完了判定する実質的なゲートに強化する。あわせて `create-omissions.js` に `--check-final` オプションを追加し、9ステップのスケルトンを生成可能にする。

## Background

現在の `check-final.md` は3条件（チケット全reviewed、OMISSIONS軽微、最終走査）だけをチェックするが、肝心の「実装とRFC設計の間に本当に漏れがないか」を検証しない。特に条件2は既存OMISSIONSを読むだけで、新たに発見漏れがないかを能動的に確認しない。無意味なゲートに陥っている。

また、`create-omissions.js` は6ステップのスケルトンがハードコードされており、check-final が9ステップ必要な場合にそのまま流用できない。

## Scope

### 変更（2ファイル）

| ファイル | 種別 | 内容 |
|----------|------|------|
| `check-final.md` | **改修** | find-omissions-for-next-rfc.md を完全コピー + Step 7-9 追加 |
| `create-omissions.js` | **改修** | `--check-final` オプション追加（9ステップスケルトン選択） |

### 変更しないファイル

- `find-omissions-for-next-rfc.md` — コピー元として編集しない
- 全スクリプト（create-omissions.js 以外） — 既存を流用
- `test.sh` — create-omissions.js の既存テストは影響なし

## Non-scope

- find-omissions-for-next-rfc.md の内容変更
- PX-2 で実装した各種 add-omissions-* 等のスクリプトの改修

## Investigation

### check-final.md の現状

現在の3条件：
1. 全チケット reviewed
2. OMISSIONS 軽微（既存OMISSIONSを読むだけ）
3. 最終走査（スキーマ検証 + 犯罪スキャン）

条件2が問題：既存の OMISSIONS を読むだけで新たな発見漏れを確認しない。

### create-omissions.js の steps ハードコード

`SKELETON_STEPS` は6ステップ固定。check-final は以下が必要：

```
Step 1-6: find-omissions と同一の分析
Step 7: 新規OMISSIONSと既存OMISSIONSの照合
Step 8: 全チケット reviewed 確認
Step 9: 最終結果報告
```

### 呼び出しの違い

```
find-omissions:  node create-omissions.js "$RFC_PATH"
check-final:     node create-omissions.js "$TOP_RFC_PATH" --check-final
```

## Test Plan

### ユニットテスト計画 — create-omissions.js

| ケース | 内容 |
|--------|------|
| `--check-final` で9ステップ | steps 配列の長さが9 |
| 引数なしで6ステップ（既存維持） | steps 配列の長さが6 |

### ユニットテスト不可能な項目

- check-final.md の動作確認は Claude Code 上での手動実行

## ファイル別実装仕様

### 1. create-omissions.js 改修

`SKELETON_STEPS_CHECK_FINAL` を追加。

引数パース部分に条件分岐を追加：
```javascript
const isCheckFinal = process.argv[3] === '--check-final';
const steps = isCheckFinal ? SKELETON_STEPS_CHECK_FINAL : SKELETON_STEPS;
```

Step 7-9 の内容：
- Step 7: OMISSIONS照合（生成したOMISSIONSにomissionがあるか確認）
- Step 8: 全チケット確認（全チケットのstatus確認）
- Step 9: 最終結果報告（PASS/FAIL判定）

### 2. check-final.md 全面書き換え

`find-omissions-for-next-rfc.md` から完全コピーし、以下の2点のみ変更：

**変更1**: create-omissions.js 呼び出しに `--check-final` 付与
**変更2**: 末尾に Step 7-9 を追加

## Boy Scout Rule

- `create-omissions.js` 改修は最小限（変数追加と条件分岐のみ）
- 変数名 `isCheckFinal`, `SKELETON_STEPS_CHECK_FINAL` は目的を明示

## Acceptance Criteria

- [ ] `create-omissions.js --check-final` で9ステップ生成
- [ ] `create-omissions.js`（引数なし）で従来の6ステップ（回帰なし）
- [ ] `check-final.md` の Step 1-6 が `find-omissions-for-next-rfc.md` と完全一致
- [ ] `check-final.md` に Step 7-9 が追加されている
- [ ] `bash test.sh` 全 PASS

## Notes

- 実装順序: create-omissions.js 改修 → check-final.md 全面書き換え → test.sh 確認
- PX-1 で作成した `create-omissions.js` を改修
- PX-2 のスクリプト群は流用のみ
