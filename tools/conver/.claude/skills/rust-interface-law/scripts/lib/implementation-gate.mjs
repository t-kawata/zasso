const PASSING = new Set(['machine_verified', 'human_attested']);

export function mergeImplementationReport({ manifest, report, rules }) {
  const byRule = new Map((report?.statuses ?? []).map((entry) => [entry.rule, entry]));
  const contractRules = rules ?? null;
  const statuses = (manifest?.nodes ?? [])
    .filter((node) => node.delivery === 'must'
      && (contractRules ? contractRules.has(node.id) : isImplementationRule(node.id)))
    .map((node) => {
      const entry = byRule.get(node.id);
      if (!entry) {
        return {
          rule: node.id,
          status: 'not_run',
          evidence: 'implementation report has no status for this rule',
          modes: ['implementation'],
        };
      }
      return {
        rule: node.id,
        status: entry.status,
        evidence: entry.evidence ?? null,
        modes: ['implementation'],
      };
    });
  return {
    statuses,
    ok: statuses.length > 0 && statuses.every((entry) => PASSING.has(entry.status)),
  };
}

export function applyImplementationReport(manifest, report, rules) {
  const merged = mergeImplementationReport({ manifest, report, rules });
  const byRule = new Map(merged.statuses.map((entry) => [entry.rule, entry]));
  for (const node of manifest?.nodes ?? []) {
    if (byRule.has(node.id)) node.implementation_status = byRule.get(node.id);
  }
  return merged;
}

export function checkLawIdentity({ manifest, installed, exception }) {
  const fields = ['spec_version', 'dist_sha256', 'policy_sha256'];
  const findings = [];
  for (const field of fields) {
    const expected = manifest?.[field];
    const actual = installed?.[field];
    if (expected && actual && expected !== actual) {
      findings.push({
        kind: field,
        expected,
        actual,
        message: 'law identity mismatch: ' + field,
      });
    }
  }
  if (findings.length === 0) return { ok: true, findings: [] };
  if (validException(exception)) return { ok: true, findings, excused: true };
  return { ok: false, findings };
}

export function isImplementationRule(ruleId) {
  return /^IMP-\d+$/.test(String(ruleId));
}

function validException(exception) {
  if (!exception) return false;
  if (!exception.approval_ref) return false;
  if (!exception.scope) return false;
  if (!exception.expires) return false;
  const expires = Date.parse(exception.expires);
  return Number.isFinite(expires) && expires >= Date.now();
}
