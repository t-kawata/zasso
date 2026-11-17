// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
/**
 * Shared constants for the build-time asset ingestion helpers.
 *
 * These values are the single source for modes, codes, and limits. A caller
 * must not repeat them as string literals.
 */

export const ASSET_MODES = Object.freeze({
  MANIFEST: 'manifest',
  BUNDLE: 'bundle',
  SPEC_REFERENCE: 'spec-reference',
  SEMANTIC: 'semantic',
  HEURISTIC: 'heuristic',
  NONE: 'none',
});

export const ASSET_CODES = Object.freeze({
  INPUT_UNDECLARED: 'ASSET_INPUT_UNDECLARED',
  DISCOVERY_AMBIGUOUS: 'ASSET_DISCOVERY_AMBIGUOUS',
  REFERENCE_MISSING: 'ASSET_REFERENCE_MISSING',
  ROOT_MISSING: 'ASSET_ROOT_MISSING',
  OUTSIDE_ROOT: 'ASSET_OUTSIDE_ROOT',
  NOT_TEXT: 'ASSET_NOT_TEXT',
  BINARY_INDEXED: 'ASSET_BINARY_INDEXED',
  BINARY_EXCLUDED: 'ASSET_BINARY_EXCLUDED',
  NOT_ENGLISH: 'ASSET_NOT_ENGLISH',
  SECRET_EXCLUDED: 'ASSET_SECRET_EXCLUDED',
  DERIVED_EXCLUDED: 'ASSET_DERIVED_EXCLUDED',
  SIZE_EXCLUDED: 'ASSET_SIZE_EXCLUDED',
  ALIAS_DUPLICATE: 'ASSET_ALIAS_DUPLICATE',
  WEAK_CANDIDATE: 'ASSET_WEAK_CANDIDATE',
  COVERAGE_GAP: 'ASSET_COVERAGE_GAP',
  HASH_MISMATCH: 'ASSET_HASH_MISMATCH',
  MANIFEST_MISSING: 'ASSET_MANIFEST_MISSING',
  INSTALL_MISSING: 'ASSET_INSTALL_MISSING',
  SEMANTIC_PATH_MISSING: 'ASSET_SEMANTIC_PATH_MISSING',
  SEMANTIC_OMISSION: 'ASSET_SEMANTIC_OMISSION',
  SEMANTIC_EXCLUSION_UNREVIEWED: 'ASSET_SEMANTIC_EXCLUSION_UNREVIEWED',
  SEMANTIC_UNLINKED: 'ASSET_SEMANTIC_UNLINKED',
  SEMANTIC_POLICY_VIOLATION: 'ASSET_SEMANTIC_POLICY_VIOLATION',
  SEMANTIC_LOW_CONFIDENCE: 'ASSET_SEMANTIC_LOW_CONFIDENCE',
  SEMANTIC_EXCLUDED: 'ASSET_SEMANTIC_EXCLUDED',
  RULE_UNLINKED: 'ASSET_RULE_UNLINKED',
  DELIVERY_OMISSION: 'ASSET_DELIVERY_OMISSION',
});

export const LIMITS = Object.freeze({
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 10 * 1024 * 1024,
  maxCandidates: 500,
});

export const DEFAULT_EXCLUDES = Object.freeze([
  '.git/',
  'node_modules/',
  'target/',
  'dist/',
  'build/',
  'artifacts/',
  'private/',
  'secrets/',
]);

export const PROCEDURE_EXTENSIONS = Object.freeze(new Set([
  '.sh',
  '.bash',
  '.py',
  '.ps1',
  '.psm1',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
]));

export const TEXT_EXTENSIONS = Object.freeze(new Set([
  '.md',
  '.txt',
  '.json',
  '.toml',
  '.yaml',
  '.yml',
  '.conf',
  '.ini',
  '.cfg',
  '.service',
  '.sh',
  '.bash',
  '.py',
  '.ps1',
  '.psm1',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.xml',
  '.csv',
]));

export const CJK_PATTERN = /[぀-ヿ一-鿿]/;
export const SECRET_PATTERN = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bapi[_-]?key\s*[:=]|\bsecret\s*[:=]|\bpassword\s*[:=]|\btoken\s*[:=])/i;

export const DEFAULT_ASSET_POLICY = Object.freeze({
  maxFileBytes: LIMITS.maxFileBytes,
  maxTotalBytes: LIMITS.maxTotalBytes,
  maxCandidates: LIMITS.maxCandidates,
  includeBinary: true,
  lowConfidence: 'warn',
});

/**
 * Merge manifest and profile values over the defaults.
 *
 * The manifest uses camelCase under `assets`; the profile may use the same
 * names or an `asset_`-prefixed snake_case form. A missing value keeps the
 * default rather than inventing a second one.
 */
export function loadAssetPolicy({ manifest = {}, profile = {} } = {}) {
  const manifestAssets = manifest.assets ?? {};
  const profileLimits = profile.limits ?? profile;
  const pick = (...values) => values.find((value) => value !== undefined && value !== null);
  return {
    maxFileBytes: pick(
      manifestAssets.maxFileBytes,
      manifestAssets.max_file_bytes,
      profileLimits.assetMaxFileBytes,
      profileLimits.asset_max_file_bytes,
      DEFAULT_ASSET_POLICY.maxFileBytes,
    ),
    maxTotalBytes: pick(
      manifestAssets.maxTotalBytes,
      manifestAssets.max_total_bytes,
      profileLimits.assetMaxTotalBytes,
      profileLimits.asset_max_total_bytes,
      DEFAULT_ASSET_POLICY.maxTotalBytes,
    ),
    maxCandidates: pick(
      manifestAssets.maxCandidates,
      manifestAssets.max_candidates,
      profileLimits.assetMaxCandidates,
      profileLimits.asset_max_candidates,
      DEFAULT_ASSET_POLICY.maxCandidates,
    ),
    includeBinary: pick(
      manifestAssets.includeBinary,
      manifestAssets.include_binary,
      profileLimits.assetIncludeBinary,
      profileLimits.asset_include_binary,
      DEFAULT_ASSET_POLICY.includeBinary,
    ),
    lowConfidence: pick(
      manifestAssets.lowConfidence,
      manifestAssets.low_confidence,
      profileLimits.assetLowConfidence,
      profileLimits.asset_low_confidence,
      DEFAULT_ASSET_POLICY.lowConfidence,
    ),
  };
}
