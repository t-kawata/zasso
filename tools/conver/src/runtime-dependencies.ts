// runtime-dependencies.ts — diagnose what an installed conver tree is missing.
//
// install.js resolves the npm roots it knows about, but several paths leave a
// target incomplete: --no-install-deps, a pre-existing node_modules the installer
// refuses to modify, a copied tree, or an offline install. This module is the
// runtime safety net. It reads the declaration that ships beside conver.js,
// checks each entry, and returns only the commands that would resolve what is
// actually missing. It never installs anything and never touches the network.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ACP_BINARY_NAME = "claude-agent-acp";
export const ACP_PACKAGE_NAME = "@agentclientprotocol/claude-agent-acp";
export const NPM_INSTALL_ARGUMENTS = [
  "install",
  "--no-save",
  "--no-audit",
  "--no-fund",
  "--ignore-scripts",
] as const;

const ACP_INSTALL_REASON = "ACP agent binary";
const NODE_VERSION_PATTERN = /(\d+)/;
const WINDOWS_EXECUTABLE_SUFFIXES = [".cmd", ".exe", ""] as const;

export interface RuntimePackageEntry {
  name: string;
  version: string;
  reason: string;
  installDirectory: string;
}

export interface NodeRequirement {
  range: string;
  current: string;
  satisfied: boolean;
}

export interface RuntimeDependencyReport {
  node: NodeRequirement | null;
  missingRequired: RuntimePackageEntry[];
  missingOptional: RuntimePackageEntry[];
  npmAvailable: boolean;
  claudeManifestMissing: boolean;
  manifestError: string | null;
  commands: string[];
  blocked: boolean;
}

/**
 * The file-system facts the diagnosis needs. Every field is injected so the
 * preflight can be decided in a test without reading the machine's real tree.
 */
export interface RuntimeDependencyEnvironment {
  runtimeDirectory: string;
  claudeDirectory: string;
  platform: NodeJS.Platform;
  nodeVersion: string;
  pathEntries: string[];
  exists: (candidate: string) => boolean;
  isExecutable: (candidate: string) => boolean;
  readJson: (filePath: string) => unknown;
}

export interface RuntimeDependencyCheck {
  blocked: boolean;
  message: string;
}

/** Raised when the ACP agent cannot be located at spawn time. */
export class MissingRuntimeDependencyError extends Error {
  constructor(
    message: string,
    readonly commands: string[],
  ) {
    super(message);
    this.name = "MissingRuntimeDependencyError";
  }
}

export interface RuntimeManifest {
  enginesNode: string | null;
  required: Record<string, { version: string; reason: string }>;
  optional: Record<string, { version: string; reason: string }>;
}

interface ClaudeDependencies {
  dependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
}

function readJsonObject(filePath: string, readJson: (filePath: string) => unknown): Record<string, unknown> {
  const document = readJson(filePath);
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    throw new Error(`${filePath} is not a JSON object`);
  }
  return document as Record<string, unknown>;
}

function readPackageMap(
  value: unknown,
  field: string,
  manifestPath: string,
): Record<string, { version: string; reason: string }> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${manifestPath}: conver.runtimeDependencies.${field} must be an object`);
  }
  const normalized: Record<string, { version: string; reason: string }> = {};
  for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${manifestPath}: conver.runtimeDependencies.${field}.${name} must be an object`);
    }
    const version = (entry as { version?: unknown }).version;
    const reason = (entry as { reason?: unknown }).reason;
    if (typeof version !== "string" || version.length === 0) {
      throw new Error(
        `${manifestPath}: conver.runtimeDependencies.${field}.${name}.version must be a non-empty string`,
      );
    }
    normalized[name] = {
      version,
      reason: typeof reason === "string" && reason.length > 0 ? reason : "runtime dependency",
    };
  }
  return normalized;
}

/**
 * Read the declaration that ships beside conver.js.
 *
 * A manifest without `conver.runtimeDependencies` is a broken installation, not
 * an empty one: the caller reports the reason instead of silently checking
 * nothing.
 */
export function readRuntimeManifest(
  runtimeDirectory: string,
  readJson: (filePath: string) => unknown,
): RuntimeManifest {
  const manifestPath = path.join(runtimeDirectory, "package.json");
  const document = readJsonObject(manifestPath, readJson);
  const engines = document.engines;
  const enginesNode =
    typeof engines === "object" && engines !== null && !Array.isArray(engines)
      ? (engines as { node?: unknown }).node
      : undefined;
  const conver = document.conver;
  const runtimeDependencies =
    typeof conver === "object" && conver !== null && !Array.isArray(conver)
      ? (conver as { runtimeDependencies?: unknown }).runtimeDependencies
      : undefined;
  if (
    typeof runtimeDependencies !== "object" ||
    runtimeDependencies === null ||
    Array.isArray(runtimeDependencies)
  ) {
    throw new Error(`${manifestPath} does not declare conver.runtimeDependencies`);
  }
  const declaration = runtimeDependencies as { required?: unknown; optional?: unknown };
  return {
    enginesNode: typeof enginesNode === "string" ? enginesNode : null,
    required: readPackageMap(declaration.required, "required", manifestPath),
    optional: readPackageMap(declaration.optional, "optional", manifestPath),
  };
}

function readStringMap(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [name, version] of Object.entries(value as Record<string, unknown>)) {
    if (typeof version === "string") result[name] = version;
  }
  return result;
}

/**
 * Read the dependency declarations of the installed `.claude` tree.
 *
 * A missing or malformed manifest is reported separately; it must not hide the
 * runtime packages conver.js can still diagnose on its own.
 */
function readClaudeDependencies(
  claudeDirectory: string,
  readJson: (filePath: string) => unknown,
): ClaudeDependencies | null {
  try {
    const document = readJsonObject(path.join(claudeDirectory, "package.json"), readJson);
    return {
      dependencies: readStringMap(document.dependencies),
      optionalDependencies: readStringMap(document.optionalDependencies),
    };
  } catch {
    return null;
  }
}

/**
 * Locate a package by walking up the directory tree the way Node does.
 *
 * An ESM-only package whose `exports` map hides its root is still installed;
 * testing the package.json on disk avoids a false "missing" report.
 */
function isPackageInstalled(
  packageName: string,
  fromDirectory: string,
  exists: (candidate: string) => boolean,
): boolean {
  let current = path.resolve(fromDirectory);
  for (;;) {
    if (exists(path.join(current, "node_modules", packageName, "package.json"))) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function executableSuffixes(platform: NodeJS.Platform): readonly string[] {
  return platform === "win32" ? WINDOWS_EXECUTABLE_SUFFIXES : [""];
}

/**
 * Find the ACP agent executable.
 *
 * The local `.bin` directories come before PATH so a project-local install is
 * preferred over a global one. The four ancestors cover the installed layout:
 * `.claude/scripts/conver`, `.claude/scripts`, `.claude`, and the project root.
 */
export function resolveAcpBinary(options: {
  runtimeDirectory: string;
  platform: NodeJS.Platform;
  pathEntries: readonly string[];
  exists: (candidate: string) => boolean;
  isExecutable: (candidate: string) => boolean;
}): string | null {
  const suffixes = executableSuffixes(options.platform);
  const directories = [
    path.join(options.runtimeDirectory, "node_modules", ".bin"),
    path.join(options.runtimeDirectory, "..", "node_modules", ".bin"),
    path.join(options.runtimeDirectory, "..", "..", "node_modules", ".bin"),
    path.join(options.runtimeDirectory, "..", "..", "..", "node_modules", ".bin"),
    ...options.pathEntries,
  ];
  for (const directory of directories) {
    for (const suffix of suffixes) {
      const candidate = path.join(directory, `${ACP_BINARY_NAME}${suffix}`);
      if (options.exists(candidate) && options.isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

/** Resolve the ACP agent for the current process and installed tree. */
export function resolveAcpBinaryForProcess(runtimeDirectory: string): string | null {
  const platform = process.platform;
  return resolveAcpBinary({
    runtimeDirectory,
    platform,
    pathEntries: (process.env.PATH ?? "").split(path.delimiter).filter((entry) => entry.length > 0),
    exists: fs.existsSync,
    isExecutable: (candidate) => executableIsAvailable(candidate, platform),
  });
}

function isCommandAvailable(
  command: string,
  environment: RuntimeDependencyEnvironment,
): boolean {
  const suffixes = executableSuffixes(environment.platform);
  return environment.pathEntries.some((directory) =>
    suffixes.some((suffix) => {
      const candidate = path.join(directory, `${command}${suffix}`);
      return environment.exists(candidate) && environment.isExecutable(candidate);
    }),
  );
}

function satisfiesNodeVersion(current: string, range: string): boolean {
  const match = NODE_VERSION_PATTERN.exec(range);
  if (match === null) return true;
  const minimumMajor = Number(match[1]);
  const currentMajor = Number(current.replace(/^v/, "").split(".")[0]);
  return Number.isFinite(currentMajor) && currentMajor >= minimumMajor;
}

function buildPackageEntries(
  manifest: RuntimeManifest | null,
  claudeDependencies: ClaudeDependencies | null,
  environment: RuntimeDependencyEnvironment,
  required: boolean,
): RuntimePackageEntry[] {
  const entries: RuntimePackageEntry[] = [];
  const seen = new Set<string>();
  const add = (
    name: string,
    version: string,
    reason: string,
    installDirectory: string,
  ): void => {
    if (seen.has(name)) return;
    seen.add(name);
    entries.push({ name, version, reason, installDirectory });
  };

  if (manifest !== null) {
    const declared = required ? manifest.required : manifest.optional;
    for (const [name, entry] of Object.entries(declared)) {
      add(name, entry.version, entry.reason, environment.runtimeDirectory);
    }
  }
  if (claudeDependencies !== null) {
    const declared = required
      ? claudeDependencies.dependencies
      : claudeDependencies.optionalDependencies;
    for (const [name, version] of Object.entries(declared)) {
      add(name, version, "installed ticket scripts", environment.claudeDirectory);
    }
  }
  return entries;
}

function shellQuote(value: string, platform: NodeJS.Platform): string {
  if (platform === "win32") return `"${value.replace(/"/g, '""')}"`;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildInstallCommand(
  directory: string,
  entries: readonly RuntimePackageEntry[],
  platform: NodeJS.Platform,
): string {
  const specs = entries
    .map((entry) => {
      const specifier = entry.version.length > 0 ? `${entry.name}@${entry.version}` : entry.name;
      return shellQuote(specifier, platform);
    })
    .join(" ");
  const changeDirectory =
    platform === "win32"
      ? `cd /d ${shellQuote(directory, platform)}`
      : `cd ${shellQuote(directory, platform)}`;
  return `${changeDirectory} && npm ${NPM_INSTALL_ARGUMENTS.join(" ")} ${specs}`;
}

function buildPackageCommands(
  entries: readonly RuntimePackageEntry[],
  platform: NodeJS.Platform,
): string[] {
  const byDirectory = new Map<string, RuntimePackageEntry[]>();
  for (const entry of entries) {
    const group = byDirectory.get(entry.installDirectory);
    if (group === undefined) byDirectory.set(entry.installDirectory, [entry]);
    else group.push(entry);
  }
  return [...byDirectory.entries()].map(([directory, group]) =>
    buildInstallCommand(directory, group, platform),
  );
}

function nodeInstallCommand(platform: NodeJS.Platform, range: string): string {
  switch (platform) {
    case "darwin":
      return "brew install node";
    case "win32":
      return "winget install OpenJS.NodeJS.LTS";
    default:
      return `# install Node.js ${range} from https://nodejs.org/en/download or your distribution's package manager`;
  }
}

/**
 * Diagnose the installed tree.
 *
 * Only entries that are actually absent produce a command. The ACP entry is
 * special: the package can be installed while its `.bin` shim is not, and the
 * runtime needs the executable, so the binary resolution decides.
 */
export function detectMissingRuntimeDependencies(
  environment: RuntimeDependencyEnvironment,
): RuntimeDependencyReport {
  let manifest: RuntimeManifest | null = null;
  let manifestError: string | null = null;
  try {
    manifest = readRuntimeManifest(environment.runtimeDirectory, environment.readJson);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    manifestError =
      `cannot read the runtime dependency manifest: ${detail}; ` +
      "re-run install.js to refresh the installed tree";
  }

  const claudeDependencies = readClaudeDependencies(environment.claudeDirectory, environment.readJson);
  const claudeManifestMissing = claudeDependencies === null;

  const node: NodeRequirement | null =
    manifest?.enginesNode === null || manifest === null
      ? null
      : {
          range: manifest.enginesNode,
          current: environment.nodeVersion,
          satisfied: satisfiesNodeVersion(environment.nodeVersion, manifest.enginesNode),
        };

  const requiredEntries = buildPackageEntries(
    manifest,
    claudeDependencies,
    environment,
    true,
  );
  const optionalEntries = buildPackageEntries(
    manifest,
    claudeDependencies,
    environment,
    false,
  );

  const acpBinary = resolveAcpBinary({
    runtimeDirectory: environment.runtimeDirectory,
    platform: environment.platform,
    pathEntries: environment.pathEntries,
    exists: environment.exists,
    isExecutable: environment.isExecutable,
  });
  const missingRequired = requiredEntries.filter((entry) =>
    entry.name === ACP_PACKAGE_NAME
      ? acpBinary === null
      : !isPackageInstalled(entry.name, entry.installDirectory, environment.exists),
  );
  const missingOptional = optionalEntries.filter(
    (entry) => !isPackageInstalled(entry.name, entry.installDirectory, environment.exists),
  );

  const commands: string[] = [];
  if (node !== null && !node.satisfied) {
    commands.push(nodeInstallCommand(environment.platform, node.range));
  }
  commands.push(...buildPackageCommands(missingRequired, environment.platform));
  commands.push(...buildPackageCommands(missingOptional, environment.platform));

  return {
    node,
    missingRequired,
    missingOptional,
    npmAvailable: isCommandAvailable("npm", environment),
    claudeManifestMissing,
    manifestError,
    commands,
    blocked:
      manifestError !== null ||
      (node !== null && !node.satisfied) ||
      missingRequired.length > 0,
  };
}

/** Render only the sections that carry a finding. */
export function formatRuntimeDependencyReport(report: RuntimeDependencyReport): string {
  const node = report.node;
  const nodeMissing = node !== null && !node.satisfied;
  const hasFinding =
    nodeMissing ||
    report.missingRequired.length > 0 ||
    report.missingOptional.length > 0 ||
    report.manifestError !== null ||
    report.claudeManifestMissing;
  if (!hasFinding) return "";

  const lines: string[] = ["conver.js — runtime dependency check", ""];
  if (report.manifestError !== null) {
    lines.push(`! ${report.manifestError}`, "");
  }
  const requiredLines: string[] = [];
  if (node !== null && !node.satisfied) {
    requiredLines.push(`  - Node.js ${node.range} (current: ${node.current})`);
  }
  for (const entry of report.missingRequired) {
    requiredLines.push(`  - ${entry.name}@${entry.version} (${entry.reason})`);
  }
  if (requiredLines.length > 0) {
    lines.push("Missing required:", ...requiredLines, "");
  }
  if (report.missingOptional.length > 0) {
    lines.push(
      "Missing optional:",
      ...report.missingOptional.map(
        (entry) => `  - ${entry.name}@${entry.version} (${entry.reason})`,
      ),
      "",
    );
  }
  if (report.claudeManifestMissing) {
    lines.push(
      "! .claude/package.json cannot be read, so its declared dependencies were not checked.",
      "",
    );
  }
  if (report.commands.length > 0) {
    lines.push("Run these commands, then re-run conver.js:", "", ...report.commands, "");
  }
  if (!report.npmAvailable && report.commands.some((command) => command.includes("npm "))) {
    lines.push("! npm is not available on PATH; install Node.js (which bundles npm) first.", "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function executableIsAvailable(candidate: string, platform: NodeJS.Platform): boolean {
  if (platform === "win32") return fs.existsSync(candidate);
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Build the environment from the process and the installed tree. */
function processEnvironment(
  overrides: Partial<RuntimeDependencyEnvironment>,
): RuntimeDependencyEnvironment {
  const runtimeDirectory =
    overrides.runtimeDirectory ?? path.dirname(fileURLToPath(import.meta.url));
  const platform = overrides.platform ?? process.platform;
  return {
    runtimeDirectory,
    claudeDirectory: overrides.claudeDirectory ?? path.resolve(runtimeDirectory, "..", ".."),
    platform,
    nodeVersion: overrides.nodeVersion ?? process.versions.node,
    pathEntries:
      overrides.pathEntries ??
      (process.env.PATH ?? "").split(path.delimiter).filter((entry) => entry.length > 0),
    exists: overrides.exists ?? fs.existsSync,
    isExecutable:
      overrides.isExecutable ?? ((candidate: string) => executableIsAvailable(candidate, platform)),
    readJson:
      overrides.readJson ??
      ((filePath: string) => JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown),
  };
}

/** Return the exact commands that resolve a missing ACP agent. */
export function buildAcpInstallCommands(
  runtimeDirectory: string,
  platform: NodeJS.Platform,
): string[] {
  let version = "latest";
  try {
    const manifest = readRuntimeManifest(runtimeDirectory, (filePath) =>
      JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown,
    );
    version = manifest.required[ACP_PACKAGE_NAME]?.version ?? version;
  } catch {
    // The command without a version is still a valid resolution when the
    // declaration itself is unreadable.
  }
  return [
    buildInstallCommand(
      runtimeDirectory,
      [
        {
          name: ACP_PACKAGE_NAME,
          version,
          reason: ACP_INSTALL_REASON,
          installDirectory: runtimeDirectory,
        },
      ],
      platform,
    ),
  ];
}

/**
 * Run the preflight and render its report. A failure inside the diagnosis is
 * itself a blocker: conver.js cannot claim the environment is ready.
 */
export function checkRuntimeDependencies(
  overrides: Partial<RuntimeDependencyEnvironment> = {},
): RuntimeDependencyCheck {
  try {
    const report = detectMissingRuntimeDependencies(processEnvironment(overrides));
    const message = formatRuntimeDependencyReport(report);
    if (!report.blocked) return { blocked: false, message };
    const separator = message === "" || message.endsWith("\n") ? "" : "\n";
    return {
      blocked: true,
      message:
        `${message}${separator}` +
        "conver.js — the runtime environment is not ready; fix the list above and re-run.\n",
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      blocked: true,
      message: `conver.js — runtime dependency check failed: ${detail}\n`,
    };
  }
}
