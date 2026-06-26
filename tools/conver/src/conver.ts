import { parseCliOptions } from "./cli.js";
import { runLoop } from "./runner.js";

export async function main(): Promise<void> {
  const options = parseCliOptions(process.argv);

  console.log("conver.js — チケット処理を開始します");
  console.log("  model=%s", options.model);
  console.log("  ticketsPath=%s", options.ticketsPath);
  console.log("  maxCount=%d", options.maxCount);
  console.log("  resolveEvery=%d", options.resolveEvery);
  console.log("  pushEnabled=%s", options.pushEnabled);
  console.log("  timeoutMs=%d", options.timeoutMs);

  await runLoop(options);
}

main().catch((err: Error) => {
  console.error("致命的エラー:", err.message);
  process.exit(1);
});
