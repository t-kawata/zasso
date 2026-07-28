.PHONY: list-tickets list-active-tickets build test push push-branch

list-tickets:
	node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json

list-active-tickets:
	node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json | grep -v "\[x\]"

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

# [::STUB::] マーカーを含む全ファイルを検索してインデント付きで表示する
stubs:
	@node .claude/scripts/tickets/review/find-all-stubs.js "$(shell git rev-parse --show-toplevel)" | node -e "process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))"

crimes:
	@find . -name "Malfeasance.json" -not -path './.claude/*' -not -path './target/*' | sort | node -e "const fs=require('fs');let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{const d=[];i.trim().split('\n').filter(Boolean).forEach(f=>{try{const c=JSON.parse(fs.readFileSync(f,'utf8'));if(c.records)d.push(...c.records.map(r=>({_file:r._file||f,...r})))}catch(e){console.error('Warning:',f,e.message)}});console.log(JSON.stringify({success:true,count:d.length,records:d},null,2))})"
