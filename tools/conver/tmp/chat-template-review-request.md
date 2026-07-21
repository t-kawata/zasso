# 調査依頼: Prism-ML/Ternary-Bonsai-27B-mlx-2bit の chat_template.jinja 修正リスク評価

## 依頼者

Toshimi Kawata

## 依頼目的

`prism-ml/Ternary-Bonsai-27B-mlx-2bit` の `chat_template.jinja` において、system ロールのメッセージが `messages` 配列の先頭以外に現れた場合に例外を送出するガードが存在する。このガードを緩和し、system メッセージを任意の位置で正しくレンダリングするよう修正した場合のリスクを評価したい。

## 背景

### システム構成

```
Claude Code → Bifrost (Anthropic/OpenAI proxy) → vllm-mlx (OpenAI-compatible server) → model
```

### 問題

Claude Code は Anthropic API 形式でリクエストを送信する。この中で、Claude Code の SessionStart フック（context-mode プラグイン）が `{"role": "system"}` メッセージを `messages` 配列内の先頭以外の位置（position 1）に注入する。

Bifrost は Anthropic 形式を OpenAI 形式に忠実に変換する。変換後の `messages` 配列は以下の構造になる:

```
messages[0].role = "system"   (元の top-level system パラメータ由来)
messages[1].role = "user"     (元の messages[0].content[0] 由来)
messages[2].role = "user"     (元の messages[0].content[1] 由来)
messages[3].role = "system"   (元の messages[1] = SessionStart hook context 由来)
```

この `messages[3]`（先頭以外の system）が原因で、モデルの `chat_template.jinja` が例外を送出する。

### テンプレートの該当箇所

ファイル: `chat_template.jinja`（モデル HuggingFace リポジトリに同梱）

```jinja
{# lines 62-66: 先頭の system メッセージはループ前にレンダリング済み #}
{%- else %}
    {%- if messages[0].role == 'system' %}
        {%- set content = render_content(messages[0].content, false, true)|trim %}
        {{- '<|im_start|>system\n' + content + '<|im_end|>\n' }}
    {%- endif %}
{%- endif %}

{# ... tool detection logic (lines 67-80) ... #}

{# lines 81-86: メインループ - 82行目で content を抽出済み #}
{%- for message in messages %}
    {%- set content = render_content(message.content, true)|trim %}
    {%- if message.role == "system" %}
        {%- if not loop.first %}
            {{- raise_exception('System message must be at the beginning.') }}
        {%- endif %}
    {%- elif message.role == "user" %}
        ...
```

### 検討中の修正

```jinja
{# 変更前: 例外送出 #}
{%- if message.role == "system" %}
    {%- if not loop.first %}
        {{- raise_exception('System message must be at the beginning.') }}
    {%- endif %}
{# 変更後: 正しくレンダリング #}
{%- if message.role == "system" %}
    {%- if not loop.first %}
        {{- '<|im_start|>system\n' + content + '<|im_end|>\n' }}
    {%- endif %}
```

先頭の system（`loop.first`）はループ前（62-66行目）で既にレンダリング済みのため、何もしない（変更なし）。非先頭の system については、従来 `raise_exception` で中断していた部分を `<|im_start|>system\n...<|im_end|>` として正しくレンダリングするよう変更する。

## 調査事項

以下の観点から、上記修正のリスク評価をお願いします:

1. **テンプレート作者の意図**: `raise_exception('System message must be at the beginning.')` はなぜ実装されたと考えられるか。単なる safe guard か、モデルアーキテクチャ上の制約（positional encoding, attention mask 等）によるものか。

2. **モデルへの影響**: 非先頭に system トークン列が現れた場合、モデルの推論品質に既知の影響はあるか。特に:
   - アテンションの挙動に変化は生じるか
   - 指示追従性能に影響が出るか
   - 特定のタスク（code, reasoning, chat）で品質低下は起きうるか

3. **代替アプローチの評価**: 非先頭の system メッセージに対して、以下の代替手段はより安全か:
   - a) レンダリング時に先頭の system メッセージに内容をマージする
   - b) 非先頭の system を user ロールに変換してレンダリングする
   - c) 単純に無視（skip）する

4. **実験的検証方法**: 修正の安全性を確認するための最小限のテスト方法の提案。

## 参考情報

- モデル: `prism-ml/Ternary-Bonsai-27B-mlx-2bit`（Qwen 系ベースの推論）
- テンプレート形式: ChatML（`<|im_start|>`, `<|im_end|>`）
- テンプレートの実体はモデルキャッシュ内の `chat_template.jinja` ファイル
- eos_token: `<|im_end|>`
- 問題の system メッセージの実体は Claude Code の SessionStart フックが注入する `SessionStart hook additional context` のみ
- 全20リクエストの追跡で、非先頭 system の唯一の発生源がこのフックであることを確認済み

## テンプレート全体（参考）

テンプレートは 85 行。ChatML 形式で、tools レンダリング、マルチステップ tool use、thinking/reasoning content の処理を含む。必要であれば全文を提供可能。
