# ═══════════════════════════════════════════════════════════
#  voiput crate 専用 Makefile
# ═══════════════════════════════════════════════════════════
#
# 使い方:
#   make check          cargo check（コンパイル検証）
#   make test           テスト実行（stderr を分離して表示安定）
#   make test-v         テスト実行（stderr も含めて詳細表示）
#   make run            バイナリ実行（KEY 必須: make run KEY=sk-xxx）
#   make run-os         バイナリ実行（OS エンジン + 日本語）
#   make run-en         バイナリ実行（OS エンジン + 英語）
#
# 共通変数:
#   KEY=sk-xxx          OpenAI API キー（run で必須）
#   ARGS=--locale en    追加の CLI 引数
# ═══════════════════════════════════════════════════════════

.PHONY: check test test-v run run-os run-en

# ── コンパイル検証 ──────────────────────────────────────

check:
	cargo check

# ── テスト ──────────────────────────────────────────────

# stderr を分離し、テスト結果のみクリーンに表示
# `| cat` は MINGW64 の終了時バッファフラッシュ問題の回避
test:
	cargo test 2>/dev/null

# ── バイナリ実行 ───────────────────────────────────────

# OpenAI エンジン（KEY 必須）
run:
	cargo run --bin test-run -- --openai-key=$(KEY) $(ARGS)
