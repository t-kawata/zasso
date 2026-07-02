.PHONY: build check test fmt clippy lint ci doc check-agent-sync release release-push release-publish validate-protocol

build:
	cargo build

check:
	cargo check --all-features

test:
	cargo nextest run --all-features

fmt:
	cargo +nightly fmt

clippy:
	cargo clippy -- -D warnings -W clippy::pedantic

lint: fmt clippy

ci: fmt clippy test

doc:
	cargo doc --open

check-agent-sync:
	@cmp -s CLAUDE.md AGENTS.md || { \
		echo "AGENTS.md must stay in sync with CLAUDE.md"; \
		echo "Update both files with the same shared project instructions."; \
		exit 1; \
	}

release: release-push ## Usage: make release VERSION=patch|minor|major (step 1: push + tag)
	@echo ""
	@echo "==> Step 1 完成: 代码已推送并创建 tag"
	@echo "==> 请等待 GitHub Actions CI 通过"
	@echo "==> 查看 CI 状态: gh run list --limit 1"
	@echo "==> CI 通过后执行: make release-publish"

release-push: ## Step 1: 更新版本、提交、生成 CHANGELOG、创建 tag、推送
ifndef VERSION
	$(error Usage: make release-push VERSION=patch|minor|major)
endif
	@cargo release version $(VERSION) --execute --workspace --no-confirm
	@cargo release commit --execute --no-confirm
	@git cliff -o CHANGELOG.md
	@git commit -a -n -m "Update CHANGELOG.md" || true
	@cargo release tag --execute --workspace --no-confirm
	@git push origin master --tags

release-publish: ## Step 2: 发布到 crates.io（CI 通过后执行）
	@cargo release publish --execute -p llm-bridge-core --no-confirm

.PHONY: validate-protocol

validate-protocol:
	@echo "==> 编译 Rust core (release mode)..."
	@cargo build --release --example validate-cli
	@echo "==> 运行协议转换验证..."
	@cd scripts/validate-protocol && python -m validate_protocol
