#!/usr/bin/env node
/**
 * list-remaining-stubs.js <Tickets.json path> <ticket-key>
 *
 * /make-ticket Step 4b で AI が繰り返し実行する。チケットの全フィールドから
 * [::TEMPLATE-STUB::] マーカーを検出し、未記入の項目を自然言語で一覧表示する。
 *
 * check-field-density.js の STUB_PATTERN を再利用し、出力形式のみ差別化する。
 *
 * 動作仕様:
 *   - exit 0: マーカー0件（全フィールド記入済み）
 *   - exit 1: マーカー1件以上（未記入あり）
 *   - stdout: 人間（AI）が読む自然言語形式。JSON は出力しない。
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// check-field-density.js からスタブ検出パターンを再利用
const { STUB_PATTERN } = require("./check-field-density.js");

const EXIT_CLEAN = 0;
const EXIT_STUBS_REMAIN = 1;

/**
 * フィールド値を文字列に平坦化し、全てのスタブマーカーを検出する
 *
 * @param {*} rawValue - チケットフィールドの値（string / array / undefined 等）
 * @returns {{ marker: string, name: string }[]} 検出されたマーカーの配列
 */
function findStubs(rawValue) {
  if (rawValue === undefined || rawValue === null) return [];

  const str = typeof rawValue === "string"
    ? rawValue
    : Array.isArray(rawValue)
      ? rawValue.join("\n")
      : String(rawValue);

  STUB_PATTERN.lastIndex = 0;
  const matches = [];
  let m;
  while ((m = STUB_PATTERN.exec(str)) !== null) {
    matches.push({ marker: m[0], name: m[1] });
  }
  return matches;
}

/** 検証対象とするチケットフィールド名のリスト */
const TARGET_FIELDS = [
  "invariants", "background", "scope", "testUnit", "testIntegration",
  "testExceptions", "instrumentation", "notes", "acceptanceCriteria",
  "investigation", "boyScoutPlan",
];

/**
 * フィールド名から短い説明を返す（スタブ種別の補助情報）
 */
function fieldLabel(field) {
  const labels = {
    invariants: "Invariants — system must always satisfy",
    background: "Background — goal, purpose, motivation, constraints",
    scope: "Scope — changes, non-changes, affected areas",
    testUnit: "Unit Tests — normal, error, boundary, invariant",
    testIntegration: "Integration Tests — point, verify, prerequisites, tickets",
    testExceptions: "Exceptions — item, reason, alternative",
    instrumentation: "Instrumentation — logging, metrics, errors, health",
    notes: "Notes — steps, risks, caveats, open items, future",
    acceptanceCriteria: "Acceptance Criteria — happy, error, edge",
    investigation: "Investigation — evidence from code research",
    boyScoutPlan: "Boy Scout Rule — translatability improvements",
  };
  return labels[field] || "";
}

function main() {
  const ticketsPath = process.argv[2];
  const ticketKey = process.argv[3];

  if (!ticketsPath || !ticketKey) {
    console.error(
      "Usage: list-remaining-stubs.js <Tickets.json> <ticket-key>",
    );
    process.exit(EXIT_STUBS_REMAIN);
  }

  const resolvedPath = path.resolve(ticketsPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Tickets.json not found: ${resolvedPath}`);
    process.exit(EXIT_STUBS_REMAIN);
  }

  // get-ticket.js で現在のチケット状態を取得
  const getScript = path.join(__dirname, "get-ticket.js");
  let getResult;
  try {
    const stdout = execFileSync(process.execPath, [getScript, resolvedPath, ticketKey], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    getResult = JSON.parse(stdout);
  } catch (e) {
    console.error(`Failed to get ticket: ${e.message}`);
    process.exit(EXIT_STUBS_REMAIN);
  }

  if (!getResult.success) {
    console.error(`Ticket not found: ${ticketKey}`);
    process.exit(EXIT_STUBS_REMAIN);
  }

  const ticket = getResult.ticket;

  // 全対象フィールドをスキャンし、スタブがあるフィールドのみ収集
  const stubsByField = {};
  let totalStubs = 0;

  for (const field of TARGET_FIELDS) {
    const stubs = findStubs(ticket[field]);
    if (stubs.length > 0) {
      stubsByField[field] = stubs;
      totalStubs += stubs.length;
    }
  }

  // 自然言語形式で出力
  if (totalStubs === 0) {
    console.log(`✅  All TEMPLATE-STUB markers have been replaced. No remaining markers in ticket ${ticketKey}.`);
    process.exit(EXIT_CLEAN);
  }

  console.log(`⚠️  ${totalStubs} TEMPLATE-STUB marker(s) remaining in ticket ${ticketKey}\n`);

  for (const [field, stubs] of Object.entries(stubsByField)) {
    const label = fieldLabel(field);
    console.log(`  ${field} (${stubs.length}):`);
    if (label) console.log(`    — ${label}`);
    for (const s of stubs) {
      console.log(`    · ${s.marker}`);
    }
    console.log("");
  }

  console.log("Use 'update-ticket.js' to replace each remaining marker with actual content.\n");
  process.exit(EXIT_STUBS_REMAIN);
}

if (require.main === module) {
  main();
}

module.exports = { findStubs, main };
