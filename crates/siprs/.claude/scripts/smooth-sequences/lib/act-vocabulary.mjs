/**
 * The act-ordering vocabulary an artifact declares, or the Japanese default.
 *
 * A workspace that writes its specification in another language declares its own
 * act verbs under `vocabulary.actPatterns`. The detector must not carry a second
 * language's verbs as a hidden default.
 */

/** The act verbs the detector uses when the artifact declares none. */
export const DEFAULT_ACT_PATTERNS = Object.freeze([
  '導入する', '追記する', '起動し', '確かめる', '記録する', '作成する', '発行する',
  '実行する', '送信する', '更新する', '削除する', '登録する', '提出する', '公開する',
  '支払う', '移転する', '承認する', '拒否する', '検証する', '付与する',
]);

/** Whether a value is a non-empty list of non-empty strings. */
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function isActPatternList(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry) => typeof entry === 'string' && entry.trim() !== '');
}

/**
 * The act patterns the detector should use for one artifact.
 *
 * @param {{ vocabulary?: { actPatterns?: unknown } }} artifact
 * @returns {readonly string[]} the declared patterns or the Japanese default
 */
export function resolveActPatterns(artifact) {
  const declared = artifact?.vocabulary?.actPatterns;
  if (isActPatternList(declared)) return declared.map((entry) => entry.trim());
  return DEFAULT_ACT_PATTERNS;
}
