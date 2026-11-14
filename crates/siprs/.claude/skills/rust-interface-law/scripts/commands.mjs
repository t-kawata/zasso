import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAttestation, checkAttestation } from './lib/attest.mjs';
import {
  discoverWorkspace,
  mapCanonicalRoles,
  renderMapToml,
  renderProfileToml,
} from './lib/autoconfig.mjs';
import { buildManifest } from './lib/closure.mjs';
import { loadLawNodes, loadRuleMap, loadBundle, explainRule as explainLawRule } from './lib/law-bundle.mjs';
import { listDirectory, validateConformance, lintBundle, checkProfile, getOutgoing, buildTraversal } from '../okf-core/index.mjs';
import { conceptBody } from '../okf-core/context/assemble.mjs';
import { showConcept, outgoingEdges, incomingEdges, neighborEdges } from '../okf-core/commands/navigation.mjs';
import { searchConcepts } from '../okf-core/commands/search.mjs';
import { formatValue, FORMAT_MARKDOWN } from '../okf-core/render/markdown.mjs';
import { resolveRequired } from '../okf-core/context/resolve-required.mjs';
import { buildContext } from '../okf-core/context/assemble.mjs';
import { loadImplementationPolicy, phaseForRuleId, resolveEffectivePolicy } from './lib/implementation-policy.mjs';
import { checkDependencies, readCargoMetadata } from './lib/implementation-metadata.mjs';
import { scanFiles } from './lib/implementation-scan.mjs';
import { applyImplementationReport, checkLawIdentity } from './lib/implementation-gate.mjs';
import { reconcileTemplatePlan, renderTemplatePlan } from './lib/template.mjs';
import { scanImplementation } from './lib/process-scan.mjs';
import {
  renderAttestMarkdown,
  renderContextMarkdown,
  renderGateMarkdown,
  renderResolveMarkdown,
} from './lib/render-ai.mjs';
import { applyScaffold, renderScaffoldMarkdown } from './lib/scaffold.mjs';
import { deliverContext } from './lib/context.mjs';
import { checkExceptions } from './lib/exception.mjs';
import { applyVerify, runGate } from './lib/gate.mjs';
import { loadProfile, loadWorkspaceMap, matchUnits } from './lib/units.mjs';
import { parseToml } from './lib/toml.mjs';
import { redactText, sha256 } from './lib/redact.mjs';
import { runScan } from './lib/scan.mjs';
import { shouldRun } from './lib/should-run.mjs';

const MUST_TYPES = new Set(['Rule', 'CodeBlock', 'ContractType', 'InterfaceBinding', 'Operation', 'Documentation', 'Conformance']);
// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
const LAW_COMMAND_PREFIX = 'node "$LAW"';
const RULE_INTERFACE_BY_PREFIX = {
  REST: 'rest',
  WS: 'websocket',
  CLI: 'cli',
  GRPC: 'grpc',
  MCP: 'mcp',
  A2A: 'a2a',
};

export async function resolveCommand(argv) {
  const options = parseArgs(argv);
  const root = resolve(options.root ?? gitRepoRoot(process.cwd()));
  const auto = !options.profile || !options.map;
  const discovered = auto ? discoverWorkspace(root) : null;
  const profile = options.profile ? loadProfile(options.profile) : discovered.profile;
  const map = options.map ? loadWorkspaceMap(options.map) : { units: discovered.units };
  const loaded = await loadLawNodes({ skillRoot: skillRoot() });
  const nodes = loaded.nodes;
  const paths = String(options.paths ?? '').split(',').filter(Boolean);

  const units = options.unit
    ? map.units.filter((unit) => String(unit.id) === String(options.unit))
    : (paths.length > 0 ? matchUnits(paths, map).units : map.units);
  if (units.length === 0) throw new Error('no unit matched');

  const manifest = buildManifest({ profile, units, nodes });
  manifest.root = root;
  manifest.changed = paths;
  manifest.roles = mapCanonicalRoles(map.units);
  const out = options.out ?? join(process.cwd(), 'manifest.json');
  applyLawIdentity({ manifest, root, out });
  for (const node of manifest.nodes) {
    if (node.delivery === 'must' && !(node.verify ?? []).length) {
      node.verify = [{ level: 'V1', mode: 'process' }];
    }
  }

  writeAtomic(out, JSON.stringify(manifest, null, 2) + '\n');
  if (auto) {
    const outDir = dirname(out);
    writeAtomic(join(outDir, 'RULES-PROFILE.auto.toml'), renderProfileToml(profile));
    writeAtomic(join(outDir, 'workspace-map.auto.toml'), renderMapToml(map.units));
  }
  process.stdout.write(renderResolveMarkdown({
    manifest,
    auto,
    autoSummary: auto ? map.units.length + ' units, matched ' + units.length : null,
  }));
}

export async function contextCommand(argv) {
  const options = parseArgs(argv);
  if (options.rule) {
    const root = skillRoot();
    const ruleMap = loadRuleMap(join(root, 'source/rule-concepts.json'));
    const entry = ruleMap.byRule.get(String(options.rule)) ?? ruleMap.byAlias?.get(String(options.rule));
    if (!entry) throw Object.assign(new Error('unknown rule: ' + options.rule), { code: 'UNKNOWN_RULE' });
    const bundle = await loadBundle(join(root, 'okf'));
    const set = resolveRequired({ bundle, entryIds: [entry.concept_id] });
    const sourceIds = new Set();
    for (const id of set.required) {
      for (const edge of getOutgoing(bundle, id)) {
        if (edge.state === 'resolved'
          && edge.to
          && !edge.to.startsWith('sources/15-rule-registry/')
          && bundle.byId.get(edge.to)?.type === 'Section') sourceIds.add(edge.to);
      }
    }
    const contextIds = [...new Set([...set.required, ...sourceIds])].sort();
    const artifact = buildContext({
      bundle,
      requiredSet: { ...set, context: contextIds },
      budgetBytes: options.budget ? Number(options.budget) : undefined,
    });
    // [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
    // Context is the terminal delivery for a rule. The same coverage model that
    // justified the closure also tells the caller it may stop.
    const page = buildTraversal({
      bundle,
      id: entry.concept_id,
      profile: options.profile ?? 'law-implement',
      payloadIds: contextIds,
    });
    writeValue({
      required: set,
      artifact,
      protocol: page.protocol,
      node: page.node,
      coverage: page.coverage,
      frontier: page.frontier,
      guidance: page.guidance,
      backTo: page.backTo,
    }, options);
    return;
  }
  const manifestPath = required(options, 'manifest');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const redaction = loadRedaction();
  const requested = options.phases
    ? String(options.phases).split(',').map((phase) => phase.trim()).filter(Boolean)
    : [required(options, 'phase')];
  for (const phase of requested) {
    if (!(manifest.phases ?? []).includes(phase)) throw new Error('unknown phase: ' + phase);
  }
  const phases = (manifest.phases ?? []).filter((phase) => requested.includes(phase));
  const ledgerPath = options.ledger ?? join(process.cwd(), 'target/law-ledger.json');
  const sections = [];
  const delivered = [];

  for (const phase of phases) {
    const result = deliverContext({
      manifest,
      phase,
      ledgerPath,
      replay: Boolean(options.replay),
    });
    if (options.format === 'raw') {
      for (const node of result.nodes) {
        process.stdout.write(redactText('<!-- node ' + node.id + ' ' + node.content_sha256 + ' -->\n', redaction));
        process.stdout.write(redactText(node.body + '\n', redaction));
      }
      process.stdout.write(redactText('<!-- hash ' + result.hash + ' -->\n', redaction));
      continue;
    }
    if (options.format === 'json') {
      delivered.push({ phase, result });
      continue;
    }
    sections.push(renderContextMarkdown({ manifest, phase, result }));
  }

  if (options.format === 'json') process.stdout.write(JSON.stringify({ phases: delivered }) + '\n');
  else if (options.format !== 'raw') process.stdout.write(redactText(sections.join('\n---\n'), redaction));
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function loadRedaction() {
  const redactionPath = join(skillRoot(), 'source/redaction.sha256.json');
  return existsSync(redactionPath) ? JSON.parse(readFileSync(redactionPath, 'utf8')) : [];
}

const INTERFACE_ROLES = new Set(['rest', 'websocket', 'cli', 'grpc', 'mcp', 'a2a']);
const PHASE_ORDER = ['scope', 'contract', 'core', 'operation', 'adapter', 'docs', 'conformance', 'review'];

export function appliesCommand(argv) {
  const options = parseArgs(argv);
  const root = resolve(options.root ?? gitRepoRoot(process.cwd()));
  const paths = String(options.paths ?? '')
    .split(',')
    .map((path) => path.trim())
    .filter(Boolean)
    .map((path) => (path.startsWith(root) ? relative(root, path).replace(/\\/g, '/') : path));
  const units = discoverWorkspace(root).units;
  const matched = options.unit
    ? units.filter((unit) => unit.id === String(options.unit))
    : (paths.length > 0 ? matchUnits(paths, { units }).units : []);
  const includeShared = Boolean(options['include-shared']);
  const applicable = matched.filter((unit) => includeShared || INTERFACE_ROLES.has(unit.role));
  const applies = applicable.length > 0;
  const phases = [...new Set(applicable.flatMap((unit) => unit.phases ?? []))]
    .sort((left, right) => PHASE_ORDER.indexOf(left) - PHASE_ORDER.indexOf(right));

  process.stdout.write([
    '# Law applicability — ' + (applies ? 'APPLIES' : 'SKIP'),
    '',
    '| Field | Value |',
    '|---|---|',
    '| Repository | `' + root + '` |',
    '| Paths checked | ' + paths.length + ' |',
    '| Matched units | ' + (matched.map(labelUnit).join(', ') || '(none)') + ' |',
    '| Applicable units | ' + (applicable.map(labelUnit).join(', ') || '(none)') + ' |',
    '| Phases | ' + (phases.join(', ') || '(none)') + ' |',
    '',
    applies
      ? 'Apply rust-interface-law for these units.'
      : 'Skip rust-interface-law; no interface unit matched.',
    '',
  ].join('\n'));
  process.exit(applies ? 0 : 3);
}

function labelUnit(unit) {
  return '`' + unit.id + '` (' + unit.role + ')';
}

export async function explainCommand(argv) {
  const options = parseArgs(argv);
  const root = skillRoot();
  const ruleMap = loadRuleMap(join(root, 'source/rule-concepts.json'));
  process.stdout.write(await explainLawRule({
    ruleId: required(options, 'rule'),
    ruleMap,
    skillRoot: root,
  }));
}

export function scaffoldCommand(argv) {
  const options = parseArgs(argv);
  const root = resolve(options.root ?? gitRepoRoot(process.cwd()));
  const plan = JSON.parse(readFileSync(required(options, 'plan'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(skillRoot(), 'atoms.lock.json'), 'utf8'));
  const knownRules = new Set((lock.rules ?? []).map((rule) => rule.rule_id));
  const result = applyScaffold({
    root,
    plan,
    write: Boolean(options.write),
    knownRules,
    stateDir: options['state-dir'],
  });
  process.stdout.write(renderScaffoldMarkdown(result));
  process.exit(result.ok ? 0 : 1);
}

export function templateCommand(argv) {
  const options = parseArgs(argv);
  const interfaceName = required(options, 'interface');
  const unit = required(options, 'unit');
  const provided = options.values ? JSON.parse(readFileSync(options.values, 'utf8')) : {};
  const values = {
    crate: options.crate ?? unit,
    package: options.package ?? unit,
    interface: interfaceName,
    unit,
    ...provided,
  };
  const templateRoot = options.templates ?? join(skillRoot(), 'templates');
  const rendered = renderTemplatePlan({
    interface: interfaceName,
    unit,
    values,
    root: templateRoot,
  });
  if (!rendered.ok) {
    process.stdout.write(renderPlanMarkdown(rendered));
    process.exit(1);
  }
  const plan = options.reconcile && options.root
    ? reconcileTemplatePlan({ plan: rendered.plan, root: resolve(options.root) })
    : rendered.plan;
  if (options.out) writeAtomic(options.out, JSON.stringify(plan, null, 2) + '\n');
  process.stdout.write(renderPlanMarkdown({ ...rendered, plan, files: plan.files }));
  process.exit(plan.findings?.length ? 1 : 0);
}

export function implementationCheckCommand(argv) {
  const options = parseArgs(argv);
  const root = resolve(options.root ?? gitRepoRoot(process.cwd()));
  const policyPath = options.policy ?? join(skillRoot(), 'source/implementation-policy.toml');
  const baseline = loadImplementationPolicy(policyPath);
  const metadata = readCargoMetadata({ root, locked: false });
  const manifest = options.manifest
    ? JSON.parse(readFileSync(options.manifest, 'utf8'))
    : { nodes: [], changed: String(options.paths ?? '').split(',').filter(Boolean) };
  const activeInterfaces = new Set((manifest.units ?? []).flatMap((unit) => unit.interfaces ?? []));
  const scopedPolicy = activeInterfaces.size > 0
    ? { ...baseline, interfaces: pickInterfaces(baseline.interfaces, activeInterfaces) }
    : baseline;
  const project = { interfaces: projectInterfaces(metadata) };
  const effective = resolveEffectivePolicy({ baseline: scopedPolicy, project });
  const dependencyCheck = checkDependencies({ metadata, policy: scopedPolicy });
  const contractsPath = options.contracts ?? join(skillRoot(), 'source/implementation-contracts.toml');
  const contractRules = loadContractRules(contractsPath);
  const contractLevels = loadContractLevels(contractsPath);
  const testStatuses = loadTestStatuses(options.tests);
  const paths = manifest.changed?.length ? manifest.changed : String(options.paths ?? '').split(',').filter(Boolean);
  const sourceScan = scanFiles({ root, paths });
  const checksPass = effective.ok && dependencyCheck.ok && sourceScan.ok;

  const statuses = (manifest.nodes ?? [])
    .filter((node) => node.delivery === 'must' && (String(node.id).startsWith('IMP-') || contractRules.has(node.id) || options.all))
    .map((node) => {
      const level = contractLevels.get(node.id) ?? 'V3';
      const testStatus = testStatuses.get(node.id);
      let status = 'not_run';
      if (!checksPass) status = 'failed';
      else if (level === 'V2') status = 'machine_verified';
      else if (testStatus) status = testStatus.status;
      return {
        rule: node.id,
        status,
        evidence: {
          level,
          effective_policy: effective.effective ?? null,
          dependency_findings: dependencyCheck.findings,
          source_findings: sourceScan.findings,
          test: testStatus?.evidence ?? null,
        },
      };
    });

  const report = {
    schema: 'rust-interface-law.implementation/v1',
    spec_version: baseline.spec_version,
    policy_sha256: effective.policy_sha256,
    statuses,
    findings: [...(effective.findings ?? []), ...dependencyCheck.findings, ...sourceScan.findings],
    ok: statuses.length > 0 && statuses.every((entry) => entry.status === 'machine_verified' || entry.status === 'human_attested'),
  };
  const out = options.out ?? join(process.cwd(), 'implementation-report.json');
  writeAtomic(out, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(renderImplementationReportMarkdown(report));
  process.exit(report.ok ? 0 : 50);
}

export function lawIdentityCommand(argv) {
  const options = parseArgs(argv);
  const manifest = JSON.parse(readFileSync(required(options, 'manifest'), 'utf8'));
  const installed = {
    spec_version: manifest.spec_version ?? '0.4.0',
    dist_sha256: sha256(readFileSync(join(skillRoot(), 'dist/skill.mjs'), 'utf8')),
    policy_sha256: sha256(readFileSync(join(skillRoot(), 'source/implementation-policy.toml'), 'utf8')),
  };
  const result = checkLawIdentity({ manifest, installed, exception: options.exception ? JSON.parse(readFileSync(options.exception, 'utf8')) : null });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 50);
}

export function lawImplementationCommand(argv) {
  const options = parseArgs(argv);
  const manifest = required(options, 'manifest');
  const root = resolve(options.root ?? gitRepoRoot(process.cwd()));
  const outDir = options['out-dir'] ?? dirname(manifest);
  const report = join(outDir, 'implementation-report.json');
  const gateReport = join(outDir, 'gate-report.json');
  const entry = process.argv[1];

  const check = spawnSync(process.execPath, [
    entry, 'implementation-check', '--root', root, '--manifest', manifest, '--out', report,
  ], { stdio: 'inherit' });
  if (check.status !== 0) process.exit(check.status ?? 50);

  const gate = spawnSync(process.execPath, [
    entry, 'gate', '--manifest', manifest, '--implementation', report, '--out', gateReport,
  ], { stdio: 'inherit' });
  process.exit(gate.status ?? 50);
}

export function gateCommand(argv) {
  const options = parseArgs(argv);
  const manifest = JSON.parse(readFileSync(required(options, 'manifest'), 'utf8'));
  const scans = options.scans ? loadScans(options.scans) : {};
  if (options.verify) applyVerify(manifest, loadVerify(options.verify));
  const processScan = scanImplementation({
    root: manifest.root ?? process.cwd(),
    paths: manifest.changed ?? [],
  });
  const implementationRules = loadContractRules(join(skillRoot(), 'source/implementation-contracts.toml'));
  if (options.implementation) {
    const implementationReport = JSON.parse(readFileSync(options.implementation, 'utf8'));
    applyImplementationReport(manifest, implementationReport, implementationRules);
  } else {
    applyImplementationReport(manifest, null, implementationRules);
  }
  const scanRunner = (id) => scanFiles({
    root: manifest.root ?? process.cwd(),
    paths: manifest.changed ?? [],
    detectors: [id],
  });
  const report = runGate({ manifest, scans, cwd: process.cwd(), processScan, scanRunner });
  const out = options.out ?? join(process.cwd(), 'gate-report.json');
  writeAtomic(out, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(options.format === 'json'
    ? JSON.stringify(report, null, 2) + '\n'
    : renderGateMarkdown(report));
  process.exit(report.ok ? 0 : 50);
}

export function scanCommand(argv) {
  const options = parseArgs(argv);
  const input = options.input
    ? JSON.parse(readFileSync(options.input, 'utf8'))
    : { text: options.text ?? '', before: options.before ?? '', after: options.after ?? '' };
  const result = runScan(required(options, 'id'), input);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 60);
}

export function attestCommand(argv) {
  const options = parseArgs(argv);
  const manifest = JSON.parse(readFileSync(required(options, 'manifest'), 'utf8'));
  const phase = required(options, 'phase');
  if (options.init) {
    const template = buildAttestation(manifest, phase);
    if (options.out) {
      writeAtomic(options.out, JSON.stringify(template, null, 2) + '\n');
    }
    process.stdout.write(options.format === 'json'
      ? JSON.stringify(template, null, 2) + '\n'
      : renderAttestMarkdown(template));
    return;
  }
  const document = JSON.parse(readFileSync(required(options, 'rows'), 'utf8'));
  const rows = Array.isArray(document) ? document : document.rows;
  if (!Array.isArray(rows)) throw new Error('attestation rows must be an array');
  if (!Array.isArray(document) && document.phase && document.phase !== phase) {
    throw new Error('attestation phase mismatch: ' + document.phase);
  }
  checkAttestation(manifest, phase, rows);
  process.stdout.write('attest: ok\n');
}

export function exceptionCommand(argv) {
  const options = parseArgs(argv);
  const document = parseToml(readFileSync(required(options, 'exceptions'), 'utf8'));
  const rules = new Set(String(options.rules ?? '').split(',').filter(Boolean));
  checkExceptions(document.exception ?? [], {
    now: options.now ?? new Date().toISOString().slice(0, 10),
    rules,
  });
  process.stdout.write('exception: ok\n');
}

export function shouldRunCommand(argv) {
  const options = parseArgs(argv);
  const profile = loadProfile(required(options, 'profile'));
  const map = loadWorkspaceMap(required(options, 'map'));
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const paths = input.tool_input?.file_path ? [input.tool_input.file_path] : [];
  process.stdout.write(JSON.stringify(shouldRun({ paths, profile, map })) + '\n');
}

export function renderCommand(argv) {
  const options = parseArgs(argv);
  const lock = JSON.parse(readFileSync(required(options, 'lock'), 'utf8'));
  const outDir = options.out ?? join(skillRoot(), 'okf');
  renderOkf(lock, outDir);
  process.stdout.write('render: ' + lock.atoms.length + ' nodes -> ' + outDir + '\n');
}

export function checkCommand(argv) {
  const options = parseArgs(argv);
  const action = options._[0] ?? 'lint';
  const dir = options.okf ?? join(skillRoot(), 'okf');
  const lock = options.lock ? JSON.parse(readFileSync(options.lock, 'utf8')) : null;
  const nodes = loadOkf(dir);
  const ids = new Set();

  if (action === 'lint' || action === 'audit') {
    for (const node of nodes) {
      if (!node.type || !node.id || !node.phase || !node.delivery) {
        throw new Error('lint: incomplete frontmatter: ' + node.file);
      }
      if (ids.has(node.id)) throw new Error('lint: duplicate id: ' + node.id);
      ids.add(node.id);
    }
    if (!existsSync(join(dir, 'index.md')) || !existsSync(join(dir, 'log.md'))) {
      throw new Error('lint: index.md or log.md missing');
    }
  }

  if (action === 'graph' || action === 'audit') {
    for (const node of nodes) {
      for (const required of node.requires ?? []) {
        if (!nodes.some((candidate) => candidate.id === required)) {
          throw new Error('graph: dangling requires: ' + node.id + ' -> ' + required);
        }
      }
    }
  }

  if (action === 'coverage' || action === 'audit') {
    if (!lock) throw new Error('coverage: --lock required');
    const nodeIds = new Set(nodes.map((node) => node.id));
    for (const atom of lock.atoms) {
      if (!nodeIds.has(atom.id)) throw new Error('coverage: missing node: ' + atom.id);
    }
    if (nodeIds.size !== lock.atoms.length) throw new Error('coverage: extra node');
  }

  process.stdout.write('check ' + action + ': ' + nodes.length + ' nodes ok\n');
}

export function packageCommand(argv) {
  const options = parseArgs(argv);
  const manifestPath = options.manifest ?? join(skillRoot(), 'source/manifest.toml');
  const manifest = parseToml(readFileSync(manifestPath, 'utf8'));
  const redaction = JSON.parse(readFileSync(join(skillRoot(), 'source/redaction.sha256.json'), 'utf8'));
  const aliasMap = loadAliasMap(options.alias);
  const parts = ['# Source View', '', 'Generated from the source documents. Do not edit.', ''];
  for (const file of manifest.file ?? []) {
    const original = aliasMap?.aliases?.[file.path];
    const path = original ?? resolve(file.path);
    const text = redactText(readFileSync(path, 'utf8'), redaction);
    parts.push('# Source: ' + file.path, '', text.replace(/\n+$/, ''), '');
  }
  const text = parts.join('\n');
  const out = options.out ?? join(skillRoot(), 'source/source-view.md');
  writeAtomic(out, text);
  if (options.check) {
    const baseline = join(skillRoot(), 'source/source.baseline.md');
    if (!existsSync(baseline)) throw new Error('package: baseline missing');
    if (readFileSync(baseline, 'utf8') !== text) throw new Error('package: drift');
  }
  process.stdout.write('package: ' + (manifest.file ?? []).length + ' files -> ' + out + '\n');
}

export async function rebuildCommand(argv) {
  const options = parseArgs(argv);
  const root = resolve(options.root ?? skillRoot());
  const temporary = mkdtempSync(join(tmpdir(), 'law-rebuild-'));
  try {
    const bundle = await loadBundle(join(root, 'okf'));
    const { writeDirectoryIndexes } = await import('../okf-core/authoring/index.mjs');
    const { writeLog } = await import('../okf-core/authoring/log.mjs');
    writeDirectoryIndexes({ bundle, outDir: temporary });
    const logPath = join(root, 'source/okf-log.json');
    const entries = existsSync(logPath)
      ? JSON.parse(readFileSync(logPath, 'utf8')).entries
      : [{ date: '1970-01-01', text: 'rebuild' }];
    writeLog({ outDir: temporary, entries });
    for (const file of ['index.md', 'log.md']) {
      if (readFileSync(join(root, 'okf', file), 'utf8') !== readFileSync(join(temporary, file), 'utf8')) {
        throw new Error('drift: okf/' + file);
      }
    }
    process.stdout.write('rebuild: byte-identical\n');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function renderOkf(lock, outDir) {
  const nodesDir = join(outDir, 'nodes');
  mkdirSync(nodesDir, { recursive: true });
  const used = new Set();
  const rows = [];

  for (const atom of lock.atoms) {
    const phase = phaseFor(atom);
    const delivery = MUST_TYPES.has(atom.type) ? 'must' : 'reference';
    const safe = uniqueName(atom.id, used);
    const frontmatter = [
      '---',
      'type: ' + atom.type,
      'id: ' + atom.id,
      'phase: ' + phase,
      'delivery: ' + delivery,
      'applies_to: ' + appliesFor(atom),
      'requires: []',
      'references: []',
      'content_sha256: ' + atom.content_sha256,
      'source: ' + atom.source,
      '---',
      '',
    ].join('\n');
    writeAtomic(join(nodesDir, safe + '.md'), frontmatter + (atom.text ?? '') + '\n');
    rows.push('| `' + atom.id + '` | ' + atom.type + ' | [node](./nodes/' + safe + '.md) |');
  }

  const index = ['# OKF Index', '', '| ID | Type | Node |', '|---|---|---|', ...rows, ''].join('\n');
  writeAtomic(join(outDir, 'index.md'), index);
  writeAtomic(join(outDir, 'log.md'), [
    '# OKF Log',
    '',
    '- spec_version: ' + lock.spec_version,
    '- nodes: ' + lock.atoms.length,
    '- lock: ' + lock.source_manifest_sha256,
    '',
  ].join('\n'));
}

function phaseFor(atom) {
  if (atom.type === 'Rule') {
    const prefix = atom.id.split('-')[0];
    if (prefix === 'IMP') return phaseForRuleId(atom.id);
    if (['AUTH', 'OPS', 'OP', 'SEC'].includes(prefix)) return 'operation';
    if (['REST', 'WS', 'CLI', 'GRPC', 'MCP', 'A2A'].includes(prefix)) return 'adapter';
    if (['DOC', 'VAL', 'BP'].includes(prefix)) return 'docs';
    if (prefix === 'CONF') return 'conformance';
    if (['ARC', 'CORE'].includes(prefix)) return 'core';
    if (prefix === 'APP') return 'scope';
    if (prefix === 'MIG') return 'review';
    return 'operation';
  }
  const file = atom.source.split('/').pop();
  if (/^(00|10)/.test(file)) return 'contract';
  if (file.startsWith('20')) return 'core';
  if (/^(21|22)/.test(file)) return 'operation';
  if (/^(30|31|32|33|34|35)/.test(file)) return 'adapter';
  if (file.startsWith('40')) return 'conformance';
  if (/^(45|47|48)/.test(file)) return 'docs';
  if (file.startsWith('55')) return 'adapter';
  if (file.startsWith('50')) return 'scope';
  if (file.startsWith('90')) return 'review';
  return 'contract';
}

function appliesFor(atom) {
  if (atom.type === 'Rule') {
    const interfaceName = RULE_INTERFACE_BY_PREFIX[atom.id.split('-')[0]];
    if (interfaceName) return interfaceName;
  }
  const file = atom.source.split('/').pop();
  if (file.startsWith('30')) return 'rest';
  if (file.startsWith('31')) return 'websocket';
  if (file.startsWith('32')) return 'cli';
  if (file.startsWith('33')) return 'grpc';
  if (file.startsWith('34')) return 'mcp';
  if (file.startsWith('35')) return 'a2a';
  return 'all';
}

function uniqueName(id, used) {
  const base = id.replace(/[^A-Za-z0-9._-]/g, '-');
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = base + '-' + index;
    index++;
  }
  used.add(candidate);
  return candidate;
}

function gitRepoRoot(start) {
  try {
    return execFileSync('git', ['-C', start, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return resolve(start);
  }
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function loadAliasMap(explicitPath) {
  const aliasPath = explicitPath ?? join(dirname(skillRoot()), basename(skillRoot()) + '.path-alias.json');
  return existsSync(aliasPath) ? JSON.parse(readFileSync(aliasPath, 'utf8')) : null;
}

function loadVerify(path) {
  const text = readFileSync(path, 'utf8');
  const document = path.endsWith('.toml') ? parseToml(text) : JSON.parse(text);
  const entries = document.verify ?? document;
  if (!Array.isArray(entries)) throw new Error('verify overlay must be an array');
  return entries;
}

function loadScans(path) {
  const text = readFileSync(path, 'utf8');
  if (path.endsWith('.toml')) {
    const document = parseToml(text);
    return Object.fromEntries((document.scan ?? []).map((scan) => [scan.id, scan]));
  }
  return JSON.parse(text);
}

function applyLawIdentity({ manifest, root, out }) {
  const policyPath = join(skillRoot(), 'source/implementation-policy.toml');
  if (!existsSync(policyPath)) return;
  try {
    const baseline = loadImplementationPolicy(policyPath);
    const metadata = readCargoMetadata({ root, locked: false });
    const effective = resolveEffectivePolicy({ baseline, project: { interfaces: projectInterfaces(metadata) } });
    manifest.spec_version = baseline.spec_version;
    manifest.policy_sha256 = effective.policy_sha256;
    manifest.dist_sha256 = existsSync(join(skillRoot(), 'dist/skill.mjs'))
      ? sha256(readFileSync(join(skillRoot(), 'dist/skill.mjs'), 'utf8'))
      : null;
    manifest.effective_policy = join(dirname(out), 'effective-policy.json');
    writeAtomic(manifest.effective_policy, JSON.stringify(effective, null, 2) + '\n');
    if (!effective.ok) manifest.policy_findings = effective.findings;
  } catch (error) {
    manifest.policy_findings = [{ kind: 'policy-unavailable', message: error.message }];
  }
}

function pickInterfaces(interfaces, active) {
  return Object.fromEntries(
    Object.entries(interfaces ?? {}).filter(([name]) => active.has(name)),
  );
}

function loadContractRules(path) {
  if (!existsSync(path)) return new Set();
  const document = parseToml(readFileSync(path, 'utf8'));
  return new Set((document.contract ?? []).map((contract) => contract.rule).filter(Boolean));
}

function loadContractLevels(path) {
  if (!existsSync(path)) return new Map();
  const document = parseToml(readFileSync(path, 'utf8'));
  return new Map((document.contract ?? []).map((contract) => [contract.rule, contract.level ?? 'V3']));
}

function loadTestStatuses(path) {
  if (!path || !existsSync(path)) return new Map();
  const document = JSON.parse(readFileSync(path, 'utf8'));
  return new Map((document.statuses ?? []).map((entry) => [entry.rule, entry]));
}

function projectInterfaces(metadata) {
  const dependencies = (metadata?.packages ?? []).flatMap((pkg) => pkg.dependencies ?? []);
  const byName = new Map(dependencies.map((dependency) => [dependency.name, dependency]));
  const map = {};
  const interfaces = {
    rest: 'axum',
    websocket: 'axum',
    cli: 'clap',
    grpc: 'tonic',
    mcp: 'rmcp',
    a2a: 'a2a-lf',
  };
  for (const [interfaceName, crate] of Object.entries(interfaces)) {
    const dependency = byName.get(crate);
    if (dependency) map[interfaceName] = { version: dependency.version };
  }
  return map;
}

function renderPlanMarkdown(result) {
  if (!result.ok) {
    return [
      '# Template — REJECTED',
      '',
      '| Path | Kind | Message |',
      '|---|---|---|',
      ...(result.findings ?? []).map((finding) => '| `' + (finding.path ?? '(plan)') + '` | ' + finding.kind + ' | ' + finding.message + ' |'),
      '',
      'No files written.',
      '',
    ].join('\n');
  }
  const files = result.plan?.files ?? result.files ?? [];
  return [
    '# Template — ' + (result.plan?.interface ?? ''),
    '',
    '| Path | Mode | Rules |',
    '|---|---|---|',
    ...files.map((file) => '| `' + file.path + '` | ' + file.mode + ' | ' + file.rules.join(', ') + ' |'),
    '',
    'Plan written to `--out`; use `scaffold` to apply it.',
    '',
  ].join('\n');
}

function renderImplementationReportMarkdown(report) {
  return [
    '# Implementation check — ' + (report.ok ? 'PASS' : 'FAIL'),
    '',
    '| Rule | Status |',
    '|---|---|',
    ...(report.statuses ?? []).map((status) => '| ' + status.rule + ' | ' + status.status + ' |'),
    '',
    'Findings: ' + (report.findings?.length ?? 0),
    '',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      options._.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const equals = body.indexOf('=');
    if (equals >= 0) {
      options[body.slice(0, equals)] = body.slice(equals + 1);
    } else if (index + 1 < argv.length && !argv[index + 1].startsWith('--')) {
      options[body] = argv[++index];
    } else {
      options[body] = true;
    }
  }
  return options;
}

function required(options, key) {
  if (!options[key]) throw new Error('--' + key + ' is required');
  return options[key];
}

function skillRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + '.tmp';
  writeFileSync(temporary, text);
  renameSync(temporary, path);
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
// Read commands hand the AI Markdown by default; machine consumers pass --format json.
// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-430 --for-spec --no-implementation-order`.
function writeValue(value, options) {
  process.stdout.write(formatValue(value, options.format ?? FORMAT_MARKDOWN));
}

export async function listCommand(argv) {
  const options = parseArgs(argv);
  const bundle = await loadBundle(join(skillRoot(), 'okf'));
  const entries = listDirectory(bundle, options.path ?? '')
    .map((entry) => ({ ...entry, command: lawEntryCommand(entry) }));
  writeValue({ path: options.path ?? '', entries }, options);
}

export async function showCommand(argv) {
  const options = parseArgs(argv);
  const bundle = await loadBundle(join(skillRoot(), 'okf'));
  const ruleMap = loadRuleMap(join(skillRoot(), 'source/rule-concepts.json'));
  const requested = position(options);
  const conceptId = resolveRuleConceptId(ruleMap, requested);
  const concept = bundle.byId.get(conceptId);
  const profile = options.profile ?? traversalProfile(concept);
  writeValue(showConcept({
    bundle,
    id: conceptId,
    profile,
    hop: readHop(options),
    stack: readStack(options),
  }), options);
}

export async function outgoingCommand(argv) {
  const options = parseArgs(argv);
  const bundle = await loadBundle(join(skillRoot(), 'okf'));
  const ruleMap = loadRuleMap(join(skillRoot(), 'source/rule-concepts.json'));
  const conceptId = resolveRuleConceptId(ruleMap, position(options));
  const page = traversalPage({ bundle, id: conceptId, options });
  writeValue(withEnvelope({ id: conceptId, edges: outgoingEdges({ bundle, id: conceptId }), page }), options);
}

export async function incomingCommand(argv) {
  const options = parseArgs(argv);
  const bundle = await loadBundle(join(skillRoot(), 'okf'));
  const ruleMap = loadRuleMap(join(skillRoot(), 'source/rule-concepts.json'));
  const conceptId = resolveRuleConceptId(ruleMap, position(options));
  const page = traversalPage({ bundle, id: conceptId, options });
  writeValue(withEnvelope({ id: conceptId, edges: incomingEdges({ bundle, id: conceptId }), page }), options);
}

export async function neighborsCommand(argv) {
  const options = parseArgs(argv);
  const bundle = await loadBundle(join(skillRoot(), 'okf'));
  const ruleMap = loadRuleMap(join(skillRoot(), 'source/rule-concepts.json'));
  const conceptId = resolveRuleConceptId(ruleMap, position(options));
  const page = traversalPage({ bundle, id: conceptId, options });
  writeValue(withEnvelope({ id: conceptId, edges: neighborEdges({ bundle, id: conceptId }), page }), options);
}

export async function requiredCommand(argv) {
  const options = parseArgs(argv);
  const bundle = await loadBundle(join(skillRoot(), 'okf'));
  if (options.rule) {
    const ruleMap = loadRuleMap(join(skillRoot(), 'source/rule-concepts.json'));
    const entry = ruleMap.byRule.get(String(options.rule)) ?? ruleMap.byAlias?.get(String(options.rule));
    if (!entry) throw Object.assign(new Error('unknown rule: ' + options.rule), { code: 'UNKNOWN_RULE' });
    const { nodes } = await loadLawNodes({ skillRoot: skillRoot() });
    const byConcept = new Map(nodes.map((node) => [node.concept_id, node]));
    const set = resolveRequired({ bundle, entryIds: [entry.concept_id] });
    const records = set.required.map((id) => toRuleRecord(byConcept.get(id), bundle, id)).filter(Boolean);
    writeValue({ ...set, ids: [...set.required], records }, options);
    return;
  }
  if (options.phase) {
    const { nodes } = await loadLawNodes({ skillRoot: skillRoot() });
    const phaseNodes = nodes.filter((node) => node.phase === options.phase);
    const required = [...new Set(phaseNodes.flatMap((node) => [node.id, ...(node.requires ?? [])]))].sort();
    const byRule = new Map(nodes.map((node) => [node.id, node]));
    const records = required.map((id) => toRuleRecord(byRule.get(id), bundle, null, id)).filter(Boolean);
    writeValue({
      phase: options.phase,
      summary: { phase: options.phase, rules: records.length },
      required,
      records,
    }, options);
    return;
  }
  throw new Error('required needs --rule or --phase');
}

/**
 * A rule record carries the facts an implementer needs to act.
 *
 * Bare ids force a second lookup per rule; the record keeps the id for callers
 * that only route, and the body for callers that implement.
 */
// [::TICKET::] PX-427, PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-427|PX-428) --for-spec --no-implementation-order`.
function toRuleRecord(node, bundle, conceptId, ruleId = null) {
  if (node) {
    return {
      id: node.concept_id,
      rule_id: node.id,
      title: node.title,
      phase: node.phase,
      applies_to: node.applies_to,
      verification: node.verification,
      enforcement: node.enforcement,
      body: node.body,
    };
  }
  const concept = conceptId ? bundle.byId.get(conceptId) : null;
  if (!concept) return null;
  return {
    id: concept.id,
    rule_id: ruleId ?? concept.frontmatter?.['x-rule-id'] ?? null,
    title: concept.title,
    phase: concept.frontmatter?.['x-phase'] ?? null,
    applies_to: concept.frontmatter?.['x-applies-to'] ?? null,
    verification: concept.frontmatter?.['x-verification'] ?? null,
    enforcement: concept.frontmatter?.['x-enforcement'] ?? null,
    body: conceptBody(concept),
  };
}

export async function searchCommand(argv) {
  const options = parseArgs(argv);
  const bundle = await loadBundle(join(skillRoot(), 'okf'));
  const rows = searchConcepts({
    bundle,
    query: options.query ?? '',
    commandPrefix: LAW_COMMAND_PREFIX,
  });
  writeValue({ query: options.query ?? '', rows }, options);
}

export async function lintCommand(argv) {
  const options = parseArgs(argv);
  const bundle = await loadBundle(join(skillRoot(), 'okf'));
  const findings = options.mode === 'conformance' ? validateConformance(bundle) : lintBundle(bundle);
  process.stdout.write(JSON.stringify({ mode: options.mode ?? 'lint', findings }) + '\n');
  if (findings.length > 0) process.exitCode = 1;
}

export async function trustCommand(argv) {
  const options = parseArgs(argv);
  const bundle = await loadBundle(join(skillRoot(), 'okf'));
  const rows = bundle.concepts
    .filter((concept) => !options.tier || concept.trustTier === options.tier)
    .map((concept) => ({ id: concept.id, rule_id: concept.frontmatter?.['x-rule-id'] ?? null, tier: concept.trustTier }));
  process.stdout.write(JSON.stringify({ rows }) + '\n');
}

export async function freshnessCommand(argv) {
  const options = parseArgs(argv);
  const bundle = await loadBundle(join(skillRoot(), 'okf'));
  const now = options.now ? new Date(`${options.now}T00:00:00Z`) : new Date();
  const rows = bundle.concepts
    .filter((concept) => concept.isStale(now))
    .map((concept) => ({ id: concept.id, rule_id: concept.frontmatter?.['x-rule-id'] ?? null, status: concept.status }));
  process.stdout.write(JSON.stringify({ rows }) + '\n');
}

export async function sourcesCommand(argv) {
  const options = parseArgs(argv);
  const bundle = await loadBundle(join(skillRoot(), 'okf'));
  const ruleMap = loadRuleMap(join(skillRoot(), 'source/rule-concepts.json'));
  const conceptId = resolveRuleConceptId(ruleMap, position(options));
  const concept = bundle.byId.get(conceptId);
  process.stdout.write(JSON.stringify({ id: conceptId, sources: concept?.sources ?? [] }) + '\n');
}

// [::TICKET::] PX-426, PX-425, PX-427, PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425|PX-427|PX-428) --for-spec --no-implementation-order`.
// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
// A law bundle mixes Rule pages and Section pages. Rules carry the enforcement
// facets; Sections carry the wiki facets. One explicit decision keeps the
// command prefix on $LAW for both.
// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
function traversalProfile(concept) {
  return concept?.frontmatter?.['x-rule-id'] ? 'law-implement' : 'law-wiki';
}

// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
function readHop(options) {
  return Number(options.hop ?? 0);
}

// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
function readStack(options) {
  return String(options.from ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
function traversalPage({ bundle, id, options }) {
  const concept = bundle.byId.get(id);
  return buildTraversal({
    bundle,
    id,
    profile: options.profile ?? traversalProfile(concept),
    hop: readHop(options),
    stack: readStack(options),
  });
}

// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
function withEnvelope({ id, edges, page }) {
  return {
    id,
    edges,
    protocol: page.protocol,
    node: page.node,
    coverage: page.coverage,
    frontier: page.frontier,
    guidance: page.guidance,
    backTo: page.backTo,
  };
}

// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
function lawEntryCommand(entry) {
  if (entry.kind === 'concept') return `${LAW_COMMAND_PREFIX} expand --id ${entry.id}`;
  if (entry.kind === 'directory') return `${LAW_COMMAND_PREFIX} list --path ${entry.path}`;
  const parentDirectory = entry.path.includes('/')
    ? entry.path.slice(0, entry.path.lastIndexOf('/'))
    : '/';
  return `${LAW_COMMAND_PREFIX} list --path ${parentDirectory}`;
}

// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
function position(options) {
  const value = options._?.[0] ?? options.id;
  if (!value) throw new Error('positional argument is required');
  return value;
}

// [::TICKET::] PX-426, PX-425, PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425|PX-428|PX-427) --for-spec --no-implementation-order`.
function resolveRuleConceptId(ruleMap, requested) {
  return (ruleMap.byRule.get(requested) ?? ruleMap.byAlias?.get(requested))?.concept_id ?? requested;
}
