const path = require('path');
const fs = require('fs');
const {
  validateTicketId,
  resolveAllPaths,
  readFrontmatterFromFile,
  updateFrontmatterFields,
} = require('../lib/tickets');
const {
  fromHomeRelative,
  toHomeRelative,
  toHomeRelativeText,
} = require('../lib/path-utils');

const TYPES = { plan: 'plan_path', implementation: 'implementation_path', review: 'review_report_path' };

function main() {
  const rawId = process.argv[2];
  const type = process.argv[3];

  if (!rawId || !type) {
    console.log(JSON.stringify({ success: false, error: 'Usage: echo "content" | node save-artifact.js <ticket_id> <type>' }));
    console.error('type: plan | implementation | review');
    process.exit(1);
  }

  const ticketId = validateTicketId(rawId);
  if (!ticketId) {
    console.log(JSON.stringify({ success: false, error: 'Invalid ticket_id: must be a positive integer' }));
    process.exit(1);
  }

  const field = TYPES[type];
  if (!field) {
    console.log(JSON.stringify({ success: false, error: `Unknown type: "${type}". Expected: plan, implementation, review` }));
    process.exit(1);
  }

  const paths = resolveAllPaths(ticketId);
  if (!paths.specExists) {
    console.log(JSON.stringify({ success: false, error: `Ticket #${ticketId} not found` }));
    process.exit(1);
  }

  // Read content from stdin
  let content = '';
  try {
    content = fs.readFileSync(process.stdin.fd, 'utf8');
  } catch (e) {
    console.log(JSON.stringify({ success: false, error: `Failed to read stdin: ${e.message}` }));
    process.exit(1);
  }
  if (!content.trim()) {
    console.log(JSON.stringify({ success: false, error: 'No content provided via stdin' }));
    process.exit(1);
  }
  // The artifact is committed: a home path in its prose must name no machine.
  content = toHomeRelativeText(content);

  // Check existing frontmatter path; fall back to constructing from contextDir
  const { attrs } = readFrontmatterFromFile(paths.specPath);
  const existingPath = attrs?.[field];
  let artifactPath;
  if (existingPath) {
    // The frontmatter stores the portable form, so expand ~/ before asking the filesystem.
    const expandedPath = fromHomeRelative(existingPath);
    if (fs.existsSync(expandedPath)) {
      artifactPath = path.isAbsolute(expandedPath) ? expandedPath : path.resolve(expandedPath);
    }
  }
  if (!artifactPath) {
    artifactPath = path.join(paths.contextDir, `${type}.md`);
  }

  // Save file + update frontmatter with the portable path, not one naming this machine.
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, content);
  const storedArtifactPath = toHomeRelative(artifactPath);
  updateFrontmatterFields(paths.specPath, { [field]: storedArtifactPath });

  console.log(JSON.stringify({ success: true, ticketId, type, path: storedArtifactPath }));
}

if (require.main === module) main();
module.exports = { main, TYPES };
