---
ticket_id: 68
title: PX-29: Tree Hierarchy Enhancement and Pruning for boundify
slug: px-29-tree-hierarchy-enhancement-and-pruning-for-boundify
status: draft
created_at: 2026-07-08
updated_at: 2026-07-08
---

# PX-29: Tree Hierarchy Enhancement and Pruning for boundify

## Summary

boundify が生成するディレクトリツリーの品質を2軸で改善する: (1) architecture ノードの子ノードを適切に階層化してネストされたディレクトリ構造を生成する。(2) 空ディレクトリを削除し、子が1つしかないディレクトリを親にフラット化する prune 処理を追加する。

## ⚠️ 作業範囲の重大制約

**このチケットの全作業は `tools/conver/.claude/` ディレクトリ内のみに限定される。**
すなわち `/Users/kawata/shyme/zasso/tools/conver/.claude/` 以下が唯一の変更対象である。

**禁止される操作:**
- このパスの外にあるあらゆるファイルの編集・作成・削除
- `cargo` 関連コマンドの実行
- プロジェクトルート `/Users/kawata/shyme/zasso/` 以下の `crates/`, `src-tauri/`, `fe/` 等への影響

## Background

現在の boundify は architecture ノードをディレクトリに変換するが、その子ノードの展開が不十分でフラットになりがちである。また、`findRuleDrivenNodes` が kind ベースの全ノードをルート直下に配置するため、architecture 配下の config/error 等が親ディレクトリにネストされず分離する。

加えて、ファイルが1つも入っていないディレクトリや子が1つだけのディレクトリが生成され、ディレクトリとしての意味をなしていない。

**物理的証拠**: 実際のテスト実行で `/Users/kawata/shyme/zasso/crates/siprs/RFC-ROOT-Dirs-Tree.json` および `/Users/kawata/shyme/zasso/crates/siprs/src/` 内のディレクトリとファイルが生成されたが、フラットでまとまりがなく、空ディレクトリが存在した。

## Scope

- `buildTreeFromRoot`（boundify-tree.js:197-240）の強化:
  - architecture ノードの子ノード（part_of エッジで接続）を再帰的に正しくサブディレクトリに展開
  - 子 architecture はサブディレクトリ、子の config/error 等は親ディレクトリのサブディレクトリに配置
  - `findRuleDrivenNodes` のルート直下配置を親階層を考慮した配置に変更
- `pruneEmptyDirectories` の新設:
  - ファイルが1つも入っていないディレクトリを削除
  - 子が1つしかないディレクトリは親にフラット化
  - フラット化で `src/` 直下に全ファイルが展開されるケースは許容（小規模設計）
  - prune は Dirs-Tree.json 構築時のツリー操作として実装
- `mergeTopLevelNodes` の強化:
  - prune 後に同名ディレクトリの再マージが必要になるケースへの対応
- 既存テストの期待値更新

## Non-scope

- 宣言スタブの書き込み（PX-28 で対応）
- prose 系 kind の削除（PX-28 で対応）
- クロスリファレンスコメント（PX-30 で対応）
- ファイル名長制限（PX-27 で対応）

## Investigation

**`boundify-tree.js:197-240`** — buildTreeFromRoot（現在）:
```javascript
function buildTreeFromRoot(root) {
  const node = root.node;
  const kind = node.kind || '';
  if (BACKBONE_KINDS.has(kind)) {
    // architecture → ディレクトリ
    const dirNode = { name: dirName, type: 'directory', kind, children: [] };
    // 子ノードを再帰処理
    if (root.children) {
      for (const child of root.children) {
        const childDir = buildTreeFromRoot(child);
        if (childDir) dirNode.children.push(childDir);
      }
    }
    // インライン子ノードも追加
    const inlineChildren = findInlineChildren(node.id, graph, hierarchy);
    // ...
  }
}
```
→ 子ノードの処理は architecture のみ再帰される。kind ベースの子ノード（config/error 等）はルート直下にしか配置されない。

**`boundify-tree.js:265-268`** — findRuleDrivenNodes の呼び出し:
```javascript
const ruleDrivenNodes = findRuleDrivenNodes(graph, hierarchy, lang, resolveFileName, deduplicateFileNames);
const allTopNodes = mergeTopLevelNodes(topNodes, ruleDrivenNodes);
```
→ ruleDrivenNodes はルート階層のみに追加され、architecture ディレクトリの子として配置されない。

**`boundify-tree.js:314-337`** — mergeTopLevelNodes:
同名ディレクトリの子をマージする。prune 後も同様の機能が必要。

### prune ルール詳細

```
prune 前:
src/
├── config/
│   └── db_setting.rs         ← 子が1つ: フラット化
├── error/
│   ├── auth_err.rs
│   └── net_err.rs            ← 子が2つ: 維持
└── empty_dir/                ← 子なし: 削除

prune 後:
src/
├── db_setting.rs             ← config/ からフラット化
├── error/
│   ├── auth_err.rs
│   └── net_err.rs
```

### 階層化の期待動作

```
architecture "networking" (kind=architecture) 配下に
  child1: config "tls_settings" (kind=config)
  child2: architecture "http" (kind=architecture)
    child2-1: api_contract "request_handler" (kind=api_contract)
がある場合:

src/
└── networking/
    ├── config/
    │   └── tls_settings.rs
    ├── http/
    │   └── request_handler.rs
```

## Test Plan

### ユニットテスト計画

テスト対象: `boundify-tree.js`（buildTreeFromRoot, pruneEmptyDirectories, mergeTopLevelNodes 改修）

**正常系（階層化）:**
- architecture ノードが子 architecture を持つ場合、正しくサブディレクトリ階層が生成される
- architecture ノードが子 config ノードを持つ場合、`config/` サブディレクトリが生成される
- 3段以上のネスト（arc1 → arc2 → arc3）が正しくツリー化される
- インライン kind（api_contract/data_model/state_machine）が親 architecture ディレクトリにファイルとして配置される

**正常系（prune）:**
- `config/` に子が1ファイルのみ → `config/` が削除され、ファイルが `src/` 直下にフラット化される
- `empty/` に子が0 → ディレクトリ自体が削除される
- `error/` に子が2ファイル → 維持される
- フラット化時に兄弟ファイルと同名が発生した場合の動作（期待: 名前衝突は起きないことを確認）

**異常系:**
- 全ディレクトリが prune され `src/` 直下が全ファイルフラットになるケースでもエラーにならない
- ルート `src/` 自体が prune 対象にならないこと（src/ は常に維持）

**回帰:**
- architecture がないグラフ（kind ベースのみ）でも正しく動作すること
- 既存テストが更新された期待値で通過すること

**カバレッジ目標:** 90%（階層化ロジックは100%、prune 分岐も100%）

### ユニットテスト不可能な項目（例外）

- 実際の boundify 実行による Dirs-Tree.json 出力の総合確認（E2E）

## Boy Scout Rule — 翻訳可能性計画

- `pruneEmptyDirectories` 関数は動詞句で命名されており適切
- `buildTreeFromRoot` の子ノード展開ロジックは現在コメント不足（`// 子ノードの処理`のみ）。本チケットで「なぜ architecture の子だけ再帰するか」「kind ベースの子はどう扱うか」のコメントを追加
- 再帰処理の深さ制限や循環検出など安全機構の有無を確認し、不足があれば追加
- 既存の `mergeTopLevelNodes` の名前は「同階層マージ」の意図が不明瞭。必要なら rename を検討

## Acceptance Criteria

- [ ] architecture ノードの子ノードが適切に階層化される（サブディレクトリ展開）
- [ ] architecture 配下の kind ベース子ノード（config/error 等）が親ディレクトリのサブディレクトリに配置される
- [ ] インライン kind が親 architecture ディレクトリに配置される
- [ ] `pruneEmptyDirectories` により空ディレクトリが削除される
- [ ] 子が1つしかないディレクトリがフラット化される
- [ ] フラット化後も全ファイルが `src/` 直下に存在する（消失しない）
- [ ] 既存テストが新しい期待値で更新され通過する
- [ ] 翻訳可能性の検証が通っている
