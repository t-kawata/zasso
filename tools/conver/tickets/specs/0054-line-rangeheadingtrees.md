---
ticket_id: 54
title: グラフ参照の見出しトークン化 — Line-Range廃止とHeading+Tokens方式への移行
slug: line-rangeheadingtrees
status: made
created_at: 2026-07-07
updated_at: 2026-07-07
ticket_key: PX-19
---

# グラフ参照の見出しトークン化 — Line-Range廃止とHeading+Tokens方式への移行

## Summary

現在の `node.schema.json` が持つ `sourceRanges`（行番号範囲 + refId）を廃止し、見出しレベルとトークン列による `headingRefs` に置き換える。これにより：

1. **行番号ズレ問題の根本解決**（138件の誤差実績がゼロになる）
2. **マーカー埋め込み（embed-markers.js）の廃止** — ソースファイルを改変しない
3. **query.js の行番号動的解決（resolveCurrentLines）の廃止**
4. **ソース編集耐性の劇的向上** — 見出しが書き換えられなければ常に正しい位置を指す

## Background

2026-07-06、`RFC-ROOT.md`（3,776行）に対して graphify-rfc を実行した結果、以下の問題が確認された：

| 問題 | 詳細 |
|------|------|
| 行数減少 | 3,776行 → 3,764行（**12行消失**） |
| 内容不一致行 | **138行**でマーカーを除去しても元の内容と一致しない |
| マーカー非独立行 | 276個中**276個（100%）** が既存行に前置されていた |
| 重複マーカー | 1行に2つのマーカーが混在（REF173-END + REF172-END） |

原因は「Step 1 でAIが生成した sourceRanges の行番号が実際の内容とずれている」こと。embed-markers.js はその誤った行番号を信頼してマーカーを挿入したため、全く関係ない行にマーカーが付与され、結果として内容が消失した。

根本対策として、**行番号を一切使わない**参照方式に移行する。

## Scope

### 対象
1. **新規スクリプト**: `deduplicate-headings.js` — 見出し重複排除の前処理（graphify-rfc Step 0）
2. **新規スクリプト**: `resolve-by-heading.js` — 見出し+トークンからファイル内の行を特定（embed-markers.js + query.js resolveCurrentLines の後継）
3. **スキーマ変更**: `node.schema.json` の `sourceRanges` → `headingRefs` 置き換え
4. **スクリプト修正**: `crud.js`（refId自動採番の参照先変更）、`analyze-source-structure.js`（headingRefs の機械的抽出）
5. **スクリプト廃止**: `embed-markers.js`（マーカー埋め込み不要に）
6. **スクリプト修正**: `query.js`（resolveCurrentLines → resolveByHeading）
7. **スクリプト修正**: `show-graph-summary-markdown.js`（行番号表示 → 見出し表示）
8. **コマンド修正**: `graphify-rfc.md`（Step 0 追加 + Step 4 マーカー埋め込み削除 + Step 5 自己検証の行番号検証削除）
9. **テスト更新**: 上記全変更のテスト追従
10. **RFC文書の更新**: RFC-GRAPHIFY.md の sourceRanges → headingRefs 記述変更

### 非スコープ
- `formulate-tickets.md` / `formulate-tickets-for-next.md` の改修（これらはグラフの kind と edge のみを参照しており、影響なし）
- `verify.js` の変更（カバレッジ検証は引き続き全文カバーをチェックするが、行番号ではなく sourceRanges の有無で判断）
- 既存グラフJSONとの互換性（古い sourceRanges を持つグラフは再 graphify が必要）

## Investigation

### 現状のクリティカルパス

```
graphify Step 1: AI が sourceRanges を生成（startLine/endLine を行番号で指定）
    ↓
crud.js create-nodes: refId を自動採番し、sourceRanges をそのまま保存
    ↓
graphify Step 3: verify.js が sourceRanges のカバレッジを行番号で検証
    ↓
graphify Step 4: embed-markers.js が sourceRanges の行番号を信頼してマーカー挿入
    ↓
query.js: resolveCurrentLines がマーカー位置から現在行番号を動的解決
```

このパイプラインのうち `embed-markers.js` と `resolveCurrentLines` が行番号問題の影響を直接受ける。

### 新しい設計

```
graphify Step 0: deduplicate-headings.js で見出し重複を排除（A-Z追記）
    ↓
graphify Step 1: AI が headingRefs を生成（行番号ゼロ）
    ↓
crud.js: headingRefs を検証して保存（refId 自動採番は継続）
    ↓
[embed-markers.js 廃止 — マーカー埋め込み不要]
    ↓
resolve-by-heading.js: heading + tokens だけでファイル内の位置を特定
    ↓
query.js / show-graph-summary-markdown.js: headingRefs から行位置を動的解決
```

### node.schema.json の変更

**現行**:
```json
"sourceRanges": {
  "type": "array",
  "minItems": 1,
  "items": {
    "type": "object",
    "required": ["refId", "startLine", "endLine"],
    "properties": {
      "refId": { "type": "string", "pattern": "^REF[0-9]{3,}$" },
      "startLine": { "type": "integer", "minimum": 1 },
      "endLine": { "type": "integer", "minimum": 1 }
    }
  }
}
```

**新**:
```json
"headingRefs": {
  "type": "array",
  "minItems": 1,
  "items": {
    "type": "object",
    "required": ["refId", "heading", "texts"],
    "additionalProperties": false,
    "properties": {
      "refId": { "type": "string", "pattern": "^REF[0-9]{3,}$" },
      "heading": { "type": "integer", "minimum": 0, "maximum": 6 },
      "texts": {
        "type": "array",
        "minItems": 1,
        "items": { "type": "string", "minLength": 1 }
      }
    }
  }
}
```

### deduplicate-headings.js の仕様

graphify-rfc の最初（Step 0）で実行する。`^#{1,6}\s+` で全見出し行を抽出し、同一階層内で同一テキストの見出しが複数ある場合、末尾に ` A`, ` B`, ... ` Z` を追記する。

```bash
# 実行例
node .claude/scripts/rfc-graph/deduplicate-headings.js "$1"
```

**重複排除ルール**:
- 「### 補足」が2回出現 → 1回目はそのまま、2回目は「### 補足 A」に変更
- 「### 補足」が3回出現 → 「### 補足」「### 補足 A」「### 補足 B」
- 26件まで対応（A〜Z）。27件目以降はエラー終了
- 変更はゴミ箱ファイルにログ出力（`<ファイル名>.bak` とは別に管理）

このスクリプトにより、同じ heading レベルで同じ texts が2つ以上存在することが原理的に防止される。

### resolve-by-heading.js の仕様

```bash
# 実行例
node .claude/scripts/rfc-graph/resolve-by-heading.js --source="$1" --heading=3 --texts="6.1,Crate,責務分割方針（設計判断）"
# 出力: {"line": 192, "confidence": "exact"} または {"line": 192, "confidence": "partial"}
```

**照合アルゴリズム（4段階フォールバック）**:

```
1. "^### " かつ "6.1" → 1行?
     ├─ Yes → 確定、confidence: "exact"
     └─ No → 2へ
2. "^### " かつ "6.1" かつ "Crate" → 1行?
     ├─ Yes → 確定、confidence: "exact"
     └─ No → 3へ
3. "^### " かつ "6.1" かつ "責務分割方針（設計判断）" → 1行?
     ├─ Yes → 確定、confidence: "partial"
     └─ No → 4へ
4. "^### " かつ "6.1" かつ "Crate" かつ "責務分割方針（設計判断）" → 1行?
     ├─ Yes → 確定、confidence: "partial"
     └─ No → 複数行/0行 → headingが大きい方を正とする
            headingも同じ → texts を連結(join)して grep、1行なら確定
            それでも複数/0行 → エラー終了
```

**confidence の意味**:
- `exact`: 1段階目で確定（見出しの冒頭部分のみで一意）
- `partial`: 2〜4段階目で確定（より多くのトークンが必要だった）

### graphify-rfc.md の Step 変更

| Step | 現行 | 新 | 備考 |
|------|------|-----|------|
| Step 0 | （なし） | **見出し重複排除** | `deduplicate-headings.js` を追加 |
| Step 1 | ノード分割（sourceRanges） | ノード分割（**headingRefs**） | AI は heading+texts のみ指定 |
| Step 2 | エッジ付与 | エッジ付与 | 変更なし |
| Step 3 | 機械検証 | 機械検証 | verify.js は headingRefs の有無チェックに変更 |
| Step 4 | **マーカー埋め込み** | **廃止** | embed-markers.js 削除 |
| Step 5 | 自己検証（行番号確認） | 自己検証（**heading解決確認**） | resolve-by-heading.js で全ノードの位置が特定できるか確認 |
| Step 6 | 最終品質検証 | 最終品質検証 | show-graph-summary-markdown.js の行番号 → 見出し表示に変更 |

### 既存テストへの影響

| テストファイル | 影響 | 対応 |
|--------------|------|------|
| `embed-markers.test.cjs` | **全テスト削除** | スクリプト廃止に伴い削除 |
| `query.test.cjs` | `resolveCurrentLines` のテスト削除 | 代わりに `resolveByHeading` のテストを追加 |
| `crud.test.cjs` | `executeCreateNodes` の sourceRanges → headingRefs | テストデータと期待値を更新 |
| `show-graph-summary-markdown.test.cjs` | 行番号解決のテスト | 見出し解決に変更 |
| `graphify-cmd.test.cjs` | Step 4 削除 + Step 0 追加 | Step 数は変わらず |

## Test Plan

### ユニットテスト計画

| スクリプト | テスト | 内容 |
|-----------|--------|------|
| `deduplicate-headings.js` | 重複検出 | 同一階層で同一テキストの見出しを検出 |
| `deduplicate-headings.js` | A-Z追記 | 2回目に A、3回目に B... |
| `deduplicate-headings.js` | 26件超過 | エラー終了 |
| `deduplicate-headings.js` | 重複なし | ファイルを変更しない |
| `resolve-by-heading.js` | exact match | 1段階目で確定 |
| `resolve-by-heading.js` | partial match | 3段階目で確定 |
| `resolve-by-heading.js` | 複数マッチ | heading優先→texts連結→エラー |
| `resolve-by-heading.js` | 0マッチ | エラー終了 |
| `crud.js` | headingRefs 検証 | 新スキーマで検証通過 |
| `crud.js` | headingRefs 必須チェック | heading/texts 欠落でエラー |
| `show-graph-summary-markdown.js` | 見出し解決 | headingRefs から現在行を動的解決 |

### ユニットテスト不可能な項目（例外）
- embed-markers.js の全テスト（廃止のため単体テストも削除、acceptance-criteria.test.cjs の AC2 も削除）

## Boy Scout Rule — 翻訳可能性計画

- `deduplicate-headings.js`: 関数名は `deduplicateHeadings(sourceLines)` のような動詞句
- `resolve-by-heading.js`: `resolveByHeading(sourceLines, heading, texts)` で段階的フォールバック
- `headingRefs` スキーマは `additionalProperties: false` で未知フィールドを禁止
- `refId` 自動採番ロジックは `crud.js` から変更せず、参照先を `sourceRanges` → `headingRefs` に変更するのみ
- `embed-markers.js` 廃止に伴い `graphify-rfc.md` の Step 4 が空になるので、Step 5→4、Step 6→5 に繰り上げてもよいが、`update-step-status.js` の `MAX_STEP` 変更を最小化するため「Step 4 廃止（スキップ）」と明記して Step 番号は変えない

## Acceptance Criteria

- [ ] `deduplicate-headings.js` が動作し、重複見出しに A-Z を追記する
- [ ] `node.schema.json` の `sourceRanges` が `headingRefs` に置き換わっている
- [ ] `crud.js` が `headingRefs` 形式のノードを正しく保存する
- [ ] `resolve-by-heading.js` が4段階フォールバックで正しい行を特定する
- [ ] `embed-markers.js` が削除されている
- [ ] `query.js` から `resolveCurrentLines` が削除され `resolveByHeading` に置き換わっている
- [ ] `show-graph-summary-markdown.js` の行番号表示が見出し表示に変わっている
- [ ] `graphify-rfc.md` に Step 0（見出し重複排除）が追加されている
- [ ] `graphify-rfc.md` の Step 4 が「廃止」と明記されている
- [ ] `graphify-rfc.md` の使用スクリプト一覧から `embed-markers.js` が削除されている
- [ ] 既存の全テストが更新後も通過する（embed-markers 関連テスト削除 + 新規テスト追加）
- [ ] `RFC-ROOT.md` に対して graphify-rfc を実行し、headingRefs のみで138件の誤差がゼロになることを確認する
