/**
 * チケットシステム設定管理
 *
 * レビュー閾値など変更可能な設定はここに集約する。
 * 将来的に外部設定ファイルからの読み込みにも対応可能。
 */

const path = require('path');

// スクリプト自身の場所（.claude/scripts/lib/）からプロジェクトルートを算出
// これにより、どのディレクトリから node を起動しても正しいパスを参照できる。
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const TICKETS_DIR = path.resolve(PROJECT_ROOT, 'tickets');

/** @returns {{ ticketsDir: string, specsDir: string, contextDir: string, draftsDir: string, queueFile: string, backupDir: string, review: object }} */
function loadConfig() {
  return {
    // ディレクトリ・ファイルパス（全パスは __dirname 基準で絶対解決済み）
    ticketsDir: TICKETS_DIR,
    specsDir: path.resolve(TICKETS_DIR, 'specs'),
    contextDir: path.resolve(TICKETS_DIR, 'context'),
    draftsDir: path.resolve(TICKETS_DIR, 'drafts'),
    queueFile: path.resolve(TICKETS_DIR, 'queue.md'),
    queueArchiveFile: path.resolve(TICKETS_DIR, 'queue-archive.md'),
    archivalDays: 14,
    backupDir: path.resolve(TICKETS_DIR, '.backups'),

    // レビュー品質チェックの閾値
    review: {
      maxFunctionLines: 30,
      maxNestingDepth: 4,
      maxParams: 5,

      // 許容される status 値の一覧
      allowedStatuses: [
        'draft',
        'reviewing',
        'approved',
        'implementing',
        'done',
        'reviewed',
        'blocked',
      ],

      // status 遷移ルール: from -> [allowed to]
      validTransitions: {
        draft: ['reviewing'],
        reviewing: ['approved', 'draft', 'blocked'],
        approved: ['implementing', 'reviewing'],
        implementing: ['done', 'approved', 'blocked'],
        done: ['reviewed', 'implementing'],
        reviewed: [],
        blocked: ['draft', 'reviewing', 'approved', 'implementing'],
      },

      // レビュー対象のファイル拡張子
      targetExtensions: ['.rs', '.js', '.ts', '.tsx', '.jsx', '.vue', '.go'],
    },

    // IDのゼロ埋め桁数
    idPadding: 4,
  };
}

module.exports = { loadConfig };
