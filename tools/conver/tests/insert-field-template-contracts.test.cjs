/**
 * insert-field-template-contracts.test.cjs — Contracts template stub tests
 *
 * Tests: TEMPLATES contracts entry, shouldSkipField, mergeTemplate
 * [::TICKET::] PX-73: C003 — contracts template stub insertion
 * [::TICKET::] PX-73: C004 — contracts defined/expanded regardless of prior existence
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

describe("insert-field-template — contracts stub", function () {
  it("TEMPLATES has a 'contracts' entry", () => {
    assert.ok(TEMPLATES.contracts, "TEMPLATES.contracts must exist");
    assert.ok(
      typeof TEMPLATES.contracts === "string" || Array.isArray(TEMPLATES.contracts),
      "TEMPLATES.contracts must be string or array"
    );
  });

  it("contracts template contains all required stub markers", () => {
    const template = TEMPLATES.contracts;
    const text = typeof template === "string" ? template : template.join(" ");
    assert.ok(text.includes("contracts-id"), "Must have contracts-id stub");
    assert.ok(text.includes("contracts-edge"), "Must have contracts-edge stub");
    assert.ok(text.includes("contracts-precondition"), "Must have contracts-precondition stub");
    assert.ok(text.includes("contracts-postcondition"), "Must have contracts-postcondition stub");
    assert.ok(text.includes("contracts-invariant"), "Must have contracts-invariant stub");
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
    const text = typeof merged === "string" ? merged : Array.isArray(merged) ? merged.join(" ") : "";
    assert.ok(text.includes("contracts-id"), "Merged result must contain contracts-id");
    assert.ok(text.includes("contracts-precondition"), "Merged result must contain contracts-precondition");
  });
});
