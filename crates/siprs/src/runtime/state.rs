//! # ランタイム内部状態
//!
//! reactor thread が排他的に所有する ClientState と関連エントリ型。
//! RFC §33 に準拠する。

use std::collections::BTreeMap;

use crate::account::RegistrationState;
use crate::config::AccountConfig;
use crate::error::SipError;
use crate::error::SipErrorKind;
use crate::event::ClientCapabilities;
use crate::util::id::{AccountId, CallId};

// ---------------------------------------------------------------------------
// スケルトン型（M8-2 で正式定義に差し替え）
// ---------------------------------------------------------------------------

#[allow(dead_code)]
#[derive(Debug)]
pub(crate) struct CallStateSkeleton;

#[allow(dead_code)]
#[derive(Debug)]
pub(crate) struct MediaRuntimeSkeleton;

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
    /// アカウント設定。
    pub config: AccountConfig,
    /// 現在の登録状態。
    pub registration: RegistrationState,
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
    /// この通話が属するアカウント。
    pub account_id: AccountId,
    /// 現在の通話状態（M8-2 で正式型に差し替え）。
    pub state: CallStateSkeleton,
    /// メディアランタイム情報（M8-2 で正式型に差し替え）。
    pub media: Option<MediaRuntimeSkeleton>,
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
            accounts: BTreeMap::new(),
            calls: BTreeMap::new(),
            capabilities,
        }
    }

    // ── Account operations ──

    /// アカウントエントリを追加する。
    ///
    /// 既存の `account_id` が存在する場合は `Err` を返す。
    pub fn add_account(&mut self, entry: AccountEntry) -> Result<(), SipError> {
        let id = entry.id;
        if self.accounts.contains_key(&id) {
            return Err(SipError::invalid_config(format!(
                "account already exists: {id}"
            )));
        }
        self.accounts.insert(id, entry);
        Ok(())
    }

    /// アカウントエントリを削除し、削除されたエントリを返す。
    pub fn remove_account(&mut self, id: AccountId) -> Result<AccountEntry, SipError> {
        self.accounts.remove(&id).ok_or_else(|| account_not_found(id))
    }

    /// アカウントエントリへの不変参照を返す。
    pub fn get_account(&self, id: AccountId) -> Result<&AccountEntry, SipError> {
        self.accounts.get(&id).ok_or_else(|| account_not_found(id))
    }

    /// アカウントエントリへの可変参照を返す。
    pub fn get_account_mut(&mut self, id: AccountId) -> Result<&mut AccountEntry, SipError> {
        self.accounts.get_mut(&id).ok_or_else(|| account_not_found(id))
    }

    // ── Call operations ──

    /// 通話エントリを追加する。
    ///
    /// 既存の `call_id` が存在する場合は `Err` を返す。
    pub fn add_call(&mut self, entry: CallEntry) -> Result<(), SipError> {
        let id = entry.id;
        if self.calls.contains_key(&id) {
            return Err(SipError::invalid_config(format!(
                "call already exists: {id}"
            )));
        }
        self.calls.insert(id, entry);
        Ok(())
    }

    /// 通話エントリを削除し、削除されたエントリを返す。
    pub fn remove_call(&mut self, id: CallId) -> Result<CallEntry, SipError> {
        self.calls.remove(&id).ok_or_else(|| call_not_found(id))
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
        use crate::config::{AccountCodecPolicy, AccountMediaConfig, AccountTransportPolicy, DtmfPolicy};
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
        let state = ClientState::new(ClientCapabilities {});
        assert!(!state.initialized);
        assert!(state.accounts.is_empty());
        assert!(state.calls.is_empty());
        assert_eq!(state.call_count(), 0);
    }

    /// `add_account` → `get_account` が正しいエントリを返すことを確認する。
    #[test]
    fn test_add_get_account() {
        let mut state = ClientState::new(ClientCapabilities {});
        let acc_id = AccountId::generate();
        let entry = AccountEntry {
            id: acc_id,
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
        let mut state = ClientState::new(ClientCapabilities {});
        let acc_id = AccountId::generate();
        let entry = AccountEntry {
            id: acc_id,
            config: test_account_config(),
            registration: RegistrationState::Idle,
        };
        assert!(state.add_account(entry).is_ok());

        let duplicate = AccountEntry {
            id: acc_id,
            config: test_account_config(),
            registration: RegistrationState::Idle,
        };
        let result = state.add_account(duplicate);
        assert!(result.is_err());
    }

    /// `remove_account` 後 `get_account` が `AccountNotFound` を返すことを確認する。
    #[test]
    fn test_remove_account() {
        let mut state = ClientState::new(ClientCapabilities {});
        let acc_id = AccountId::generate();
        let entry = AccountEntry {
            id: acc_id,
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
        let mut state = ClientState::new(ClientCapabilities {});
        assert_eq!(state.call_count(), 0);

        let entry = CallEntry {
            id: CallId::generate(),
            account_id: AccountId::generate(),
            state: CallStateSkeleton,
            media: None,
        };
        assert!(state.add_call(entry).is_ok());
        assert_eq!(state.call_count(), 1);
    }

    /// `remove_call` 後 `get_call` が `CallNotFound` を返すことを確認する。
    #[test]
    fn test_remove_call() {
        let mut state = ClientState::new(ClientCapabilities {});
        let call_id = CallId::generate();
        let entry = CallEntry {
            id: call_id,
            account_id: AccountId::generate(),
            state: CallStateSkeleton,
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
        let state = ClientState::new(ClientCapabilities {});
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
        let state = ClientState::new(ClientCapabilities {});
        let result = state.get_call(CallId::generate());
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err().kind,
            SipErrorKind::CallNotFound
        ));
    }
}
