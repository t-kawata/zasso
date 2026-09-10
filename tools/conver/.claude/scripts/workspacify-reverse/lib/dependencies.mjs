// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
/**
 * R2 — the dependency measurement, recorded as a hypothesis.
 *
 * The one thing this module may not do is present an import graph as if it were
 * a coupling graph. An import is a statement in the source; coupling is what
 * happens when the program runs, and between the two sit dynamic dispatch,
 * dependency injection, plugin registration, configuration-driven selection and
 * reflection. The design names the failure this prevents — F4, the static
 * analysis blind spot — and the mechanical guard is that every result carries
 * `coupling_claim: "hypothesis"` and `represents_runtime_binding: false`.
 *
 * A package edge is derived from a `use` declaration's first segment, resolved
 * to the source member that declares that module. The resolution is the same
 * one R0.5 already uses, reused rather than reimplemented, so the two stages
 * cannot disagree about which module a path names.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ANALYSIS_MODES,
  assertAdapterResult,
  renderCappedList,
  emptyCoverage,
  listArtefacts,
  recordAttempt,
} from './analysis-tech.mjs';
import { BUILD_MANIFESTS, compareText } from './holdout-ledger.mjs';
import { owningDirectoryOf, resolveSourceMember } from './claim-ledger.mjs';
import {
  collectRustModules,
  collectRustUses,
  parseSourceFile,
  syntaxLanguageOf,
  syntaxRecoveryDiagnostic,
} from './structure.mjs';

/** The claim this measurement is allowed to make about coupling. */
export const COUPLING_CLAIM = 'hypothesis';

/**
 * What the import graph does not say, in the words every consumer reads.
 *
 * It is a constant rather than a sentence built per run because a caveat that
 * varies with the data invites reading it as a finding rather than as the
 * standing limitation of the method.
 */
export const RUNTIME_BINDING_CAVEAT =
  'An import graph is a hypothesis about coupling read from use declarations. '
  + 'It does not represent runtime binding: dynamic dispatch, dependency injection, plugin '
  + 'registration, configuration-driven selection and reflection all couple code that no import '
  + 'names. The execution surface measured at R2.5 lists those mechanisms separately, and a '
  + 'proposition touching one of them may not be classified observed on this graph alone.';

/**
 * The external dependencies a build manifest declares.
 *
 * Read line by line rather than parsed as TOML: the sections this needs are
 * flat, and a full TOML parser would be a dependency this ticket does not
 * declare. A line the reader does not recognise is skipped, never guessed at.
 */
export function externalDependenciesIn(root, manifestPath) {
  let text;
  try {
    text = readFileSync(join(root, manifestPath), 'utf8');
  } catch (error) {
    return {
      manifest: manifestPath,
      dependencies: [],
      reason: `${error.code ?? 'error'}: the manifest could not be read`,
    };
  }

  const dependencies = [];
  let section = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    if (section === null || !section.endsWith('dependencies')) continue;
    const assignment = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!assignment) continue;
    dependencies.push({
      name: assignment[1],
      section,
      requirement: assignment[2].replace(/\s+#.*$/, '').trim(),
    });
  }

  return {
    manifest: manifestPath,
    dependencies: dependencies.sort((left, right) => compareText(left.name, right.name)),
    reason: null,
  };
}

/** The build manifests present in the measured population. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function manifestsInScope(root, excludedPaths) {
  const excluded = new Set(excludedPaths);
  return listArtefacts(root)
    .filter((artefact) => artefact.readStatus === 'readable' && !artefact.exclusion && !excluded.has(artefact.path))
    .map((artefact) => artefact.path)
    .filter((path) => BUILD_MANIFESTS.includes(path.split('/').pop()))
    .sort(compareText);
}

/**
 * The package a file belongs to: the directory that owns it.
 *
 * Packages are directories here because that is the unit E1 measures and the
 * unit the design's directory-boundary work consumes; a per-file graph would be
 * a different measurement wearing the same name.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function packageOf(relativePath) {
  return relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : '.';
}

/**
 * One edge per ordered package pair, with every location that produced it.
 *
 * Locations are collected rather than collapsed to the first, because an edge
 * supported by one `use` and an edge supported by forty are different evidence
 * for the boundary work downstream, and discarding the count would hide that.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function edgesFrom(records) {
  const byPair = new Map();
  for (const record of records) {
    if (record.from === record.to) continue;
    const key = `${record.from} ${record.to}`;
    if (!byPair.has(key)) {
      byPair.set(key, { from: record.from, to: record.to, kind: 'syntactic_import', locations: [] });
    }
    byPair.get(key).locations.push({ file: record.file, line: record.line, spelling: record.spelling });
  }
  return [...byPair.values()]
    .map((edge) => ({
      ...edge,
      locations: edge.locations
        .sort((left, right) => compareText(`${left.file}:${left.line}`, `${right.file}:${right.line}`)),
      count: edge.locations.length,
    }))
    .sort((left, right) => compareText(`${left.from}->${left.to}`, `${right.from}->${right.to}`));
}

/**
 * The strongly connected components of the package graph, cycles only.
 *
 * Tarjan's algorithm, driven by an explicit work list so that a deep graph
 * cannot overflow the stack. Only a component with more than one member, or a
 * self-edge, is a cycle: reporting a component of one would fill the report
 * with packages that merely exist.
 */
export function findPackageCycles(edges, packages) {
  const adjacency = new Map(packages.map((name) => [name, []]));
  const selfEdges = new Set();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from).push(edge.to);
    if (edge.from === edge.to) selfEdges.add(edge.from);
  }

  const index = new Map();
  const lowLink = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  let nextIndex = 0;

  for (const start of [...adjacency.keys()].sort(compareText)) {
    if (index.has(start)) continue;
    const work = [{ node: start, childIndex: 0 }];
    while (work.length > 0) {
      const frame = work[work.length - 1];
      if (frame.childIndex === 0) {
        index.set(frame.node, nextIndex);
        lowLink.set(frame.node, nextIndex);
        nextIndex += 1;
        stack.push(frame.node);
        onStack.add(frame.node);
      }
      const children = adjacency.get(frame.node) ?? [];
      if (frame.childIndex < children.length) {
        const child = children[frame.childIndex];
        frame.childIndex += 1;
        if (!index.has(child)) {
          work.push({ node: child, childIndex: 0 });
        } else if (onStack.has(child)) {
          lowLink.set(frame.node, Math.min(lowLink.get(frame.node), index.get(child)));
        }
        continue;
      }
      work.pop();
      if (lowLink.get(frame.node) === index.get(frame.node)) {
        const component = [];
        for (;;) {
          const member = stack.pop();
          onStack.delete(member);
          component.push(member);
          if (member === frame.node) break;
        }
        if (component.length > 1 || selfEdges.has(component[0])) components.push(component.sort(compareText));
      }
      if (work.length > 0) {
        const parent = work[work.length - 1];
        lowLink.set(parent.node, Math.min(lowLink.get(parent.node), lowLink.get(frame.node)));
      }
    }
  }

  return components.sort((left, right) => compareText(left[0], right[0]));
}

/**
 * The files the dependency measurement attempts: in-scope, and of a known language.
 *
 * An unreadable entry stays in the population so that its attempt fails and
 * leaves a ledger row, rather than disappearing from the measurement without
 * anything recording that it was skipped.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function measuredFiles(root, excludedPaths) {
  const excluded = new Set(excludedPaths);
  return listArtefacts(root)
    .filter((artefact) => !artefact.exclusion && !excluded.has(artefact.path))
    .map((artefact) => artefact.path)
    .filter((path) => syntaxLanguageOf(path) !== 'unknown')
    .sort(compareText);
}

/**
 * R2 — the dependency measurement.
 *
 * @param {{root: string, excludedPaths?: string[], grammar?: object|null, surface?: object|null}} params
 */
export function measureDependencies({ root, excludedPaths = [], grammar, surface = null } = {}) {
  const coverage = emptyCoverage();
  const attempts = [];
  const limitations = [];
  const records = [];
  const declaredModules = [];
  const unresolvedByFile = [];

  const files = measuredFiles(root, excludedPaths);
  coverage.files_discovered = files.length;

  for (const file of files) {
    const language = syntaxLanguageOf(file);
    if (language !== 'rust') {
      attempts.push(recordAttempt({
        target: file,
        configuration: 'syntax-only',
        tool: `tree-sitter-${language}`,
        outcome: {
          phase: 'parse',
          status: 'skipped',
          extractedCount: 0,
          reason: 'no_edge_extractor_for_language',
        },
      }));
      continue;
    }

    const parsed = parseSourceFile(root, file, { grammar });
    if (!parsed.ok) {
      attempts.push(recordAttempt({
        target: file,
        configuration: 'syntax-only',
        tool: 'tree-sitter-rust',
        outcome: {
          phase: 'parse',
          status: 'failed',
          diagnostics: [{ severity: 'error', message: parsed.message }],
          extractedCount: 0,
          reason: parsed.reason,
        },
      }));
      continue;
    }

    coverage.files_parsed += 1;
    if (parsed.errorNodes) coverage.files_with_error_nodes += 1;

    let resolved = 0;
    let unresolved = 0;
    for (const use of collectRustUses(parsed.tree, file)) {
      const firstSegment = use.target.replace(/^(crate|self|super)::/, '').split('::')[0];
      const member = resolveSourceMember(root, firstSegment);
      if (member === null) {
        // A `use` that names no source member is a gap in the graph, not an
        // absent dependency. Counting it is what keeps the edge list from
        // reading as the whole of the coupling the source states.
        unresolved += 1;
        continue;
      }
      records.push({
        from: packageOf(file),
        to: owningDirectoryOf(member),
        file: use.file,
        line: use.line,
        spelling: use.target,
      });
      resolved += 1;
    }
    if (unresolved > 0) unresolvedByFile.push({ file, count: unresolved });

    for (const module of collectRustModules(parsed.tree, file)) {
      declaredModules.push({ ...module, from: packageOf(file) });
    }

    attempts.push(recordAttempt({
      target: file,
      configuration: 'syntax-only',
      tool: 'tree-sitter-rust',
      outcome: {
        phase: 'parse',
        status: parsed.errorNodes ? 'partial' : 'success',
        diagnostics: parsed.errorNodes ? [syntaxRecoveryDiagnostic(parsed.tree)] : [],
        extractedCount: resolved,
        reason: null,
      },
    }));
  }

  const edges = edgesFrom(records);
  const packages = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))].sort(compareText);

  const manifests = manifestsInScope(root, excludedPaths);
  coverage.configs_enumerated = manifests.length;
  const external = manifests.map((manifest) => externalDependenciesIn(root, manifest));
  coverage.configs_analyzed = external.filter((entry) => entry.reason === null).length;
  for (const entry of external) {
    if (entry.reason === null) continue;
    limitations.push({
      code: 'MANIFEST_UNREADABLE',
      scope: entry.manifest,
      effect: 'external dependencies could not be inventoried from this manifest, so an empty external list for it means it was not read rather than that none are declared',
    });
  }

  if (unresolvedByFile.length > 0) {
    const total = unresolvedByFile.reduce((sum, entry) => sum + entry.count, 0);
    const first = unresolvedByFile.slice(0, 10).map((entry) => `${entry.file} (${entry.count})`);
    limitations.push({
      code: 'IMPORT_NOT_RESOLVED',
      scope: unresolvedByFile.slice(0, 10).map((entry) => entry.file).join(', ')
        + (unresolvedByFile.length > 10 ? `, and ${unresolvedByFile.length - 10} more file(s)` : ''),
      effect: `${total} use declaration(s) name a module this walk could not resolve to a source member `
        + `— in ${first.join(', ')}${unresolvedByFile.length > 10 ? ', and more' : ''}. The graph below therefore `
        + 'holds fewer edges than the source states, and an absent edge here is a gap in the measurement '
        + 'rather than an absence of coupling',
    });
  }

  const dynamicMechanismCount = Array.isArray(surface?.mechanisms) ? surface.mechanisms.length : null;
  const caveat = dynamicMechanismCount === null
    ? RUNTIME_BINDING_CAVEAT
    : `${RUNTIME_BINDING_CAVEAT} This run enumerated ${dynamicMechanismCount} dynamic mechanism(s) at R2.5; `
      + 'each one is a place where the graph below and the running program can disagree.';

  return assertAdapterResult({
    analysis_mode: ANALYSIS_MODES[0],
    coverage: { ...coverage, files_semantically_resolved: 0 },
    limitations,
    coupling_claim: COUPLING_CLAIM,
    represents_runtime_binding: false,
    runtime_binding_caveat: caveat,
    edges,
    packages,
    cycles: findPackageCycles(edges, packages),
    declaredModules: declaredModules
      .sort((left, right) => compareText(`${left.file}:${left.line}`, `${right.file}:${right.line}`)),
    external,
    attempts,
  });
}

/** The dependency report, as Markdown for a reader rather than JSON for a machine. */
export function renderDependencyReport(dependencies) {
  const lines = [
    '# R2 — the dependency hypothesis',
    '',
    `Analysis mode: \`${dependencies.analysis_mode}\`. The coupling claim is \`${dependencies.coupling_claim}\`,`,
    `and this graph represents runtime binding: \`${dependencies.represents_runtime_binding}\`.`,
    '',
    `> ${dependencies.runtime_binding_caveat}`,
    '',
    '## Measured edges',
    '',
    '| From | To | Kind | Imports | First location |',
    '|---|---|---|---|---|',
    ...dependencies.edges.map(
      (edge) => `| \`${edge.from}\` | \`${edge.to}\` | ${edge.kind} | ${edge.count} | `
        + `${edge.locations[0].file}:${edge.locations[0].line} |`,
    ),
    '',
    '## Cycles',
    '',
    dependencies.cycles.length === 0
      ? 'No cycle was found among the packages this import graph reaches. That is a fact about this'
        + ' graph and not a promise about the program: a cycle that runs through a dynamic mechanism'
        + ' is invisible here.'
      : 'Each entry is a set of packages that can all reach one another. The order is alphabetical'
        + ' and is **not** a path: nothing here claims an edge runs from each package to the next.\n\n'
        + renderCappedList(dependencies.cycles, (cycle) => (cycle.length === 1
          ? `- \`${cycle[0]}\` imports itself`
          : `- ${cycle.length} mutually reachable: ${cycle.map((name) => `\`${name}\``).join(', ')}`)).join('\n'),
    '',
    '## External dependencies',
    '',
    ...dependencies.external.flatMap((entry) => [
      `### \`${entry.manifest}\``,
      '',
      entry.reason === null
        ? (entry.dependencies.length === 0
          ? '_none declared_'
          : entry.dependencies.map((dependency) => `- \`${dependency.name}\` — ${dependency.requirement}`).join('\n'))
        : `_not read: ${entry.reason}_`,
      '',
    ]),
    '## Limitations',
    '',
    ...renderCappedList(
      dependencies.limitations,
      (limitation) => `- \`${limitation.code}\` over \`${limitation.scope}\` — ${limitation.effect}`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}
