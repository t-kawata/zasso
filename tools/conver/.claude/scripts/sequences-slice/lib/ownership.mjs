/**
 * The join from an operation's result object classes to the packages that own them.
 *
 * This is the load-bearing step of the whole feature, and it has already been misread
 * once: a probe that read `name` and `id` off each inventory object reported 0 of 210
 * resolutions, because inventory.objects carries its name in `canonical_name`. The
 * regression guard for that misreading is a test whose canonical_name differs from both
 * its id and its name, so no future reader can pass it by reading the wrong field.
 *
 * Every function here is pure. None reads a file, and none mutates what it was given.
 */

/**
 * Build the ownership map and report what could not be built.
 *
 * A map with a hole in it is worse than a map that refuses: a hole reads as "no package
 * owns this", which is a claim about the workspace, while a defect reads as "this record
 * is malformed", which is a claim about the record. They are separated for that reason.
 *
 * @param {Array<{ canonical_name?: string, owner_package?: string }>} objects
 * @returns {{ ownershipByCanonicalName: Map<string, string>, defects: string[] }}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function inspectObjectRecords(objects) {
  const ownershipByCanonicalName = new Map();
  const defects = [];

  objects.forEach((object, index) => {
    const canonicalName = object?.canonical_name;
    if (typeof canonicalName !== 'string' || canonicalName.length === 0) {
      defects.push(`object at index ${index} has no canonical_name`);
      return;
    }

    const owner = object.owner_package;
    if (typeof owner !== 'string' || owner.length === 0) {
      defects.push(`object at index ${index} (${canonicalName}) has no owner_package`);
      return;
    }

    const existingOwner = ownershipByCanonicalName.get(canonicalName);
    if (existingOwner !== undefined) {
      // Last-writer-wins would silently pick a package for an object two packages claim,
      // and the join would then report a confident answer to a question the data left open.
      if (existingOwner !== owner) {
        defects.push(`canonical_name ${canonicalName} is owned by both ${existingOwner} and ${owner}`);
      }
      return;
    }
    ownershipByCanonicalName.set(canonicalName, owner);
  });

  return { ownershipByCanonicalName, defects };
}

/**
 * The ownership map alone, for a caller that has already satisfied itself the records are sound.
 *
 * @param {Array<{ canonical_name?: string, owner_package?: string }>} objects
 * @returns {Map<string, string>}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function resolveOwningPackages(objects) {
  return inspectObjectRecords(objects).ownershipByCanonicalName;
}

/**
 * The packages an operation touches, and the class names it names that nobody owns.
 *
 * `result_object_classes` absent, null, or not an array is the empty list rather than an
 * error: the artifact leaves it out for operations that produce no object, and treating
 * that as malformed would reject 47 sound operations.
 *
 * @param {{ result_object_classes?: unknown }} operation
 * @param {Map<string, string>} ownershipByCanonicalName
 * @returns {{ ownerPackageIds: string[], unmatchedClassNames: string[] }}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function classifyOperationOwnership(operation, ownershipByCanonicalName) {
  const resultObjectClasses = Array.isArray(operation?.result_object_classes)
    ? operation.result_object_classes
    : [];

  const ownerPackageIds = new Set();
  const unmatchedClassNames = new Set();
  for (const className of resultObjectClasses) {
    const owner = ownershipByCanonicalName.get(className);
    if (owner === undefined) unmatchedClassNames.add(className);
    else ownerPackageIds.add(owner);
  }

  return {
    ownerPackageIds: [...ownerPackageIds].sort(),
    unmatchedClassNames: [...unmatchedClassNames].sort(),
  };
}

/**
 * The packages an operation touches, as a set.
 *
 * @param {{ result_object_classes?: unknown }} operation
 * @param {Map<string, string>} ownershipByCanonicalName
 * @returns {Set<string>}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function resolveOperationOwners(operation, ownershipByCanonicalName) {
  return new Set(classifyOperationOwnership(operation, ownershipByCanonicalName).ownerPackageIds);
}

/**
 * How the operations divide between the four ownership buckets.
 *
 * The four are a partition, which is the property that makes the calibration checkable:
 * a binding that dropped an operation would move one bucket and not the total, and the
 * total is asserted against the operation count.
 *
 * @param {Array<{ result_object_classes?: unknown }>} operations
 * @param {Map<string, string>} ownershipByCanonicalName
 * @returns {{ emptyResultClasses: number, exactlyOnePackage: number, severalPackages: number, noKnownPackage: number, total: number }}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function countOperationOwnershipBuckets(operations, ownershipByCanonicalName) {
  const buckets = {
    emptyResultClasses: 0,
    exactlyOnePackage: 0,
    severalPackages: 0,
    noKnownPackage: 0,
    total: 0,
  };

  for (const operation of operations) {
    const resultObjectClasses = Array.isArray(operation?.result_object_classes)
      ? operation.result_object_classes
      : [];

    if (resultObjectClasses.length === 0) {
      buckets.emptyResultClasses += 1;
    } else {
      const ownerCount = resolveOperationOwners(operation, ownershipByCanonicalName).size;
      if (ownerCount === 0) buckets.noKnownPackage += 1;
      else if (ownerCount === 1) buckets.exactlyOnePackage += 1;
      else buckets.severalPackages += 1;
    }
    buckets.total += 1;
  }
  return buckets;
}

/**
 * The packages the operations reach, sorted.
 *
 * A package that owns objects and that no operation reaches is not a defect: it is a
 * package whose objects are produced or consumed outside the operations the
 * specification names. Reported so that it is visible rather than inferred from a count.
 *
 * @param {Array<{ result_object_classes?: unknown }>} operations
 * @param {Map<string, string>} ownershipByCanonicalName
 * @returns {string[]}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function collectReachedPackageIds(operations, ownershipByCanonicalName) {
  const reached = new Set();
  for (const operation of operations) {
    for (const owner of resolveOperationOwners(operation, ownershipByCanonicalName)) reached.add(owner);
  }
  return [...reached].sort();
}

/**
 * The class names the operations name that no package owns, sorted.
 *
 * @param {Array<{ result_object_classes?: unknown }>} operations
 * @param {Map<string, string>} ownershipByCanonicalName
 * @returns {string[]}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function collectUnmatchedClassNames(operations, ownershipByCanonicalName) {
  const unmatched = new Set();
  for (const operation of operations) {
    const classified = classifyOperationOwnership(operation, ownershipByCanonicalName);
    for (const name of classified.unmatchedClassNames) unmatched.add(name);
  }
  return [...unmatched].sort();
}

/**
 * Every distinct class name the operations name, sorted.
 *
 * @param {Array<{ result_object_classes?: unknown }>} operations
 * @returns {string[]}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function collectDistinctClassNames(operations) {
  const names = new Set();
  for (const operation of operations) {
    const resultObjectClasses = Array.isArray(operation?.result_object_classes)
      ? operation.result_object_classes
      : [];
    for (const className of resultObjectClasses) names.add(className);
  }
  return [...names].sort();
}
