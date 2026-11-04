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
import { derivePackageState, reconstructTicketGrowth, buildModel, buildFrames, displayDateKey } from './progress-gif/loop.js';
import { historyRunMarkers } from './progress-gif/history.js';
import { aggregateUsage, dailySeries } from './progress-gif/usage.js';
import { CACHE_FILE_NAME } from './progress-gif/usage-cache.js';
import { computeLayout, formatPercent } from './progress-gif/layout.js';
import { renderHtml } from './progress-gif/html.js';
import { countUnresolvedStubs } from './progress-gif/stubs.js';
import { fitFramesToCeiling } from './progress-gif/engine.js';
import { DEFAULT_FRAMES, clampFrames } from './progress-gif/viewer.js';
import { loadFontBundle, collectUsedText } from './progress-gif/fonts.js';
import {
  SNAPSHOT_SCHEMA,
  listSnapshots,
  computePreviousProgress,
  readSnapshot,
  snapshotFromModel,
  writeSnapshot,
} from './progress-gif/snapshot.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MAX_BYTES = 300 * 1024 * 1024;
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
    speedMs: null,
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
    else if (argument === '--frames') options.frames = clampFrames(argv[++index]);
    else if (argument === '--fps') {
      options.fps = Math.max(1, Math.min(30, Number(argv[++index]) || DEFAULT_FPS));
      options.speedMs = Math.round(1000 / options.fps);
    }
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

/** The drill growth source: history runs when present, the single status file otherwise. */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function drillGrowthRuns(artifacts) {
  const finishes = (artifacts.historyRecords ?? []).filter(
    (record) => record.event === 'finish' && record.stage === 'drill',
  );
  if (finishes.length > 0) {
    const runs = finishes
      .map((record) => ({
        path: artifacts.historyPath,
        t: parseTimestamp(record.at)?.t,
        prec: 'ms',
        ticketKeys: record.addedTicketKeys ?? [],
      }))
      .filter((run) => Number.isFinite(run.t));
    return { fromHistory: true, runs };
  }
  if (!artifacts.drillStatus) return { fromHistory: false, runs: [] };
  const at = parseTimestamp(artifacts.drillStatus.updatedAt);
  return {
    fromHistory: false,
    runs: at ? [{ path: artifacts.drillStatusPath, ...at, ticketKeys: drillTicketKeys(artifacts) }] : [],
  };
}

// [::TICKET::] PX-349, PX-350, PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-349|PX-350|PX-366) --for-spec --no-implementation-order`.
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
  const drillSource = drillGrowthRuns(artifacts);
  const events = reconstructTicketGrowth({
    snapshots,
    omissions,
    manifests,
    drills: drillSource.fromHistory ? [] : drillSource.runs,
    priorityDrills: drillSource.fromHistory ? drillSource.runs : [],
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

// [::TICKET::] PX-364 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-364 --for-spec --no-implementation-order`.
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
  const runs = [];
  const packageDirs = new Set(discovered.packages.map((pkg) => pkg.dir));
  for (const pkg of discovered.packages) {
    const artifacts = discoverPackageArtifacts(root, pkg, warnings);
    const nested = new Set([...packageDirs].filter((dir) => dir !== pkg.dir && dir.startsWith(pkg.dir + path.sep)));
    artifacts.unresolvedStubs = options.sourceScan === false ? 0 : countUnresolvedStubs(pkg.dir, nested);
    const state = derivePackageState(pkg, artifacts, workspaceArtifacts, registry, warnings);
    packages.push(state.packageModel);
    events.push(...state.events);
    growthEvents.push(...growthEventsOf(pkg, artifacts));
    runs.push(...historyRunMarkers(pkg.id, artifacts.historyRecords));
  }
  runs.push(...historyRunMarkers(null, workspaceArtifacts.historyRecords));
  const previousProgress = readPreviousProgress(root, options, warnings);
  return buildModel({
    workspaceRoot: root, tree, allocate: alloc, packages, events, growthEvents, runs,
    warnings, initialT, previousProgress,
  });
}

// [::TICKET::] PX-349, PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-349|PX-353) --for-spec --no-implementation-order`.
function snapshotDirectory(root, options, outputDir = path.join(root, 'progress-gif')) {
  return options.snapshotDir || path.join(outputDir, 'snapshots');
}

/**
 * Read the boundary of the newest completed render. The newest file is
 * authoritative: an unreadable one yields no marker rather than an older run's
 * boundary, which would misreport where the previous animation ended.
 */
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
function readPreviousProgress(root, options, warnings) {
  const directory = snapshotDirectory(root, options);
  const newest = listSnapshots(directory)[0];
  if (!newest) return null;
  const snapshot = readSnapshot(newest.path);
  if (!snapshot || snapshot.schema !== SNAPSHOT_SCHEMA) {
    warnings.push(`[snapshot] ${newest.path}: unreadable; previous boundary not drawn`);
    return null;
  }
  return computePreviousProgress(snapshot);
}

// [::TICKET::] PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-353 --for-spec --no-implementation-order`.
function usageCachePath(root, options) {
  // A dry run promises no filesystem writes, so it never touches the cache.
  if (options.dryRun) return null;
  return path.join(snapshotDirectory(root, options), CACHE_FILE_NAME);
}

// [::TICKET::] PX-349, PX-350, PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-349|PX-350|PX-351) --for-spec --no-implementation-order`.
function markdownReport(model, options, output, layout, frames) {
  const firstDensity = frames.length > 0 ? frames[0].density : 0;
  const finalDensity = frames.length > 0 ? frames[frames.length - 1].density : 0;
  const finalProgress = frames.length > 0 ? frames[frames.length - 1].overallProgress : 0;
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
    `- overall progress: ${formatPercent(finalProgress)}`,
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

// [::TICKET::] PX-352, PX-353 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-352|PX-353) --for-spec --no-implementation-order`.
async function collectUsageSeries(root, model, options) {
  try {
    const aggregation = await aggregateUsage({
      directory: root,
      cachePath: usageCachePath(root, options),
      dateKey: (ms) => displayDateKey(ms, 'ms'),
    });
    model.warnings.push(...aggregation.warnings);
    return { series: dailySeries(aggregation.groups), available: !aggregation.projectsDirMissing };
  } catch (error) {
    model.warnings.push(`usage unavailable: ${error.message}`);
    return { series: [], available: false };
  }
}

export async function run(root, options) {
  const model = analyzeWorkspace(root, options);
  const titleName = path.basename(root);
  model.titleName = titleName;
  const usageScan = await collectUsageSeries(root, model, options);
  model.usage = usageScan.series;
  model.usageAvailable = usageScan.available;
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
  const title = `PROGRESS: ${titleName}`;
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
  const finalFrame = frames[frames.length - 1];
  const overallProgress = finalFrame && Number.isFinite(finalFrame.overallProgress)
    ? finalFrame.overallProgress
    : null;
  const snapshotPath = writeSnapshot(
    snapshotDirectory(root, options, outputDir),
    stamp,
    snapshotFromModel(model, { overallProgress }),
  );
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

export async function main() {
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
    await run(root, options);
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
