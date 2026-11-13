import { readFileSync } from 'node:fs';
import { parseToml } from './toml.mjs';
import { sha256 } from './redact.mjs';

const INTERFACE_RULES = new Set(['REST', 'WS', 'CLI', 'GRPC', 'MCP', 'A2A']);
const OPERATION_RULES = new Set(['AUTH', 'AUTHZ', 'OPS', 'OP', 'SEC', 'SSO', 'ID', 'IDN']);
const DOC_RULES = new Set(['DOC', 'VAL', 'BP']);
const CORE_RULES = new Set(['ARC', 'CORE']);

export function loadImplementationPolicy(path) {
  const document = parseToml(readFileSync(path, 'utf8'));
  return normalizePolicy(document);
}

export function normalizePolicy(value) {
  if (!value) return { spec_version: '0.4.0', interfaces: {}, edges: {} };
  if (value.interfaces) return value;
  return { spec_version: value.spec_version ?? '0.4.0', interfaces: value, edges: value.edges ?? {} };
}

export function resolveEffectivePolicy({ baseline, project }) {
  const base = normalizePolicy(baseline);
  const projectPolicy = normalizePolicy(project);
  const effective = {};
  const findings = [];

  for (const [name, requirement] of Object.entries(base.interfaces ?? {})) {
    const override = projectPolicy.interfaces?.[name] ?? {};
    const baseVersion = normalizeVersion(requirement.version);
    const projectVersion = override.version ? normalizeVersion(override.version) : null;

    if (projectVersion && baseVersion && projectVersion !== baseVersion) {
      findings.push({
        kind: 'policy-conflict',
        interface: name,
        package: requirement.crate,
        expected: baseVersion,
        actual: projectVersion,
        message: 'project pin ' + projectVersion + ' is outside the admitted baseline ' + baseVersion,
      });
      continue;
    }

    effective[name] = {
      crate: requirement.crate,
      version: projectVersion ?? baseVersion,
      features: unique([...(requirement.features ?? []), ...(override.features ?? [])]),
      default_features: override.default_features ?? requirement.default_features ?? false,
      forbidden: unique([...(requirement.forbidden ?? []), ...(override.forbidden ?? [])]),
    };
  }

  if (findings.length > 0) {
    return { ok: false, effective: null, findings, policy_sha256: null };
  }

  return {
    ok: true,
    ...effective,
    effective,
    findings: [],
    policy_sha256: sha256(JSON.stringify(effective)),
  };
}

export function phaseForRuleId(ruleId) {
  const parts = String(ruleId).split('-');
  const prefix = parts[0];
  if (prefix === 'IMP') {
    const number = Number(parts[1]);
    return Number.isFinite(number) && number <= 8 ? 'adapter' : 'conformance';
  }
  if (INTERFACE_RULES.has(prefix)) return 'adapter';
  if (OPERATION_RULES.has(prefix)) return 'operation';
  if (DOC_RULES.has(prefix)) return 'docs';
  if (CORE_RULES.has(prefix)) return 'core';
  if (prefix === 'CONF') return 'conformance';
  if (prefix === 'APP') return 'scope';
  if (prefix === 'MIG') return 'review';
  return 'operation';
}

function normalizeVersion(value) {
  if (!value) return null;
  return String(value).replace(/^=/, '');
}

function unique(values) {
  return [...new Set(values)];
}
