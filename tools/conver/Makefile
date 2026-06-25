list-tickets:
		node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json

build-conver:
		cd tools/conver && npm run build

run-conver:
		cd tools/conver && node dist/conver.js $(ARGS)

test-conver:
		npm run build && node --test dist/error.test.js
