---
name: hook-r-path-resolution
description: チケットスクリプトの _R 変数は絶対パス解決のため git rev-parse を使用する
metadata:
  type: reference
---

# _R 変数のパス解決

`_R` 変数（`.claude/scripts/tickets/` への参照）は、相対パス `_R=".claude"` ではなく、絶対パスで解決すること：

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
```

**理由**: Bash の `cd` がセッション間で永続化されるため、`cd src-tauri` の後に `_R=".claude"` を使うと `src-tauri/.claude/` を参照してしまい、エラーになる。

**適用ファイル**: `.claude/commands/make-ticket.md`, `plan-ticket.md`, `start-ticket.md`, `review-ticket.md`, `test-ticket-scripts.md` の全 `_R` 定義。`.claude/scripts/tickets/README.md` の全サンプルコード。

**Why:** Bash のワーキングディレクトリはハーネス内で永続化されるため、`cd src-tauri` などの後続コマンドで相対パスがズレる。プロジェクトルートを基点とした絶対パスで解決することで、どのディレクトリにいても常に正しい `.claude/` を参照できる。

**How to apply:**
- 新しいコマンドファイルを作成する際は `_R=".claude"` ではなく `_R="$(git rev-parse --show-toplevel)/.claude"` を使用する。
- Makefile では `cd dir && cmd` ではなく `cmd --manifest-path dir/...` を使用し、cwd を変えない。
- Bash から直接 `cd` する場合はサブシェル `(cd dir && cmd)` で囲むか、絶対パスで戻す。
