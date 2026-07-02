list-tickets:
	node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json

list-active-tickets:
	node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json | grep -v "\[x\]"

build:
	cargo build --release
