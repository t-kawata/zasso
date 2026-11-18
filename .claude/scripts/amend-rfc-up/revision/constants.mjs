// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

export const CHECK_SET_VERSION_BUILD = 3;
export const CHECK_SET_VERSION_UPDATE = 4;

export const RULE_ID_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/;

export const ROLE_VALUES = Object.freeze([
  'law-revision',
  'okf-reference',
  'okf-update',
  'mixed',
  'build-source',
  'unclear',
]);

export const LAW_COHERENCE_CLASSES = Object.freeze([
  'body',
  'source',
  'registry',
  'api',
  'profile',
  'conformance',
  'policy',
  'contract',
  'test',
  'template',
  'index',
  'asset',
]);

export const OKF_COHERENCE_CLASSES = Object.freeze([
  'body',
  'source',
  'graph',
  'index',
  'log',
  'freshness',
  'trust',
  'asset',
]);

export const DESTRUCTIVE_OPERATIONS = Object.freeze(new Set([
  'retire-rule',
  'merge-rules',
  'split-rule',
  'rename-rule',
  'retire-section',
  'retire-concept',
  'rename-concept',
  'retire-asset',
]));

export const CJK_PATTERN = /[぀-ヿ㐀-鿿]/;
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export const OPERATION_TYPES = Object.freeze([
  'update-rule',
  'add-rule',
  'retire-rule',
  'merge-rules',
  'split-rule',
  'rename-rule',
  'update-section',
  'add-section',
  'retire-section',
  'rename-section',
  'add-concept',
  'update-concept',
  'retire-concept',
  'rename-concept',
  'update-registry-row',
  'update-api-contract',
  'update-profile',
  'update-conformance',
  'update-implementation-policy',
  'update-implementation-contract',
  'update-implementation-test',
  'update-template',
  'update-generated-index',
  'add-source',
  'update-source',
  'reference-only',
  'add-asset',
  'update-asset',
  'retire-asset',
  'process-directive',
  'completion-criterion',
  'no-op',
]);
