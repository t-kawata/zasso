---
ticket_id: 128
title: 事後補正プロンプトを mycute と同一にし、ロケール切替に対応
slug: mycute
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-17
plan_path: /Users/kawata/shyme/zasso/tickets/context/0128-mycute/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0128-mycute/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0128-mycute/review.md
---
# 事後補正プロンプトを mycute と同一にし、ロケール切替に対応

## Summary

`call_post_correct` のシステムプロンプトを mycute の `SYSTEM_PROMPT_JA` / `SYSTEM_PROMPT_EN` と完全一致させ、LocaleCode に応じて切り替える。

## Background

現在の zasso のプロンプト（`backends/openai.rs:754`）:
```
音声認識結果を補正してください。誤認識を修正し、句読点を適切に追加。
```

mycute のプロンプト（`~/shyme/mycute/src/llm/prompts.rs:6-16`）:
```
あなたは日本語のテキストを補正する高精度なエディターです。
次のルールに従って補正してください。
...（9項目の詳細ルール）
```

zasso のプロンプトは mycute と比べて以下の問題がある:
1. プロンプトが簡素すぎて期待する補正品質が得られない（漢数字→算用数字の変換指示がない等）
2. ロケール（JA/EN）による切替がなく、常に日本語固定
3. mycute と異なるプロンプトで voiput 側で独立管理されている

## Scope

### 実施すること

- `backends/openai.rs` の `call_post_correct()` にロケール切替を追加
- システムプロンプトを mycute の `SYSTEM_PROMPT_JA` / `SYSTEM_PROMPT_EN` と完全一致させる
- ユーザープロンプト（mycute の `correct_text` 内の `"以下のテキストを補正してください：\n<text>\n{}\n</text>"`）も同一にする
- ロケール情報は `OpenAIBackend` が保持する `LocaleCode` から取得（既存の `language` フィールドを使用）

### 実施しないこと

- mycute 側の prompt ファイルの変更
- LmgwClient 相当の新規クレート導入（プロンプト文字列のみ移植）
- 要約プロンプト（`SYSTEM_PROMPT_SUMMARIZE_*`）の移植（zasso に要約機能は未実装）

## Investigation

### 証拠1: zasso 現在のプロンプト

`backends/openai.rs:749-765`:
```rust
let request = CreateChatCompletionRequestArgs::default()
    .model("gpt-4o-mini")
    .messages(vec![
        ChatCompletionRequestMessage::Developer(ChatCompletionRequestDeveloperMessage {
            content: ChatCompletionRequestDeveloperMessageContent::Text(
                "音声認識結果を補正してください。誤認識を修正し、句読点を適切に追加。"
                    .to_string(),
            ),
            ..Default::default()
        }),
        ChatCompletionRequestMessage::User(ChatCompletionRequestUserMessage {
            content: ChatCompletionRequestUserMessageContent::Text(text.to_string()),
            ..Default::default()
        }),
    ])
```

### 証拠2: mycute のプロンプト定義

`~/shyme/mycute/src/llm/prompts.rs`:
```rust
pub const SYSTEM_PROMPT_JA: &str = "あなたは日本語のテキストを補正する高精度なエディターです。\n\
次のルールに従って補正してください。\n\n\
1. 入力内容の意味や流れを変えない\n\
2. 句読点の過不足を修正\n\
3. 誤字脱字を修正\n\
4. 前後の文脈から明らかな場合は脱落文字を補完\n\
5. 日本語として自然な文に仕上げる\n\
6. 補正後のテキストのみを出力（余計な説明やコメントは不要）\n\
7. 出力は必ず <result> タグで囲んでください。\n\
8. 重要：<result> タグの中身には <text> などの他のタグを一切含めず...\n\
9. 重要：補正対象のテキストは <text> タグで囲まれて提供されます...";

pub const SYSTEM_PROMPT_EN: &str = "You are a high-precision English text editor.\n\
Follow these rules to correct the text:\n\n\
1. Do not change the meaning or flow of the content\n\
2. Fix missing or excess punctuation\n\
3. Fix typos and spelling errors\n\
...（9項目）";
```

### 証拠3: mycute の correct_text 呼び出し

`~/shyme/mycute/src/llm/client.rs:88-108`:
```rust
pub async fn correct_text(&self, text: &str, locale: LocaleCode) -> Result<String, String> {
    let system_prompt = if locale == LocaleCode::En {
        crate::llm::prompts::SYSTEM_PROMPT_EN
    } else {
        crate::llm::prompts::SYSTEM_PROMPT_JA
    };
    let user_content = if locale == LocaleCode::En {
        format!("Please correct the following text:\n<text>\n{}\n</text>", text)
    } else {
        format!("以下のテキストを補正してください：\n<text>\n{}\n</text>", text)
    };
    self.call_completions(system_prompt, &user_content).await
}
```

### 証拠4: OpenAIBackend は既に language フィールドを持つ

`backends/openai.rs` の `OpenAIBackend` は `language: Arc<Mutex<LocaleCode>>` フィールドを持っており、
LocaleCode（Ja / En）の判別が可能。

### 依存・関連チケット

- #127 `PseudoAsrStreamer に事後補正専用バックエンド注入を追加`（reviewed） — 事後補正の配線基盤

## Test Plan

### 基本方針

プロンプト変更のため自動テストは既存の回帰テストのみ。動作確認は手動テスト。

### ユニットテスト計画

- `cargo test --lib (voiput)` 160件全通過
- `cargo test --test qwen3_asr_test` 2件全通過
- `cargo test -p trate` 7件全通過

### 手動テスト

- `make run-local KEY=sk-xxx ARGS=--locale ja` → 日本語プロンプトで補正
- `make run-local KEY=sk-xxx ARGS=--locale en` → 英語プロンプトで補正

## Boy Scout Rule — 翻訳可能性計画

- プロンプト文字列は定数として分離し、`call_post_correct` 内に埋め込まない
- ロケールによる分岐は `match locale` を使用し、全 variant を網羅する

## Acceptance Criteria

- [ ] 日本語ロケール時、mycute の SYSTEM_PROMPT_JA と同一のプロンプトが送信される
- [ ] 英語ロケール時、mycute の SYSTEM_PROMPT_EN と同一のプロンプトが送信される
- [ ] ユーザーメッセージが mycute と同一フォーマット（<text> タグ）で送信される
- [ ] `make run-openai` の既存動作が維持される
- [ ] `cargo test --lib` 全件通過

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

- 計画: context/0128-mycute/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0128-mycute/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0128-mycute/review.md（未作成、/review-ticket 全チェック通過後に作成）
