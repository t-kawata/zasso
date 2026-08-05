/**
 * print-manifest-for-find-omissions.test.cjs — PX-131 manifest file printer.
 *
 * Verifies the script scans a tree of [::UNIT::<id>::]-tagged markers, groups by
 * unit id, writes ./manifests/CONSOLIDATED-MANIFEST-<ts>.json, and — only after a
 * successful write — strips every unit tag from the source markers.
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { scanTaggedMarkers, groupByUnitId, runPrinter } = require("../.claude/scripts/tickets/print-manifest-for-find-omissions.js");

/** Build an isolated tree with 2 units: U1 (P4-2, 2 markers) and U2 (P3-2, 1 marker). */
function makeTaggedWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-test-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "src/a.rs"),
    "// a\npub fn demo() {\n    let x = 1;\n    // [::STUB::] P4-2: codec deferred [::UNIT::U1::] -- Implement pjsua codec enumeration\n    let _ = x;\n}\n"
  );
  fs.writeFileSync(
    path.join(dir, "src/b.rs"),
    "// b\npub fn demo2() {\n    let y = 2;\n    // [::STUB::] P4-2: codec constants [::UNIT::U1::] -- Replace with bindgen constants\n    let _ = y;\n}\n"
  );
  fs.writeFileSync(
    path.join(dir, "src/c.rs"),
    "// c\npub fn demo3() {\n    let z = 3;\n    // [::STUB::] P3-2: audio [::UNIT::U2::] -- Implement audio worker\n    let _ = z;\n}\n"
  );
  return dir;
}

// ---------------------------------------------------------------------------
// C003 — scan and group by unit id
// ---------------------------------------------------------------------------

// @verifies C003 (PX-131 contract)
describe("C003 scan and group", function () {
  it("collects tagged markers and groups them by unit id into units with a sourceKey", () => {
    const dir = makeTaggedWorkspace();
    const tagged = scanTaggedMarkers(dir);
    assert.strictEqual(tagged.length, 3, "three tagged markers");
    const units = groupByUnitId(tagged);
    assert.strictEqual(units.length, 2, "two units");
    assert.strictEqual(units[0].sourceKey, "P4-2");
    assert.strictEqual(units[0].stubs.length, 2, "U1 carries both P4-2 markers");
    assert.strictEqual(units[1].sourceKey, "P3-2");
  });
});

// ---------------------------------------------------------------------------
// C004 — manifest file write
// ---------------------------------------------------------------------------

// @verifies C004 (PX-131 contract)
describe("C004 manifest file write", function () {
  it("writes ./manifests/CONSOLIDATED-MANIFEST-<ts>.json with one entry per unit", () => {
    const dir = makeTaggedWorkspace();
    const out = runPrinter(dir);
    assert.strictEqual(out.ok, true, JSON.stringify(out.error));
    assert.ok(fs.existsSync(out.manifestPath), "manifest file exists");
    assert.ok(out.manifestPath.includes("manifests" + path.sep + "CONSOLIDATED-MANIFEST-"), "path convention");
    const manifest = JSON.parse(fs.readFileSync(out.manifestPath, "utf8"));
    assert.strictEqual(manifest.length, 2, "one entry per unit");
    assert.strictEqual(manifest[0].stubs[0].content.includes("[::UNIT::"), false, "manifest carries clean markers");
  });
});

// ---------------------------------------------------------------------------
// C005 — cleanup after a successful write
// ---------------------------------------------------------------------------

// @verifies C005 (PX-131 contract)
describe("C005 cleanup", function () {
  it("after a successful write every [::UNIT::] tag is removed from source", () => {
    const dir = makeTaggedWorkspace();
    runPrinter(dir);
    assert.ok(!fs.readFileSync(path.join(dir, "src/a.rs"), "utf8").includes("[::UNIT::"), "tags stripped");
    assert.ok(fs.readFileSync(path.join(dir, "src/a.rs"), "utf8").includes("[::STUB::]"), "markers remain clean");
    assert.ok(!fs.readFileSync(path.join(dir, "src/c.rs"), "utf8").includes("[::UNIT::"), "all files cleaned");
  });

  it("a failed write leaves all tags in place and returns an error", () => {
    const dir = makeTaggedWorkspace();
    fs.chmodSync(dir, 0o555); // read+execute only — manifests/ cannot be created
    const out = runPrinter(dir);
    assert.strictEqual(out.ok, false, "unwritable manifests dir must fail");
    assert.strictEqual(out.manifestPath, undefined, "no manifest path on failure");
    fs.chmodSync(dir, 0o755); // restore for the assertion below
    assert.ok(fs.readFileSync(path.join(dir, "src/a.rs"), "utf8").includes("[::UNIT::"), "tags preserved for retry");
  });
});
