'use strict';

/**
 * PX-436 — versioned JSON readers.
 *
 * A reader rejects an unknown major version rather than guessing. A document
 * without an integer version is unknown for the same reason.
 */

/** The versions this harness writes and reads. */
const SUPPORTED_MAJOR_VERSIONS = Object.freeze([1]);

/**
 * Require a supported major version.
 *
 * @param {object} document
 * @param {number[]} supported
 * @param {string} artifact
 * @returns {number}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function requireSupportedVersion(document, supported = SUPPORTED_MAJOR_VERSIONS, artifact = 'artifact') {
  const version = document?.version;
  if (!Number.isInteger(version) || !supported.includes(version)) {
    const error = new Error(artifact + ': unsupported version ' + String(version) + '; supported: ' + supported.join(', '));
    error.code = 'UNSUPPORTED_VERSION';
    throw error;
  }
  return version;
}

module.exports = { SUPPORTED_MAJOR_VERSIONS, requireSupportedVersion };
