/**
 * Containment predicates over the library's link facts.
 */

export function isBlocked(link) {
  return link?.outside === true;
}

export function isInsideRoot(link) {
  return link?.outside !== true;
}
