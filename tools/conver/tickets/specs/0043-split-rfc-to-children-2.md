---
ticket_id: 43
title: split-rfc-to-children 完全改修（統合）
slug: split-rfc-to-children-2
status: draft
created_at: 2026-07-03
updated_at: 2026-07-03
---
# split-rfc-to-children 完全改修（統合）

## Summary

2026-07-03 の別セッション実行で露呈した全13件の問題を解決するため、
`/split-rfc-to-children` パイプラインを構成する5つのスクリプト＋コマンド定義を
統合的に修正する。これにより、コマンドを1回実行するだけで正典RFCが
Anchor Marker System を含む完全な子・孫RFCに分解される状態を達成する。

## Background

### 2026-07-03 別セッション実行で確認された13件の問題

| # | 問題 | 区分 | 修正対象 |
|---|------|------|---------|
| 1 | `add-ref-pointer.js` 未実行 | プロセス | コマンド定義 |
| 2 | Anchor Marker 未挿入 | プロセス | コマンド定義 |
| 3 | AI による子RFC 全文上書き（テンプレート破壊） | プロセス | コマンド定義＋テンプレート |
| 4 | `validate-ref-pointer.js` 未実行 | プロセス | コマンド定義 |
| 5 | `verify-rfc-coverage` が `Missing tickets/` 報告 | スクリプトバグ | verify-rfc-coverage.js |
| 6 | 機械転記が空振り | プロセス | コマンド定義 |
| 7 | `language` フィールドが `null` | スクリプトバグ | create-rfc-tree.js |
| 8 | `canonicalRfcPath` が絶対パス | スクリプトバグ | create-rfc-tree.js |
| 9 | `directoryName` バリデーション矛盾 | スクリプトバグ | validate-rfc-tree.js |
| 10 | 子RFC の情報量不足 | プロセス | コマンド定義 |
| 11 | draft tree に空 `children: []` | 品質劣化 | write-rfc-tree-draft.js |
| 12 | 転記ブロック空のまま | プロセス | コマンド定義 |
| 13 | `verify-rfc-coverage` 失敗を AI が放置 | プロセス | コマンド定義 |

### 統合方針

全13件を1チケットで解決する。スクリプトバグ（5件）はコード修正、
プロセス問題（8件）はコマンド定義の構造強化で対応する。

## Scope

### Section A: verify-rfc-coverage.js tickets/ チェック削除（問題5, 13）

`verify-rfc-coverage.js:19` の `tickets/` ディレクトリ存在チェックを削除する。

```javascript
// 削除する行:
if(!fs.existsSync(path.join(cd,"tickets"))) issues.push("Missing tickets/: "+dn);
```

この1行のみ。他に `tickets/` を前提とするスクリプトは存在しない（grep調査済み）。

### Section B: create-rfc-tree.js language 検出改善（問題7）

`detectLanguage()` の Rust 検出条件を `[workspace]` 限定から汎用に拡張：

```javascript
// 修正前
if (c.includes("[workspace]")) return "rust";

// 修正後
return "rust";  // Cargo.toml が存在すれば常に Rust
```

`[workspace]` の有無にかかわらず、Cargo.toml が存在すれば Rust プロジェクトと判定する。
workspace メンバーの crate も言語検出できるようになる。

### Section C: create-rfc-tree.js canonicalRfcPath 相対パス化（問題8）

`canonicalRfcPath` を絶対パスではなく、RFC-TREE.json からの相対パスで保存する：

```javascript
// 修正前
canonicalRfcPath: resolved,

// 修正後
canonicalRfcPath: path.relative(rfcDir, resolved),
```

`rfcDir` は RFC-TREE.json が生成される正典RFCのディレクトリ。実質的にファイル名のみになる。

### Section D: validate-rfc-tree.js directoryName バリデーション緩和（問題9）

`directoryName.startsWith(childId)` を以下のロジックに変更：

```javascript
// 修正前
} else if (node.childId && !node.directoryName.startsWith(node.childId)) {

// 修正後
} else if (node.childId && node.directoryName.indexOf(node.childId + "-") === -1) {
  errors.push(`${label}.directoryName: must contain childId "${node.childId}-" (e.g. "${node.childId}-slug" or "{canonicalBase}-${node.childId}-slug")`);
```

これにより `01-siprs`（短縮形）と `RFC-ROOT-01-siprs`（完全形）の両方が許容される。

### Section E: write-rfc-tree-draft.js 空 children 自動除去（問題11）

素案ツリーの各 childNode から `children` フィールドが空配列の場合に自動除去する処理を追加：

```javascript
// 子ノードの children が空配列なら削除
if (node.children && Array.isArray(node.children) && node.children.length === 0) {
  delete node.children;
}
```

これにより AI が `children: []` を書いてもノイズにならない。

### Section F: Cargo.toml 依存 slug 解決（漏れ対応）

`generate-child-rfcs.js` の `generateRustProject()` は現在のシグネチャが
`generateRustProject(child, cb, cd)` で、RFC-TREE.json の finalTree（`ctx.tree`）に
アクセスできない。依存先 childNode の slug を解決するために、
シグネチャを `generateRustProject(child, cb, cd, tree)` に拡張する。

```javascript
// 修正前のシグネチャと呼び出し
function generateRustProject(child, cb, cd) {
  ...
  cargoContent += child.childId + '-dep-' + depId + ' = { path = "../' + cb + '-' + depId + '-<slug>" }\n';

// 修正後のシグネチャと呼び出し
function generateRustProject(child, cb, cd, tree) {
  ...
  var depChild = tree.find(function(n) { return n.childId === depId; });
  var depSlug = depChild ? (depChild.slug || depChild.directoryName || depChild.childId) : depId;
  cargoContent += dn + '-dep-' + depId + ' = { path = "../' + cb + '-' + depId + '-' + depSlug + '" }\n';

// 呼び出し元
generateRustProject(child, ctx.canonBase, cd, ctx.tree);
```

### Section G: split-rfc-to-children コマンド定義強化（全プロセス問題）

以下の改訂を `split-rfc-to-children.md` に施す：

**G1: Step 5a 追加（Anchor Marker 登録を Step 5 直後に配置）**
- Step 5（検証ループ→finalTree確定）の直後に新 Step 5a として Anchor Marker 登録を配置
- これにより「ツリー確定 → すぐにマーカー登録」の流れが連続し、スキップされにくくなる
- 完了ガード（refPointers 空チェック）を同梱

**G2: 旧 Step 6→6a→6b を Step 6→7→8 に純粋リナンバリング**
旧 Step 6（add-ref-pointer.js）は G1 で Step 5a に移動済みのため、残る手順は以下のように繰り上がる：

| 旧 | 新 | 内容 |
|----|----|------|
| Step 6a | **Step 6** | generate-child-rfcs.js（必須） |
| Step 6b | **Step 7** | validate-ref-pointer.js（必須） |
| Step 7 | **Step 8** | 詳細記述（必須） |
| Step 8 | **Step 9** | 完了報告（必須） |

- これにより番号の重複・混乱を根本排除。最大ステップ番号は 9 まで。

**G3: 全 Step に「必須/任意」ラベルと先行依存 Step を明記**
```
### Step 5a: Anchor Marker 登録（必須）
<!-- この Step の前に完了しているべき Step: Step 5（finalTree確定） -->
...
### Step 6: Anchor Marker 自動挿入 + 機械転記（必須）
<!-- この Step の前に完了しているべき Step: Step 5a（Anchor Marker 登録） -->

### Step 7: リンク整合性検証（必須）
<!-- この Step の前に完了しているべき Step: Step 6（generate-child-rfcs.js） -->

### Step 8: 詳細記述（必須）
<!-- この Step の前に完了しているべき Step: Step 7（validate-ref-pointer.js） -->

各子RFCの **AI記述部**（`<!-- AI記述部 -->` の下）に設計判断・補足説明を記述する。
機械転記ブロック（`<!-- 機械転記ブロック -->` と `<!-- /機械転記ブロック -->` で囲まれた領域）、
frontmatter（`---` YAML）、Anchor Marker 注釈ブロックは編集禁止。

### Step 9: 完了報告（必須）
<!-- この Step の前に完了しているべき Step: Step 8（詳細記述） -->

```bash
node "$SCRIPT_DIR/verify-rfc-coverage.js" "$TREE_PATH"
```

**通過条件**: `valid: true` を返すこと。false の場合は該当 issue を修正し、
必要な Step から再実行する。true になるまで次の工程に進んではならない。
```

**G4: 子RFC テンプレートに編集禁止警告を追加**
`generate-child-rfcs.js` の全4セクション（`buildResponsibilitiesSection()`、
`buildIoBoundarySection()`、`buildParentRelationSection()`、`buildDependenciesSection()`）
の機械転記ブロック前に以下を追加：

```
<!-- !!! WARNING: このブロックは generate-child-rfcs.js が自動管理します。
     手動で編集しないでください。内容を変更する場合は正典RFCの該当マーカー範囲を
     編集した上で generate-child-rfcs.js を再実行してください。!!! -->
```

**G5: Step 完了ガード**
Step 5a（Anchor Marker 登録）の後に refPointers 空チェックを実行：

```bash
node -e "const t=require('${TREE_PATH}'); const c=t.finalTree.flatMap(n=>(n.refPointers||[]).map(r=>r.id)); if(c.length===0){console.error('[ERROR] refPointers が空です。add-ref-pointer.js で行範囲を登録してください。');process.exit(1)}else{console.log('[OK] '+c.length+' refPointers registered')}"
```

Step 6（generate-child-rfcs.js --phase=insert）の後にマーカー挿入完了ガードを実行：

```bash
grep -c 'REF-POINTER-BEGIN' "${CANONICAL_RFC}" || true
# 必要に応じて子RFCの機械転記ブロックに内容が存在するか確認
```

**G6: 転記完了ガード（新設）**
Step 6（generate-child-rfcs.js --phase=insert）の後、正典RFCにマーカーが実際に
挿入されたかを確認する。また Step 7（validate-ref-pointer.js）の前に
「前Step（Step 6）でマーカーが挿入されていなければエラーになる」ことを注記する。

## Non-scope

- `split-rfc-to-children` 以外のコマンド（`/formulate-tickets` 等）の改修は含まない
- PX-3 で実装済みの `add-ref-pointer.js` / `validate-ref-pointer.js` 本体の改修は含まない
- 既存テストの改修は含まない（既存テストは全て通過すること）

## Investigation

### 証拠: 各修正対象の現状コード

**verify-rfc-coverage.js:19**
```javascript
if(!fs.existsSync(path.join(cd,"tickets"))) issues.push("Missing tickets/: "+dn);
```

**create-rfc-tree.js:31-33**（language 検出）
```javascript
if (c.includes("[workspace]")) return "rust";
```

**create-rfc-tree.js:51**（canonicalRfcPath）
```javascript
canonicalRfcPath: resolved,
```

**validate-rfc-tree.js:90**（directoryName）
```javascript
} else if (node.childId && !node.directoryName.startsWith(node.childId)) {
```

**generate-child-rfcs.js**（Cargo.toml slug）— 該当行は `child.childId + '-dep-' + depId` 形式

**split-rfc-to-children.md** — Steps 6/6a/6b の番号体系が混乱を招いている

## Test Plan

### ユニットテスト計画

| # | テスト | 対象 | 内容 |
|---|-------|------|------|
| A1 | verify-rfc-coverage tickets/ 非必須 | verify-rfc-coverage.js | 子RFCに .md のみ → valid: true |
| A2 | verify-rfc-coverage ディレクトリ欠損 | verify-rfc-coverage.js | 子RFC dir なし → valid: false |
| B1 | language 検出 workspace Rust | create-rfc-tree.js | Cargo.toml + [workspace] → "rust" |
| B2 | language 検出 member Rust | create-rfc-tree.js | Cargo.toml（[workspace]なし）→ "rust" |
| B3 | language 検出 Go | create-rfc-tree.js | go.mod あり → "go" |
| C1 | canonicalRfcPath 相対パス | create-rfc-tree.js | 絶対パスでないことを確認 |
| D1 | directoryName 短縮形通過 | validate-rfc-tree.js | "01-siprs" → エラーなし |
| D2 | directoryName 完全形通過 | validate-rfc-tree.js | "RFC-ROOT-01-siprs" → エラーなし |
| D3 | directoryName 不一致拒否 | validate-rfc-tree.js | "01-other" で childId="02" → エラー |
| E1 | 空 children 自動除去 | write-rfc-tree-draft.js | children:[] → 保存後に children なし |
| F1 | Cargo.toml slug 解決 | generate-child-rfcs.js | <slug> が実際の slug に置換される |
| G1 | 子RFC テンプレート編集禁止警告 | generate-child-rfcs.js | 全4セクションの機械転記ブロックに WARNING コメントが含まれる |
| G2 | refPointers 完了ガード | shell | 空 → exit 1, あり → exit 0 |
| G3 | マーカー挿入完了ガード | shell | generate-child-rfcs.js 後に正典RFCにマーカーが存在する |

### ユニットテスト不可能な項目（例外）

- AI がコマンド定義の Step 順を遵守するかの検証はスクリプトレベルでは不可能
- コマンド定義の明示性（必須ラベル・依存関係注記）でカバーする

## Boy Scout Rule — 翻訳可能性計画

- `detectLanguage()` の条件簡略化（関数名が動詞句を維持）
- `validate-rfc-tree.js` のエラーメッセージに具体的な修正例（`"01-siprs"` 等）を含める
- `generate-child-rfcs.js` の Cargo.toml slug 解決で変数名を `depChild`, `depSlug` とし
  ドメイン概念を表現する

## Acceptance Criteria

- [ ] `verify-rfc-coverage.js` に `tickets/` の存在チェックが一切含まれていない
- [ ] `create-rfc-tree.js` が `[workspace]` なしの Cargo.toml も Rust と判定する
- [ ] `canonicalRfcPath` が相対パスで保存される
- [ ] `validate-rfc-tree.js` が短縮形（`01-siprs`）と完全形（`RFC-ROOT-01-siprs`）の両方を許容する
- [ ] `write-rfc-tree-draft.js` が空 `children: []` を自動除去する
- [ ] `generate-child-rfcs.js` の Cargo.toml 依存パスに `<slug>` が含まれない
- [ ] `generate-child-rfcs.js` が生成する子RFC テンプレートに機械転記ブロック編集禁止警告が含まれる
- [ ] `split-rfc-to-children.md` の Step 番号が旧手順と混同されない（重複なし、連続）
- [ ] 全 Step に「必須/任意」ラベルと先行依存 Step が明記されている
- [ ] Step 5a に refPointers 空チェックの完了ガードが含まれている
- [ ] `node --check` 構文チェック OK
- [ ] 既存テストが全て通過する
