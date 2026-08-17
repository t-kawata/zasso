# list-tickets: チケット一覧を表示する（私用ヘルパー）
list-tickets:
	node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json

list-px-tickets:
	node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json | grep PX

list-active-tickets:
	node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json | grep -v "\[x\]"  | grep -v "\[R\d*\]"

# build-conver: TypeScript ソースを esbuild で単一ファイルにバンドルする
build-conver:
		npm run build && mkdir -p .claude/scripts/conver && cp dist/conver.js .claude/scripts/conver/conver.js

# typecheck: TypeScript の型チェックのみ
typecheck:
		npm run typecheck

# run-conver: conver.js を実行する。ARGS で引数を渡す
run-conver:
		node dist/conver.js $(ARGS)

# test-conver: 全ユニットテストを実行する（テストファイルは tsc でコンパイル）
test-conver:
		npx tsc && node --experimental-test-module-mocks --test dist/error.test.js dist/cli.test.js dist/tickets.test.js dist/notifier.test.js dist/session.test.js dist/runner.test.js dist/conver.test.js dist/watcher.test.js dist/time-window.test.js dist/cron-scheduler.test.js dist/check-and-start-loop.test.js dist/step-timer.test.js

# test-rfc-graph: rfc-graph 全スクリプトのテスト（CommonJS、tsc 不要）
test-rfc-graph:
		node --test "tests/rfc-graph/*.test.cjs" "tests/rfc-graph/schema/*.test.cjs"

# test-crystalize-readme: crystalize-readme 全スクリプトのテスト（CommonJS、tsc 不要）
test-crystalize-readme:
		node --test "tests/crystalize-readme/*.test.cjs"

# test-stub-resolution: batch-create-resolving-tickets の動作保証テスト（PX-1）
test-stub-resolution:
		node --test tests/batch-create-resolving-tickets.test.cjs

# deploy: esbuild バンドルをビルドし、ターゲットディレクトリに配置する
#   使い方: make deploy TARGET=~/shyme/star/
deploy:
		npm run build && cp dist/conver.js $(TARGET)

stubs:
	node .claude/scripts/tickets/review/find-all-stubs.js "."

crimes:
	.claude/scripts/tickets/scan-crimes.sh
