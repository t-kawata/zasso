// runtime-dependencies.test.ts — the startup preflight that turns missing
// dependencies into a copy-pasteable command list.
//
// Every test injects the file system, the PATH and the platform. The preflight
// must be decidable without installing anything, touching the network, or
// depending on the machine's actual node_modules.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAcpInstallCommands,
  detectMissingRuntimeDependencies,
  formatRuntimeDependencyReport,
  readRuntimeManifest,
  resolveAcpBinary,
} from "./runtime-dependencies.js";
import type { RuntimeDependencyEnvironment } from "./runtime-dependencies.js";

const RUNTIME_DIR = "/project/.claude/scripts/conver";
const CLAUDE_DIR = "/project/.claude";

interface Fixture {
  files: Map<string, unknown>;
  executables: Set<string>;
}

function createFixture(): Fixture {
  return {
    files: new Map<string, unknown>([
      [
        `${RUNTIME_DIR}/package.json`,
        {
          type: "module",
          engines: { node: ">=22" },
          conver: {
            runtimeDependencies: {
              required: {
                "@agentclientprotocol/claude-agent-acp": {
                  version: "^0.102.0",
                  reason: "ACP agent binary",
                },
              },
              optional: {
                "terminal-image": {
                  version: "^5.0.1",
                  reason: "inline image rendering",
                },
              },
            },
          },
        },
      ],
      [
        `${CLAUDE_DIR}/package.json`,
        {
          type: "commonjs",
          dependencies: { ajv: "^8.20.0", "sql.js": "^1.14.2" },
        },
      ],
      [
        `${RUNTIME_DIR}/node_modules/@agentclientprotocol/claude-agent-acp/package.json`,
        { name: "@agentclientprotocol/claude-agent-acp" },
      ],
      [`${RUNTIME_DIR}/node_modules/terminal-image/package.json`, { name: "terminal-image" }],
      [`${CLAUDE_DIR}/node_modules/ajv/package.json`, { name: "ajv" }],
      [`${CLAUDE_DIR}/node_modules/sql.js/package.json`, { name: "sql.js" }],
    ]),
    executables: new Set<string>([
      `${RUNTIME_DIR}/node_modules/.bin/claude-agent-acp`,
      "/usr/local/bin/npm",
    ]),
  };
}

function environment(
  fixture: Fixture,
  overrides: Partial<RuntimeDependencyEnvironment> = {},
): RuntimeDependencyEnvironment {
  return {
    runtimeDirectory: RUNTIME_DIR,
    claudeDirectory: CLAUDE_DIR,
    platform: "darwin",
    nodeVersion: "26.0.0",
    pathEntries: ["/usr/local/bin"],
    exists: (candidate) => fixture.files.has(candidate) || fixture.executables.has(candidate),
    isExecutable: (candidate) => fixture.executables.has(candidate),
    readJson: (filePath) => {
      const value = fixture.files.get(filePath);
      if (value === undefined) throw new Error(`missing ${filePath}`);
      return value;
    },
    ...overrides,
  };
}

describe("readRuntimeManifest", () => {
  it("reads the node range and the required and optional declarations", () => {
    const fixture = createFixture();
    const manifest = readRuntimeManifest(RUNTIME_DIR, environment(fixture).readJson);

    assert.strictEqual(manifest.enginesNode, ">=22");
    assert.strictEqual(
      manifest.required["@agentclientprotocol/claude-agent-acp"]?.version,
      "^0.102.0",
    );
    assert.strictEqual(manifest.optional["terminal-image"]?.reason, "inline image rendering");
  });
});

describe("resolveAcpBinary", () => {
  it("prefers the local .bin shim", () => {
    const fixture = createFixture();
    const binary = resolveAcpBinary({
      runtimeDirectory: RUNTIME_DIR,
      platform: "darwin",
      pathEntries: [],
      exists: (candidate) => fixture.files.has(candidate) || fixture.executables.has(candidate),
      isExecutable: (candidate) => fixture.executables.has(candidate),
    });

    assert.strictEqual(binary, `${RUNTIME_DIR}/node_modules/.bin/claude-agent-acp`);
  });

  it("finds the shim installed beside .claude", () => {
    const fixture = createFixture();
    fixture.executables.delete(`${RUNTIME_DIR}/node_modules/.bin/claude-agent-acp`);
    fixture.executables.add(`${CLAUDE_DIR}/node_modules/.bin/claude-agent-acp`);

    const binary = resolveAcpBinary({
      runtimeDirectory: RUNTIME_DIR,
      platform: "darwin",
      pathEntries: [],
      exists: (candidate) => fixture.files.has(candidate) || fixture.executables.has(candidate),
      isExecutable: (candidate) => fixture.executables.has(candidate),
    });

    assert.strictEqual(binary, `${CLAUDE_DIR}/node_modules/.bin/claude-agent-acp`);
  });

  it("falls back to PATH", () => {
    const fixture = createFixture();
    fixture.executables.delete(`${RUNTIME_DIR}/node_modules/.bin/claude-agent-acp`);
    fixture.executables.add("/opt/acp/bin/claude-agent-acp");

    const binary = resolveAcpBinary({
      runtimeDirectory: RUNTIME_DIR,
      platform: "darwin",
      pathEntries: ["/opt/acp/bin"],
      exists: (candidate) => fixture.files.has(candidate) || fixture.executables.has(candidate),
      isExecutable: (candidate) => fixture.executables.has(candidate),
    });

    assert.strictEqual(binary, "/opt/acp/bin/claude-agent-acp");
  });

  it("accepts the .cmd shim on Windows", () => {
    const fixture = createFixture();
    fixture.executables.delete(`${RUNTIME_DIR}/node_modules/.bin/claude-agent-acp`);
    fixture.executables.add(`${RUNTIME_DIR}/node_modules/.bin/claude-agent-acp.cmd`);

    const binary = resolveAcpBinary({
      runtimeDirectory: RUNTIME_DIR,
      platform: "win32",
      pathEntries: [],
      exists: (candidate) => fixture.files.has(candidate) || fixture.executables.has(candidate),
      isExecutable: (candidate) => fixture.executables.has(candidate),
    });

    assert.strictEqual(binary, `${RUNTIME_DIR}/node_modules/.bin/claude-agent-acp.cmd`);
  });

  it("returns null when no candidate is executable", () => {
    const fixture = createFixture();
    fixture.executables.delete(`${RUNTIME_DIR}/node_modules/.bin/claude-agent-acp`);

    const binary = resolveAcpBinary({
      runtimeDirectory: RUNTIME_DIR,
      platform: "darwin",
      pathEntries: [],
      exists: (candidate) => fixture.files.has(candidate) || fixture.executables.has(candidate),
      isExecutable: (candidate) => fixture.executables.has(candidate),
    });

    assert.strictEqual(binary, null);
  });
});

describe("detectMissingRuntimeDependencies", () => {
  it("returns an empty report and no commands when everything resolves", () => {
    const fixture = createFixture();
    const report = detectMissingRuntimeDependencies(environment(fixture));

    assert.deepStrictEqual(report.missingRequired, []);
    assert.deepStrictEqual(report.missingOptional, []);
    assert.deepStrictEqual(report.commands, []);
    assert.strictEqual(report.blocked, false);
    assert.strictEqual(formatRuntimeDependencyReport(report), "");
  });

  it("reports only the missing Node version and only the Node command", () => {
    const fixture = createFixture();
    const report = detectMissingRuntimeDependencies(environment(fixture, { nodeVersion: "20.11.0" }));

    assert.strictEqual(report.node?.satisfied, false);
    assert.deepStrictEqual(report.commands, ["brew install node"]);
    assert.strictEqual(report.blocked, true);
    const text = formatRuntimeDependencyReport(report);
    assert.match(text, /Node\.js >=22/);
    assert.doesNotMatch(text, /npm install/);
  });

  it("names only the missing package in the .claude install command", () => {
    const fixture = createFixture();
    fixture.files.delete(`${CLAUDE_DIR}/node_modules/ajv/package.json`);

    const report = detectMissingRuntimeDependencies(environment(fixture));

    assert.deepStrictEqual(report.missingRequired.map((entry) => entry.name), ["ajv"]);
    assert.strictEqual(report.commands.length, 1);
    assert.match(report.commands[0]!, /cd '\/project\/\.claude'/);
    assert.match(report.commands[0]!, /'ajv@\^8\.20\.0'/);
    assert.doesNotMatch(report.commands[0]!, /sql\.js/);
  });

  it("treats ACP as missing when its binary cannot be resolved", () => {
    const fixture = createFixture();
    fixture.executables.delete(`${RUNTIME_DIR}/node_modules/.bin/claude-agent-acp`);

    const report = detectMissingRuntimeDependencies(environment(fixture));

    assert.ok(
      report.missingRequired.some(
        (entry) => entry.name === "@agentclientprotocol/claude-agent-acp",
      ),
    );
    assert.ok(
      report.commands.some((command) =>
        command.includes("@agentclientprotocol/claude-agent-acp@^0.102.0"),
      ),
    );
  });

  it("accepts an ACP binary on PATH even when the package is not installed locally", () => {
    const fixture = createFixture();
    fixture.files.delete(
      `${RUNTIME_DIR}/node_modules/@agentclientprotocol/claude-agent-acp/package.json`,
    );
    fixture.executables.delete(`${RUNTIME_DIR}/node_modules/.bin/claude-agent-acp`);
    fixture.executables.add("/opt/acp/bin/claude-agent-acp");

    const report = detectMissingRuntimeDependencies(
      environment(fixture, { pathEntries: ["/opt/acp/bin"] }),
    );

    assert.ok(
      !report.missingRequired.some(
        (entry) => entry.name === "@agentclientprotocol/claude-agent-acp",
      ),
    );
  });

  it("reports only the optional package as optional and does not block", () => {
    const fixture = createFixture();
    fixture.files.delete(`${RUNTIME_DIR}/node_modules/terminal-image/package.json`);

    const report = detectMissingRuntimeDependencies(environment(fixture));

    assert.deepStrictEqual(report.missingOptional.map((entry) => entry.name), ["terminal-image"]);
    assert.deepStrictEqual(report.missingRequired, []);
    assert.strictEqual(report.blocked, false);
    assert.ok(report.commands.some((command) => command.includes("terminal-image@^5.0.1")));
    assert.match(formatRuntimeDependencyReport(report), /Missing optional:/);
  });

  it("walks up to a parent node_modules when a package resolves there", () => {
    const fixture = createFixture();
    fixture.files.delete(`${CLAUDE_DIR}/node_modules/ajv/package.json`);
    fixture.files.set("/project/node_modules/ajv/package.json", { name: "ajv" });

    const report = detectMissingRuntimeDependencies(environment(fixture));

    assert.ok(!report.missingRequired.some((entry) => entry.name === "ajv"));
  });

  it("groups every missing package in one directory into one command", () => {
    const fixture = createFixture();
    fixture.files.delete(`${CLAUDE_DIR}/node_modules/ajv/package.json`);
    fixture.files.delete(`${CLAUDE_DIR}/node_modules/sql.js/package.json`);

    const report = detectMissingRuntimeDependencies(environment(fixture));

    const commands = report.commands.filter((command) => command.includes("cd '/project/.claude'"));
    assert.strictEqual(commands.length, 1);
    assert.match(commands[0]!, /'ajv@\^8\.20\.0'/);
    assert.match(commands[0]!, /'sql\.js@\^1\.14\.2'/);
  });

  it("quotes a path that contains spaces and an apostrophe", () => {
    const runtimeDirectory = "/project's dir/.claude/scripts/conver";
    const fixture = createFixture();
    fixture.files.set(`${runtimeDirectory}/package.json`, fixture.files.get(`${RUNTIME_DIR}/package.json`));
    fixture.files.delete(
      `${RUNTIME_DIR}/node_modules/@agentclientprotocol/claude-agent-acp/package.json`,
    );
    fixture.executables.delete(`${RUNTIME_DIR}/node_modules/.bin/claude-agent-acp`);

    const report = detectMissingRuntimeDependencies(environment(fixture, { runtimeDirectory }));
    const acpCommand = report.commands.find((command) =>
      command.includes("@agentclientprotocol/claude-agent-acp@^0.102.0"),
    );

    assert.ok(acpCommand !== undefined);
    assert.ok(acpCommand.includes("cd '/project'\\''s dir/.claude/scripts/conver'"));
  });

  it("uses cd /d and a Windows executable name on win32", () => {
    const fixture = createFixture();
    fixture.executables.delete(`${RUNTIME_DIR}/node_modules/.bin/claude-agent-acp`);

    const report = detectMissingRuntimeDependencies(
      environment(fixture, { platform: "win32", nodeVersion: "20.0.0" }),
    );
    const acpCommand = report.commands.find((command) =>
      command.includes("@agentclientprotocol/claude-agent-acp@^0.102.0"),
    );

    assert.ok(report.commands.includes("winget install OpenJS.NodeJS.LTS"));
    assert.ok(acpCommand !== undefined);
    assert.ok(acpCommand.startsWith(`cd /d "${RUNTIME_DIR}"`));
  });

  it("blocks with a clear error when the runtime manifest cannot be read", () => {
    const fixture = createFixture();
    fixture.files.set(`${RUNTIME_DIR}/package.json`, "{not json");

    const report = detectMissingRuntimeDependencies(environment(fixture));

    assert.strictEqual(report.blocked, true);
    assert.ok(report.manifestError !== null);
    assert.match(formatRuntimeDependencyReport(report), /runtime dependency manifest/);
  });

  it("blocks when a required declaration is not an object", () => {
    const fixture = createFixture();
    fixture.files.set(`${RUNTIME_DIR}/package.json`, {
      engines: { node: ">=22" },
      conver: {
        runtimeDependencies: {
          required: { "@agentclientprotocol/claude-agent-acp": "not-an-object" },
          optional: {},
        },
      },
    });

    const report = detectMissingRuntimeDependencies(environment(fixture));

    assert.strictEqual(report.blocked, true);
    assert.ok(report.manifestError?.includes("must be an object"));
  });

  it("notes an unreadable .claude manifest without blocking", () => {
    const fixture = createFixture();
    fixture.files.delete(`${CLAUDE_DIR}/package.json`);

    const report = detectMissingRuntimeDependencies(environment(fixture));

    assert.strictEqual(report.claudeManifestMissing, true);
    assert.strictEqual(report.blocked, false);
    assert.match(formatRuntimeDependencyReport(report), /\.claude\/package\.json/);
  });
});

describe("buildAcpInstallCommands", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const runtimeDirectory = path.resolve(here, "..", ".claude", "scripts", "conver");

  it("uses the declared ACP version and the safe npm flags", () => {
    const [command] = buildAcpInstallCommands(runtimeDirectory, "darwin");

    assert.ok(command !== undefined);
    assert.match(command, /@agentclientprotocol\/claude-agent-acp@\^0\.102\.0/);
    assert.match(command, /--no-save/);
    assert.match(command, /--ignore-scripts/);
  });

  it("falls back to the unversioned package when the declaration is unreadable", () => {
    const [command] = buildAcpInstallCommands("/nonexistent-runtime-directory", "darwin");

    assert.ok(command !== undefined);
    assert.match(command, /@agentclientprotocol\/claude-agent-acp@latest/);
  });
});

describe("the shipped runtime manifest", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const toolRoot = path.resolve(here, "..");

  function readJson(filePath: string): unknown {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  }

  it("matches the tool manifest and marked-terminal's terminal-image range", () => {
    const runtimeManifest = readJson(
      path.join(toolRoot, ".claude", "scripts", "conver", "package.json"),
    ) as {
      engines?: { node?: string };
      conver?: {
        runtimeDependencies?: {
          required?: Record<string, { version?: string }>;
          optional?: Record<string, { version?: string }>;
        };
      };
    };
    const toolManifest = readJson(path.join(toolRoot, "package.json")) as {
      dependencies?: Record<string, string>;
    };
    const markedTerminal = readJson(
      path.join(toolRoot, "node_modules", "marked-terminal", "package.json"),
    ) as { dependencies?: Record<string, string> };

    assert.strictEqual(runtimeManifest.engines?.node, ">=22");
    assert.strictEqual(
      runtimeManifest.conver?.runtimeDependencies?.required?.[
        "@agentclientprotocol/claude-agent-acp"
      ]?.version,
      toolManifest.dependencies?.["@agentclientprotocol/claude-agent-acp"],
    );
    assert.strictEqual(
      runtimeManifest.conver?.runtimeDependencies?.optional?.["terminal-image"]?.version,
      markedTerminal.dependencies?.["terminal-image"],
    );
  });
});
