#!/usr/bin/env node
// build-conver.mjs — build conver.js and, when asked, prepare exactly one release.
//
// `make build-conver` passes --increment. The increment is written only after
// the bundle builds, and only when the result is exactly one step past the
// deployment repository's newest versioned commit. The same VERSION.json is
// copied to the deployment so `make push` can verify the prepared value.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  latestCommitVersion,
  planIncrement,
  readVersionFile,
  writeVersionFile,
} from "./version.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DEPLOY_DIR =
  process.env.CONVER_DEPLOY_DIR ?? path.join(os.homedir(), "shyme", "conver");

function parseArguments(argv) {
  const options = {
    increment: false,
    outfile: path.join(PROJECT_ROOT, "dist", "conver.js"),
    versionFile: path.join(PROJECT_ROOT, "VERSION.json"),
    deployDir: DEFAULT_DEPLOY_DIR,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--increment") {
      options.increment = true;
    } else if (argument.startsWith("--outfile=")) {
      options.outfile = argument.slice("--outfile=".length);
    } else if (argument === "--outfile") {
      index += 1;
      if (index >= argv.length) throw new Error("--outfile requires a path");
      options.outfile = argv[index];
    } else if (argument.startsWith("--version-file=")) {
      options.versionFile = argument.slice("--version-file=".length);
    } else if (argument === "--version-file") {
      index += 1;
      if (index >= argv.length) throw new Error("--version-file requires a path");
      options.versionFile = argv[index];
    } else if (argument.startsWith("--deploy-dir=")) {
      options.deployDir = argument.slice("--deploy-dir=".length);
    } else if (argument === "--deploy-dir") {
      index += 1;
      if (index >= argv.length) throw new Error("--deploy-dir requires a path");
      options.deployDir = argv[index];
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  options.outfile = path.resolve(PROJECT_ROOT, options.outfile);
  options.versionFile = path.resolve(PROJECT_ROOT, options.versionFile);
  options.deployDir = path.resolve(options.deployDir);
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const currentVersion = readVersionFile(options.versionFile);
  let targetVersion = currentVersion;
  let shouldWriteVersion = false;

  if (options.increment) {
    const latest = latestCommitVersion(options.deployDir);
    const plan = planIncrement({ current: currentVersion, latest });
    if (!plan.allowed) {
      process.stderr.write(`[build-conver] ${plan.reason}; VERSION.json was not changed\n`);
      process.exitCode = 1;
      return;
    }
    if (latest === null) {
      process.stderr.write(`[build-conver] warning: ${plan.reason}\n`);
    } else if (plan.reason !== "") {
      process.stdout.write(`[build-conver] ${plan.reason}\n`);
    }
    targetVersion = plan.next;
    shouldWriteVersion = true;
  }

  fs.mkdirSync(path.dirname(options.outfile), { recursive: true });
  await build({
    entryPoints: [path.join(PROJECT_ROOT, "src", "entry.ts")],
    bundle: true,
    platform: "node",
    external: ["node:*", "terminal-image"],
    outfile: options.outfile,
    format: "esm",
    minify: true,
    logLevel: "silent",
    define: {
      __CONVER_VERSION__: JSON.stringify(`v${targetVersion}`),
    },
  });

  if (shouldWriteVersion) {
    writeVersionFile(options.versionFile, targetVersion);
    if (fs.existsSync(options.deployDir)) {
      writeVersionFile(path.join(options.deployDir, "VERSION.json"), targetVersion);
      process.stdout.write(
        `[build-conver] copied VERSION.json ${targetVersion} to ${options.deployDir}\n`,
      );
    } else {
      process.stderr.write(
        `[build-conver] warning: ${options.deployDir} does not exist; ` +
          "VERSION.json was not copied\n",
      );
    }
  }

  process.stdout.write(`[build-conver] built v${targetVersion} -> ${options.outfile}\n`);
}

main().catch((error) => {
  process.stderr.write(`[build-conver] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
