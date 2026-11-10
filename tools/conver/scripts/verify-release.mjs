#!/usr/bin/env node
// verify-release.mjs — prove the deployment is ready for one release push.
//
// `make push` runs this before staging anything. It refuses a version that is
// two or more steps ahead of the newest versioned commit, a version that has
// not been prepared at all, and a bundle whose --version disagrees with
// VERSION.json. It never writes to VERSION.json: the increment belongs to
// build-conver, and this check exists so push cannot perform a second one.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import {
  bumpPatch,
  latestCommitVersion,
  readVersionFile,
  versionDistance,
} from "./version.mjs";

function parseArguments(argv) {
  const options = { versionFile: "VERSION.json", converJs: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith("--version-file=")) {
      options.versionFile = argument.slice("--version-file=".length);
    } else if (argument === "--version-file") {
      index += 1;
      if (index >= argv.length) throw new Error("--version-file requires a path");
      options.versionFile = argv[index];
    } else if (argument.startsWith("--conver-js=")) {
      options.converJs = argument.slice("--conver-js=".length);
    } else if (argument === "--conver-js") {
      index += 1;
      if (index >= argv.length) throw new Error("--conver-js requires a path");
      options.converJs = argv[index];
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

/** Prefer a root conver.js; otherwise the installed tree is the deployment. */
function resolveConverJs(explicitPath) {
  if (explicitPath !== null) return explicitPath;
  return fs.existsSync("conver.js") ? "conver.js" : ".claude/scripts/conver/conver.js";
}

function readBundleVersion(converJs) {
  const result = spawnSync(process.execPath, [converJs, "--version"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const detail = (result.stderr || "").trim();
    throw new Error(`node ${converJs} --version failed${detail === "" ? "" : `: ${detail}`}`);
  }
  const output = (result.stdout || "").trim();
  const match = /(v\d+\.\d+\.\d+)\s*$/.exec(output);
  if (match === null) {
    throw new Error(`${converJs} --version did not end with vW.x.y: ${JSON.stringify(output)}`);
  }
  return match[1];
}

function verifyRelease() {
  const options = parseArguments(process.argv.slice(2));
  const converJs = resolveConverJs(options.converJs);
  const current = readVersionFile(options.versionFile);
  const latest = latestCommitVersion(process.cwd());
  if (latest === null) {
    throw new Error("the latest commit subject does not contain vW.x.y");
  }

  // The only valid state is current == latest + 1. A greater value means a
  // previous build advanced twice; a smaller one means nothing was prepared.
  const expected = bumpPatch(latest);
  const distance = versionDistance(current, expected);
  if (distance > 0) {
    throw new Error(
      `VERSION.json ${current} is more than one step ahead of the latest commit ` +
        `v${latest}; not incrementing`,
    );
  }
  if (distance < 0) {
    throw new Error(
      `VERSION.json ${current} is not the next version after v${latest}; ` +
        "run make build-conver first",
    );
  }

  const bundleVersion = readBundleVersion(converJs);
  if (bundleVersion !== `v${current}`) {
    throw new Error(
      `${converJs} reports ${bundleVersion} but VERSION.json is v${current}; ` +
        "run make build-conver and reinstall",
    );
  }

  process.stdout.write(`Release version: v${current} (latest commit v${latest})\n`);
}

try {
  verifyRelease();
} catch (error) {
  process.stderr.write(`[ABORT] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
