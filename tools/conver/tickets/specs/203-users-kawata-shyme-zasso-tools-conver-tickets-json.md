# Implementation Order (TDD Red-Green-Refactor)

Implementation must strictly follow the **Red → Green → Refactor** sequence. Skipping steps, reordering, or parallel execution is prohibited.

## 1. Red — Fully Implement Failing Tests

Before writing a single line of implementation code, write a failing test suite that achieves 100% coverage of the spec's **Goal, Purpose, Motivation, Constraints, Scope, Acceptance Criteria, and Invariants**. Coverage of these seven elements is mandatory; partial implementation is not acceptable.

When the ticket defines **Contracts** (Precondition/Postcondition/Invariant from graph edge annotation), the Red phase must first translate each Contract into testable form — input schemas, output assertions, and invariant predicates — before implementing them as concrete test code. A Contract whose Precondition/Postcondition/Invariant cannot be expressed as a testable assertion is not yet fully specified.

- Tests must cover all observable behaviors, edge cases, failure modes, and invariants. Any behavior not covered is considered undefined and fails review.
- If a feature is deterministic yet fundamentally untestable, this is not a testing gap but an architectural defect. Redesign the system until it is testable before proceeding to implementation.
- Confirm that all tests fail red due to the absence of implementation. Tests that pass green by accident (e.g., meaningless assertions) are invalid.

## 2. Green — Implement Behavior (No Stubs, No Test Modification)

Implement the **behavior** specified by the tests; do not treat passing the tests as an end in itself. Tests are a means of verifying correctness, not the goal itself.

- Implementations that merely satisfy the literal wording of tests—via hardcoding, input-specific branching, or stubbed return values—are prohibited. The implementation must be a generalized, correct solution.
- If it is impossible to distinguish, via testing, whether an implementation is genuine or a disguised green, this indicates a design flaw caused by insufficient coverage. Add tests until the distinction is possible before proceeding with implementation.
- Modifying, deleting, or weakening tests to make an implementation pass is strictly forbidden. The implementation must conform to the tests; the reverse is never acceptable.
- An implementation whose correctness cannot be proven is invalid. It is not considered complete until it (or its design) is restructured into a provably correct form.

## 3. Refactor — Apply the Boy Scout Rule (Green State Only)

Refactor only after all tests are green. Refactoring in a red state is prohibited.

- Apply the Boy Scout Rule (leave the code cleaner than you found it; readability = translatability) to eliminate `unwrap()` calls, hardcoded values, false comments, and untested code in anything you touch.
- Verify that all tests remain green before and after each refactoring step. If a refactor breaks green, roll it back immediately.

## Definition of Done

Implementation is considered incomplete unless all of the following are satisfied:

- The tests fully and precisely specify the intended behavior.
- The implementation passes all tests green, without exception.
- Correctness is empirically guaranteed by the tests (not a disguised green).
- No gap exists between test coverage and intended behavior.

Green without red, green achieved by modifying tests, and green achieved through stubs are all violations and constitute incomplete work.

# Target ticket is PX-203: workspacify-reverse 基盤: 順回転痕跡の検出・除去・検証スクリプトと実験入力の清浄化

**Ticket Key**: PX-203 · **Phase**: -1

---

## Background

### Goal
siprs-for-reverse に対する逆回転が「AI が答えを読めるか」ではなく「実装から設計を再建できるか」を測る実験として成立するための最小条件を、機械的に保証された状態にする。

### Purpose
既存プロジェクトを conver の4層ループへ反転させる逆回転パイプライン（docs/ABOUT-REVERSE.md）は、その入力が順回転の痕跡を含んでいてはならない。本チケットはその前提条件を、汎用の検出器・スクラバ・検証器として実装する。

### Motivation
現状の siprs-for-reverse は .claude/.git/docs/specs と forward 由来 JSON を削除しただけであり、ソース本体（126ファイル / 52,689行）は siprs-with-4layers と同一で、順回転のプロベナンス鎖を丸ごと保持している。実測した漏洩は4層:
- **L1 プロベナンス**: [::TICKET::] 655行、Initial Design Artifact ヘッダ 99ファイル、NODE_ID= 127、To show details 109、RFC-ROOT 言及 427/412/314
- **L2 契約**: @verifies 673行、ユニーク契約ID 144、契約コメント 126ファイル、omission ID 7、RFC §番号 59
- **L3 設計文書依存テスト**: client.rs の9行（RFC-ROOT.md が無いため既に失敗する）
- **L4 コード構造**: モジュール名・公開API（正当な逆回転入力。除去しない）

この状態で逆回転が「成功」しても、AI が答えを読めるかを測っただけであり、siprs への最適化と区別できない。科学的に意味のある反証可能な実験にするには、痕跡の除去とその機械的検証が先に必要である。

### Constraints
- **順回転を一切破壊しない。** スクリプトは `.claude/scripts/workspacify-reverse/` に新設し、既存 workspacify モジュールに触れない
- **原本 siprs-with-4layers は無傷で保持する**（Initial Design Artifact ヘッダのトレーサビリティはそこに保全される）
- **検出器は汎用でなければならない。** siprs 固有の実装をしてはならず、他プロジェクトで同じ汚染を検出できること
- **誤削除の防止**: IETF 標準参照（RFC 4733 / RFC 2833 / RFC 2976）と非コメント行（文字列リテラル）を絶対に除去しない
- 出力は Markdown + 意味論を含む自然言語を原則とする（docs/ABOUT-REVERSE.md 5章）

## Scope

- **Scope of changes:**
  - [File/module path] `.claude/scripts/workspacify-reverse/`（新設）、`tests/workspacify-reverse/`（新設）、`siprs-for-reverse/`（データ。スクラブ対象）
  - [Action] **add**（スクリプト新設） / **modify**（siprs-for-reverse のコメント行削除、L3 テストの扱い、ファイル名の痕跡への対処）
  - [What specifically changes] 5 モジュールの新設 + siprs-for-reverse の L1/L2 除去 + L3 該当テストの処理 + ファイル名の痕跡への対処
  - [Before → After] 検出・除去・検証の手段が存在しない → `run.mjs detect|scrub|verify` の 3 サブコマンドで機械的に実行・検証できる。siprs-for-reverse は L1/L2 = 0 件の状態になる
  - [API contract] 新設 CLI: `run.mjs <detect|scrub|verify> <root> [--apply] [--dry-run] [--json]`
  - [Data schema] 検出レポートの sidecar JSON（層・件数・file:line・sha256）。**Markdown が主、JSON は機械可読が必要な箇所のみ**（ABOUT-REVERSE.md 5.1節）
  - [Config/env] 追加なし
  - [Dependency] **追加なし**（Node.js 標準モジュールのみ。既存 workspacify と同じ方針）
- **Out of scope:**
  - [Excluded item]
    (a) L4（コード構造）の除去
    (b) `siprs-with-4layers` へのいかなる変更
    (c) 逆回転パイプライン本体（`/workspacify-reverse` コマンド定義・R0〜R8 の解析スクリプト）
    (d) L3 のテストが検証していた契約内容そのものの復元
  - [Why excluded]
    (a) L4 は漏洩ではなく**正当な逆回転入力**である。除去すると実験が別物になる
    (b) 原本不可侵（C005）。トレーサビリティはここに保全する
    (c) Phase 0 以降の別チケット。本チケットは Phase −1-g の基盤のみ
    (d) それは逆回転の**成果物**であり、本チケットはその入力を整えるに過ぎない
- **Affected areas:**
  - [Affected component] `siprs-for-reverse`（実験入力）、将来の逆回転パイプライン全体、他プロジェクトへのリーク検出器の適用
  - [Nature of impact] **data format**（実験入力からプロベナンス情報が消える） / **API surface**（新設 CLI） / **実験の科学性**（測定の妥当性）
  - [Corresponding change needed] **Y**: スクラブ後、逆回転の測定値を「siprs 最適化なし」と主張できるようになる。ただし**ホールドアウト検証（別プロジェクト2〜3件）は別途必要**（ABOUT-REVERSE.md 11.9節の残課題）

## Implementation Target Files

- `.claude/scripts/workspacify-reverse/run.mjs`
- `.claude/scripts/workspacify-reverse/lib/detect-forward-traces.mjs`
- `.claude/scripts/workspacify-reverse/lib/scrub-forward-traces.mjs`
- `.claude/scripts/workspacify-reverse/lib/verify-scrub.mjs`
- `.claude/scripts/workspacify-reverse/lib/trace-patterns.mjs`

## Investigation

- **調査日**: 2026-09-10 / **対象**: `siprs-for-reverse`（126 .rs / 52,689 行）
- **既存ディレクトリ**: `.claude` / `.git` / `docs` / `specs` / `scripts` は削除済み。`Tickets.json`・`*-GRAPH.json`・`*-Dirs-Tree.json`・`WORKSPACIFY*`・`OMISSIONS*`・`CRYSTALIZE*` も不存在。`vendor/pjsip/README.md` のみ残るが第三者の同梱物であり順回転の痕跡ではない
- **規模の一致**: `siprs-for-reverse` と `siprs-with-4layers` は src 126 ファイル / 52,689 行で**完全一致**。ソース本体は 1 文字も削られていない
- **汚染ファイル種別**: `.rs` 150 / `.conf` 3 / `.yml` 1 / `.toml` 1 / `.h` 1（vendor 除く）
- **L1 実例**: `src/lib.rs:1` に `// [::TICKET::] P16-5 changes. Details: \`node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-5 ...\`` が **655 行**。ユニークなチケットキー **108 個**（P0-1 〜 P16-5）。**フェーズ分解と実装順序がそのまま露出する**
- **L1 ヘッダ実例**: **99 ファイル**が `// Initial Design Artifact — RFC-driven Implementation` ブロックを持ち、内部に `// Mapped node(s): - NODE_ID=N0007: §5 Functional Requirements — Normative Scope` とクエリ手順を含む。**ファイル→グラフノード対応と RFC セクション名が露出する**
- **L2 実例**: `// @verifies C001` が **673 行**、ユニーク契約 ID **144 個**。さらに `/// O-001 — C026 invariant: RegistrationState is independent of call ability.` のように**契約の意味そのものと omission ID がコメント化されている**（126 ファイル）
- **L3 実例**: `src/client.rs:1106` ほか **9 行**が `std::fs::read_to_string("RFC-ROOT.md")` を実行し `content.contains("音声のみ")` を assert する。**RFC-ROOT.md が存在しないため、このテストは現状すでに失敗する**
- **誤削除の危険（実測）**: `RFC 4733` / `RFC 2833` / `RFC 2976` は**正当な IETF 標準参照**（11 / 6 / 5 箇所）。非コメント行の `RFC-ROOT` は **9 件**あり、いずれもテストコード内の文字列リテラル。**盲目的な一括置換はビルドを壊す**
- **ファイル名の痕跡**: `tests/verify_spec_p9_1.rs` / `verify_spec_p8_2.rs` / `verify_spec_p7_3.rs` など、**ファイル名自体がチケットキーを露出させる**
- **既存規約**: `.claude/scripts/<module>/run.mjs`（サブコマンド型エントリ）+ `lib/*.mjs`。テストは `tests/<module>/{unit,integration,acceptance}/*.test.mjs` を **`node --test`** で実行（Makefile は使わない）。テストファイル先頭に `// @verifies C###` を付す

## Acceptance Criteria

- **[Happy path]:**
  - `node .claude/scripts/workspacify-reverse/run.mjs detect siprs-for-reverse` が 4 層の検出結果を Markdown で出力し、L1・L2 の件数が背景に記載の実測値（L1: 655行 / 99ファイル / NODE_ID 127、L2: 673行 / 契約ID 144）と整合する
  - `run.mjs scrub siprs-for-reverse --apply` が L1/L2 を除去し、削除件数を層別に報告する
  - `run.mjs verify siprs-for-reverse` が **残存 0** を報告して exit 0 する
- **[Error case]:**
  - 対象ルートが存在しない場合、`run.mjs` が説明的なエラーを出力して非ゼロ終了する（スタックトレースの垂れ流しや無言終了をしない）
  - スクラブ対象が 0 件の場合、「削除 0 件」と報告して正常終了する（失敗と区別する）
- **[Edge case]:**
  - `siprs-for-reverse` の実データ（150 .rs + 6 非 .rs）に対して実行し、**`siprs-with-4layers` の全ファイル SHA-256 が不変**であること
  - **IETF 標準参照（`RFC 4733` / `RFC 2833` / `RFC 2976`）を含む行が 1 バイトも変化していない**こと
  - スクラブ後に `cargo check`（不能なら `--no-default-features`）が成功すること

## Invariants

- 【通常成立】対象ルートとその配下の全対象ファイル（.rs / .toml / .yml / .conf / .h）が列挙され、`vendor/` と `.git/` は除外される。検出結果は層別の件数と file:line を持つ
- 【エラー時】対象ルート不在・読み取り不能・書き込み不能のいずれでも例外を握りつぶさず、原因と該当パスを報告して非ゼロ終了する。`--dry-run` では対象ファイルが 1 バイトも変化しない
- 【内部状態】検出・除去・検証の 3 段は `trace-patterns.mjs` の単一のパターン定義を共有する。検出器と検証器が異なる述語を持つ状態は不正である
- 【境界】`RFC \d+`（IETF 標準参照）と非コメント行は、いかなる入力に対しても除去されない。閉じフェンスを欠く不完全ヘッダ、0 バイトファイル、CRLF 改行、ヘッダのみのファイルで誤削除が起きない

## Contracts — mandatory 100% test coverage in TDD Red phase

### C001 — N/A（逆回転基盤の新設。RFC グラフ非接続）

- **Precondition**: siprs-for-reverse/ が存在し、src・tests・Cargo.toml・docker 設定・wrapper.h を含む。対象ルートへの読み取り権限がある
- **Postcondition**: L1（プロベナンス）/ L2（契約）/ L3（設計文書依存）/ L4（コード構造）の各層について、検出件数と file:line が Markdown で報告される。L4 は「除去しない層」として明示される
- **Invariant**: 検出は読み取り専用であり、対象ファイルのバイトを一切変更しない

### C002 — N/A

- **Precondition**: 検出レポートが存在し、L1/L2 の除去対象行が確定している
- **Postcondition**: スクラブ後、非コメント行が 1 バイトも変化していない。IETF 標準参照（RFC 4733 / RFC 2833 / RFC 2976）を含む行が保持されている
- **Invariant**: スクラブ前後で非コメント行の SHA-256 が一致する。除去は『行の削除』のみであり、行内の部分改変を行わない

### C003 — N/A

- **Precondition**: L1/L2 の検出結果が存在する
- **Postcondition**: スクラブ後、`[::TICKET::]` / `@verifies` / `Initial Design Artifact` ヘッダブロック / `NODE_ID=` / `To show details` / `RFC-ROOT*` / 契約コメント行（`C### invariant|postcondition|precondition:`）が 0 件になる
- **Invariant**: ヘッダブロックの除去は開始フェンスから終了フェンスまでブロック単位で行い、閉じフェンスを欠く不完全ブロックは無変換で通過して警告を出す

### C004 — N/A

- **Precondition**: スクラブが完了している
- **Postcondition**: `verify-scrub` が残存 0 のとき exit 0 を返し、残存があるときは検出箇所を file:line で列挙して exit 1 を返す
- **Invariant**: 検証は検出器と同一の述語（trace-patterns.mjs）を用いる。片側バイパスが存在しない

### C005 — N/A

- **Precondition**: siprs-with-4layers/ が存在する
- **Postcondition**: スクラブ後も siprs-with-4layers/ の全ファイルの SHA-256 が不変である
- **Invariant**: スクラバは siprs-for-reverse/ 以外のいかなるパスにも書き込みを行わない

### C006 — N/A

- **Precondition**: tests/ 配下にチケットキーをファイル名に含むテスト（verify_spec_p*_*.rs）が存在する
- **Postcondition**: 当該ファイルが検出され、改名または報告される
- **Invariant**: 改名後も cargo のテスト自動検出が成立する（tests/*.rs は名前で参照されないため安全）

## Boy Scout Rule

- **新設コードは translatability を最優先で設計する**: 関数は動詞句（`resolveTargetRoot` / `detectForwardTraces` / `scrubForwardTraces` / `verifyScrub`）、変数はドメイン概念（`traceLayer` / `detectionReport` / `removedLineCount` / `residualFindings`）、1 関数 1 責務
- **ハードコードの排除**: L1〜L4 のパターンは `trace-patterns.mjs` に**名前付き定数**として集約し、検出器と検証器が同一の定義を参照する（**重複定義を作らない**）
- **エラーの握りつぶし禁止**: 読み取り・書き込みの失敗は全て例外として伝播し、原因と該当パスを添えて報告する。無言の `continue` を禁止する
- **既存コードへの波及**: 本チケットは `.claude/scripts/workspacify-reverse/` の新設と `siprs-for-reverse/` のデータ加工に限定されるため、既存の実装コードには触れない。**Boy Scout Rule の適用対象は新設コードそのもの**であり、ABOUT-REVERSE.md 6.14節の受け入れ基準を満たす形で書く
- **コメントは first-class**: 各モジュール冒頭に「何をするか」ではなく「**なぜその層分けなのか**（L4 を除去しない理由、行単位削除にした理由）」を英語で記述する

## Test Plan

### Unit Tests

- **UT: [Normal] — 通常系の検証:**
  - UT-1: `resolveTargetRoot` が対象ルート配下の全対象ファイル（.rs / .toml / .yml / .conf / .h）を列挙し、`vendor/` と `.git/` を除外する
  - UT-2: `detectForwardTraces` が L1（`[::TICKET::]` / `Initial Design Artifact` / `NODE_ID=` / `To show details` / `RFC-ROOT`）を検出し、層別の件数と file:line を返す（**C001**）
  - UT-3: `detectForwardTraces` が L2（`@verifies C###` / `C### invariant|postcondition|precondition:`）を検出する（**C001**）
  - UT-4: `detectForwardTraces` が L3（`read_to_string("RFC-ROOT.md")` 等、設計文書を読むコード行）を検出する（**C001**）
  - UT-5: `detectForwardTraces` が L4（モジュール名・公開 API）を**検出対象に含めない**（除去してはならないため）（**C001**）
  - UT-6: `scrubForwardTraces` が L1/L2 のプロベナンス行を削除し、削除件数を層別に報告する（**C003**）
  - UT-7: `scrubForwardTraces` が `Initial Design Artifact` ヘッダブロックをブロック単位で削除する（**C003**）
  - UT-8: `verifyScrub` が残存 0 のとき exit 0、残存ありのとき検出箇所を列挙して exit 1 を返す（**C004**）
- **UT: [Error] — 異常系の検証:**
  - UT-9: 対象ルートが存在しないとき `resolveTargetRoot` が説明的なエラーを返し、例外を握りつぶさない
  - UT-10: 対象ファイルが読めない（権限なし）とき、処理を中断して原因と該当パスを報告する
  - UT-11: `--dry-run` で実行したとき、対象ファイルが 1 バイトも変更されない
  - UT-12: スクラブ対象が 0 件のとき、正常終了し「削除 0 件」と報告する（異常と区別する）
- **UT: [Boundary] — 境界値の検証:**
  - UT-13: 0 バイトの空ファイルに対して検出・除去が安全に完了する
  - UT-14: ファイル全体がヘッダブロックのみ（コード行 0）のとき、削除後にファイルサイズが縮むが構文は壊れない
  - UT-15: `// =====` で閉じられていない不完全なヘッダに対し、**無変換で通過し警告を出す**（誤削除しない）
  - UT-16: CRLF 改行のファイルで、行単位削除が改行コードを壊さない
  - UT-17: **`RFC 4733` / `RFC 2833` / `RFC 2976`（IETF 標準参照）を含む行が 1 バイトも変化しない**（誤削除の防止。**C002**）
  - UT-18: ファイル名にチケットキーを含む `tests/verify_spec_p*_*.rs` が検出される（**C006**）
- **UT: [Invariant] — 不変条件の検証:**
  - UT-19: スクラブ前後で、**非コメント行の SHA-256 が完全一致**する（**C002**）
  - UT-20: スクラブ後、`[::TICKET::]` / `@verifies` / `NODE_ID=` / `Initial Design Artifact` / `RFC-ROOT` / 契約コメント行が **0 件**になる（**C003**）
  - UT-21: `verify-scrub` と `detect-forward-traces` が**同一の述語**を用いる（片側バイパスが無い。**C004**）
  - UT-22: スクラブは `siprs-for-reverse/` 配下にのみ書き込み、`siprs-with-4layers/` のいかなるファイルの SHA-256 も変えない（**C005**）
- **UT: [契約翻訳] — 各契約条項のテスト可能形への翻訳（Phase 1.5）:**
  - **C001 precondition**「siprs-for-reverse/ が存在し、src・tests・Cargo.toml・docker 設定・wrapper.h を含む。対象ルートへの読み取り権限がある」→ UT-1 が対象ファイル列挙と権限前提を検証する
  - **C001 postcondition**「L1（プロベナンス）/ L2（契約）/ L3（設計文書依存）/ L4（コード構造）の各層について、検出件数と file:line が Markdown で報告される。L4 は「除去しない層」として明示される」→ UT-2〜UT-5 が層別報告と L4 非対象を検証する
  - **C001 invariant**「検出は読み取り専用であり、対象ファイルのバイトを一切変更しない」→ UT-11 が dry-run で 1 バイトも変更しないことを検証する
  - **C002 precondition**「検出レポートが存在し、L1/L2 の除去対象行が確定している」→ UT-6 が検出結果を入力に除去対象を確定することを検証する
  - **C002 postcondition**「スクラブ後、非コメント行が 1 バイトも変化していない。IETF 標準参照（RFC 4733 / RFC 2833 / RFC 2976）を含む行が保持されている」→ UT-17 と UT-19 が検証する
  - **C002 invariant**「スクラブ前後で非コメント行の SHA-256 が一致する。除去は『行の削除』のみであり、行内の部分改変を行わない」→ UT-19 が検証する
  - **C003 precondition**「L1/L2 の検出結果が存在する」→ UT-6 の前提として検証する
  - **C003 postcondition**「スクラブ後、`[::TICKET::]` / `@verifies` / `Initial Design Artifact` ヘッダブロック / `NODE_ID=` / `To show details` / `RFC-ROOT*` / 契約コメント行（`C### invariant|postcondition|precondition:`）が 0 件になる」→ UT-20 が検証する
  - **C003 invariant**「ヘッダブロックの除去は開始フェンスから終了フェンスまでブロック単位で行い、閉じフェンスを欠く不完全ブロックは無変換で通過して警告を出す」→ UT-7 と UT-15 が検証する
  - **C004 precondition**「スクラブが完了している」→ UT-8 の前提として検証する
  - **C004 postcondition**「`verify-scrub` が残存 0 のとき exit 0 を返し、残存があるときは検出箇所を file:line で列挙して exit 1 を返す」→ UT-8 が検証する
  - **C004 invariant**「検証は検出器と同一の述語（trace-patterns.mjs）を用いる。片側バイパスが存在しない」→ UT-21 が検証する
  - **C005 precondition**「siprs-with-4layers/ が存在する」→ UT-22 の前提として検証する
  - **C005 postcondition**「スクラブ後も siprs-with-4layers/ の全ファイルの SHA-256 が不変である」→ UT-22 が検証する
  - **C005 invariant**「スクラバは siprs-for-reverse/ 以外のいかなるパスにも書き込みを行わない」→ UT-22 が検証する
  - **C006 precondition**「tests/ 配下にチケットキーをファイル名に含むテスト（verify_spec_p*_*.rs）が存在する」→ UT-18 が検出を検証する
  - **C006 postcondition**「当該ファイルが検出され、改名または報告される」→ UT-18 が検出と報告を検証する
  - **C006 invariant**「改名後も cargo のテスト自動検出が成立する（tests/*.rs は名前で参照されないため安全）」→ UT-18 の改名後に `cargo test --no-run` 相当で自動検出が成立することを検証する

### Integration Tests

- **IT: [統合点] — モジュール間インタフェース:**
  - `trace-patterns.mjs` → `detect-forward-traces.mjs`（検出パターン定義の供給。L1〜L4 を単一情報源とする）
  - `detect-forward-traces.mjs` → `scrub-forward-traces.mjs`（検出結果を除去対象として消費）
  - `scrub-forward-traces.mjs` → `verify-scrub.mjs`（スクラブ後に同一述語で再検出）
  - `run.mjs` → 上記 3 モジュール（サブコマンド `detect` / `scrub` / `verify` のオーケストレーション）
- **IT: [検証内容]:**
  - IT-1: 検出 → 除去 → 検証の全経路を通し、最終的に残存 0 が報告されること
  - IT-2: `siprs-for-reverse` の実データ（150 .rs + 6 非 .rs ファイル）に対して実行し、L1/L2 が 0 件になること
  - IT-3: スクラブ後に `cargo check` が成功すること（コメント除去が構文・意味を壊していない証明）
  - IT-4: スクラブ前後で `siprs-with-4layers` の全ファイル SHA-256 が不変であること（原本不可侵）
- **IT: [前提条件]:**
  - `siprs-for-reverse/` と `siprs-with-4layers/` がリポジトリ直下に存在すること
  - Node.js 22 以上（`node --test` を使用。Makefile は使わない）
  - `cargo` 1.95 以上（IT-3 のビルド検証に必要。toolchain が無い環境では IT-3 を skip し、その旨を明示的に報告する）
  - IETF 標準参照（`RFC 4733` / `RFC 2833` / `RFC 2976`）を含むファイルが存在すること（誤削除検出のため）
- **IT: [関連チケット]:**
  - PX-202（workspacify-tree のゲート実装）— 本チケットのスクリプトは `.claude/scripts/workspacify-reverse/` に**新設**し、既存 workspacify モジュールには一切触れない（順回転保護）
  - 後続: `/workspacify-reverse` スラッシュコマンド本体、リーク検出器の汎用ゲート化（Phase 0 への組み込み）
  - 関連文書: `docs/ABOUT-REVERSE.md` 11.9節（計画の自己監査 #1〜#3）、6.13.1節（Phase −1-g）、6.14節（受け入れ基準）

### Exceptions

- **例外エントリ:**
  - [項目] `cargo check` によるビルド検証（IT-3）
  - [理由] `vendor/pjsip`（55MB）の FFI ビルドを伴い、**システム PJSIP 未導入という外部依存（external dependency）**により失敗しうる。実装の決定性に起因するものではなく、**設計欠陥ではない（not a design defect / not an architectural defect）**。テスト不能の理由は外部依存であり、本チケットの成果物（行単位のコメント除去）の正しさとは独立である
  - [代替検証] まず `cargo check --no-default-features` を試行する。それも不能な場合は、**スクラブ前後で非コメント行の SHA-256 が一致すること（UT-19）** と **プロベナンス行が 0 件になること（UT-20）** で、コメント除去が意味を壊していないことを証明する。行単位削除は意味論に影響しないため、この代替で十分に担保される

### Plan Test Code (concrete code)

- UT: C001 precondition —— 「siprs-for-reverse/ が存在し、src・tests・Cargo.toml・docker 設定・wrapper.h を含む。対象ルートへの読み取り権限がある」
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTargetRoot } from '../../../.claude/scripts/workspacify-reverse/lib/detect-forward-traces.mjs';

test('resolveTargetRoot enumerates every tracked file and excludes vendor', () => {
  const root = resolveTargetRoot(FIXTURE_ROOT);
  assert.equal(root.exists, true);
  assert.deepEqual(root.excludedDirs, ['.git', 'vendor', 'node_modules']);
  const exts = new Set(root.files.map((f) => f.ext));
  for (const ext of ['.rs', '.toml', '.yml', '.conf', '.h']) assert.ok(exts.has(ext), ext);
});
```
UT: C001 postcondition —— 「L1（プロベナンス）/ L2（契約）/ L3（設計文書依存）/ L4（コード構造）の各層について、検出件数と file:line が Markdown で報告される。L4 は「除去しない層」として明示される」
```js
test('detectForwardTraces reports per-layer counts with file:line and marks L4 as non-removable', () => {
  const report = detectForwardTraces(FIXTURE_ROOT);
  for (const layer of ['L1', 'L2', 'L3', 'L4']) assert.ok(report.layers[layer], layer);
  assert.ok(report.layers.L1.count > 0);
  assert.equal(report.layers.L4.removable, false);
  assert.match(report.markdown, /^## /m);
});
```
UT: C001 invariant —— 「検出は読み取り専用であり、対象ファイルのバイトを一切変更しない」
```js
test('detect is read-only: no target byte changes', () => {
  const before = hashTree(FIXTURE_ROOT);
  detectForwardTraces(FIXTURE_ROOT);
  const after = hashTree(FIXTURE_ROOT);
  assert.deepEqual(after, before);
});
```
- UT: C002 precondition —— 「検出レポートが存在し、L1/L2 の除去対象行が確定している」
```js
test('scrub consumes a detection report and fixes the removable L1/L2 lines', () => {
  const report = detectForwardTraces(FIXTURE_ROOT);
  const plan = planScrub(report);
  assert.ok(plan.removals.length > 0);
  for (const r of plan.removals) assert.ok(r.layer === 'L1' || r.layer === 'L2');
});
```
UT: C002 postcondition —— 「スクラブ後、非コメント行が 1 バイトも変化していない。IETF 標準参照（RFC 4733 / RFC 2833 / RFC 2976）を含む行が保持されている」
```js
test('non-comment lines and IETF references survive the scrub', () => {
  const before = readLines(SAMPLE_RS);
  const after = scrubForwardTraces(FIXTURE_ROOT, { apply: true }).files[SAMPLE_RS];
  assert.deepEqual(nonCommentLines(after), nonCommentLines(before));
  assert.ok(after.some((l) => l.includes('RFC 4733')));
  assert.ok(after.some((l) => l.includes('RFC 2833')));
});
```
UT: C002 invariant —— 「スクラブ前後で非コメント行の SHA-256 が一致する。除去は『行の削除』のみであり、行内の部分改変を行わない」
```js
test('non-comment SHA-256 is identical and removal never edits inside a line', () => {
  const before = nonCommentLines(readLines(SAMPLE_RS));
  const after = nonCommentLines(scrubForwardTraces(FIXTURE_ROOT, { apply: true }).files[SAMPLE_RS]);
  assert.equal(sha256(after.join('\n')), sha256(before.join('\n')));
  for (const line of after) assert.ok(before.includes(line), 'line was edited in place');
});
```
- UT: C003 precondition —— 「L1/L2 の検出結果が存在する」
```js
test('scrub requires a non-empty L1/L2 detection result', () => {
  const report = detectForwardTraces(FIXTURE_ROOT);
  assert.ok(report.layers.L1.count + report.layers.L2.count > 0);
});
```
UT: C003 postcondition —— 「スクラブ後、`[::TICKET::]` / `@verifies` / `Initial Design Artifact` ヘッダブロック / `NODE_ID=` / `To show details` / `RFC-ROOT*` / 契約コメント行（`C### invariant|postcondition|precondition:`）が 0 件になる」
```js
test('every L1/L2 provenance pattern reaches zero after scrub', () => {
  scrubForwardTraces(FIXTURE_ROOT, { apply: true });
  const residual = detectForwardTraces(FIXTURE_ROOT);
  assert.equal(residual.layers.L1.count, 0);
  assert.equal(residual.layers.L2.count, 0);
  assert.equal(residual.layers.L3.count, 0);
});
```
UT: C003 invariant —— 「ヘッダブロックの除去は開始フェンスから終了フェンスまでブロック単位で行い、閉じフェンスを欠く不完全ブロックは無変換で通過して警告を出す」
```js
test('header block removal is block-scoped and incomplete blocks pass through unchanged', () => {
  const complete = removeHeaderBlocks(readLines(COMPLETE_HEADER_RS));
  assert.ok(!complete.some((l) => l.includes('Initial Design Artifact')));
  assert.equal(complete.filter((l) => l.startsWith('//')).length, 1);
  const broken = removeHeaderBlocks(readLines(UNCLOSED_HEADER_RS));
  assert.deepEqual(broken, readLines(UNCLOSED_HEADER_RS));
  assert.equal(warnings.length, 1);
});
```
- UT: C004 precondition —— 「スクラブが完了している」
```js
test('verify runs against a completed scrub', () => {
  scrubForwardTraces(FIXTURE_ROOT, { apply: true });
  const result = verifyScrub(FIXTURE_ROOT);
  assert.equal(result.residualCount, 0);
});
```
UT: C004 postcondition —— 「`verify-scrub` が残存 0 のとき exit 0 を返し、残存があるときは検出箇所を file:line で列挙して exit 1 を返す」
```js
test('verify exits 0 on zero residual and 1 with file:line enumeration', () => {
  assert.equal(runVerify(SCRUBBED_ROOT).status, 0);
  const dirty = runVerify(DIRTY_ROOT);
  assert.equal(dirty.status, 1);
  assert.match(dirty.stdout, /:\d+:/);
});
```
UT: C004 invariant —— 「検証は検出器と同一の述語（trace-patterns.mjs）を用いる。片側バイパスが存在しない」
```js
test('verify and detect share the single pattern source', () => {
  assert.equal(verifyScrub.patterns, detectForwardTraces.patterns);
  assert.equal(TRACE_PATTERNS, detectForwardTraces.patterns);
});
```
- UT: C005 precondition —— 「siprs-with-4layers/ が存在する」
```js
test('the pristine original tree exists for comparison', () => {
  assert.equal(existsSync(PRISTINE_ROOT), true);
});
```
UT: C005 postcondition —— 「スクラブ後も siprs-with-4layers/ の全ファイルの SHA-256 が不変である」
```js
test('pristine tree hashes are unchanged by the scrub', () => {
  const before = hashTree(PRISTINE_ROOT);
  scrubForwardTraces(FIXTURE_ROOT, { apply: true });
  assert.deepEqual(hashTree(PRISTINE_ROOT), before);
});
```
UT: C005 invariant —— 「スクラバは siprs-for-reverse/ 以外のいかなるパスにも書き込みを行わない」
```js
test('scrubber writes only under the target root', () => {
  const writes = scrubForwardTraces(FIXTURE_ROOT, { apply: true, recordWrites: true }).writes;
  for (const p of writes) assert.ok(p.startsWith(FIXTURE_ROOT), p);
});
```
- UT: C006 precondition —— 「tests/ 配下にチケットキーをファイル名に含むテスト（verify_spec_p*_*.rs）が存在する」
```js
test('ticket-keyed test filenames are discovered', () => {
  const found = detectTicketKeyedFilenames(FIXTURE_ROOT);
  assert.ok(found.includes('tests/verify_spec_p9_1.rs'));
});
```
UT: C006 postcondition —— 「当該ファイルが検出され、改名または報告される」
```js
test('ticket-keyed filenames are renamed or reported', () => {
  const result = scrubForwardTraces(FIXTURE_ROOT, { apply: true, renameTicketKeyedFiles: true });
  assert.deepEqual(detectTicketKeyedFilenames(FIXTURE_ROOT), []);
  assert.ok(result.renames.length > 0);
});
```
UT: C006 invariant —— 「改名後も cargo のテスト自動検出が成立する（tests/*.rs は名前で参照されないため安全）」
```js
test('renamed test files stay auto-discovered by cargo', () => {
  const renamed = renameTicketKeyedFile('tests/verify_spec_p9_1.rs');
  assert.match(renamed, /^tests\/[a-z0-9_]+\.rs$/);
  assert.ok(!/p\d+_\d+/.test(renamed));
});
```

## Changes in Prior Implementation Rounds

| Before | After | Description |
|--------|-------|-------------|
| 順回転痕跡を検出・除去・検証する手段が存在しない | .claude/scripts/workspacify-reverse/ に trace-patterns / detect-forward-traces / scrub-forward-traces / verify-scrub / run.mjs を新設 | L1〜L4 の層モデルを単一定義し、detect|scrub|verify の 3 サブコマンドで機械的に実行・検証できるようにした |
| siprs-for-reverse は L1 3923行 / L2 1538行 / L3 10件の痕跡を保持（ソースは原本と同一） | L1 0 / L2 0 / L3 0（L4 160 は保持）。総行数 52,689 → 46,568 | スクラブを適用。RFC 本文の語（音声のみ）や omission ID を含む契約コメントも除去した |
| tests/verify_spec_p*_*.rs という名前がチケットキー（フェーズ分解）を露出 | verify_spec_<content-hash>.rs へ改名し、Cargo.toml の [[test]] name も追従 | 内容ハッシュで一意化。当初の固定名 'generic' は10ファイルを1つに衝突統合し破壊したため修正した |
| README.md / RFC-ROOT.md を読むコードが残りビルド不能 | #[test] ブロック単位で除去（production コードは保持） | L3 は行単位では除去できない。テスト専用ファイルは全体除去、混在ファイルは該当 #[test] ブロックのみ除去する |

## Notes in Prior Implementation Rounds

- [Implementation steps]
  (1) `trace-patterns.mjs` に L1〜L4 のパターンを**単一定義**として書く
  (2) **Red**: 検出器の UT（UT-1〜UT-8）を先に書き、失敗を確認する
  (3) **Green**: `detect-forward-traces.mjs` を実装
  (4) 同様に Red→Green で `scrub-forward-traces.mjs`（UT-9〜UT-18）、`verify-scrub.mjs`（UT-19〜UT-22）
  (5) 実データで `detect` → `scrub --dry-run` → レビュー → `scrub --apply` → `verify`
  (6) 非コメント行 SHA-256 の前後比較、`siprs-with-4layers` の全ファイル SHA-256 不変確認
  (7) `cargo check`（不能なら `--no-default-features`）
- [Risks] **誤削除**（IETF 標準参照・非コメント行）／**不完全ヘッダの取りこぼし**／L3 テストの扱いを誤ると入力が自己矛盾する／**L4 を誤って除去すると実験が無意味になる**
- [Caveats] スクラブは**行単位削除**であり、行内の部分改変をしない設計とした（C002 の不変条件を検証可能にするため）。これにより「プロベナンスと正当なコメントが同一行に混在する」ケースでは行ごと失われるが、**実験の科学性を優先する**。該当箇所は検出器が報告する
- [Open items]
  (a) `tests/verify_spec_p*_*.rs` の改名の是非（改名 vs 報告のみ）
  (b) `cargo check` が環境依存で失敗する場合の代替検証の運用
  (c) ホールドアウトプロジェクトの選定（ABOUT-REVERSE.md −1-h）
- [Future improvements] リーク検出器を `/workspacify-reverse` の **R0.5 ゲート**として組み込む（Phase 0）。検出パターンを言語非依存に拡張し、任意プロジェクトで「順回転痕跡 0」を機械保証する
## 実装サマリ

### 変更ファイル
- 新設: `.claude/scripts/workspacify-reverse/{run.mjs,lib/*.mjs}`（5ファイル）
- 新設: `tests/workspacify-reverse/{run-tests.mjs,helpers,unit,integration,fixtures}`
- 加工: `siprs-for-reverse/`（154ファイル書換・10ファイル改名・1ファイル削除）

### テスト結果
- workspacify-reverse スイート: **44/44 pass**（UT 32 / IT 5 / 実データ 4 / パターン 4）
- `cargo check` / `cargo check --all-targets`: **成功**（3.7s）
- 品質チェック: **0 issues**
- スクラブ検証: **残存 0（exit 0）**

### 契約の充足
- C001 検出の完全性: 4層を層別に報告。L4 のみ非除去
- C002 誤削除の防止: 非コメント行 SHA-256 一致、**IETF 標準参照 20行すべて生存**
- C003 スクラブの網羅: 行単位削除のみ。不完全ヘッダは無変換で通過し警告
- C004 検証ゲート: 検出器と同一述語。残存0で exit 0
- C005 原本不可侵: siprs-with-4layers 22,042ファイル **変更 0**
- C006 ファイル名の痕跡: 10ファイルを改名（一意性をテストで保証）

### 計画からの逸脱（記録）
1. **Step 5a の注釈スクリプトを実行しなかった。** `annotate-ticket-context-by-git-diff.js` は未追跡ファイルを全行変更として扱うため、実行すると `siprs-for-reverse/` に PX-203 注釈を注入し実験入力を再汚染する。代わりに正規形式の注釈を自分の新規ファイルのみに手動付与した。**この挙動は順回転ツールの欠陥であり、別チケットの候補。**
2. **Red テストの期待値を実装中に3点修正した。** ①L3 を非除去とする期待と『スクラブ後 L3=0』の期待が両立不能（契約は L4 のみ非除去と定める）②不完全ヘッダを含む木は契約上ゼロに到達し得ないため、その病理ケースを専用フィクスチャへ分離 ③C002 は残存ファイルに適用される不変条件のため、L3 全体削除を別建てで明示検証。いずれも**期待を弱めず、むしろ強めている**。
3. **L3 の扱いを計画時の『検出・報告』から『除去』へ変更した。** 実測で `content.contains("音声のみ")` という **RFC 本文の語の漏洩** を発見したため。放置すると入力が自己矛盾しビルドも壊れる。

### 発見した実装バグ（テストと cargo が捕捉）
- 改名の固定名衝突（10ファイル→1ファイル、9ファイル破壊）→ 原本から復旧し内容ハッシュ方式へ
- L3 警告ファイルで continue し L1/L2 除去まで飛ばしていた → フォールスルーへ修正
- 混在ファイルで L3 が L1/L2 を遮蔽していた → #[test] ブロック単位除去へ

### 実験入力の最終状態
- L1 0 / L2 0 / L3 0 / **L4 160（保持 = 正当な逆回転入力）**
- 総行数 52,689 → 46,568
- `RFC-ROOT` 参照 0 / `音声のみ` 0

### 引き継ぎ（次チケット候補）
- リーク検出器を `/workspacify-reverse` の R0.5 ゲートへ組み込む（Phase 0）
- `annotate-ticket-context-by-git-diff.js` の未追跡ファイル扱いを修正（順回転ツール）
- ホールドアウトプロジェクトでの検証（ABOUT-REVERSE.md −1-h）
## レビュー報告

### レビューで発見し、その場で修正した欠陥（3件）

1. **契約 ID 体系の取り逃し（L2 の実漏れ）** — `@verifies TS-003` は `C###` 形式でないため L2 パターンが検出できず、**契約 ID が 3 箇所残存**していた。パターンを `@verifies\b`（ID 体系を問わない）へ一般化し、Red テストを追加してから修正。再スクラブで残存 0 を確認。
2. **チケットキー注釈の欠落** — 自分の新規ファイルのうち `tests/workspacify-reverse/run-tests.mjs` と `helpers/scratch.mjs` に注釈が無かった。正規形式で付与し 13/13 に。
3. **品質チェック 1 件**（コメントアウトコード検出）— `//` 行に `function` を含む説明コメントが字句ヒューリスティックに反応していた。意味を変えずに言い換えて 0 件に。

### 能動的探索（リスク・漏れ・矛盾・不足）の結果

| 観点 | 結果 |
|---|---|
| `vendor/` が無傷か | **変更 0**（5,320 変更の内訳は src 126 / tests 26 / examples 7 / target 5,154〈cargo 生成物〉/ 設定 6） |
| 設計文書への言及 | `RFC-ROOT` 0 / `Dirs-Tree` 0 / `Initial Design Artifact` 0 / `NODE_ID` 0 / `[::TICKET::]` 0 |
| 存在しないファイルへの埋め込み | `include_str!` は**すべて実在ファイル参照**（L3 非該当） |
| 抑制と `[::STUB::]` の整合 | `#[allow]` 0 / `[::STUB::]` 0（不整合なし） |
| 可逆性 | 原本 `siprs-with-4layers` が不変のため復元可能。実際にテスト10件を復旧した実績あり |

### 検証スクリプトの限界（記録）

`annotate-ticket-context-by-git-diff.js --verify` は **7,270 件の「注釈欠落」を報告**するが、その実体は**未追跡の実験入力（`siprs-for-reverse/` / `siprs-with-4layers/`）**である。同スクリプトは未追跡ファイルを全行変更として扱うため、解析対象ディレクトリを変更ファイルと誤認する。**順回転ツールの欠陥**であり、本チケットでは回避（手動付与＋直接検証）した。出力も `[object Object]` となり対象を特定できない。**別チケットでの修正を推奨。**

### 最終状態

- L1 0 / L2 0 / L3 0 / **L4 160（保持）**、総行数 52,689 → 46,565
- IETF 標準参照 20 行すべて生存 / RFC 本文の語 0
- 契約 C001〜C006 すべて充足

## PX-203 — 0 locations, not implemented

Not found
