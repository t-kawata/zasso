# list-tickets: チケット一覧を表示する（私用ヘルパー）
list-tickets:
		node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json

# build-conver: TypeScript ソースを dist/ にコンパイルする
build-conver:
		npm run build

# run-conver: conver.js を実行する。ARGS で引数を渡す
run-conver:
		node dist/conver.js $(ARGS)

# test-conver: 全ユニットテストを実行する
test-conver:
		npm run build && node --experimental-test-module-mocks --test dist/error.test.js dist/cli.test.js dist/tickets.test.js dist/notifier.test.js dist/session.test.js dist/runner.test.js dist/conver.test.js
