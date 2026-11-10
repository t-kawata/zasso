// short-name.test.ts — common-prefix stripping shared with draw-progress-gif.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripCommonPrefix } from "./short-name.js";

describe("stripCommonPrefix", () => {
// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
  it("leaves doors names unchanged because pjsip-prebuilt breaks the prefix", () => {
    const result = stripCommonPrefix([
      "doors-core",
      "doors-operation",
      "doors-cli",
      "pjsip-prebuilt",
    ]);
    assert.strictEqual(result.prefix, "");
    assert.deepStrictEqual(result.names, [
      "doors-core",
      "doors-operation",
      "doors-cli",
      "pjsip-prebuilt",
    ]);
  });

  it("strips the gaia- prefix", () => {
    const result = stripCommonPrefix(["gaia-foundation", "gaia-core", "gaia-rest"]);
    assert.strictEqual(result.prefix, "gaia-");
    assert.deepStrictEqual(result.names, ["foundation", "core", "rest"]);
  });

  it("keeps the crystal root name and strips siblings", () => {
    const result = stripCommonPrefix([
      "crystal",
      "crystal-core",
      "crystal-adapter-clock",
    ]);
    assert.strictEqual(result.prefix, "crystal-");
    assert.deepStrictEqual(result.names, ["crystal", "core", "adapter-clock"]);
  });

  it("does not strip when a remainder would be empty", () => {
    const result = stripCommonPrefix(["a-", "a-b"]);
    assert.strictEqual(result.prefix, "a-");
    assert.deepStrictEqual(result.names, ["a-", "b"]);
  });

  it("returns an empty result for an empty set", () => {
    assert.deepStrictEqual(stripCommonPrefix([]), { prefix: "", names: [] });
  });

  it("supports dot as a separator", () => {
    const result = stripCommonPrefix(["crystal.core", "crystal.rest"]);
    assert.strictEqual(result.prefix, "crystal.");
    assert.deepStrictEqual(result.names, ["core", "rest"]);
  });
});
