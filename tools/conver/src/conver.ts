// [::STUB::] P4-2: エントリポイントの本実装は P4-2 で行う

import { parseCliOptions } from "./cli.js";
import { runLoop } from "./runner.js";

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv);

  console.log("conver.js — チケット処理を開始します");
  console.log("  モデル:       ", options.model);
  console.log("  Tickets.json:", options.ticketsPath);

  await runLoop(options);
}

main().catch((err: Error) => {
  console.error("致命的エラー:", err.message);
  process.exit(1);
});
