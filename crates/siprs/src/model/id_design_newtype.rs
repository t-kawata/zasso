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

//! Defines the foundational ID types and bidirectional mapping for the siprs crate.
//!
//! ## ID Newtypes
//!
//! `AccountId`, `CallId`, and `AudioSourceId` are `NonZeroU64` newtypes that provide
//! type-safe identifiers throughout the crate. The `NonZeroU64` invariant guarantees
//! that zero is never a valid ID, and enables `Option<AccountId>` to use niche
//! optimization (8 bytes instead of 16).
//!
//! ## BiMap
//!
//! `BiMap<K, V>` provides bidirectional lookup between two key spaces. Its primary
//! use case is mapping between runtime-assigned IDs (monotonically increasing) and
//! PJSUA native IDs (reused integers), ensuring safe tracking across the FFI boundary.
//!
//! Per §9 (N0012), BiMap enables safe PJSUA native ID reuse tracking: when a native
//! ID is freed via `remove_by_runtime()`, it can be reassigned to a new runtime ID.

use std::collections::HashMap;
use std::hash::Hash;
use std::num::NonZeroU64;

// ---------------------------------------------------------------------------
// AccountId
// ---------------------------------------------------------------------------

/// A type-safe identifier for SIP accounts.
///
/// Wraps a `NonZeroU64` to ensure the ID is never zero, matching PJSUA's native
/// `pjsua_acc_id` type behaviour while enabling niche optimisation for `Option`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AccountId(NonZeroU64);

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl AccountId {
    /// Creates an `AccountId` from a raw `u64`, returning `None` when the value is zero.
    ///
    /// This is the primary constructor. Callers that already hold a `NonZeroU64`
    /// should use `From<NonZeroU64>` instead.
    ///
    /// # Examples
    ///
    /// ```
    /// # use siprs_crate::model::id_design_newtype::AccountId;
    /// let id = AccountId::from_u64(42).expect("non-zero value");
    /// assert_eq!(id.get(), 42);
    /// ```
    pub fn from_u64(value: u64) -> Option<Self> {
        NonZeroU64::new(value).map(AccountId)
    }

    /// Returns the inner `u64` value.
    ///
    /// The returned value is guaranteed to be non-zero.
    pub fn get(&self) -> u64 {
        self.0.get()
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl From<NonZeroU64> for AccountId {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn from(value: NonZeroU64) -> Self {
        AccountId(value)
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl From<AccountId> for u64 {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn from(id: AccountId) -> Self {
        id.0.get()
    }
}

// ---------------------------------------------------------------------------
// CallId
// ---------------------------------------------------------------------------

/// A type-safe identifier for SIP calls.
///
/// Wraps a `NonZeroU64` for type safety and niche optimisation, matching PJSUA's
/// native `pjsua_call_id` semantics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct CallId(NonZeroU64);

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl CallId {
    /// Creates a `CallId` from a raw `u64`, returning `None` when the value is zero.
    pub fn from_u64(value: u64) -> Option<Self> {
        NonZeroU64::new(value).map(CallId)
    }

    /// Returns the inner `u64` value (guaranteed non-zero).
    pub fn get(&self) -> u64 {
        self.0.get()
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl From<NonZeroU64> for CallId {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn from(value: NonZeroU64) -> Self {
        CallId(value)
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl From<CallId> for u64 {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn from(id: CallId) -> Self {
        id.0.get()
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl std::fmt::Display for CallId {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "CallId({})", self.0)
    }
}

// ---------------------------------------------------------------------------
// AudioSourceId
// ---------------------------------------------------------------------------

/// A type-safe identifier for audio sources (e.g., microphone taps).
///
/// Wraps a `NonZeroU64` for type safety and niche optimisation. Defined now
/// for future use by the audio pipeline module (P4-3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AudioSourceId(NonZeroU64);

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl AudioSourceId {
    /// Creates an `AudioSourceId` from a raw `u64`, returning `None` when zero.
    pub fn from_u64(value: u64) -> Option<Self> {
        NonZeroU64::new(value).map(AudioSourceId)
    }

    /// Returns the inner `u64` value (guaranteed non-zero).
    pub fn get(&self) -> u64 {
        self.0.get()
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl From<NonZeroU64> for AudioSourceId {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn from(value: NonZeroU64) -> Self {
        AudioSourceId(value)
    }
}

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
impl From<AudioSourceId> for u64 {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn from(id: AudioSourceId) -> Self {
        id.0.get()
    }
}

// ---------------------------------------------------------------------------
// BiMap — bidirectional mapping
// ---------------------------------------------------------------------------

/// A bidirectional map between two key spaces.
///
/// `BiMap` maintains two `HashMap`s to provide O(1) lookup in both directions.
/// The primary use case is mapping runtime-assigned IDs to PJSUA native IDs
/// and back, enabling safe native ID reuse tracking.
///
/// # Type parameters
///
/// - `K`: The forward key (runtime ID) — must implement `Eq + Hash + Clone + Debug`.
/// - `V`: The forward value (native ID) — must implement `Eq + Hash + Clone + Debug`.
///
/// # Invariant
///
/// For every `(k, v)` pair inserted, `lookup_by_native(v) == Some(&k)` and
/// `lookup_by_runtime(k) == Some(&v)` hold. Both maps are always kept in sync.
#[derive(Debug, Clone)]
pub struct BiMap<K, V> {
    /// Forward mapping: runtime ID → native ID
    forward: HashMap<K, V>,
    /// Backward mapping: native ID → runtime ID
    backward: HashMap<V, K>,
}

impl<K, V> BiMap<K, V>
where
    K: Eq + Hash + Clone + std::fmt::Debug,
    V: Eq + Hash + Clone + std::fmt::Debug,
{
    /// Creates an empty `BiMap`.
    pub fn new() -> Self {
        BiMap {
            forward: HashMap::new(),
            backward: HashMap::new(),
        }
    }

    /// Inserts a `(runtime_id, native_id)` pair, returning an error if the
    /// `runtime_id` or `native_id` is already mapped.
    ///
    /// # Errors
    ///
    /// Returns `Err(msg)` if `runtime_id` already has a mapping, or if
    /// `native_id` is already assigned to a different runtime ID.
    pub fn insert(&mut self, runtime_id: K, native_id: V) -> Result<(), String> {
        if self.forward.contains_key(&runtime_id) {
            return Err(format!(
                "runtime_id {:?} is already mapped",
                runtime_id
            ));
        }
        if self.backward.contains_key(&native_id) {
            return Err(format!(
                "native_id {:?} is already mapped",
                native_id
            ));
        }
        self.forward.insert(runtime_id.clone(), native_id.clone());
        self.backward.insert(native_id, runtime_id);
        Ok(())
    }

    /// Looks up the native ID associated with the given runtime ID.
    pub fn lookup_by_runtime(&self, runtime_id: &K) -> Option<&V> {
        self.forward.get(runtime_id)
    }

    /// Looks up the runtime ID associated with the given native ID.
    pub fn lookup_by_native(&self, native_id: &V) -> Option<&K> {
        self.backward.get(native_id)
    }

    /// Removes the entry identified by `runtime_id`, freeing the native ID
    /// for future reuse. Returns `true` if an entry was removed.
    pub fn remove_by_runtime(&mut self, runtime_id: &K) -> bool {
        if let Some(native_id) = self.forward.remove(runtime_id) {
            self.backward.remove(&native_id);
            true
        } else {
            false
        }
    }

    /// Removes the entry identified by `native_id`, freeing the runtime ID
    /// for future reuse. Returns `true` if an entry was removed.
    pub fn remove_by_native(&mut self, native_id: &V) -> bool {
        if let Some(runtime_id) = self.backward.remove(native_id) {
            self.forward.remove(&runtime_id);
            true
        } else {
            false
        }
    }

    /// Returns the number of entries in the map.
    pub fn len(&self) -> usize {
        self.forward.len()
    }

    /// Returns `true` if the map contains no entries.
    pub fn is_empty(&self) -> bool {
        self.forward.is_empty()
    }

    /// Removes all entries from the map.
    pub fn clear(&mut self) {
        self.forward.clear();
        self.backward.clear();
    }

    /// Returns `true` if the given runtime ID has a mapping.
    pub fn contains_runtime(&self, runtime_id: &K) -> bool {
        self.forward.contains_key(runtime_id)
    }

    /// Returns `true` if the given native ID has a mapping.
    pub fn contains_native(&self, native_id: &V) -> bool {
        self.backward.contains_key(native_id)
    }

    /// Returns an iterator over `(runtime_id, native_id)` pairs.
    pub fn iter(&self) -> impl Iterator<Item = (&K, &V)> {
        self.forward.iter()
    }
}

impl<K, V> Default for BiMap<K, V>
where
    K: Eq + Hash + Clone + std::fmt::Debug,
    V: Eq + Hash + Clone + std::fmt::Debug,
{
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // AccountId
    // -----------------------------------------------------------------------

    /// @verifies C013-postcondition
    /// @verifies C013-invariant
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn account_id_constructs_from_valid_u64() {
        let id = AccountId::from_u64(42).expect("should create AccountId for 42");
        assert_eq!(id.get(), 42);
    }

    /// @verifies C013-invariant
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn account_id_rejects_zero() {
        assert!(AccountId::from_u64(0).is_none(), "zero must be rejected");
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn account_id_from_nonzero_u64() {
        let nz = NonZeroU64::new(100).unwrap();
        let id: AccountId = nz.into();
        assert_eq!(id.get(), 100);
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn account_id_into_u64() {
        let id = AccountId::from_u64(7).unwrap();
        let val: u64 = id.into();
        assert_eq!(val, 7);
    }

    /// @verifies C013-invariant
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn account_id_implements_debug_clone_copy_partial_eq_eq_hash_ord() {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_eq_trait<T: Eq>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_hash<T: std::hash::Hash>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_ord<T: Ord>() {}
        assert_debug::<AccountId>();
        assert_clone::<AccountId>();
        assert_copy::<AccountId>();
        assert_partial_eq::<AccountId>();
        assert_eq_trait::<AccountId>();
        assert_hash::<AccountId>();
        assert_ord::<AccountId>();
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn account_id_equality_and_ordering() {
        let same_id = AccountId::from_u64(10).unwrap();
        let same_id_copy = AccountId::from_u64(10).unwrap();
        let larger_id = AccountId::from_u64(20).unwrap();
        assert_eq!(same_id, same_id_copy);
        assert_ne!(same_id, larger_id);
        assert!(same_id < larger_id);
        assert!(larger_id > same_id);
    }

    // -----------------------------------------------------------------------
    // CallId
    // -----------------------------------------------------------------------

    /// @verifies C013-postcondition
    /// @verifies C013-invariant
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn call_id_constructs_from_valid_u64() {
        let id = CallId::from_u64(1).expect("should create CallId for 1");
        assert_eq!(id.get(), 1);
    }

    /// @verifies C013-invariant
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn call_id_rejects_zero() {
        assert!(CallId::from_u64(0).is_none(), "zero must be rejected");
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn call_id_implements_debug_clone_copy_partial_eq_eq_hash_ord() {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_eq_trait<T: Eq>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_hash<T: std::hash::Hash>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_ord<T: Ord>() {}
        assert_debug::<CallId>();
        assert_clone::<CallId>();
        assert_copy::<CallId>();
        assert_partial_eq::<CallId>();
        assert_eq_trait::<CallId>();
        assert_hash::<CallId>();
        assert_ord::<CallId>();
    }

    // -----------------------------------------------------------------------
    // AudioSourceId
    // -----------------------------------------------------------------------

    /// @verifies C013-postcondition
    /// @verifies C013-invariant
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn audio_source_id_constructs_from_valid_u64() {
        let id = AudioSourceId::from_u64(1).expect("should create AudioSourceId for 1");
        assert_eq!(id.get(), 1);
    }

    /// @verifies C013-invariant
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn audio_source_id_rejects_zero() {
        assert!(
            AudioSourceId::from_u64(0).is_none(),
            "zero must be rejected"
        );
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn audio_source_id_implements_debug_clone_copy_partial_eq_eq_hash_ord() {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_eq_trait<T: Eq>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_hash<T: std::hash::Hash>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_ord<T: Ord>() {}
        assert_debug::<AudioSourceId>();
        assert_clone::<AudioSourceId>();
        assert_copy::<AudioSourceId>();
        assert_partial_eq::<AudioSourceId>();
        assert_eq_trait::<AudioSourceId>();
        assert_hash::<AudioSourceId>();
        assert_ord::<AudioSourceId>();
    }

    // -----------------------------------------------------------------------
    // BiMap
    // -----------------------------------------------------------------------

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_insert_and_lookup() {
        let mut map: BiMap<u64, u64> = BiMap::new();
        assert!(map.insert(1, 100).is_ok());

        // Both directions must return the correct mapping
        assert_eq!(map.lookup_by_runtime(&1), Some(&100));
        assert_eq!(map.lookup_by_native(&100), Some(&1));
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_native_id_reuse() {
        let mut map: BiMap<u64, u64> = BiMap::new();
        map.insert(1, 100).unwrap();

        // Remove by runtime, freeing native_id 100
        assert!(map.remove_by_runtime(&1));
        assert!(map.lookup_by_runtime(&1).is_none());
        assert!(map.lookup_by_native(&100).is_none());

        // Same native_id can now be assigned to a new runtime_id
        assert!(map.insert(2, 100).is_ok());
        assert_eq!(map.lookup_by_native(&100), Some(&2));
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_remove_by_native() {
        let mut map: BiMap<u64, u64> = BiMap::new();
        map.insert(1, 100).unwrap();
        assert!(map.remove_by_native(&100));
        assert!(map.is_empty());
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_len_and_is_empty() {
        let mut map: BiMap<u64, u64> = BiMap::new();
        assert!(map.is_empty());
        assert_eq!(map.len(), 0);

        map.insert(1, 100).unwrap();
        assert!(!map.is_empty());
        assert_eq!(map.len(), 1);

        map.insert(2, 200).unwrap();
        assert_eq!(map.len(), 2);
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_contains() {
        let mut map: BiMap<u64, u64> = BiMap::new();
        map.insert(1, 100).unwrap();

        assert!(map.contains_runtime(&1));
        assert!(!map.contains_runtime(&2));
        assert!(map.contains_native(&100));
        assert!(!map.contains_native(&200));
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_clear() {
        let mut map: BiMap<u64, u64> = BiMap::new();
        map.insert(1, 100).unwrap();
        map.insert(2, 200).unwrap();
        map.clear();
        assert!(map.is_empty());
        assert!(map.lookup_by_runtime(&1).is_none());
        assert!(map.lookup_by_native(&100).is_none());
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_iter() {
        let mut map: BiMap<u64, u64> = BiMap::new();
        map.insert(1, 100).unwrap();
        map.insert(2, 200).unwrap();

        let pairs: Vec<_> = map.iter().collect();
        assert_eq!(pairs.len(), 2);
        assert!(pairs.contains(&(&1, &100)));
        assert!(pairs.contains(&(&2, &200)));
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_insert_duplicate_runtime_rejected() {
        let mut map: BiMap<u64, u64> = BiMap::new();
        map.insert(1, 100).unwrap();
        let result = map.insert(1, 200);
        assert!(result.is_err(), "duplicate runtime_id must be rejected");
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_insert_duplicate_native_rejected() {
        let mut map: BiMap<u64, u64> = BiMap::new();
        map.insert(1, 100).unwrap();
        let result = map.insert(2, 100);
        assert!(result.is_err(), "duplicate native_id must be rejected");
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_remove_nonexistent_returns_false() {
        let mut map: BiMap<u64, u64> = BiMap::new();
        assert!(!map.remove_by_runtime(&1));
        assert!(!map.remove_by_native(&100));
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_default_is_empty() {
        let map: BiMap<u64, u64> = BiMap::default();
        assert!(map.is_empty());
    }

    /// @verifies C013-invariant
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_bidirectional_consistency() {
        let mut map: BiMap<u64, u64> = BiMap::new();
        map.insert(1, 100).unwrap();
        map.insert(2, 200).unwrap();

        // For every (runtime_id, native_id) pair:
        // forward(runtime_id) == Some(native_id) AND backward(native_id) == Some(runtime_id)
        for (runtime_id, native_id) in map.iter() {
            assert_eq!(map.lookup_by_native(native_id), Some(runtime_id));
            assert_eq!(map.lookup_by_runtime(runtime_id), Some(native_id));
        }
    }

    /// @verifies C013-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn bimap_remove_keeps_remaining_entries() {
        let mut map: BiMap<u64, u64> = BiMap::new();
        map.insert(1, 100).unwrap();
        map.insert(2, 200).unwrap();

        map.remove_by_runtime(&1);

        // Entry 2 must still be intact
        assert_eq!(map.lookup_by_runtime(&2), Some(&200));
        assert_eq!(map.lookup_by_native(&200), Some(&2));
        assert_eq!(map.len(), 1);
    }
}
