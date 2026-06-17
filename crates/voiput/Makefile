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
#   make run-local      バイナリ実行（Local Qwen3-ASR エンジン）
#   make run-local-no-denoiser  バイナリ実行（Local + Denoiser オフ）
#
# 共通変数:
#   KEY=sk-xxx          OpenAI API キー（run で必須）
#   ARGS=--locale en    追加の CLI 引数
# ═══════════════════════════════════════════════════════════

.PHONY: check test test-v run run-os run-en run-local run-local-no-denoiser

# ── コンパイル検証 ──────────────────────────────────────

check:
	cargo check

# ── テスト ──────────────────────────────────────────────

# stderr を分離し、テスト結果のみクリーンに表示
# `| cat` は MINGW64 の終了時バッファフラッシュ問題の回避
test:
	cargo test 2>/dev/null

# ── バイナリ実行 ───────────────────────────────────────

# OS標準モードで起動
run:
	cargo run --bin test-run -- --openai-key=$(KEY) $(ARGS)

# OpenAIモードで起動
run-openai:
	cargo run --bin test-run -- --engine openai --openai-key=$(KEY) $(ARGS)

# OpenAIモードで起動（Denoiseをオフ）
run-openai-no-denoiser:
	cargo run --bin test-run -- --engine openai --no-denoiser --openai-key=$(KEY) $(ARGS)

# Local Qwen3-ASR モードで起動
run-local:
	cargo run --bin test-run -- --engine local --openai-key=$(KEY) $(ARGS)

# Local Qwen3-ASR モードで起動（Denoiseをオフ）
run-local-no-denoiser:
	cargo run --bin test-run -- --engine local --no-denoiser --openai-key=$(KEY) $(ARGS)
