// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * Bundle-relative POSIX path helpers.
 */

export function directoryOf(path) {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

export function baseName(path) {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? path : path.slice(slash + 1);
}

export function relativeLink(fromDirectory, targetPath) {
  if (fromDirectory === '') return `./${targetPath}`;
  const prefix = `${fromDirectory}/`;
  if (targetPath.startsWith(prefix)) return `./${targetPath.slice(prefix.length)}`;
  const fromParts = fromDirectory.split('/');
  const targetParts = targetPath.split('/');
  let shared = 0;
  while (shared < fromParts.length && shared < targetParts.length && fromParts[shared] === targetParts[shared]) shared += 1;
  const up = fromParts.length - shared;
  return `${'../'.repeat(up)}${targetParts.slice(shared).join('/')}`;
}
