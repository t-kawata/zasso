# DESIGN-OF-CRYSTALIZE-README — 設計書（仕様）

> **位置づけ**: `/crystalize-readme` スラッシュコマンドの設計書・仕様。
> **生成元**: `crates/siprs/docs/DESIGN-OF-CRYSTALIZE-README.md`（siprs 側で執筆された設計メモ）を収束・仕様化したもの。
> **実装先**: `tools/conver/.claude/commands/crystalize-readme.md` + `.claude/scripts/crystalize-readme/`
> **言語方針**: 本文は日本語（ユーザー点検用）。点検後、英語版を別途作成する計画。

---

## 0. 前提

- この文書は `/crystalize-readme` の**設計書**であり、実装チケット（make → plan → start → review）の仕様原典となる。
- 実装は supreme law（TDD Red-Green-Refactor・テスト可能な仕様）に従う。
- スラッシュコマンドは AI 実行の手順書であり、**決定論部分はスクリプト、非決定論部分は AI** が担う。

## 1. 目的 (Goal)

RFC のグラフ（`*-GRAPH.json`）を入力として、ユーザー向けの「使い方 README」を生成する。README が書けるか否かは、**README に記載する使い方に従って完全に動作する examples 実装が、現状の実装で完全に成立しうるか**で判断する。

- 出力先:
  - **(a)** README が書ける場合 → RFC と同じディレクトリの `README.md`
  - **(b)** 書けない場合（実装未成立・漏れ・矛盾）→ `examples/` と同ディレクトリの `residues/RESIDUE-<YYYYMMDDhhmmss>.md`
- どちらの場合も、**最後のセクションは必ず「examples（実装サンプル）の仕様と設計」**とする。
- RESIDUE は「書けない理由のメモ」ではなく、**README と examples 実装を完全なものにするための実装用チケットを作成する情報**として、実装漏れ・不足・矛盾を厳格かつ厳密に記録する（将来 `/drill-rfc-down` で 1 件ずつチケット化される）。

> 旧設計では `samples` と呼称していたが、**`examples` に改名**する（siprs の `examples/` ディレクトリに整合）。

## 2. 用語 (Terminology)

| 用語 | 定義 |
|---|---|
| グラフ | graphify-rfc が生成するグラフ JSON（schema: `graph.schema.json`。`sourceFile` / `mainLanguage` / `nodes[]` / `edges[]`） |
| `sourceFile` | グラフの `sourceFile` フィールド。元 RFC ドキュメントへのパス |
| rfcDir | `sourceFile` の親ディレクトリ |
| examplesDir | `<rfcDir>/examples/`（サンプル実装の置き場） |
| residuesDir | `<rfcDir>/residues/`（RESIDUE 文書の置き場） |
| README | ユーザー向け使い方文書（`<rfcDir>/README.md`） |
| RESIDUE | README が書けない理由（実装漏れ・不足・矛盾）を記録する文書 |

## 3. 入力 (Input)

```
/crystalize-readme <path/to/*-GRAPH.json>
```

- 第 1 引数: グラフ JSON のパス（絶対または相対）
- グラフの `sourceFile` から元 RFC ドキュメントを特定する

## 4. 処理フロー（全体像）

```
  ┌────────────────────────────────────────────────────┐
  │ Step 0: 引数検証・パス導出（決定論）                  │
  │   validate-graph-arg.js + derive-output-paths.js    │
  └────────────────────────────────────────────────────┘
                        ▼
  ┌────────────────────────────────────────────────────┐
  │ Step 1: グリル — 階層的見出し（目次）                 │
  │   AI が目次案を提案 → 決定論チェック →               │
  │   ユーザーは Yes/No または ABC のみで回答            │
  └────────────────────────────────────────────────────┘
                        ▼
  ┌────────────────────────────────────────────────────┐
  │ Step 2: グリル — examples（実装サンプル）の仕様と設計  │
  │   AI が仕様・設計を合成（非決定論）+ 決定論検証       │
  └────────────────────────────────────────────────────┘
                        ▼
  ┌────────────────────────────────────────────────────┐
  │ Step 3: 分岐判定（決定論）                           │
  │   check-readme-writable.js → (a) or (b)             │
  └────────────────────────────────────────────────────┘
         │                            │
         ▼ (a)                        ▼ (b)
  ┌───────────────────┐      ┌──────────────────────────┐
  │ <rfcDir>/README.md │      │ residues/RESIDUE-<ts>.md │
  └───────────────────┘      └──────────────────────────┘
         │                            │
         └──────────┬─────────────────┘
                    ▼
  ┌────────────────────────────────────────────────────┐
  │ Step 4: 出力検証（決定論）                           │
  │   validate-readme-output.js / validate-residue-*.js │
  └────────────────────────────────────────────────────┘
```

## 5. 設計原則: 決定論 vs 非決定論

**決定論的に実行できることはスクリプトにより可能な限り実行し、AI にできるだけ考えさせない。**
一方、**AI による非決定論的思考が必要な箇所（内容の合成・判断）まで無理に決定論的に設計しない。**

| 工程 | 決定論（スクリプト） | 非決定論（AI） |
|---|---|---|
| 引数検証・パス導出 | ○ | — |
| 目次案の候補抽出（グラフから） | ○ | — |
| 目次案の編成・見出し文の合成 | 構造検証 ○ | ○（取捨・編成） |
| examples の仕様・設計の合成 | グラフノード抽出 ○ | ○ |
| 分岐判定 (a)/(b) | ○ | — |
| README / RESIDUE 本文の執筆 | 構造・雛形 ○ | ○ |
| 出力構造の検証 | ○ | — |

## 6. Step 詳細

### Step 0: 引数検証・パス導出（決定論）

スクリプト:
- `validate-graph-arg.js`: 引数がグラフ JSON として妥当か（nodes / edges / sourceFile の存在とスキーマ検証）
- `derive-output-paths.js`: 以下を導出する
  - `rfcDir` = dirname(sourceFile)
  - `examplesDir` = `<rfcDir>/examples/`
  - `residuesDir` = `<rfcDir>/residues/`
  - README 候補 = `<rfcDir>/README.md`
  - RESIDUE 候補 = `<residuesDir>/RESIDUE-<YYYYMMDDhhmmss>.md`

### Step 1: グリル — 階層的見出し（目次）

目的: README の目次（階層的見出し）を確定する。

1. **候補抽出（決定論）**: `extract-toc-candidates.js` がグラフのノード階層から見出し候補を抽出する。
2. **AI による編成（非決定論）**: 候補を土台に、AI が目次の取捨・階層・見出し文を合成する。
3. **構造チェック（決定論）**: `check-toc-structure.js` が目次案を検証する。
   - 見出しの重複がない
   - 階層が整合的（レベルが飛ばない）
   - グラフの主要セクションを網羅している
   - 末尾が「examples（実装サンプル）の仕様と設計」である
   - 不合格なら AI が自動修正を試みる（修正後も不合格なら再提案として扱う）
4. **ユーザー承認**: ユーザーは **Yes/No または ABC の選択のみ**で回答する（`/grill-me-for-rfc` と同様の応答形式）。自由記述を要求しない。
   - 例: `この目次で進めますか? Y / N / A / B / C`

### Step 2: グリル — examples（実装サンプル）の仕様と設計

目的: README 末尾セクション「examples（実装サンプル）の仕様と設計」の内容を確定する。

1. **候補抽出（決定論）**: グラフから examples 関連ノード（実装サンプルを示す kind）を抽出して AI に提示する。
2. **AI による合成（非決定論）**: AI が examples の仕様と設計（各サンプルが示す使い方・API 表面・期待動作）を合成する。
3. **構造チェック（決定論）**: `validate-examples-spec.js` が合成結果の構造・参照整合を検証する。

### Step 3: 分岐判定（決定論）

`check-readme-writable.js` が (a)/(b) を決定する。

**(a) README が書ける** と判定されるのは、以下を**すべて**満たす場合:

1. グラフの機械検証が通過する（`uncoveredHeadings = []`、`isolatedNodes = []`、`unresolvableRefs = []`）
2. 未解決の OMISSIONS インベントリが存在しない
3. `examples/` が実在し、グラフが参照するサンプル実装がすべて実在する
4. グリルで確定した目次・examples 仕様が整合している

いずれか 1 つでも満たさない場合は **(b)** RESIDUE へ。RESIDUE には該当した判定理由を記録する。

> 判定基準は実装フェーズでテストにより固定化する（基準の変更はテスト変更を伴う）。
> 未解決 OMISSIONS の検出は機械可読形式（find-omissions の出力 JSON / ステータスファイル）に依存し、実装時に定義する。

### Step 4: 出力生成と検証

- (a): `<rfcDir>/README.md` を生成。末尾セクションは必ず「examples（実装サンプル）の仕様と設計」。
- (b): `<residuesDir>/RESIDUE-<YYYYMMDDhhmmss>.md` を生成。
- `validate-readme-output.js` / `validate-residue-output.js` が出力構造を検証し、不合格なら AI が修正する。

## 7. RESIDUE の構造

RESIDUE は「README が書けない理由」を体系的に記録する文書。将来 `/drill-rfc-down` で深掘りされ、Tickets.json の新チケットに編成される。

```markdown
# RESIDUE-<YYYYMMDDhhmmss>

> 対象 RFC: <sourceFile>
> 生成グラフ: <graph path>
> 生成日時: <...>
> 判定理由: <check-readme-writable.js の該当理由一覧>

## 未解決インベントリ

### R-001 <機能名>
- 要求事項: ...
- 現状: 【OMISSION】/【DEFICIENCY】/【CONTRADICTION】のいずれか
- 証拠: グラフノード <id> / sourceRanges <...>
- ステータス: open
```

- 既存の OMISSIONS インベントリ（例: siprs の 12 必須機能 `OMISSIONS-2026-08-16.md`）は RESIDUE の雛形として投入する。
- つまり「実際に RFC から README を書こうとして、初めて『ここが実装漏れ』と分かる（そして RESIDUE に書く）」という流れ。

## 8. スクリプト一覧

配置: `.claude/scripts/crystalize-readme/`

| スクリプト | 決定論 | 責務 |
|---|---|---|
| `validate-graph-arg.js` | 100% | 引数・グラフスキーマ検証 |
| `derive-output-paths.js` | 100% | 出力パス導出 |
| `extract-toc-candidates.js` | 100% | グラフからの見出し候補抽出 |
| `check-toc-structure.js` | 100% | 目次案の構造検証 |
| `validate-examples-spec.js` | 100% | examples 仕様の構造・参照整合検証 |
| `check-readme-writable.js` | 100% | (a)/(b) 分岐判定 |
| `generate-residue-filename.js` | 100% | `RESIDUE-<YYYYMMDDhhmmss>.md` 名生成 |
| `validate-readme-output.js` | 100% | README 出力構造検証 |
| `validate-residue-output.js` | 100% | RESIDUE 出力構造検証 |
| `update-step-status.js` | 100% | ステップ進行管理（既存 `rfc-graph/update-step-status.js` パターンを流用） |

各スクリプトは `tests/crystalize-readme/*.test.cjs` を伴う（node.md 規約: CommonJS、`make test-crystalize-readme` で `node --test` 実行）。

## 9. テスト計画

- **単体テスト**: 決定論スクリプト 1 本につき `*.test.js`（RED → GREEN → REFACTOR）
- **統合テスト**: 分岐 (a) と (b) の両系統
- **実ターゲット smoke test**: `crates/siprs/RFC-ROOT-GRAPH.json` を入力として実行
  - siprs は OMISSIONS 残存のため (b) RESIDUE 系統になる想定

## 10. 言語方針（README 出力）

- README の本文言語は、対象 RFC の言語に追随する（デフォルト英語）。
- 実装フェーズで確定し、テストで固定する。

## 11. 将来

- `RESIDUE-*.md` は `/drill-rfc-down`（後で全面的に作り変える）で深掘りされ、Tickets.json の新チケットとして編成される。

## 12. 変更履歴

- 2026-08-17: siprs の設計メモを収束・仕様化。`samples` → `examples` に改名。グリル（目次）の応答形式を Yes/No・ABC に規定。決定論 vs 非決定論の原則を明記。
