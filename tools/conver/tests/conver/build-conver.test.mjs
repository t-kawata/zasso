// build-conver.test.mjs — the build path that prepares one release version.
//
// The test supplies a temporary VERSION.json and a temporary deployment git
// repository, so the real source and deployment versions are never touched.
// It then runs the produced bundle's --version to prove the version was
// embedded rather than merely written to a file.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..", "..");
const BUILD_SCRIPT = path.join(PROJECT_ROOT, "scripts", "build-conver.mjs");

function createDeployment(commitMessages) {
  const root = mkdtempSync(path.join(tmpdir(), "conver-build-deploy-"));
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

function createVersionFile(root, version) {
  const file = path.join(root, "VERSION.json");
  writeFileSync(file, `{\n  "version": "${version}"\n}\n`);
  return file;
}

function runBuild({ versionFile, deployDir, outfile }) {
  return spawnSync(
    process.execPath,
    [
      BUILD_SCRIPT,
      "--increment",
      `--outfile=${outfile}`,
      `--version-file=${versionFile}`,
      `--deploy-dir=${deployDir}`,
    ],
    { cwd: PROJECT_ROOT, encoding: "utf8" },
  );
}

describe("build-conver", () => {
  it("increments once, copies the version, and embeds it in the bundle", () => {
    const root = mkdtempSync(path.join(tmpdir(), "conver-build-"));
    const deployment = createDeployment(["v0.0.99"]);
    try {
      const versionFile = createVersionFile(root, "0.0.99");
      const outfile = path.join(root, "conver.js");

      const result = runBuild({ versionFile, deployDir: deployment.root, outfile });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(readFileSync(versionFile, "utf8")).version, "0.0.100");
      assert.equal(
        JSON.parse(readFileSync(path.join(deployment.root, "VERSION.json"), "utf8")).version,
        "0.0.100",
      );
      const printed = spawnSync(process.execPath, [outfile, "--version"], { encoding: "utf8" });
      assert.equal(printed.status, 0, printed.stderr);
      assert.match(printed.stdout, /conver\.js v0\.0\.100/);
    } finally {
      deployment.cleanup();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not increment when the version is already two steps ahead", () => {
    const root = mkdtempSync(path.join(tmpdir(), "conver-build-guard-"));
    const deployment = createDeployment(["v0.0.99"]);
    try {
      const versionFile = createVersionFile(root, "0.0.101");
      const outfile = path.join(root, "conver.js");

      const result = runBuild({ versionFile, deployDir: deployment.root, outfile });

      assert.equal(result.status, 1);
      assert.match(result.stderr, /was not changed/);
      assert.equal(JSON.parse(readFileSync(versionFile, "utf8")).version, "0.0.101");
    } finally {
      deployment.cleanup();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rebuilds a prepared release without incrementing it again", () => {
    const root = mkdtempSync(path.join(tmpdir(), "conver-build-resume-"));
    const deployment = createDeployment(["v0.0.99"]);
    try {
      const versionFile = createVersionFile(root, "0.0.100");
      const outfile = path.join(root, "conver.js");

      const result = runBuild({ versionFile, deployDir: deployment.root, outfile });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /already prepared/);
      assert.equal(JSON.parse(readFileSync(versionFile, "utf8")).version, "0.0.100");
      assert.equal(
        JSON.parse(readFileSync(path.join(deployment.root, "VERSION.json"), "utf8")).version,
        "0.0.100",
      );
      const printed = spawnSync(process.execPath, [outfile, "--version"], { encoding: "utf8" });
      assert.equal(printed.status, 0, printed.stderr);
      assert.match(printed.stdout, /conver\.js v0\.0\.100/);
    } finally {
      deployment.cleanup();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
