list-tickets:
		node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json

build-conver:
		npm run build

run-conver:
		node dist/conver.js $(ARGS)

test-conver:
		npm run build && node --experimental-test-module-mocks --test dist/error.test.js dist/cli.test.js dist/tickets.test.js dist/notifier.test.js dist/session.test.js dist/runner.test.js dist/conver.test.js
