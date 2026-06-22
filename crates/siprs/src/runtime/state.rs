//! # ランタイム内部状態
//!
//! reactor thread が排他的に所有する ClientState と関連エントリ型。
//! RFC §33 に準拠する。

use std::collections::BTreeMap;
use std::sync::Arc;

use crate::account::RegistrationState;
use crate::audio::mixer::AudioMixer;
use crate::call::CallState;
use crate::config::AccountConfig;
use crate::error::SipError;
use crate::error::SipErrorKind;
use crate::event::ClientCapabilities;
use crate::util::id::{AccountId, CallId};

// ---------------------------------------------------------------------------
// MediaRuntime — メディアランタイム情報
// ---------------------------------------------------------------------------

/// メディアランタイム情報。
///
/// `mixer` は通話ごとの AudioMixer インスタンス。
/// 音声ソースの追加・削除、Tap チャネルの登録に使用する。
/// `tap_txs` は SubscribeAudio で生成された tap チャネルの送信側を保持し、
/// AudioWorkerTask の PairAligner → tap_txs 配送で使用される。
pub(crate) struct MediaRuntime {
    /// 通話単位の音声ミキサー。
    pub mixer: Arc<AudioMixer>,
    /// SubscribeAudio で生成された tap チャネルの送信側。
    /// AudioWorkerTask が PairAligner のペアを配送する先。
    /// 空 = 購読者なし。
    pub tap_txs: Vec<tokio::sync::mpsc::Sender<crate::audio::chunk::AudioChunkPair>>,
}

impl std::fmt::Debug for MediaRuntime {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MediaRuntime").finish_non_exhaustive()
    }
}

// ---------------------------------------------------------------------------
// AccountEntry
// ---------------------------------------------------------------------------

/// アカウントエントリ。
///
/// reactor が管理するアカウント単位のランタイム情報。
#[allow(dead_code)]
#[derive(Debug)]
pub(crate) struct AccountEntry {
    /// ランタイムアカウント ID。
    pub id: AccountId,
    /// PJSUA ネイティブアカウント ID（M17-1 で ffi::pjsua_acc_id に差し替え）。
    pub native_id: Option<i32>,
    /// アカウント設定。
    pub config: AccountConfig,
    /// 現在の登録状態。
    pub registration: RegistrationState,
}

impl AccountEntry {
    /// アカウント設定を部分的に更新する。
    pub fn apply_patch(
        &mut self,
        patch: crate::config::AccountConfigPatch,
    ) -> Result<(), SipError> {
        self.config.apply_patch(patch)
    }
}

// ---------------------------------------------------------------------------
// CallEntry
// ---------------------------------------------------------------------------

/// 通話エントリ。
///
/// reactor が管理する通話単位のランタイム情報。
#[allow(dead_code)]
#[derive(Debug)]
pub(crate) struct CallEntry {
    /// 通話 ID。
    pub id: CallId,
    /// PJSUA ネイティブ通話 ID（M17-1 で ffi::pjsua_call_id に差し替え）。
    pub native_id: Option<i32>,
    /// この通話が属するアカウント。
    pub account_id: AccountId,
    /// 現在の通話状態。
    pub state: CallState,
    /// 直前の通話状態（CONNECTING の分岐判定に使用）。
    pub previous_state: Option<CallState>,
    /// メディアランタイム情報。
    pub media: Option<MediaRuntime>,
}

// ---------------------------------------------------------------------------
// ClientState
// ---------------------------------------------------------------------------

/// クライアントのランタイム状態。
///
/// reactor thread が排他的に所有する。公開 API からの読み取りは
/// `RwLock` 経由の snapshot clone として提供される（M12-1）。
// M9/M12 で使用。現在は未呼び出しのため dead_code を許容。
#[allow(dead_code)]
pub(crate) struct ClientState {
    /// 初期化済みフラグ。
    pub initialized: bool,
    /// シャットダウン中フラグ（設定後は新規操作を拒否）。
    pub shutting_down: bool,
    /// 管理下の全アカウント（AccountId → AccountEntry）。
    pub accounts: BTreeMap<AccountId, AccountEntry>,
    /// 管理下の全通話（CallId → CallEntry）。
    pub calls: BTreeMap<CallId, CallEntry>,
    /// クライアントの機能マップ。
    pub capabilities: ClientCapabilities,
}

#[allow(dead_code)]
impl ClientState {
    /// 空の `ClientState` を生成する。
    pub fn new(capabilities: ClientCapabilities) -> Self {
        Self {
            initialized: false,
            shutting_down: false,
            accounts: BTreeMap::new(),
            calls: BTreeMap::new(),
            capabilities,
        }
    }

    // ── Account operations ──

    /// アカウントエントリを追加する。
    ///
    /// 既存の `account_id` が存在する場合は `Err` を返す。
    /// シャットダウン中は `InvalidState` を返す。
    pub fn add_account(&mut self, entry: AccountEntry) -> Result<(), SipError> {
        if self.shutting_down {
            return Err(SipError::invalid_state("client is shutting down"));
        }
        let id = entry.id;
        if self.accounts.contains_key(&id) {
            return Err(SipError::invalid_config(format!(
                "account already exists: {id}"
            )));
        }
        self.accounts.insert(id, entry);
        #[cfg(feature = "metrics")]
        crate::metrics::set_registered_accounts(self.accounts.len() as u64);
        Ok(())
    }

    /// アカウントエントリを削除し、削除されたエントリを返す。
    pub fn remove_account(&mut self, id: AccountId) -> Result<AccountEntry, SipError> {
        let removed = self.accounts.remove(&id);
        if let Some(entry) = removed {
            #[cfg(feature = "metrics")]
            crate::metrics::set_registered_accounts(self.accounts.len() as u64);
            Ok(entry)
        } else {
            Err(account_not_found(id))
        }
    }

    /// アカウントエントリへの不変参照を返す。
    pub fn get_account(&self, id: AccountId) -> Result<&AccountEntry, SipError> {
        self.accounts.get(&id).ok_or_else(|| account_not_found(id))
    }

    /// アカウントエントリへの可変参照を返す。
    pub fn get_account_mut(&mut self, id: AccountId) -> Result<&mut AccountEntry, SipError> {
        self.accounts
            .get_mut(&id)
            .ok_or_else(|| account_not_found(id))
    }

    // ── Call operations ──

    /// 通話エントリを追加する。
    ///
    /// 既存の `call_id` が存在する場合は `Err` を返す。
    /// シャットダウン中は `InvalidState` を返す。
    pub fn add_call(&mut self, entry: CallEntry) -> Result<(), SipError> {
        if self.shutting_down {
            return Err(SipError::invalid_state("client is shutting down"));
        }
        let id = entry.id;
        if self.calls.contains_key(&id) {
            return Err(SipError::invalid_config(format!(
                "call already exists: {id}"
            )));
        }
        self.calls.insert(id, entry);
        #[cfg(feature = "metrics")]
        crate::metrics::set_active_calls(self.calls.len() as u64);
        Ok(())
    }

    /// 通話エントリを削除し、削除されたエントリを返す。
    pub fn remove_call(&mut self, id: CallId) -> Result<CallEntry, SipError> {
        let removed = self.calls.remove(&id);
        if let Some(entry) = removed {
            #[cfg(feature = "metrics")]
            crate::metrics::set_active_calls(self.calls.len() as u64);
            Ok(entry)
        } else {
            Err(call_not_found(id))
        }
    }

    /// 通話エントリへの不変参照を返す。
    pub fn get_call(&self, id: CallId) -> Result<&CallEntry, SipError> {
        self.calls.get(&id).ok_or_else(|| call_not_found(id))
    }

    /// 通話エントリへの可変参照を返す。
    pub fn get_call_mut(&mut self, id: CallId) -> Result<&mut CallEntry, SipError> {
        self.calls.get_mut(&id).ok_or_else(|| call_not_found(id))
    }

    /// 現在の通話数を返す（`max_calls` 制限チェック用）。
    pub fn call_count(&self) -> usize {
        self.calls.len()
    }

    // ── Management operations ──

    /// 同時通話数が上限未満かどうかを返す。
    ///
    /// `max_calls == 0` の場合は常に `false`（通話不可）。
    pub fn can_add_call(&self, max_calls: u32) -> bool {
        if max_calls == 0 {
            return false;
        }
        self.calls.len() < max_calls as usize
    }

    /// シャットダウン状態に設定する。
    ///
    /// 設定後は `add_account` / `add_call` が `InvalidState` を返す。
    pub fn set_shutting_down(&mut self) {
        self.shutting_down = true;
    }

    /// シャットダウン中かどうかを返す。
    pub fn is_shutting_down(&self) -> bool {
        self.shutting_down
    }

    /// ネイティブアカウント ID からアカウントエントリを逆引きする。
    pub fn get_account_by_native_id(&self, native_id: i32) -> Option<&AccountEntry> {
        self.accounts
            .values()
            .find(|e| e.native_id == Some(native_id))
    }

    /// ネイティブ通話 ID から通話エントリを逆引きする。
    pub fn get_call_by_native_id(&self, native_id: i32) -> Option<&CallEntry> {
        self.calls.values().find(|e| e.native_id == Some(native_id))
    }

    /// ネイティブ通話 ID から通話エントリへの可変参照を逆引きする。
    ///
    /// `handle_call_state_changed` での previous_state 更新に使用する。
    pub fn get_call_by_native_id_mut(&mut self, native_id: i32) -> Option<&mut CallEntry> {
        self.calls
            .values_mut()
            .find(|e| e.native_id == Some(native_id))
    }
}

// ---------------------------------------------------------------------------
// エラーヘルパー
// ---------------------------------------------------------------------------

fn account_not_found(id: AccountId) -> SipError {
    SipError {
        kind: SipErrorKind::AccountNotFound,
        message: format!("account not found: {id}"),
        native_status: None,
        account_id: Some(id),
        call_id: None,
        retryable: false,
    }
}

fn call_not_found(id: CallId) -> SipError {
    SipError {
        kind: SipErrorKind::CallNotFound,
        message: format!("call not found: {id}"),
        native_status: None,
        account_id: None,
        call_id: Some(id),
        retryable: false,
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AccountConfig;
    use secrecy::SecretString;

    /// テスト用の最小限の AccountConfig を生成する。
    fn test_account_config() -> AccountConfig {
        use crate::config::{
            AccountCodecPolicy, AccountMediaConfig, AccountTransportPolicy, DtmfPolicy,
        };
        AccountConfig {
            display_name: None,
            username: "testuser".into(),
            auth_username: None,
            password: SecretString::new(Box::from("secret")),
            domain: "example.com".into(),
            registrar_uri: None,
            outbound_proxy: vec![],
            contact_params: vec![],
            transport: AccountTransportPolicy::Default,
            register_on_start: true,
            allow_outbound_without_register: false,
            registration_expires: std::time::Duration::from_secs(300),
            codecs: AccountCodecPolicy::default_voice(),
            dtmf: DtmfPolicy::all_methods(),
            media: AccountMediaConfig::default(),
            headers: vec![],
        }
    }

    /// `ClientState::new()` が空の状態を返すことを確認する。
    #[test]
    fn test_client_state_new() {
        let state = ClientState::new(ClientCapabilities::default_disabled());
        assert!(!state.initialized);
        assert!(!state.shutting_down);
        assert!(state.accounts.is_empty());
        assert!(state.calls.is_empty());
        assert_eq!(state.call_count(), 0);
    }

    /// `add_account` → `get_account` が正しいエントリを返すことを確認する。
    #[test]
    fn test_add_get_account() {
        let mut state = ClientState::new(ClientCapabilities::default_disabled());
        let acc_id = AccountId::generate();
        let entry = AccountEntry {
            id: acc_id,
            native_id: None,
            config: test_account_config(),
            registration: RegistrationState::Idle,
        };
        assert!(state.add_account(entry).is_ok());

        if let Ok(acc) = state.get_account(acc_id) {
            assert_eq!(acc.id, acc_id);
        } else {
            panic!("get_account が Ok を返しませんでした");
        }
    }

    /// 重複 `add_account` が `Err` を返すことを確認する。
    #[test]
    fn test_add_account_duplicate() {
        let mut state = ClientState::new(ClientCapabilities::default_disabled());
        let acc_id = AccountId::generate();
        let entry = AccountEntry {
            id: acc_id,
            native_id: None,
            config: test_account_config(),
            registration: RegistrationState::Idle,
        };
        assert!(state.add_account(entry).is_ok());

        let duplicate = AccountEntry {
            id: acc_id,
            native_id: None,
            config: test_account_config(),
            registration: RegistrationState::Idle,
        };
        let result = state.add_account(duplicate);
        assert!(result.is_err());
    }

    /// `remove_account` 後 `get_account` が `AccountNotFound` を返すことを確認する。
    #[test]
    fn test_remove_account() {
        let mut state = ClientState::new(ClientCapabilities::default_disabled());
        let acc_id = AccountId::generate();
        let entry = AccountEntry {
            id: acc_id,
            native_id: None,
            config: test_account_config(),
            registration: RegistrationState::Idle,
        };
        assert!(state.add_account(entry).is_ok());

        let removed = state.remove_account(acc_id);
        assert!(removed.is_ok());

        let retrieved = state.get_account(acc_id);
        assert!(retrieved.is_err());
        assert!(matches!(
            retrieved.unwrap_err().kind,
            SipErrorKind::AccountNotFound
        ));
    }

    /// `add_call` 時 `call_count` が増加することを確認する。
    #[test]
    fn test_add_call_count() {
        let mut state = ClientState::new(ClientCapabilities::default_disabled());
        assert_eq!(state.call_count(), 0);

        let entry = CallEntry {
            id: CallId::generate(),
            native_id: None,
            account_id: AccountId::generate(),
            state: CallState::New,
            previous_state: None,
            media: None,
        };
        assert!(state.add_call(entry).is_ok());
        assert_eq!(state.call_count(), 1);
    }

    /// `remove_call` 後 `get_call` が `CallNotFound` を返すことを確認する。
    #[test]
    fn test_remove_call() {
        let mut state = ClientState::new(ClientCapabilities::default_disabled());
        let call_id = CallId::generate();
        let entry = CallEntry {
            id: call_id,
            native_id: None,
            account_id: AccountId::generate(),
            state: CallState::New,
            previous_state: None,
            media: None,
        };
        assert!(state.add_call(entry).is_ok());

        let removed = state.remove_call(call_id);
        assert!(removed.is_ok());

        let retrieved = state.get_call(call_id);
        assert!(retrieved.is_err());
        assert!(matches!(
            retrieved.unwrap_err().kind,
            SipErrorKind::CallNotFound
        ));
    }

    /// 存在しない account_id で `AccountNotFound` が返ることを確認する。
    #[test]
    fn test_account_not_found() {
        let state = ClientState::new(ClientCapabilities::default_disabled());
        let result = state.get_account(AccountId::generate());
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err().kind,
            SipErrorKind::AccountNotFound
        ));
    }

    /// 存在しない call_id で `CallNotFound` が返ることを確認する。
    #[test]
    fn test_call_not_found() {
        let state = ClientState::new(ClientCapabilities::default_disabled());
        let result = state.get_call(CallId::generate());
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err().kind,
            SipErrorKind::CallNotFound
        ));
    }

    // -----------------------------------------------------------------------
    // ClientState management tests
    // -----------------------------------------------------------------------

    /// max_calls=3 で 3 通話目まで true、4 通話目で false。
    #[test]
    fn test_can_add_call_under_limit() {
        let mut state = ClientState::new(ClientCapabilities::default_disabled());
        assert_eq!(state.call_count(), 0);
        assert!(state.can_add_call(3));

        // 3 通話追加
        for _ in 0..3 {
            assert!(state.can_add_call(3));
            let entry = CallEntry {
                id: CallId::generate(),
                native_id: None,
                account_id: AccountId::generate(),
                state: CallState::New,
                previous_state: None,
                media: None,
            };
            assert!(state.add_call(entry).is_ok());
        }

        // 4 通話目は false
        assert!(!state.can_add_call(3));
    }

    /// max_calls=0 で常に false。
    #[test]
    fn test_can_add_call_zero_limit() {
        let state = ClientState::new(ClientCapabilities::default_disabled());
        assert!(!state.can_add_call(0));
    }

    /// set_shutting_down() 後 is_shutting_down() == true。
    #[test]
    fn test_shutting_down_flag() {
        let mut state = ClientState::new(ClientCapabilities::default_disabled());
        assert!(!state.is_shutting_down());
        state.set_shutting_down();
        assert!(state.is_shutting_down());
    }

    /// shutdown 中 add_call が InvalidState を返す。
    #[test]
    fn test_shutdown_rejects_add_call() {
        let mut state = ClientState::new(ClientCapabilities::default_disabled());
        state.set_shutting_down();

        let result = state.add_call(CallEntry {
            id: CallId::generate(),
            native_id: None,
            account_id: AccountId::generate(),
            state: CallState::New,
            previous_state: None,
            media: None,
        });
        assert!(result.is_err());
    }

    /// shutdown 中 add_account が InvalidState を返す。
    #[test]
    fn test_shutdown_rejects_add_account() {
        let mut state = ClientState::new(ClientCapabilities::default_disabled());
        state.set_shutting_down();

        let result = state.add_account(AccountEntry {
            id: AccountId::generate(),
            native_id: None,
            config: test_account_config(),
            registration: RegistrationState::Idle,
        });
        assert!(result.is_err());
    }

    /// get_account_by_native_id / get_call_by_native_id の正引きを確認する。
    #[test]
    fn test_native_id_reverse_lookup() {
        let mut state = ClientState::new(ClientCapabilities::default_disabled());

        let acc_id = AccountId::generate();
        let call_id = CallId::generate();
        assert!(state
            .add_account(AccountEntry {
                id: acc_id,
                native_id: Some(42),
                config: test_account_config(),
                registration: RegistrationState::Registered,
            })
            .is_ok());
        assert!(state
            .add_call(CallEntry {
                id: call_id,
                native_id: Some(100),
                account_id: acc_id,
                state: CallState::Active,
                previous_state: None,
                media: None,
            })
            .is_ok());

        if let Some(acc) = state.get_account_by_native_id(42) {
            assert_eq!(acc.id, acc_id);
        } else {
            panic!("get_account_by_native_id が None を返しました");
        }

        if let Some(call) = state.get_call_by_native_id(100) {
            assert_eq!(call.id, call_id);
        } else {
            panic!("get_call_by_native_id が None を返しました");
        }

        // 存在しない native_id
        assert!(state.get_account_by_native_id(999).is_none());
        assert!(state.get_call_by_native_id(999).is_none());
    }
}
