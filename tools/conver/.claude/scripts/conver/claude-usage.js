#!/usr/bin/env node
"use strict";

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

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

async function* walkJsonl(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkJsonl(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      yield fullPath;
    }
  }
}

async function* walkAll(dirs) {
  for (const dir of dirs) yield* walkJsonl(dir);
}

async function findCwd(dir) {
  for await (const file of walkJsonl(dir)) {
    const input = fs.createReadStream(file, { encoding: "utf8" });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    input.on("error", (error) => lines.destroy(error));
    try {
      for await (const line of lines) {
        if (!line.trim()) continue;
        try {
          const cwd = JSON.parse(line)?.cwd;
          if (typeof cwd === "string") return cwd;
        } catch {}
      }
    } finally {
      lines.close();
      input.destroy();
    }
  }
  return null;
}

function isInside(child, parent) {
  const rel = path.relative(parent, path.resolve(child));
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel))
  );
}

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function validDate(value, name) {
  if (!DATE_RE.test(value)) {
    throw new Error(`${name} は YYYY-MM-DD 形式で指定してください: ${value}`);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} が不正な日付です: ${value}`);
  }
  return value;
}

function parsePrice(value, name) {
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} に料金を指定してください`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${name} は0以上の数値で指定してください: ${value}`);
  }
  return n;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    directory: undefined,
    from: undefined,
    to: undefined,
    holidays: new Set(),
    prices: {
      offpeak: { cache_miss_input: 0.15, cache_hit_input: 0.003, output: 0.6 },
      peak: { cache_miss_input: 0.3, cache_hit_input: 0.006, output: 1.2 },
    },
  };

  const next = (i, arg) => {
    const v = args[i + 1];
    if (v === undefined) throw new Error(`${arg} に値を指定してください`);
    return v;
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "-h":
      case "--help":
        console.log(HELP);
        process.exit(0);
        break;
      case "-d":
      case "--directory":
        opts.directory = next(i++, arg);
        break;
      case "-f":
      case "--from":
        opts.from = validDate(next(i++, arg), arg);
        break;
      case "-t":
      case "--to":
        opts.to = validDate(next(i++, arg), arg);
        break;
      case "--holidays":
        for (const d of next(i++, arg).split(",").map((s) => s.trim())) {
          if (d) opts.holidays.add(validDate(d, "--holidays"));
        }
        break;
      case "-i":
        opts.prices.offpeak.cache_miss_input = parsePrice(next(i++, arg), arg);
        break;
      case "-c":
        opts.prices.offpeak.cache_hit_input = parsePrice(next(i++, arg), arg);
        break;
      case "-o":
        opts.prices.offpeak.output = parsePrice(next(i++, arg), arg);
        break;
      case "--pi":
        opts.prices.peak.cache_miss_input = parsePrice(next(i++, arg), arg);
        break;
      case "--pc":
        opts.prices.peak.cache_hit_input = parsePrice(next(i++, arg), arg);
        break;
      case "--po":
        opts.prices.peak.output = parsePrice(next(i++, arg), arg);
        break;
      default:
        throw new Error(`不明な引数: ${arg}`);
    }
  }

  if (!opts.directory) {
    throw new Error("-d <project-directory> は必須です (-h でヘルプ)");
  }
  if (opts.from && opts.to && opts.from > opts.to) {
    throw new Error(`期間が不正です: --from ${opts.from} > --to ${opts.to}`);
  }

  opts.directory = path.resolve(expandHome(opts.directory));
  return opts;
}

function jstDate(ms) {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ピーク窓 (UTC 01-04, 06-10) は北京日付 = UTC日付 の範囲内
function isPeak(ms, holidays) {
  const d = new Date(ms);
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  if (holidays.has(d.toISOString().slice(0, 10))) return false;
  const h = d.getUTCHours();
  return (h >= 1 && h < 4) || (h >= 6 && h < 10);
}

function tokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function emptyBucket() {
  return {
    records: 0,
    cache_miss_input_tokens: 0,
    cache_hit_input_tokens: 0,
    output_tokens: 0,
  };
}

function emptyGroup(date, model) {
  return { date, model, offpeak: emptyBucket(), peak: emptyBucket() };
}

function bucketCost(bucket, price) {
  const cache_miss_input =
    (bucket.cache_miss_input_tokens / 1e6) * price.cache_miss_input;
  const cache_hit_input =
    (bucket.cache_hit_input_tokens / 1e6) * price.cache_hit_input;
  const output = (bucket.output_tokens / 1e6) * price.output;
  return {
    cache_miss_input,
    cache_hit_input,
    output,
    total: cache_miss_input + cache_hit_input + output,
  };
}

function addCost(a, b) {
  return {
    cache_miss_input: a.cache_miss_input + b.cache_miss_input,
    cache_hit_input: a.cache_hit_input + b.cache_hit_input,
    output: a.output + b.output,
    total: a.total + b.total,
  };
}

function roundCost(c) {
  const r = (x) => Math.round(x * 1e8) / 1e8;
  return {
    cache_miss_input: r(c.cache_miss_input),
    cache_hit_input: r(c.cache_hit_input),
    output: r(c.output),
    total: r(c.total),
  };
}

function summarize(group, prices) {
  const { offpeak, peak } = group;
  const costOff = bucketCost(offpeak, prices.offpeak);
  const costPeak = bucketCost(peak, prices.peak);
  const miss = offpeak.cache_miss_input_tokens + peak.cache_miss_input_tokens;
  const hit = offpeak.cache_hit_input_tokens + peak.cache_hit_input_tokens;
  const out = offpeak.output_tokens + peak.output_tokens;
  return {
    ...(group.date !== undefined && { date: group.date }),
    ...(group.model !== undefined && { model: group.model }),
    records: offpeak.records + peak.records,
    cache_miss_input_tokens: miss,
    cache_hit_input_tokens: hit,
    total_input_tokens: miss + hit,
    output_tokens: out,
    offpeak: { ...offpeak, cost_usd: roundCost(costOff) },
    peak: { ...peak, cost_usd: roundCost(costPeak) },
    cost_usd: roundCost(addCost(costOff, costPeak)),
  };
}

function addBucket(target, source) {
  target.records += source.records;
  target.cache_miss_input_tokens += source.cache_miss_input_tokens;
  target.cache_hit_input_tokens += source.cache_hit_input_tokens;
  target.output_tokens += source.output_tokens;
}

async function main() {
  const opts = parseArgs();

  const configDir = process.env.CLAUDE_CONFIG_DIR
    ? path.resolve(expandHome(process.env.CLAUDE_CONFIG_DIR))
    : path.join(os.homedir(), ".claude");

  const projectKey = opts.directory.replace(/[^a-zA-Z0-9]/g, "-");
  const projectsDir = path.join(configDir, "projects");

  const entries = await fs.promises
    .readdir(projectsDir, { withFileTypes: true })
    .catch((error) => {
      if (error.code === "ENOENT") {
        throw new Error(`ディレクトリが見つかりません: ${projectsDir}`);
      }
      throw error;
    });

  const logDirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name !== projectKey && !entry.name.startsWith(projectKey + "-")) {
      continue;
    }
    const dir = path.join(projectsDir, entry.name);
    const cwd = await findCwd(dir);
    if (cwd === null || isInside(cwd, opts.directory)) {
      logDirs.push({ dir, cwd });
    }
  }

  if (logDirs.length === 0) {
    throw new Error(`該当するログがありません: ${opts.directory} 以下`);
  }

  const groups = new Map();
  let invalidJson = 0;
  let invalidTimestamp = 0;

  for await (const file of walkAll(logDirs.map((p) => p.dir))) {
    const input = fs.createReadStream(file, { encoding: "utf8" });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    input.on("error", (error) => lines.destroy(error));

    try {
      for await (const line of lines) {
        if (!line.trim()) continue;

        let record;
        try {
          record = JSON.parse(line);
        } catch {
          invalidJson++;
          continue;
        }

        const usage = record?.message?.usage;
        if (record?.type !== "assistant" || !usage) continue;

        const ms =
          typeof record.timestamp === "string"
            ? Date.parse(record.timestamp)
            : NaN;
        if (!Number.isFinite(ms)) {
          invalidTimestamp++;
          continue;
        }

        const date = jstDate(ms);
        if (opts.from && date < opts.from) continue;
        if (opts.to && date > opts.to) continue;

        const model = record.message.model ?? "unknown";
        const key = JSON.stringify([date, model]);
        let group = groups.get(key);
        if (!group) {
          group = emptyGroup(date, model);
          groups.set(key, group);
        }

        const bucket = isPeak(ms, opts.holidays) ? group.peak : group.offpeak;
        bucket.records++;
        bucket.cache_miss_input_tokens +=
          tokenCount(usage.input_tokens) +
          tokenCount(usage.cache_creation_input_tokens);
        bucket.cache_hit_input_tokens += tokenCount(
          usage.cache_read_input_tokens
        );
        bucket.output_tokens += tokenCount(usage.output_tokens);
      }
    } finally {
      lines.close();
      input.destroy();
    }
  }

  const sorted = [...groups.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      String(a.model).localeCompare(String(b.model))
  );

  const total = emptyGroup();
  delete total.date;
  delete total.model;
  for (const g of sorted) {
    addBucket(total.offpeak, g.offpeak);
    addBucket(total.peak, g.peak);
  }

  if (invalidJson || invalidTimestamp) {
    console.error(
      `スキップ: 不正JSON=${invalidJson}, 不正日時=${invalidTimestamp}`
    );
  }

  console.log(
    JSON.stringify(
      {
        period: { from: opts.from ?? null, to: opts.to ?? null, tz: "JST" },
        prices_usd_per_1m: opts.prices,
        projects: logDirs,
        holidays: [...opts.holidays].sort(),
        rows: sorted.map((g) => summarize(g, opts.prices)),
        total: summarize(total, opts.prices),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
