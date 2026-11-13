import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DETECTORS = {
  'scan/forbidden-dependency': {
    kind: 'forbidden-dependency',
    pattern: /\b(?:actix-web|warp|poem)\b/g,
    message: 'forbidden interface dependency',
  },
  'scan/dispatcher-bypass': {
    kind: 'dispatcher-bypass',
    pattern: /\b(?:operation_impl|operation_implementation|handlers?)::[A-Za-z_][A-Za-z0-9_]*\s*\(/g,
    message: 'adapter calls an operation implementation instead of the dispatcher',
  },
  'scan/manual-jsonrpc': {
    kind: 'manual-jsonrpc',
    pattern: /["']jsonrpc["']\s*:/g,
    message: 'manual JSON-RPC framing is forbidden',
  },
  'scan/local-session-authority': {
    kind: 'local-session-authority',
    pattern: /\b(?:LocalSessionManager|InMemorySessionStore|InMemoryTaskStore)\b/g,
    message: 'authoritative protocol state must be external',
  },
  'scan/stream-buffering': {
    kind: 'stream-buffering',
    pattern: /(?:try_)?collect\s*(?:::<[^\n]*Vec|\()/g,
    message: 'stream items must not be buffered',
  },
  'scan/argv-secret': {
    kind: 'argv-secret',
    pattern: /--(?:password|token|secret)\b/g,
    message: 'credential contents must not be read from argv',
  },
  'scan/clap-on-operation-type': {
    kind: 'clap-on-operation-type',
    pattern: /#\[(?:arg|command)\b/g,
    message: 'clap attributes must not annotate operation-domain types',
  },
  'scan/protobuf-in-core': {
    kind: 'protobuf-in-core',
    pattern: /\b(?:prost::|include_proto!)/g,
    message: 'protobuf types must stay outside core and operation contracts',
  },
  'scan/in-memory-task-store': {
    kind: 'in-memory-task-store',
    pattern: /\bInMemoryTaskStore\b/g,
    message: 'production A2A task state must be external',
  },
  'scan/query-ticket': {
    kind: 'query-ticket',
    pattern: /\bQuery<[^>]*[Tt]icket/g,
    message: 'session tickets must not be read from the query string',
  },
  'scan/unbounded-channel': {
    kind: 'unbounded-channel',
    pattern: /\b(?:unbounded_channel|UnboundedSender|blocking_send)\b/g,
    message: 'connection queues must be bounded and non-blocking',
  },
};

export function detectorIds() {
  return Object.keys(DETECTORS);
}

export function runRegisteredScan(id, input = {}) {
  const detector = DETECTORS[id];
  if (!detector) throw new Error('unknown scan: ' + id);
  const findings = [];
  for (const source of sourcesFrom(input)) {
    const text = String(source.text ?? '');
    for (const match of text.matchAll(detector.pattern)) {
      findings.push({
        path: source.path ?? '(input)',
        line: lineAt(text, match.index ?? 0),
        kind: detector.kind,
        message: detector.message,
        fix: fixFor(detector.kind),
      });
    }
  }
  return {
    ok: findings.length === 0,
    status: findings.length === 0 ? 'passed' : 'failed',
    findings,
  };
}

export function scanFiles({ root, paths = [], detectors = detectorIds() }) {
  const findings = [];
  for (const path of paths) {
    let text = '';
    try {
      text = readFileSync(join(root, path), 'utf8');
    } catch {
      continue;
    }
    for (const id of detectors) {
      const result = runRegisteredScan(id, { text, path });
      findings.push(...result.findings);
    }
  }
  return { ok: findings.length === 0, findings };
}

function sourcesFrom(input) {
  if (Array.isArray(input.files)) return input.files;
  return [{ path: input.path ?? '(input)', text: input.text ?? '' }];
}

function lineAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function fixFor(kind) {
  return 'Remove the ' + kind + ' pattern or route the behavior through the admitted adapter path';
}
