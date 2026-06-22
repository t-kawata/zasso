//! # SIP バックエンド抽象化
//!
//! PJSUA への全 FFI 呼び出しを抽象化する内部 trait `SipBackend` を定義する。
//! RFC §27a に準拠。
//!
//! M10-2 (MockBackend) 以降で使用。現在は未使用のため dead_code を許容。
#![allow(dead_code)]

use crate::config::{
    AccountConfig, ClientConfig, Codec, DtmfMethod, OutgoingCallRequest, TransportConfig,
};
use crate::error::SipError;
use crate::event::ClientCapabilities;
use crate::runtime::command::AccountInfoSnapshot;

// ---------------------------------------------------------------------------
// ネイティブ ID 型エイリアス
// ---------------------------------------------------------------------------

/// PJSUA ネイティブアカウント ID（M17-1 で `ffi::pjsua_acc_id` に差し替え）。
pub(crate) type NativeAccId = i32;
/// PJSUA ネイティブ通話 ID（同上）。
pub(crate) type NativeCallId = i32;
/// PJSUA カンファレンスポート ID（同上）。
pub(crate) type NativeConfPortId = i32;

// ---------------------------------------------------------------------------
// SipBackend trait
// ---------------------------------------------------------------------------

/// 内部 SIP バックエンド抽象化。
///
/// Runtime はこの trait を通じてのみ PJSUA を操作し、
/// 直接的な FFI 依存を runtime 層に漏らさない。
///
/// # テスト容易性
///
/// MockBackend（M10-2）に差し替えることで、PJSIP の初期化なしに
/// Reactor と状態機械の全検証を可能にする。
pub(crate) trait SipBackend: Send {
    /// PJSUA を初期化し、クライアント機能マップを返す。
    fn initialize(&mut self, config: &ClientConfig) -> Result<ClientCapabilities, SipError>;

    /// PJSUA をシャットダウンする。
    fn shutdown(&mut self) -> Result<(), SipError>;

    /// トランスポートを作成する。
    fn create_transport(&mut self, config: &TransportConfig) -> Result<(), SipError>;

    /// SIP アカウントを追加する。
    fn add_account(
        &mut self,
        config: &AccountConfig,
    ) -> Result<(NativeAccId, ClientCapabilities), SipError>;

    /// SIP アカウントを削除する。
    fn remove_account(&mut self, native_acc_id: NativeAccId) -> Result<(), SipError>;

    /// アカウントの登録有効/無効を設定する。
    fn set_registration(
        &mut self,
        native_acc_id: NativeAccId,
        enabled: bool,
    ) -> Result<(), SipError>;

    /// 発信する。
    fn make_call(
        &mut self,
        native_acc_id: NativeAccId,
        request: &OutgoingCallRequest,
    ) -> Result<NativeCallId, SipError>;

    /// 着信に応答する。
    fn answer_call(&mut self, native_call_id: NativeCallId, code: u16) -> Result<(), SipError>;

    /// 通話を切断する。
    fn hangup(&mut self, native_call_id: NativeCallId) -> Result<(), SipError>;

    /// アカウント情報を取得する（読み取り専用）。
    fn get_account_info(&self, native_acc_id: NativeAccId)
        -> Result<AccountInfoSnapshot, SipError>;

    /// カンファレンスポートを接続する。
    fn conf_connect(
        &mut self,
        source: NativeConfPortId,
        sink: NativeConfPortId,
    ) -> Result<(), SipError>;

    /// カンファレンスポートの接続を解除する。
    fn conf_disconnect(
        &mut self,
        source: NativeConfPortId,
        sink: NativeConfPortId,
    ) -> Result<(), SipError>;

    /// コーデック設定を行う。
    ///
    /// `preferred` が空の場合は auto モード（Opus=255, PCMU=254, その他無効）。
    /// 非空の場合は明示指定モード（指定順に優先度設定、指定外無効）。
    fn configure_codecs(&mut self, preferred: &[Codec]) -> Result<(), SipError>;

    /// DTMF 信号を送信する。
    fn send_dtmf(
        &mut self,
        native_call_id: NativeCallId,
        method: &DtmfMethod,
        digits: &str,
    ) -> Result<(), SipError>;

    /// 通話を転送する。
    fn transfer_call(&mut self, native_call_id: NativeCallId, target: &str)
        -> Result<(), SipError>;
}

// ---------------------------------------------------------------------------
// MockBackend — テスト専用 SIP バックエンド実装
// ---------------------------------------------------------------------------

#[cfg(test)]
use std::collections::HashMap;

/// テスト専用の SIP バックエンド実装。
///
/// PJSUA の代わりにメモリ内で動作し、全操作の成功/失敗を
/// テストシナリオに応じて制御できる。
#[cfg(test)]
pub(crate) struct MockBackend {
    initialized: bool,
    accounts: HashMap<i32, AccountConfig>,
    calls: HashMap<i32, MockCall>,
    next_acc_id: i32,
    next_call_id: i32,
    /// 注入された initialize 結果（Some なら優先返却）。
    initialize_result: Option<Result<ClientCapabilities, SipError>>,
    /// 注入された add_account 結果（Some なら優先返却）。
    add_account_result: Option<Result<i32, SipError>>,
    /// 注入された make_call 結果（Some なら優先返却）。
    make_call_result: Option<Result<i32, SipError>>,
    /// get_account_info が返す registration_status の上書き値。
    /// None の場合は 200 固定。
    registration_status_override: Option<u16>,
}

/// モック通話エントリ（M11 以降で拡張）。
#[cfg(test)]
struct MockCall {
    account_id: i32,
}

#[cfg(test)]
impl MockBackend {
    /// 空の `MockBackend` を生成する。
    pub fn new() -> Self {
        Self {
            initialized: false,
            accounts: HashMap::new(),
            calls: HashMap::new(),
            next_acc_id: 1,
            next_call_id: 1,
            initialize_result: None,
            add_account_result: None,
            make_call_result: None,
            registration_status_override: None,
        }
    }

    /// `initialize` の結果を注入する。
    pub fn set_initialize_result(&mut self, result: Result<ClientCapabilities, SipError>) {
        self.initialize_result = Some(result);
    }

    /// `add_account` の結果を注入する。
    pub fn set_add_account_result(&mut self, result: Result<i32, SipError>) {
        self.add_account_result = Some(result);
    }

    /// `make_call` の結果を注入する。
    pub fn set_make_call_result(&mut self, result: Result<i32, SipError>) {
        self.make_call_result = Some(result);
    }

    /// get_account_info が返す registration_status を設定する。
    ///
    /// 設定しない場合は 200 固定。
    pub fn set_registration_status(&mut self, status: u16) {
        self.registration_status_override = Some(status);
    }

    /// 全状態・注入結果をクリアする。
    pub fn reset(&mut self) {
        self.initialized = false;
        self.accounts.clear();
        self.calls.clear();
        self.next_acc_id = 1;
        self.next_call_id = 1;
        self.initialize_result = None;
        self.add_account_result = None;
        self.make_call_result = None;
        self.registration_status_override = None;
    }

    /// 初期化済みでない場合に NotInitialized エラーを返すヘルパー。
    fn ensure_initialized(&self) -> Result<(), SipError> {
        if self.initialized {
            Ok(())
        } else {
            Err(SipError {
                kind: crate::error::SipErrorKind::NotInitialized,
                message: "backend not initialized".into(),
                native_status: None,
                account_id: None,
                call_id: None,
                retryable: true,
            })
        }
    }
}

#[cfg(test)]
impl SipBackend for MockBackend {
    fn initialize(&mut self, _config: &ClientConfig) -> Result<ClientCapabilities, SipError> {
        if let Some(result) = self.initialize_result.take() {
            if result.is_ok() {
                self.initialized = true;
            }
            return result;
        }
        if self.initialized {
            return Err(SipError {
                kind: crate::error::SipErrorKind::AlreadyInitialized,
                message: "already initialized".into(),
                native_status: None,
                account_id: None,
                call_id: None,
                retryable: false,
            });
        }
        self.initialized = true;
        Ok(ClientCapabilities::default_disabled())
    }

    fn shutdown(&mut self) -> Result<(), SipError> {
        self.ensure_initialized()?;
        self.initialized = false;
        Ok(())
    }

    fn create_transport(&mut self, _config: &TransportConfig) -> Result<(), SipError> {
        self.ensure_initialized()?;
        Ok(())
    }

    fn add_account(
        &mut self,
        config: &AccountConfig,
    ) -> Result<(NativeAccId, ClientCapabilities), SipError> {
        self.ensure_initialized()?;
        if let Some(result) = self.add_account_result.take() {
            return result.map(|id| (id, ClientCapabilities::default_disabled()));
        }
        let id = self.next_acc_id;
        self.next_acc_id += 1;
        self.accounts.insert(id, config.clone());
        Ok((id, ClientCapabilities::default_disabled()))
    }

    fn remove_account(&mut self, native_acc_id: NativeAccId) -> Result<(), SipError> {
        self.ensure_initialized()?;
        self.accounts.remove(&native_acc_id);
        Ok(())
    }

    fn set_registration(
        &mut self,
        _native_acc_id: NativeAccId,
        _enabled: bool,
    ) -> Result<(), SipError> {
        self.ensure_initialized()?;
        Ok(())
    }

    fn make_call(
        &mut self,
        native_acc_id: NativeAccId,
        _request: &OutgoingCallRequest,
    ) -> Result<NativeCallId, SipError> {
        self.ensure_initialized()?;
        if !self.accounts.contains_key(&native_acc_id) {
            return Err(SipError::invalid_config(
                "account not found in mock backend",
            ));
        }
        if let Some(result) = self.make_call_result.take() {
            return result;
        }
        let id = self.next_call_id;
        self.next_call_id += 1;
        self.calls.insert(
            id,
            MockCall {
                account_id: native_acc_id,
            },
        );
        Ok(id)
    }

    fn answer_call(&mut self, _native_call_id: NativeCallId, _code: u16) -> Result<(), SipError> {
        self.ensure_initialized()?;
        Ok(())
    }

    fn hangup(&mut self, _native_call_id: NativeCallId) -> Result<(), SipError> {
        self.ensure_initialized()?;
        Ok(())
    }

    fn get_account_info(
        &self,
        native_acc_id: NativeAccId,
    ) -> Result<AccountInfoSnapshot, SipError> {
        self.ensure_initialized()?;
        if !self.accounts.contains_key(&native_acc_id) {
            return Err(SipError {
                kind: crate::error::SipErrorKind::AccountNotFound,
                message: format!("account {} not found in mock backend", native_acc_id),
                native_status: None,
                account_id: None,
                call_id: None,
                retryable: false,
            });
        }
        let registration_status = self.registration_status_override.unwrap_or(200);
        Ok(AccountInfoSnapshot {
            acc_id: crate::util::id::AccountId::from_test(native_acc_id as u64),
            registration_status,
            registration_expires: Some(3600),
            online_status: true,
            uri: format!("sip:user{}@mock.example.com", native_acc_id),
            is_shutting_down: false,
        })
    }

    fn conf_connect(
        &mut self,
        _source: NativeConfPortId,
        _sink: NativeConfPortId,
    ) -> Result<(), SipError> {
        self.ensure_initialized()?;
        Ok(())
    }

    fn conf_disconnect(
        &mut self,
        _source: NativeConfPortId,
        _sink: NativeConfPortId,
    ) -> Result<(), SipError> {
        self.ensure_initialized()?;
        Ok(())
    }

    fn configure_codecs(&mut self, _preferred: &[Codec]) -> Result<(), SipError> {
        self.ensure_initialized()?;
        Ok(())
    }

    fn send_dtmf(
        &mut self,
        _native_call_id: NativeCallId,
        _method: &DtmfMethod,
        _digits: &str,
    ) -> Result<(), SipError> {
        self.ensure_initialized()?;
        Ok(())
    }

    fn transfer_call(
        &mut self,
        _native_call_id: NativeCallId,
        _target: &str,
    ) -> Result<(), SipError> {
        self.ensure_initialized()?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{CallMediaPreferences, ClientConfig, OutgoingCallRequest};
    use crate::error::SipErrorKind;

    /// SipBackend が object-safe であることを確認する。
    #[test]
    fn test_sip_backend_object_safe() {
        // Box<dyn SipBackend> がコンパイル可能であること。
        fn _assert_object_safe(_: Box<dyn SipBackend>) {}
    }

    /// Box<dyn SipBackend> が Send であることを確認する。
    #[test]
    fn test_sip_backend_send() {
        fn assert_send<T: Send>() {}
        assert_send::<Box<dyn SipBackend>>();
    }

    /// 型エイリアスが i32 であることを確認する。
    #[test]
    fn test_native_id_types() {
        fn _assert_i32(_: i32) {}
        // 各型が i32 として扱えることの確認（代入可能性）。
        let _acc: NativeAccId = 0;
        let _call: NativeCallId = 0;
        let _conf: NativeConfPortId = 0;
    }

    // -----------------------------------------------------------------------
    // MockBackend tests
    // -----------------------------------------------------------------------

    /// デフォルトの initialize 成功動作を確認する。
    #[test]
    fn test_default_initialize() {
        let mut backend = MockBackend::new();
        let config = ClientConfig::default();
        let result = backend.initialize(&config);
        assert!(result.is_ok());
        assert!(backend.initialized);
    }

    /// 注入した失敗結果が正しく返されることを確認する。
    #[test]
    fn test_inject_failure() {
        let mut backend = MockBackend::new();
        backend.set_initialize_result(Err(SipError::invalid_config("mock error")));

        let config = ClientConfig::default();
        let result = backend.initialize(&config);
        assert!(result.is_err());
    }

    /// initialize 未呼び出しで NotInitialized エラーが返ることを確認する。
    #[test]
    fn test_uninitialized_error() {
        let mut backend = MockBackend::new();
        let request = OutgoingCallRequest {
            target_uri: "sip:test@example.com".into(),
            headers: vec![],
            auth_override: None,
            preferred_transport: None,
            media: CallMediaPreferences {
                enable_early_media: true,
                enable_srtp: None,
                preferred_codecs: vec![],
            },
            auto_answer_refer: false,
        };
        let result = backend.make_call(1, &request);
        assert!(result.is_err());
        if let Err(ref err) = result {
            assert_eq!(err.kind, SipErrorKind::NotInitialized);
        }
    }

    /// 重複 initialize で AlreadyInitialized エラーが返ることを確認する。
    #[test]
    fn test_double_initialize() {
        let mut backend = MockBackend::new();
        let config = ClientConfig::default();
        assert!(backend.initialize(&config).is_ok());
        let result = backend.initialize(&config);
        assert!(result.is_err());
        if let Err(ref err) = result {
            assert_eq!(err.kind, SipErrorKind::AlreadyInitialized);
        }
    }

    /// reset() で全状態がクリアされることを確認する。
    #[test]
    fn test_reset() {
        let mut backend = MockBackend::new();
        let config = ClientConfig::default();

        // initialize 後
        assert!(backend.initialize(&config).is_ok());
        assert!(backend.initialized);

        // reset
        backend.reset();
        assert!(!backend.initialized);

        // reset 後は再初期化可能
        assert!(backend.initialize(&config).is_ok());
    }

    /// get_account_info が既存アカウントの情報を返すことを確認する。
    ///
    /// MockBackend は initialize + add_account 後に get_account_info を
    /// 呼び出すと、仮の AccountInfoSnapshot を返す。
    /// AccountConfig は Default 未実装のため、最小限のフィールドで構築する。
    #[test]
    fn test_mock_get_account_info_ok() {
        use crate::config::{
            AccountCodecPolicy, AccountMediaConfig, AccountTransportPolicy, DtmfPolicy,
        };
        use secrecy::SecretString;
        use std::time::Duration;

        let mut backend = MockBackend::new();
        assert!(backend.initialize(&ClientConfig::default()).is_ok());
        let config = AccountConfig {
            display_name: None,
            username: "dummy".into(),
            auth_username: None,
            password: SecretString::new("dummy".into()),
            domain: "example.com".into(),
            registrar_uri: None,
            outbound_proxy: vec![],
            contact_params: vec![],
            transport: AccountTransportPolicy::Default,
            register_on_start: false,
            allow_outbound_without_register: true,
            registration_expires: Duration::from_secs(300),
            codecs: AccountCodecPolicy::default_voice(),
            dtmf: DtmfPolicy::all_methods(),
            media: AccountMediaConfig::default(),
            headers: vec![],
        };
        let (native_id, _caps) = backend.add_account(&config).unwrap();
        let info = backend.get_account_info(native_id).unwrap();
        assert_eq!(info.registration_status, 200);
        assert!(info.online_status);
        assert_eq!(info.registration_expires, Some(3600));
        assert!(info.uri.contains("mock.example.com"));
    }

    /// get_account_info が存在しないアカウントで AccountNotFound を返すことを確認する。
    #[test]
    fn test_mock_get_account_info_not_found() {
        let mut backend = MockBackend::new();
        assert!(backend.initialize(&ClientConfig::default()).is_ok());
        // アカウント未追加の状態で get_account_info → AccountNotFound
        let result = backend.get_account_info(999);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().kind,
            crate::error::SipErrorKind::AccountNotFound
        );
    }

    /// MockBackend の conf_connect が正常動作することを確認する。
    #[test]
    fn test_mock_conf_connect_ok() {
        let mut backend = MockBackend::new();
        assert!(backend.initialize(&ClientConfig::default()).is_ok());
        let result = backend.conf_connect(1, 2);
        assert!(result.is_ok());
    }

    /// MockBackend の conf_disconnect が正常動作することを確認する。
    #[test]
    fn test_mock_conf_disconnect_ok() {
        let mut backend = MockBackend::new();
        assert!(backend.initialize(&ClientConfig::default()).is_ok());
        let result = backend.conf_disconnect(1, 2);
        assert!(result.is_ok());
    }

    /// get_account_info で初期化前の NotInitialized エラーが AccountNotFound より優先されることを確認する。
    #[test]
    fn test_mock_get_account_info_not_initialized() {
        let backend = MockBackend::new();
        let result = backend.get_account_info(1);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().kind,
            crate::error::SipErrorKind::NotInitialized
        );
    }

    /// MockBackend::configure_codecs が auto モード（空スライス）で Ok を返すことを確認する。
    #[test]
    fn test_mock_configure_codecs_auto_ok() {
        let mut backend = MockBackend::new();
        assert!(backend.initialize(&ClientConfig::default()).is_ok());
        let result = backend.configure_codecs(&[]);
        assert!(result.is_ok());
    }

    /// MockBackend::configure_codecs が明示指定モード（非空スライス）で Ok を返すことを確認する。
    #[test]
    fn test_mock_configure_codecs_explicit_ok() {
        let mut backend = MockBackend::new();
        assert!(backend.initialize(&ClientConfig::default()).is_ok());
        let result = backend.configure_codecs(&[Codec::Opus, Codec::Pcmu]);
        assert!(result.is_ok());
    }

    /// MockBackend::configure_codecs が初期化前の NotInitialized エラーを返すことを確認する。
    #[test]
    fn test_mock_configure_codecs_not_initialized() {
        let mut backend = MockBackend::new();
        let result = backend.configure_codecs(&[]);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().kind,
            crate::error::SipErrorKind::NotInitialized
        );
    }
}
