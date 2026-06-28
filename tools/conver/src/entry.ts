// entry.ts — conver.js のエントリポイント
//
// conver.ts の main() をモジュール評価後に呼び出すための分離エントリ。
// main() をモジュールトップレベルで即時実行すると、SDK の内部 Promise
// 連鎖が阻害される問題を回避する。
import { main } from "./conver.js";

main().catch((err: Error) => {
  console.error("致命的エラー:", err.message);
  process.exit(1);
});
