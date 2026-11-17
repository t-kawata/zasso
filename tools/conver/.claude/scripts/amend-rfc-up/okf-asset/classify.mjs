// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
/**
 * Classify a measured asset into an include decision.
 *
 * Policy is data: a caller may lower the file-size limit or add a path rule
 * without changing this module. Every refusal carries a code and a reason.
 */

import {
  ASSET_CODES,
  CJK_PATTERN,
  DEFAULT_EXCLUDES,
  LIMITS,
  PROCEDURE_EXTENSIONS,
  SECRET_PATTERN,
} from './constants.mjs';

const SECRET_PATH_PATTERN = /(^|\/)(private|secrets)\/|\.pem$|\.key$|\.p12$|id_rsa$|\.pfx$/i;
const DERIVED_PATH_PATTERN = /\.pcap$|\.pcapng$|\.log$|\.zip$|\.tar$|\.gz$|\.DS_Store$/i;

export function isSecretPath(relativePath) {
  return SECRET_PATH_PATTERN.test(relativePath);
}

export function isDerivedPath(relativePath) {
  if (DERIVED_PATH_PATTERN.test(relativePath)) return true;
  return DEFAULT_EXCLUDES.some((prefix) => relativePath.startsWith(prefix));
}

export function isProcedurePath(relativePath) {
  const name = relativePath.split('/').pop() ?? relativePath;
  if (name === 'Dockerfile' || name === 'Containerfile' || name === 'bootstrap') return true;
  const extension = name.includes('.') ? `.${name.split('.').pop().toLowerCase()}` : '';
  return PROCEDURE_EXTENSIONS.has(extension);
}

/**
 * @param {{path:string, kind:string, text:string|null, bytes:number}} measurement
 * @param {{maxFileBytes?:number}} policy
 */
export function classifyAsset(measurement, policy = {}) {
  const maxFileBytes = policy.maxFileBytes ?? LIMITS.maxFileBytes;
  const type = isProcedurePath(measurement.path) ? 'Procedure' : 'Reference';
  if (isSecretPath(measurement.path)) {
    return { include: false, code: ASSET_CODES.SECRET_EXCLUDED, type, reason: 'secret-bearing path' };
  }
  if (isDerivedPath(measurement.path)) {
    return { include: false, code: ASSET_CODES.DERIVED_EXCLUDED, type, reason: 'generated or private path' };
  }
  if (measurement.kind === 'binary') {
    if (policy.includeBinary === false) {
      return {
        include: false,
        code: ASSET_CODES.BINARY_EXCLUDED,
        type: 'Reference',
        reason: 'binary assets are disabled by policy',
      };
    }
    return {
      include: true,
      code: ASSET_CODES.BINARY_INDEXED,
      type: 'Reference',
      reason: 'binary asset indexed as metadata',
    };
  }
  if (CJK_PATTERN.test(measurement.text ?? '')) {
    return { include: false, code: ASSET_CODES.NOT_ENGLISH, type, reason: 'CJK text' };
  }
  if (SECRET_PATTERN.test(measurement.text ?? '')) {
    return { include: false, code: ASSET_CODES.SECRET_EXCLUDED, type, reason: 'secret-bearing content' };
  }
  if (measurement.bytes > maxFileBytes) {
    return { include: false, code: ASSET_CODES.SIZE_EXCLUDED, type, reason: 'file exceeds size limit' };
  }
  return { include: true, code: null, type, reason: 'text asset' };
}
