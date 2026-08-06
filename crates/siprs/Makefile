.PHONY: list-tickets list-active-tickets build test push push-branch

list-tickets:
	node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json

list-active-tickets:
	node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json | grep -v "\[x\]"  | grep -v "\[R\d*\]"

build:
	cargo build --release

test:
	cargo test

# ═══════════════════════════════════════════════
#  commit / push（親 Makefile へ透過委譲）
# ═══════════════════════════════════════════════

# プロジェクトルート（zasso/Makefile）への相対パス
ROOT_DIR := $(shell git rev-parse --show-toplevel)

# 親 zasso/Makefile の push に委譲する。コミットメッセージは
# make push msg="..." または環境変数 PUSH_MSG="..." で渡す。
# 自動バージョンインクリメント・git add 等は親 Makefile が行う。
push:
	$(MAKE) -C $(ROOT_DIR) push msg="$(msg)"

# 親 zasso/Makefile の push-branch に委譲する（master 以外のブランチ用）。
# コミットメッセージの指定方法は push と同じ。
push-branch:
	$(MAKE) -C $(ROOT_DIR) push-branch msg="$(msg)"

stubs:
	node .claude/scripts/tickets/review/find-all-stubs.js "."

crimes:
	.claude/scripts/tickets/scan-crimes.sh
