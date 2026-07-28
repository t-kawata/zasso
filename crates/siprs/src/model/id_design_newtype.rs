// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0012:  §9 ID Design — Newtype Identifiers
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0012 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use std::fmt;
use std::hash::Hash;
use std::num::NonZeroU64;

// ═══════════════════════════════════════════════════════════════════════════════
// ID Error
// ═══════════════════════════════════════════════════════════════════════════════

/// Errors that can occur during ID construction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdError {
    /// Attempted to construct an ID with a zero value.
    ZeroValue,
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl fmt::Display for IdError {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            IdError::ZeroValue => write!(f, "ID value must be non-zero"),
        }
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl std::error::Error for IdError {}

// ═══════════════════════════════════════════════════════════════════════════════
// Newtype IDs
// ═══════════════════════════════════════════════════════════════════════════════

/// A type-safe identifier for a SIP account.
///
/// Wraps a `NonZeroU64` to guarantee that every `AccountId` is a valid,
/// non-zero runtime identifier. Zero is rejected at construction time to
/// prevent bugs where `0` (the invalid sentinel in PJSUA) is used as a
/// valid ID.
///
/// The inner `NonZeroU64` is `pub(crate)` so that internal crate code
/// can construct IDs directly when necessary (e.g., from native FFI values
/// that are guaranteed non-zero). External consumers must use the safe
/// constructors (`new()`, `from_u64()`, `From<NonZeroU64>`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AccountId(pub(crate) NonZeroU64);

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl AccountId {
    /// Create a new `AccountId` from a `NonZeroU64`.
    ///
    /// This is the canonical constructor — it never fails because
    /// `NonZeroU64` already guarantees non-zeroness.
    pub const fn new(value: NonZeroU64) -> Self {
        Self(value)
    }

    /// Create an `AccountId` from a raw `u64`.
    ///
    /// Returns `Err(IdError::ZeroValue)` if the input is `0`.
    pub fn from_u64(value: u64) -> Result<Self, IdError> {
        NonZeroU64::new(value)
            .map(Self)
            .ok_or(IdError::ZeroValue)
    }

    /// Return the inner `NonZeroU64` value.
    pub const fn get(&self) -> NonZeroU64 {
        self.0
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl fmt::Display for AccountId {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "AccountId({})", self.0)
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl From<NonZeroU64> for AccountId {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn from(value: NonZeroU64) -> Self {
        Self(value)
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl TryFrom<u64> for AccountId {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    type Error = IdError;

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn try_from(value: u64) -> Result<Self, Self::Error> {
        Self::from_u64(value)
    }
}

/// A type-safe identifier for a SIP call leg.
///
/// Wraps a `NonZeroU64` — same rationale as `AccountId`.
///
/// The inner `NonZeroU64` is `pub(crate)` for internal crate convenience.
/// External consumers must use the safe constructors.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct CallId(pub(crate) NonZeroU64);

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl CallId {
    /// Create a new `CallId` from a `NonZeroU64`.
    pub const fn new(value: NonZeroU64) -> Self {
        Self(value)
    }

    /// Create a `CallId` from a raw `u64`.
    ///
    /// Returns `Err(IdError::ZeroValue)` if the input is `0`.
    pub fn from_u64(value: u64) -> Result<Self, IdError> {
        NonZeroU64::new(value)
            .map(Self)
            .ok_or(IdError::ZeroValue)
    }

    /// Return the inner `NonZeroU64` value.
    pub const fn get(&self) -> NonZeroU64 {
        self.0
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl fmt::Display for CallId {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "CallId({})", self.0)
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl From<NonZeroU64> for CallId {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn from(value: NonZeroU64) -> Self {
        Self(value)
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl TryFrom<u64> for CallId {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    type Error = IdError;

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn try_from(value: u64) -> Result<Self, Self::Error> {
        Self::from_u64(value)
    }
}

/// A type-safe identifier for an audio source bound to a call.
///
/// Wraps a `NonZeroU64` — same rationale as `AccountId`.
///
/// The inner `NonZeroU64` is `pub(crate)` for internal crate convenience.
/// External consumers must use the safe constructors.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AudioSourceId(pub(crate) NonZeroU64);

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl AudioSourceId {
    /// Create a new `AudioSourceId` from a `NonZeroU64`.
    pub const fn new(value: NonZeroU64) -> Self {
        Self(value)
    }

    /// Create an `AudioSourceId` from a raw `u64`.
    ///
    /// Returns `Err(IdError::ZeroValue)` if the input is `0`.
    pub fn from_u64(value: u64) -> Result<Self, IdError> {
        NonZeroU64::new(value)
            .map(Self)
            .ok_or(IdError::ZeroValue)
    }

    /// Return the inner `NonZeroU64` value.
    pub const fn get(&self) -> NonZeroU64 {
        self.0
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl fmt::Display for AudioSourceId {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "AudioSourceId({})", self.0)
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl From<NonZeroU64> for AudioSourceId {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn from(value: NonZeroU64) -> Self {
        Self(value)
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl TryFrom<u64> for AudioSourceId {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    type Error = IdError;

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn try_from(value: u64) -> Result<Self, Self::Error> {
        Self::from_u64(value)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BiMap — bidirectional map for RuntimeId ↔ NativeId
// ═══════════════════════════════════════════════════════════════════════════════

/// A bidirectional map that maintains a one-to-one mapping between
/// runtime identifiers (e.g., `AccountId`) and native identifiers
/// (e.g., PJSIP's `pjsua_acc_id`).
///
/// Uses `dashmap::DashMap` internally for thread-safe concurrent access.
///
/// # Native ID reuse
///
/// PJSUA recycles native IDs after session teardown. `BiMap` handles this by
/// overwriting the old mapping when `insert` is called with a native ID that
/// already exists — the newer runtime ID wins.
#[derive(Debug)]
pub struct BiMap<K, V>
where
    K: Hash + Eq + Clone + Copy,
    V: Hash + Eq + Clone + Copy,
{
    /// Forward mapping: RuntimeId → NativeId
    forward: dashmap::DashMap<K, V>,
    /// Reverse mapping: NativeId → RuntimeId
    reverse: dashmap::DashMap<V, K>,
}

impl<K, V> BiMap<K, V>
where
    K: Hash + Eq + Clone + Copy,
    V: Hash + Eq + Clone + Copy,
{
    /// Create an empty `BiMap`.
    pub fn new() -> Self {
        Self {
            forward: dashmap::DashMap::new(),
            reverse: dashmap::DashMap::new(),
        }
    }

    /// Insert a (runtime_id, native_id) pair.
    ///
    /// If the native_id already maps to a different runtime_id, the old
    /// mapping is silently overwritten (native ID reuse). If the runtime_id
    /// already maps to a different native_id, the old reverse mapping is
    /// also removed.
    pub fn insert(&self, runtime_id: K, native_id: V) {
        // Remove any existing mapping for this runtime_id.
        // The DashMap Ref guard must be dropped before the second map operation
        // to avoid deadlock. Copy types let us snapshot before dropping.
        if let Some(old_native) = self.forward.get(&runtime_id) {
            let old_native = *old_native;
            self.reverse.remove(&old_native);
        }
        // Remove any existing mapping for this native_id (native ID reuse).
        if let Some(old_runtime) = self.reverse.get(&native_id) {
            let old_runtime = *old_runtime;
            self.forward.remove(&old_runtime);
        }
        self.forward.insert(runtime_id, native_id);
        self.reverse.insert(native_id, runtime_id);
    }

    /// Look up the native ID for a given runtime ID.
    pub fn get_native(&self, runtime_id: &K) -> Option<V> {
        self.forward.get(runtime_id).map(|v| *v)
    }

    /// Look up the runtime ID for a given native ID.
    pub fn get_runtime(&self, native_id: &V) -> Option<K> {
        self.reverse.get(native_id).map(|v| *v)
    }

    /// Remove the mapping for the given runtime ID.
    ///
    /// Returns `Some(native_id)` if the runtime_id existed, `None` otherwise.
    pub fn remove(&self, runtime_id: &K) -> Option<V> {
        self.forward.remove(runtime_id).map(|(_, native_id)| {
            self.reverse.remove(&native_id);
            native_id
        })
    }

    /// Check whether a runtime ID has a mapping.
    pub fn contains_runtime(&self, runtime_id: &K) -> bool {
        self.forward.contains_key(runtime_id)
    }

    /// Check whether a native ID has a mapping.
    pub fn contains_native(&self, native_id: &V) -> bool {
        self.reverse.contains_key(native_id)
    }

    /// Return the number of entries in the map.
    pub fn len(&self) -> usize {
        self.forward.len()
    }

    /// Return `true` if the map is empty.
    pub fn is_empty(&self) -> bool {
        self.forward.is_empty()
    }

    /// Iterate over all (runtime_id, native_id) pairs.
    pub fn iter(&self) -> impl Iterator<Item = (K, V)> + '_ {
        self.forward.iter().map(|entry| (*entry.key(), *entry.value()))
    }
}

impl<K, V> Default for BiMap<K, V>
where
    K: Hash + Eq + Clone + Copy,
    V: Hash + Eq + Clone + Copy,
{
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self::new()
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    // ── AccountId ──────────────────────────────────────────────────────────

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn account_id_constructs_from_non_zero_u64() {
        let nz = NonZeroU64::new(42).unwrap();
        let id = AccountId::new(nz);
        assert_eq!(id.get(), nz);
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn account_id_from_u64_valid() {
        let id = AccountId::from_u64(1).unwrap();
        assert_eq!(id.get(), NonZeroU64::new(1).unwrap());
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn account_id_from_u64_zero_rejected() {
        let result = AccountId::from_u64(0);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), IdError::ZeroValue);
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn account_id_equality() {
        let a = AccountId::from_u64(1).unwrap();
        let b = AccountId::from_u64(1).unwrap();
        let c = AccountId::from_u64(2).unwrap();
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn account_id_ordering() {
        let a = AccountId::from_u64(1).unwrap();
        let b = AccountId::from_u64(2).unwrap();
        assert!(a < b);
        assert!(b > a);
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn account_id_hash() {
        use std::collections::HashSet;
        let mut set = HashSet::new();
        set.insert(AccountId::from_u64(1).unwrap());
        set.insert(AccountId::from_u64(2).unwrap());
        assert_eq!(set.len(), 2);
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn account_id_display() {
        let id = AccountId::from_u64(5).unwrap();
        assert_eq!(format!("{}", id), "AccountId(5)");
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn account_id_try_from_u64() {
        let id: AccountId = 42u64.try_into().unwrap();
        assert_eq!(id.get(), NonZeroU64::new(42).unwrap());
        let result: Result<AccountId, _> = 0u64.try_into();
        assert!(result.is_err());
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn account_id_from_non_zero_u64() {
        let nz = NonZeroU64::new(99).unwrap();
        let id = AccountId::from(nz);
        assert_eq!(id.get(), nz);
    }

    // ── CallId ─────────────────────────────────────────────────────────────

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn call_id_from_u64_valid() {
        let id = CallId::from_u64(10).unwrap();
        assert_eq!(id.get(), NonZeroU64::new(10).unwrap());
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn call_id_from_u64_zero_rejected() {
        let result = CallId::from_u64(0);
        assert_eq!(result.unwrap_err(), IdError::ZeroValue);
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn call_id_equality() {
        assert_eq!(
            CallId::from_u64(1).unwrap(),
            CallId::from_u64(1).unwrap()
        );
        assert_ne!(
            CallId::from_u64(1).unwrap(),
            CallId::from_u64(2).unwrap()
        );
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn call_id_display() {
        let id = CallId::from_u64(3).unwrap();
        assert_eq!(format!("{}", id), "CallId(3)");
    }

    // ── AudioSourceId ──────────────────────────────────────────────────────

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn audio_source_id_from_u64_valid() {
        let id = AudioSourceId::from_u64(1).unwrap();
        assert_eq!(id.get(), NonZeroU64::new(1).unwrap());
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn audio_source_id_from_u64_zero_rejected() {
        let result = AudioSourceId::from_u64(0);
        assert_eq!(result.unwrap_err(), IdError::ZeroValue);
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn audio_source_id_equality() {
        assert_eq!(
            AudioSourceId::from_u64(5).unwrap(),
            AudioSourceId::from_u64(5).unwrap()
        );
        assert_ne!(
            AudioSourceId::from_u64(5).unwrap(),
            AudioSourceId::from_u64(6).unwrap()
        );
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn audio_source_id_display() {
        let id = AudioSourceId::from_u64(7).unwrap();
        assert_eq!(format!("{}", id), "AudioSourceId(7)");
    }

    // ── Type distinction (compile-time) ───────────────────────────────────

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn newtypes_are_distinct_types() {
        // If this compiles, the types are distinguishable at the type level.
        let acc = AccountId::from_u64(1).unwrap();
        let call = CallId::from_u64(2).unwrap();
        let src = AudioSourceId::from_u64(3).unwrap();
        // NonZeroU64 values are accessible via .get()
        assert!(acc.get().get() != call.get().get());
        assert!(call.get().get() != src.get().get());
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn newtypes_clone_and_copy() {
        // Compile-time check: Clone + Copy
        let a = AccountId::from_u64(1).unwrap();
        let b = a; // Copy, not move
        assert_eq!(a, b);
    }

    // ── BiMap ─────────────────────────────────────────────────────────────

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    type TestBiMap = BiMap<AccountId, i32>;

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_new_is_empty() {
        let map = TestBiMap::new();
        assert!(map.is_empty());
        assert_eq!(map.len(), 0);
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_insert_and_lookup() {
        let map = TestBiMap::new();
        let rid = AccountId::from_u64(1).unwrap();
        map.insert(rid, 100);
        assert_eq!(map.len(), 1);
        assert_eq!(map.get_native(&rid), Some(100));
        assert_eq!(map.get_runtime(&100), Some(rid));
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_remove_clears_both_directions() {
        let map = TestBiMap::new();
        let rid = AccountId::from_u64(1).unwrap();
        map.insert(rid, 100);
        let removed = map.remove(&rid);
        assert_eq!(removed, Some(100));
        assert!(map.is_empty());
        assert_eq!(map.get_native(&rid), None);
        assert_eq!(map.get_runtime(&100), None);
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_contains_checks() {
        let map = TestBiMap::new();
        let rid = AccountId::from_u64(1).unwrap();
        map.insert(rid, 100);
        assert!(map.contains_runtime(&rid));
        assert!(map.contains_native(&100));
        assert!(!map.contains_runtime(&AccountId::from_u64(99).unwrap()));
        assert!(!map.contains_native(&999));
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_handles_native_id_reuse() {
        let map = TestBiMap::new();
        let rid1 = AccountId::from_u64(1).unwrap();
        let rid2 = AccountId::from_u64(2).unwrap();
        let native_id = 100;

        // First mapping
        map.insert(rid1, native_id);
        assert_eq!(map.get_runtime(&native_id), Some(rid1));

        // Reuse: second runtime ID claims the same native ID
        map.insert(rid2, native_id);
        // The new runtime ID wins
        assert_eq!(map.get_runtime(&native_id), Some(rid2));
        // The old runtime ID no longer maps to anything
        assert_eq!(map.get_native(&rid1), None);
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_update_existing_runtime() {
        let map = TestBiMap::new();
        let rid = AccountId::from_u64(1).unwrap();
        map.insert(rid, 100);
        map.insert(rid, 200); // Update native ID for same runtime
        assert_eq!(map.get_native(&rid), Some(200));
        assert_eq!(map.get_runtime(&100), None); // old native unlinked
        assert_eq!(map.get_runtime(&200), Some(rid));
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_multiple_entries() {
        let map = TestBiMap::new();
        let r1 = AccountId::from_u64(1).unwrap();
        let r2 = AccountId::from_u64(2).unwrap();
        let r3 = AccountId::from_u64(3).unwrap();
        map.insert(r1, 101);
        map.insert(r2, 102);
        map.insert(r3, 103);
        assert_eq!(map.len(), 3);
        assert_eq!(map.get_native(&r1), Some(101));
        assert_eq!(map.get_native(&r2), Some(102));
        assert_eq!(map.get_native(&r3), Some(103));
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_iter_visits_all_entries() {
        let map = TestBiMap::new();
        let r1 = AccountId::from_u64(1).unwrap();
        let r2 = AccountId::from_u64(2).unwrap();
        map.insert(r1, 101);
        map.insert(r2, 102);
        let pairs: Vec<(AccountId, i32)> = map.iter().collect();
        assert_eq!(pairs.len(), 2);
        assert!(pairs.contains(&(r1, 101)));
        assert!(pairs.contains(&(r2, 102)));
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_default_is_empty() {
        let map: TestBiMap = Default::default();
        assert!(map.is_empty());
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_remove_nonexistent() {
        let map = TestBiMap::new();
        let rid = AccountId::from_u64(999).unwrap();
        let result = map.remove(&rid);
        assert_eq!(result, None);
    }

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_concurrent_access() {
        use std::sync::Arc;
        let map = Arc::new(TestBiMap::new());
        let mut handles = Vec::new();

        for i in 0..10 {
            let map_clone = Arc::clone(&map);
            handles.push(std::thread::spawn(move || {
                let rid = AccountId::from_u64(i + 1).unwrap();
                map_clone.insert(rid, (i + 100) as i32);
                let _ = map_clone.get_native(&rid);
                let _ = map_clone.get_runtime(&((i + 100) as i32));
            }));
        }

        for h in handles {
            h.join().expect("thread panicked");
        }

        assert_eq!(map.len(), 10);
    }

    // ── Invariant: Clone + Debug ─────────────────────────────────────────

    /// @verifies C013
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn newtype_traits_clone_debug() {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_cd<T: Clone + std::fmt::Debug>() {}
        assert_cd::<AccountId>();
        assert_cd::<CallId>();
        assert_cd::<AudioSourceId>();
        assert_cd::<IdError>();
        // BiMap uses dashmap internally — not Clone by design.
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_debug::<BiMap<AccountId, i32>>();
    }
}
