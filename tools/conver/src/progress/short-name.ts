// short-name.ts — remove a shared package-name prefix for the header.
//
// This is the same rule the progress GIF uses: the longest common prefix is
// removed only when it ends at a separator, and a package named exactly like
// the prefix keeps its name. The crystal workspace has a root package named
// "crystal" beside "crystal-*" siblings; that root must remain readable.
const PREFIX_SEPARATORS = ["-", "_", ".", "/"] as const;

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function findLongestCommonPrefix(names: readonly string[]): string {
  if (names.length === 0) return "";
  let commonPrefix = names[0]!;
  for (const name of names.slice(1)) {
    let matchingLength = 0;
    while (
      matchingLength < commonPrefix.length &&
      matchingLength < name.length &&
      commonPrefix[matchingLength] === name[matchingLength]
    ) {
      matchingLength += 1;
    }
    commonPrefix = commonPrefix.slice(0, matchingLength);
  }
  return commonPrefix;
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function findSeparatorAlignedPrefix(
  commonPrefix: string,
  source: readonly string[],
): string {
  const separatorIndex = PREFIX_SEPARATORS.reduce(
    (best, separator) => Math.max(best, commonPrefix.lastIndexOf(separator)),
    -1,
  );
  if (separatorIndex >= 0) return commonPrefix.slice(0, separatorIndex + 1);

  const siblings = source.filter((name) => name !== commonPrefix);
  if (siblings.length === 0) return "";
  const separator = PREFIX_SEPARATORS.find((candidate) =>
    siblings.every((name) => name.startsWith(`${commonPrefix}${candidate}`)),
  );
  return separator === undefined ? "" : `${commonPrefix}${separator}`;
}

/**
 * Remove the longest shared prefix when it ends at a separator and every
 * remainder is non-empty. A package named exactly like the prefix keeps its
 * name so the workspace root cannot block stripping for its siblings.
 */
export function stripCommonPrefix(names: readonly string[]): {
  prefix: string;
  names: string[];
} {
  const source = names.map((name) => String(name ?? ""));
  if (source.length === 0) return { prefix: "", names: [] };
  const commonPrefix = findLongestCommonPrefix(source);
  const prefix = findSeparatorAlignedPrefix(commonPrefix, source);
  if (prefix === "") return { prefix: "", names: source };
  const stripped = source.map((name) =>
    name === commonPrefix ? name : name.slice(prefix.length),
  );
  if (stripped.every((name) => name.length > 0)) return { prefix, names: stripped };
  return { prefix: "", names: source };
}
