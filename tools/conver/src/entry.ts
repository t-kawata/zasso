// [::TICKET::] PX-149 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-149 --for-spec --no-implementation-order`.
// entry.ts — conver.js のエントリポイント
//
// conver.ts の main() をモジュール評価後に呼び出すための分離エントリ。
// main() をモジュールトップレベルで即時実行すると、SDK の内部 Promise
// 連鎖が阻害される問題を回避する。
import { main, installCrashHandlers } from "./conver.js";

// Process-level crash guards must be installed before main() starts so any
// unhandled error is reported cleanly instead of dying with a raw trace.
installCrashHandlers();

main().catch((err: Error) => {
  console.error("致命的エラー:", err.message);
  process.exit(1);
});
