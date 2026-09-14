# 全ターゲットはファイルを生成しない。`test` は特に重要で、このリポジトリには
# 同名の実行ファイル ./test が存在するため、宣言が無いと make はターゲットを
# 「最新」と判断して何も実行しない（実際に無言で何もしなかった）。
.PHONY: list-tickets list-px-tickets list-active-tickets \
        build-conver typecheck run-conver \
        test-conver test test-rfc-graph test-tickets-reverse test-grill-reverse \
        test-workspacify-reverse test-workspacify test-crystalize-readme \
        test-drill-rfc-down test-stub-resolution \
        check-conventions check-bundle-fresh \
        deploy stubs crimes

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

# test: リポジトリの全テストを1コマンドで実行する（3面の合併）
#   PX-204: 集約器が discovery を行い、面ごとに実行して欠落を照合する。
#   既知の .claude/tests の14失敗はベースラインとして報告され、失敗にはしない。
test:
		node tests/run-all-surfaces.mjs

# check-conventions: 各スクリプトディレクトリが宣言どおりのモジュール方式を使っているか、
#   および .claude/rules/node.md の表がファイルシステムと一致しているかを検査する。
#   権威はファイルシステム側であり、不一致は文書の欠陥として報告される。
check-conventions:
		node tests/check-conventions.mjs

# check-bundle-fresh: コミット済み .claude/scripts/conver/conver.js が src/ からの
#   再ビルドとバイト一致するかを検査する。esbuild が解決できない場合は
#   「古い」ではなく「利用不可」として報告するため、規約検査とは分けてある。
check-bundle-fresh:
		node tests/check-bundle-fresh.mjs

# test-rfc-graph: rfc-graph 全スクリプトのテスト（CommonJS、tsc 不要）
#   注意: グロブは shell の * が / を跨がないため、reverse/ は明示的に列挙する。
test-rfc-graph:
		node --test "tests/rfc-graph/*.test.cjs" "tests/rfc-graph/schema/*.test.cjs" "tests/rfc-graph/reverse/*.test.cjs"

# test-tickets-reverse: /split-to-tickets 逆対応（S1-S6）のテスト
test-tickets-reverse:
		node --test "tests/tickets/reverse/*.test.cjs"

# test-grill-reverse: /grill-me-for-rfc 逆対応（G1-G5）のテスト
test-grill-reverse:
		node --test "tests/grill-me-for-rfc/reverse/*.test.cjs"

# test-workspacify-reverse: 逆回転の解析パイプライン本体
test-workspacify-reverse:
		node tests/workspacify-reverse/run-tests.mjs

# test-workspacify: 順回転の2ステージ（回帰ゲートの対象）
test-workspacify:
		node tests/workspacify-tree/run-tests.mjs
		node tests/workspacify-allocate/run-tests.mjs

# test-crystalize-readme: crystalize-readme 全スクリプトのテスト（CommonJS、tsc 不要）
test-crystalize-readme:
		node --test "tests/crystalize-readme/*.test.cjs"

# test-drill-rfc-down: drill-rfc-down 全スクリプトのテスト（CommonJS、tsc 不要）
test-drill-rfc-down:
		node --test "tests/drill-rfc-down/*.test.cjs"

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
