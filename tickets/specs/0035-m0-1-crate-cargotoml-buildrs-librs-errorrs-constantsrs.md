---
ticket_id: 35
title: M0-1: Crate 骨組み（Cargo.toml / build.rs / lib.rs / error.rs / constants.rs）
slug: m0-1-crate-cargotoml-buildrs-librs-errorrs-constantsrs
status: draft
created_at: 2026-06-11
updated_at: 2026-06-11
---
# M0-1: Crate 骨組み（Cargo.toml / build.rs / lib.rs / error.rs / constants.rs）

## Summary

<!-- このチケットで達成することの簡潔な説明 -->

## Background

<!-- なぜこのチケットが必要か -->

## Scope

<!-- 何をするか -->

## Non-scope

<!-- 何をしないか -->

## Investigation

<!--
憶測や論理的な推論だけでは不十分である。ソースコードの解析、grep、解析調査用テストコードの作成、テストの実行、ログの確認などを通じて**物理的な証拠**を見つけ出し、ここに記録すること。

記録すべき証拠の例：
- エラーメッセージ、スタックトレース、テスト失敗の再現手順
- grep や検索で見つけた関連コードの該当箇所（ファイル名・行番号）
- 実際に確認した動作や期待との乖離
- 検証済みの仮説と反証された仮説

記載された証拠は後日 /plan-ticket が正確な計画を立てるための唯一の材料となる。
-->

## Test Plan

<!--
★★★ 重要: テスト計画はユニットテストの網羅性を最優先する ★★★

**基本方針**: ユニットテストでカバーできる範囲は全てユニットテストで検証する。
ユニットテストのみで検証できない部分（外部サービス結合、ハードウェア依存等）に
限り、E2Eテストまたは手動テストを計画する。「ユニットテスト不可能な項目」として
理由を明記したものだけが例外として認められる。

### ユニットテスト計画

- どの関数／モジュールに対してテストを書くか
- 正常系・異常系・境界値の各ケース
- モック・スタブが必要な外部依存
- カバレッジ目標（目安: 80%以上、クリティカルパスは90%以上）

### ユニットテスト不可能な項目（例外）

ユニットテストでは検証不可能な項目のみを、理由とともに列挙する。
例：
- 理由1: 外部APIとの結合（モックでは再現不可能な挙動がある）
- 理由2: ハードウェア依存の処理（実機が必要）
-->

## Boy Scout Rule — 翻訳可能性計画

<!--
このチケットで触るコードに対して、以下の観点で「来たときよりも美しく（翻訳可能に）」する計画を書く:

- 関数名/変数名が散文として読めるか
- 責務が混在している関数は分割すべきか
- ハードコード値を定数化すべきか
- コメントが「なぜ」を説明しているか
-->

## Acceptance Criteria

- [ ] 実装要件を満たしている
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テストが通過している

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0035-m0-1-crate-cargotoml-buildrs-librs-errorrs-constantsrs/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0035-m0-1-crate-cargotoml-buildrs-librs-errorrs-constantsrs/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0035-m0-1-crate-cargotoml-buildrs-librs-errorrs-constantsrs/review.md（未作成、/review-ticket 全チェック通過後に作成）
