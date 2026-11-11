# Q1

REST APIをAxumで実装するための実装ルールを定めている。OSSを後付け可能なJWT認証実装にしておくために必要な全てのルールを書き上げた説明書を書いて

# A1

## Axum REST API JWT認証 実装規約

目的は、JWT認証をシンプルに実装しつつ、後からSSOを追加するときにAPI・業務ロジック・DBを変更しないことです。

規約の根拠にはIETFの標準文書（RFC 8725: JWT BCP、RFC 9700: OAuth 2.0 Security BCP）、axumとjsonwebtokenの公式ドキュメントを使います。プロジェクト独自の設計判断は「設計判断」と明記します。

### 1. 基本原則

- API層は、信頼する発行元（`iss`）が署名したJWTだけを認証の入力とする。
- ログイン方式（パスワード、Google、Microsoftなど）はAPI層に露出させない。
- 業務ロジックは、検証済みの`Principal`だけを受け取る。生のJWT、外部IDトークン、プロバイダー名を見ない。
- 外部アカウントと内部ユーザーは別の概念として扱う。

### 2. クレート構成

```text
workspace
├─ auth-core     型とtrait。外部依存を最小にする
├─ auth-jwt      JWT発行・検証の実装
├─ auth-local    パスワード等の初期ログイン方式
├─ api           axumのルーター、ハンドラー、業務ロジック
└─ auth-sso      （後から追加）OIDC等のログイン方式
```

| ルール | 内容 |
|---|---|
| C-1 | `api`は`auth-core`の型・traitと`auth-jwt`の検証器だけに依存する。`auth-local`と`auth-sso`には依存しない。 |
| C-2 | `auth-local`と`auth-sso`は、同じ`LoginMethod`traitを実装する。互いに依存しない。 |
| C-3 | ログイン方式crateは`fn router() -> Router<AppState>`を公開し、`main`でmergeする。SSO追加は`main`への1行追加と設定に限定する。 |
| C-4 | JWTの署名鍵（秘密鍵）にアクセスできるのは発行側（`auth-jwt`の`TokenIssuer`）だけにする。 |

### 3. 境界の型（`auth-core`）

```rust
pub struct UserId(Uuid);             // 内部ID。不変
pub struct Scope(String);

pub struct Principal {               // 業務層が受け取る唯一の認証情報
    pub user_id: UserId,
    pub scopes: Vec<Scope>,
    pub token_id: String,            // jti。監査用
}

pub struct AuthenticatedUser {       // ログイン方式の出力
    pub user_id: UserId,
    pub method: &'static str,        // "password", "oidc:google" 等。監査用
}

##[async_trait]
pub trait LoginMethod: Send + Sync {
    fn router(&self) -> Router<AppState>;  // /auth/<method>/...
}

pub trait TokenIssuer: Send + Sync {
    fn issue(&self, u: &AuthenticatedUser, scopes: &[Scope]) -> Result<TokenPair, AuthError>;
}

pub trait TokenVerifier: Send + Sync {
    fn verify(&self, bearer: &str) -> Result<Principal, AuthError>;
}
```

| ルール | 内容 |
|---|---|
| T-1 | `Principal`を作れるのは`TokenVerifier`の実装だけ。コンストラクタは非公開（`pub(crate)`）にする。テスト用は`#[cfg(test)]`で別に用意する。 |
| T-2 | `TokenIssuer::issue`は、全ログイン方式から呼ばれる唯一のトークン発行口にする。 |
| T-3 | `AuthError`の外部向け表現は401/403の少数種類に限定し、詳細な失敗理由はログにだけ残す。 |

設計判断として、`TokenIssuer`と`TokenVerifier`はtraitで分離します。発行を外部サービスへ移すときは、`TokenIssuer`を使わなくなり、`TokenVerifier`の信頼先（`iss`と公開鍵）の設定だけが変わります。

### 4. アクセストークン仕様

| 項目 | ルール |
|---|---|
| 形式 | JWS署名のみ。JWE（暗号化）は使わない。 |
| ヘッダー | `alg`、`kid`、`typ`。`typ`は固定値（例：`at+jwt`）にする。 |
| 署名アルゴリズム | 非対称署名（`EdDSA`または`ES256`）。許可リストを設定で固定する。 |
| 必須クレーム | `iss`、`sub`、`aud`、`exp`、`iat`、`jti`。権限用に`scope`を追加する。 |
| `sub` | 内部`UserId`（UUID）。メールアドレスや外部プロバイダーのIDは使わない。 |
| `aud` | このREST APIの識別子。 |
| 有効期間 | 短く（例：5〜15分）。設定値にする。 |
| 禁止 | `none`、HS系の共有秘密鍵（設計判断、下記参照）、ヘッダーの`jku`/`x5u`への追従。 |

RFC 8725は、ライブラリ利用側が許可アルゴリズムの集合を指定し、それ以外を使わないことを求めています。また各鍵は1つのアルゴリズムでのみ使い、`alg`ヘッダーと実際の操作が一致することを検証する必要があります。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc8725.html)

非対称署名を選ぶのは設計判断です。公開鍵だけで検証できるので、後から発行側を別プロセスや外部サービスに移しても、API側が秘密鍵を持つ必要がありません。RFC 8725は、人間が記憶できるパスワードをHS256などのMAC鍵として直接使ってはならないとも明記しています。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc8725.html)

### 5. 検証規約（`TokenVerifier`）

| ルール | 内容 |
|---|---|
| V-1 | `alg`の許可リストを明示する。jsonwebtokenでは`Validation::new(Algorithm::…)`で指定し、空にしない。 [docs](https://docs.rs/jsonwebtoken/latest/jsonwebtoken/struct.Validation.html) |
| V-2 | `exp`、`iss`、`aud`、`sub`を必須クレームに設定し、`set_issuer`と`set_audience`で期待値を指定する。 [docs](https://docs.rs/jsonwebtoken/latest/jsonwebtoken/struct.Validation.html) |
| V-3 | `validate_aud`や署名検証を無効にしない。jsonwebtokenのドキュメントも、audの検証を無効にすることを非常に危険としている。 [docs](https://docs.rs/jsonwebtoken/latest/jsonwebtoken/struct.Validation.html) |
| V-4 | `iss`が持つ鍵だけで検証する。RFC 8725は、`iss`があれば、検証に使った鍵がその発行元のものであることの確認を求めている。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc8725.html) |
| V-5 | `kid`は検索キーにだけ使い、SQL・LDAP等に直接渡さない。`jku`/`x5u`のURLを動的に取得しない。鍵の取得先は設定ファイルで固定する。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc8725.html) |
| V-6 | 時刻のleewayは小さく（例：数秒）し、設定値にする。 |
| V-7 | 検証は同期・純粋関数に近づける。DBアクセスが必要な失効確認は、署名検証の後に別段階で行う。 |
| V-8 | 異なる種類のJWT（アクセストークン、IDトークン、将来の他用途）の検証規則を相互排他にする。RFC 8725は、`typ`、必須クレーム、鍵、`aud`、`iss`の違いで別種のJWTを拒否することを求めている。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc8725.html) |

V-8は、後付けSSOで特に重要です。Googleなどの外部IDトークンを、自サービスのアクセストークンとして受け付けてはいけません。外部IDトークンは、`auth-sso`内でログイン用に検証し、その後に自サービスのアクセストークンへ変換します。

### 6. 鍵管理規約

| ルール | 内容 |
|---|---|
| K-1 | 検証用の鍵は`KeyStore`trait（`kid`で公開鍵を返す）の背後に置く。 |
| K-2 | 複数の有効な公開鍵を同時に保持できるようにする。鍵ローテーションで旧鍵の検証を許す期間を作るため。 |
| K-3 | 公開鍵は、現在はファイル／環境変数から読み込む。将来のJWKS取得は、設定で固定したURLからのみ許す。 |
| K-4 | 秘密鍵をリポジトリ、ログ、エラー応答に出さない。 |
| K-5 | 鍵の強度・形式は起動時に検証し、不正なら起動を失敗させる（フェイルクローズ）。 |

### 7. axum統合規約

axumの公式ドキュメントでは、`from_fn`で認証ミドルウェアを書き、認証済みユーザーをリクエストのextensionsに入れ、ハンドラーが`Extension`として取り出す方式を示しています。状態が必要なら`from_fn_with_state`を使います。 [docs](https://docs.rs/axum/latest/axum/middleware/index.html)

```rust
async fn authenticate(
    State(v): State<Arc<dyn TokenVerifier>>,
    mut req: Request,
    next: Next,
) -> Result<Response, AuthRejection> {
    let token = bearer(req.headers()).ok_or(AuthRejection::Missing)?;
    let principal = v.verify(token).map_err(AuthRejection::from)?;
    req.extensions_mut().insert(principal);
    Ok(next.run(req).await)
}
```

| ルール | 内容 |
|---|---|
| A-1 | 認証は`route_layer`で保護対象ルートにだけ適用する。`/auth/*`と`/health`は対象外にする。 |
| A-2 | 認可が必要なルートは、デフォルト拒否にする。保護ルートを「認証なしで公開」にできるのは、明示的なルート定義だけにする。 |
| A-3 | ハンドラーは`Principal`だけを`FromRequestParts`の抽出器で受け取る。`Authorization`ヘッダーを直接読まない。 |
| A-4 | `Bearer`以外のスキーム、複数の`Authorization`ヘッダー、空トークンは401にする。 |
| A-5 | トークンはクエリ文字列やURLパスで受け付けない。RFC 9700は、URLに現れた資格情報がRefererやブラウザ履歴から漏れる経路を指摘している。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc9700.html) |
| A-6 | 401には`WWW-Authenticate: Bearer`を付ける。権限不足は403にする。応答本文に失敗理由の詳細を出さない。 |
| A-7 | 認可チェックは`Principal::require_scope(&Scope)`のようなメソッドで行う。ハンドラー内で文字列比較を散在させない。 |

### 8. ユーザー識別子とDB規約

```text
users
  id            UUID  PK  ← JWTのsub
  created_at, status

credentials              ← auth-localだけが使う
  user_id → users.id
  password_hash (Argon2id 等)

external_identities      ← auth-ssoだけが使う（後から追加）
  user_id → users.id
  issuer, subject
  UNIQUE(issuer, subject)
```

| ルール | 内容 |
|---|---|
| D-1 | 業務データの所有者は常に`users.id`で参照する。外部プロバイダーのIDを業務テーブルに入れない。 |
| D-2 | `credentials`と`external_identities`は別テーブルにする。業務テーブルから参照しない。 |
| D-3 | 外部アカウントの識別は`(issuer, subject)`の組で行う。メールアドレスで同一人物と自動判定しない。 |
| D-4 | SSO追加のマイグレーションは、新規テーブルの追加だけで済み、既存テーブルのカラム変更を伴わないこと。 |

D-3の理由は、メールアドレスはプロバイダー間で一意性・検証状態が保証されないためです。これはアカウント乗っ取りを防ぐための設計判断です。

### 9. リフレッシュトークン規約

| ルール | 内容 |
|---|---|
| R-1 | リフレッシュトークンはJWTではなく、不透明なランダム値にする。 |
| R-2 | DBにはハッシュだけを保存する。 |
| R-3 | 使用のたびにローテーションし、旧トークンの再利用を検出したらそのセッションの系列全体を失効させる。RFC 9700は、パブリッククライアントのリフレッシュトークンについて、送信者制約かローテーションのいずれかを要求している。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc9700.html) |
| R-4 | リフレッシュトークンの保存先は、ログイン方式に依存しない`sessions`テーブルにする。 |
| R-5 | ユーザー単位の一括失効用に`users.token_version`を持たせ、アクセストークンの検証後の失効確認に使う。 |

### 10. 後付けSSOモジュールが守る規約

`auth-sso`を追加するときの制約です。いまの段階で`api`側のルールとして固定しておきます。

| ルール | 内容 |
|---|---|
| S-1 | Authorization Code＋PKCE（`S256`）を使う。Implicit Grantは使わない。RFC 9700は、アクセストークンを認可レスポンスで返す方式を避け、`code`を使うことを求めている。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc9700.html) |
| S-2 | `state`（OIDCでは`nonce`も）をリクエストごとに生成し、ユーザーのブラウザセッションに結び付けて、1回限り使用にする。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc9700.html) |
| S-3 | リダイレクトURIは完全一致で登録する。ワイルドカードやオープンリダイレクタを作らない。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc9700.html) |
| S-4 | 複数のプロバイダーを扱うときは、発行元（`iss`）の検証でミックスアップ攻撃を防ぐ。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc9700.html) |
| S-5 | Resource Owner Password Credentialsグラントは使わない。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc9700.html) |
| S-6 | 外部IDトークンは`auth-sso`内で検証して捨てる。APIには渡さない。 |
| S-7 | 出力は`AuthenticatedUser`だけにする。`TokenIssuer::issue`を呼んで自サービスのトークンを返す。 |
| S-8 | 外部アカウントの内部ユーザーへの紐づけは、`external_identities`への登録・検索だけで行う。 |
| S-9 | プロバイダーごとの登録情報（クライアントID・シークレット）は、設定／環境変数から読む。コードに埋め込まない。 |

### 11. ログ・運用規約

| ルール | 内容 |
|---|---|
| L-1 | トークン、認可コード、`code_verifier`、パスワード、クライアントシークレットをログに出さない。 |
| L-2 | 認証イベントは`jti`、`sub`、`method`、結果、時刻を構造化ログに残す。 |
| L-3 | 通信はTLS必須とする。TLSを終端する中継点がある場合は、その区間も保護する。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc9700.html) |
| L-4 | `iss`、`aud`、許可アルゴリズム、鍵の場所、有効期間は環境変数／設定ファイルで与え、コードに固定値を持たない。 |

### 12. テストと検査ゲート

CIで次の負例テストをすべて通すことを必須にします。

| ID | 入力 | 期待結果 |
|---|---|---|
| N-1 | `alg: none`のトークン | 401 |
| N-2 | 許可外アルゴリズム（HS256等）のトークン | 401 |
| N-3 | 公開鍵をHMAC鍵として署名したトークン（RS→HS混同） | 401 |
| N-4 | 署名改ざん | 401 |
| N-5 | `exp`切れ | 401 |
| N-6 | `iss`不一致 | 401 |
| N-7 | `aud`不一致、または欠落 | 401 |
| N-8 | `sub`欠落 | 401 |
| N-9 | `typ`不一致（別種のJWT） | 401 |
| N-10 | 未知の`kid` | 401 |
| N-11 | `jku`/`x5u`付きのトークン | ヘッダーのURLを取得しない |
| N-12 | `Authorization`ヘッダーなし、形式不正 | 401 |
| N-13 | 必要な`scope`なし | 403 |
| N-14 | クエリ文字列でトークン送信 | 401 |

N-1〜N-3はRFC 8725が挙げる既知の攻撃です。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc8725.html)

静的検査ゲートでは、次の2点を機械的にチェックします。

- `api`クレートが`auth-local`と`auth-sso`に依存していないこと。`cargo metadata`などで検査する。
- ハンドラー内に`Authorization`ヘッダーや`jsonwebtoken`の直接利用がないこと。

### 13. SSO追加時の変更範囲

この規約を守った場合、SSO追加時に変更するものと変更しないものは次のとおりです。

| 変更する | 変更しない |
|---|---|
| `auth-sso`クレートの追加 | `api`の業務ハンドラー |
| `external_identities`テーブルの追加 | JWTの検証ミドルウェア |
| `main`でのルーターmerge | `Principal`の型と使い方 |
| プロバイダー設定の追加 | `users`と業務テーブル |

この表の右列に変更が必要になった場合は、規約違反か規約の不足のどちらかです。その箇所を特定して、規約を更新してください。

# Q2

*-operation や *-core に処理実体を書いて、CLI/REST/WebSocket/gRPC/MCP/A2A を薄いインターフェース層として同一操作群に対して実装する。認証機構も共通化しなければならない。JWT認証で実装しておき、OSSを後付けできるよう実装しておけるか。

# A2

はい。その構成で、**認証・認可も共通化し、JWT認証から始めてSSOを後付けできます。**

ただし、共通化するのは「HTTPミドルウェア」ではなく、プロトコル非依存の「認証サービス」と「操作ごとの認可」です。前の説明にあった、共通認証traitがAxumの`Router`を返す設計は、この要件には合いません。Axum依存はREST側のアダプターに閉じ込めます。

以下を、この構成に合わせた実装ルールとしてください。SSOを追加する際の方針は、外部ログインの検証結果を内部ユーザーに対応づけ、既存のJWT発行につなぐ方式です。

## 1. 全体構成

```text
CLI / REST / WebSocket / gRPC / MCP / A2A
                  │
       資格情報の抽出・入力形式の変換
                  │
                  ▼
       共通認証サービス：JWT検証
                  │
            VerifiedIdentity
                  │
                  ▼
       *-operation：認可＋操作の実行
                  │
                  ▼
       *-core：ドメイン規則・不変条件
```

ログイン処理は、通常の操作呼び出しとは別の入口にします。

```text
現在のログイン方式 ──┐
                    ├─→ 内部ユーザーの特定 ─→ 共通JWT発行
後から追加するSSO ──┘
```

ここから先は、推奨するプロジェクト規約です。JWTの暗号的検証や、各プロトコル固有の仕様上の制約とは区別します。

## 2. crateの責務と依存方向

| crate例 | 責務 | 依存させないもの |
|---|---|---|
| `identity-core` | 内部ユーザーID、認証済み主体、認証・認可の契約 | Axum、tonic、CLI、JWTライブラリ |
| `identity-operation` | ログイン成立、内部ユーザーの解決、アカウント連携、トークン発行の調整 | 各トランスポートの型 |
| `identity-jwt` | JWT発行・検証、鍵の解決 | Axum、tonic |
| `authorization` | 共通の認可ポリシー実装 | HTTPステータスやgRPCステータス |
| `*-operation` | 操作の認可、業務処理、トランザクション | JWT、HTTPヘッダー、外部プロバイダー |
| `*-core` | ドメインモデル、不変条件 | ログイン方式、JWT、トランスポート |
| `interface-*` | 入出力変換、資格情報の抽出、共通処理の呼び出し | 業務処理の実体 |
| `identity-sso` | 後付けするOIDC等の外部認証 | 業務操作の内部実装 |
| 実行バイナリ | 設定、依存注入、ルーターやサービスの組み立て | — |

ルール：

- 共通crateに`axum::Router`、`Request`、`HeaderMap`、`tonic::Request`などを持ち込まない。
- `identity-sso`は、REST・CLIなどのインターフェースから呼べるプロトコル非依存の機能を提供する。
- SSO用HTTPルートが必要なら、`interface-auth-http`などのアダプターで実装する。
- 接続・設定は実行バイナリに集約する。

## 3. JWTではなく、認証済み主体を操作層へ渡す

操作層の入力を、生のJWTにしてはいけません。

```rust
// 契約の概念例。traitの非同期化やDI方式は別途決める。
pub struct VerifiedIdentity {
    subject: SubjectId,
    scopes: ScopeSet,
    session_id: Option<SessionId>,
}

pub struct OperationContext {
    identity: VerifiedIdentity,
    request_id: RequestId,
}

pub trait AccessTokenVerifier {
    fn verify(
        &self,
        token: &str,
        target: &ResourceId,
    ) -> Result<VerifiedIdentity, AuthenticationError>;
}
```

規約：

1. `VerifiedIdentity`のフィールドを公開せず、一般のインターフェース層が任意のユーザーIDから生成できないようにする。
2. デシリアライズして`VerifiedIdentity`を直接生成できないようにする。
3. `*-operation`にはJWT、`iss`、外部アカウントIDを渡さない。
4. `target`はサーバー側の信頼済み設定から渡す。リクエストの自己申告をそのまま使わない。
5. 認証主体は、人間だけでなくサービスやエージェントも表現できる型にする。人間の代理実行が必要なら「実行主体」と「代理対象」を区別する。

認証・認可で使う内部表現と、JWTクレームの表現は別にします。将来JWTのクレーム構造を変えても、操作層への影響を閉じ込めるためです。

## 4. 認可は操作層で必ず実行する

**認可を各インターフェースだけに置かない**ことが、今回の構成では最重要です。

```rust
pub async fn update_document(
    &self,
    ctx: &OperationContext,
    input: UpdateDocument,
) -> Result<Document, OperationError> {
    let document = self.repository.load(input.id).await?;

    self.authorizer.require(
        ctx.identity(),
        Action::UpdateDocument,
        &document,
    )?;

    // 業務規則を適用して保存
    // ...
}
```

必須ルール：

- 同じ操作をREST・CLI・MCPなど、どこから呼んでも同じ認可を通す。
- インターフェース層の事前チェックは追加してよいが、操作層の認可の代わりにしない。
- scopeだけでなく、所有者、テナント、対象リソース、必要なら現在のアカウント状態を確認する。
- テナントIDや所有者IDは、入力値を信用するのではなく、認証主体と対象リソースの関係から検証する。
- 公開操作と認証必須操作を明示的に区別する。`Option<Identity>`を渡して各所で曖昧に判断しない。
- 認可と更新の競合が問題になる操作は、トランザクションや条件付き更新で整合性を確保する。

`*-core`には所有権などのドメイン規則を置いて構いません。ただし、JWTの解析やHTTPエラーの生成は置きません。

## 5. 各インターフェースが担当する範囲

| インターフェース | 担当する処理 |
|---|---|
| REST | ヘッダーから資格情報を取り出し、共通検証を呼ぶ。結果・エラーをHTTPへ変換 |
| gRPC | メタデータ等から資格情報を取り出し、共通検証を呼ぶ。結果・エラーをgRPCへ変換 |
| WebSocket | 接続時認証・期限切れ・再認証の方針を実装し、各操作には検証済み主体を渡す |
| CLI | トークン取得・保管・更新、またはローカル実行時の明示的な主体確立 |
| MCP | 採用するMCP仕様に従った認証・認可の公開方法を実装し、内部では同じ操作を呼ぶ |
| A2A | 採用するA2A仕様のセキュリティ方式を実装し、内部では同じ操作を呼ぶ |

上表はアダプターの設計方針です。具体的な通信方式や認証フローは、採用するプロトコルのバージョンごとに確定させます。

追加ルール：

- WebSocketや長時間ストリームでは、接続時の認証成功を永久に有効としない。期限切れ時の切断・再認証・操作拒否を仕様化する。
- CLIが操作層を直接呼ぶ場合も、暗黙の管理者権限を与えない。
- ローカル管理モードが必要なら、別の明示的な認証経路・権限・監査を設ける。
- トークンや秘密情報を、引数表示、ログ、エラー本文へ出さない。

## 6. 全インターフェースで「同じJWT」を使う必要はない

共通化するのは、検証実装と内部主体モデルです。どの入口でも、どのJWTでも使える設計にはしません。

JWT検証では、署名・アルゴリズム・発行元・宛先・期限などを検証します。特に`aud`は、そのトークンを受け取ってよいリソースを制限するためのものです。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc8725.html)

```text
REST用トークン → RESTの対象リソースとして検証 ─┐
MCP用トークン  → MCPの対象リソースとして検証 ──┼→ 同じ内部主体モデル
gRPC用トークン → gRPCの対象リソースとして検証 ─┘
```

採用するセキュリティ境界に応じて対象リソースを定義し、各入口は自分向けのトークンだけを受け付けます。

特にMCPでは、MCPサーバー自身に向けて発行されたトークンの検証が必要です。受信トークンをそのまま別の下流APIへ渡すtoken passthroughも禁止されています。 [modelcontextprotocol](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

一方、MCPアダプターが同一プロセス内の`*-operation`を呼ぶ場合は、JWTを転送せず、検証済み主体を渡す設計にできます。

## 7. SSOを後付けするための固定契約

今の段階で、次の契約だけ用意します。

```text
本人確認に成功した結果
         ↓
内部主体IDの解決
         ↓
発行してよい権限・対象リソースを決定
         ↓
共通のアクセストークン発行
```

必須ルール：

- JWTの`sub`は内部の不変な主体IDにする。
- 外部アカウントは内部主体と別管理にする。
- 外部アカウントは、OIDCなら`(issuer, subject)`で識別する。
- 同じメールアドレスだからという理由だけで、自動的にアカウントを統合しない。
- 発行する権限は共通ポリシーから決定する。ログイン方式やクライアントが任意のscopeを自己申告して取得できないようにする。
- JWTの発行処理を、パスワード照合処理に埋め込まない。
- 外部IDトークンと自サービスのアクセストークンは別用途として検証する。異なる種類のJWTが互いに受理されない検証規則を定める。 [rfc-editor](https://www.rfc-editor.org/rfc/rfc8725.html)

後付けするSSO crateは、この契約につなぎます。

```text
identity-sso
  外部ログインを検証
       ↓
identity-operation
  外部アカウント → 内部主体を解決
       ↓
identity-jwt
  既存仕様のアクセストークンを発行
```

別サーバーやプロキシは不要です。crateを追加して、組み立て側で接続できます。

## 8. 「JWT対応」と「標準クライアント対応」を区別する

JWTを検証できるだけでは、第三者のMCPクライアントなどが自動的にログインできるとは限りません。

MCPでは、トークン検証に加え、採用する仕様に従った認可サーバーの発見や認可フローへの対応が必要になります。 [modelcontextprotocol](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

そのため、後付け可能にする対象は次の2つに分けます。

| 対象 | 後から追加するもの |
|---|---|
| Google等によるログイン | 外部本人確認・アカウント紐づけ |
| 標準クライアントによるトークン取得 | 必要なOAuthエンドポイント・メタデータ・クライアントフロー |

操作層はどちらにも依存させません。ただし、後者まで含めて「SSO crateを入れるだけで全プロトコルの設定が不要」とはしません。

## 9. 実装の受け入れ条件

次をCI・統合テストの合格条件にします。

1. 同じ主体・権限・入力なら、どのインターフェースからも同じ操作結果と認可結果になる。
2. 各インターフェースから、操作層の認可を迂回できない。
3. 署名不正、期限切れ、発行元不一致、宛先不一致を共通検証で拒否する。
4. REST用の資格情報を、設定上許可していない別リソースの入口で受理しない。
5. インターフェース層が任意の`VerifiedIdentity`を生成できない。
6. `*-operation`と`*-core`が、Axum・tonic・JWTライブラリ・SSOプロバイダーに依存しない。
7. SSO追加後も、既存操作の署名・内部主体ID・業務データの参照先が変わらない。
8. 期限切れ・失効・無効化について、長時間接続と通常リクエストで定めた方針どおりに動く。

この構成なら、今はJWT認証だけで実装し、後からSSO crateを足せます。固定すべき境界は **「資格情報 → 検証済み主体 → 操作単位の認可 → 業務処理」** であり、Axumの認証ミドルウェアではありません。

# Q3

*-core, *-operation, *-conformance, *-rest, *-websocket, *-cli, *-grpc, *-mcp, *-a2a などはそれぞれ別の crate としてディレクトリが分けられる。あなたの提案は矛盾しないか。

# A3

矛盾しません。各ディレクトリが独立したcrateであり、`*-rest`などを薄いインターフェース層にする構成と両立します。

ただし、前の提案には修正すべき点がありました。`interface-*`はあなたの`*-rest`・`*-grpc`などに相当する説明上の名前であり、別の層を追加する意図ではありません。また、`identity-operation`から`identity-jwt`を直接呼ぶのではなく、trait経由で接続する必要があります。

## あなたのcrate構成に合わせた依存関係

以下で`A → B`は「AがBに依存する」です。

```text
foo-rest ───────┐
foo-websocket ──┤
foo-cli ────────┤
foo-grpc ───────┼──→ foo-operation ──→ foo-core
foo-mcp ────────┤          │
foo-a2a ────────┘          └──→ identity-core
       │
       └──→ identity-core

foo-conformance ──→ 適合性を検査する公開契約
```

共通認証の実装側は別にします。

```text
identity-jwt ───────→ identity-core
identity-operation → identity-core
identity-sso ───────→ identity-core  ← 後から追加

実行バイナリ／組み立てcrate
  └─ 各インターフェースと認証実装を接続
```

`identity-core`などの名前は例です。既存の命名規則に合わせて構いません。

## 各crateの責務

| crate | 責務 |
|---|---|
| `foo-core` | ドメイン型、不変条件、必要な抽象契約 |
| `foo-operation` | 共通操作の実体、操作ごとの認可、処理の調整 |
| `foo-conformance` | 公開契約に対する適合性検査。同じ操作群の意味・認可結果などを検証 |
| `foo-rest` | HTTP入出力、資格情報の抽出、共通認証・共通操作の呼び出し |
| `foo-websocket` | WebSocket入出力、接続の認証状態管理、共通操作の呼び出し |
| `foo-cli` | CLI入出力、資格情報の取得、共通操作の呼び出し |
| `foo-grpc` | gRPC入出力、資格情報の抽出、共通操作の呼び出し |
| `foo-mcp` | MCP入出力、プロトコル固有要件への対応、共通操作の呼び出し |
| `foo-a2a` | A2A入出力、プロトコル固有要件への対応、共通操作の呼び出し |

各インターフェースは、ほかのインターフェースcrateに依存させません。例えば、`foo-mcp`から`foo-rest`を呼んで共通化するのではなく、両方が`foo-operation`を呼びます。

## 認証もtraitと実装を分ける

インターフェースcrateには、JWT検証の具体実装ではなく、共通契約を注入します。

```text
foo-rest ──→ AccessTokenVerifier trait ←── identity-jwt
foo-grpc ──→ AccessTokenVerifier trait ←── identity-jwt
foo-mcp  ──→ AccessTokenVerifier trait ←── identity-jwt
```

操作の実行経路は、どの入口でも同じです。

```text
各インターフェースcrate
  1. 資格情報を抽出
  2. 注入された共通認証実装で検証
  3. 検証済み主体と入力をfoo-operationへ渡す
                         ↓
foo-operation
  4. 共通の認可を実行
  5. 業務操作を実行
```

## 前の提案から修正する点

- **共通契約にAxum型を含めない。** `Router`を返すtraitは`*-rest`などのHTTP専用層に限定します。
- `identity-operation`はJWT実装やSSO実装へ直接依存せず、必要なtraitへ依存します。
- 認証処理・操作処理・各アダプターの接続は、実行バイナリまたは組み立て専用crateが担当します。
- `*-conformance`には検査を置き、通常のリクエスト処理を通過させる実行層にはしません。

この整理なら、あなたのcrate分割と矛盾しません。SSO追加時に変更するのは、原則として「SSO実装crate・必要な認証用アダプター・組み立て・設定」であり、`foo-operation`や`foo-core`の業務処理ではありません。

# Q4

それぞれのインターフェース層実装に使用するべき最適なRust crateを調査。REST Axumで決定済み。

# A4

あなたの構成なら、RESTは決定済みのAxum、WebSocketもAxum、CLIはclap、gRPCはtonic、MCPは公式rmcp、A2Aは公式`a2aproject/a2a-rs`系を推奨します。

選定基準は「最高速度」単独ではなく、既存のAxumとの整合性、薄いアダプターとしての使いやすさ、公式仕様への追従、共通操作・共通認証を分離できることです。以下は公開ドキュメントを調べた推奨であり、実プロジェクトでの結合ビルド・性能測定済みという意味ではありません。

## 推奨一覧

| 自作crate | 採用するcrate | 選定理由・役割 |
|---|---|---|
| `*-rest` | `axum` | 決定済み。ルーティング・入力抽出・HTTP応答への変換を担当させる。 [docs](https://docs.rs/axum/latest/axum/extract/index.html) |
| `*-websocket` | `axum`の`ws` feature | RESTと同じHTTP基盤を使用できる。`WebSocketUpgrade`、送受信、フレーム・メッセージサイズ制限を提供する。 [docs](https://docs.rs/axum/latest/axum/extract/ws/index.html) |
| `*-cli` | `clap`の`derive` feature | 引数・サブコマンド・ヘルプ生成を担当。CLI入力を操作入力へ変換する薄い層に適している。 [docs](https://docs.rs/clap/latest/clap/) |
| `*-grpc` | `tonic`＋`prost`＋`tonic-prost`、ビルド時に`tonic-prost-build` | `.proto`からサービス・メッセージを生成。双方向ストリーム、メタデータ、TLSなどを提供する。 [github](https://github.com/hyperium/tonic) |
| `*-mcp` | `rmcp` | MCP公式Rust SDK。ツール・リソース・プロンプトなどのプロトコル処理を任せられる。 [github](https://github.com/modelcontextprotocol/rust-sdk) |
| `*-a2a` | 公式SDKの`a2a-server-lf`＋`a2a-lf` | Axumベースのサーバー実装とA2A型。必要なら公式SDKの`a2a-grpc`を追加する。 [github](https://github.com/a2aproject/a2a-rs) |

特にA2Aは、リポジトリ名・Rust上の依存名・crates.ioのパッケージ名が一致しないため注意が必要です。

## WebSocket：Axumの`ws`を使う

推奨は、**Axum**のWebSocket機能をそのまま使用する構成です。

```text
*-rest       → axum
*-websocket  → axum［ws］
```

同じcrateへ統合する必要はありません。それぞれ別crateとしてルーターを公開し、組み立て側で合成する設計にします。

Axumは、アップグレード時に状態を接続処理へ渡せます。また、最大メッセージサイズ・フレームサイズ・書き込みバッファ上限などを設定できます。 [docs](https://docs.rs/axum/latest/axum/extract/ws/index.html)

`tokio-tungstenite`をサーバー側の直接依存として追加するのは、Axumの抽象化では不足する要件がある場合だけでよいでしょう。Axum自身が内部でこれを使用しています。 [docs](https://docs.rs/axum/latest/src/axum/extract/ws.rs.html)

実装上は次を`*-websocket`の責務にします。

- 接続・切断、認証期限、再認証の扱い。
- メッセージから操作入力への変換。
- 操作IDと応答の対応づけ。
- バックプレッシャーとサイズ制限。

業務処理と操作単位の認可は`*-operation`に残します。

## CLI：clapを使う

推奨は`clap`のderive形式です。

```rust
#[derive(clap::Parser)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}
```

`Parser`・`Subcommand`などでコマンド体系を表現でき、ヘルプ・入力エラー・補完関連のエコシステムも備えています。 [docs](https://docs.rs/clap/latest/clap/)

あなたの構成では、次の境界にします。

```text
clapの引数型
    ↓ 変換
*-operationの入力型
    ↓ 実行
操作結果
    ↓ 整形
標準出力・標準エラー・終了コード
```

`clap`の属性を操作入力型に直接付けるのは避けます。操作契約にCLI都合を持ち込まないためです。

また、CLIについては次の2モードを設計上区別してください。

| モード | 操作の呼び出し方 |
|---|---|
| ローカル実行 | 認証済み主体を確立し、同一プロセスの`*-operation`を呼ぶ |
| リモートクライアント | JWTを使用し、RESTやgRPCなどのサーバーを呼ぶ |

両者を暗黙に混ぜず、資格情報・認可・監査の方針を明示します。

## gRPC：tonic＋prost系を使う

推奨構成は次です。

```text
実行時
  tonic
  prost
  tonic-prost

ビルド時
  tonic-prost-build

必要時のみ
  tonic-health
  tonic-reflection
```

tonicはTokio・Hyperベースで、双方向ストリーム、カスタムメタデータ、認証、TLS、ヘルスチェックなどを提供します。 [github](https://github.com/hyperium/tonic)

重要なのは、**生成型**を操作層へ漏らさないことです。

```text
protobuf生成型
    ↓ *-grpc内で変換
操作入力型
    ↓
*-operation
    ↓
操作結果型
    ↓ *-grpc内で変換
protobuf生成型
```

公開リポジトリでは、`master`は破壊的変更の準備中であり、リリース済みコードは`0.14.x`ブランチを参照するよう明記されています。依存は開発ブランチではなく、互換性を確認したリリース系列で固定してください。 [github](https://github.com/hyperium/tonic)

RESTとgRPCを最初から同じポートへまとめることは、今回の設計の必須条件にしないのがよいです。crate分離と共通操作の実現には、同一ポートは必要ありません。

## MCP：公式rmcpを使う

推奨は、**rmcp**です。MCP公式Rust SDKであり、プロトコル実装とツール実装用マクロを提供しています。 [github](https://github.com/modelcontextprotocol/rust-sdk)

あなたの構成では、OpenAPIからのRESTラッパー生成ではなく、操作を直接呼ぶアダプターにします。

```text
MCP tool
    ↓ 引数・認証情報の変換
*-operation
    ↓
MCP結果へ変換
```

この構成なら、`*-mcp`が`*-rest`へ依存しません。

注意点は、JWT検証を共通化しても、MCP固有の認証公開方法まで消えるわけではないことです。HTTPベースのMCPでは、採用仕様に従った認可サーバーの発見や、対象MCPサーバー向けのトークン検証が必要です。 [modelcontextprotocol](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

したがって、共通認証を呼び出す部分と、MCPプロトコル固有の認証応答・メタデータを返す部分を分けます。

## A2A：公式SDKを第一候補にする

推奨は、A2A公式SDK一覧に掲載されている`a2aproject/a2a-rs`です。 [a2a-protocol](https://a2a-protocol.org/latest/sdk/)

公式リポジトリが案内する名前は次のとおりです。

| Rust側の依存名 | crates.ioのパッケージ名 | 用途 |
|---|---|---|
| `a2a` | `a2a-lf` | A2Aのプロトコル型・エラー・イベント |
| `a2a-server` | `a2a-server-lf` | AxumベースのREST・JSON-RPCサーバー |
| `a2a-client` | `a2a-client-lf` | クライアントが必要な場合 |
| `a2a-grpc` | `a2a-grpc` | gRPCバインディングが必要な場合 |
| `a2a-pb` | `a2a-pb` | protobuf型や変換が必要な場合 |

公式SDKはJSON-RPC、HTTP＋JSON、gRPC、SSEによるストリーミングなどを提供しています。 [github](https://github.com/a2aproject/a2a-rs)

`a2a-rs`という文字列だけでcrateを選ばないでください。同名に近い別実装が存在し、公式リポジトリが公開するパッケージとは区別が必要です。 [github](https://github.com/a2aproject/a2a-rs)

あなたのアダプターは次の構成にします。

```text
A2Aのmessage/task
    ↓
*-a2a
  入力変換
  認証済み主体の接続
  タスク状態・ストリーミングへの対応
    ↓
*-operation
```

A2Aはタスク状態やイベントも扱うため、単純な「関数引数を変換して呼ぶ」以上のプロトコル状態管理が必要になります。SDKはタスク・ストリーミング・ストアを扱う構成を提供しています。 [github](https://github.com/a2aproject/a2a-rs)

ただし、A2Aのタスク状態管理と、業務操作自体の処理状態は区別します。業務の実体を`*-a2a`に移さない設計にしてください。

## 採用時の固定ルール

今回の構成には、以下を実装規約として追加することを推奨します。

1. 各インターフェースcrateは、自分のプロトコルSDKと共通操作契約へ依存する。
2. 各インターフェースcrateから、別のインターフェースcrateを経由して操作を呼ばない。
3. SDK型・生成型・マクロ属性を`*-core`／`*-operation`へ漏らさない。
4. JWT検証は共通実装を注入し、認可は共通操作の実行経路で必ず行う。
5. Axum・tonic・MCP・A2Aのバージョン整合性は、組み立て用バイナリで確認する。
6. `workspace.dependencies`で依存を管理し、採用リリースと`Cargo.lock`を固定する。
7. SDKのバージョン番号だけでなく、対応するプロトコル仕様を記録する。

結論として、採用候補は次で確定してよいです。

```text
*-rest        axum
*-websocket   axum［ws］
*-cli         clap［derive］
*-grpc        tonic + prost + tonic-prost
*-mcp         rmcp
*-a2a         a2a-server-lf + a2a-lf
```

A2Aだけは、似た名前の非公式crateとの取り違えと、公式SDKの対応仕様・公開パッケージ名を重点的に確認してください。 [github](https://github.com/a2aproject/a2a-rs)
