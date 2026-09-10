#!/usr/bin/env node
/**
 * insert-field-template.js <Tickets.json path> <ticket-key>
 *
 * Executed by AI at the start of /make-ticket Step 3. Merges templates into the
 * target ticket's 12 fields (invariants, background, scope, testUnit, testIntegration,
 * testExceptions, instrumentation, notes, acceptanceCriteria,
 * investigation, boyScoutPlan, contracts).
 *
 * Skips only fields where all [::TEMPLATE-STUB::] markers are already present.
 * For other fields, preserves existing content and appends only missing markers.
 *
 * Merge behavior:
 *   - Empty/unset → Insert full template
 *   - Real content present (no stubs) → Existing content + blank line + full template
 *   - Partial stubs present → Existing content + only missing stub lines
 *   - All stubs present → Skip (true deduplication prevention)
 *
 * Behavior specification:
 *   - exit 0: Success (updated 1+ fields or all fields skipped)
 *   - exit 1: Error
 *   - stdout: JSON { ok: true/false, ticketKey, updated: [field names] }
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

// ---- 12-field template definitions (incl. contracts) ----

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

  acceptanceCriteria: [
    "**[Happy path] — Describe the scenario that confirms this ticket is complete:**\n  - [::TEMPLATE-STUB::acceptance-happy::]",
    "**[Error case] — Describe an error scenario the feature must handle:**\n  - [::TEMPLATE-STUB::acceptance-error::]",
    "**[Edge case] — Describe any boundary or exception to verify:**\n  - [::TEMPLATE-STUB::acceptance-edge::]",
  ],

  investigation:
    "- [::TEMPLATE-STUB::investigation::] Record all evidence gathered during code investigation — architecture, patterns, potential issues, specific file contents relevant to this ticket. Replace the stub with the actual investigation findings.",

  boyScoutPlan:
    "- [::TEMPLATE-STUB::boyscout-plan::] Describe the translatability improvements planned for the code touched by this ticket. Specify which code will be refactored (function extraction, variable renaming, constant extraction) and why. Replace the stub with the actual plan.",

  contracts: [
    {
      id: "C000",
      sourceEdge: "[::TEMPLATE-STUB::contracts-edge::]",
      precondition: "[::TEMPLATE-STUB::contracts-precondition::]",
      postcondition: "[::TEMPLATE-STUB::contracts-postcondition::]",
      invariant: "[::TEMPLATE-STUB::contracts-invariant::]",
    },
  ],
};

/**
 * Extract all [::TEMPLATE-STUB::XXX::] marker names from a string
 *
 * @param {string} str - The string to search
 * @returns {string[]} Array of marker names
 */
// [::TICKET::] PX-73, PX-76 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-73|PX-76) --for-spec --no-implementation-order`.
function extractStubNames(str) {
  // Convert objects to JSON string so stub markers in property values are searchable
  if (typeof str === "object" && str !== null) {
    str = JSON.stringify(str);
  }
  const regex = /\[::TEMPLATE-STUB::([^:]+)::\]/g;
  const names = [];
  let match;
  while ((match = regex.exec(str)) !== null) {
    names.push(match[1]);
  }
  return names;
}

/**
 * Check whether all template stub markers are present in the field value
 * (true deduplication prevention)
 *
 * @param {*} fieldValue - Current value of the ticket field
 * @param {string|string[]} templateDef - Template definition
 * @returns {boolean}
 */
// [::TICKET::] PX-76 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-76 --for-spec --no-implementation-order`.
function hasAllTemplateStubs(fieldValue, templateDef) {
  const fieldStr = typeof fieldValue === "string"
    ? fieldValue
    : Array.isArray(fieldValue)
      ? fieldValue.map(function (i) {
          return typeof i === "object" && i !== null ? JSON.stringify(i) : i;
        }).join(" ")
      : String(fieldValue);
  const templateStr = typeof templateDef === "string"
    ? templateDef
    : Array.isArray(templateDef)
      ? templateDef.map(function (i) {
          return typeof i === "object" && i !== null ? JSON.stringify(i) : i;
        }).join(" ")
      : String(templateDef);

  const templateStubs = extractStubNames(templateStr);
  if (templateStubs.length === 0) return false;

  const fieldStubs = extractStubNames(fieldStr);
  return templateStubs.every(function (stub) {
    return fieldStubs.includes(stub);
  });
}

/**
 * Check whether a field is eligible for template insert/merge
 * (true=skip, false=insert/merge)
 *
 * Empty/unset → Insert full template (false)
 * All stub markers present → Skip (true, deduplication prevention)
 * Missing stubs exist → Merge target (false)
 */
// [::TICKET::] PX-76 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-76 --for-spec --no-implementation-order`.
function shouldSkipField(value, templateDef) {
  // Field does not exist → insert target
  if (value === undefined || value === null) return false;
  // Empty string → insert target
  if (typeof value === "string" && value.trim() === "") return false;
  // Empty array → insert target
  if (Array.isArray(value) && value.length === 0) return false;
  // Real object data detection: object[] with length>0 and zero stub markers → skip
  if (Array.isArray(value) && value.length > 0) {
    var allObjects = value.every(function (i) {
      return typeof i === "object" && i !== null;
    });
    if (allObjects) {
      var stubCount = 0;
      value.forEach(function (i) {
        stubCount += extractStubNames(JSON.stringify(i)).length;
      });
      if (stubCount === 0) return true; // Real data, skip template injection
    }
  }
  // All stub markers present → skip (true deduplication prevention)
  if (hasAllTemplateStubs(value, templateDef)) return true;
  // Merge result identical to existing (missing stubs within multi-stub
  // elements but merge not possible) → skip
  const merged = mergeTemplate(value, templateDef);
  if (merged === value) return true;
  // Real content exists but stubs missing, and merge is possible → insert target
  return false;
}

/**
 * Merge missing template content into existing content
 *
 * - Empty/unset → Return full template
 * - No stubs in existing → Existing content + blank line + full template
 * - Partial stubs present → Existing content + only missing stub lines
 * - All stubs present (filtered by caller, so normally not reached)
 *
 * @param {*} existing - Current value of the ticket field
 * @param {string|string[]} template - Template definition
 * @returns {string|string[]} Merged value
 */
function mergeTemplate(existing, template) {
  // Empty/unset → Return full template
  if (existing === undefined || existing === null) return template;

  if (typeof template === "string") {
    if (typeof existing === "string" && existing.trim() === "") return template;

    const existingStubs = extractStubNames(existing);
    if (existingStubs.length === 0) {
      // No stubs in existing → existing content + blank line + full template
      return existing.trimEnd() + "\n\n" + template;
    }
    // Only partial markers exist → append only missing lines
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

    // Collect all stubs from existing content
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

/** Write fields via update-ticket.js */
function writeFields(ticketsPath, ticketKey, updates) {
  const script = path.join(__dirname, "update-ticket.js");
  const input = JSON.stringify(updates);
  execFileSync(process.execPath, [script, ticketsPath, ticketKey], {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

// [::TICKET::] PX-76 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-76 --for-spec --no-implementation-order`.
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

  // Get current ticket state via get-ticket.js
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

  // Prepare templates for each field (merge missing stubs)
  const updates = {};
  for (const [field, template] of Object.entries(TEMPLATES)) {
    if (!shouldSkipField(ticket[field], template)) {
      updates[field] = mergeTemplate(ticket[field], template);
      updated.push(field);
    }
  }

  // Set created_at / updated_at
  // created_at only if unset, updated_at always to today's date
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  if (!ticket.created_at) {
    updates.created_at = today;
    updated.push("created_at");
  }
  if (ticket.updated_at !== today) {
    updates.updated_at = today;
    updated.push("updated_at");
  }

  if (updated.length === 0) {
    console.log(
      JSON.stringify({
        ok: true,
        ticketKey,
        updated: [],
        note: "All " + Object.keys(TEMPLATES).length + " fields already contain templates or data. No changes made.",
      }),
    );
    process.exit(EXIT_SUCCESS);
  }

  // Batch write via update-ticket.js
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
