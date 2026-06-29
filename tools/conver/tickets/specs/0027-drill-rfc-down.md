---
ticket_id: 27
title: drill-rfc-down スラッシュコマンドの実装
slug: drill-rfc-down
status: draft
created_at: 2026-06-29
updated_at: 2026-06-29
---

# drill-rfc-down スラッシュコマンドの実装

## Summary

`/drill-rfc-down` スラッシュコマンドを新設する。既存のRFCファイルに対して `/grill-me-for-next-rfc-ja` と同様の質問攻め（grill）機構を用いて考慮不足・設計不足の穴を塞ぐ。出力は対象RFCファイル**自身への追記**であり、破壊的変更は禁止。

**実行引数**:
```
/drill-rfc-down </path/to/target-rfc-file.md>
```

## Background

既存のRFCは実装を進める中で「この部分の設計が不足している」「このインターフェースの詳細が定義されていない」といった穴が見つかることがある。従来は:

1. `/find-omissions-for-next-rfc` → `/grill-me-for-next-rfc-ja` → `/formulate-tickets-for-next` という重いサイクルが必要だった
2. または人手でRFCを直接編集するが、grill による質問ベースの設計判断プロセスを経ないため考慮漏れが残りやすい

`/drill-rfc-down` はこのギャップを埋める。既存の grill 機構を再利用しつつ、既存RFCへの追記に特化する。

## `/grill-me-for-next-rfc-ja` との差異

| 観点 | grill-me-for-next-rfc-ja | drill-rfc-down |
|------|------------------------|---------------|
| 入力 | OMISSIONS-XXX.md（新規問題） | 既存RFCファイル（追記対象） |
| 出力 | 別ファイル（NEXT_RFC.md） | 入力と同じファイルに追記 |
| DesignTree初期化 | 常に新規＋旧セッション退避 | 既存ファイルを再利用、なければ新規作成 |
| 編集方針 | 新規ファイルに自由記述 | 追記最優先、破壊的変更禁止 |
| セッション継続 | 不可（毎回初期化） | 可能（途中から再開） |

## Scope

1. **`.claude/commands/drill-rfc-down.md`** — スラッシュコマンド定義

2. **スクリプト再利用判定:**

   | スクリプト | 再利用 | 理由 |
   |-----------|--------|------|
   | `update-tree.js` | ✅ そのまま | DesignTree操作は完全同一 |
   | `tree-query.js` | ✅ そのまま | 未解決ノード取得は同一 |
   | `update-status.js` | ✅ そのまま | Status操作は同一 |
   | `session-status.js` | ✅ そのまま | セッション状況表示は同一 |
   | `check-all-schema.js` | ✅ そのまま | スキーマ検証は同一 |
   | `generate-checklist.js` | ✅ そのまま | チェックリスト生成は同一 |
   | `validate-question-format.js` | ✅ そのまま | 質問フォーマット検証は同一 |
   | `list-files.js` | ✅ そのまま | researchPath読み取り＋一覧表示 |

3. **`.claude/scripts/grill-me-for-rfc/init-for-drill-rfc-down.js`** — 専用初期化スクリプト
   - 既存 DesignTree.json / Status.json / CheckList.md の有無をチェック
   - 存在すればそのまま使用（セッション継続）
   - 存在しなければ `init.js` を呼び出して新規生成
   - 既存ファイルを決して上書きしない安全機構

## Non-scope

- `init-for-grill-me-for-next-rfc.js` の改修（既存スクリプトは変更しない）
- `grill-me-for-next-rfc-ja.md` の改修（既存コマンドは変更しない）
- OMISSIONS-XXX.json の生成（drill-rfc-down は omission 検出ではなく穴塞ぎが目的）

## Investigation

### grill-me-for-next-rfc-ja のアーキテクチャ

```
STEP 0: init-for-grill-me-for-next-rfc.js → init.js → Status/DesignTree/CheckList生成
STEP 1: update-tree.js add — 初期ノード追加
STEP 2: tree-query.js + validate-question-format.js + update-tree.js resolve — grill
STEP 3: generate-checklist.js — チェックリスト充填
STEP 4: 新規RFCファイルに記述（AI）
STEP 5: check-all-schema.js — スキーマ検証
STEP 6: 完了報告
```

### init-for-grill-me-for-next-rfc.js が専用化必須の理由（96行）

現状の init スクリプトは以下の動作を含む:
1. **旧セッション退避**: 既存の Status/DesignTree/CheckList を `grills/` に移動 → **drillではセッション継続のために保持しなければならない**
2. **常に新規生成**: init.js を常に呼び出して新規ファイルを作成 → **drillでは既存ファイルがあればスキップ**

したがって `init-for-drill-rfc-down.js` を新規作成し、以下のロジックとする:

```javascript
// 疑似的な処理フロー:
function main(targetRfcPath) {
  const rfcDir = path.dirname(targetRfcPath);
  const files = ["Status.json", "DesignTree.json", "CheckList.md"];
  const existing = files.filter(f => fs.existsSync(path.join(rfcDir, f)));
  const missing = files.filter(f => !existing.includes(f));

  if (existing.length === 3) {
    // セッション継続: researchPath のみ更新
    updateResearchPath(rfcDir, targetRfcPath);
    return { session: "continued", files: existing };
  }

  // research-path = targetRfcPath, output-path = targetRfcPath（自身に追記）
  spawnSync("node", [initJs, targetRfcPath, targetRfcPath], { cwd: rfcDir });
  return { session: "new", files: generated };
}
```

### 編集ポリシー（絶対ルール）

```
追記可能 → 追記:
  1. 対象RFCの末尾に新しい設計判断を追記
  2. <!-- drill:YYYY-MM-DD/Q番号 --> でマーキング
  3. 「何が不足していたのか」「どう解決したか」を明記

追記不可能 → 最小限の部分修正:
  1. 該当箇所のみ最小単位で修正
  2. <!-- drill:fix:YYYY-MM-DD/Q番号: 理由 --> を付与
  3. 修正前後の差分が最小であることを確認

絶対禁止:
  - 全文書き直し・セクション削除・既存記述の上書き
  - 対象RFCファイル以外への出力
```

## Test Plan

### ユニットテスト計画

**init-for-drill-rfc-down.js:**

| テストケース | 内容 |
|------------|------|
| 正常系: 初回実行 | 3ファイルなし → init.js で新規生成 |
| 正常系: セッション継続 | 3ファイル全て存在 → そのまま使用 |
| 正常系: 一部欠落 | CheckList.md のみ欠落 → 欠落分のみ生成 |
| 異常系: 対象RFCなし | 指定ファイルが存在しない → エラー |
| 安全機構: 既存上書き禁止 | 既存ファイルが変更されないことを確認 |

### ユニットテスト不可能な項目

- grill 質問の意味的正確性（grill-me-for-next-rfc-ja と同一）
- 追記内容の設計的正確性
- grill セッションの対話フロー

## Boy Scout Rule — 翻訳可能性計画

`init-for-drill-rfc-down.js`:
- 関数名は動詞句: `checkExistingFiles()`, `ensureInitFiles()`, `main()`
- 一関数一責務: ファイル存在確認・初期化判断・init.js呼び出しを分離
- エラー握りつぶし禁止

`drill-rfc-down.md`:
- STEP 2（grill）は `grill-me-for-next-rfc-ja.md` と完全同一のため、重複記述せず参照で済ませる
- 編集ポリシーは spec の内容をコマンドファイル内にも明記する

## Acceptance Criteria

- [ ] `/drill-rfc-down <target-rfc.md>` が動作する
- [ ] 既存 DesignTree/Status/CheckList が存在すれば再利用される
- [ ] 存在しなければ新規生成される
- [ ] grill セッションが grill-me-for-next-rfc-ja と同一品質で動作する
- [ ] 対象RFCへの編集は追記最優先で行われる
- [ ] 追記箇所に `<!-- drill:YYYY-MM-DD/Q番号 -->` が付与される
- [ ] 全文書き換え・セクション削除・既存記述の上書きが行われない
- [ ] 既存の grill スクリプト群が壊れていない
- [ ] `init-for-grill-me-for-next-rfc.js` が変更されていない
- [ ] 既存テスト全件 PASS / 犯罪ゼロ

## Notes

- PX（独立フェーズ）。既存 grill スクリプト群に追加。
- 専用スクリプトは `init-for-drill-rfc-down.js` のみ。他の grill スクリプトは全てそのまま再利用。
- `init-for-drill-rfc-down.js` は `grill-me-for-rfc/` ディレクトリに配置。
- 編集ポリシーは spec に定義。コマンドファイルにも同内容を明記。
