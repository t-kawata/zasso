#!/usr/bin/env node
/**
 * insert-field-template.js <Tickets.json path> <ticket-key>
 *
 * /make-ticket Step 3 開始時に AI が実行する。対象チケットの 8 フィールド
 * （invariants, background, scope, testUnit, testIntegration,
 *  testExceptions, instrumentation, notes）にテンプレートをマージ挿入する。
 *
 * 全 [::TEMPLATE-STUB::] マーカーが既に揃っているフィールドのみスキップ。
 * それ以外のフィールドは既存コンテンツを保持した上で不足マーカーを追記する。
 *
 * マージ動作:
 *   - 空/未設定 → テンプレート全体を新規挿入
 *   - 実コンテンツあり（スタブなし）→ 既存コンテンツ + 空行 + 全テンプレート
 *   - 一部スタブあり → 既存コンテンツ + 不足スタブ行のみ追記
 *   - 全スタブ揃い → スキップ（真の二重挿入防止）
 *
 * 動作仕様:
 *   - exit 0: 正常終了（1つ以上のフィールドを更新 or 全フィールドスキップ）
 *   - exit 1: エラー
 *   - stdout: JSON { ok: true/false, ticketKey, updated: [field names] }
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

// ---- 8フィールドのテンプレート定義 ----

const TEMPLATES = {
  invariants:
    "- [Normal condition] [::TEMPLATE-STUB::invariants-normal::] Preconditions that must hold for correct behavior\n- [Error invariant] [::TEMPLATE-STUB::invariants-error::] Invariants that must never be violated even on error\n- [Internal state invariant] [::TEMPLATE-STUB::invariants-state::] Invariants the module's internal state must always satisfy\n- [Boundary invariant] [::TEMPLATE-STUB::invariants-boundary::] Invariants related to boundary values / thresholds",

  background:
    "### Goal\n[::TEMPLATE-STUB::background-goal::] What specific outcome does this ticket achieve?\n\n### Purpose\n[::TEMPLATE-STUB::background-purpose::] Why does this functionality exist? What problem does it solve?\n\n### Motivation\n[::TEMPLATE-STUB::background-motivation::] Why now? (user demand, tech debt, requirement change, …)\n\n### Constraints\n[::TEMPLATE-STUB::background-constraints::] What technical/business/time boundaries limit the implementation?",

  scope: [
    "**Scope of changes (describe each change comprehensively):**\n  - [File/module path] [::TEMPLATE-STUB::scope-changes-path::]\n  - [Action: add/modify/remove/rename/refactor] [::TEMPLATE-STUB::scope-changes-action::]\n  - [What specifically changes] [::TEMPLATE-STUB::scope-changes-detail::]\n  - [Before → After (behavior/signature)] [::TEMPLATE-STUB::scope-changes-before-after::]\n  - [API contract change (if any)] [::TEMPLATE-STUB::scope-changes-api::]\n  - [Data schema change (if any)] [::TEMPLATE-STUB::scope-changes-schema::]\n  - [Config/env change (if any)] [::TEMPLATE-STUB::scope-changes-config::]\n  - [Dependency added/removed (if any)] [::TEMPLATE-STUB::scope-changes-dep::]",
    "**Out of scope (items intentionally excluded, with justification):**\n  - [Excluded item] [::TEMPLATE-STUB::scope-non-changes-item::]\n  - [Why excluded — separate ticket / future phase / not applicable] [::TEMPLATE-STUB::scope-non-changes-why::]",
    "**Affected areas (components/systems impacted, even without direct modification):**\n  - [Affected component] [::TEMPLATE-STUB::scope-impact-component::]\n  - [Nature of impact: performance / security / API surface / data format / …] [::TEMPLATE-STUB::scope-impact-nature::]\n  - [Corresponding change needed Y/N + details] [::TEMPLATE-STUB::scope-impact-response::]",
  ],

  testUnit: [
    "**UT: [Normal] — Describe each normal-case test scenario:**\n  - [::TEMPLATE-STUB::testunit-normal::]",
    "**UT: [Error] — Describe each error-handling test scenario:**\n  - [::TEMPLATE-STUB::testunit-error::]",
    "**UT: [Boundary] — Describe each boundary-value test scenario:**\n  - [::TEMPLATE-STUB::testunit-boundary::]",
    "**UT: [Invariant] — Describe each invariant test scenario:**\n  - [::TEMPLATE-STUB::testunit-invariant::]",
  ],

  testIntegration: [
    "**IT: [Integration point] — Specify each interface between modules:**\n  - [::TEMPLATE-STUB::testintegration-point::]",
    "**IT: [Verification] — Describe what each integration test verifies:**\n  - [::TEMPLATE-STUB::testintegration-verify::]",
    "**IT: [Prerequisites] — State each prerequisite for integration tests:**\n  - [::TEMPLATE-STUB::testintegration-prereq::]",
    "**IT: [Related tickets] — List each related ticket:**\n  - [::TEMPLATE-STUB::testintegration-tickets::]",
  ],

  testExceptions: [
    "**Exception entry (copy this block for each non-testable item):**\n  - [Item] [::TEMPLATE-STUB::exception-item::]\n  - [Reason] [::TEMPLATE-STUB::exception-reason::]\n  - [Alternative verification] [::TEMPLATE-STUB::exception-alternative::]",
  ],

  instrumentation:
    "- [Logging] [::TEMPLATE-STUB::instrumentation-log::]\n- [Metrics] [::TEMPLATE-STUB::instrumentation-metrics::]\n- [Error tracking] [::TEMPLATE-STUB::instrumentation-errors::]\n- [Health check] [::TEMPLATE-STUB::instrumentation-health::]",

  notes:
    "- [Implementation steps] [::TEMPLATE-STUB::notes-steps::]\n- [Risks] [::TEMPLATE-STUB::notes-risks::]\n- [Caveats] [::TEMPLATE-STUB::notes-caveats::]\n- [Open items] [::TEMPLATE-STUB::notes-open::]\n- [Future improvements] [::TEMPLATE-STUB::notes-future::]",
};

/**
 * 文字列から [::TEMPLATE-STUB::XXX::] マーカー名を全て抽出する
 *
 * @param {string} str - 検索対象の文字列
 * @returns {string[]} マーカー名の配列
 */
function extractStubNames(str) {
  const regex = /\[::TEMPLATE-STUB::([^:]+)::\]/g;
  const names = [];
  let match;
  while ((match = regex.exec(str)) !== null) {
    names.push(match[1]);
  }
  return names;
}

/**
 * テンプレートに定義された全スタブマーカーがフィールド値に含まれているかを判定
 * （真の二重挿入防止）
 *
 * @param {*} fieldValue - チケットフィールドの現在値
 * @param {string|string[]} templateDef - テンプレート定義
 * @returns {boolean}
 */
function hasAllTemplateStubs(fieldValue, templateDef) {
  const fieldStr = typeof fieldValue === "string"
    ? fieldValue
    : Array.isArray(fieldValue)
      ? fieldValue.join(" ")
      : String(fieldValue);
  const templateStr = typeof templateDef === "string"
    ? templateDef
    : Array.isArray(templateDef)
      ? templateDef.join(" ")
      : String(templateDef);

  const templateStubs = extractStubNames(templateStr);
  if (templateStubs.length === 0) return false;

  const fieldStubs = extractStubNames(fieldStr);
  return templateStubs.every(function (stub) {
    return fieldStubs.includes(stub);
  });
}

/**
 * フィールドがテンプレート挿入/マージ対象かを判定
 * （true=スキップ, false=挿入/マージ）
 *
 * 空/未設定 → テンプレート全体を新規挿入（false）
 * 全スタブマーカー済み → スキップ（true、真の二重挿入防止）
 * 不足スタブあり → マージ対象（false）
 */
function shouldSkipField(value, templateDef) {
  // フィールドが存在しない → 挿入対象
  if (value === undefined || value === null) return false;
  // 空文字列 → 挿入対象
  if (typeof value === "string" && value.trim() === "") return false;
  // 空配列 → 挿入対象
  if (Array.isArray(value) && value.length === 0) return false;
  // 全スタブマーカーが揃っている → スキップ（真の二重挿入防止）
  if (hasAllTemplateStubs(value, templateDef)) return true;
  // マージ結果が既存と同一（マルチスタブ要素内で不足があっても
  // マージ不能な場合）→ スキップ
  const merged = mergeTemplate(value, templateDef);
  if (merged === value) return true;
  // 実コンテンツはあるが不足スタブあり、且つマージ可能 → 挿入対象
  return false;
}

/**
 * 既存コンテンツに不足テンプレートをマージする
 *
 * - 空/未設定 → テンプレート全体を返す
 * - 既存にスタブなし → 既存コンテンツ + 空行 + 全テンプレート
 * - 一部スタブあり → 既存コンテンツ + 不足スタブ行のみ追記
 * - 全スタブあり（呼び出し元でフィルタ済みのため通常ここには来ない）
 *
 * @param {*} existing - チケットフィールドの現在値
 * @param {string|string[]} template - テンプレート定義
 * @returns {string|string[]} マージ後の値
 */
function mergeTemplate(existing, template) {
  // 空/未設定 → テンプレート全体
  if (existing === undefined || existing === null) return template;

  if (typeof template === "string") {
    if (typeof existing === "string" && existing.trim() === "") return template;

    const existingStubs = extractStubNames(existing);
    if (existingStubs.length === 0) {
      // スタブが1つもない → 既存コンテンツ + 空行 + 全テンプレート
      return existing.trimEnd() + "\n\n" + template;
    }
    // 一部マーカーのみ存在 → 不足行のみ追記
    const templateLines = template.split("\n");
    const missingLines = templateLines.filter(function (line) {
      const stubsInLine = extractStubNames(line);
      return stubsInLine.length > 0 && !stubsInLine.some(function (s) {
        return existingStubs.includes(s);
      });
    });
    if (missingLines.length === 0) return existing;
    return existing.trimEnd() + "\n" + missingLines.join("\n");
  }

  if (Array.isArray(template)) {
    if (!existing || (Array.isArray(existing) && existing.length === 0)) return template;

    // 既存の全スタブを収集
    var existingStubs = new Set();
    if (Array.isArray(existing)) {
      existing.forEach(function (item) {
        extractStubNames(String(item)).forEach(function (s) {
          return existingStubs.add(s);
        });
      });
    } else {
      extractStubNames(String(existing)).forEach(function (s) {
        return existingStubs.add(s);
      });
    }

    var missingItems = template.filter(function (item) {
      var stubs = extractStubNames(item);
      return stubs.length > 0 && !stubs.some(function (s) {
        return existingStubs.has(s);
      });
    });
    if (missingItems.length === 0) return existing;
    return [...(Array.isArray(existing) ? existing : [existing]), ...missingItems];
  }

  return template;
}

/** update-ticket.js 経由でフィールドを書き込む */
function writeFields(ticketsPath, ticketKey, updates) {
  const script = path.join(__dirname, "update-ticket.js");
  const input = JSON.stringify(updates);
  execFileSync(process.execPath, [script, ticketsPath, ticketKey], {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function main() {
  const ticketsPath = process.argv[2];
  const ticketKey = process.argv[3];

  if (!ticketsPath || !ticketKey) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "Usage: insert-field-template.js <Tickets.json> <ticket-key>",
      }),
    );
    process.exit(EXIT_FAILURE);
  }

  const resolvedPath = path.resolve(ticketsPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(
      JSON.stringify({ ok: false, error: `Tickets.json not found: ${resolvedPath}` }),
    );
    process.exit(EXIT_FAILURE);
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
  const updated = [];

  // 各フィールドのテンプレートを準備（不足スタブをマージ）
  const updates = {};
  for (const [field, template] of Object.entries(TEMPLATES)) {
    if (!shouldSkipField(ticket[field], template)) {
      updates[field] = mergeTemplate(ticket[field], template);
      updated.push(field);
    }
  }

  if (updated.length === 0) {
    console.log(
      JSON.stringify({
        ok: true,
        ticketKey,
        updated: [],
        note: "All 8 fields already contain templates or data. No changes made.",
      }),
    );
    process.exit(EXIT_SUCCESS);
  }

  // update-ticket.js で一括書き込み
  try {
    writeFields(resolvedPath, ticketKey, updates);
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `Failed to write fields: ${e.message}`,
      }),
    );
    process.exit(EXIT_FAILURE);
  }

  console.log(
    JSON.stringify({
      ok: true,
      ticketKey,
      updated,
      count: updated.length,
    }),
  );
  process.exit(EXIT_SUCCESS);
}

if (require.main === module) {
  main();
}

module.exports = { TEMPLATES, shouldSkipField, hasAllTemplateStubs, extractStubNames, mergeTemplate, writeFields, main };
