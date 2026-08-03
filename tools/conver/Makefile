# list-tickets: チケット一覧を表示する（私用ヘルパー）
list-tickets:
		node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json

list-active-tickets:
		node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json | grep -v "\[x\]"

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

# deploy: esbuild バンドルをビルドし、ターゲットディレクトリに配置する
#   使い方: make deploy TARGET=~/shyme/star/
deploy:
		npm run build && cp dist/conver.js $(TARGET)

# [::STUB::] マーカーを含む全ファイルを検索してインデント付きで表示する
stubs:
	@node .claude/scripts/tickets/review/find-all-stubs.js "." | node -e "process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))"

crimes:
	@find . -name "Malfeasance.json" -not -path './.claude/*' -not -path './target/*' | sort | node -e "const fs=require('fs');let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{const d=[];i.trim().split('\n').filter(Boolean).forEach(f=>{try{const c=JSON.parse(fs.readFileSync(f,'utf8'));if(c.records)d.push(...c.records.map(r=>({_file:r._file||f,...r})))}catch(e){console.error('Warning:',f,e.message)}});console.log(JSON.stringify({success:true,count:d.length,records:d},null,2))})"
