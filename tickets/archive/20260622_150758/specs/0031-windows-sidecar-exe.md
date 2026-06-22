---
ticket_id: 31
title: Windows: sidecar テストが拡張子 .exe で失敗する問題の修正
slug: windows-sidecar-exe
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
plan_path: C:\Users\kawat\shyme\zasso\tickets\context\0031-windows-sidecar-exe\plan.md
implementation_path: C:\Users\kawat\shyme\zasso\tickets\context\0031-windows-sidecar-exe\implementation.md
review_report_path: C:\Users\kawat\shyme\zasso\tickets\context\0031-windows-sidecar-exe\review.md
---
# Windows: sidecar テストが拡張子 .exe で失敗する問題の修正

## Summary

`src-tauri/src/sidecar.rs` のテスト `bifrost_def_program_path_ends_with_bifrost_http` が Windows 上で失敗する問題を修正する。テスト内の期待値が `.exe` 拡張子を考慮していないため、`binary_filename()` の戻り値と不一致を起こしている。

## Background

チケット #25（EDITION_HOME導入とbifrostバイナリの自動展開）の実装後、Windows で `cargo test --lib -- sidecar` を実行すると以下のエラーが発生する：

```
sidecar::tests::bifrost_def_program_path_ends_with_bifrost_http FAILED
  program path should end with 'bifrost/bifrost-http'
  actual: C:\Users\kawat\AppData\Local\Temp\...\bifrost\bifrost-http.exe
```

`src-tauri` の全テストを通すためにはこの修正が必須である。

## Scope

- `src-tauri/src/sidecar.rs` のテストコード修正（`expected_suffix` を `binary_filename()` を使って動的に生成する）
- 該当行のコメントの更新（必要な場合）
- `make check-be` または `cargo test --lib -- sidecar` でパスする確認

## Non-scope

- `binary_filename()` 自体のロジック変更（現行の実装は正しい）
- `sidecar_defs()` や `sidecar.rs` のプロダクションコードの変更
- Windows以外のプラットフォームへの影響（本修正は全プラットフォームで動作する）

## Investigation

### エラーの証拠

- **エラーメッセージ**: `program path should end with 'bifrost/bifrost-xxx': <actual_path>`
- **実際のパス**: `...\bifrost\bifrost-http.exe`（`.exe` が付いている）
- **期待値**: `bifrost\bifrost-http`（`.exe` がない）

### ソースコードの該当箇所

**`src-tauri/src/sidecar.rs`**:

1. **`binary_filename()`（73〜80行目）**:
```rust
fn binary_filename() -> &'static str {
    if cfg!(target_os = "windows") {
        "bifrost-http.exe"   // ← Windows では .exe 付き
    } else {
        "bifrost-http"       // ← それ以外は拡張子なし
    }
}
```

2. **`sidecar_defs()` 内のパス構築**:
`binary_filename()` の戻り値を使って `edition_home/bifrost/<binary_filename()>` というパスを生成する。その結果、Windows ではパスが `bifrost/bifrost-http.exe` となる。

3. **テストコード（110〜127行目）**:
```rust
#[test]
fn bifrost_def_program_path_ends_with_bifrost_http() {
    let home = test_home();
    let defs = sidecar_defs(&home);
    let program = &defs[0].program;

    // パスに edition_home が含まれる
    let home_str = home.to_string_lossy();
    assert!(
        program.starts_with(home_str.as_ref()),
        "program path should start with edition_home: {program}"
    );

    // 【問題の箇所】パスが bifrost/bifrost-http で終わる
    let expected_suffix = format!("bifrost{}bifrost-http", std::path::MAIN_SEPARATOR);
    //                           ↑ ".exe" なしでハードコードされている
    assert!(
        program.ends_with(&expected_suffix),
        "program path should end with 'bifrost/bifrost-http': {program}"
    );
}
```

### 原因の分析

`expected_suffix` が `"bifrost-http"`（拡張子なし）でハードコードされているため、Windows で `binary_filename()` が返す `"bifrost-http.exe"` と一致しない。テストコードが `binary_filename()` ではなくリテラル文字列に依存していることが根本原因。

### 修正方針（2案）

**案A**: `cfg!(target_os = "windows")` で分岐する：
```rust
let expected_suffix = if cfg!(target_os = "windows") {
    format!("bifrost{}bifrost-http.exe", std::path::MAIN_SEPARATOR)
} else {
    format!("bifrost{}bifrost-http", std::path::MAIN_SEPARATOR)
};
```

**案B（推奨）**: `binary_filename()` を呼び出して動的に生成する：
```rust
let expected_suffix = format!("bifrost{}{}", std::path::MAIN_SEPARATOR, binary_filename());
```

案Bの方がDRY原則に従い、将来 `binary_filename()` の戻り値が変わっても追従する。また、テスト対象と同じ関数を使うため、テストの意図（「binary_filename() で得られるファイル名で終わること」）が明確になる。

## Test Plan

### ユニットテスト計画

このチケットの修正対象は既存テストコード内の期待値のみ。新規のユニットテスト追加は不要だが、以下の検証を実施する：

| ケース | 検証内容 | 確認方法 |
|--------|----------|----------|
| Windows 正常系 | `binary_filename()` が返す名前に `.exe` が含まれ、`program.ends_with()` がパスする | `cargo test --lib -- sidecar`（Windows実機） |
| Unix 正常系 | `binary_filename()` が返す名前に拡張子がなく、`program.ends_with()` がパスする | `cargo test --lib -- sidecar`（CI/macOS/Linux） |
| リグレッション | 修正後も既存の全 sidecar テストがパスする | `cargo test --lib -- sidecar` 全ケース |

### ユニットテスト不可能な項目（例外）

- **Windows 実機でのテスト**: `cfg!(target_os = "windows")` によるコンパイル時分岐の検証には、実際の Windows 環境でのテスト実行が必要。クロスコンパイル環境ではコンパイル時のターゲットOSに依存するため、CI の Windows ランナーでの検証が必須。
- **`binary_filename()` 自体のテスト**: 本チケットでは修正対象外であるが、既存の `bifrost_def_program_path_ends_with_bifrost_http` テストが実質的にその役割を果たしている。

## Boy Scout Rule — 翻訳可能性計画

1. **ハードコード値の排除**: テスト内の `"bifrost-http"` リテラル（拡張子なしのハードコード）を `binary_filename()` 呼び出しに置き換える。これにより「期待されるファイル名」がコード上で一箇所（`binary_filename()`）に集約され、翻訳可能性（「テストは binary_filename() の結果で終わることを検証する」）が向上する。
2. **テストコメントの更新**: `// パスが bifrost/bifrost-http で終わる` というコメントを、`binary_filename()` を使用した記述に更新し、プラットフォーム依存を含む実際の動作を正確に反映する。
3. **エラーメッセージの改善**: `"program path should end with 'bifrost/bifrost-http': {program}"` のエラーメッセージにも実際の期待値（`binary_filename()` の戻り値）を動的に含める。

## Acceptance Criteria

- [ ] `src-tauri/src/sidecar.rs` の `bifrost_def_program_path_ends_with_bifrost_http` テストが Windows でパスする
- [ ] 修正後のテストが Unix（macOS/Linux）でもパスする（リグレッションなし）
- [ ] `make check-be` が通る
- [ ] `"bifrost-http"` のハードコードリテラルが除去されている（`binary_filename()` に置き換わっている）
- [ ] 該当テストのコメントとエラーメッセージが修正内容を正確に反映している

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0031-windows-sidecar-exe/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0031-windows-sidecar-exe/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0031-windows-sidecar-exe/review.md（未作成、/review-ticket 全チェック通過後に作成）
