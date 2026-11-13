import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEPENDENCY_SECTIONS = new Set(['dependencies', 'dev-dependencies', 'build-dependencies']);

export function parseCargoToml(text, packageName = 'workspace-member') {
  const dependencies = [];
  let section = '';
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).trim();
      continue;
    }
    if (!DEPENDENCY_SECTIONS.has(section)) continue;
    const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!match) continue;
    dependencies.push(parseDependency(match[1], match[2], section));
  }
  return { packages: [{ name: packageName, dependencies }] };
}

export function readCargoMetadata({ root, locked = true }) {
  const manifest = join(root, 'Cargo.toml');
  if (!existsSync(manifest)) return { packages: [] };
  const args = ['metadata', '--format-version', '1', '--no-deps'];
  if (locked) args.splice(1, 0, '--locked');
  try {
    const output = execFileSync('cargo', args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return normalizeCargoMetadata(JSON.parse(output));
  } catch {
    return parseCargoToml(readFileSync(manifest, 'utf8'), root);
  }
}

export function checkDependencies({ metadata, policy }) {
  const requirements = policy?.interfaces ?? {};
  const dependencies = (metadata?.packages ?? []).flatMap((pkg) => pkg.dependencies ?? []);
  const byName = new Map(dependencies.map((dependency) => [dependency.name, dependency]));
  const findings = [];

  for (const [interfaceName, requirement] of Object.entries(requirements)) {
    const dependency = byName.get(requirement.crate);
    if (!dependency) {
      findings.push({
        kind: 'missing-dependency',
        interface: interfaceName,
        package: requirement.crate,
        message: 'required dependency ' + requirement.crate + ' is absent',
      });
      continue;
    }
    if (requirement.version && !versionMatches(dependency.version, requirement.version)) {
      findings.push({
        kind: 'version-mismatch',
        interface: interfaceName,
        package: requirement.crate,
        expected: requirement.version,
        actual: dependency.version,
        message: 'dependency version does not match the policy',
      });
    }
    const missingFeatures = (requirement.features ?? []).filter(
      (feature) => !(dependency.features ?? []).includes(feature),
    );
    if (missingFeatures.length > 0) {
      findings.push({
        kind: 'missing-feature',
        interface: interfaceName,
        package: requirement.crate,
        features: missingFeatures,
        message: 'required features are absent: ' + missingFeatures.join(', '),
      });
    }
    for (const forbidden of requirement.forbidden ?? []) {
      if (byName.has(forbidden)) {
        findings.push({
          kind: 'forbidden-dependency',
          interface: interfaceName,
          package: forbidden,
          message: 'forbidden dependency is present',
        });
      }
    }
  }

  for (const edge of policy?.edges?.forbidden ?? []) {
    if (byName.has(edge)) {
      findings.push({
        kind: 'forbidden-edge',
        package: edge,
        message: 'forbidden dependency edge is present',
      });
    }
  }

  return { ok: findings.length === 0, findings };
}

function parseDependency(name, value, section) {
  const parsed = { name, version: null, features: [], kind: section };
  const version = value.match(/version\s*=\s*"([^"]+)"/);
  if (version) parsed.version = version[1];
  if (!version && value.startsWith('"') && value.endsWith('"')) {
    parsed.version = value.slice(1, -1);
  }
  const features = value.match(/features\s*=\s*\[([^\]]*)\]/);
  if (features) {
    parsed.features = features[1]
      .split(',')
      .map((item) => item.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  }
  return parsed;
}

function normalizeCargoMetadata(value) {
  return {
    packages: (value.packages ?? []).map((pkg) => ({
      name: pkg.name,
      dependencies: (pkg.dependencies ?? []).map((dependency) => ({
        name: dependency.name,
        version: dependency.req ?? dependency.version ?? null,
        features: dependency.features ?? [],
        kind: dependency.kind ?? 'normal',
      })),
    })),
  };
}

function versionMatches(actual, expected) {
  if (!actual || !expected) return true;
  return String(actual).replace(/^=/, '') === String(expected).replace(/^=/, '');
}
