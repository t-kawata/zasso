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
- グラフの `sourceFile` から元 RFC ドキュメントを特定する（実在は Preflight で検証）

## 4. 処理フロー（全体像）

```
  ┌────────────────────────────────────────────────────┐
  │ Preflight: パス導出 + sourceFile 実在チェック（決定論）│
  │   derive-output-paths.js                            │
  └────────────────────────────────────────────────────┘
                        ▼
  ┌────────────────────────────────────────────────────┐
  │ Step 0: sourceFile の読込                           │
  │   sourceFile が指すファイルを読む                    │
  └────────────────────────────────────────────────────┘
                        ▼
  ┌────────────────────────────────────────────────────┐
  │ Step 1: グリル — 階層的見出し（目次）                 │
  │   AI が提案 → validate-toc-proposal.js で検証 →     │
  │   ID 単位で Yes/No・ABC 回答 → 全確定で Step 2 へ    │
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
| Preflight（パス導出 + sourceFile 実在チェック） | ○ | — |
| sourceFile の読込（Step 0） | — | ○（読込） |
| 見出し提案の検証ゲート（validate-toc-proposal） | ○ | — |
| 見出し提案の合成（使い方に絞る） | — | ○（合成・推奨） |
| 見出しの確定記録（confirm-heading / isTocComplete） | ○ | — |
| examples の仕様・設計の合成 | グラフノード抽出 ○ | ○ |
| 分岐判定 (a)/(b) | ○ | — |
| README / RESIDUE 本文の執筆 | 構造・雛形 ○ | ○ |
| 出力構造の検証 | ○ | — |

## 6. Step 詳細

### Preflight: パス導出 + sourceFile 実在チェック（決定論）

`derive-output-paths.js` がグラフ JSON の読込・構造検証と、`sourceFile`（元 RFC 文書）の実在チェックを同時に行い、以下を導出する。

- `sourceFile` = 展開後の元 RFC 文書パス（実在チェック済み。Step 0 の読込対象）
- `rfcDir` = dirname(sourceFile)
- `examplesDir` = `<rfcDir>/examples/`
- `residuesDir` = `<rfcDir>/residues/`
- README 候補 = `<rfcDir>/README.md`
- RESIDUE 候補 = `<residuesDir>/RESIDUE-<YYYYMMDDhhmmss>.md`

### Step 0: sourceFile の読込

目的: Step 1（目次グリル）・Step 2（examples 仕様グリル）の前提情報を収集する。

- Preflight が出力した `sourceFile` のファイルを読む。
- この Step の完了前に Step 1 以降に進まない。

### Step 1: グリル — 階層的見出し（目次）

目的: README の目次（階層的見出し）を確定する。sourceFile を前提とし、**使い方に絞って技術的詳細内容に踏み込まない**目次を合成する。

1. **見出し提案（非決定論）**: AI が各見出しを `{id, heading, contentOptions[], recommendation, reason}` の形で合成する。全ての見出しに**階層的に一意な ID（H1, H2-1, H2-2, ...）**を採番し、各提案に AI の推奨と理由を明示する。
2. **検証ゲート（決定論・必須）**: 各提案は**ユーザーへ提示する前に** `validate-toc-proposal.js` で検証する。`valid:true` になるまで再構成し、未検証の提案は提示しない。ID は `/^H[1-6](-[1-9][0-9]*)?$/` に従い、同一ターン内で重複しない。
3. **ユーザー回答**: ユーザーは **ID 単位で A/B/C/Yes/No で回答**する。自由コメントも可（確定には ID 単位の回答が必要）。
4. **確定記録（決定論）**: 回答ごとに `update-step-status.js confirm-heading <id>` で確定を記録する。全提案 ID が確定した場合のみ `isTocComplete()=true` / `tocApproved=true` となり、`end-step 1` で Step 2 へ進む。未確定の間は Step 1 を完了できない。
   - **末尾の見出しは必ず「examples（実装サンプル）の仕様と設計」**とする。

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
| `validate-graph-arg.js` | 100% | グラフ読込・スキーマ検証（スタンドアロン工程では直接呼ばない。`derive-output-paths.js` が `readGraphFile` を内部利用） |
| `derive-output-paths.js` | 100% | Preflight。出力パス導出 + `sourceFile` 実在チェック |
| `validate-toc-proposal.js` | 100% | Step 1 見出し提案の検証ゲート（ID 階層一意 / contentOptions 2-4 / 推奨 ∈ 選択肢 / reason 非空 / 決定論） |
| `validate-examples-spec.js` | 100% | examples 仕様の構造・参照整合検証 |
| `check-readme-writable.js` | 100% | (a)/(b) 分岐判定 |
| `generate-residue-filename.js` | 100% | `RESIDUE-<YYYYMMDDhhmmss>.md` 名生成 |
| `validate-readme-output.js` | 100% | README 出力構造検証 |
| `validate-residue-output.js` | 100% | RESIDUE 出力構造検証 |
| `update-step-status.js` | 100% | ステップ進行管理 + Step 1 グリル確定（`propose-heading` / `confirm-heading` / `reset-toc` / `isTocComplete`。全確定で `tocApproved`、未確定で `end-step 1` をブロック） |

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

- 2026-08-18 (PX-153): Step 1 を「見出しごとの提案グリル」に再設計。決定論的候補抽出（`extract-toc-candidates.js`）と構造チェック（`check-toc-structure.js`）を廃止・削除。各見出し提案を `validate-toc-proposal.js` で提示前に検証し、`update-step-status.js` の `confirm-heading` / `isTocComplete` で全 ID 確定まで Step 2 へ進めない方式に変更。
- 2026-08-18: 独立した引数検証 Step 0 を廃止。Preflight を導入し、`derive-output-paths.js` がグラフ読込・`sourceFile` 実在チェック・パス導出を一括実行し、検証済み `sourceFile` を含む JSON を出力するように変更。新 Step 0 を「sourceFile の読込」とし、Step 1・2 の前提情報とした。
- 2026-08-17: siprs の設計メモを収束・仕様化。`samples` → `examples` に改名。グリル（目次）の応答形式を Yes/No・ABC に規定。決定論 vs 非決定論の原則を明記。
