#!/usr/bin/env node
/**
 * check-field-density.js <Tickets.json path> <ticket-key>
 *
 * /make-ticket Step 5 終了時に AI が実行する。対象チケットの全フィールドから
 * [::TEMPLATE-STUB::] マーカーを検出し、未記入の有無を検証する。
 *
 * 動作仕様:
 *   - exit 0: マーカー0件（全フィールド記入済み）
 *   - exit 1: マーカー1件以上（未記入あり）、stderr に詳細JSON
 *   - stdout: JSON { ok: true/false, count: N, density: { ... } }
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/** マーカー検出用正規表現 */
const STUB_PATTERN = /\[::TEMPLATE-STUB::([^\]]+)::\]/g;

/** 密度スコアリング対象フィールドとその必須項目数 */
const FIELD_EXPECTED = {
  invariants: 4,
  background: 4,
  scope: 13,
  testUnit: 4,
  testIntegration: 4,
  testExceptions: 3,
  instrumentation: 4,
  notes: 5,
  acceptanceCriteria: 3,
};

function main() {
  const ticketsPath = process.argv[2];
  const ticketKey = process.argv[3];

  if (!ticketsPath || !ticketKey) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "Usage: check-field-density.js <Tickets.json> <ticket-key>",
      }),
    );
    process.exit(EXIT_FAILURE);
  }

  const resolvedPath = path.resolve(ticketsPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `Tickets.json not found: ${resolvedPath}`,
      }),
    );
    process.exit(EXIT_FAILURE);
  }

  // get-ticket.js でチケット取得
  const getScript = path.join(__dirname, "get-ticket.js");
  let getResult;
  try {
    const stdout = execFileSync(process.execPath, [getScript, resolvedPath, ticketKey], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    getResult = JSON.parse(stdout);
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `Failed to get ticket: ${e.message}`,
      }),
    );
    process.exit(EXIT_FAILURE);
  }

  if (!getResult.success) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `Ticket not found: ${ticketKey}`,
      }),
    );
    process.exit(EXIT_FAILURE);
  }

  const ticket = getResult.ticket;

  // 全フィールドを文字列連接してマーカー検出
  const allStubs = []; // { field, marker, context }
  const fieldDensity = {};
  let totalExpected = 0;
  let totalFilled = 0;

  for (const field of Object.keys(FIELD_EXPECTED)) {
    const raw = ticket[field];
    if (raw === undefined || raw === null) {
      // フィールドそのものが存在しない
      fieldDensity[field] = { expected: FIELD_EXPECTED[field], filled: 0, ratio: 0 };
      continue;
    }

    const str = typeof raw === "string" ? raw : JSON.stringify(raw);
    STUB_PATTERN.lastIndex = 0;
    const matches = [];
    let m;
    while ((m = STUB_PATTERN.exec(str)) !== null) {
      matches.push({ marker: m[0], name: m[1] });
    }

    const expected = FIELD_EXPECTED[field];
    const filled = expected - matches.length;
    fieldDensity[field] = { expected, filled, ratio: filled / expected };
    totalExpected += expected;
    totalFilled += filled;

    if (matches.length > 0) {
      allStubs.push({ field, count: matches.length, markers: matches.map((x) => x.marker) });
    }
  }

  // 密度スコアリング結果
  const densityResult = {
    fields: fieldDensity,
    total: { expected: totalExpected, filled: totalFilled },
    overallRatio: totalExpected > 0 ? totalFilled / totalExpected : 1,
  };

  // stdout に結果を出力
  const result = {
    ok: allStubs.length === 0,
    count: allStubs.reduce((sum, s) => sum + s.count, 0),
    density: densityResult,
    stubs: allStubs.length > 0 ? allStubs : undefined,
  };
  console.log(JSON.stringify(result));

  if (allStubs.length > 0) {
    // stderr に未記入の詳細を出力
    const errors = allStubs.map(
      (s) => `${s.field}: ${s.count} unset marker(s) - ${s.markers.join(", ")}`,
    );
    console.error(
      JSON.stringify(
        {
          ok: false,
          count: allStubs.reduce((sum, s) => sum + s.count, 0),
          message: "Unset template markers found",
          errors,
        },
        null,
        2,
      ),
    );
    process.exit(EXIT_FAILURE);
  }

  process.exit(EXIT_SUCCESS);
}

if (require.main === module) {
  main();
}

module.exports = { main, STUB_PATTERN, FIELD_EXPECTED };
