#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  WorkspaceError,
  readManifests,
  discoverPackages,
  discoverWorkspaceArtifacts,
  discoverPackageArtifacts,
  parseTimestamp,
  mtime,
  ticketsOf,
  ticketKeyOf,
} from './progress-gif/parse.js';
import { derivePackageState, reconstructTicketGrowth, buildModel, buildFrames } from './progress-gif/loop.js';
import { computeLayout } from './progress-gif/layout.js';
import { renderHtml } from './progress-gif/html.js';
import { countUnresolvedStubs } from './progress-gif/stubs.js';
import { fitFramesToCeiling } from './progress-gif/engine.js';
import { loadFontBundle, collectUsedText } from './progress-gif/fonts.js';
import { snapshotFromModel, writeSnapshot, listSnapshots, readSnapshot, diffSnapshots } from './progress-gif/snapshot.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MAX_BYTES = 300 * 1024 * 1024;
const DEFAULT_FRAMES = 120;
const DEFAULT_FPS = 10;

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function expandHome(value) {
  if (typeof value !== 'string') return value;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function stampNow(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    target: null,
    open: true,
    dryRun: false,
    sourceScan: true,
    frames: DEFAULT_FRAMES,
    fps: DEFAULT_FPS,
    scale: 1,
    maxBytes: DEFAULT_MAX_BYTES,
    snapshotDir: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '-t' || argument === '--target') options.target = argv[++index];
    else if (argument === '--no-open') options.open = false;
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--no-source-scan') options.sourceScan = false;
    else if (argument === '--frames') options.frames = Math.max(1, Number(argv[++index]) || DEFAULT_FRAMES);
    else if (argument === '--fps') options.fps = Math.max(1, Math.min(30, Number(argv[++index]) || DEFAULT_FPS));
    else if (argument === '--scale') options.scale = Math.max(0.5, Math.min(3, Number(argv[++index]) || 1));
    else if (argument === '--max-bytes') options.maxBytes = Math.max(1, Number(argv[++index]) || DEFAULT_MAX_BYTES);
    else if (argument === '--snapshot-dir') options.snapshotDir = argv[++index];
    else throw new Error(`unknown argument: ${argument}\nusage: node draw-progress-gif.js -t <workspace> [options]`);
  }
  if (!options.target) throw new Error('usage: node draw-progress-gif.js -t <workspace> [options]: target is required');
  return options;
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function omissionTicketKeys(document) {
  if (!document) return [];
  if (Array.isArray(document.phases)) return ticketsOf(document).map(ticketKeyOf);
  const items = Array.isArray(document.omissions) ? document.omissions : [];
  return items.map((item) => item.ticketKey || item.key || (item.phaseId !== undefined && item.id !== undefined ? ticketKeyOf(item) : null)).filter(Boolean);
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function manifestTicketKeys(document) {
  if (!document) return [];
  if (Array.isArray(document)) return document.map((item) => item.sourceKey || item.ticketKey).filter(Boolean);
  const units = document.units || document.manifests || [];
  if (Array.isArray(units)) return units.map((item) => item.sourceKey || item.ticketKey).filter(Boolean);
  return [];
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function drillTicketKeys(artifacts) {
  const tickets = artifacts.tickets ? ticketsOf(artifacts.tickets) : [];
  return tickets.filter((ticket) => ticket.forNextRound || ticket.fromStub).map(ticketKeyOf);
}

// [::TICKET::] PX-349, PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-349|PX-350) --for-spec --no-implementation-order`.
function growthEventsOf(pkg, artifacts) {
  const snapshots = (artifacts.ticketSnapshots || []).map((entry) => ({
    ...entry,
    tickets: ticketsOf(readJson(entry.path)),
  }));
  const omissions = (artifacts.omissions || []).map((entry) => ({
    ...entry,
    ticketKeys: omissionTicketKeys(readJson(entry.path)),
  }));
  const manifests = (artifacts.manifests || []).map((entry) => ({
    ...entry,
    ticketKeys: manifestTicketKeys(readJson(entry.path)),
  }));
  const drills = [];
  if (artifacts.drillStatus) {
    const at = parseTimestamp(artifacts.drillStatus.updatedAt);
    if (at) drills.push({ path: artifacts.drillStatusPath, ...at, ticketKeys: drillTicketKeys(artifacts) });
  }
  const events = reconstructTicketGrowth({
    snapshots,
    omissions,
    manifests,
    drills,
    tickets: artifacts.tickets ? ticketsOf(artifacts.tickets) : [],
  });
  return events.map((event) => ({
    ...event,
    packageId: pkg.id,
    addedMass: event.addedContracts > 0 ? event.addedContracts : (event.addedTicketKeys || []).length,
  }));
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function initialTimeOf(root, tree, alloc, treePath) {
  const manifest = (tree.run && parseTimestamp(tree.run.generated_at))
    || (alloc.run && parseTimestamp(alloc.run.generated_at));
  if (manifest) return manifest.t;
  const treeMtime = mtime(treePath);
  return treeMtime === null ? 0 : treeMtime;
}

export function analyzeWorkspace(root, options = {}) {
  const { tree, alloc, warnings, treePath } = readManifests(root);
  const discovered = discoverPackages(root, tree, alloc);
  warnings.push(...discovered.warnings);
  const initialT = initialTimeOf(root, tree, alloc, treePath);
  const workspaceArtifacts = { ...discoverWorkspaceArtifacts(root, warnings), initialT };
  if (!workspaceArtifacts.smoothStatusPath) {
    workspaceArtifacts.smoothStatusPath = path.join(root, 'smooth-sequences', 'status.json');
  }
  const registry = Array.isArray(alloc.contract_registry) ? alloc.contract_registry : [];
  const packages = [];
  const events = [];
  const growthEvents = [];
  const packageDirs = new Set(discovered.packages.map((pkg) => pkg.dir));
  for (const pkg of discovered.packages) {
    const artifacts = discoverPackageArtifacts(root, pkg, warnings);
    const nested = new Set([...packageDirs].filter((dir) => dir !== pkg.dir && dir.startsWith(pkg.dir + path.sep)));
    artifacts.unresolvedStubs = options.sourceScan === false ? 0 : countUnresolvedStubs(pkg.dir, nested);
    const state = derivePackageState(pkg, artifacts, workspaceArtifacts, registry, warnings);
    packages.push(state.packageModel);
    events.push(...state.events);
    growthEvents.push(...growthEventsOf(pkg, artifacts));
  }
  const previous = previousSnapshot(root, options);
  if (previous) {
    const modelWithoutPrevious = { workspaceRoot: root, packages };
    const delta = diffSnapshots(previous, snapshotFromModel(modelWithoutPrevious));
    for (const change of delta.changed) {
      const alreadyExplained = growthEvents.some((event) => event.packageId === change.id);
      if (change.after > change.before && !alreadyExplained) {
        const addedContracts = change.after - change.before;
        growthEvents.push({
          packageId: change.id,
          t: initialT,
          prec: 'ms',
          stage: 'find',
          addedTicketKeys: [],
          addedContracts,
          addedMass: addedContracts,
          addedReviewed: 0,
          evidence: 'previous-snapshot',
          confidence: 'snapshot-diff',
        });
      }
    }
  }
  return buildModel({ workspaceRoot: root, tree, allocate: alloc, packages, events, growthEvents, warnings, initialT });
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function previousSnapshot(root, options) {
  const snapshotDir = options.snapshotDir || path.join(root, 'progress-gif', 'snapshots');
  const latest = listSnapshots(snapshotDir)[0];
  return latest ? readSnapshot(latest.path) : null;
}

// [::TICKET::] PX-349, PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-349|PX-350) --for-spec --no-implementation-order`.
function markdownReport(model, options, output, layout, frames) {
  const firstDensity = frames.length > 0 ? frames[0].density : 0;
  const finalDensity = frames.length > 0 ? frames[frames.length - 1].density : 0;
  const lines = [
    '# draw-progress-gif',
    '',
    `PASS: ${model.workspaceRoot}`,
    `- packages: ${model.totals.packages}`,
    `- split packages: ${model.totals.splitPackages}`,
    `- events: ${model.events.length}`,
    `- growth events: ${model.growthEvents.length}`,
    `- obligations: ${model.totals.obligations}`,
    `- covered: ${model.totals.covered}`,
    `- reviewed: ${model.totals.reviewed}`,
    `- canvas: ${layout.width}x${layout.height}`,
    `- density: ${firstDensity.toFixed(3)} -> ${finalDensity.toFixed(3)}`,
    `- frames: ${options.frames}`,
  ];
  if (output) {
    lines.push(`- html: ${output.html}`);
    lines.push(`- snapshot: ${output.snapshot}`);
  }
  if (model.warnings.length > 0) {
    lines.push('', '## warnings');
    for (const warning of model.warnings) lines.push(`- ${warning}`);
  }
  return `${lines.join('\n')}\n`;
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function uniqueBase(outputDir, date) {
  let cursor = new Date(date.getTime());
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const stamp = stampNow(cursor);
    const base = path.join(outputDir, stamp);
    if (!fs.existsSync(`${base}.html`) && !fs.existsSync(`${base}.gif`)) return { base, stamp };
    cursor = new Date(cursor.getTime() + 1000);
  }
  throw new WorkspaceError('could not allocate a unique output name', 3, 'Wait one second and re-run.');
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function writeHtmlFile(file, html) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, html, 'utf8');
  fs.renameSync(temporary, file);
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function sources() {
  const read = (name) => fs.readFileSync(path.join(MODULE_DIR, 'progress-gif', name), 'utf8');
  return {
    loopSource: read('loop.js'),
    layoutSource: read('layout.js'),
    engineSource: read('engine.js'),
    viewerSource: read('viewer.js'),
  };
}

export function run(root, options) {
  const model = analyzeWorkspace(root, options);
  const estimatedLayout = computeLayout(model, { measureText: (text) => String(text).length * 7, scale: options.scale });
  const fitted = fitFramesToCeiling(estimatedLayout, options.frames, options.maxBytes);
  if (fitted.frames !== options.frames) {
    options = { ...options, frames: fitted.frames };
    model.warnings.push(...fitted.warnings);
  }
  const frames = buildFrames(model, options);
  if (options.dryRun) {
    process.stdout.write(markdownReport(model, options, null, estimatedLayout, frames));
    return { model, frames, output: null };
  }
  const outputDir = path.join(root, 'progress-gif');
  fs.mkdirSync(outputDir, { recursive: true });
  const { base, stamp } = uniqueBase(outputDir, new Date());
  const title = `PROGRESS: ${path.basename(root)}`;
  const usedText = collectUsedText(model, { title });
  const font = loadFontBundle(path.join(MODULE_DIR, 'progress-gif', 'fonts'), usedText);
  model.warnings.push(...font.warnings);
  const html = renderHtml({
    model,
    options: { ...options, title, frames: options.frames, fps: options.fps, stamp },
    ...sources(),
    fontCss: font.css,
  });
  const htmlPath = `${base}.html`;
  writeHtmlFile(htmlPath, html);
  const snapshotDir = options.snapshotDir || path.join(outputDir, 'snapshots');
  const snapshotPath = writeSnapshot(snapshotDir, stamp, snapshotFromModel(model));
  const output = { html: htmlPath, snapshot: snapshotPath };
  process.stdout.write(markdownReport(model, options, output, estimatedLayout, frames));
  if (options.open) openBrowser(htmlPath);
  return { model, frames, output };
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function openBrowser(file) {
  const url = `file://${file}`;
  const command = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  try {
    spawn(command[0], command[1], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch {
    // Opening a browser is a convenience; the HTML path is already in the report.
  }
}

export function main() {
  try {
    const options = parseArgs();
    const root = path.resolve(expandHome(options.target));
    let stat;
    try {
      stat = fs.statSync(root);
    } catch {
      throw new WorkspaceError(`target is not a directory: ${root}`, 2, 'Pass an existing workspace directory with -t.');
    }
    if (!stat.isDirectory()) throw new WorkspaceError(`target is not a directory: ${root}`, 2, 'Pass an existing workspace directory with -t.');
    run(root, options);
  } catch (error) {
    if (error instanceof WorkspaceError) {
      process.stderr.write(`[ERROR] ${error.message}\nCause: ${error.message}\nAction: ${error.action || 'Fix the input and re-run.'}\n`);
      process.exit(error.exitCode || 2);
    }
    process.stderr.write(`[ERROR] ${error.message}\nCause: unexpected failure\nAction: Inspect the error and re-run.\n`);
    process.exit(3);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
