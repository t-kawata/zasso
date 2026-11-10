// version-build.test.mjs — the pure rules behind the build and push versions.
//
// The build may move VERSION.json by exactly one patch, and only when the
// result stays one step past the latest versioned commit. The rules are tested
// without touching the real VERSION.json or the deployment repository.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  bumpPatch,
  compareVersions,
  latestCommitVersion,
  planIncrement,
  readVersionFile,
  versionDistance,
  writeVersionFile,
} from "../../scripts/version.mjs";

function createGitRepo(commitMessages) {
  const root = mkdtempSync(path.join(tmpdir(), "conver-version-"));
  const runGit = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  runGit(["init", "-q"]);
  runGit(["config", "user.email", "test@example.com"]);
  runGit(["config", "user.name", "Test"]);
  commitMessages.forEach((message, index) => {
    writeFileSync(path.join(root, "file.txt"), `${message}-${index}\n`);
    runGit(["add", "."]);
    runGit(["commit", "-qm", message]);
  });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe("bumpPatch", () => {
  it("increments the patch and carries at 1000", () => {
    assert.equal(bumpPatch("0.0.99"), "0.0.100");
    assert.equal(bumpPatch("0.0.999"), "0.1.0");
    assert.equal(bumpPatch("0.999.999"), "1.0.0");
    assert.equal(bumpPatch("1.2.3"), "1.2.4");
  });

  it("rejects a value that is not W.x.y", () => {
    assert.throws(() => bumpPatch("v0.0.1"), /expected W\.x\.y/);
  });
});

describe("compareVersions / versionDistance", () => {
  it("orders dotted versions by each component", () => {
    assert.ok(versionDistance("0.0.100", "0.0.99") > 0);
    assert.ok(versionDistance("0.0.99", "0.0.100") < 0);
    assert.equal(versionDistance("1.2.3", "1.2.3"), 0);
    assert.equal(compareVersions("0.1.0", "0.0.999"), 1);
    assert.equal(compareVersions("0.0.999", "0.1.0"), -1);
  });
});

describe("planIncrement", () => {
  it("allows the single step from the latest commit", () => {
    const plan = planIncrement({ current: "0.0.99", latest: "0.0.99" });
    assert.deepEqual(plan, { next: "0.0.100", allowed: true, reason: "" });
  });

  it("refuses a second increment when it would be two steps ahead", () => {
    const plan = planIncrement({ current: "0.0.100", latest: "0.0.99" });
    assert.equal(plan.allowed, false);
    assert.equal(plan.next, "0.0.101");
    assert.match(plan.reason, /ahead of the latest commit v0\.0\.99/);
  });

  it("refuses an increment that would not advance past the latest commit", () => {
    const plan = planIncrement({ current: "0.0.98", latest: "0.0.99" });
    assert.equal(plan.allowed, false);
    assert.match(plan.reason, /not advance past the latest commit v0\.0\.99/);
  });

  it("allows an unchecked increment when the deployment has no versioned commit", () => {
    const plan = planIncrement({ current: "0.0.99", latest: null });
    assert.equal(plan.allowed, true);
    assert.equal(plan.next, "0.0.100");
    assert.match(plan.reason, /not checked/);
  });
});

describe("readVersionFile / writeVersionFile", () => {
  it("writes the existing 2-space format and reads it back", () => {
    const root = mkdtempSync(path.join(tmpdir(), "conver-version-file-"));
    try {
      const file = path.join(root, "VERSION.json");
      writeVersionFile(file, "0.0.100");
      assert.equal(readFileSync(file, "utf8"), '{\n  "version": "0.0.100"\n}\n');
      assert.equal(readVersionFile(file), "0.0.100");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("latestCommitVersion", () => {
  it("reads the version from the newest commit subject", () => {
    const repo = createGitRepo(["v0.0.98", "v0.0.99"]);
    try {
      assert.equal(latestCommitVersion(repo.root), "0.0.99");
    } finally {
      repo.cleanup();
    }
  });

  it("returns null when the newest subject has no version", () => {
    const repo = createGitRepo(["v0.0.99", "wip"]);
    try {
      assert.equal(latestCommitVersion(repo.root), null);
    } finally {
      repo.cleanup();
    }
  });

  it("returns null when the repository has no commits", () => {
    const repo = createGitRepo([]);
    try {
      assert.equal(latestCommitVersion(repo.root), null);
    } finally {
      repo.cleanup();
    }
  });
});
