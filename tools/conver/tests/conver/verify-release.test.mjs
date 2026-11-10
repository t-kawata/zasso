// verify-release.test.mjs — make push may only commit a prepared, rebuilt version.
//
// The deployment's `make push` must prove three things before it stages
// anything: VERSION.json is exactly one step past the latest versioned commit,
// the latest commit is parseable, and `node conver.js --version` reports the
// same version. Each test builds a temporary git repository with those facts.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const VERIFY_SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "scripts",
  "verify-release.mjs",
);

function createReleaseRepo({ version, latestMessage, bundleVersion }) {
  const root = mkdtempSync(path.join(tmpdir(), "conver-release-"));
  const runGit = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  runGit(["init", "-q"]);
  runGit(["config", "user.email", "test@example.com"]);
  runGit(["config", "user.name", "Test"]);
  writeFileSync(path.join(root, "VERSION.json"), `{\n  "version": "${version}"\n}\n`);
  writeFileSync(
    path.join(root, "conver.js"),
    `process.stdout.write("conver.js ${bundleVersion}\\n");\n`,
  );
  runGit(["add", "."]);
  runGit(["commit", "-qm", latestMessage]);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function verify(root) {
  return spawnSync(
    process.execPath,
    [
      VERIFY_SCRIPT,
      "--version-file=VERSION.json",
      "--conver-js=conver.js",
    ],
    { cwd: root, encoding: "utf8" },
  );
}

describe("verify-release", () => {
  it("passes when VERSION.json is the next commit version and the bundle matches", () => {
    const repo = createReleaseRepo({
      version: "0.0.100",
      latestMessage: "v0.0.99",
      bundleVersion: "v0.0.100",
    });
    try {
      const result = verify(repo.root);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Release version: v0\.0\.100 \(latest commit v0\.0\.99\)/);
    } finally {
      repo.cleanup();
    }
  });

  it("refuses a version that has not been prepared by build-conver", () => {
    const repo = createReleaseRepo({
      version: "0.0.99",
      latestMessage: "v0.0.99",
      bundleVersion: "v0.0.99",
    });
    try {
      const result = verify(repo.root);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /run make build-conver first/);
    } finally {
      repo.cleanup();
    }
  });

  it("refuses a version more than one step ahead and does not increment it", () => {
    const repo = createReleaseRepo({
      version: "0.0.101",
      latestMessage: "v0.0.99",
      bundleVersion: "v0.0.101",
    });
    try {
      const result = verify(repo.root);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /more than one step ahead/);
      assert.match(result.stderr, /not incrementing/);
    } finally {
      repo.cleanup();
    }
  });

  it("refuses a bundle whose --version disagrees with VERSION.json", () => {
    const repo = createReleaseRepo({
      version: "0.0.100",
      latestMessage: "v0.0.99",
      bundleVersion: "v0.0.99",
    });
    try {
      const result = verify(repo.root);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /reports v0\.0\.99 but VERSION\.json is v0\.0\.100/);
    } finally {
      repo.cleanup();
    }
  });

  it("refuses a latest commit whose subject carries no version", () => {
    const repo = createReleaseRepo({
      version: "0.0.100",
      latestMessage: "wip",
      bundleVersion: "v0.0.100",
    });
    try {
      const result = verify(repo.root);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /does not contain vW\.x\.y/);
    } finally {
      repo.cleanup();
    }
  });
});
