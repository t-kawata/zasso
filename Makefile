# ═══════════════════════════════════════════════
#  設定
# ═══════════════════════════════════════════════

# デフォルトエディション（上書き可能: make build EDITION=mycute）
EDITION ?= zasso

# 実行OS を自動検出
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
    OS_TYPE := macos
    BUNDLE := dmg
else ifeq ($(UNAME_S),Linux)
    OS_TYPE := linux
    BUNDLE := appimage
else
    # Windows (MINGW* / MSYS* / CYGWIN*)
    OS_TYPE := windows
    BUNDLE := nsis
endif

# sed -i の OS 別定義（commit で使用）
ifeq ($(UNAME_S),Darwin)
    SED_I := sed -i ''
else
    SED_I := sed -i
endif

.PHONY: run build check test write-settings generate-icons
.PHONY: run-zasso run-mycute run-neco-asovi
.PHONY: build-zasso build-mycute build-neco-asovi
.PHONY: commit push pull master branch commit-branch push-branch
.PHONY: check-be check-fe check-all
.PHONY: next-version gen-migration gen-entities migrate-up migrate-refresh
.PHONY: install-context-mode update-context-mode

# ═══════════════════════════════════════════════
#  内部ターゲット（直接呼び出し想定しない）
# ═══════════════════════════════════════════════

# 設定ファイル同期 — run / build の前に必ず実行される
# settings.rs を唯一の情報源として、全設定ファイルのバージョンを統一する
write-settings:
	EDITION_SLUG=$(EDITION) OS_TYPE=$(OS_TYPE) node scripts/sync-version.mjs

# ═══════════════════════════════════════════════
#  アイコン生成 — run / build の前に自動実行
# ═══════════════════════════════════════════════
generate-icons:
# editions.json からカレントエディションの icon_path を読み取り、
# Quasar（フロントエンド）用と Tauri（ネイティブ）用の両方を生成する。
	@echo "Generating icons for edition: $(EDITION)..."
	@ICON_PATH=$$(node -e "const j=JSON.parse(require('fs').readFileSync('editions.json','utf8'));console.log(j['$(EDITION)']?j['$(EDITION)'].icon_path:'');"); \
	if [ -z "$$ICON_PATH" ]; then \
		echo "\033[1;31mError: icon_path not found for edition '$(EDITION)' in editions.json\033[0m"; \
		exit 1; \
	fi; \
	if [ ! -f "$$ICON_PATH" ]; then \
		echo "\033[1;31mError: Source icon not found at $$ICON_PATH\033[0m"; \
		exit 1; \
	fi; \
	echo "  Source: $$ICON_PATH"; \
	echo "  Generating Quasar favicons..."; \
	EDITION_SLUG=$(EDITION) node scripts/generate-favicons.mjs || \
		{ echo "\033[1;31mFavicon generation failed\033[0m"; exit 1; }; \
	echo "  Generating Tauri icons..."; \
	(cargo tauri icon "$$ICON_PATH") || \
		{ echo "\033[1;31mTauri icon generation failed\033[0m"; exit 1; }; \
	echo "\033[1;32mIcon generation complete for edition: $(EDITION)\033[0m"

# ═══════════════════════════════════════════════
#  cargo のラップ
# ═══════════════════════════════════════════════
check:
	EDITION_SLUG=$(EDITION) cargo check --manifest-path src-tauri/Cargo.toml

test:
	EDITION_SLUG=$(EDITION) cargo test --manifest-path src-tauri/Cargo.toml $(TEST_ARGS)

# ═══════════════════════════════════════════════
#  check-*（CLAUDE.md との整合性）
# ═══════════════════════════════════════════════
check-be:
	EDITION_SLUG=$(EDITION) cargo check --manifest-path src-tauri/Cargo.toml

# vue-tsc 導入時は pnpm tsc を pnpm vue-tsc --noEmit に置き換えると
# .vue テンプレート式の型チェックも可能
check-fe:
	@echo "Checking frontend with tsc..."
	cd fe && pnpm tsc --noEmit

check-all: check-be check-fe
	@echo "All checks passed."

# ═══════════════════════════════════════════════
#  バージョン
# ═══════════════════════════════════════════════

# 次のバージョン番号を表示（v0.24.289 → v0.24.290）
# リリースノート生成など、push 前に次のバージョンを知りたい場合に使用する。
next-version:
	@OLD_VERSION=$$(grep 'APP_VERSION' src-tauri/src/consts/settings.rs | grep -oE '[0-9]+\.[0-9]+\.[0-9]+'); \
	V1=$$(echo $$OLD_VERSION | cut -d. -f1); \
	V2=$$(echo $$OLD_VERSION | cut -d. -f2); \
	V3=$$(echo $$OLD_VERSION | cut -d. -f3); \
	V3=$$((V3 + 1)); \
	if [ $$V3 -gt 999 ]; then V3=0; V2=$$((V2 + 1)); fi; \
	if [ $$V2 -gt 999 ]; then V2=0; V1=$$((V1 + 1)); fi; \
	echo "v$$V1.$$V2.$$V3"

# ═══════════════════════════════════════════════
#  SeaORM（RT 移植準備）
# ═══════════════════════════════════════════════

# マイグレーションファイル生成（make gen-migration NAME=create_users_table）
gen-migration:
	@if [ -z "$(NAME)" ]; then echo "\033[1;31mError: NAME is required (e.g. make gen-migration NAME=create_users_table)\033[0m"; exit 1; fi
	sea-orm-cli migrate generate $(NAME)

# エンティティ自動生成（make gen-entities DRIVER=sqlite）
gen-entities:
	sea-orm-cli generate entity --with-serde both -o ./src-tauri/src/entities

# マイグレーション実行（make migrate-up DRIVER=sqlite）
# DRIVER で sqlite / mysql / postgres を選択（デフォルト: sqlite）
migrate-up:
	EDITION_SLUG=$(EDITION) cargo run --manifest-path src-tauri/Cargo.toml -- am

# マイグレーションリフレッシュ（全テーブル再作成）
migrate-refresh:
	EDITION_SLUG=$(EDITION) cargo run --manifest-path src-tauri/Cargo.toml -- am --refresh

# ═══════════════════════════════════════════════
#  開発
# ═══════════════════════════════════════════════

# 開発サーバー起動
run: write-settings generate-icons
	EDITION_SLUG=$(EDITION) cargo tauri dev

# ═══════════════════════════════════════════════
#  ビルド
# ═══════════════════════════════════════════════

# 現在のOS用にビルドし、インストーラーを dist/ に配置する（make build EDITION=mycute でエディション指定）
build: write-settings generate-icons
	EDITION_SLUG=$(EDITION) cargo tauri build --bundles $(BUNDLE)
	@EDITION_SLUG=$(EDITION) node scripts/deploy-installer.mjs

# ═══════════════════════════════════════════════
#  エディション別ショートカット ── run ──
# ═══════════════════════════════════════════════
run-zasso:
	$(MAKE) run EDITION=zasso

run-mycute:
	$(MAKE) run EDITION=mycute

run-neco-asovi:
	$(MAKE) run EDITION=neco-asovi

# ═══════════════════════════════════════════════
#  エディション別ショートカット ── build ──
# ═══════════════════════════════════════════════
build-zasso:
	$(MAKE) build EDITION=zasso

build-mycute:
	$(MAKE) build EDITION=mycute

build-neco-asovi:
	$(MAKE) build EDITION=neco-asovi

# ═══════════════════════════════════════════════
#  commit / push / pull
# ═══════════════════════════════════════════════

commit:
	@echo "=== commit: Checking remote status ==="
	@BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$BRANCH" != "master" ]; then \
		echo ""; \
		echo "============================================================"; \
		echo "[ABORT] Current branch is '$$BRANCH', not 'master'."; \
		echo "Run 'git checkout master' first, then try 'make commit' again."; \
		echo "============================================================"; \
		exit 1; \
	fi
	git fetch origin master
	@if git log HEAD..origin/master --oneline | grep -q .; then \
		echo ""; \
		echo "============================================================"; \
		echo "[ABORT] Remote has new changes that are not merged yet."; \
		echo "Run 'make pull' first, then try 'make commit' again."; \
		echo "============================================================"; \
		exit 1; \
	fi
	@# バージョン情報を src-tauri/src/consts/settings.rs から読み取り、パッチバージョンをインクリメントする。
	@# 書き戻した後、make write-settings で全設定ファイルに反映する。
	@OLD_VERSION=$$(grep 'APP_VERSION' src-tauri/src/consts/settings.rs | grep -oE '[0-9]+\.[0-9]+\.[0-9]+'); \
	V1=$$(echo $$OLD_VERSION | cut -d. -f1); \
	V2=$$(echo $$OLD_VERSION | cut -d. -f2); \
	V3=$$(echo $$OLD_VERSION | cut -d. -f3); \
	V3=$$((V3 + 1)); \
	if [ $$V3 -gt 999 ]; then V3=0; V2=$$((V2 + 1)); fi; \
	if [ $$V2 -gt 999 ]; then V2=0; V1=$$((V1 + 1)); fi; \
	NEW_VERSION="$$V1.$$V2.$$V3"; \
	echo "Updating version: $$OLD_VERSION -> $$NEW_VERSION"; \
	$(SED_I) 's/\(APP_VERSION: \&str = "\)\([^0-9]*\)[^"]*"/\1\2'$$NEW_VERSION'"/' src-tauri/src/consts/settings.rs; \
	$(MAKE) write-settings; \
	git add .; \
	if [ -n "$$PUSH_MSG" ]; then \
		echo "$$PUSH_MSG" | git commit -F -; \
	elif [ -n "$(msg)" ]; then \
		git commit -m "$(msg)"; \
	else \
		git commit -m "v$$NEW_VERSION"; \
	fi

push: commit
	git push origin master

pull:
	@echo "=== pull: Force-sync to remote master (local changes discarded) ==="
	@# 自己修復: rebase 中断 / detached HEAD から master に復帰
	@git rebase --abort 2>/dev/null; true
	git checkout master 2>/dev/null || git checkout --force master
	git fetch origin master
	git reset --hard origin/master

# ═══════════════════════════════════════════════
#  branch operations（master 以外での作業用）
# ═══════════════════════════════════════════════

master:
	@echo "=== master: Switching to master branch ==="
	git checkout master

branch:
	@if [ -z "$(name)" ]; then \
		echo ""; \
		echo "============================================================"; \
		echo "[ABORT] 'name' is required. Usage: make branch name=\"<branch-name>\""; \
		echo "============================================================"; \
		exit 1; \
	fi
	git checkout -b "$(name)"

commit-branch:
	@BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$BRANCH" = "master" ]; then \
		echo ""; \
		echo "============================================================"; \
		echo "[ABORT] Current branch is 'master'. Use 'make commit' for master."; \
		echo "============================================================"; \
		exit 1; \
	fi; \
	VERSION=$$(grep 'APP_VERSION' src-tauri/src/consts/settings.rs | grep -oE '[0-9]+\.[0-9]+\.[0-9]+'); \
	PREFIX="Branch $$BRANCH commit on v$$VERSION"; \
	git add .; \
	if [ -n "$$PUSH_MSG" ]; then \
		{ echo "$$PREFIX"; echo ""; echo "$$PUSH_MSG"; } | git commit -F -; \
	elif [ -n "$(msg)" ]; then \
		git commit -m "$$PREFIX" -m "$(msg)"; \
	else \
		git commit -m "$$PREFIX"; \
	fi

push-branch: commit-branch
	@BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$BRANCH" = "master" ]; then \
		echo ""; \
		echo "============================================================"; \
		echo "[ABORT] Current branch is 'master'. Use 'make push' for master."; \
		echo "============================================================"; \
		exit 1; \
	fi; \
	echo "=== push-branch: Pushing $$BRANCH to origin ==="; \
	git push origin "$$BRANCH"

# ═══════════════════════════════════════════════
#  Claude Code プラグイン管理
# ═══════════════════════════════════════════════

install-context-mode:
ifeq ($(OS),Windows_NT)
		npx @anthropic-ai/claude-code plugin marketplace list 2>&1 | findstr "context-mode" >nul || \
			npx @anthropic-ai/claude-code plugin marketplace add mksglu/context-mode
		npx @anthropic-ai/claude-code plugin install context-mode@context-mode
else
		@if ! claude plugin marketplace list 2>&1 | grep -q "context-mode"; then \
			echo "Adding context-mode marketplace..."; \
			claude plugin marketplace add mksglu/context-mode; \
		fi
		claude plugin install context-mode@context-mode
		@# .claude/settings.json に context-mode が有効として登録されていることを確認
		@node scripts/ensure-plugin-config.mjs context-mode@context-mode context-mode mksglu/context-mode
endif

update-context-mode:
ifeq ($(OS),Windows_NT)
		npx @anthropic-ai/claude-code plugin marketplace update context-mode
else
		claude plugin marketplace update context-mode
endif
