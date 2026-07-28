/**
 * Ticket system configuration management
 *
 * Centralizes configurable settings such as review thresholds.
 * Future support for loading from external config files is feasible.
 */

const path = require('path');

// Derive project root from script location (.claude/scripts/lib/)
// Ensures correct path resolution regardless of where node is launched from.
// Overridable via TICKETS_PROJECT_ROOT env var (for test isolation).
const PROJECT_ROOT = process.env.TICKETS_PROJECT_ROOT
  ? path.resolve(process.env.TICKETS_PROJECT_ROOT)
  : path.resolve(__dirname, '../../..');
const TICKETS_DIR = path.resolve(PROJECT_ROOT, 'tickets');

/** @returns {{ ticketsDir: string, specsDir: string, contextDir: string, draftsDir: string, queueFile: string, backupDir: string, review: object }} */
function loadConfig() {
  return {
    // Directory/file paths (all resolved absolutely relative to __dirname)
    ticketsDir: TICKETS_DIR,
    specsDir: path.resolve(TICKETS_DIR, 'specs'),
    contextDir: path.resolve(TICKETS_DIR, 'context'),
    draftsDir: path.resolve(TICKETS_DIR, 'drafts'),
    queueFile: path.resolve(TICKETS_DIR, 'queue.md'),
    queueArchiveFile: path.resolve(TICKETS_DIR, 'queue-archive.md'),
    archivalDays: 14,
    backupDir: path.resolve(TICKETS_DIR, '.backups'),

    // Review quality check thresholds
    review: {
      maxFunctionLines: 30,
      maxNestingDepth: 4,
      maxParams: 5,

      // Allowed status values
      allowedStatuses: [
        'draft',
        'reviewing',
        'approved',
        'implementing',
        'done',
        'reviewed',
        'blocked',
      ],

      // Status transition rules: from -> [allowed to]
      validTransitions: {
        draft: ['reviewing'],
        reviewing: ['approved', 'draft', 'blocked'],
        approved: ['implementing', 'reviewing'],
        implementing: ['done', 'approved', 'blocked'],
        done: ['reviewed', 'implementing'],
        reviewed: [],
        blocked: ['draft', 'reviewing', 'approved', 'implementing'],
      },

      // File extensions subject to review (must stay in sync with enumerate-ticket-targets.js)
      targetExtensions: [
        '.rs', '.go', '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.vue',
        '.py', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp',
        '.rb', '.php', '.cs',
        '.css', '.scss', '.json', '.yaml', '.yml', '.toml', '.md',
      ],
    },

    // ID zero-padding digits
    idPadding: 4,
  };
}

module.exports = { loadConfig };
