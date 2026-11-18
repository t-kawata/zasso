'use strict';

// [::TICKET::] PX-444: a package supplies its mandatory ticket clause outside .claude.

const fs = require('node:fs');
const path = require('node:path');
const { requireSupportedVersion } = require('./versioned-json.js');

const OMISSION_TICKET_NOTES_FILE_NAME = 'OMISSION-TICKET-NOTES.json';
const SUPPORTED_NOTE_VERSIONS = Object.freeze([1]);
const INVALID_NOTES_CODE = 'OMISSION_TICKET_NOTES_INVALID';

/**
 * Read the package-owned note appended to every generated omission ticket.
 *
 * The document is a package artifact, never a conver artifact: distribution
 * replaces .claude, so a project clause stored there would be lost. The text is
 * returned verbatim and is never interpreted by conver.
 *
 * @param {string} projectDir — package directory that owns the ticket set
 * @returns {string} the trimmed note, or '' when the file is absent
 * @throws {Error} UNSUPPORTED_VERSION or OMISSION_TICKET_NOTES_INVALID
 */
// [::TICKET::] PX-444: read and validate the package note.
// [::TICKET::] PX-444 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-444 --for-spec --no-implementation-order`.
function loadProjectTicketNotes(projectDir) {
  const filePath = path.join(projectDir, OMISSION_TICKET_NOTES_FILE_NAME);
  if (!fs.existsSync(filePath)) return '';

  const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  requireSupportedVersion(document, SUPPORTED_NOTE_VERSIONS, filePath);

  if (typeof document.notes !== 'string' || document.notes.trim().length === 0) {
    const error = new Error(
      INVALID_NOTES_CODE + ': ' + filePath + ' must carry a non-empty notes string',
    );
    error.code = INVALID_NOTES_CODE;
    throw error;
  }

  return document.notes.trim();
}

module.exports = { OMISSION_TICKET_NOTES_FILE_NAME, loadProjectTicketNotes };
