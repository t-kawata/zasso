import { parseCliOptions } from "./cli.js";
import { runLoop } from "./runner.js";

// グローバルエラーハンドラは SDK の内部処理を阻害するため登録しない。
// EPIPE は子プロセス終了時の正常な副作用であり上位のエラー処理で対応する。

export async function main(): Promise<void> {
  const options = parseCliOptions(process.argv);

  console.log("conver.js — チケット処理を開始します");
  console.log("  model=%s", options.model);
  console.log("  ticketsPath=%s", options.ticketsPath);
  console.log("  maxCount=%d", options.maxCount);
  console.log("  resolveEvery=%d", options.resolveEvery);
  console.log("  pushEnabled=%s", options.pushEnabled);
  console.log("  timeoutMs=%d", options.timeoutMs);
  console.log("  noFind=%s", options.noFind);

  await runLoop(options);
}

// 子プロセス後片付け時の EPIPE をサイレントに抑止
process.on("uncaughtException", () => {});

// main() の実行は entry.ts が行う（esbuild バンドル用エントリポイント）
