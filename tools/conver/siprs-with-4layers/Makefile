.PHONY: list-tickets list-active-tickets build test test-integration push push-branch

list-tickets:
	node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json

list-px-tickets:
	node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json | grep PX

list-active-tickets:
	node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json | grep -v "\[x\]"  | grep -v "\[R\d*\]"

build:
	cargo build --release

# [::TICKET::] P15-3: the test suite enables the test-util feature so the
# live-reactor integration tests (tests/*.rs) select TestBackend. The feature
# is never in default, so `cargo build` (production) still fails fast without
# pjsua-native (RFC §62.2).
test:
	cargo test --features test-util

# [::TICKET::] P16-10: real-SIP integration tests against docker Asterisk/
# coturn (§62.19 Q9b). Brings the services up, runs the pjsua-native-gated
# suite (tests/sip_integration.rs), and always tears the stack down — the
# trap guarantees `docker compose down` even when the tests fail.
test-integration:
	docker compose up -d
	@trap 'docker compose down' EXIT; \
	cargo test --features pjsua-native --test sip_integration

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

sections:
	node .claude/scripts/crystalize-readme/list-sections.js

crystalized-rate:
	A=$$(cat README.md | grep "\-RESIDUE::>" | wc -l); \
	B=$$(cat README.md | grep "^# " | wc -l); \
	awk -v a="$$A" -v b="$$B" 'BEGIN{printf "===========\n-> %.2f %%\n===========\n", ((b-1-a)/(b-1))*100}'
