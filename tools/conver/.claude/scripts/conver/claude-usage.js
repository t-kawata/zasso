#!/usr/bin/env node
"use strict";

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateUsage, summarize, DEFAULT_PRICES } from "./progress-gif/usage.js";

const HELP = `Usage: node claude-usage.js -d <project-directory> [options]

必須:
  -d, --directory <path>   集計対象 (そのディレクトリ以下すべてを集計)

期間 (JST日付, 両端を含む):
  -f, --from <YYYY-MM-DD>  開始日
  -t, --to   <YYYY-MM-DD>  終了日

料金 (USD / 100万トークン):
                           オフピーク     ピーク
  キャッシュミス入力       -i  (0.15)     --pi (0.3)
  キャッシュヒット入力     -c  (0.003)    --pc (0.006)
  出力                     -o  (0.6)      --po (1.2)

その他:
  --holidays <list>        中国の祝日 (YYYY-MM-DD をカンマ区切り)。終日オフピーク扱い
  -h, --help               このヘルプ

ピーク判定: UTC 月〜金の 01:00-04:00 / 06:00-10:00
           (JST 10:00-13:00 / 15:00-19:00)。それ以外はオフピーク。
キャッシュミス入力 = input_tokens + cache_creation_input_tokens
対象: -d 配下で記録された全プロジェクトのログ (JSONL内の cwd で検証)。
料金は出力に含まれる全モデルへ同一単価で適用されます。
`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
function validDate(value, name) {
  if (!DATE_RE.test(value)) {
    throw new Error(`${name} は YYYY-MM-DD 形式で指定してください: ${value}`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} が不正な日付です: ${value}`);
  }
  return value;
}

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
function parsePrice(value, name) {
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} に料金を指定してください`);
  }
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`${name} は0以上の数値で指定してください: ${value}`);
  }
  return price;
}

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    directory: undefined,
    from: undefined,
    to: undefined,
    holidays: new Set(),
    prices: {
      offpeak: { ...DEFAULT_PRICES.offpeak },
      peak: { ...DEFAULT_PRICES.peak },
    },
  };

  const next = (index, argument) => {
    const value = args[index + 1];
    if (value === undefined) throw new Error(`${argument} に値を指定してください`);
    return value;
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case "-h":
      case "--help":
        process.stdout.write(HELP);
        process.exit(0);
        break;
      case "-d":
      case "--directory":
        options.directory = next(index++, argument);
        break;
      case "-f":
      case "--from":
        options.from = validDate(next(index++, argument), argument);
        break;
      case "-t":
      case "--to":
        options.to = validDate(next(index++, argument), argument);
        break;
      case "--holidays":
        for (const day of next(index++, argument).split(",").map((value) => value.trim())) {
          if (day) options.holidays.add(validDate(day, "--holidays"));
        }
        break;
      case "-i":
        options.prices.offpeak.cache_miss_input = parsePrice(next(index++, argument), argument);
        break;
      case "-c":
        options.prices.offpeak.cache_hit_input = parsePrice(next(index++, argument), argument);
        break;
      case "-o":
        options.prices.offpeak.output = parsePrice(next(index++, argument), argument);
        break;
      case "--pi":
        options.prices.peak.cache_miss_input = parsePrice(next(index++, argument), argument);
        break;
      case "--pc":
        options.prices.peak.cache_hit_input = parsePrice(next(index++, argument), argument);
        break;
      case "--po":
        options.prices.peak.output = parsePrice(next(index++, argument), argument);
        break;
      default:
        throw new Error(`不明な引数: ${argument}`);
    }
  }

  if (!options.directory) {
    throw new Error("-d <project-directory> は必須です (-h でヘルプ)");
  }
  if (options.from && options.to && options.from > options.to) {
    throw new Error(`期間が不正です: --from ${options.from} > --to ${options.to}`);
  }

  options.directory = path.resolve(expandHome(options.directory));
  return options;
}

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
async function main() {
  const options = parseArgs();
  const result = await aggregateUsage({
    directory: options.directory,
    from: options.from,
    to: options.to,
    holidays: options.holidays,
  });
  if (result.projectsDirMissing) {
    throw new Error(`ディレクトリが見つかりません: ${result.projectsDir}`);
  }
  if (result.projects.length === 0) {
    throw new Error(`該当するログがありません: ${options.directory} 以下`);
  }
  if (result.invalidJson || result.invalidTimestamp) {
    console.error(`スキップ: 不正JSON=${result.invalidJson}, 不正日時=${result.invalidTimestamp}`);
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        period: { from: options.from ?? null, to: options.to ?? null, tz: "JST" },
        prices_usd_per_1m: options.prices,
        projects: result.projects,
        holidays: [...options.holidays].sort(),
        rows: result.groups.map((group) => summarize(group, options.prices)),
        total: summarize(result.total, options.prices),
      },
      null,
      2
    )}\n`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
