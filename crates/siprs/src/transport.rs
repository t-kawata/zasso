//! # トランスポート設定型
//!
//! SIP 通信のトランスポート層設定を定義する。
//! RFC §12（TransportConfig 完全仕様）に完全準拠する。
//! TLS は `tls` feature flag で conditional compilation する。

use std::fmt;
use std::net::SocketAddr;

use secrecy::SecretString;

#[cfg(feature = "tls")]
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// TransportKind
// ---------------------------------------------------------------------------

/// SIP トランスポートの種類。
///
/// TLS は `tls` feature 有効時のみ存在する。
/// feature 無効時に TLS variant に言及するとコンパイルエラーとなる。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TransportKind {
    /// UDP トランスポート
    Udp,
    /// TCP トランスポート
    Tcp,
    /// TLS トランスポート（`tls` feature 有効時のみ）
    #[cfg(feature = "tls")]
    Tls,
}

impl TransportKind {
    /// トランスポート種類を識別子文字列（小文字）として返す。
    ///
    /// PJSIP の `pj_str_t` 変換やログ出力に使用する。
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Udp => "udp",
            Self::Tcp => "tcp",
            #[cfg(feature = "tls")]
            Self::Tls => "tls",
        }
    }
}

impl fmt::Display for TransportKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

// ---------------------------------------------------------------------------
// UdpTransportConfig
// ---------------------------------------------------------------------------

/// UDP トランスポート設定。
///
/// バインドアドレスのみを保持するシンプルな設定構造体。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UdpTransportConfig {
    /// バインドアドレス
    pub bind_addr: SocketAddr,
}

impl UdpTransportConfig {
    /// 新しい UDP トランスポート設定を生成する。
    pub fn new(bind_addr: SocketAddr) -> Self {
        Self { bind_addr }
    }
}

// ---------------------------------------------------------------------------
// TcpTransportConfig
// ---------------------------------------------------------------------------

/// TCP トランスポート設定。
///
/// バインドアドレスのみを保持するシンプルな設定構造体。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TcpTransportConfig {
    /// バインドアドレス
    pub bind_addr: SocketAddr,
}

impl TcpTransportConfig {
    /// 新しい TCP トランスポート設定を生成する。
    pub fn new(bind_addr: SocketAddr) -> Self {
        Self { bind_addr }
    }
}

// ---------------------------------------------------------------------------
// TlsConfig
// ---------------------------------------------------------------------------

/// TLS 設定（`tls` feature 有効時のみ）。
#[cfg(feature = "tls")]
#[derive(Debug, Clone)]
pub struct TlsConfig {
    /// サーバー証明書の検証を行うかどうか
    pub verify_server: bool,
    /// CA 証明書のパス
    pub ca_cert_path: Option<PathBuf>,
    /// クライアント証明書のパス
    pub client_cert_path: Option<PathBuf>,
    /// クライアント秘密鍵のパス
    pub client_key_path: Option<PathBuf>,
    /// サーバー名（SNI）
    pub server_name: Option<String>,
    /// 安全でない暗号のレガシー互換を許可する
    pub allow_insecure_cipher_legacy: bool,
}

#[cfg(feature = "tls")]
impl TlsConfig {
    /// 新しい TLS 設定を生成する（全フィールド指定）。
    pub fn new(
        verify_server: bool,
        ca_cert_path: Option<PathBuf>,
        client_cert_path: Option<PathBuf>,
        client_key_path: Option<PathBuf>,
        server_name: Option<String>,
        allow_insecure_cipher_legacy: bool,
    ) -> Self {
        Self {
            verify_server,
            ca_cert_path,
            client_cert_path,
            client_key_path,
            server_name,
            allow_insecure_cipher_legacy,
        }
    }

    /// 最小限の TLS 設定を生成する（検証あり、証明書なし）。
    pub fn default_verified() -> Self {
        Self {
            verify_server: true,
            ca_cert_path: None,
            client_cert_path: None,
            client_key_path: None,
            server_name: None,
            allow_insecure_cipher_legacy: false,
        }
    }

    /// 検証なしの TLS 設定を生成する（自己署名証明書用）。
    pub fn insecure() -> Self {
        Self {
            verify_server: false,
            ca_cert_path: None,
            client_cert_path: None,
            client_key_path: None,
            server_name: None,
            allow_insecure_cipher_legacy: false,
        }
    }
}

// ---------------------------------------------------------------------------
// TlsTransportConfig
// ---------------------------------------------------------------------------

/// TLS トランスポート設定（`tls` feature 有効時のみ）。
#[cfg(feature = "tls")]
#[derive(Debug, Clone)]
pub struct TlsTransportConfig {
    /// バインドアドレス
    pub bind_addr: SocketAddr,
    /// TLS 設定
    pub tls: TlsConfig,
}

#[cfg(feature = "tls")]
impl TlsTransportConfig {
    /// 新しい TLS トランスポート設定を生成する。
    pub fn new(bind_addr: SocketAddr, tls: TlsConfig) -> Self {
        Self { bind_addr, tls }
    }
}

// ---------------------------------------------------------------------------
// TransportConfig
// ---------------------------------------------------------------------------

/// トランスポート設定。
///
/// UDP/TCP/TLS のいずれかのトランスポート設定を保持する。
/// TLS は `tls` feature 有効時のみ利用可能。
#[derive(Debug, Clone)]
pub enum TransportConfig {
    /// UDP トランスポート
    Udp(UdpTransportConfig),
    /// TCP トランスポート
    Tcp(TcpTransportConfig),
    /// TLS トランスポート（`tls` feature 有効時のみ）
    #[cfg(feature = "tls")]
    Tls(TlsTransportConfig),
}

impl TransportConfig {
    /// UDP トランスポートを指定されたポートで生成する（bind_addr = 0.0.0.0）。
    pub fn udp(port: u16) -> Self {
        Self::Udp(UdpTransportConfig::new(SocketAddr::from(([0, 0, 0, 0], port))))
    }

    /// TCP トランスポートを指定されたポートで生成する（bind_addr = 0.0.0.0）。
    pub fn tcp(port: u16) -> Self {
        Self::Tcp(TcpTransportConfig::new(SocketAddr::from(([0, 0, 0, 0], port))))
    }

    /// TLS トランスポートを指定されたポートで生成する（bind_addr = 0.0.0.0）。
    ///
    /// `tls` feature 有効時のみ利用可能。
    #[cfg(feature = "tls")]
    pub fn tls(port: u16, tls_config: TlsConfig) -> Self {
        Self::Tls(TlsTransportConfig::new(
            SocketAddr::from(([0, 0, 0, 0], port)),
            tls_config,
        ))
    }

    /// バインドアドレスを返す。
    pub fn bind_addr(&self) -> SocketAddr {
        match self {
            Self::Udp(cfg) => cfg.bind_addr,
            Self::Tcp(cfg) => cfg.bind_addr,
            #[cfg(feature = "tls")]
            Self::Tls(cfg) => cfg.bind_addr,
        }
    }

    /// トランスポート種類を返す。
    pub fn kind(&self) -> TransportKind {
        match self {
            Self::Udp(_) => TransportKind::Udp,
            Self::Tcp(_) => TransportKind::Tcp,
            #[cfg(feature = "tls")]
            Self::Tls(_) => TransportKind::Tls,
        }
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// IceConfig
// ---------------------------------------------------------------------------

/// ICE 設定。
///
/// RFC §13 に完全準拠する。既定では ICE 有効、aggressive nomination 有効。
/// trickle ICE は disabled default の optional optimization。
#[derive(Debug, Clone)]
pub struct IceConfig {
    /// ICE を有効にするかどうか（既定: true）
    pub enabled: bool,
    /// aggressive nomination を使用するかどうか（既定: true）
    pub aggressive_nomination: bool,
    /// trickle ICE を有効にするかどうか（既定: false）
    pub trickle_ice: bool,
    /// renomination を有効にするかどうか（既定: false）
    pub renomination: bool,
    /// 最大ホスト候補数（既定: 16）
    pub max_host_candidates: usize,
}

impl Default for IceConfig {
    /// RFC §13 既定値による ICE 設定を返す。
    fn default() -> Self {
        Self {
            enabled: true,
            aggressive_nomination: true,
            trickle_ice: false,
            renomination: false,
            max_host_candidates: 16,
        }
    }
}

// ---------------------------------------------------------------------------
// TurnTransport
// ---------------------------------------------------------------------------

/// TURN トランスポートの種類。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TurnTransport {
    /// UDP
    Udp,
    /// TCP
    Tcp,
}

// ---------------------------------------------------------------------------
// StunServerConfig
// ---------------------------------------------------------------------------

/// STUN サーバー設定。
#[derive(Debug, Clone)]
pub struct StunServerConfig {
    /// STUN サーバーの URI（例: "stun:stun.example.com:3478"）
    pub uri: String,
}

impl StunServerConfig {
    /// 新しい STUN サーバー設定を生成する。
    pub fn new(uri: impl Into<String>) -> Self {
        Self { uri: uri.into() }
    }
}

// ---------------------------------------------------------------------------
// TurnServerConfig
// ---------------------------------------------------------------------------

/// TURN サーバー設定。
#[derive(Debug, Clone)]
pub struct TurnServerConfig {
    /// TURN サーバーの URI（例: "turn:turn.example.com:3478"）
    pub uri: String,
    /// TURN ユーザー名（認証不要時は None）
    pub username: Option<String>,
    /// TURN パスワード（認証不要時は None）
    ///
    /// `secrecy::SecretString` により Debug 出力は自動的に `"***REDACTED***"` となる。
    pub password: Option<SecretString>,
    /// TURN トランスポート
    pub transport: TurnTransport,
}

impl TurnServerConfig {
    /// 新しい TURN サーバー設定を生成する。
    pub fn new(
        uri: impl Into<String>,
        username: Option<String>,
        password: Option<SecretString>,
        transport: TurnTransport,
    ) -> Self {
        Self {
            uri: uri.into(),
            username,
            password,
            transport,
        }
    }
}

// ===========================================================================
// Unit tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // TransportKind
    // -----------------------------------------------------------------------

    /// Udp.as_str() が "udp" を返すことを確認する。
    #[test]
    fn test_transport_kind_as_str_udp() {
        assert_eq!(TransportKind::Udp.as_str(), "udp");
    }

    /// Tcp.as_str() が "tcp" を返すことを確認する。
    #[test]
    fn test_transport_kind_as_str_tcp() {
        assert_eq!(TransportKind::Tcp.as_str(), "tcp");
    }

    /// TransportKind の Display 出力が小文字の識別子文字列であることを確認する。
    #[test]
    fn test_transport_kind_display() {
        assert_eq!(format!("{}", TransportKind::Udp), "udp");
        assert_eq!(format!("{}", TransportKind::Tcp), "tcp");
    }

    /// TransportKind が Clone + Copy + PartialEq + Eq であることを確認する。
    #[test]
    fn test_transport_kind_clone_copy_eq() {
        let kind = TransportKind::Udp;
        let cloned = kind;
        assert_eq!(kind, cloned);
    }

    // -----------------------------------------------------------------------
    // UdpTransportConfig / TcpTransportConfig
    // -----------------------------------------------------------------------

    /// UdpTransportConfig::new() の bind_addr が正しいことを確認する。
    #[test]
    fn test_udp_transport_config_new() {
        let addr = SocketAddr::from(([127, 0, 0, 1], 5060));
        let cfg = UdpTransportConfig::new(addr);
        assert_eq!(cfg.bind_addr, addr);
    }

    /// TcpTransportConfig::new() の bind_addr が正しいことを確認する。
    #[test]
    fn test_tcp_transport_config_new() {
        let addr = SocketAddr::from(([127, 0, 0, 1], 5060));
        let cfg = TcpTransportConfig::new(addr);
        assert_eq!(cfg.bind_addr, addr);
    }

    // -----------------------------------------------------------------------
    // TransportConfig — convenience constructors
    // -----------------------------------------------------------------------

    /// TransportConfig::udp(5060) の bind_addr が 0.0.0.0:5060 であることを確認する。
    #[test]
    fn test_transport_config_udp() {
        let cfg = TransportConfig::udp(5060);
        assert_eq!(cfg.bind_addr(), SocketAddr::from(([0, 0, 0, 0], 5060)));
        assert_eq!(cfg.kind(), TransportKind::Udp);
    }

    /// TransportConfig::tcp(5060) の bind_addr が 0.0.0.0:5060 であることを確認する。
    #[test]
    fn test_transport_config_tcp() {
        let cfg = TransportConfig::tcp(5060);
        assert_eq!(cfg.bind_addr(), SocketAddr::from(([0, 0, 0, 0], 5060)));
        assert_eq!(cfg.kind(), TransportKind::Tcp);
    }

    /// bind_addr() が各 variant で正しいアドレスを返すことを確認する。
    #[test]
    fn test_transport_config_bind_addr() {
        let addr1 = SocketAddr::from(([192, 168, 1, 1], 5060));
        let addr2 = SocketAddr::from(([10, 0, 0, 1], 5061));

        let udp = TransportConfig::Udp(UdpTransportConfig::new(addr1));
        assert_eq!(udp.bind_addr(), addr1);

        let tcp = TransportConfig::Tcp(TcpTransportConfig::new(addr2));
        assert_eq!(tcp.bind_addr(), addr2);
    }

    /// kind() が各 variant で正しい TransportKind を返すことを確認する。
    #[test]
    fn test_transport_config_kind() {
        let addr = SocketAddr::from(([0, 0, 0, 0], 5060));

        let udp = TransportConfig::Udp(UdpTransportConfig::new(addr));
        assert_eq!(udp.kind(), TransportKind::Udp);

        let tcp = TransportConfig::Tcp(TcpTransportConfig::new(addr));
        assert_eq!(tcp.kind(), TransportKind::Tcp);
    }

    // -----------------------------------------------------------------------
    // コンパイル時検証（通常）
    // -----------------------------------------------------------------------

    /// TransportKind が Send + Sync であることをコンパイル時に確認する。
    #[test]
    fn test_transport_kind_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<TransportKind>();
        assert_sync::<TransportKind>();
    }

    /// UdpTransportConfig が Send + Sync であることをコンパイル時に確認する。
    #[test]
    fn test_udp_transport_config_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<UdpTransportConfig>();
        assert_sync::<UdpTransportConfig>();
    }

    /// TcpTransportConfig が Send + Sync であることをコンパイル時に確認する。
    #[test]
    fn test_tcp_transport_config_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<TcpTransportConfig>();
        assert_sync::<TcpTransportConfig>();
    }

    /// TransportConfig が Send + Sync であることをコンパイル時に確認する。
    #[test]
    fn test_transport_config_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<TransportConfig>();
        assert_sync::<TransportConfig>();
    }

    // =======================================================================
    // TLS feature 有効時のみのテスト
    // =======================================================================

    #[cfg(feature = "tls")]
    mod tls_tests {
        use super::*;

        /// TlsConfig::default_verified() の verify_server が true であることを確認する。
        #[test]
        fn test_tls_config_default_verified() {
            let cfg = TlsConfig::default_verified();
            assert!(cfg.verify_server);
            assert!(cfg.ca_cert_path.is_none());
            assert!(!cfg.allow_insecure_cipher_legacy);
        }

        /// TlsConfig::insecure() の verify_server が false であることを確認する。
        #[test]
        fn test_tls_config_insecure() {
            let cfg = TlsConfig::insecure();
            assert!(!cfg.verify_server);
        }

        /// TlsTransportConfig::new() の bind_addr / tls が正しいことを確認する。
        #[test]
        fn test_tls_transport_config_new() {
            let addr = SocketAddr::from(([127, 0, 0, 1], 5061));
            let tls_cfg = TlsConfig::default_verified();
            let cfg = TlsTransportConfig::new(addr, tls_cfg.clone());
            assert_eq!(cfg.bind_addr, addr);
            assert_eq!(cfg.tls.verify_server, tls_cfg.verify_server);
        }

        /// TransportConfig::tls() の bind_addr が 0.0.0.0:5061 であることを確認する。
        #[test]
        fn test_transport_config_tls() {
            let cfg = TransportConfig::tls(5061, TlsConfig::default_verified());
            assert_eq!(cfg.bind_addr(), SocketAddr::from(([0, 0, 0, 0], 5061)));
            assert_eq!(cfg.kind(), TransportKind::Tls);
        }

        /// tls feature 有効時に Tls variant が存在することを確認する。
        #[test]
        fn test_transport_kind_tls_variant() {
            let kind = TransportKind::Tls;
            assert_eq!(kind.as_str(), "tls");
        }

        /// TlsConfig が Send + Sync であることをコンパイル時に確認する。
        #[test]
        fn test_tls_config_send_sync() {
            fn assert_send<T: Send>() {}
            fn assert_sync<T: Sync>() {}
            assert_send::<TlsConfig>();
            assert_sync::<TlsConfig>();
        }

        /// TlsTransportConfig が Send + Sync であることをコンパイル時に確認する。
        #[test]
        fn test_tls_transport_config_send_sync() {
            fn assert_send<T: Send>() {}
            fn assert_sync<T: Sync>() {}
            assert_send::<TlsTransportConfig>();
            assert_sync::<TlsTransportConfig>();
        }
    }

    // =======================================================================
    // ICE / STUN / TURN
    // =======================================================================

    /// IceConfig::default() の各フィールドが §13 既定値と一致することを確認する。
    #[test]
    fn test_ice_config_default() {
        let cfg = IceConfig::default();
        assert!(cfg.enabled);
        assert!(cfg.aggressive_nomination);
        assert!(!cfg.trickle_ice);
        assert!(!cfg.renomination);
        assert_eq!(cfg.max_host_candidates, 16);
    }

    /// IceConfig の Clone / Debug がパニックしないことを確認する。
    #[test]
    fn test_ice_config_clone_debug() {
        let cfg = IceConfig::default();
        let cloned = cfg.clone();
        assert!(format!("{:?}", cloned).contains("enabled"));
    }

    /// TurnTransport が Clone + Copy + PartialEq + Eq であることを確認する。
    #[test]
    fn test_turn_transport_clone_copy_eq() {
        let transport = TurnTransport::Udp;
        let cloned = transport;
        assert_eq!(transport, cloned);
        assert_eq!(TurnTransport::Udp, TurnTransport::Udp);
        assert_eq!(TurnTransport::Tcp, TurnTransport::Tcp);
        assert_ne!(TurnTransport::Udp, TurnTransport::Tcp);
    }

    /// StunServerConfig::new() の uri が正しいことを確認する。
    #[test]
    fn test_stun_server_config_new() {
        let cfg = StunServerConfig::new("stun:example.com:3478");
        assert_eq!(cfg.uri, "stun:example.com:3478");
    }

    /// StunServerConfig の Clone / Debug がパニックしないことを確認する。
    #[test]
    fn test_stun_server_config_clone_debug() {
        let cfg = StunServerConfig::new("stun:example.com");
        let cloned = cfg.clone();
        assert_eq!(cloned.uri, "stun:example.com");
        assert!(format!("{:?}", cloned).contains("stun"));
    }

    /// TurnServerConfig::new() の全フィールドが正しくラウンドトリップすることを確認する。
    #[test]
    fn test_turn_server_config_new() {
        let uri = "turn:example.com:3478";
        let username = Some("user".to_string());
        let password = Some(SecretString::new(Box::from("pass")));
        let transport = TurnTransport::Tcp;

        let cfg = TurnServerConfig::new(uri, username.clone(), password, transport);

        assert_eq!(cfg.uri, uri);
        assert_eq!(cfg.username, username);
        assert_eq!(cfg.transport, TurnTransport::Tcp);
    }

    /// TurnServerConfig の username / password に None を許容することを確認する。
    #[test]
    fn test_turn_server_config_username_password_none() {
        let cfg = TurnServerConfig::new(
            "turn:example.com",
            None,
            None,
            TurnTransport::Udp,
        );
        assert!(cfg.username.is_none());
        assert!(cfg.password.is_none());
    }

    /// TurnServerConfig の Debug 出力で password が "***REDACTED***" にマスクされることを確認する。
    #[test]
    fn test_turn_server_config_debug_redacted() {
        let cfg = TurnServerConfig::new(
            "turn:example.com",
            Some("user".to_string()),
            Some(SecretString::new(Box::from("secret123"))),
            TurnTransport::Udp,
        );
        let debug_str = format!("{:#?}", cfg);
        assert!(debug_str.contains("REDACTED"), "Debug output should mask password, got: {debug_str}");
        assert!(!debug_str.contains("secret123"), "Debug output should not contain raw password");
    }

    /// TurnServerConfig の Clone が正しく機能することを確認する。
    #[test]
    fn test_turn_server_config_clone() {
        let cfg = TurnServerConfig::new(
            "turn:example.com",
            Some("user".to_string()),
            Some(SecretString::new(Box::from("pass"))),
            TurnTransport::Udp,
        );
        let cloned = cfg.clone();
        assert_eq!(cloned.uri, "turn:example.com");
        assert_eq!(cloned.username, Some("user".to_string()));
        assert_eq!(cloned.transport, TurnTransport::Udp);
    }

    /// IceConfig が Send + Sync であることをコンパイル時に確認する。
    #[test]
    fn test_ice_config_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<IceConfig>();
        assert_sync::<IceConfig>();
    }

    /// TurnServerConfig が Send + Sync であることをコンパイル時に確認する。
    #[test]
    fn test_turn_server_config_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<TurnServerConfig>();
        assert_sync::<TurnServerConfig>();
    }
}
