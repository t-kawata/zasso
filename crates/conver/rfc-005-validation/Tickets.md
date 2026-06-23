# RFC_005: プロジェクション・検証 実装チケット分解設計書

> **生成元:** crates/conver/rfc-005-validation/RFC_005.md
> **生成日:** 2026-06-23
> **分析済みセクション:** §1〜§2（全セクション）、Appendix A〜D

---

## 全体依存関係サマリ

```
Phase 0: 土台（型定義・クレート生成）┐
  ├── M0: conver-projection データ型 ──→ Phase 1（プロジェクション層）
  ├── M0: conver-validation 基底型 ────→ Phase 2（検証層）
  └── M0: 両crateのCargo.toml ────→ Phase 1 + Phase 2
                                       │
Phase 1: プロジェクション ─────────────┤
  └── M1-1〜M1-4（独立・並行可）        │
                                       ↓
Phase 2: 検証ゲート ──────────────────┤
  └── M2-1〜M2-4（独立・並行可）       │
                                       ↓
Phase 3: テスト統合 ──────────────────→ M3-1（test-run）
```

両crate（conver-projection / conver-validation）は相互に**完全独立**。Phase 1 と Phase 2 は並行開発可能。

---

## Phase 0: 土台準備 — 型定義とクレート生成 (Layer 0)

> **外部依存:** serde (derive), serde_json, thiserror, petgraph
> **DB:** 使用しない。全型がメモリ内完結。
> **外部I/O:** なし

### Milestone M0: 基底型・データ型・クレート雛形

**並行実装可能:** M0-1 / M0-2 / M0-3 は互いに独立。

---

#### チケット M0-1: conver-validation 基底型（ValidationErrors + Validator trait + lib.rs）

* **参照設計書:** crates/conver/rfc-005-validation/RFC_005.md (§2.2, §2.6)
* **依存・関連チケットID:** M2-*（本チケットに依存）｜M0-2（並列可能）｜M0-3（並列可能）
* **対象不変条件 / 規範:**
  - §2.2: Validator trait は `fn validate(&self, target: &T) -> Result<(), ValidationErrors>` を定義する
  - §2.2: ValidationErrors は Vec&lt;String&gt; を保持し、new / add / is_empty / merge / From&lt;Vec&lt;E&gt;&gt; / Display を提供する
  - §2.2: Display は各行 `"- {err}\n"` で出力する
* **実装の背景と目的:** 全検証ゲートの共通インターフェース。ValidationErrors はエラー集約の唯一の型として機能し、各バリデータはこの trait を実装することで統一的な呼び出し規約を確立する。M0-1 が先行して完了することで、M2-1〜M2-4 の全バリデータが並行実装可能になる。
* **実装スコープ:**
  - `conver-validation/src/lib.rs` の新規作成
    - `Validator<T: ?Sized>` trait の定義
    - `ValidationErrors` struct の定義と全メソッド（new, add, is_empty, merge, Display, From&lt;Vec&lt;E&gt;&gt;）
  - `DagValidationReport` struct もここに含める（§2.6 で定義、ValidationErrors と共に dag.rs で使用）
    - フィールド: `valid: bool`, `errors: Vec<String>`
  - `conver-validation/Cargo.toml` の作成（serde, serde_json, thiserror, petgraph を dependencies に追加）
  - スタブ: なし（全APIが完全定義済み）
* **テストコードによる検証:**
  1. 正常系: ValidationErrors::new() が空のエラー集合を生成すること（§§テスト `validation_errors_display`）
  2. 正常系: ValidationErrors::add() / merge() が正しくエラーを追加・統合すること（§§テスト `validation_errors_merge`）
  3. 正常系: Display 実装が各行 `"- error\n"` 形式で出力すること（§§テスト `validation_errors_display`）
  4. 正常系: From&lt;Vec&lt;String&gt;&gt; でエラー集合を構築できること
  5. 正常系: Validator&lt;str&gt; を実装したカスタム型が validate() を呼び出せること（§§テスト `validator_trait_impl`）
  6. 異常系: 空の ValidationErrors の is_empty() が true を返すこと
* **計装方法・観測対象:**
  - エラー数: 各操作後の errors.len() をアサート
  - Display 出力: to_string() の内容をパターンマッチで検証
  - 決定論性: 同一操作列が常に同一のエラー集合を生成することを確認

---

#### チケット M0-2: conver-projection データ型（DesignTreeNode, ChecklistError, OmissionsData, OmissionEntry, DeviationComponentsData）

* **参照設計書:** crates/conver/rfc-005-validation/RFC_005.md (§1.2, §1.3, §1.4)
* **依存・関連チケットID:** M1-*（本チケットに依存するプロジェクション群）｜M0-1（並列可能）｜M0-3（並列可能）
* **対象不変条件 / 規範:**
  - §1.2: DesignTreeNode は id, title, children, status を持ち、is_leaf() は children.is_empty() を返す
  - §1.2: ChecklistError は MissingHeader と NoSections の2バリアントを持ち、日本語エラーメッセージを Display する
  - §1.3: OmissionsData は round, detected_at, omissions: Vec&lt;OmissionEntry&gt; を持つ
  - §1.3: OmissionEntry は kind, rfc_node_id, ticket_id, description, code_location, severity を持つ
  - §1.4: DeviationComponentsData は m, c, u, x: usize を持つ
* **実装の背景と目的:** プロジェクション層が扱うすべてのデータ構造を定義する。各生成器（ChecklistGenerator, OmissionsReport, ConvergenceReporter）の実装に先立ち、これらの型が確定していることで、生成器の入力インターフェースが安定する。全型は Serialize / Deserialize を derive し、JSONからのデシリアライズを可能にする。
* **実装スコープ:**
  - `conver-projection/src/checklist.rs` への DesignTreeNode + ChecklistError の定義
    - DesignTreeNode: `id: String`, `title: String`, `children: Vec<DesignTreeNode>`, `status: String`
    - ChecklistError: `MissingHeader`, `NoSections`（Debug + Display）
  - `conver-projection/src/omissions_md.rs` への OmissionsData + OmissionEntry の定義
  - `conver-projection/src/report.rs` への DeviationComponentsData の定義
  - `conver-projection/Cargo.toml` の作成（serde = { features = ["derive"] }, serde_json）
  - スタブ: なし（全型が完全定義）
* **テストコードによる検証:**
  1. 正常系: DesignTreeNode::is_leaf() が children が空の場合 true を返す
  2. 正常系: DesignTreeNode::is_leaf() が children を持つ場合 false を返す
  3. 正常系: 全structが serde::Serialize / Deserialize を derive していること（JSON ラウンドトリップテスト）
  4. 異常系: ChecklistError::MissingHeader の Display 出力が "ヘッダー行がありません" を含むこと
  5. 正常系: DeviationComponentsData の全フィールドが usize でアクセス可能であること
  6. コンパイル時検証: 全フィールドの型が Clone + Debug を満たすこと
* **計装方法・観測対象:**
  - JSON ラウンドトリップ: serialize → deserialize → フィールド比較
  - エラーメッセージ: to_string() の内容確認

---

#### チケット M0-3: MarkdownTemplate 共通テンプレート

* **参照設計書:** crates/conver/rfc-005-validation/RFC_005.md (§1.5)
* **依存・関連チケットID:** M1-*（各プロジェクションから利用されるユーティリティ）｜M0-1（並列可能）｜M0-2（並列可能）
* **対象不変条件 / 規範:**
  - §1.5: code_block() は "\`\`\`{language}\n{content}\n\`\`\`\n" 形式を返す
  - §1.5: table() は Markdown テーブル形式（ヘッダー + 区切り + 行）を返す
  - §1.5: horizontal_rule() は "\n---\n" を返す
* **実装の背景と目的:** 全プロジェクション生成器から共通して利用される Markdown フォーマットユーティリティ。すべての生成器がこのテンプレートを利用することで、一貫した出力形式を保証する。純粋関数のみで構成され、単体テストが容易。
* **実装スコープ:**
  - `conver-projection/src/template.rs` への MarkdownTemplate struct + impl の追加
    - `code_block(language: &str, content: &str) -> String`
    - `table(headers: &[&str], rows: &[Vec<&str>]) -> String`
      - 区切り行: `|---|...|`（各カラムの `---` は前後にスペース）
    - `horizontal_rule() -> &'static str`
  - スタブ: なし
* **テストコードによる検証:**
  1. 正常系: code_block("rust", "fn main() {}") が "\`\`\`rust\nfn main() {}\n\`\`\`\n" を返す（§§テスト `markdown_template_code_block`）
  2. 正常系: table(&["Col1", "Col2"], &[vec!["A", "B"]]) が正しいMarkdownテーブルを返す（§§テスト `markdown_template_table`）
  3. 正常系: horizontal_rule() が "\n---\n" を返す
  4. 境界値: 空ヘッダー・空行での table() 動作
  5. 境界値: 空言語名での code_block() 動作
* **計装方法・観測対象:**
  - 出力文字列のパターンマッチ（先頭・区切り・改行位置）
  - 決定論性: 同一入力 → 同一出力

---

## Phase 1: プロジェクション層実装 (Layer 1 — conver-projection)

> **外部依存:** serde (derive), serde_json（M0-2 で導入済み）
> **DB:** 使用しない。全関数がメモリ内完結。
> **外部I/O:** なし

### Milestone M1: 収束プロジェクション生成器

**並行実装可能:** M1-1 / M1-2 / M1-3 は互いに独立（各々が M0-2, M0-3 の型を利用するのみ）。
**M1-4 は M1-1〜M1-3 完了後に実装。**

---

#### チケット M1-1: ChecklistGenerator（CheckList.md 生成）

* **参照設計書:** crates/conver/rfc-005-validation/RFC_005.md (§1.2)
* **依存・関連チケットID:** 依存先: M0-2（DesignTreeNode, ChecklistError）｜依存先: M0-3（MarkdownTemplate を内部利用）｜並列可能: M1-2, M1-3
* **対象不変条件 / 規範:**
  - §1.2: generate() は"# RFC 要件チェックリスト" から始まる Markdown 文字列を返す
  - §1.2: 各ノードは "## §{i} {title}" 形式のセクションになる
  - §1.2: 各子ノードは "### §{section}.{sub} {title}" 形式になる
  - §1.2: 各セクションに3つのチェック項目（完全記述 / コードスニペット / TBD禁止）が含まれる
  - §1.2: validate_format() はヘッダー行とセクション数の機械的検証を行う
* **実装の背景と目的:** DesignTree の全ノードから、人間がレビューに使用するチェックリスト Markdown を機械生成する。生成された CheckList.md は人間が手動でチェック項目をマークする運用を前提としている。validate_format() は機械的に確認可能なフォーマットのみを検証し、実際の完了確認は人間の判断に委ねる。
* **実装スコープ:**
  - `conver-projection/src/checklist.rs` への ChecklistGenerator struct + impl 追記
    - `generate(nodes: &[DesignTreeNode]) -> String`: チェックリスト Markdown 生成
    - `validate_format(checklist: &str) -> Result<(), ChecklistError>`: フォーマット検証
  - MarkdownTemplate の table(), code_block() は利用しないが、horizontal_rule() をセクション間区切りに使用
  - スタブ: なし（全APIが仕様書に完全定義済み）
* **テストコードによる検証:**
  1. 正常系: 1ノード+1子ノードで generate() が"§0 Test Section" と "§0.1 Sub Item" を含むこと（§§テスト `checklist_generates_sections`）
  2. 正常系: 空ノード配列で generate() がヘッダー行を出力すること（§§テスト `checklist_generates_with_empty_nodes`）
  3. 正常系: validate_format() が正しいチェックリストをパスすること
  4. 異常系: validate_format() がヘッダー行なしでエラーを返すこと（§§テスト `checklist_validate_format_checks_header`）
  5. 異常系: validate_format() がセクションなしで NoSections を返すこと
  6. 決定論性: 同一ノード配列 → 同一 Markdown
* **計装方法・観測対象:**
  - 出力Markdownの文字列パターン（ヘッダー / セクション / チェック項目の有無）
  - セクションカウンタの連続性（§0, §1, ... / §0.1, §0.2, ...）

---

#### チケット M1-2: OmissionsReport（OMISSIONS.md 生成）

* **参照設計書:** crates/conver/rfc-005-validation/RFC_005.md (§1.3)
* **依存・関連チケットID:** 依存先: M0-2（OmissionsData, OmissionEntry）｜並列可能: M1-1, M1-3
* **対象不変条件 / 規範:**
  - §1.3: generate() は "# 乖離レポート（Round {round}）" から始まる Markdown を返す
  - §1.3: omissions が空の場合、"乖離なし（Δ = 0）収束完了。" を表示する
  - §1.3: omissions がある場合、kind で分類集計したサマリテーブル + 詳細リストを生成する
  - §1.3: 各エントリに rfc_node_id / ticket_id / description / code_location / severity を含む
* **実装の背景と目的:** OMISSIONS-<N>.json（乖離データ）を人間可読な Markdown レポートに変換する。空の乖離リストの場合は「収束完了」を表示し、それ以外の場合は分類ごとに集計・詳細表示する。このレポートを読むことで現状の乖離状況を一目で把握できる。
* **実装スコープ:**
  - `conver-projection/src/omissions_md.rs` への OmissionsReport struct + impl 追記
    - `generate(omissions: &OmissionsData) -> String`: Markdown レポート生成
    - 内部ロジック: `BTreeMap<&str, Vec<&OmissionEntry>>` で kind 別集計
    - サマリテーブル（MarkdownTemplate::table() 非依存、手組み）
  - スタブ: なし
* **テストコードによる検証:**
  1. 正常系: 空 omissions で "乖離なし" を含むこと（§§テスト `omissions_report_empty`）
  2. 正常系: エントリありで kind 分類・詳細が含まれること（§§テスト `omissions_report_with_entries`）
  3. 正常系: code_location が optional であること（None でもパニックしない）
  4. 正常系: ticket_id が None の場合 "N/A" と表示されること
  5. 決定論性: 同一 OmissionsData → 同一 Markdown
* **計装方法・観測対象:**
  - 出力Markdownのキーワード有無（乖離なし / サマリテーブル / 詳細リスト）
  - kind 別集計の件数が omissions.len() と一致すること

---

#### チケット M1-3: ConvergenceReporter（収束レポート：端末表示）

* **参照設計書:** crates/conver/rfc-005-validation/RFC_005.md (§1.4, Appendix B)
* **依存・関連チケットID:** 依存先: M0-2（DeviationComponentsData）｜並列可能: M1-1, M1-2
* **対象不変条件 / 規範:**
  - §1.4: format_text() は "[conver] Round {round} — Convergence Report" から始まる
  - §1.4: Δ サマリ行は "Δ = {delta}  (M:{m}  C:{c}  U:{u}  X:{x})" 形式
  - §1.4: 各ノードの充足度バーは visualize_bars 分割（デフォルト50 = 2%単位）
  - §1.4: バーは '■'（満たされた領域）と '□'（未満領域）で構成
  - §1.4: format_plain() は装飾なしの簡易形式を返す
  - Appendix B: バー表示例のフォーマットと一致すること
* **実装の背景と目的:** `conver status` コマンドが端末に表示する収束レポートを生成する。テキスト装飾版（format_text）とプレーン版（format_plain）の2形式を提供する。充足度バーの分割数はコンストラクタで指定可能（デフォルト50）。
* **実装スコープ:**
  - `conver-projection/src/report.rs` への ConvergenceReporter struct + impl 追記
    - `new(...)` → 全フィールド初期化
    - `format_text(&self) -> String`: 装飾版レポート生成
    - `format_plain(&self) -> String`: プレーン版レポート生成
  - 最大Δによる正規化ロジック（ゼロ除算防止: `max_delta.max(1.0)`）
  - スタブ: なし
* **テストコードによる検証:**
  1. 正常系: format_text() が Round 番号 / Δ値 / ノード名 / ステータスを含むこと（§§テスト `convergence_report_format_text`）
  2. 正常系: format_plain() が State / Δ を正しく出力すること（§§テスト `convergence_report_plain`）
  3. 正常系: バー分割数が visualization_bars に従うこと（50→50文字の■/□）
  4. 正常系: Δ=0 のノードが100% 表示になること
  5. 正常系: Δが最大のノードが 0% 以上の最低表示を確保されること（clamp(0, bar_width)）
  6. 境界値: 空の per_node で format_text() がパニックしないこと
  7. 決定論性: 同一パラメータ → 同一レポート
* **計装方法・観測対象:**
  - 出力テキストの各行パターン（正規表現マッチ）
  - バー内の ■ 数 / □ 数 が bar_width と一致すること
  - 百分率表示が ratio * 100 と一致すること

---

#### チケット M1-4: conver-projection lib.rs（モジュール統合）

* **参照設計書:** crates/conver/rfc-005-validation/RFC_005.md (§1.1, モジュール一覧)
* **依存・関連チケットID:** 依存先: M1-1, M1-2, M1-3（全プロジェクション実装完了後）
* **対象不変条件 / 規範:**
  - §1.1: lib.rs は checklist / omissions_md / report / template の4モジュールを宣言し再公開する
* **実装の背景と目的:** 4つのモジュールを統合し、crate の公開 API を確定する。lib.rs がモジュールを宣言し、use 再公開により外部からアクセス可能にする。
* **実装スコープ:**
  - `conver-projection/src/lib.rs` の作成
    - `pub mod checklist;` / `pub mod omissions_md;` / `pub mod report;` / `pub mod template;`
    - 主要型の再公開（`pub use`）
  - スタブ: なし
* **テストコードによる検証:**
  1. コンパイル時検証: `cargo check -p conver-projection` が通ること
  2. コンパイル時検証: 主要型が `conver_projection::checklist::ChecklistGenerator` 等でアクセス可能であること
* **計装方法・観測対象:**
  - コンパイル結果（check pass）

---

## Phase 2: 検証層実装 (Layer 1 — conver-validation)

> **外部依存:** serde (derive), serde_json, thiserror, petgraph（M0-1 で導入済み）
> **DB:** 使用しない。全関数がメモリ内完結。
> **外部I/O:** なし

### Milestone M2: 検証ゲート

**並行実装可能:** M2-1 / M2-2 / M2-3 / M2-4 は互いに独立（各々が M0-1 の ValidationErrors + Validator trait を利用するのみ）。
**M2-5 は M2-1〜M2-4 完了後に実装。**

---

#### チケット M2-1: SchemaValidator + DesignTreeValidator + ChecklistValidator

* **参照設計書:** crates/conver/rfc-005-validation/RFC_005.md (§2.3)
* **依存・関連チケットID:** 依存先: M0-1（Validator trait, ValidationErrors）｜並列可能: M2-2, M2-3, M2-4
* **対象不変条件 / 規範:**
  - §2.3: SchemaValidator::validate() は &str を受け取り JSON としてパース試行
  - §2.3: "state" フィールドの値が Grilling / ChecklistPending / ChecklistApproved / Writing / Reviewing / Done のいずれかであること
  - §2.3: DesignTreeValidator::validate_json() は version ≧ 1 / updatedAt 必須 / 全ノードID一意 / status in {"open","resolved"} / children は配列 を検証
  - §2.3: ChecklistValidator::validate_markdown() は "# RFC 要件チェックリスト" ヘッダー + 1つ以上の "## §" セクション を検証
* **実装の背景と目的:** Status.json / DesignTree.json / CheckList.md のスキーマ準拠を検証する。JSON構造の事前検証を行うことで、不正なデータが後段の処理（DAG検証・品質ゲート）に到達するのを防ぐ。
* **実装スコープ:**
  - `conver-validation/src/schema.rs` の新規作成
    - `SchemaValidator` struct + `impl Validator<str>`（JSONパース + state / round 検証）
    - `DesignTreeValidator` struct + `validate_json(&self, json: &Value) -> Result<(), ValidationErrors>`
    - `ChecklistValidator` struct + `validate_markdown(&self, md: &str) -> Result<(), ValidationErrors>`
  - スタブ: なし
* **テストコードによる検証:**
  1. 正常系: 有効なDesignTree JSON がパスすること（§§テスト `valid_design_tree_passes`）
  2. 異常系: version 未設定でエラー（§§テスト `design_tree_missing_version_fails`）
  3. 異常系: 重複IDでエラー（§§テスト `design_tree_duplicate_id_fails`）
  4. 異常系: 不明な status でエラー（§§テスト `design_tree_invalid_status_fails`）
  5. 正常系: 有効なCheckList Markdown がパスすること（§§テスト `valid_checklist_passes`）
  6. 異常系: ヘッダーなしのCheckListでエラー（§§テスト `checklist_without_header_fails`）
  7. 正常系: SchemaValidator が有効な state 値をパスすること
  8. 異常系: SchemaValidator が不明な state 値をエラーにすること
* **計装方法・観測対象:**
  - 検証エラーの有無・エラーメッセージ内容
  - エラー数の期待値との一致

---

#### チケット M2-2: QuestionFormatValidator（grill 質問形式検証）

* **参照設計書:** crates/conver/rfc-005-validation/RFC_005.md (§2.4)
* **依存・関連チケットID:** 依存先: M0-1（Validator trait, ValidationErrors）｜並列可能: M2-1, M2-3, M2-4
* **対象不変条件 / 規範:**
  - §2.4 ルール0: 質問ID（Q<番号>）が含まれている
  - §2.4 ルール1: 理由・背景・トレードオフが含まれている
  - §2.4 ルール2: Yes/No または ABC 選択肢で回答可能である
  - §2.4 ルール3: 自由記述を求める表現が含まれていない（選択肢がある場合は許容）
  - §2.4 ルール4: 選択肢は改行で区切られたリスト形式である（同一行に複数選択肢禁止）
  - §2.4 ルール5: 選択肢列挙後にAIの推奨＋理由が含まれている
* **実装の背景と目的:** grill セッションで生成される質問のフォーマットを機械的に検証する。質問が適切な形式（ID・理由・選択肢・推奨）を備えていることを保証することで、gpt-engineer スタイルのAI質問応答ループの品質を担保する。
* **実装スコープ:**
  - `conver-validation/src/question_fmt.rs` の新規作成
    - `QuestionFormatValidator` struct + `impl Validator<str>`
    - 内部ヘルパー: `regex_check(text: &str, pattern: &str) -> bool`
    - ルール0〜5の逐次チェック（各ルールが独立してエラーを追加）
  - スタブ: なし
* **テストコードによる検証:**
  1. 正常系: 全ルールを満たす質問がパスすること（§§テスト `valid_question_passes`）
  2. 異常系: ID 欠落でエラー（§§テスト `question_without_id_fails`）
  3. 異常系: 理由欠落でエラー、エラーメッセージに"理由"が含まれること（§§テスト `question_without_reasoning_fails`）
  4. 異常系: 選択肢欠落でエラー（§§テスト `question_without_choice_fails`）
  5. 異常系: 選択肢が同一行に並んでいるとエラー（§§テスト `question_inline_choices_fails`）
  6. 異常系: 推奨欠落でエラー、エラーメッセージに"推奨"が含まれること（§§テスト `question_without_recommendation_fails`）
  7. 境界値: 空文字列入力での挙動
  8. 境界値: 自由記述表現があっても選択肢がある場合は許容されること
* **計装方法・観測対象:**
  - 各ルールのエラー検出有無
  - 複数ルール違反時の error.errors.len() によるエラー数確認
  - 決定論性: 同一質問 → 同一検証結果

---

#### チケット M2-3: QualityGate（品質ゲート）

* **参照設計書:** crates/conver/rfc-005-validation/RFC_005.md (§2.5)
* **依存・関連チケットID:** 依存先: M0-1（ValidationErrors）｜並列可能: M2-1, M2-2, M2-4
* **対象不変条件 / 規範:**
  - §2.5 条件1: DesignTree の全ノードが resolved（open-count = 0）
  - §2.5 条件3: RFC_ROOT.md 本文に禁止表現（TBD / TODO）が0件
  - §2.5 条件4: 乖離関数 Δ = 0
  - §2.5 条件6: 未解決 STUB がゼロ
  - §2.5 条件2（[::STUB::]）: CheckList の全項目がマーク済み — **未実装**
  - §2.5 条件5（[::STUB::]）: 全ファイルのSHA-256ハッシュが一致 — **別gate（TamperDetector）でカバー**
* **実装の背景と目的:** RFC完了条件の機械的検証を行う最終ゲート。現在の validate_completion() は4/6条件を実装している。残り2条件（全チェックリストマーク完了 + SHA-256一致検証）は追加パラメータを必要とするため、[::STUB::] マーカーで明示し、将来の拡張に備える。条件5のSHA-256検証は Appendix A の TamperDetector（別RFC scope）で実装予定。
* **実装スコープ:**
  - `conver-validation/src/quality.rs` の新規作成
    - `QualityGate` struct + `validate_completion(...)` 
    - 引数: `design_tree_open_count: usize`, `rfc_text: &str`, `delta: f64`, `stub_count: usize`
    - 条件1: open_count > 0 でエラー追加
    - 条件3: "TBD" / "TODO" の contains チェック
    - 条件4: delta > 0.0 でエラー追加
    - 条件6: stub_count > 0 でエラー追加
  - `[::STUB::]`: 条件2（CheckList全項目マーク済み）は未実装。解決先チケットは未定（RFC_005 スコープ外の UI/CLI 層の機能に依存するため）
  - `[::STUB::]`: 条件5（SHA-256ハッシュ一致）は未実装。TamperDetector として Appendix A に定義済みだが、本RFCの実装範囲外
* **テストコードによる検証:**
  1. 正常系: 全条件満足で Ok を返すこと（§§テスト `quality_gate_passes_with_zero_issues`）
  2. 異常系: open_count > 0 でエラー（§§テスト `quality_gate_fails_with_open_nodes`）
  3. 異常系: "TBD" を含むRFC本文でエラー（§§テスト `quality_gate_fails_with_tbd`）
  4. 異常系: "TODO" を含むRFC本文でエラー
  5. 異常系: Δ > 0 でエラー（§§テスト `quality_gate_fails_with_nonzero_delta`）
  6. 異常系: stub_count > 0 でエラー（§§テスト `quality_gate_fails_with_stubs`）
  7. 境界値: delta = 0.0 の境界確認
  8. 境界値: 空文字列の RFC 本文でパニックしないこと
* **計装方法・観測対象:**
  - 各条件のエラー検出有無
  - 複数条件違反時の error.errors.len() 確認

---

#### チケット M2-4: DagValidator（petgraph DAG 検証）

* **参照設計書:** crates/conver/rfc-005-validation/RFC_005.md (§2.6)
* **依存・関連チケットID:** 依存先: M0-1（ValidationErrors, DagValidationReport）｜並列可能: M2-1, M2-2, M2-3
* **対象不変条件 / 規範:**
  - §2.6: validate_rfc_tree() は JSON パース / ID一意性 / 親→子依存違反 / 有向閉路を検出
  - §2.6: petgraph の DiGraph と is_cyclic_digraph で循環検出
  - §2.6: validate_ticket_dag() は ID一意性 / 依存先実在性を検証
  - §2.6: validate_with_report() は構造化結果を DagValidationReport で返す
* **実装の背景と目的:** RFCツリーDAGとチケットDAGの構造的整合性を検証する。petgraph ライブラリのグラフアルゴリズム（循環検出）を利用することで、手動実装によるバグを防止する。RFCツリーでは階層辺とは別に依存辺を持ち、親→子方向の依存を意味的矛盾として検出する。
* **実装スコープ:**
  - `conver-validation/src/dag.rs` の新規作成
    - `DagValidator` struct
    - `validate_rfc_tree(&self, json: &str) -> Result<(), ValidationErrors>`
      - JSONパース → nodes取得 → ID一意性 → petgraph DiGraph構築 → 親→子依存チェック → 循環検出
    - `validate_ticket_dag(&self, json: &str) -> Result<(), ValidationErrors>`
      - JSONパース → tickets取得 → ID一意性 → 依存先実在性チェック
    - `validate_with_report(&self, json: &str) -> DagValidationReport`
    - `DagValidationReport` struct（§2.6 定義）— 型定義は M0-1 で完了済み
  - スタブ: なし
* **テストコードによる検証:**
  1. 正常系: 循環なしRFCツリーがパスすること（§§テスト `valid_rfc_tree_passes`）
  2. 異常系: 循環ありRFCツリーが !valid を返すこと（§§テスト `rfc_tree_cycle_detected`）
  3. 異常系: 存在しない依存先でエラー（§§テスト `ticket_dag_missing_dependency_fails`）
  4. 異常系: 重複チケットIDでエラー（§§テスト `ticket_dag_duplicate_id_fails`）
  5. 正常系: エラーありDAGで report.errors が空でないこと（§§テスト `dag_validation_report_contains_errors`）
  6. 異常系: 親→子依存違反（parent depends on child）でエラー
  7. 境界値: 空ノードリストでの動作
  8. 境界値: 依存辺がないノードのみのツリー
* **計装方法・観測対象:**
  - report.valid の真偽値
  - report.errors の内容・件数
  - 決定論性: 同一JSON → 同一検証結果

---

#### チケット M2-5: conver-validation lib.rs（モジュール統合）

* **参照設計書:** crates/conver/rfc-005-validation/RFC_005.md (§2.1, モジュール一覧)
* **依存・関連チケットID:** 依存先: M2-1, M2-2, M2-3, M2-4（全バリデータ実装完了後）
* **対象不変条件 / 規範:**
  - §2.1: lib.rs は schema / question_fmt / quality / dag の4モジュールを宣言
  - §2.2: Validator trait + ValidationErrors は lib.rs で定義
  - モジュール一覧の error.rs は lib.rs に統合（ValidationErrors は lib.rs で定義済み）
* **実装の背景と目的:** 4つの検証ゲートモジュールを統合し、crate の公開 API を確定する。M0-1 で作成した lib.rs にモジュール宣言を追加する形で進める。
* **実装スコープ:**
  - `conver-validation/src/lib.rs` への追記（M0-1 内容を拡張）
    - `pub mod schema;` / `pub mod question_fmt;` / `pub mod quality;` / `pub mod dag;`
    - 主要型の再公開
  - スタブ: なし
* **テストコードによる検証:**
  1. コンパイル時検証: `cargo check -p conver-validation` が通ること
  2. コンパイル時検証: 全主要型が `conver_validation::schema::SchemaValidator` 等でアクセス可能であること
* **計装方法・観測対象:**
  - コンパイル結果

---

## Phase 3: テスト統合 (Layer 4)

> **外部依存:** 両crateが完了していること
> **外部I/O:** ファイル読み込み（test-run が JSON ファイルを扱う場合）

### Milestone M3: 受入テスト実装

---

#### チケット M3-1: テスト実行バイナリ（test-run.rs）

* **参照設計書:** crates/conver/rfc-005-validation/RFC_005.md (§受入テスト)
* **依存・関連チケットID:** 依存先: Phase 1 + Phase 2 の全チケット完了
* **対象不変条件 / 規範:**
  - 受入テスト§: 5種の検証ゲート + ConvergenceReporter の結合テスト
  - 全アサートが PASS すること
* **実装の背景と目的:** 全crateの結合テストを提供する単一バイナリ。ユニットテストではカバーしきれないクロスモジュールの動作を検証する。`cargo run --bin test-run -p conver-validation` および `cargo run --bin test-run -p conver-projection` で実行。
* **実装スコープ:**
  - `crates/conver/rfc-005-validation/tests/test-run.rs` の作成
    - QuestionFormatValidator 結合テスト（有効/無効質問）
    - DesignTreeValidator 結合テスト（有効/無効ツリー）
    - QualityGate 結合テスト（完了/未完了）
    - DagValidator 結合テスト（有効/循環DAG）
    - ConvergenceReporter 結合テスト（format_text 出力）
  - スタブ: なし
* **テストコードによる検証:**
  - バイナリが panics なく終了すること
  - 各テストアサートが PASS すること
* **計装方法・観測対象:**
  - `cargo run --bin test-run -p conver-validation` の終了コード（0）

---

## フェーズ間依存関係

```
Phase 0 ──────────────────────────────────┐
  M0-1 (Validation基底型) ─────────→ Phase 2 (全バリデータ) ──→ M3-1
  M0-2 (Projectionデータ型) ───────→ Phase 1 (全プロジェクション) ──→ M3-1
  M0-3 (MarkdownTemplate) ─────────→ Phase 1 (全プロジェクション利用)
                                           │
Phase 2 内 (M2-1〜M2-4) ─── 並行可能 ───→ M2-5 (lib.rs統合)
Phase 1 内 (M1-1〜M1-3) ─── 並行可能 ───→ M1-4 (lib.rs統合)
                                           │
Phase 1 + Phase 2 は互いに独立 ── 並行開発可能 ──→ Phase 3
```

---

## 完了条件

1. `cargo check -p conver-projection` が通ること
2. `cargo check -p conver-validation` が通ること
3. `cargo test -p conver-projection` が全テストパスすること
4. `cargo test -p conver-validation` が全テストパスすること
5. `cargo run --bin test-run -p conver-projection` が panics なく終了すること
6. `cargo run --bin test-run -p conver-validation` が panics なく終了すること
7. QualityGate の未実装条件（[::STUB::]）が Malfeasance.json に犯罪として記録されていること
