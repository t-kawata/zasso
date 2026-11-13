// version.mjs — the single implementation of the release version rules.
//
// Both the build (which prepares the next version) and the deployment's push
// verification (which must not advance it again) use these functions. A second
// spelling of the carry rule or the version comparison would let the prepared
// version and the committed version disagree.
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const MESSAGE_VERSION_PATTERN = /v(\d+\.\d+\.\d+)/;
const CARRY_BASE = 1000;

/** Parse W.x.y, rejecting the `v` prefix and any other shape. */
export function parseVersion(value, label = "version") {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string, found ${typeof value}`);
  }
  const match = VERSION_PATTERN.exec(value);
  if (match === null) {
    throw new Error(`${label}: expected W.x.y, found '${value}'`);
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

/**
 * Advance the patch by one, carrying at 1000.
 *
 * The carry base matches the deployment Makefile's bump_patch rule so the two
 * release paths cannot produce different numbers for the same starting value.
 */
export function bumpPatch(value) {
  const { major, minor, patch } = parseVersion(value);
  let nextMajor = major;
  let nextMinor = minor;
  let nextPatch = patch + 1;
  if (nextPatch > CARRY_BASE - 1) {
    nextPatch = 0;
    nextMinor += 1;
  }
  if (nextMinor > CARRY_BASE - 1) {
    nextMinor = 0;
    nextMajor += 1;
  }
  return formatVersion({ major: nextMajor, minor: nextMinor, patch: nextPatch });
}

/** A numeric distance on the same base-1000 scale the carry rule uses. */
export function versionDistance(left, right) {
  const a = typeof left === "string" ? parseVersion(left) : left;
  const b = typeof right === "string" ? parseVersion(right) : right;
  return (
    (a.major - b.major) * CARRY_BASE * CARRY_BASE +
    (a.minor - b.minor) * CARRY_BASE +
    (a.patch - b.patch)
  );
}

export function compareVersions(left, right) {
  const distance = versionDistance(left, right);
  if (distance === 0) return 0;
  return distance > 0 ? 1 : -1;
}

/** Read the `version` field and validate it before it reaches a build. */
export function readVersionFile(filePath) {
  const document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return formatVersion(parseVersion(document.version, `${filePath} version`));
}

/** Write the existing 2-space JSON format so the diff is a single value. */
export function writeVersionFile(filePath, version) {
  parseVersion(version);
  fs.writeFileSync(filePath, `${JSON.stringify({ version }, null, 2)}\n`);
}

/** The first vW.x.y in a commit subject, without the `v`, or null. */
export function parseVersionFromMessage(message) {
  if (typeof message !== "string") return null;
  const match = MESSAGE_VERSION_PATTERN.exec(message);
  return match === null ? null : match[1];
}

function defaultRunGit(args, cwd) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

/**
 * Read the newest commit subject. `%s` is deliberate: a version mentioned in
 * the body of an unrelated commit must not be mistaken for the release.
 */
export function latestCommitVersion(repoDir, runGit = defaultRunGit) {
  const result = runGit(["log", "-1", "--pretty=%s"], repoDir);
  if (result.status !== 0) return null;
  return parseVersionFromMessage(result.stdout);
}

/**
 * Decide whether the build may advance VERSION.json.
 *
 * `current` is the version file being incremented; `latest` is the newest
 * versioned commit in the deployment repository. The allowed results are the
 * already-prepared version (when an interrupted release is resumed) and exactly
 * one step past that commit. Anything further ahead is refused before anything
 * is written.
 */
export function planIncrement({ current, latest }) {
  if (latest === null || latest === undefined) {
    return {
      next: bumpPatch(current),
      allowed: true,
      reason:
        "the deployment repository has no versioned commit; the increment was not checked",
    };
  }
  // A previous build-conver may have prepared the next version and then been
  // interrupted before distribution. Rebuilding that same version resumes the
  // release; incrementing again would skip a version and is refused below.
  if (versionDistance(current, latest) === 1) {
    return {
      next: current,
      allowed: true,
      reason: `a release at ${current} is already prepared; rebuilding it`,
    };
  }
  const next = bumpPatch(current);
  const distance = versionDistance(next, latest);
  if (distance >= 2) {
    return {
      next,
      allowed: false,
      reason:
        `incrementing ${current} to ${next} would be ${distance} versions ahead ` +
        `of the latest commit v${latest}`,
    };
  }
  if (distance <= 0) {
    return {
      next,
      allowed: false,
      reason:
        `incrementing ${current} to ${next} would not advance past the latest commit ` +
        `v${latest}`,
    };
  }
  return { next, allowed: true, reason: "" };
}
