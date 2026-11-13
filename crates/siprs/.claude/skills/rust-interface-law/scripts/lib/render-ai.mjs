// [::TICKET::] PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-422 --for-spec --no-implementation-order`.
// [::TICKET::] PX-421 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-421 --for-spec --no-implementation-order`.
import { dirname, join } from 'node:path';

const ACTION_BY_KIND = {
  'unmarked-incomplete': 'Implement the code, or add a `[::STUB::]` marker with a concrete resolution plan directly above the line.',
  secret: 'Remove the credential and load it from an environment variable or secret manager.',
  'no-changed-paths': 'Pass `--paths` with the changed files; the gate cannot verify an empty change set.',
};

export function renderResolveMarkdown({ manifest, auto, autoSummary }) {
  const nodes = manifest.nodes ?? [];
  const must = nodes.filter((node) => node.delivery === 'must').length;
  const reference = nodes.length - must;
  const lines = [
    '# Resolved closure — ' + nodes.length + ' nodes',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Units | ' + (manifest.units ?? []).map((unit) => '`' + unit.id + '` (' + unit.role + ')').join(', ') + ' |',
    '| Phases | ' + (manifest.phases ?? []).map((phase) => '`' + phase + '`').join(' → ') + ' |',
    '| must | ' + must + ' |',
    '| reference | ' + reference + ' |',
    '| omitted | ' + (manifest.omitted ?? []).length + ' |',
    '| closure_sha256 | `' + manifest.closure_sha256 + '` |',
    '| Manifest | `$MANIFEST` (`--out` value) |',
    ...(autoSummary ? ['| Auto discovery | ' + autoSummary + ' |'] : []),
    '',
  ];
  if (auto) {
    lines.push(
      'Auto-generated config lives next to the manifest: `RULES-PROFILE.auto.toml`, `workspace-map.auto.toml`.',
      '',
    );
  }
  return lines.join('\n');
}

export function renderContextMarkdown({ manifest, phase, result }) {
  const index = (manifest.phases ?? []).indexOf(phase);
  const nextPhase = (manifest.phases ?? [])[index + 1] ?? null;
  const nodesById = new Map((manifest.nodes ?? []).map((node) => [node.id, node]));
  const units = (manifest.units ?? [])
    .map((unit) => '`' + unit.id + '` (' + unit.role + ')')
    .join(', ');

  const lines = [
    '# Rust Interface Law — ' + phase + ' phase',
    '',
    '## Situation',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Repository | `.` (`$REPO_ROOT`) |',
    '| Units | ' + units + ' |',
    '| Phase | `' + phase + '` (' + (index + 1) + ' of ' + (manifest.phases ?? []).length + ') |',
    '| Rules delivered | ' + result.nodes.length + ' |',
    '| Delivery hash | `' + result.hash + '` |',
    '',
  ];

  const roles = Object.entries(manifest.roles ?? {});
  if (roles.length > 0) {
    lines.push(
      '## Project role mapping',
      '',
      '| Canonical | Project crate |',
      '|---|---|',
      ...roles.map(([canonical, crate]) => '| `' + canonical + '` | ' + (crate ? '`' + crate + '`' : '(none)') + ' |'),
      '',
    );
  }

  lines.push('## Required work', '');

  for (const delivered of result.nodes) {
    const node = nodesById.get(delivered.id);
    if (node?.type === 'Rule') {
      const rule = parseRuleRow(delivered.body);
      const requirement = rule?.requirement ?? firstLine(delivered.body);
      lines.push('- [ ] **' + (rule?.id ?? delivered.id) + '**: ' + requirement);
    } else {
      lines.push('- [ ] ' + summaryFor(node, delivered) + ' (reference below).');
    }
  }

  const rules = result.nodes
    .map((delivered) => parseRuleRow(delivered.body))
    .filter(Boolean);

  if (rules.length > 0) {
    lines.push(
      '',
      '## Rule references',
      '',
      '| Rule | Class | Surface | Specification | Verification | Enforcement |',
      '|---|---|---|---|---|---|',
      ...rules.map((rule) => '| ' + rule.id + ' | ' + rule.class + ' | ' + rule.surface
        + ' / ' + rule.prefix + ' | ' + rule.spec + ' | ' + rule.verification
        + ' | ' + rule.enforcement + ' |'),
    );
  }

  const blocks = result.nodes.filter((delivered) => nodesById.get(delivered.id)?.type !== 'Rule');
  if (blocks.length > 0) {
    lines.push('', '## References', '');
    for (const delivered of blocks) {
      lines.push('### `' + delivered.id + '`', '', delivered.body.trim(), '');
    }
  }

  lines.push(
    '',
    '## After implementation',
    '',
    '1. Run the gate:',
    '',
    '```bash',
    'node "$LAW" gate --manifest "$MANIFEST" --out "$LAW_OUT/gate-report.json"',
    '```',
    '',
    '2. Attest this phase:',
    '',
    '```bash',
    'node "$LAW" attest --manifest "$MANIFEST" --phase ' + phase
      + ' --init --out "$LAW_OUT/attestation.json"',
    '```',
    '',
    '3. Next phase: ' + (nextPhase ? '`' + nextPhase + '`' : 'none — completion review'),
    '',
  );

  return lines.join('\n');
}

export function renderGateMarkdown(report) {
  const statuses = report.statuses ?? [];
  const counts = { machine_verified: 0, human_attested: 0, failed: 0, unverifiable: 0, not_run: 0 };
  for (const entry of statuses) counts[entry.status] = (counts[entry.status] ?? 0) + 1;

  const pass = report.ok === true;
  const processOnly = statuses.filter((entry) => (entry.modes ?? []).every((mode) => mode === 'process')).length;
  const ruleLevel = statuses.length - processOnly;
  const lines = [
    '# Gate Report — ' + (pass ? 'PASS' : 'FAIL')
      + (pass && statuses.length > 0 && ruleLevel === 0 ? ' (V1 process only)' : ''),
    '',
    '| Field | Value |',
    '|---|---|',
    '| Machine pass | ' + (report.machinePass ? 'yes' : 'no') + ' |',
    '| Rules evaluated | ' + statuses.length + ' |',
    '| machine_verified | ' + counts.machine_verified + ' |',
    '| human_attested | ' + counts.human_attested + ' |',
    '| failed | ' + counts.failed + ' |',
    '| unverifiable | ' + counts.unverifiable + ' |',
    '| not_run | ' + counts.not_run + ' |',
    '',
    '## Scope',
    '',
    'V1 process check: unmarked incomplete code and secrets in changed files. Rule-level behavior is proven only for nodes carrying a project `[[verify]]` row.',
    '',
    '## Verification coverage',
    '',
    '| Level | Rules | Meaning |',
    '|---|---|---|',
    '| V1 process | ' + processOnly + ' | No unmarked incomplete code or secret in changed files. |',
    '| Rule-level (V2+) | ' + ruleLevel + ' | Project `[[verify]]` evidence proves rule behavior. |',
    '',
  ];

  const findings = [];
  const unverifiable = [];
  for (const entry of statuses) {
    if (entry.status === 'unverifiable' || entry.status === 'not_run') {
      unverifiable.push(entry);
      continue;
    }
    for (const result of asArray(entry.evidence)) {
      for (const finding of result.evidence?.findings ?? []) {
        findings.push({ rule: entry.rule, ...finding });
      }
    }
  }

  if (findings.length === 0) {
    lines.push('No violations.', '');
  } else {
    lines.push(
      '## Blocking violations',
      '',
      '| Rule | File:line | Kind | Required action |',
      '|---|---|---|---|',
      ...findings.map((finding) => '| ' + finding.rule + ' | ' + (finding.path ?? '(none)')
        + ':' + (finding.line ?? 0) + ' | ' + finding.kind + ' | '
        + (ACTION_BY_KIND[finding.kind] ?? 'Fix the reported condition and re-run the gate.') + ' |'),
      '',
    );
  }

  if (unverifiable.length > 0) {
    lines.push(
      '## Cannot be verified',
      '',
      '| Rule | Status | Evidence | Required action |',
      '|---|---|---|---|',
      ...unverifiable.map((entry) => '| ' + entry.rule + ' | ' + entry.status + ' | '
        + summarize(entry.evidence) + ' | Add a `[[verify]]` row for this rule, or fix the missing evidence. |'),
      '',
    );
  }

  lines.push(
    '## Next action',
    '',
    pass
      ? (ruleLevel === 0 && statuses.length > 0
        ? '1. V1 process gate passed. Rule-level behavior is not proven; add `[[verify]]` rows for rule-level evidence if required.\n2. Continue with attestation for this phase.'
        : '1. Continue with attestation for this phase.')
      : '1. Fix every blocking row above.\n2. Re-run the gate.\n3. Continue only after the report says PASS.',
    '',
  );

  return lines.join('\n');
}

export function renderAttestMarkdown(template) {
  const lines = [
    '# Attestation — ' + template.phase,
    '',
    '| Field | Value |',
    '|---|---|',
    '| Phase | `' + template.phase + '` |',
    '| Rows | ' + template.rows.length + ' |',
    '',
    '## Checklist',
    '',
    ...template.rows.map((row) => '- [ ] `' + row.rule + '`'),
    '',
    '## Accepted status values',
    '',
    '| Status | Required field |',
    '|---|---|',
    '| `applied` + `evidence` | What you executed and what it proved. |',
    '| `human_attested` + `approval_ref` | Review or approval reference. |',
    '| `exception` + `exception_ref` | Approved exception reference. |',
    '',
    '## Next action',
    '',
    'Fill every row, save the JSON document, then run:',
    '',
    '```bash',
    'node "$LAW" attest --manifest "$MANIFEST" --phase '
      + template.phase + ' --rows "$LAW_OUT/attestation.json"',
    '```',
    '',
  ];
  return lines.join('\n');
}

export function parseRuleRow(body) {
  const cells = String(body ?? '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim().replace(/`/g, ''));
  if (cells.length < 8) return null;
  return {
    id: cells[0],
    class: cells[1],
    surface: cells[2],
    prefix: cells[3],
    spec: cells[4],
    requirement: cells[5],
    verification: cells[6],
    enforcement: cells[7],
  };
}

function firstLine(body) {
  return String(body ?? '').split('\n').map((line) => line.trim()).find(Boolean) ?? '';
}

function summaryFor(node, delivered) {
  const body = String(delivered.body ?? '');
  if (node?.type === 'CodeBlock') {
    const code = body.split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('```'));
    return 'Implement or apply `' + truncate(code ?? delivered.id, 90) + '` — node `' + delivered.id + '`';
  }
  const heading = body.split('\n').map((line) => line.trim()).find((line) => line.startsWith('#'));
  if (heading) {
    return 'Apply `' + heading.replace(/^#+\s*/, '') + '` — node `' + delivered.id + '`';
  }
  return 'Apply `' + delivered.id + '`';
}

function truncate(value, limit) {
  const text = String(value);
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function summarize(evidence) {
  if (typeof evidence === 'string') return evidence;
  if (Array.isArray(evidence)) return evidence.map((entry) => entry.status).join(', ');
  return 'no evidence';
}
