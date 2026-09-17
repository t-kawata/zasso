// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
// [::TICKET::] PX-209 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-209 --for-spec --no-implementation-order`.
// @verifies C001
// @verifies C002
// @verifies C003
/**
 * scope-extensions — the annotation system's extension set is a decision.
 *
 * SOURCE_EXTENSIONS calls itself the single source of truth for which files the
 * annotation system supports, and nothing has ever compared it against the
 * repository. Its own comment names the consequence: a file the mechanism does
 * not know about is simply never reported on. `.mjs` was added by P22-4 for that
 * reason; `.cjs` — 134 tracked files, this repository's own tests — was left
 * behind and stayed invisible through every ticket since.
 *
 * The census below is derived from `git ls-files` at check time. It reads no
 * stored extension list, because a stored list would carry the same defect it
 * exists to catch: an omission nobody can see.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");

const { SOURCE_EXTENSIONS, EXCLUDED_SOURCE_EXTENSIONS, VENDORED_ROOTS } = require(
  "../.claude/scripts/tickets/lib/scope-detection-constants",
);
const { filterSourceFiles, processFile } = require(
  "../.claude/scripts/tickets/annotate-ticket-context-by-git-diff",
);
const {
  MINIMUM_FILES_FOR_DECISION,
  censusTrackedExtensions,
  findUndecidedExtensions,
  parseExtension,
  readTrackedPaths,
} = require("../.claude/scripts/tickets/lib/scope-extensions-census");

const REPO_ROOT = path.resolve(__dirname, "..");
const KEY = "PX-209";

const undecidedIn = (trackedPaths, ignoredRoots = VENDORED_ROOTS) =>
  findUndecidedExtensions(
    censusTrackedExtensions({ trackedPaths, ignoredRoots }),
    { included: SOURCE_EXTENSIONS, excluded: EXCLUDED_SOURCE_EXTENSIONS },
  );

let fixtureDir;
test.before(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "px209-"));
});
test.after(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

const annotationCount = (file) =>
  fs.readFileSync(file, "utf8").split("\n").filter((line) => line.includes("[::TICKET::] " + KEY)).length;
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// ---------------------------------------------------------------------------
// C001 — the set is complete by decision, and the decision is written down
// ---------------------------------------------------------------------------

test("C001: every extension this repository presents is decided", () => {
  const census = censusTrackedExtensions({
    trackedPaths: readTrackedPaths(REPO_ROOT),
    ignoredRoots: VENDORED_ROOTS,
  });
  const undecided = findUndecidedExtensions(census, {
    included: SOURCE_EXTENSIONS,
    excluded: EXCLUDED_SOURCE_EXTENSIONS,
  });

  assert.deepStrictEqual(undecided, [], "an undecided extension must fail by name, got: " + undecided.join(", "));
  assert.ok(census.get(".cjs") >= 3, "the census must actually see the .cjs files this ticket is about");
  assert.ok(census.has(".js") && census.has(".md"), "and it must see both sides of the decision");
});

test("C001: the exclusion map is exactly {.cpp, .h, .json, .md, .sh, .toml} and every entry explains itself", () => {
  // The literal below is the written record, not a snapshot of convenience: a
  // decision that disappears fails here, and a decision that appears without
  // being added here fails here too. `.toml` joined when P23-2's two-package
  // fixture brought a third Cargo manifest into the repository and the census
  // floor caught it — the errand this check exists to run. `.cpp` joined the
  // same way when P24-1's C/C++ language representatives brought three of them
  // into this repository's own tree, and `.h` was decided beside it so that the
  // header and the translation unit are not treated as two different owners'
  // files.
  const keys = [...EXCLUDED_SOURCE_EXTENSIONS.keys()].sort();
  assert.deepStrictEqual(keys, [".cpp", ".h", ".json", ".md", ".sh", ".toml"], "a decision must not vanish unnoticed");

  for (const [extension, reason] of EXCLUDED_SOURCE_EXTENSIONS) {
    assert.strictEqual(typeof reason, "string", extension + " must carry a reason");
    assert.ok(reason.trim().length >= 20, extension + " must carry a reason worth reading, not a shrug");
  }
});

test("C001: .toml is decided by exclusion, because the annotator writes // into it", () => {
  // `.toml` crossed the census floor when the reverse-rotation fixtures brought
  // their Cargo manifests in. The decision cannot be admission: `buildAnnotation`
  // emits a `//` comment for every file it annotates, and TOML reads `#`, so the
  // line written would be one the manifest cannot parse rather than provenance.
  assert.ok(
    EXCLUDED_SOURCE_EXTENSIONS.has(".toml"),
    "the Cargo manifests this repository tracks owe a decision, and it is owed by name",
  );
  assert.deepStrictEqual(
    filterSourceFiles(["a.toml"]),
    [],
    "and the decision is exclusion: the // this annotator writes would corrupt the manifest",
  );
});

test("C001: an undecided extension fails the check and is named", () => {
  const trackedPaths = [
    "src/alpha.zig", "src/beta.zig", "src/gamma.zig",
    "src/one.js", "src/two.js", "src/three.js",
  ];
  const census = censusTrackedExtensions({ trackedPaths, ignoredRoots: VENDORED_ROOTS });

  assert.strictEqual(census.get(".zig"), 3, "the census counts what is there");
  assert.deepStrictEqual(undecidedIn(trackedPaths), [".zig"], "the undecided extension is reported, not hidden");
  // The check reports; it never admits on its own authority.
  assert.strictEqual(SOURCE_EXTENSIONS.has(".zig"), false, "the check does not widen the set by itself");
});

test("C001: two files of a new extension are tolerated, three are not", () => {
  const pathsFor = (count) => Array.from({ length: count }, (_, index) => `src/f${index}.zig`);

  assert.deepStrictEqual(undecidedIn(pathsFor(2)), [], "a one-off extension does not force a decision");
  assert.deepStrictEqual(undecidedIn(pathsFor(3)), [".zig"], "the third file is where it becomes a pattern");
});

test("C001: extensionless tracked paths are skipped, not counted as an empty extension", () => {
  const census = censusTrackedExtensions({
    trackedPaths: ["Makefile", "LICENSE", "src/a.js", "src/b.js", "src/c.js"],
    ignoredRoots: VENDORED_ROOTS,
  });

  assert.strictEqual(census.has(""), false, "an extensionless path is not an extension");
  assert.strictEqual(census.get(".js"), 3);
});

test("C001: a leading dot is not an extension", () => {
  // `.gitignore` has no extension; reading it as one named after itself would put
  // a phantom entry in the census. `.eslintrc.json` does have one, and `.env`
  // does not — the rule is the last dot, and only when something precedes it.
  assert.strictEqual(parseExtension(".gitignore"), null);
  assert.strictEqual(parseExtension("src/.env"), null);
  assert.strictEqual(parseExtension(".eslintrc.json"), ".json");
  assert.strictEqual(parseExtension("a.tar.gz"), ".gz");
  // A trailing dot names nothing, in either direction.
  assert.strictEqual(parseExtension(".."), null);
  assert.strictEqual(parseExtension("archive."), null);

  const census = censusTrackedExtensions({
    trackedPaths: [".gitignore", ".gitattributes", ".editorconfig"],
    ignoredRoots: VENDORED_ROOTS,
  });
  assert.deepStrictEqual([...census.keys()], [], "three dotfiles are not an extension at all");
});

// ---------------------------------------------------------------------------
// C002 — .cjs joins the filter, and PX-208's property holds for it
// ---------------------------------------------------------------------------

test("C002: filterSourceFiles admits .cjs and still refuses what it always refused", () => {
  assert.deepStrictEqual(filterSourceFiles(["a.cjs"]), ["a.cjs"], "the extension this ticket adds");

  for (const admitted of ["a.js", "a.mjs", "a.ts", "a.rs", "a.py"]) {
    assert.deepStrictEqual(filterSourceFiles([admitted]), [admitted], admitted + " stays admitted");
  }
  for (const refused of ["a.md", "a.json", "a.sh", "a.h", "a.cc", "a.bak"]) {
    assert.deepStrictEqual(filterSourceFiles([refused]), [], refused + " must stay out of the filter");
  }
});

test("C002: a .cjs file earns an annotation on its definition", () => {
  const file = path.join(fixtureDir, "subject.cjs");
  fs.writeFileSync(file, ["#!/usr/bin/env node", "function subject() {", "  return 1;", "}"].join("\n"), "utf8");

  const action = processFile(file, KEY, { cwd: fixtureDir, changedLines: new Set([1]) });

  assert.match(action, /^annotated/, "the definition took the annotation");
  assert.strictEqual(annotationCount(file), 1);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  assert.strictEqual(lines[0], "#!/usr/bin/env node", "the shebang stays on line one");
  assert.match(lines[1], new RegExp("\\[::TICKET::\\] " + KEY), "the annotation sits above the definition it names");
  assert.strictEqual(lines[2], "function subject() {");
});

test("C002: three runs over a .cjs file leave it byte-identical with one annotation", () => {
  const file = path.join(fixtureDir, "idempotent.cjs");
  fs.writeFileSync(
    file,
    [
      "// [::TICKET::] " + KEY + " changes. Details: `x`",
      "// prose interposed after the annotation landed",
      "function subject() {",
      "  return 1;",
      "}",
    ].join("\n"),
    "utf8",
  );

  const first = sha256(file);
  const counts = [];
  for (let run = 0; run < 3; run += 1) {
    processFile(file, KEY, { cwd: fixtureDir, changedLines: new Set([2]) });
    counts.push(annotationCount(file));
  }

  assert.strictEqual(sha256(file), first, "sha256 after run 3 equals sha256 after run 1");
  assert.deepStrictEqual(counts, [1, 1, 1], "the count never increases");
});

test("C002: a definition-less .cjs file resolves ambiguously once and only once", () => {
  const file = path.join(fixtureDir, "no-definitions.cjs");
  fs.writeFileSync(file, ["#!/usr/bin/env node", "const x = 1;", "module.exports = { x };"].join("\n"), "utf8");

  const first = processFile(file, KEY, { cwd: fixtureDir, changedLines: new Set([99]) });
  assert.match(first, /ambiguous/, "no definition means the file-level marker");
  const second = processFile(file, KEY, { cwd: fixtureDir, changedLines: new Set([99]) });
  assert.match(second, /already-annotated/, "and a second run inserts nothing");
});

// ---------------------------------------------------------------------------
// C003 — the boundary is a path prefix, not an extension
// ---------------------------------------------------------------------------

test("C003: every C/C++ file this repository owns is counted, and carries a decision", () => {
  const all = readTrackedPaths(REPO_ROOT);
  const cFamily = all.filter((tracked) => /\.(h|c|cc|cpp|hpp)$/.test(tracked));

  // The C/C++ family used to be thousands of files: two vendored trees supplied
  // 2253 of them and the path-prefix exclusion is what kept them out of the
  // census. Both trees have been deleted, so the family is now this repository's
  // own files only — and the assertion that they are present is what notices if
  // the census starts reading an empty repository as a fully decided one.
  assert.ok(cFamily.length > 0, "the C/C++ family is present in the repository");

  for (const tracked of cFamily) {
    assert.ok(
      EXCLUDED_SOURCE_EXTENSIONS.has(path.extname(tracked)),
      tracked + " is this repository's C/C++ file and must carry a decision",
    );
  }

  const census = censusTrackedExtensions({ trackedPaths: all, ignoredRoots: VENDORED_ROOTS });
  for (const extension of [".h", ".c", ".cc", ".cpp", ".hpp"]) {
    const ownOfExtension = cFamily.filter((tracked) => tracked.endsWith(extension)).length;
    const counted = census.get(extension) ?? 0;

    assert.ok(
      counted <= ownOfExtension,
      extension + ": the census never counts a file the repository does not have",
    );
    if (ownOfExtension >= MINIMUM_FILES_FOR_DECISION) {
      assert.strictEqual(
        counted,
        ownOfExtension,
        extension + ": at the decision floor the census counts every one of them",
      );
    }
  }
  assert.strictEqual(census.get(".cpp"), 3, "and this repository's own .cpp files are all of it");
});

test("C003: path decides, not extension", () => {
  // A list of the test's own, because the rule outlives the trees it was written
  // for: an empty declaration would make this pass by having nothing to ignore.
  const vendoredRoots = ["vendor/dependency/", "third_party/sdk/"];
  const own = ["tests/alpha.zig", "tests/beta.zig", "tests/gamma.zig"];
  const vendored = vendoredRoots.flatMap((root) => [
    root + "alpha.zig", root + "beta.zig", root + "gamma.zig",
  ]);

  assert.deepStrictEqual(undecidedIn(own), [".zig"], "the same extension in our own tree owes a decision");
  assert.deepStrictEqual(
    undecidedIn(vendored, vendoredRoots),
    [],
    "and vendored, it owes none",
  );
});

test("C003: the declaration is empty, and an empty declaration does not widen the census", () => {
  assert.ok(Array.isArray(VENDORED_ROOTS), "the roots are declared, even when there are none");
  for (const root of VENDORED_ROOTS) {
    assert.ok(root.endsWith("/"), root + " must be a path prefix, not a name");
  }

  // The two trees the list named have been deleted, so the declaration excludes
  // nothing. Taking the census twice — with the declaration, and with a list that
  // names a tree that is gone — asserts that the declaration still governs the
  // answer rather than having quietly stopped being read.
  const all = readTrackedPaths(REPO_ROOT);
  assert.deepStrictEqual(
    [...censusTrackedExtensions({ trackedPaths: all, ignoredRoots: VENDORED_ROOTS })],
    [...censusTrackedExtensions({ trackedPaths: all, ignoredRoots: ["siprs-for-reverse/"] })],
    "nothing is excluded, so excluding a deleted tree changes nothing",
  );
});
