/**
 * insert-field-template-contracts.test.cjs — Contracts template stub tests
 *
 * Tests: TEMPLATES contracts entry, shouldSkipField, mergeTemplate,
 * extractStubNames object support, object array detection
 * [::TICKET::] PX-73: C003 — contracts template stub insertion
 * [::TICKET::] PX-73: C004 — contracts defined/expanded regardless of prior existence
 * [::TICKET::] PX-76: C001-C004 — contracts type mismatch fix, extractStubNames object support,
 *   shouldSkipField real-data detection, string-field regression
 */
// @verifies C004 — Phase 1.5 unconditional: contracts defined when absent

const assert = require("node:assert");
const { describe, it } = require("node:test");
const {
  TEMPLATES,
  shouldSkipField,
  hasAllTemplateStubs,
  extractStubNames,
  mergeTemplate,
} = require("../.claude/scripts/tickets/insert-field-template");

// Real contracts data shape (siprs-like)
const realContracts = [
  { id: "C001", sourceEdge: "N0001-N0007", precondition: "RFC defines purpose", postcondition: "Purpose is implemented", invariant: "Must always hold" },
  { id: "C002", sourceEdge: "N0001-N0009", precondition: "Concurrency model defined", postcondition: "Purpose implementable via async", invariant: "Valid state machine" },
];

// Contracts template with all stubs (as would be after insert-field-template)
const allStubsContracts = [
  { id: "C000", sourceEdge: "[::TEMPLATE-STUB::contracts-edge::]", precondition: "[::TEMPLATE-STUB::contracts-precondition::]", postcondition: "[::TEMPLATE-STUB::contracts-postcondition::]", invariant: "[::TEMPLATE-STUB::contracts-invariant::]" },
];

describe("insert-field-template — contracts stub", function () {
  // --- Existing tests (unchanged) ---

  it("TEMPLATES has a 'contracts' entry", () => {
    assert.ok(TEMPLATES.contracts, "TEMPLATES.contracts must exist");
    assert.ok(
      typeof TEMPLATES.contracts === "string" || Array.isArray(TEMPLATES.contracts),
      "TEMPLATES.contracts must be string or array"
    );
  });

  it("contracts template contains all required stub markers", () => {
    const template = TEMPLATES.contracts;
    // contracts is now object[]; check stub markers in first element's properties
    const sample = Array.isArray(template) ? template[0] : template;
    if (typeof sample === "object" && sample !== null) {
      assert.ok(String(sample.sourceEdge).includes("contracts-edge"), "Must have contracts-edge stub");
      assert.ok(String(sample.precondition).includes("contracts-precondition"), "Must have contracts-precondition stub");
      assert.ok(String(sample.postcondition).includes("contracts-postcondition"), "Must have contracts-postcondition stub");
      assert.ok(String(sample.invariant).includes("contracts-invariant"), "Must have contracts-invariant stub");
    } else {
      const text = String(sample);
      assert.ok(text.includes("contracts-edge"), "Must have contracts-edge stub");
      assert.ok(text.includes("contracts-precondition"), "Must have contracts-precondition stub");
      assert.ok(text.includes("contracts-postcondition"), "Must have contracts-postcondition stub");
      assert.ok(text.includes("contracts-invariant"), "Must have contracts-invariant stub");
    }
  });

  it("shouldSkipField returns false when contracts field is undefined", () => {
    const result = shouldSkipField(undefined, TEMPLATES.contracts);
    assert.strictEqual(result, false, "Should need update when contracts is undefined");
  });

  it("shouldSkipField returns true when all stubs present (dedup)", () => {
    // First, merge to get the full template
    const merged = mergeTemplate(undefined, TEMPLATES.contracts);
    // Now shouldSkipField should return true (all stubs present)
    const result = shouldSkipField(merged, TEMPLATES.contracts);
    assert.strictEqual(result, true, "Should skip when all stubs present");
  });

  it("mergeTemplate adds full template when field is undefined", () => {
    const merged = mergeTemplate(undefined, TEMPLATES.contracts);
    assert.ok(Array.isArray(merged), "Merged result must be array");
    assert.ok(merged.length > 0, "Merged result must have at least one element");
    const first = merged[0];
    assert.ok(typeof first === "object" && first !== null, "First element must be object");
    assert.ok(String(first.sourceEdge).includes("contracts-edge"), "Merged result must contain contracts-edge");
    assert.ok(String(first.precondition).includes("contracts-precondition"), "Merged result must contain contracts-precondition");
  });

  // --- PX-76: C001 — TEMPLATES shape and object[] type ---

  it("C001: TEMPLATES.contracts[0] is object with id/sourceEdge/precondition/postcondition/invariant keys", () => {
    const sample = TEMPLATES.contracts[0];
    assert.strictEqual(typeof sample, "object", "contracts[0] must be object");
    assert.ok(!Array.isArray(sample), "contracts[0] must not be array");
    assert.ok(typeof sample.id === "string", "id must be string");
    assert.ok(typeof sample.sourceEdge === "string", "sourceEdge must be string");
    assert.ok(typeof sample.precondition === "string", "precondition must be string");
    assert.ok(typeof sample.postcondition === "string", "postcondition must be string");
    assert.ok(typeof sample.invariant === "string", "invariant must be string");
  });

  it("C001: TEMPLATES has exactly 12 non-empty entries", () => {
    const keys = Object.keys(TEMPLATES);
    assert.strictEqual(keys.length, 12, "TEMPLATES must have 12 entries");
    keys.forEach(key => {
      const val = TEMPLATES[key];
      assert.ok(val !== undefined && val !== null, key + " must not be null/undefined");
      if (typeof val === "string") assert.ok(val.length > 0, key + " must be non-empty string");
      if (Array.isArray(val)) assert.ok(val.length > 0, key + " must be non-empty array");
    });
  });

  // --- PX-76: C002 — extractStubNames object support ---

  it("C002: extractStubNames with object argument detects stubs via JSON.stringify", () => {
    const obj = { id: "C000", precondition: "[::TEMPLATE-STUB::contracts-precondition::]" };
    const result = extractStubNames(obj);
    assert.ok(Array.isArray(result), "Result must be array");
    assert.ok(result.includes("contracts-precondition"), "Must detect stubs in object properties via JSON.stringify");
  });

  it("C002: extractStubNames with string argument returns stubs unchanged", () => {
    const str = "prefix [::TEMPLATE-STUB::invariants-normal::] suffix";
    const result = extractStubNames(str);
    assert.strictEqual(result.length, 1, "Must find exactly 1 stub");
    assert.strictEqual(result[0], "invariants-normal", "Must return correct stub name");
  });

  it("C002: extractStubNames with null returns empty array without throwing", () => {
    const result = extractStubNames(null);
    assert.ok(Array.isArray(result), "Result must be array");
    assert.strictEqual(result.length, 0, "Result must be empty");
  });

  it("C002: extractStubNames with undefined returns empty array without throwing", () => {
    const result = extractStubNames(undefined);
    assert.ok(Array.isArray(result), "Result must be array");
    assert.strictEqual(result.length, 0, "Result must be empty");
  });

  it("C002: extractStubNames returns string[] for all input types", () => {
    assert.ok(Array.isArray(extractStubNames("")), "Empty string returns array");
    assert.ok(Array.isArray(extractStubNames({ a: 1 })), "Object returns array");
    assert.ok(Array.isArray(extractStubNames(null)), "null returns array");
    assert.ok(Array.isArray(extractStubNames(undefined)), "undefined returns array");
  });

  // --- PX-76: C003 — string/string[] field regression ---

  it("C003: shouldSkipField for string invariants returns correct value (unchanged)", () => {
    const testStr = "pre-existing content without stubs";
    // Should return false (merge target — content exists but no stubs)
    const result = shouldSkipField(testStr, TEMPLATES.invariants);
    assert.strictEqual(result, false, "string field without stubs must be merge target");
  });

  it("C003: mergeTemplate for string[] scope returns string[] with existing content preserved", () => {
    const testArray = ["existing scope item"];
    const merged = mergeTemplate(testArray, TEMPLATES.scope);
    assert.strictEqual(merged[0], testArray[0], "existing content must be first element");
    assert.ok(merged.length > testArray.length, "new template items must be appended");
    merged.forEach(item => {
      assert.strictEqual(typeof item, "string", "scope elements must remain string");
    });
  });

  it("C003: mergeTemplate for all string fields preserves type", () => {
    const stringFields = ["invariants", "background", "instrumentation", "notes", "investigation", "boyScoutPlan"];
    stringFields.forEach(f => {
      const r = mergeTemplate("existing", TEMPLATES[f]);
      assert.strictEqual(typeof r, "string", f + " must remain string after merge");
    });
  });

  it("C003: mergeTemplate for all string[] fields preserves type", () => {
    const arrayFields = ["scope", "testUnit", "testIntegration", "testExceptions", "acceptanceCriteria"];
    arrayFields.forEach(f => {
      const r = mergeTemplate(["existing"], TEMPLATES[f]);
      assert.ok(Array.isArray(r), f + " must remain array after merge");
      r.forEach(item => assert.strictEqual(typeof item, "string", f + " elements must be string"));
    });
  });

  it("C003: hasAllTemplateStubs with string array is unchanged", () => {
    const testArray = ["scope text [::TEMPLATE-STUB::scope-changes-path::]"];
    const result = hasAllTemplateStubs(testArray, TEMPLATES.scope);
    assert.strictEqual(result, false, "partial stubs must not trigger skip");
  });

  it("C003: hasAllTemplateStubs with object array detects stubs", () => {
    const result = hasAllTemplateStubs(allStubsContracts, TEMPLATES.contracts);
    assert.strictEqual(result, true, "object array with all stubs must return true");
  });

  // --- PX-76: C004 — shouldSkipField real-contracts data detection ---

  it("C004: shouldSkipField returns true for real contracts data (no stubs, length>0)", () => {
    const result = shouldSkipField(realContracts, TEMPLATES.contracts);
    assert.strictEqual(result, true, "real contracts data must be skipped");
  });

  it("C004: shouldSkipField returns false for empty contracts array (merge target)", () => {
    const result = shouldSkipField([], TEMPLATES.contracts);
    assert.strictEqual(result, false, "empty array must be merge target");
  });

  it("C004: shouldSkipField returns true for multiple real-data samples", () => {
    const samples = [
      [{ id: "C001", sourceEdge: "E1", precondition: "P1", postcondition: "P2", invariant: "I1" }],
      [{ id: "C002", sourceEdge: "E2", precondition: "P3", postcondition: "P4", invariant: "I2" }],
    ];
    samples.forEach((data, i) => {
      assert.strictEqual(shouldSkipField(data, TEMPLATES.contracts), true,
        "sample " + i + " must be skipped");
    });
  });

  it("C004: shouldSkipField returns false for undefined (merge target)", () => {
    assert.strictEqual(shouldSkipField(undefined, TEMPLATES.contracts), false,
      "undefined must be merge target");
  });
});
