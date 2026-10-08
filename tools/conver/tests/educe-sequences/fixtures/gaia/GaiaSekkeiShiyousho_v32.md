# Gaia 設計仕様 v32

## 0. この仕様書の読み方

Gaiaは、証明書を通じて人・AIエージェント・組織が関係を作り、その関係が時間と実績によって成熟していくP2Pネットワークである。

この仕様には数式が出てくる。しかし、数式は人を困らせるためではなく、「誰かの気分や運営者の都合でルールが変わらない」ようにするためにある。各式の直前には、何を測る式なのかを普通の言葉で説明する。数式を読まなくても、太字の結論と例を読めば全体の動作を理解できるように記述する。

この仕様書は、それ単体で完結する。過去バージョンの読解を前提にしない。node間輸送、発見、relay、HTTP binding、Gaiaとのsession接合は、第28章・第29章で完全に定義する。

本書の正本言語は日本語である。

本書は、forumごとに独立した証明書・成熟度の検証規則と、アセット・決済の経済規則に加え、時刻健全性、SoulとBody（端末を失ったときの正規な転生）、および限定的な中央サービス（Soul-Bank、eKYC、Payment-Service、統合Gaia Bank）を、単一の文書として完全に記述する。

フィールド名、型名、列挙値、hash、公開鍵、数式の変数名は、実装間の相互運用性のため英語・ASCIIで表記する。第12章で規定する一般利用者向けレコメンド本文だけは、国際的な共有に適した英語を標準表示文として規定する。これは仕様書全体を英語化するものではない。

中央のサービスが増えるが、これはforumの信頼計算を中央化するものではない。Soul-Bank、eKYC、Payment-Service、統合Gaia Bankのいずれも、Q、depth、CanIssue、CanIssueTo、AssetScore、A_seed、各ボーナス、Candidates、Reach、checkpoint最終性を裁定しない。金銭や本人確認が、成熟度・信用・発行権・創設能力を買う経路は、本仕様全体で禁止する。

> Soul又はforum root authorityの譲渡対価は、財産的・運用的な承継に対する外部決済であり、過去の成熟、関係、発行資格、Civic影響又は公共意思形成上の地位の対価であってはならない。譲渡後のcontrollerが、譲渡前Soulの`Q`、depth、`CanIssue`、`CanIssueTo`、通常`AssetScore`、`A_seed`、各bonus、Candidates、Reach又はCivicCitizen資格を継承する設計は受理しない。

本書は、eKYCを単なる回復・保管・商用接続の補助ではなく、公共意思形成と責任付き市民市場における市民性の証明として用いる。ただしeKYCは、`Q`、`depth`、`CanIssue`、`CanIssueTo`、`A_seed`、通常`AssetScore`、各既存bonus、通常`Candidates`、通常`Reach`、forum創設資格またはcheckpoint最終性を買う経路になってはならない。`membership_ekyc_policy=verified_required`のforumでは、eKYCは`ActiveMember`述語（第4.2節、第13.2節）を通じてforum参加境界にだけ作用し、いかなる係数・重み・閾値・bonus項もeKYC状態を直接読まない（第24.19節）。

本仕様では、eKYC済みの主体だけが、Soul又はforum root authorityの譲渡当事者になれる。この譲渡について、本章の読み方に以下を追加する。

- eKYC更新と譲渡の履歴は、署名済み・内容アドレス化・追記型のobject列として残る。
- eKYCは譲渡当事者の実在責任主体を確認するが、成熟度、発行権、asset評価、Civic影響を買う資格を作らない。
- 譲渡は、別人格性、Soul又はforumの正当な支配、凍結、決済予約、紛争状態、旧権限失効、新権限束縛、checkpoint commitを検証できる場合にだけ成立する。
- 譲渡の詳細は、第1.4節の概要、第16章のSoul Transfer、第5章のroot authority継承、第17章の譲渡用eKYC、第18章の決済予約、第24章の原子的遷移に定める。

Civic Vote、CivicNeedAsset、CivicCandidatesおよびCivicReachに関する主張も、通常のGaia主張と同様に、署名済みobject、`StateProofEnvelope`、checkpoint、Merkle proofおよび必要なeKYC credential依存閉包だけで完全オフライン検証できなければならない。

eKYCは永続資格ではない。CivicCitizenとして扱うには、`IdentityBindingCredential`が評価時点を厳密に覆い、当該時点における未失効状態が検証されなければならない。

本仕様では、Soul又はforum root authorityの譲渡を論じるために、次の用語を追加で用いる。

- **controller**: ある時点・あるtrust epochにおいてSoulの通常authorityを正当に行使する、eKYCで束縛された実在責任主体。
- **predecessor controller**: 譲渡直前のSoul又はforum root authorityの正当なcontroller。
- **successor controller**: 譲渡finalization後にSoul又はforum root authorityを正当に操作するeKYC済み主体。
- **trust epoch**: 人格的信頼、成熟、関係、Civic資格の利用境界を区切るSoulごとの単調増加整数。Soul譲渡のfinalizationは必ずtrust epochを増分する。
- **transfer freeze**: 譲渡対象の状態を評価時点へ固定し、二重譲渡、資産抜出し、権限競合及び状態操作を防ぐ一時的な通常書込み停止。
- **protocol finality**: Gaia object、Soul-Bank record又はforum checkpoint上で、譲渡の権限交替が検証可能に確定した状態。
- **economic availability**: Stripeのrefund、dispute、chargeback、reserve等を考慮して、売主の受取請求権又は外部Payoutが利用可能となる経済的状態。

本仕様では、正規に許諾されたアセットの再流通・再許諾・派生販売が、当該販売を成立させた販売ノードの本来の販売者取り分の内部で、アセットの完全な権利系譜（**Asset Lineage Royalty; ALR**）へ自動分配される仕組みを追加する。これを論じるために、次の用語を追加で用いる。

- **Asset lineage**: あるassetが、どのorigin asset、派生asset、正規再許諾・再販権利に基づくかを示す、有向非巡回な権利系譜。
- **Origin asset**: `parent_asset_ref = null` である最初のasset。ALR policyを最初に確定するasset。
- **Asset commercial rights**: 読取・実行権とは別の、再販、再許諾、派生、商用利用、forum間流通に関する権利。
- **Rights grant**: 一つのSoulまたはassetに対し、明示した範囲の商用権限を与える署名済みgrant。
- **Resale**: 元assetのコンテンツ同一性を維持して、正規のアクセス・利用許諾を他者へ販売すること。
- **Sublicense**: 権利者が、自らの許諾範囲内で下流への利用・販売権限を許諾すること。
- **Derivative asset**: 親assetの許諾に従い、翻訳、編集、拡張、変形、統合等を行った新asset。
- **Lineage royalty**: 販売者原資の一部をasset lineageの祖先権利者へ配分するロイヤルティ。
- **Ancestor pool**: 一回の販売で販売者原資から切り出される、祖先権利者向けの総額。
- **Descendant seller**: 現在のsaleを成立させる`ServiceOffer`のprovider / beneficiary rule上の販売者。
- **Generation**: 現在販売するassetから親を1とする、祖先への距離。
- **Payout epoch**: Payment-Serviceが複数の確定済み`PayoutEntitlement`を集約して実送金する期間単位。

本仕様のALRは、次を基本原則とする。

- 購入・無料アクセス・閲覧・実行の権利は、再販売・再許諾・派生販売の権利を意味しない。
- 再販売・再許諾・派生販売は、明示的で検証可能な商用権利許諾がある場合にのみ可能である。
- ロイヤルティの唯一の金銭原資は、当該販売の`PaymentSettlement.beneficiary_pool_minor`である。購入者への追加課金、Gaia network maintenance fee、Forum Revenue Pool、外部補助金を原資にしない。
- 初代公開者は、アセット初版において祖先系譜への総割合・減衰規則・最大遡及深度を不変に焼き付ける。
- 子asset・再販offer・再許諾offer・派生assetは、祖先の不変なロイヤルティ条件を除外・弱化・置換できない。
- 計算は全て整数minor unit・basis points・canonical ordering・明示的丸めで行い、浮動小数点を使わない。
- ALRは投機的トークン、資産証券、二次市場で売買される債権を作らない。`PayoutEntitlement`は既存どおり非譲渡・非市場性とする。

### 0.1 本書が用いる規範ラベル（C1〜C9）

本書は、数値・尺度・相互運用性に関する規範的な制約を`C1`〜`C9`のラベルで参照する。これらは本書内で定義され、本書だけで完結する。

- **C1（報酬の基準量は対象object自身の量）**: あるobjectの点数・報酬は、そのobject自身が持つ量（例: 公開経路なら`AssetRecord.value(a)`）に率を適用して求める。forum全体の総量`A_max(F,t)`等を、object単位の報酬の基準量として代用してはならない。
- **C2（`A_max`と`A_real`の区別）**: `A_max(F,t) = A_seed(F,t) + A_real(F,t)` であり、`A_real(F,t) = sum(AssetRecord.value(a,t) for a in ActiveAssets(F,t))` である。`A_max`を`A_real`（`sum(value(a))`）へ再定義しない。
- **C3（`10000`はbasis pointの分母専用）**: `10000`はbasis pointの分母としてだけ用いる。`A_max`単位への換算、絶対上限の表現、比率形への換算、閾値の尺度として用いてはならない。
- **C4（`A_max`比例係数和の上限）**: `A_max`比例で加算される全経路の係数和は、厳密に10000 bps未満でなければならない。`10000*(1-exp(-kappa_1)) + publication_base_bps + sum_k(utility_weight_bps(k)) + 10000*gamma_F + 10000*chi + asset_mediated_cultivation_extension_cap_bps + I_protocol_max < 10000`。満たさないgenesis又はpolicy objectを拒否する。
- **C5（絶対上限はbps換算しない）**: `early_access_cap=L_F`、`L_c`、`seed_cap`等の絶対上限は、`AssetScore`又は`A_max`と同一の単位の絶対値であり、basis pointから`A_max`単位への換算規則を適用しない。
- **C6（genesisのcanonical encodeは不変）**: `forum_id = hash(canonical_encode(genesis))`（第2.3節）であるため、フィールドの追加・改名・削除・省略時既定値の変更は既存genesisのcanonical encodeを変え、`forum_id`を変える。既存object又はcheckpointが本版の新フィールドを欠く場合は、省略時既定値として解釈し、参照を差し替えず、再ハッシュしない。
- **C7（列挙型不変条件はその節と同時に更新する）**: 第9章・第11章・第13章その他が、`AssetScore`、`A_max`、`Candidates`、`Reach`、`AudienceIndex`、`CandidateIndex`等の構成項を列挙している場合、その構成項を変更する版は、当該列挙を含めて同時に更新する。
- **C8（用語の正規化）**: 同一の概念に複数の名前を用いない。改名はcanonical schemaの改名として扱い、旧名の解釈規則と`forum_id`不変の規則（C6）を伴わなければならない。
- **C9（object registryの更新）**: 新たに導入するobject型は、第22.1節のobject型一覧表へ登録し、その定義節を明示する。表に載らないobject型を本文だけで導入しない。

---

## 1. 全体像

### 1.1 Gaiaとは

Gaiaは、forum(フォーラム)ごとに独立した自己署名rootを起点とする証明書ネットワークである。単一のグローバル管理者、単一のグローバルroot、全参加者を支配する中央の信頼者は存在しない。誰でも、何個でも、新しいforumを作れる。

参加者（人、AIエージェント、組織の代理）は、時を超えて続く**Soul**と、その時々の端末や実行環境を表す**Body**の組として扱う。端末を失っても、Soulは正規の手続きで新しいBodyへ転生できる。ここで「中央の信頼者が存在しない」とは、forumの信頼計算（誰がどれだけ成熟し、何を発行できるか）を中央が決めないという意味である。Soul-Bank、eKYC、Payment-Service、統合Gaia Bankのような限定的な中央サービスは、この原則を侵さない範囲で本書に定義する。

Soulは通常、同一の実在責任主体（controller）の端末・Bodyの継続を表す。例外的に、本仕様が定める**Soul Transfer**によって、`soul_id`と履歴を維持したまま将来のcontrollerが変わり得る。この例外はBody転生ではない。譲渡後のcontrollerは、過去の主体の人格、投票、成熟又は関係を引き継がない。forumも、genesisとforum_idを維持したまま、本仕様の**Forum Root Succession**により将来のroot運営権限を後継controllerへ移せる。Soul TransferおよびForum Root Successionの詳細は、第1.4節、第5章、第16章、第17章、第18章に定める。

forumは「ある目的のために人やAIが集まり、証明書とアセットを共有する独立した空間」である。たとえば、ある技術分野の共同開発、ある地域の相互扶助、ある業務領域のAIワークフロー共有などが、別々のforumになり得る。

Gaiaには、検証の層と経済の層に加え、その両方を支える横断機構がある。

| 層 | 何を扱うか | 基本原則 |
|---|---|---|
| 証明書・成熟度層 | 参加、証明書、depth、発行資格、forumの系譜 | 提示された証明書と検証バンドルだけで完全オフラインで検証できる |
| アセット・経済層 | ツール、スキル、ワークフロー、アクセス、価格、告知・PR | アセット判定はオフライン。金銭の支払いだけが中央のPayment-Serviceを経由する |
| 時間・身体の健全性 | 時刻の整合、継続的な健康、Soulの一意な身体、端末喪失時の転生 | 健康と確認された時間だけが成熟に数えられる。Soul-Bankと時刻証人が短期の署名済みleaseを発行し、leaseの有効期限内はオフライン検証できる |
| 本人・保管の接続 | 現実人格との結び付け（eKYC）、保管・同期・復元（統合Gaia Bank） | 必要最小限の中央例外。Q、depth、発行権、AssetScore、seed、checkpoint最終性は裁定しない |
| 譲渡・責任継承層 | Soul controllerの交替、forum root succession、譲渡凍結、履歴、決済条件、異議 | eKYC済み両当事者、追記型履歴、旧責任の不変、trust epoch分離、凍結中のfail-closed |

Gaiaは、通常の証明書・成熟度・アセット経済に加え、現実責任主体としての市民性を必要とする限定的な公共層を持つ。公共層は、何が次に必要なアセットかをCivic Voteにより集計し、その需要に対応する市民NeedAssetの供給・市場到達を扱う。公共層は通常の成熟度層を上書きしない。未確認Soulも通常層では完全に参加できるが、公共層ではCivicCitizenとして検証されたSoulだけが正規市民として数えられる（第23章）。

Gaiaの最終的な目的は、単にネットワークを維持することではない。**第7章で述べる八つの正当な力学に対して、参加者が価値を見いだせる局所的な機会をネットワーク全体に作る**ことである。参加者は、浅い位置へ進む、forumを創設する、複数forumへ参加する、質の高い親forumを結ぶ、他者に証明書を発行する、eKYCを完了してCivicCitizenとして公共意思形成へ参加する、他者のアセットや公開カタログ・検索indexを安全に保存・配布・検索可能にし続ける、アセットを作成・公開し継続して利用可能に保つ、という異なる行動を選べる。

ただしGaiaは、全参加者・全時点・全forumにおいて、八つすべての行動が必ず得になるとは主張しない。需要、参加者、実アセット、審査、費用、競争、偶然は動く。Gaiaが作るのは必勝法ではなく、実アセット、正当な関係、独立した成熟、市場行動を通じて複数の勝ち筋が現れ、しかも空forum量産、重複親、循環発行、bonus再帰、金銭による成熟度購入のような近道が支配戦略にならない、流動的なネットワークゲームである。

第7.14節の`incentive_compatible_profile`を宣言するforumだけは、そこで定める有限の目標範囲・費用上限・asset floor・非飽和条件について、第1〜第5のアセット層の力学の局所的な正の機会を機械検査できる。これは現実世界の利益や参加を保証するものではない。

第7章の力学が生む価値を市場に届けるための告知・広告・PR・限定情報配布は、第10章で扱う。これらは新しい信用経路ではなく、既存の成熟度・アセット経済・決済層の上に構築される付随機能である。

### 1.2 最重要原則

証明書、forum、depth、発行資格、forum_chain、アセットアクセス点数、およびコンテンツ利用権に関する検証は、提示された証明書と検証バンドルだけで終わらなければならない。検証者はサーバー、第三者、ネットワークへ問い合わせてはならない。

より正確には、Gaiaが保証するのは次である。**中央サーバーやネットワークに問い合わせずに、提示された評価時点付き状態の正当性を検証できる**。ここでいう「提示された証明書と検証バンドル」は、第3.5節で定義する`StateProofEnvelope`として一体で配布・検証される。これは「世界のどこにも競合する状態が存在しない」ことまでは証明しない。未観測のforkや将来の状態変化の不在は、オフライン検証の対象外である。

オフライン検証が扱うのは「提示された証明書と状態」の正当性であり、外部事実の確認ではない。外部事実（支払い済みか、Soulが本人のものか、端末を失ったとき誰に復元してよいか）を扱う部分だけが中央サービスに委ねられる。Gaiaは、支払い済み確認・二重支払い防止・チャージバック対応をPayment-Serviceで、Soulの一意性と転生をSoul-Bankで、現実人格との結び付けをeKYCで行う。ただし、これらの中央サービスが発行する短期の署名済み**lease**（SoulEpochLease、TemporalHealthLease）と認可・支払いの証明は、必要な検証バンドル（第3.5節の`StateProofEnvelope`）に同梱すれば、その有効期限内はネットワーク照会なしに検証できる。これは証明書の有効性やdepthの判定を中央化するものではない。第10章で扱う告知の有料ブースト、PressRoom会員費、有料コンテンツの支払いも、このPayment-Serviceの範囲内で扱う。

> Payment-ServiceはStripe固定の外部決済・清算・分配接続を担う。Payment-Serviceは、Stripeが実際に控除した決済手数料、Owner thresholdが認可したGaia network maintenance fee、受取人別の期限付き`PayoutEntitlement`、Stripe Connected AccountへのTransfer、外部Payout、refund、dispute、chargeback、期限失効及び期限付きGaiaサービス還元を扱う。これらはcommerce層の状態であり、`Q`、`depth`、`CanIssue`、`CanIssueTo`、`AssetScore`、`A_seed`、bonus、`Candidates`、`Reach`、forum創設資格、checkpoint最終性又はCivic資格を裁定しない。決済レールは`stripe`に固定され、Stripe以外の外部決済レールを用いる決済objectは受理しない。Stripeは外部決済、Connected Accountの本人確認・規制上の受取資格、資金移転、payout、返金、異議申立て、チャージバックの外部事実を扱うにすぎず、Gaiaの証明書・成熟度・アセット評価・checkpointを裁定しない（第18章）。

通常のGaia権限（証明書の発行、Qへの寄与、アセットの登録・販売、checkpoint状態の利用など）を行使するには、その時点で次の三つがすべて満たされる必要がある。**(1)** そのSoulの唯一のactive body（現役の身体）であること、**(2)** 有効なSoulEpochLeaseを持つこと、**(3)** 対象forumで時間健全性が確認されている（healthy）こと。どれか一つでも欠ける間は、読み取り・検証・時刻回復のような限定的な操作だけが許される。この判定を、本書では通常権限の**健康・Soulゲート**と呼ぶ。詳細は第2章、第3章、第4章、および第14章以降の各章に定める。

> Soulが`transfer_pending`、`transfer_frozen`、`transfer_settling`又は`transfer_disputed`にある間、通常authorityの健康・Soulゲートを満たしていても、譲渡手続、異議、時刻再検証、読み取り、検証、復旧に明示的に許された操作以外を行使してはならない。forumについても同様に、`forum_root_transfer_frozen`時にはroot authority操作を停止する（第1.4節、第5章、第16章）。

Civic Vote、CivicNeedAsset供給資格、CivicCandidatesおよびCivicReachを検証する場合は、通常の健康・Soulゲートに加えて、**CivicCitizen**の有効性を検証しなければならない。CivicCitizenの検証は、`IdentityBindingCredential`、その発行者の`EkycServiceAuthorization`、credentialの期限、Soul束縛、必要な一意性scope、およびcheckpoint時点の失効状態proofを`StateProofEnvelope`内で確認することにより、ネットワーク照会なしに行う（第3.5節、第17章、第23章）。

eKYC provider、Soul-Bank、Payment-Service、forum rootその他の中央または限定的サービスは、Civic Voteの票数、投票先、NeedAsset順位、CivicCandidates、CivicReach、通常の成熟度または通常アセット経済を裁定してはならない。eKYC providerが行うのは、署名済みcredentialおよび失効状態の発行だけである。

Soul TransferおよびForum Root Successionの検証については、次を追加する。

- Soul Transfer及びForum Root Successionは、`StateProofEnvelope`により、必要なeKYC credential、失効状態、distinctness proof、transfer object chain、freeze state、payment state、Soul/Body/root authorityの依存閉包をネットワーク照会なしに検証できなければならない。
- ただし、Stripe上の最新chargeback不存在、eKYC事業者の現実世界における不正不存在、又は未観測fork不存在までをオフライン検証が保証する、と表現してはならない。
- `single_writer_hash_chain_v1`の限界を、譲渡registryにもそのまま適用する。提示されたpayload chainの順序性は検証できるが、世界全体の唯一性は保証しない。

### 1.2.1 決定論的な規則と流動的なゲーム

同じgenesis、同じ確定済みcheckpoint、同じ`StateProofEnvelope`を入力した検証器は、署名、証明書有効性、Q、depth、CanIssue、CanIssueTo、AssetScore、A_seed、Candidates、Reachについて同じ結果を返さなければならない。この決定論は、時刻区間、health lease、Soul epoch、authority操作列など、本書が導入する新しい入力にも同じように適用される。同じ入力からは、どの実装も同じ受理・拒否・エラーを返す。

一方で、誰が参加するか、誰が申請を承認するか、どのアセットが作られるか、需要があるか、価格をどう選ぶか、誰がforumを創設するか、誰が離脱するかはGaiaが決めない。これらは人・AI・組織の選択と外部環境によって変わる。

したがって、Gaiaの検証規則は決定論的であるが、各nodeの勝ち筋のfrontierは動的である。ある時点で有利な行動が、別の時点や別のforumで有利とは限らない。これは欠陥ではなく、単一の必勝行動を作らないための設計である。

### 1.3 depthを先に理解する

Gaiaのdepthは、署名ツリー上の距離ではない。**そのforumでどれだけ長く参加し、どれだけ正当に成熟した関係を積み上げたかを表す成熟度**である。

- 数字が小さいほど成熟度が高い
- forumの創設者rootだけは常にdepth=0
- 新規参加者は、最初の有効な入口証明書を受け取った直後にdepth=max_depthになる
- 時間を過ごすか、有資格な一般発行者との関係を増やすことで、max_depth−1、max_depth−2、…、1へ進む
- depth=max_depthの人はまだ発行できない
- depth<max_depthになった人は、自分より深い位置（まだ浅くなっていない位置）のsubjectへcommunity証明書を発行できる（第4.8節）

たとえばmax_depth=20なら、rootは0、新規参加者は20から始まる。7日後に19へ進む設定なら、その時点で初めて新規参加者へ入口証明書を発行できるようになる。ここで「7日間」と数えるのは、端末時計の表示ではなく、そのforumで時刻健全性を継続して確認できた区間の合計である。オフラインや故障で健康を確認できない期間は、成熟を早めない（第4章）。

### 1.4 譲渡の概要と非承継

Gaiaは、eKYC済みの売主・買主間で、Soulの将来管理・商業的権利・将来authority操作権、及びforumのgenesisを変更しないroot運営権限を、改竄不能な履歴、凍結、状態直列化、条件付きStripe精算、authority/root切替及びtrust epoch分離を通じて譲渡できる。ただし、人格的信頼、成熟度、発行権、公共投票影響及び過去行為の帰属を譲渡してはならない。

> eKYC更新は既存の`IdentityBindingCredential`を上書き又は消去する操作ではない。新しいcredential、失効状態、譲渡合意及び譲渡finalizationを追記する操作である。後続の状態は、先行するcredentialと譲渡履歴を検証可能な参照として保存しなければならない。

譲渡の対象と、譲渡後の扱いを次の表に要約する。詳細の検証規則は、第5章（root）、第16章（Soul-Bank）、第17章（eKYC）、第18章（決済）、第24章（原子的遷移）に定める。

| 対象 | 譲渡後の扱い |
|---|---|
| `soul_id`、過去object hash、監査履歴 | 維持し、改竄不能に保存する |
| 過去の署名・証明書発行・Civic Vote・責任 | 譲渡前controllerに永続的に帰属し、買主へ再帰属しない |
| 将来のSoul操作権 | 新eKYC済みcontrollerの新Body・新authorityへ切替可能 |
| 指定された商業契約・コンテンツ・サービス権 | agreementに明記し、相手方同意・契約更改等が必要な場合のみ承継可能 |
| `Q`、depth、`CanIssue`、`CanIssueTo` | 新trust epochで再計算し、譲渡前関係を使わない |
| 通常`AssetScore`、CultivationBonus、CitationBonus、`A_seed` | 新主体の購入可能な信用にならないよう、譲渡後の利用を隔離・非承継とする |
| CivicCitizen、Civic Vote、nullifier、過去票 | 承継しない。買主は自己のeKYCと新epochであらためて資格を満たす |
| forumのgenesis、`forum_id`、既存root署名 | 一切変更しない |
| forumの将来root運営権限 | root successionとして後継Soulへ承継可能 |

Soul Transferは同一`identity_pubkey`・同一`soul_id`を保持したまま、Soul-Bank recordに記録されるcontroller binding、active Body、authority epoch及びtrust epochを正規手続で更新することにより表す。Forum Root Successionはgenesis rootを書き換えず、指定された`root_epoch`におけるactive root authorityを後継controllerへ引き継ぐ（第2.1節、第5.1節、第16章）。

---

## 2. ノード、鍵、forum

### 2.1 参加者（Soul）、鍵、身体（Body）

Gaiaの参加者（人、AIエージェント、組織の代理）は、ひとつの**Soul**として扱う。Soulは、forumをまたぎ、端末の交換や停止をまたいで続く、Gaia仮想空間上の主体である。

Soulは、次の二種類のML-DSA-65鍵ペアを持つ。

- **`identity_pubkey`**: Soulの恒久公開鍵である。`gaia init`で生成し、Soulの存続中は変更しない。**公開鍵であり、隠す必要はない**。Soul IDの導出、Body登録、Body転生、Soul継続性、eKYC束縛及び完全オフライン検証の根として公開・配布する。対応するidentity秘密鍵は日常の通常objectへ署名せず、Body登録（DeviceIncarnationの`identity_signature`）又は高重要度のSoul操作だけに使う。
- **`authority_pubkey`**: 一つのBody、すなわち物理端末又は一意に識別される実行環境に結び付く運用公開鍵である。通常のGaia objectへの日常署名に用いる。端末交換、端末紛失、侵害、通常転生、喪失転生のたびに新しく生成できる。authority公開鍵は公開されるが、Soulの恒久IDではない。identity公開鍵を隠すための代替鍵ではない。

> Soul Transferは`identity_pubkey`の変更又は秘密鍵の単純な売買として表現してはならない。譲渡は、同一`identity_pubkey`及び同一`soul_id`を保持しながら、Soul-Bank recordに記録されるcontroller binding、active Body、authority epoch及びtrust epochを正規手続で更新することにより表す。identity秘密鍵の引渡しそのものはGaiaのプロトコル事実ではなく、Gaiaは秘密鍵の共有・複製・破棄を検証できない。したがって譲渡の正当性は、秘密鍵保有の自己申告ではなく、両当事者のeKYC、署名、Soul-Bankの直列化、旧authority失効、新Body束縛、状態commitment及び決済条件で判定する。

identity秘密鍵の安全上の取扱いとして、次を規定する。

- 譲渡後、旧controllerがidentity秘密鍵を保持していた可能性をプロトコルだけで否定できない。
- よって、通常objectの権限判定はidentity鍵ではなく、Soul-Bankにより現在activeとされるBodyのauthority鍵と有効`SoulEpochLease`に依存する。
- identity鍵が譲渡後に高重要度操作へ使える設計を残す場合、その高重要度操作は必ず現在のcontrollerのeKYC束縛、transfer finalization chain及びSoul-Bank policyによる追加承認を要求する。
- 最も安全な本仕様案として、譲渡済みSoulについてidentity秘密鍵単独では、後続Bodyをactive化する操作、譲渡取消、Payout beneficiary変更、root succession、eKYC binding更新を実行できないものとする。

Soulの恒久識別子`soul_id`は、identity公開鍵の正規化済みバイト列のハッシュである。

```text
soul_id = hash(canonical_encode(identity_pubkey))
```

`identity_pubkey`及び`authority_pubkey`は、公開鍵としてP2P object、`StateProofEnvelope`及び検証bundleで必要に応じて配布できる。秘匿すべきものは、対応する秘密鍵、Stripe等の外部サービス秘密情報、銀行口座及びKYC平文である。公開鍵そのものを秘匿対象として扱ってはならない。

Bodyとは、一つの物理deviceまたは一意に識別される実行環境に結びついた、Soulの一世代の身体である。Soulと特定のauthority keyの組み合わせは、不変の**DeviceIncarnation**というobjectとして記録する。あるSoulについて、通常のGaia権限を行使できる**active body**は常に一つだけである。ほかの身体は、転生の候補（`pending_successor`）、引退済み（`retired`）、紛失からの復旧待ち（`lost_recovery_pending`）などになる（第2.1.2節、第15章、第16章）。

署名方式はML-DSA-65のみである。この規則はGaiaのprotocol object及びそのidentity/authority署名に適用する。gaia-networkのQUIC/TLS及びDHT制御レコードが用いるtransport用暗号方式は第28章で定め、Gaia objectの署名suiteを変更しない。transport鍵をidentity鍵又はauthority鍵として使用してはならない。identity_pubkeyとauthority_pubkeyはどちらもML-DSA-65とし、Ed448その他の署名方式を、通常証明書、genesis、checkpoint、アセット承認、アクセス権、決済関連を含むGaia objectに使用してはならない。未対応方式は`UnsupportedSignatureSuite`として拒否する。発行者、申請者、アセット公開者、購入者といった呼び名は、その瞬間の動作を説明するための役割名であり、固定された身分ではない。

本書は、通信やP2P配送の文脈では、参加者またはその実行環境を「ノード」と呼ぶことがある。ノードという語は到達性や動作の文脈を表す便宜的な呼び方であり、正式な識別は`soul_id`と`incarnation_id`（またはforum内で署名に現れる`authority_pubkey`）で行う。

### 2.1.1 P2P到達性とgaia-network

Gaia node間の標準P2P輸送はgaia-networkである。gaia-networkはDeviceIdを指定した認証済みIroh QUIC接続、NAT traversal、許可済みrelay経由の接続、signed Pkarrによる既知DeviceIdの解決、signed-peerによるexact-tag候補発見、HTTP/1.1 request/responseのloopback REST転送を提供する。全設計は第28章、Gaiaとの統合は第29章に定める。

Soul identityはidentity_pubkeyとsoul_id、Body identityはDeviceIncarnation、incarnation_id及びauthority_pubkey、transport identityはIroh EndpointIdであるDeviceIdによって表す。これらは別の識別域である。DeviceIdは生32 bytesのtransport公開鍵であり、その鍵による接続認証はSoul権限を意味しない。

Gaia nodeは署名済みTimeHandshakeの両endpoint commitmentを認証済みDeviceId及び現在のtransport bindingに一致させ、DeviceIncarnation、SoulEpochLease、TemporalHealthLease、trust epochとともにgaia-coreで検証する。DHT、tag、descriptor、relay URL、IP候補、接続状態はSoul、forum、権利、決済又はfinalityの根拠ではない。

すでに受領したGaia objectのオフライン検証結果は、discovery停止、NAT traversal失敗、relay拒否、接続断、経路変更で変化しない。ただし現在の操作の受付には、その操作に必要な有効lease、session、時刻及び前状態を別途要求する。

remote application HTTPは必ず認証済みIroh QUICを用いる。native DHTは平文UDP KRPCであり、その署名は秘匿性を提供しない。端末内loopback RESTは通常HTTPでよいが、認証済みtransportヘッダを信頼するlistenerはtransport-privateでなければならない。

接続、bootstrap、relay、発見、HTTP、上限、deadline及びshutdownを実装任せにしない。第28章の実効規範に従う。Gaia objectの配送、保存、session及びCore Operation意味論はGaia上位の規範に従い、gaia-networkに委譲しない。

### 2.1.2 DeviceIncarnationとactive bodyの一意性

Soulと、そのSoulの一世代の身体（authority keyを含む）の結合を、**DeviceIncarnation**という不変objectとして記録する。DeviceIncarnationは、`soul_id`、公開`identity_pubkey`、`incarnation_id`、`authority_pubkey`、直前のincarnation参照、連番、状態、作成・活性化・引退の時刻区間、Soul identity鍵による`identity_signature`とauthority鍵による`authority_signature`の両方の署名を持つ。これは、identity公開鍵とauthority公開鍵の公開された暗号学的束縛であり、単にローカルDB又は中央サービスに対応表を置くことではない。`identity_pubkey`を欠くDeviceIncarnationはidentity署名をオフライン検証できないため`MissingIdentityPublicKey`として拒否する。完全なobject定義と検証規則は第15章に定める。

> `DeviceIncarnation`は同一controllerによるBody世代の継続を表す。Soul Transferで実在責任主体が交替する場合、新しいDeviceIncarnationを作成するだけでは十分でない。必ずSoul Transfer Finalizationと対応する`SoulTrustEpochTransition`を参照しなければならない（第16章）。

`status`は次のいずれかだけを使う。

```text
pending_successor
active
retired
lost_recovery_pending
succession_contested
quarantined
excluded
```

DeviceIncarnationのstatusは、Bodyの世代状態を表す。Soulの譲渡状態（`transfer_pending`、`transfer_frozen`等）はSoulRecord側の`transfer_lifecycle_state`が表し、DeviceIncarnationのstatusに`transfer_*`を追加してはならない。Bodyの状態とSoulの譲渡状態を混同しないためである。譲渡中の旧active Bodyは、SoulRecordが譲渡freezeを示す間、通常authorityを行使できない。この制約はDeviceIncarnationのstatusではなく、`NormalGaiaAuthority`又は同等の権限predicateに譲渡lock条件として追加する（第15章）。

`incarnation_sequence`はSoulごとに0から始まる連続整数であり、新しいincarnationは直前のincarnationを必ず一意に参照する。分岐、欠落、時刻逆行、同一sequenceの複数active化は、`DuplicateActiveIncarnation`、`IncarnationFork`、または`TemporalCycle`として拒否する。

あるSoulについて、同時にactiveであるDeviceIncarnationは、ちょうど0個または1個である。

\[
|ActiveIncarnations(S,t)|\le1
\]

通常権限のためにはちょうど1個でなければならない。active bodyが0の間、そのSoulは通常のGaia objectを発行できない。active bodyが入れ替わるのは、第15章の正常転生または第16章の喪失転生という、Soul-Bankが直列化する原子的な手続きだけである。

### 2.2 forumの独立性

forum Fの証明書は、別forum Gのdepth、必要保有期間、補填、発行資格を一切変えない。forumごとの成熟度は完全に独立している。

ただし、一人が複数forumに参加した場合のアセットアクセス総量は第7章で合算する。また、親forumを参照して新forumを作る場合はforum_chainを使う。これらは成熟度とは別のアセット層の関係である。

Soul Transferとforumの関係について、次を追加する。

- Soulが譲渡されても、各forumでの成熟度を買主が承継してはならない。
- trust epoch切替はSoul横断の人格的境界であるが、各forumの`Q`、participation_anchor、depth、bonus等への反映はforumごとのcheckpointで決定論的に再計算する（第4章）。
- forum root authorityの譲渡（Forum Root Succession）は、そのforumのgenesis・パラメータ・forum_chain・既存checkpointを変更せず、他forumの状態を変えない。

### 2.3 forum識別子

forum_idはroot公開鍵ではなく、genesis証明書の正規化済みバイト列のハッシュとする。

```text
forum_id = hash(canonical_encode(genesis_certificate))
```

同じ人が複数のforumを作れるように、genesisにはgaia-coreが生成する必須nonceを含める。nonceは創設者が指定してはならず、暗号学的乱数で自動生成する。

### 2.4 genesis証明書

forumのルールは、rootが自己署名するgenesis証明書に固定する。genesisはforumの憲法であり、作成後に書き換えられない。

- `display_name`: 表示名
- `description`: 説明
- `nonce`: gaia-core自動生成の必須乱数
- `max_depth`: 最大depth M。Mは2以上の整数
- `T_max`, `p`: 必要保有期間の定数
- `A0`, `r`, `τ`: 時間不足を補填する必要関係量の定数
- `chain_depth`: forum_chainを完全に追跡する最大世代数
- `bootstrap_root_issuance_limit`: rootが発行できる入口証明書の最大数B
- `early_access_rate`, `early_access_cap`: 第6章の先駆者アクセス権定数
- `β`, `k`, `κ1`, `δ`, `κ`, `η`, `λ`, `χ`, `k_c`, `L_c`: 第7章のアセット定数
- `seed_cap`: 創設シードの絶対上限。親ありforumでは必須、親なしforumでは0に固定
- `forum_chain`: 空または親forum参照の集合
- `state_freshness`: 第3.5節で定義するforum状態checkpointの最大許容経過時間
- `temporal_health_policy`: 第14章で定義する時刻健全性policy（必須）。許容offset、必要な観測者数と独立性、健康leaseの期間、隔離・再検証の条件、時刻証人policyへの参照を含み、各値は第14章の範囲を満たさなければならない
- `max_civic_vote_count`: 第23章で定義するCivic Voteにおいて、一人のCivicCitizenが一つのCivic epochにおいて全needへ合計で配分できる持ち票`V_F`。1以上の整数とする。CivicCitizen一人の最大二乗影響は`V_F^2`である。`V_F`はactive CivicNeedBundleの件数上限ではなく、need一件当たりの宣言上限でもない
- `max_civic_need_bundle_count`: 第23章で定義する`K(F)`。当該forumが同時に保持できるactive CivicNeedBundleEntryの最大件数。1以上の整数とし、任意の時点で`ActiveCivicNeedCount(F,t) <= K(F)`を満たさなければならない。`K(F) <= V_F`でなければならない。`K(F)`は一人当たりの持ち票又はCivic influenceを変更しない。genesisに省略した場合は`K(F) = V_F`とする
- `membership_ekyc_policy`: 第17章で定義する`ForumMembershipEkyc`を通常参加の必須条件にするか否かを固定する。`not_required`又は`verified_required`のいずれかとし、genesis作成後に変更してはならない。genesisに省略した場合は`not_required`とする。`verified_required`は、root entry、communityによる初回参加、active membershipの維持、通常authorityの行使及び`T_actual`の積算に有効な`ForumMembershipEkyc` proofを要求する。ただしこれは、forumが氏名、住所、年齢、生年月日、国籍、顔画像、電話番号、本人確認書類、銀行情報その他のeKYC生データを要求・保存・配布する権限を与えるものではない
- `forum_revenue_pool_policy`: 第7.17節で定義するForum Revenue Pool policy（必須）。全forumは有効又は無効を明示しなければならない。有効な場合、`contribution_rate_bps`、`eligible_max_depth`、`distribution_weight_rule`、`depth_weight_exponent`、`distribution_epoch`、通貨別cap、繰越規則、対象取引scope、自己取引除外、`settlement_finality_delay`を第7.17節の範囲で固定する。無効な場合、`contribution_rate_bps=0`かつ`contribution_scope`を空にする
- `checkpoint_finality_rule`: 第3.5節で定義するcheckpoint最終性規則の固定識別子。`single_writer_hash_chain_v1`に固定する

`single_writer_hash_chain_v1`が保証するのは、提示された`ForumStatePayload`列が単一writerの署名、`previous_payload_hash`、`state_sequence`、および時刻規則に従うことである。この規則だけでは、提示されていない競合payload、未観測fork、またはネットワーク全体で唯一の状態列であることを証明しない。したがって本仕様におけるcheckpoint最終性は、`StateProofEnvelope`で提示されたpayload chainについての検証可能な順序性を意味し、グローバルforkの不存在またはBFT合意を意味してはならない。
- `incentive_compatible_profile`: 第7.14節で定義する任意の運用プロファイル

genesisの数理パラメータは、次の範囲と正規表現を満たさなければならない。ここで「非負有限」とは、負でなく、NaN、無限大、未定義値を含まないことをいう。

- `max_depth=M` は2以上の整数
- `T_max` は正の整数tick
- `p` は正の有理数
- `A0` は1以上の整数
- `r` は1より大きい正の有理数
- `τ` は正の整数tick
- `chain_depth` は0以上の整数
- `bootstrap_root_issuance_limit=B` は1以上の整数
- `early_access_rate=γ_F`、`early_access_cap=L_F`、`β`、`κ1`、`δ`、`χ`、`L_c` は非負有限の正規化済み有理数
- `κ` は0以上1以下の正規化済み有理数である。`CitationBonus = min(CitationRaw, κ·AssetAccess_{direct}^{cap})`（第7.10節）の上限が、上限計算の入力である`AssetAccess_{direct}^{cap}`自体を超えないための上限である。`κ=0`はcitation活性報酬を主張しないforumだけが選べる
- `k`、`k_c` は正の有理数
- `\kappa_1` は非負有限の正規化済み有理数であるが、第7.6節の`A_max`比例係数和の上限（C4）を通じて実効的な上限を持つ。genesisはC4を満たす`\kappa_1`を宣言しなければならない
- `η`、`λ` は0より大きく1より小さい有理数
- 親ありforumの`seed_cap`は必須の非負有限な正規化済み有理数、親なしforumの`seed_cap`は0に固定
- `state_freshness` は正の整数tick
- `temporal_health_policy`は第14章で定義する型・範囲・正規化規則を満たす
- `max_civic_vote_count=V_F` は1以上の整数
- `max_civic_need_bundle_count=K(F)` は1以上の整数であり、かつ`K(F) <= V_F`を満たす
- `membership_ekyc_policy`は`not_required`又は`verified_required`のいずれかである
- クロスforum割引係数`ρ`はforum-local parameterではない。`ρ`をgenesis、forum root、Forum Root Succession、forum policy、forum checkpoint又はforum operatorが設定・更新してはならない。`ρ`は第18章の`GaiaAssetAccessPolicy`がGaia全体で一意に定める（第7.8節）
- `forum_revenue_pool_policy`は第7.17節で定義する型・範囲・正規化規則を満たす。全forumが有効又は無効を明示し、無効の場合は`contribution_rate_bps=0`かつ`contribution_scope`を空にする
- `checkpoint_finality_rule`は`single_writer_hash_chain_v1`に固定する
- `incentive_compatible_profile`を含める場合は第7.14節の型、範囲、profile validatorをすべて満たす

> `max_civic_vote_count`及び`max_civic_need_bundle_count`以外のCivic Voteパラメータをforumごとに追加してはならない。Civic Voteの二乗影響規則、unverified Soul群の正規化規則、CivicCitizenの検証規則、CivicNeedAssetの状態遷移、CivicCandidatesおよびCivicReachの規則、ballot revision、need merge、need split、FIFO退場、validator committeeおよびBFT finalityの規則は、gaia-core全体で共通に固定する（第23章）。
>
> `max_civic_vote_count`、`max_civic_need_bundle_count`及び`membership_ekyc_policy`はgenesis作成後に変更してはならない。`max_civic_vote_count`の固定により、そのforumで正規市民が表明可能な最大熱意と、未確認Soul群に対する最大影響差が事前に決定論的に固定される。

すべての有理数は既約分数の符号付き分子と正の分母で表し、符号、分子、分母を含む正規化済みバイト列を署名対象にする。浮動小数点値、NaN、無限大、言語依存の数値文字列表現をgenesis、証明書、検証結果に含めてはならない。

`state_freshness`以外の、forum状態checkpointの生成規則、Merkle構造、hashアルゴリズム、署名方式、集合の代表選択規則は、forumごとに選ぶ設定値ではなく、gaia-core全体で共通に固定する。署名方式はML-DSA-65のみとし、algorithm agilityまたはsuite交渉を導入しない。これはforum創設者の意思にすべき事項を、成熟度曲線・先駆者利益・アセット経済の係数・状態の鮮度要求・時刻健全性policy・市民投票上限（`max_civic_vote_count`）・Civic need上限（`max_civic_need_bundle_count`）・forum参加eKYC policy（`membership_ekyc_policy`）・Forum Revenue Pool policy（`forum_revenue_pool_policy`、第7.17節）という少数の値に絞るためである。第10章の告知・PressRoom機構も、genesisに新しい数理パラメータを追加しない。これらはforum状態や成熟度を変更しない付随機能だからである。時刻健全性policy（第14章）は通常権限の前提となるため必須であり、Civic Voteについてforumが定められる値は`max_civic_vote_count`及び`max_civic_need_bundle_count`の2つである（第23章）。

通常forumでは、実験的・非経済的なforumを排除しないため、報酬係数に0を許す。ただし`incentive_compatible_profile`を宣言するforumは、第1〜第5のアセット層の力学について有効な局所機会を表示できることを主張するため、β、κ1、χ、L_c、seed_capおよびprofileが利用する追加係数について第7.14節の正値条件を満たさなければならない。

> Soul Transfer及びForum Root Successionについて、forumごとに`transfer_discount`、`trust_carry_ratio`、`depth_carry_ratio`、`civic_carry_ratio`、`transfer_vote_weight`、`transfer_seed_bonus`、`transfer_fee_to_maturity`等の係数をgenesisへ追加してはならない。譲渡後の人格的信頼非承継、eKYC必須、凍結、finalization条件及びCivic非承継はgaia-core全体で固定する。

必要なら、forum単位で選べるのは、既存の客観的rate limitと同じ形式の、譲渡受付の運用上限だけに限定する。ただし新パラメータ追加は避けることを推奨する。譲渡停止は全体のOwner emergency policy又はSoul-Bank/Payment-Serviceの安全措置で扱い、forum rootが恣意的に「信用を売れるforum」を作れないようにする。

### 2.5 親なし・親ありのforum

forum作成には二つの形がある。

- **親なし**: forum_chainを空にする。どの既存forumとも系譜関係を持たない。ブートストラップ時でも無条件に作成できる
- **親あり**: 一つ以上の親forumをforum_chainに含める。創設者自身が各親forumで有効な証明書を持つことが必要

どちらの場合でも、創設者は新forumのroot(depth=0)になる。親を持つことは、親forumの傘下に入りdepthが下がることを意味しない。

### 2.6 forum_chain

forum_chainは「このforumがどのforumとの関係を背景に生まれたか」を表す多世代の系譜DAGである。親ありforumは、宣言した親すべてについて以下を検証可能にしなければならない。

- 親forumのforum_id
- 創設者が親forumで持つ有効証明書への参照
- その証明書のissuer_chainと発行資格証明
- 親forumのgenesis証明書への参照

親のgenesisにもさらに親のforum_chainが含まれるため、必要に応じて親、祖父母、曾祖父母へ遡れる。ただし無制限には辿らず、`chain_depth`世代までとする。

`forum_chain`は、forum_idの重複を許さない集合として扱う。同一の親forumを複数回登録することはできない。これは、同じ親を重ねて数え上げることで第7.9節の`A_seed`を水増しすることを防ぐためである。

親証明書の正当性は、署名・forum一致・発行資格を確認したうえで、次の鮮度条件も確認する。

\[
issued\_at(parent\_certificate)
< issued\_at(child\_genesis)
< expire(parent\_certificate)
\]

これは「子forumを作った瞬間に、創設者は親forumの有効参加者だった」ことを確認する。前側の不等式により、子forum作成後に発行された親証明書を、過去の参加根拠として使うことはできない。さらに、child genesis時点より**厳密に前**で、かつ親forumの`state_freshness`以内にある最も新しい検証可能な親forumの`ForumStateCheckpoint`について、創設者が`membership_root`に含まれることをinclusion proofで確認する。すなわち親checkpointは`checkpoint_time < issued_at(child_genesis)`を満たさなければならない。一度正当に作られた子forumは、親証明書が後に失効しても無効にならない。

child genesisに署名することも通常のGaia権限の行使である。したがって創設者は、child genesisの`issued_at`時点で、有効なSoulEpochLeaseを持ち、そのSoulの唯一のactive bodyであり、対象となるforumで時間健全性（healthy）を満たしていなければならない（第1.2節の健康・Soulゲート、第15章、第16章）。

Soul Transferと親forum実績の関係について、次を追加する。

- Soul Transfer後、譲渡前controllerの親forum実績、citation由来の人格的評価、`A_seed`計算に関わるcreatorとしての信用をsuccessor controllerが利用してはならない。
- child forumの既存genesisは不変であり、創設者Soulが後に譲渡されても、child genesis時点の創設者・親forum参加根拠・citation履歴は当時のcontrollerに帰属する。
- Forum Root Successionはchild genesisを再署名・再作成するものではない。

---

## 3. 証明書と完全オフライン検証

### 3.1 通常証明書

通常証明書は、ある発行者とある受領者の間に成立した、forum参加、一般関係、返礼、またはforum系譜上の引用という関係事実を表す不変オブジェクトである。

通常証明書は、次の`certificate_kind`に限る。

- `root_entry`
- `community`
- `reciprocal`
- `citation`

アセット登録、アセットの公開・更新・利用許可、決済受領、root発行台帳entry、forum状態checkpoint、告知・広告・限定情報配布に関するオブジェクトは通常証明書ではない。それぞれ固有の不変オブジェクトとして表し、`certificate_kind`に追加してはならない。

Soul Transfer、Forum Root Succession、決済、eKYC更新も、`certificate_kind`へ追加してはならない。これらは通常証明書ではなく、次の専用の不変objectとして追加する。

```text
SoulTransferAgreement
SoulTransferFreeze
SoulTransferPaymentReservation
SoulTransferFinalization
SoulTransferDispute
SoulTransferResolution
SoulTrustEpochTransition
ForumRootTransferAgreement
ForumRootTransferFreeze
ForumRootSuccession
ForumRootTransferDispute
ForumRootTransferResolution
TransferPaymentReleaseAuthorization
```

これらのobjectは、既存の`PaymentReceipt`、`PaymentSettlement`、`PayoutEntitlement`、`RefundSettlement`、`PayoutRecoveryAction`と役割が重複しないようにする。譲渡のeKYC・凍結・finalization・権限切替は通常証明書の代用にできず、決済objectも譲渡objectも互いを代替しない（第1.2節、第16章、第17章、第18章）。

すべての通常証明書は、次の共通フィールドを正規化して署名対象にする。

- `forum`: 対象forumのforum_id
- `issuer_pubkey`: 発行者公開鍵
- `subject_pubkey`: 受領者または関係対象ノードの公開鍵
- `certificate_kind`: `root_entry`、`community`、`reciprocal`、`citation`のいずれか
- `issued_at`: 発行時刻の整数tick
- `expire`: 有効期限の整数tick
- `info`: 任意key-value。本人確認、用途、説明など。coreは内容を解釈しない
- `signature`: 発行者（active bodyのauthority key）のML-DSA-65署名

証明書や通常objectに発行者・受領者として現れる公開鍵は、原則としてそのSoulの現役身体（active body）の**authority_pubkey**である。どのSoulのどの身体が署名したか、その身体が当該`issued_at`時点で唯一のactive bodyだったかは、証明書に束縛されるauthority操作情報と、第3.5節の検証バンドルに同梱するSoulEpochLease・TemporalHealthLeaseで検証する（第15章、第16章）。

これらのauthority公開鍵は、対応するDeviceIncarnationに含まれる公開`identity_pubkey`及び`soul_id`へオフラインで追跡可能でなければならない。authority公開鍵だけを提示し、Soulへの束縛、active Body、Soul epoch又はhealthを示さないobjectは、Soul由来の通常権限claimを満たさない。通常証明書のsubjectが、Soul同一性、Q-setのissuer Soul一意性、eKYC束縛、Civic資格、Forum Revenue Pool分配又はcommerce受取人として評価される場合、当該subject authority鍵からidentity公開鍵、Soul ID及び必要なBody / epoch proofへ至る依存閉包を`StateProofEnvelope`に含めなければならない（第3.5節）。`identity_pubkey`は公開すべきSoul恒久公開鍵であり、これを隠す機構を規定してはならない。

すべての通常証明書は次を満たさなければならない。

\[
expire>issued\_at
\]

`certificate_kind`ごとの追加必須フィールド、禁止フィールド、意味は次の通りである。

| certificate_kind | 追加必須フィールド | 発行者 | `subject_pubkey`の意味 | `issuer_depth` / `issuer_chain_ref` / `issuance_proof_ref` | Qへの寄与 |
|---|---|---|---|---|---:|
| `root_entry` | `root_issuance_index`、`previous_root_ledger_hash`、`root_ledger_entry_hash`、`membership_ekyc_proof_ref_optional`（`membership_ekyc_policy=verified_required`のforumでは必須） | 対象forumのroot | forumへ入る新規参加者 | すべて禁止。rootのgenesisとroot発行台帳で正当性を検証する | 0 |
| `community` | `issuer_depth`、`issuer_chain_ref`、`issuance_proof_ref`、`membership_ekyc_proof_ref_optional`（`membership_ekyc_policy=verified_required`のforumでは必須） | 発行可能な一般ノード | forum内の関係・参加を認定されるnode | すべて必須。`issuer_depth`は発行時点のpre-state再計算値と一致しなければならない | 異なるissuerにつき1 |
| `reciprocal` | `community_certificate_ref`、`session_id` | 対応するcommunity証明書のsubject | 対応するcommunity証明書のissuer | `issuer_depth`、`issuer_chain_ref`、`issuance_proof_ref`は禁止。発行資格を主張しない | 0 |
| `citation` | `child_forum_id`、`cited_parent_forum_id`、`child_genesis_ref`、`parent_participation_certificate_ref`、`lineage_weight` | child forumのroot | child forum創設者が親forumで参加証明書を得るまでのissuer chainに含まれ、child forumの創設を系譜上支えたノード | `issuer_depth`、`issuer_chain_ref`、`issuance_proof_ref`は禁止。child genesis、forum_chain、親forumでの参加証明書とそのissuer chainにより正当性を検証する | 0 |

すべてのkindにおいて、表に必須として示されないkind固有フィールドは**禁止**する。禁止フィールドを`null`、空文字列、0、空配列その他のダミー値で埋めてはならない。これにより、同じ意味を複数のbyte列表現で表すことを防ぐ。

`root_entry`及び`community`の`membership_ekyc_proof_ref_optional`は、この禁止規則の対象ではない条件付きフィールドである。次による。

- `membership_ekyc_policy=not_required`のforumでは省略しなければならない。`null`、空文字列、zero hashその他のダミー値で表してはならない
- `membership_ekyc_policy=verified_required`のforumでは必須であり、発行時点`issued_at`において有効な`ForumMembershipEkyc`を検証できる`ForumEkycParticipationProof`を参照しなければならない
- このフィールドを省略した証明書は、本フィールドを導入する前と同一のバイト列に符号化されなければならない。`participation_anchor`は最初の有効な`root_entry`または`community`証明書の内容ハッシュを参照するため（第4.2節）、省略時の符号化が変わると既存の`participation_anchor`が壊れる

`community`および`root_entry`には、`target_depth`、`requested_depth`、`approved_depth`、`projected_depth`、`post_state_depth`等のdepth指定フィールドを残してはならない。旧schemaの`target_depth`を`null`、0、空値、予約値として残すことも禁止する。これらが検出された証明書は`ForbiddenTargetDepthField`、旧schemaのまま受信した証明書は`LegacyTargetDepthCertificate`として拒否する（第22.2節）。depthは常に、単一の`ForumStateCheckpoint.checkpoint_time`に固定した入力（有効参加資格、`participation_anchor`、`T_actual`、Q、genesis定数）からgaia-coreが再計算する値であり、証明書の宣言値ではない。

通常証明書の受理は、kind固有規則に加えて、次の通常authorityゲートをすべて満たすことを要求する。

\[
Accept(o,F,t)\iff
VerifyCanonicalHash(o)\land VerifyMLDSA65Signature(o)\land VerifyObjectSpecificRules(o,F,t)\land VerifyAuthorityToPublicSoulBinding(o)\land VerifySoulEpochLease(o,F,t)\land VerifyTemporalHealthLease(o,F,t)\land VerifyAuthorityOperationChain(o,F,t)
\]

ここで`VerifySoulEpochLease`と`VerifyTemporalHealthLease`は、署名時刻`issued_at`を有効期間で覆うleaseが検証バンドルに含まれ、当該Soul・身体・forum・health epochについて正しいことを確認する。`VerifyAuthorityToPublicSoulBinding`は、署名鍵が当該Soulの唯一のactive bodyに属するauthority keyであることに加え、次を確認する。

```text
1. objectのauthority_pubkeyがDeviceIncarnation.authority_pubkeyと一致する
2. DeviceIncarnation.identity_pubkeyがbundleに存在する
3. DeviceIncarnation.soul_id == hash(canonical_encode(DeviceIncarnation.identity_pubkey))
4. identity_signatureがidentity_pubkeyで検証できる
5. authority_signatureがauthority_pubkeyで検証できる
6. DeviceIncarnationが対象時点で正規のBody世代列に属する
7. SoulRecord及びSoulEpochLeaseが同じsoul_id / incarnation_id / authority_pubkeyを指す
```

identity公開鍵又はidentity署名検証に必要な入力が欠ける場合、`MissingIdentityPublicKey`又は`InvalidAuthoritySoulBinding`としてfail-closedで拒否する。`VerifyAuthorityOperationChain`はauthority操作列の連続性を確認する。一つでも満たさない証明書は、署名が数学的に正しくても通常証明書として受理しない。genesis、root identity、Owner authorization、Payment-Service authorization、eKYC authorization、Soul-Bank record、recovery-only objectは、本書の各章が定める例外規則に従う。

authority公開鍵だけは、通常objectの署名検証に十分な場合があるが、Soulの恒久同一性、Soul継続性、eKYC済み、CivicCitizen、uniqueness scope、forum横断の同一主体、`PayoutEntitlement`の受取人同一性その他のidentity-derived claimを単独で証明しない。authority公開鍵のみを根拠にidentity-derived claimを受理することは、`AuthorityOnlyIdentityClaimForbidden`として拒否する。

#### root_entry

`root_entry`は、forum rootがブートストラップ上限Bの範囲内で新規nodeをforumへ入れる入口証明書である。`root_entry`はsubjectの`participation_anchor`を開始し、当該subjectがcheckpoint時点で有効な参加資格を持つための根拠となる。root_entryはsubjectのdepthを直接固定、認定、または授与しない。subjectのdepthは、各checkpoint時点で`T_actual`とQから再計算する。

`root_entry`の正当性は、rootのgenesis証明書、root署名、root発行台帳連鎖、`root_issuance_index`、およびB上限により検証する。rootは一般ノードではないため、通常の`issuer_chain_ref`および`issuance_proof_ref`を持たない。

#### community

`community`は、発行可能な一般nodeが、別のnodeとのforum内における参加または関係形成を認定する証明書である。community証明書はsubjectのdepthを直接固定、認定、授与しない。証明書が有資格なQ-set leafとして後続checkpointに採用された場合、そのissuerがsubjectのQ-setに未登録であるときに限り、subjectのQへ1だけ寄与し得る。subjectのdepthは、当該checkpointの`T_actual`とQから再計算する。

`community.issuer_depth`は、発行者自身の発行時点におけるdepthを表す監査用の冗長claimである。検証器は`issuance_proof_ref`を用い、評価時刻を当該community証明書の`issued_at`に固定してissuerのdepthを再計算し、再計算値が`issuer_depth`と一致することを要求する。一致しない証明書は無効である。

`community`がQに寄与するのは、その証明書が対象forumに属し、参照するcheckpointの`checkpoint_time`において有効であり、発行者が当該`issued_at`時点で`CanIssueTo`（第4.8節）を満たして発行しており、同一issuer SoulについてQ-setに代表leafがまだ存在しない場合だけである。

#### reciprocal

`reciprocal`は、承認された`community`証明書に対する返礼・関係記録である。

`community_certificate_ref`は、返礼の根拠となる承認済み`community`証明書のcontent hashである。`session_id`は、そのcommunity証明書の申請・承認セッションを一意に識別する値である。

`reciprocal`のissuerは対応するcommunity証明書のsubjectであり、`subject_pubkey`は対応するcommunity証明書のissuerでなければならない。

`reciprocal`は発行資格を主張しない。Q、depth、CanIssue、CanIssueTo、A_seed、CitationBonusの入力にならない。これにより、S自身の将来の成熟状態を過去のIの発行資格へ遡及適用する循環を作らない。

一方で、`reciprocal`は第7.6節の育成実績ボーナスの前提ではない。あるnode Sの独立した成熟(第7.6節)が確認された場合、Sに`community`を発行したIに対し、Iの発行という行動そのものへの報酬が生まれる。この報酬の成立条件は、`community`証明書の存在、`IndependentEligible(S,F,d_{cult};I)`、及び`Q_{-I}(S,F)>=1`の三つであり、`reciprocal`はそのいずれでもない。この報酬はSからの返礼証明書の有無に依存せず、S自身の成熟の事実によって成立する。したがって、返礼だけを相互参照して報酬や成熟度を作ることは、依然としてできない。

#### citation

`citation`は、親forumとの系譜関係を根拠として、child forumの創設を系譜上支えたノードを記録する証明書である。

`citation`のissuerはchild forumのrootである。`child_forum_id`はissuerがrootであるchild forumのforum_id、`cited_parent_forum_id`はchild forumが`forum_chain`で参照する親forumのforum_id、`child_genesis_ref`はchild forumのgenesis証明書のcontent hashである。

`parent_participation_certificate_ref`は、child forum創設者が`cited_parent_forum_id`で有効に参加していたことを示す証明書への参照である。その証明書のissuer chainを遡ったとき、創設を系譜上支えた各一般発行者に対してcitationを発行する。

`subject_pubkey`は、`parent_participation_certificate_ref`のissuer chainに含まれ、child forum創設者が親forumで参加証明書を得るまでの関係を系譜上支えたノードの公開鍵である。

`lineage_weight`は、直接の親forumに関わる支援者なら0、親の親forumに関わる支援者なら1、その次なら2という非負整数である。`lineage_weight`は、child forumのgenesisに定められた`chain_depth`未満でなければならない。

`citation`はQ、depth、CanIssue、CanIssueToの入力にならない。第7.10節のCitationBonusだけが、`citation_registry_root`に含まれる有効なcitation証明書を、`lineage_weight`に応じて集計する。

#### 通常証明書以外のオブジェクト

次のオブジェクトは通常証明書ではなく、それぞれ独立した不変オブジェクト型である。

| オブジェクト型 | 役割 |
|---|---|
| `ProtectedContent` | 通常アセット、PressRoom詳細資料、告知本文その他を、同一形式で暗号化・内容アドレス化して表すコンテンツ実体 |
| `ContentAccessGrant` | 特定nodeに対する特定`ProtectedContent`の参照または起動の権利、適用checkpoint、期限、条件、決済結果、鍵封筒参照を記録する |
| `KeyEnvelope` | 特定`ProtectedContent`の内容鍵を、特定受領者の公開鍵向けに暗号化した鍵配布オブジェクト |
| `AssetRecord` | アセットとして市場・アクセス点数の対象にする`ProtectedContent`の参照、公開者、value、必要アクセス閾値、価格、active状態、および第7.9.1節のasset version系譜を登録する |
| `AssetAccessGrant` | 第7章の市場・購入候補集合との後方互換のため、`ContentAccessGrant`のうち`content_kind=asset`を指す派生ビュー。独立した鍵・権利形式ではない |
| `PaymentReceipt` | 認可済みのPayment-Service（第18章）が署名した支払い済みの事実。決済レールは`stripe`に固定され、支払い総額`gross_amount_minor`、通貨、購入者、対象、Order参照、StripeのPaymentIntent・Charge・Balance Transactionのcommitment、手数料schedule参照、受取policy参照、PaymentServiceAuthorizationとOwner set commitmentを伴う。Stripe実費手数料・Gaia維持手数料・Forum Revenue Pool contribution・受取人別配分の確定は`PaymentSettlement`が担う（第7.17節） |
| `MaturityBond` | 第7.6節および第7.14節で定義する、特定community発行セッションに束縛され、受領者の独立成熟が確認された場合だけ発行者へ支払われる決済層の担保 |
| `MaturityBondPolicy` | 第7.6.1節で定義する、forumが発行行動へ金銭的な下限報酬を置く場合の決済層policy。issuer・recipient・forum・束縛対象・amount・currency・expire・未達時の返金又は失効規則を固定する |
| `RootLedgerEntry` | root_entryの順序、前entry hash、台帳連鎖、root署名を記録する |
| `SeedAllocation` | 第7.9節で定義する、特定creator・親forum・親checkpoint由来の創設シード予算を特定child forumへ一回だけ配分する不変オブジェクト。origin lot、配分量、child genesis、消費根拠を記録する |
| `ForumStateCheckpoint` | forumのroot発行台帳、membership、Q-set、asset registry、citation registry、seed allocation registry、告知registry、audience index、および利用する場合の時刻健全性・身体・Soul epoch・商用の各状態rootを特定時刻に固定する |
| `StateProofEnvelope` | claim、必要な通常証明書・固有オブジェクト・依存閉包・checkpoint・Merkle proofをまとめ、ネットワーク照会なしの検証を可能にする |
| `ForumStatePayload` | 第3.5節で定義する、署名者固有情報を含まないforum状態の正規化済みpayload |
| `ForumStateAttestation` | 第3.5節で定義する、ForumStatePayload hashに対する署名またはfinality proof |
| `AssetAnnouncement` | 第10章で定義する、アセットや情報の告知そのもの |
| `PromotionGrant` | 第10章で定義する、有料ブーストによる配送強化の権利 |
| `PressRoom` | 第10章で定義する、限定情報配布空間の定義 |
| `PressRoomMembershipGrant` | 第10章で定義する、PressRoomへの参加権 |
| `PressReleasePackage` | 第10章で定義する、先行・詳細情報パッケージ |
| `LocalActionRecommendation` | 第12章で定義する、nodeがローカルに生成するadvisory-onlyな行動助言。証明書・状態・権利を変更しない |
| `HeatStabilizerPolicy` | 第12章・第22章で定義する、CPU-only policy object。署名・versioned・有界な recommendation-control policy |
| `HeatObservation` | 第12章・第22章で定義する、CPU-only observation object。checkpoint-anchored な集計 heat signals |
| `HeatStateTransition` | 第12章・第22章で定義する、CPU-only audit object。forum ごとの決定論的 state-machine transition |
| `HeatInterventionDecision` | 第12章・第22章で定義する、CPU-only audit object。有界な recommendation-ranking decision と counterfactual |
| `HeatStabilizerConfiguration` | 第12章・第22章で定義する、CPU-only signed configuration object。定数・mode・rollout cohort・kill-switch state |
| `HeatStabilizerRollback` | 第12章・第22章で定義する、CPU-only signed rollback object。先行 configuration または observe-only を復元 |
| `AssetPublicationEvidence` | 第7.21節・第22章で定義する、アセット公開による正のゲーム寄与を評価する checkpoint-anchored な証拠束 |
| `AssetCitationContribution` | 第7.21節・第22章で定義する、公開アセットが他者アセット等から正当に引用・依存されたことに基づく CitationBonus の拡張（上限 `asset_citation_extension_cap_bps`） |
| `AssetMediatedCultivationContribution` | 第7.21節・第22章で定義する、公開アセットを有効利用した独立Soulが後に独立成熟を満たした場合にのみ、公開者の CultivationBonus へ一回寄与し得る証拠 |
| `PublicationDemandObservation` | 第7.21節・第22章で定義する、公開アセットへの独立需要を第三者 RCS の根拠として扱うための集約観測 |
| `PublicationContributionState` | 第7.21節・第22章で定義する、公開者Soul・フォーラム・epoch単位の重複計上防止用の正規状態 / Merkle map leaf |
| `AssetPublicationIncentivePolicy` | 第7.21節・第22章で定義する、フォーラム又は後方互換 policy object（enabled・cap・rollout等） |
| `CoreOperation` | 統一手続き節で定義する、gaia-coreが受理・検証・状態遷移・外部副作用・イベント発行を一元的に扱う protocol-level operation kind |
| `CoreOperationRequest` | 統一手続き節で定義する、全 adapter が gaia-core へ渡す canonical request |
| `CoreOperationReceipt` | 統一手続き節で定義する、gaia-core が返す canonical receipt（OperationStatus・result objects・reject 等） |
| `OperationEvent` | 統一手続き節で定義する、同一 operation の順序付き event（event_sequence・previous hash） |
| `SessionBinding` | 統一手続き節で定義する、TimeHandshake とその後のメッセージを束縛する session object |
| `VerifiedExternalCallbackEnvelope` | 統一手続き節で定義する、相互 TimeHandshake 不能な一方向 push callback を安全受理するための時刻・主体・replay 束縛 object |
| `EcologicalViabilityReport` | 第7.15節で定義する、固定simulation familyの再現可能な評価結果。consensus factではない |
| `VerifiedTimeInterval` | 第14章で定義する、検証された時刻の閉区間（lower/upper/不確実性）を表す不変object |
| `TimeHandshake` | 第14章で定義する、peer間の時刻往復測定（t1〜t4）と署名を含む不変object |
| `TimeAttestation` | 第14章で定義する、特定hashを特定時刻区間に観測したという時刻証人の限定された署名事実 |
| `TemporalHealthObservation` | 第14章で定義する、あるbodyの時刻整合に関する観測記録 |
| `TemporalHealthLease` | 第14章で定義する、健康状態・健康epoch・有効期間を固定し、通常authorityに必要なlease |
| `TimeWitnessPolicy` | 第14章・第22章で定義する、許可された時刻源と時刻証人、quorum、独立性規則、並列要求数、再試行回数、backoff、指数の飽和上限及び全体deadlineを固定するpolicy |
| `DeviceIncarnation` | 第2.1.2節・第15章で定義する、Soulと一世代の身体（authority key）の結合を記録する不変object |
| `AuthorityForkEvidence` | 第15章で定義する、同一身体が同一操作列から競合objectを発行した事実を記録する客観的health evidence |
| `SoulRecord` | 第16章で定義する、Soul-Bankが維持する、Soulの状態・active body・復旧policyを記録する追記型record |
| `SoulEpochLease` | 第16章で定義する、Soul-Bankが発行する、特定incarnationへのauthority epochの短期lease |
| `NormalSuccessionIntent` | 第16章で定義する、健康な旧bodyから新bodyへの正常転生の意図 |
| `LostBodySuccessionRequest` | 第16章で定義する、端末喪失時にSoul-Bankへ新bodyへの切替を求める例外申請 |
| `RecoveryEligibilityCredential` | 第17章で定義する、紛失・故障に備えた復旧資格を証明するeKYC credential |
| `IdentityBindingCredential` | 第17章で定義する、Soulを現実の自然人・法人等へ結び付けるeKYC credential（最小開示） |
| `EkycServiceAuthorization` | 第17章で定義する、eKYC providerとしての認可（Owner threshold） |
| `ForumEkycParticipationProof` | 第17章で定義する、forum参加境界の`ForumMembershipEkyc`を、credential・認可・失効・Soul束縛・checkpointのproof bundleだけでオフライン検証するproof |
| `ForumMembershipEkycRenewal` | 第17章で定義する、`membership_ekyc_policy=verified_required`のforumで、eKYC失効後に新しい`root_entry`又は`community`を発行せずactive membershipへ復帰する記録 |
| `RootEkycProviderAuthorization` | 第21章で定義する、root eKYC providerの認可（Owner threshold） |
| `CommercialBankOperatorCredential` | 第20章で定義する、有償・責任付きBank機能を担うoperatorの資格credential |
| `PaymentAuthoritySet` | 第18章で定義する、binaryに焼き付けられた15本のOwner公開鍵とthreshold policy |
| `PaymentServiceAuthorization` | 第18章で定義する、Owner setによるPayment-Serviceの運営鍵・署名鍵の認可。決済レールを`stripe`に固定し、Stripe Platform Account commitment、対応販売通貨・payout通貨、有効期間を定める |
| `GaiaAssetAccessPolicy` | 第18章で定義する、複数forumの既に計算済み`AssetScore`を一つのportfolio access valueへ合算する際の、Gaia全体で共通なcross-forum割引係数`ρ`だけを定めるOwner threshold認可済みpolicy。forum内の`AssetScore`、`A_max`、depth、`Q`、`A_seed`、bonus、Civic、forum genesis、root authority、`AssetRecord.value`又はaccess grantを変更しない |
| `ServiceOffer` | 第19章で定義する、共通commerce層のサービス提供（asset access、Bank、eKYC、復旧など） |
| `ServiceOrder` | 第19章で定義する、購入者がOfferに対して発注した記録 |
| `ServiceFulfillment` | 第19章で定義する、providerによるサービス履行の署名記録 |
| `GaiaBankProviderAdvertisement` | 第20章で定義する、Bank providerの能力・料金・可用性の広告（permissionless） |
| `StorageContract` | 第20章で定義する、利用者とprovider間の有償保存契約 |
| `StorageAcceptanceReceipt` | 第20章で定義する、providerが保存を受け付けた受領記録 |
| `StorageChallenge` | 第20章で定義する、保存確認のためのproviderへの挑戦 |
| `StorageAvailabilityProof` | 第20章で定義する、挑戦時点に指定chunkを返せたことを示す保存応答proof |
| `CivicBallot` | 第23章で定義する、CivicCitizenがforum・epochごとに持つ唯一の現在ballot。allocation atomの正規順序列、`revision_sequence`、`previous_ballot_ref_optional`、`ballot_nullifier`を含む |
| `NeedSubmission` | 第23章で定義する、needの投稿と`canonical_need_key`を記録する不変object |
| `NeedMergeProposal` | 第23章で定義する、関連する複数needを一件へ統合する提案。source need refs、merged summary、expireを含む |
| `NeedMergeAttestation` | 第23章で定義する、分散Civic validator committeeの各validatorが統合案を受理又は拒否した記録 |
| `NeedMergeFinalization` | 第23章で定義する、統合のfinalityとsource needの`superseded_by_merge`遷移を固定するobject |
| `NeedSplitChallenge` | 第23章で定義する、merged needの分割を求める異議 |
| `NeedSplitFinalization` | 第23章で定義する、分割のfinalityと、merge前allocation atomの`origin_need_id`への復元を固定するobject |
| `CivicEpochBlock` | 第23章で定義する、epochのprevote及びprecommitを束ねるblock |
| `CivicPrevote` | 第23章で定義する、validatorのprevote |
| `CivicPrecommit` | 第23章で定義する、validatorのprecommit |
| `CivicFinalityCertificate` | 第23章で定義する、`2f + 1`のprecommitとvalidator集合導出のinclusion proofを含むCivic finality証明 |
| `CivicVoteSeenReceipt` | 第23章で定義する、ballot又はprecommitの受領を記録するobject |
| `CivicValidatorAvailabilityCommitment` | 第23章で定義する、validator集合の導出結果と可用性のコミットメント |
| `CivicNeedAsset` | 第23章で定義する、`CivicFinalityCertificate`により確定したactiveなCivicNeedBundleEntryの`need_id`とstatusに接続されたアセット需要object |
| `EkycRevocationState` | 第17章で定義する、eKYC credentialの失効状態root、有効期間、発行者認可参照および署名を固定し、credentialの未失効をオフライン検証するobject |
| `GaiaNetworkFeeSchedule` | 第18章で定義する、Stripe実費控除後の残額に対する、通貨別・金額帯別Gaia network maintenance feeをOwner thresholdで固定する |
| `PayoutEntitlementPolicy` | 第18章で定義する、通貨別の受取請求期間、失効、reserve帰属、期限付きサービス還元をOwner thresholdで固定する |
| `BeneficiaryPayoutEligibility` | 第18章で定義する、Soulに束縛されたStripe Connected Accountの受取可能性をPayment-Serviceが期限付きで記録する |
| `PaymentSettlement` | 第18章で定義する、Stripe実費、Gaia維持手数料、受取人プールを決定論的に確定する |
| `PayoutEntitlement` | 第18章で定義する、特定Soulに束縛された、有限期限・非譲渡の法定通貨payout請求権 |
| `PayoutClaimRequest` | 第18章で定義する、受取人Soulが期限内のEntitlementに対しStripe payoutを請求するobject |
| `BeneficiaryTransferRecord` | 第18章で定義する、PlatformからConnected AccountへのStripe Transfer状態を記録する |
| `BeneficiaryPayoutReceipt` | 第18章で定義する、Connected Accountから外部口座へのStripe Payout状態を記録する |
| `GaiaServiceCreditPolicy` | 第18章で定義する、受取不能中又は失効時のGaia公式サービス還元をOwner thresholdで定める |
| `GaiaServiceCreditGrant` | 第18章で定義する、非譲渡・非換金・期限付きのGaia公式サービス利用権 |
| `PayoutEntitlementNotice` | 第18章で定義する、受取期限、受取要件、失効に関する通知試行を記録する |
| `PayoutEntitlementExpiration` | 第18章で定義する、期限満了したEntitlementのreserve帰属及びサービス還元を確定する |
| `RefundSettlement` | 第18章で定義する、Stripe返金状態を記録する |
| `PayoutRecoveryAction` | 第18章で定義する、refund又はchargebackに伴う留保、Transfer Reversal、回収不能額を記録する |
| `EmergencyPaymentSuspension` | 第18章で定義する、Owner thresholdが緊急時に新規決済、Transfer又はPayoutを一時停止するobject |
| `PayoutDeadlineExtension` | 第18章で定義する、受取人に帰責しない客観的停止時に期限を延長するOwner threshold object |
| `GaiaServiceCreditExpiration` | 第18章で定義する、期限切れService Creditの未使用分を消滅させるobject |
| `ForumPoolContributionRecord` | 第7.17節で定義する、対象有償取引から発生したForum Revenue Pool contributionの発生・保留・確定・排除を記録する |
| `ForumRevenuePoolDistribution` | 第7.17節で定義する、forum・通貨・epochごとのdepth分配とallocation commitmentを確定する |
| `ForumPoolUndistributedForfeiture` | 第7.17節で定義する、繰越期限を満了した未分配Forum Revenue Pool lotをGaia network maintenance feeへ帰属させる確定記録 |
| `SoulTransferAgreement` | 第16章で定義する、eKYC済み売主・買主が、対象Soul、譲渡scope、trust epoch交替、価格、決済参照、評価checkpoint、凍結・異議期限、前譲渡参照を固定して双方署名する不変合意 |
| `SoulTransferFreeze` | 第16章で定義する、対象Soulを譲渡専用の凍結状態へ置き、評価checkpoint、凍結理由、許可された限定操作、payment reservation参照を固定する不変object |
| `SoulTransferPaymentReservation` | 第16.7.3節で定義する、Payment-ServiceがStripe上で譲渡対価を予約又は保留した外部事実を、対象agreementと決済objectへ束縛する署名済みobject |
| `SoulTransferFinalization` | 第16章で定義する、eKYC、distinctness、凍結、旧authority失効、新Body束縛、新SoulEpochLease、trust epoch切替、履歴commitment、決済予約及び紛争なしを確認してSoul controller交替を確定するobject |
| `SoulTransferDispute` | 第16章で定義する、finalization前又は定められた異議期間内に、譲渡を争う客観的根拠、提出者、対象agreement、時刻及び凍結継続を記録するobject |
| `SoulTransferResolution` | 第16章で定義する、認可された紛争解決手続により、譲渡を取消、継続又は条件付きで確定する結果を記録するobject |
| `SoulTrustEpochTransition` | 第16章で定義する、Soul Transferに伴うtrust epochの単調増加、過去epochとの境界、非承継policy及びeffective時点を固定するobject |
| `ForumRootTransferAgreement` | 第5章で定義する、eKYC済みの現root controllerと後継root controllerが、forum_id、root succession scope、価格、評価checkpoint、凍結・異議期限を双方署名で固定するobject |
| `ForumRootTransferFreeze` | 第5章で定義する、対象forumのroot authorityを書込み凍結し、root entry、checkpoint等の競合操作を停止するobject |
| `ForumRootSuccession` | 第5章で定義する、genesisとforum_idを不変のまま、root epoch、前任root、後任root、authority切替、決済条件、履歴連鎖を確定するobject |
| `ForumRootTransferDispute` | 第5章で定義する、forum root authority譲渡に関する異議を記録するobject |
| `ForumRootTransferResolution` | 第5章で定義する、forum root authority譲渡を取消、継続又は確定する解決object |
| `TransferPaymentReleaseAuthorization` | 第18章で定義する、protocol finality、異議状態、Stripe reserve/settlement policyを条件として、売主へのTransfer又はPayout entitlementの利用可能化を認可するPayment-Service object |
| `TransferDistinctnessCredential` | 第17章で定義する、eKYC providerが最小開示で発行する、譲渡両当事者が別人格（distinct legal subject）であることの署名済みassertion |
| `AssetCommercialRightsPolicy` | 第7章・第22章で定義する、origin assetの再販・再許諾・派生の商用権限と、参照するlineage royalty policyを不変に固定するobject |
| `AssetLineageRoyaltyPolicy` | 第7章・第22章で定義する、origin assetが焼き付ける、祖先プール率`ancestor_pool_rate_bps`・減衰比`decay_ratio_bps`・最大深度`max_lineage_depth`・丸め・集約方式を固定する不変object |
| `AssetRightsGrant` | 第7章・第22章で定義する、親assetの権利者から子Soulへ、resale / sublicense / derivativeの商用権限を許諾する署名済みgrant |
| `AssetLineageNode` | 第7章・第22章で定義する、origin assetまでの単一親の権利系譜node（`ancestor_commitment`、`generation_from_origin`、policy参照を含む） |
| `LineageRoyaltySettlement` | 第18章・第22章で定義する、一回のALR saleの祖先プール配分を確定するobject（generation別配分と保存則） |
| `PayoutAggregation` | 第18章・第22章で定義する、payout epochごとに同一Soul・同一通貨のclaimable entitlementを集約する送金事務object |
| `AssetDiscoveryRecord` | 第10章・第22章で定義する、全active assetの公開発見用metadata（存在・所在forum・価格・条件・取得経路）を固定する署名済みrecord |
| `PublicAccessConditionPolicy` | 第10章・第22章で定義する、assetへのアクセス条件を公開・検証可能に固定するpolicy |
| `AccessEligibilityQuote` | 第10章で定義する、client / discovery nodeが生成するadvisoryな適格性見積り（proof refs必須、コンセンサスobjectではない） |
| `ForumDiscoveryRecord` | 第10章・第22章で定義する、forumを検索可能にする公開record |
| `DiscoveryIndexManifest` | 第10章・第20章・第22章で定義する、public discovery indexの署名済みmanifest |
| `DiscoveryServiceObservation` | 第7章・第22章で定義する、discovery providerの応答・freshness・proof retrievalを記録する観測object |
| `StorageReservationGrant` | 第20章・第22章で定義する、保存ノードがobject単位に発行する予約grant |
| `StorageReceiptV2` | 第20章・第22章で定義する、durable write完了後に署名される保存証拠（本文の`StorageReceipt`は本objectを指す） |
| `StorageAuditChallenge` / `StorageAuditResult` | 第20章・第22章で定義する、保存確認のchallenge / response |
| `CiphertextChunk` | 第10章・第22章で定義する、暗号文＋認証tagのcontent-addressed chunk |
| `EncryptedFileManifestV1` | 第10章・第22章で定義する、暗号文chunk順序・長さ・hash・Merkle root・policy参照を固定する署名済みmanifest |
| `KeyEnvelopeV2` | 第10章・第22章で定義する、DEKをrecipient暗号公開鍵で包む強化版鍵封筒 |
| `ComputeCapabilityAdvertisement` / `ComputeJob` / `ComputeResult` / `ComputeVerification` | 第7章・第22章で定義する、将来の検証可能computeのreserved schema（本仕様はweightゼロ） |
| `ResourceContributionPolicy` | 第7.19.4節・第22章で定義する、epoch単位のインフラ補正の係数`α^I_F`・`β^I_F`・`γ^I_F`と上限`I_max,F`を固定するforum policy。`I_max,F`はprotocol hard cap `I_protocol_max`を超えてはならない |
| `ExecutableMarketingPlan` | 第12章・第22章で定義する、特定requesterが評価checkpoint時点で実行可能なprotocol actionと、action draft・proof・費用・期限・外部承認依存を束縛する短命のproof-bound plan |
| `MarketingActionStep` | 第12章・第22章で定義する、plan内の実行可能step（action kind・execution class・required actor・proof/consent/payment/precondition・expected deltas） |
| `AdvertisementDeliveryPolicy` | 第10章・第22章で定義する、recipientごとの広告受信設定（opt-in・scope・category・rate limit・recipient discoverability） |
| `AdvertisementDelivery` | 第10章・第22章で定義する、recipient policy・rate limit・delivery routeを満たす場合のみ受理される個別広告配信object |
| `MarketingActionBundle` | 第19章・第22章で定義する、依存するactionを束ねるbundle（atomicity_mode: all_or_nothing / staged） |

通常証明書は単体で配布・保持されるオブジェクトではない。受領者がネットワーク照会なしに検証できるためには、第3.5節で定義する`StateProofEnvelope`として、必要な依存閉包・状態checkpoint・Merkle proofと共に配布されなければならない。

Soul Transfer、Forum Root Succession、譲渡決済・異議・解決の新objectも、通常証明書と同様に次の共通規則を満たす。

- canonical encoding、content-addressed hash、domain separation、ML-DSA-65署名を使う。
- 時刻はUTC Unix timeの整数tick又は`VerifiedTimeInterval`を使う。浮動小数点を使わない。
- 必要な参照先はhashで指し、`StateProofEnvelope`内で依存閉包を提供する。
- 同一`transfer_id`、同一Soulの`transfer_sequence`、同一forumの`root_sequence`の競合はfail-closedで拒否する。
- 取消・失効・異議・解決は過去objectを消さず、後続objectにより状態を進める。
- 署名者、eKYC credential、authority key、Soul ID、forum ID、checkpointが同じ評価時点に整列していなければならない。

HeatStabilizerPolicy, HeatObservation, HeatStateTransition, HeatInterventionDecision, HeatStabilizerConfiguration, and HeatStabilizerRollback are CPU-only advisory/control-plane objects. They do not create, revoke, amend, or settle any protocol right, membership, certificate, asset access, payment, payout, authority, Soul state, forum-root state, or advertisement delivery. A missing, malformed, stale, or unverifiable heat object MUST NOT invalidate an otherwise valid protocol object or transaction.

### 3.2 証明書の種類の一覧

| 種類 | 発行者 | 目的 | Qへの寄与 |
|---|---|---|---:|
| `root_entry` | forum root | 最初のB人をforumへ入れる入口 | 0 |
| `community` | 発行可能な一般ノード | 参加・関係形成 | 1。ただし有資格なら1回だけ |
| `reciprocal` | 申請承認を受けた申請者 | 発行者への返礼・関係記録（育成実績ボーナスの前提ではない） | 0 |
| `citation` | 新forum root | 親forum系譜への引用 | Qには寄与しない |

この区別は証明書に人間的な優劣を付けるためではない。rootがブートストラップ用の特別権を無期限に使ってネットワークを支配しないための、機械的な役割分離である。

### 3.3 issuer_chainと発行資格

issuer_chainは、証明書が正当に発行された由来をforum rootまで辿る一本道の署名来歴である。depthはissuer_chainから直接決まらないが、署名の正当性と発行資格の検証には不可欠である。

通常証明書には`issuance_proof_ref`を必ず付ける。これは発行者が発行時点でdepth<max_depthに到達していたことを、証明書と時刻比較だけで再検証できるバンドルである。

rootの`root_entry`だけは、root自身のgenesis証明書とroot発行台帳証明により発行資格を確認する。一般ノードの`community`証明書は、そのノードの参加アンカー、Q、必要保有期間、それらの発行資格証明を再帰的に確認する。

発行資格の評価時刻は常に検証対象証明書の`issued_at`である。`issuance_proof_ref`とその再帰参照は、評価対象より厳密に小さい`issued_at`を持つ証明書だけで構成しなければならない。未来に発行された証明書、同一tickに相互参照する証明書、評価対象自身は発行資格の根拠に使えない。

したがって、発行資格依存グラフの各辺は過去の証明書だけを向き、有限の検証バンドル内で有向非巡回グラフとなる。参照に循環、時刻逆行、同一tick参照があれば`TemporalCycle`として失敗する。

issuer_chainの各発行者も、それぞれの発行時点で通常authorityゲート（そのSoulの唯一のactive bodyであること、有効なSoulEpochLeaseを持つこと、発行対象forumで時間健全性（healthy）を満たすこと）を満たしていなければならない。これは、健康を確認できなかった時期や、すでに失効した身体（incarnation）によって発行された証明書を、現在の関係や発行資格の根拠として再利用できないようにするためである（第1.2節、第15章）。

### 3.4 コンテンツアドレスとバンドル

証明書実体やgenesisは不変データなので、内容ハッシュを住所として使う。

\[
ObjectHash(X)=hash(canonical\_encode(X))
\]

同じ祖先証明書を何度参照しても、実体は一度だけ保存すればよい。検証時には、必要実体をまとめた検証バンドルを同梱する。

検証者は参照先をバンドルから取り出し、必ずハッシュを再計算する。

1. 参照先が存在しなければ`MissingObject`として失敗する
2. ハッシュが違えば`HashMismatch`として失敗する
3. 循環、時刻逆行、同一tick参照があれば`TemporalCycle`として失敗する
4. 一致した実体だけを使い、署名、時刻、forum、発行資格を検証する
5. 一つでも失敗すれば証明書全体を無効とする

「見つからないが、たぶん正しい」はGaiaには存在しない。

同一hashのオブジェクトは、一つのバンドル内、および各ノードのContentStore内で一度だけ保存する。ContentStoreはhashごとに冪等であり、既に保持するオブジェクトを再度受け取っても状態は変化しない。

### 3.5 forum状態checkpointとStateProofEnvelope

第4章と第7章の判定には、個別証明書だけでは完結しない値がある。たとえば「有資格な一般発行者が異なる何人いるか」「root発行台帳の総数がB以下か」「どのアセットが現在activeか」「forumの参加者集合は誰か」は、ある一時点における**forum全体の状態**に関する主張であり、個々の証明書を積み上げるだけでは、受領した証明書以外に何が存在し、何が存在しないかを確定できない。

このため、forum状態は`ForumStateCheckpoint`という、ある一時点の状態集合を固定する不変オブジェクトとして表す。

- `forum_id`: 対象forumのforum_id
- `checkpoint_time`: この状態が確定した整数tick
- `previous_payload_hash`: 直前の確定済み`ForumStatePayload`への参照
- `state_sequence`: 単調増加する整数連番
- `root_ledger_root`: 第5.3節の root発行台帳を表すMerkle root
- `membership_root`: checkpoint_time時点で現在参加中のnode集合を表すMerkle root
- `qset_root`: 第4.5節のQ-set全体を表すMerkle root
- `asset_registry_root`: checkpoint_time時点でactiveなアセット集合を表すMerkle root
- `citation_registry_root`: checkpoint_time時点のcitation証明書集合を表すMerkle root
- `seed_allocation_registry_root`: 第7.9節で定義する、親forumが自らをoriginとする`SeedAllocation`の消費状態を表すMerkle mapのroot
- `seed_credit_ledger_root`: 第7.9節で定義する、creator・asset lineageごとのcredit済み高水位を表すMerkle mapのroot
- `audience_index_root`: 第7.13節で定義する、forum参加者のAssetScoreをソートしたMerkle order-statistics木のroot
- `candidate_index_registry_root`: 第7.13節で定義する、asset record hashから当該assetのCandidateIndex rootへのMerkle mapのroot
- `announcement_registry_root`: 第10章で定義する、有効な告知の集合を表すMerkle root
- `pressroom_registry_root`: 第10章で定義する、PressRoomとその会員権の集合を表すMerkle root
- `temporal_health_root`: 第14章で定義する、forum内のSoul・身体・health epoch・状態・lease headを表すMerkle mapのroot
- `device_incarnation_registry_root`: 第15章で定義する、forumが認めるactive・pending・retiredの身体参照を表すMerkle mapのroot
- `soul_epoch_registry_root_or_refs`: 第16章で定義する、Soul epochの状態rootまたは参照
- `bank_provider_registry_root_optional`: 第20章で定義する、Bank provider registry（当該forumがGaia Bank機構を利用する場合）
- `storage_contract_registry_root_optional`: 第20章で定義する、storage contract registry（利用する場合）
- `commerce_offer_registry_root_optional`: 第19章で定義する、commerce offer registry（利用する場合）
- `civic_epoch_registry_root`: 第23章で定義する、当該forumのCivicEpochとそのsnapshot、opens_at、closes_at、tally finality参照を表すMerkle mapのroot
- `civic_ballot_registry_root`: 第23章で定義する、当該forumのCivicBallot（allocated_votes、revision_sequence、previous_ballot_ref）を表すMerkle mapのroot
- `civic_ballot_nullifier_registry_root`: 第23章で定義する、当該forumのballot nullifierと、各nullifierについて採用された最終revisionの状態を表すMerkle mapのroot
- `civic_need_bundle_root`: 第23章で定義する、activeなCivicNeedBundleのentry集合とその順序を表すMerkle root
- `civic_need_archive_root`: 第23章で定義する、`superseded_by_merge`、`retired_by_fifo`、`fulfilled`その他inactiveなneedのcontent-addressed archiveを表すMerkle root
- `civic_need_merge_registry_root`: 第23章で定義する、NeedMergeProposal、NeedMergeAttestationおよびNeedMergeFinalizationの状態を表すMerkle mapのroot
- `civic_need_split_registry_root`: 第23章で定義する、NeedSplitChallengeおよびNeedSplitFinalizationの状態を表すMerkle mapのroot
- `civic_finality_registry_root`: 第23章で定義する、CivicEpochBlock、CivicPrevote、CivicPrecommit、CivicVoteSeenReceiptおよびCivicFinalityCertificateの状態を表すMerkle mapのroot
- `civic_validator_set_registry_root`: 第23章で定義する、epochごとのCivic validator集合の導出結果を表すMerkle mapのroot
- `forum_revenue_pool_registry_root`: 第7.17節で定義する、当該forumのForum Revenue Pool contribution lot、繰越lot、reversal、cap消費、未分配expiry状態を表すMerkle mapのroot
- `forum_revenue_pool_distribution_registry_root`: 第7.17節で定義する、当該forumのepochごとのForumRevenuePoolDistributionとallocation commitmentを表すMerkle mapのroot
- `ekyc_revocation_registry_root_or_refs`: 第17章で定義する、CivicCitizen claimに必要なeKYC issuerごとのEkycRevocationState rootまたはその参照集合
- `soul_transfer_registry_root`: 当該forumに関係するSoul Transferの状態（Soulごとのtransfer sequence、agreement、freeze、finalization、trust epoch transition、取消・異議状態）を表すMerkle mapのroot。Soulはforum横断主体であるため、必要に応じてSoul-Bank全体state root又は参照集合と整合していなければならない
- `forum_root_succession_registry_root`: 当該forumのroot authority succession chain、root epoch、前後root Soul、freeze、agreement、finalizationを表すMerkle map又は追記列root
- `transfer_dispute_registry_root`: Soul又はforum root transferに関する未解決・解決済みの異議状態を表すMerkle mapのroot
- `transfer_payment_registry_root_optional`: 当該forumが関係する譲渡代金のPaymentReservation、PaymentSettlement、release authorization、reversal状態を表すMerkle mapのroot。Payment-Serviceの共通commerce stateへの参照だけで十分な設計なら、重複rootを導入しない
- `asset_discovery_registry_root`: 第10章で定義する、当該forumのactive assetのPublic Discovery Metadataを表すMerkle mapのroot（optional。公開asset discoveryを有効化するforumでは必須）
- `forum_discovery_registry_root`: 第10章で定義する、forum自身の公開発見用recordを表すMerkle mapのroot（optional）
- `public_access_policy_registry_root`: 第10章で定義する、`PublicAccessConditionPolicy`の集合を表すMerkle mapのroot（optional）
- `storage_contribution_registry_root`: 第20章で定義する、有効なStorageReceipt・audit・reservation状態に基づく保存寄与の状態を表すMerkle mapのroot（optional）
- `discovery_index_registry_root`: 第10章で定義する、`DiscoveryIndexManifest`とindex segment参照の状態を表すMerkle mapのroot（optional）
- `resource_contribution_registry_root`: 第7.19節のResource Contribution Scoreの評価に使うinput commitmentと派生score状態を表すMerkle mapのroot（optional）
- `heat_stabilizer_observation_registry_root`: optional Hash。forum の checkpoint-anchored・aggregate・non-identity な heat observation を表す Merkle map root。省略は、その checkpoint に committed observation registry が無いことを意味する（第12.10節）
- `heat_stabilizer_decision_registry_root`: optional Hash。当該 forum・checkpoint に適用される署名済み `HeatStateTransition` と `HeatInterventionDecision` audit record を表す Merkle map root。省略は committed decision registry が無いことを意味する（第12.10節）
- `checkpoint_finality_rule`: genesisで固定された最終性規則識別子

`soul_transfer_registry_root`、`forum_root_succession_registry_root`、`transfer_dispute_registry_root`、`transfer_payment_registry_root_optional`に対しても、既存のcheckpoint state rootと同様に、inclusion / non-inclusion proofを定義する。譲渡状態を主張する`StateProofEnvelope`は、これらのrootに対するproofを含まなければならない。本仕様の`asset_discovery_registry_root`、`forum_discovery_registry_root`、`public_access_policy_registry_root`、`storage_contribution_registry_root`、`discovery_index_registry_root`、`resource_contribution_registry_root`についても同様にinclusion / non-inclusion proofを定義する。検索providerは各rootに対するinclusion proofを返せなければならない。raw storage inventory、private object location、DEK、private recipient listをcheckpoint rootに公開してはならない。

The optional Heat Stabilizer roots are audit commitments only. They are not inputs to CanIssue, CanIssueTo, Qdepth, AssetScore, Aseed, CitationBonus, CultivationBonus, Candidates, Reach, CanAccess, ValidPaymentReceipt, PaymentSettlement, payout eligibility, Soul Transfer, or Forum Root Succession. Their absence MUST be interpreted as unavailable observation/audit state and MUST NOT be interpreted as a negative membership, asset, payment, or authority fact.

証明書、発行資格、depth、Q、アセットアクセスなど、forum状態に依存する値の検証は、単一の`ForumStateCheckpoint`が指す時刻を評価時刻として固定して行う。

\[
t_{state}=checkpoint\_time
\]

これらの値は、より新しいcheckpoint_timeを主張したい場合、そのための新しい`ForumStateCheckpoint`を提示しなければならない。一つのcheckpointに基づく状態値を、別の時刻の状態値と混在させてはならない。

Civic VoteおよびCivicNeedAssetに関する評価時刻も、他のforum状態依存値と同じく、単一の`ForumStateCheckpoint.checkpoint_time`に固定する。投票時のCivicCitizen資格、ballot nullifierの未使用性、CivicEpochのsnapshot、CivicNeedBundleの順序、needの状態、`open_for_supply`状態、CivicCandidatesおよびCivicReachは、異なるcheckpoint時刻の状態を混在させてはならない（第23章）。

checkpointにCivic state rootを記録してよいが、forum rootの単独署名又は`single_writer_hash_chain_v1`は、Civic ballot、Civic tally、Civic need merge、Civic need split又はCivic finalityの唯一の正当性根拠になってはならない。Civic stateの正当性は、対応する`CivicFinalityCertificate`、validator集合導出proof、quorum署名集合および再計算可能なballot/tally bundleにより検証する（第23章）。したがって、checkpointがコミットするCivic state rootと、有効な`CivicFinalityCertificate`が確定するCivic stateが矛盾するclaimは、checkpointの署名が数学的に正しくても受理しない。

証明書個別の期限判定はこれとは別である。証明書は`issued_at < t < expire`という条件を、任意の評価対象時刻`t`について判定できる。ただし、その証明書がforum状態(Q、membership、asset registryなど)の構成要素として数えられるかどうかは、当該checkpointの`checkpoint_time`における有効性で判定する。

受領者がforum状態に依存する主張を検証するために必要な配布単位を`StateProofEnvelope`とする。

- `claim`: 検証したい主張(証明書の発行資格、depth到達、アセット利用可否、購入候補判定、告知の正当性など)
- `t_state`: 参照する`ForumStateCheckpoint`の`checkpoint_time`
- `checkpoint`: 該当する`ForumStateCheckpoint`の実体
- `dependency_objects`: claimの検証に必要な証明書、genesis、issuance proof等の実体
- `merkle_proofs`: `dependency_objects`が`checkpoint`の各`*_root`に含まれることを示すinclusion proof、または含まれないことを示すnon-inclusion proof、あるいは第7.13節のカーディナリティ範囲proof
- `envelope_manifest`: 上記すべてのcanonical hash一覧
- `checkpoint_attestations`: 対象payloadが`checkpoint_finality_rule`を満たすことを示すattestationまたはfinality proof
- `trust_anchor_mode`: `self_contained`または`known_anchor`

`StateProofEnvelope`は、受領者のContentStoreが空であっても、それだけでclaimを検証できるよう、必要な依存閉包を欠落なく含まなければならない。参照が不足する場合は`MissingObject`として拒否する。

`self_contained`を主張するenvelopeは、対象forumのgenesis、対象payloadからgenesisへ至るすべての必要なpayload祖先、各payloadに必要なattestation、依存閉包、Merkle proofを含まなければならない。`known_anchor`は既知anchorへの依存を許すが、空のContentStoreだけで検証できるとは主張してはならない。

Soul・健康・身体が関係するclaimの`StateProofEnvelope`は、その依存閉包に次を含めなければならない。

- active DeviceIncarnation
- active DeviceIncarnationの公開`identity_pubkey`
- active DeviceIncarnationの`authority_pubkey`
- DeviceIncarnationの`identity_signature`と`authority_signature`
- 必要なprevious DeviceIncarnation列又は連続性proof
- `SoulRecord`
- `SoulEpochLease`
- `TemporalHealthLease`
- active incarnationのinclusion proof
- 必要なhealth epoch / non-revocation proof
- `AuthorityOperationHeader`のchain proof
- 必要ならeKYC tier assertion、`PaymentServiceAuthorization`と`PaymentReceipt`、operator credentialとeKYC authorization

CivicCitizenに依存するclaimの`StateProofEnvelope`は、少なくとも次を含まなければならない。

- 公開`identity_pubkey`
- `soul_id = hash(canonical_encode(identity_pubkey))`の再計算入力
- 対象`IdentityBindingCredential`
- credentialの`subject_soul_id`と`soul_id`の一致proof
- credentialの`subject_identity_pubkey_commitment`と`identity_pubkey`の一致proof
- 対応する`EkycServiceAuthorization`
- 必要なOwner/root eKYC provider authorization chain
- credentialの有効期限を評価できる時刻proof
- `EkycRevocationState`
- 対象credentialに対する失効registryのinclusionまたはnon-inclusion proof
- 必要な一意性scope proof

さらに、`StateProofEnvelope`がCivic Vote、CivicNeedAsset、CivicCandidatesまたはCivicReachをclaimする場合は、対象forumの`civic_epoch_registry_root`、`civic_ballot_registry_root`、`civic_ballot_nullifier_registry_root`、`civic_need_bundle_root`、`civic_finality_registry_root`および`civic_validator_set_registry_root`に対するinclusion又はnon-inclusion proof、asset registry proof、membership proof、grantのnon-membership/inclusion proof、および対応する`CivicFinalityCertificate`とvalidator集合導出proofを含めなければならない。これらが欠ける場合も、`MissingObject`、`CivicFinalityCertificateInvalid`又は該当するCivic/eKYCエラーとしてfail-closedで拒否する（第23章）。

`membership_ekyc_policy=verified_required`のforumにおけるmembership、depth、`AssetScore`、`Candidates`、`Reach`、Civic等のclaimを検証する`StateProofEnvelope`は、少なくとも次を含まなければならない。

- forum genesisと`membership_ekyc_policy`
- participation certificate
- `ForumEkycParticipationProof`又は`ForumMembershipEkycRenewal`
- `IdentityBindingCredential`
- `EkycServiceAuthorization`
- `EkycRevocationState`
- credential non-revocation proof
- Soul identity binding proof
- active `DeviceIncarnation` proof
- `SoulEpochLease`
- `TemporalHealthLease`
- membership state proof
- checkpoint alignment proof

検証器は、対象claimの評価時刻`t_state`において`ForumMembershipEkyc(S,F,t_state)`（第17.8節）が有効であることを確認できない場合、`verified_required` forumのactive membership claimをfail-closedで拒否する。`membership_ekyc_policy=not_required`のforumでは、本節の依存閉包を`root_entry`又は`community`のprotocol必須条件にしてはならない。

`StateProofEnvelope`がcross-forum `AssetAccess_direct`をclaim又は利用する場合は、評価時点`t*`において有効な`GaiaAssetAccessPolicy`を一意に選び、その`cross_forum_discount_ratio`を用いて`AssetAccess_direct`を再計算できなければならない。少なくとも次を含める。

```text
CrossForumAssetAccessProof
  evaluation_time
  gaia_asset_access_policy_ref
  gaia_asset_access_policy_object
  owner_threshold_signature_proof
  forum_checkpoint_refs_sorted
  forum_state_proofs_sorted
  computed_asset_access
```

policy object、Owner threshold proof又はpolicy version chainが不足・不正・期限外・曖昧である場合、cross-forum `AssetAccess_direct` claimはfail-closedで拒否する（第7.8節、第18章）。

Soul Transfer claimを検証する`StateProofEnvelope`は、少なくとも次を含まなければならない。

- 対象Soulの公開`identity_pubkey`、`soul_id`再計算入力
- 売主及び買主の公開identity鍵又は譲渡用identity commitment
- 売主及び買主の`IdentityBindingCredential`
- 両credentialの`EkycServiceAuthorization`及び必要なRoot eKYC provider authorization chain
- 両credentialの`EkycRevocationState`と未失効proof
- 売主・買主のdistinct legal subject / beneficial-owner scope proof
- 現在active `DeviceIncarnation`、`SoulRecord`、`SoulEpochLease`、`TemporalHealthLease`
- `SoulTransferAgreement`
- `SoulTransferFreeze`
- `SoulTransferPaymentReservation`
- `SoulTrustEpochTransition`
- `SoulTransferFinalization`又は対象時点の非finalized状態proof
- 旧authority失効proof及び新authority/new DeviceIncarnationの束縛proof
- transfer registry inclusion/non-inclusion proof
- dispute registryにおける未解決異議なしのproof、又はresolution object
- finalization checkpoint及びcheckpoint attestation chain

Forum Root Succession claimを検証する`StateProofEnvelope`は、少なくとも次を含まなければならない。

- forum genesis、forum_id再計算入力
- 現在root authority chain、前任rootと後継rootのSoul/Body/eKYC依存閉包
- `ForumRootTransferAgreement`
- `ForumRootTransferFreeze`
- `ForumRootSuccession`
- payment reservation/settlement/releaseの必要参照
- root succession registry proof
- dispute registry proof
- 直前checkpoint、finalization checkpoint、payload/attestation chain

Transfer Payment Release claimを検証する`StateProofEnvelope`は、対象`TransferPaymentReleaseAuthorization`、対応するagreement/finalization参照、Stripe決済commitment、Owner set commitment、fee schedule参照、およびrelease条件の充足proofを含まなければならない。不足は`MissingObject`、`MissingTransferEkycProof`、`MissingTransferDistinctnessProof`、`MissingTransferFreezeProof`、`MissingTransferPaymentReservation`等としてfail-closedにする。

どれかが欠けている場合、またはobjectの署名時刻をleaseが覆わない場合は、該当する`MissingObject`、`MissingTemporalHealthProof`、`InvalidSoulEpochLease`、`ExpiredTemporalHealthLease`等のエラーとして拒否する。CivicCitizenに関するclaimで必要なeKYC・失効・投票・nullifier・tally依存閉包が欠ける場合は、`MissingIdentityBindingCredential`、`MissingEkycNonRevocationProof`等のCivic/eKYCエラーとしてfail-closedで拒否する（第22章のclaim種別とエラー集合を参照）。

`StateProofEnvelope`を受け取ったノードは、次の順で検証する。

1. `checkpoint`のpayload hash、`checkpoint_finality_rule`、および必要な`checkpoint_attestations`を検証する
2. `trust_anchor_mode=self_contained`なら、同梱されたgenesisとpayload祖先連鎖がgenesisまで遡ることを確認する。`trust_anchor_mode=known_anchor`なら、明示された既知genesisまたは既知payload hashまで遡ることを確認する。必要な祖先またはanchorがなければ`MissingObject`とする
3. `dependency_objects`の各実体のhashを再計算し、参照と一致することを確認する
4. 各`dependency_objects`が、対応する`checkpoint`の`*_root`に対して`merkle_proofs`により正しく包含または非包含であることを検証する
5. `t_state`を評価時刻として、claimに必要な数理条件(depth、Q、CanIssue、CanIssueTo、AssetScore、Candidates、AssetAnnouncementやPressRoomの有効性など)を計算する
6. 受領者の現在時刻`t_receive`に対して、次の鮮度条件を確認する

\[
0\le t_{receive}-t_{state}\le state\_freshness
\]

この範囲を超える場合は`StaleCheckpoint`として拒否する。`state_freshness`はforumのgenesisで固定した値であり、古いが内部整合したcheckpointをどこまで新しい判定の根拠として許容するかを定める。より新しい状態を主張したい場合は、より新しい`checkpoint_time`を持つ`StateProofEnvelope`を別途提示しなければならない。

`state_freshness`は状態を計算する評価時刻を変更するものではない。すべての状態依存値は常に`checkpoint_time`だけで評価し、`state_freshness`は受領時点でそのcheckpointを判定材料として受け入れるかどうかにのみ関わる。

---

## 4. 成熟度depthと発行資格

### 4.1 時刻

全時刻はUTC Unix timeの整数tickで扱う。浮動小数点による比較は禁止する。推奨単位はミリ秒または秒である。

検証に使う評価時刻`now`も整数tickである。証明書の検証では、`issued_at < now < expire`を現在有効の条件とする。発行時点の発行資格を検証するときは、評価時刻を当該証明書の`issued_at`に固定し、その時刻より前に発行された根拠だけを使う。

forum状態(depth、Q、membership、asset registryなど)に依存する判定では、`now`は第3.5節の`t_state=checkpoint_time`に固定する。証明書個別の期限判定に使う時刻と、forum状態を評価する時刻は独立であり、混同してはならない。

端末の壁時計（wall clock）は、それだけでは信頼の根拠にならない。Gaiaの時間依存の判定は、単一の時刻点ではなく「検証された時刻の閉区間」と、継続的な健康の確認を基礎に置く。あるbodyが通常権限を行使するには、対象forumが定める時刻健全性の条件を満たし、有効な`TemporalHealthLease`を提示できなければならない。時刻区間・時刻交渉（TimeHandshake）・時刻証人・健康状態の定義は第14章に、それらがdepthや発行資格へ効く方法は本章に定める。とくに、`degraded`、`unhealthy`、`quarantined`、`excluded`、`revalidation_pending`の間、そのbodyは本章の参加時間を積み上げられない。

#### 4.1.1 trust epoch

Soul Sの評価時刻tにおける有効trust epochを`TrustEpoch(S,t)`とする。trust epochは、人格的信頼、成熟、関係、Civic資格の利用境界を区切るSoulごとの単調増加整数である（第0章の用語）。Soul Transfer Finalizationが時刻`effective_from`で確定するたびに、trust epochは厳密に1増える。

\[
TrustEpoch(S,t_{after}) = TrustEpoch(S,t_{before}) + 1
\]

ただし、同一Soulの同一時点に複数の有効trust epochを持ってはならない。

\[
|\{e \mid ActiveTrustEpoch(S,e,t)\}| = 1
\]

初期epochは0とする。

\[
TrustEpoch(S,t_{genesis}) = 0
\]

`SoulTrustEpochTransition`は、同一Soulについて連続整数でなければならず、分岐、欠落、時刻逆行、同一epochへの複数finalizationは`TrustEpochFork`、`InvalidTrustEpochSequence`又は`TemporalCycle`として拒否する（第16章）。

### 4.2 参加期間

forum rootはgenesisにより恒久的な参加資格を持つ。rootは、そのforumのすべての有効な`ForumStateCheckpoint`の`membership_root`に必ず含まれなければならない。rootのmembershipは通常証明書、`expire`、root発行台帳に依存しない。root leafを欠くcheckpointは`MissingRootMembership`として拒否する。

root以外のノードがforum Fで最初の有効な入口またはcommunity証明書を得た時点から、参加期間が始まる。この開始事実を`participation_anchor`という。

`participation_anchor`は、対象ノードがsubjectである最初の有効な`root_entry`または`community`証明書の内容ハッシュと`issued_at`からなる不変の履歴参照である。一度確立した`participation_anchor`は、その証明書が後に失効しても失われない。ただし現在の参加資格は、別に少なくとも一枚の、参照するcheckpointの`checkpoint_time`において有効な`root_entry`または`community`証明書を保有することを要求する。

本仕様では、`participation_anchor`は上記の履歴参照に加えて、確立時点の`trust_epoch`と`controller_binding_commitment`を保持する。有効な参加期間は、同一trust epoch内のanchor以降だけを数える。Soul Transfer Finalization後、successor controllerの通常の成熟計算において、旧trust epochの`participation_anchor`、健康時間、community関係を使用してはならない。

参照するcheckpointの`checkpoint_time`において参加中であるroot以外のノードについて、参加期間は、participation_anchor以降に「参加中かつ時刻健全性（healthy）を継続して確認できた区間」の合計とする。本仕様では、この合計は評価対象のtrust epoch内に限定する。

\[
T_{actual}^{healthy}(S,F,t)=\sum_{i\in HealthyIntervals(S,F,TrustEpoch(S,t))}duration(i)
\]

`HealthyIntervals(node,F)`は、participation_anchor以降で、(a) 有効な参加証明書を保ち、(b) そのforumでhealth stateが`healthy`であり、(c) 有効な`TemporalHealthLease`に覆われており、(d) `EkycMembershipEligible(node, F, t)`を満たす区間である。`degraded`、`unhealthy`、`quarantined`、`excluded`、`revalidation_pending`の期間は算入しない（第14章）。`membership_ekyc_policy=verified_required`のforumにおいて`EkycMembershipEligible`を満たさない期間（`suspended_for_ekyc`）も算入しない。端末時計が進んでいるだけでは増えない点が重要である。

`EkycMembershipEligible(S, F, t)`は次で定義する。`membership_ekyc_policy(F) = not_required`であるforumでは常に真であり、`verified_required`であるforumでは`ForumMembershipEkyc(S, F, t)`（第17章）を要求する。

```text
EkycMembershipEligible(S, F, t) =
    membership_ekyc_policy(F) = not_required
    OR
    ForumMembershipEkyc(S, F, t)
```

`EkycMembershipEligible`は、`membership_root`がコミットする参加者集合（第13.2節の`ActiveMembers`）を変更しない。`membership_root`は履歴を含むコミット済み集合であり、eKYCの失効によって過去の`root_entry`・`community`又はmembership leafを消去・書換えしてはならない。`EkycMembershipEligible`が作用するのは、第13.2節の`ActiveMember`述語を通じた現在の有効参加、`T_actual`の積算、Q寄与、AssetScore、Candidates、Reachの計算、及びこれらを入力とする下流量（`A_seed`、`EarlyBonus`、`CanPublishAsset`）だけである。いかなる係数、重み、閾値又はbonus項もeKYC状態を直接読んではならない。`membership_ekyc_policy=not_required`のforumでは、eKYC credentialの有無だけを変えても、他の入力が同一ならこれらの値は不変である（第24.19節の項目12）。`membership_ekyc_policy=verified_required`のforumでは、`A_seed`及び`EarlyBonus`は`Q`・`depth`の下流量として同じ`ActiveMember`経路を通じてのみ変化し得る（第24.19節の項目11・13）。

Soul Transfer Finalization後のsuccessor controllerの参加状態について、次を固定する。譲渡finalization時に新epochの`participation_anchor`を自動生成してはならない。後継controllerは、各forumで新たな有効な`root_entry`又は`community`証明書を新trust epochとして取得するまで、当該forumでの`ActiveMember`、`T_actual`、`Q`、depthは未確立である。

> Soul Transfer Finalizationは、対象Soulの既存forum membershipを歴史記録として保持するが、successor controllerの新trust epochに対する`ActiveMember`、`participation_anchor`、`T_actual`、`Q`、depth、通常AssetScoreを自動承継しない。successor controllerは、各forumで通常の有効参加証明書を新epochとして取得しなければならない。

安全側の二時点差分しか使えない場合（区間の不確実性を扱う場合）は、次を使う。

\[
T_{actual}^{safe}=\max(0,\ lower(t_{state})-upper(t_{anchor}))
\]

以下、本章の式で単に`T_actual`と書いた場合も、この健康区間ベースの値（`T_actual^{healthy}`、または安全側の区間演算から導いた値）を指すものとする。

複数証明書があるなら、検証できる最も古い`participation_anchor`を使う。新しい証明書をもらっても、それまで積み上げた参加時間は失われない。参照するcheckpointの`checkpoint_time`において有効な参加証明書が一枚もないノードは、その時点で参加中ではなく、depthとAssetScoreは未定義とし、発行・認定・アセット利用を拒否する。後に有効な参加証明書を再取得した場合、同じforumで検証可能な既存`participation_anchor`があれば参加期間はそのアンカーから再開する。

最初の入口証明書を受けた直後には、`T_actual=0`、depth=Mとなる。

### 4.3 目標depthに必要な時間

M=max_depthとする。目標depth dへ、関係による前倒しなしで到達するための基本待機時間は次である。

\[
T_{required}(d)=T_{max}\left(\frac{M-d}{M}\right)^p
\qquad(1\le d\le M)
\]

深い数字ほど入口に近く、必要時間は短い。`p>0`と`T_max>0`により、必ず次が成り立つ。

\[
T_{required}(M)=0
\]

したがって、初回入口証明書を得た人は即座にdepth=Mになる。

### 4.4 初めて発行できるまでの時間

depth=Mでは発行できず、初めて発行可能なのはdepth=M−1である。この待機時間をWにしたいなら、forum作成時に次を選ぶ。

\[
T_{max}=W\cdot M^p
\]

すると、

\[
T_{required}(M-1)=W
\]

となる。たとえばM=20、p=1、W=7日ならT_max=140日である。入口から7日後にdepth=19となり、初めて一般発行者になれる。

`T_max`が整数tickでなければならないため、任意のWと正の有理数pが常にこの式を満たすとは限らない。forum作成時には、正確に表現可能な`T_max`を選ぶか、希望Wを`T_required(M-1)`として正規化済み有理数tickで表示しなければならない。

### 4.5 有資格な一般関係量Q

早く成熟するには、ただ証明書を集めるのではなく、正当に成熟した一般発行者との関係が必要である。

Qはcommunity証明書に書かれた目標depthを数えるものではない。Qは、参照checkpoint時点で有効であり、発行時点に正当に発行されたcommunity証明書の、異なるissuerからなる集合の濃度である。community証明書がQ-setに新しいissuer leafをもたらすとき、Qは増え得る。depthの変化は、その後に同一checkpoint時点で`T_actual`とQから再計算される結果である。

Q(node,F)は、参照するcheckpointの`checkpoint_time`において、次のすべてを満たす**異なる一般発行者（Soul）**の数である。

- 証明書がforum Fに属し、`checkpoint_time`において有効
- `certificate_kind`が`community`
- issuer_chainとissuance_proofを完全オフラインで検証できる
- 発行者が当該証明書の`issued_at`時点で`CanIssueTo`（第4.8節）を満たして発行した
- 発行者が当該`issued_at`時点で、通常authorityゲート（そのSoulの唯一のactive bodyであること、有効なSoulEpochLeaseを持つこと、対象forumで`healthy`なTemporalHealthLeaseを持つこと）を満たしていた
- 同じissuer Soulは何枚あっても1人として数える（`issuer_soul_id`基準）

\[
Q(node,F)=|\{issuer\_soul\_id(c)\mid c\in QualifiedCommunityHeld(node,F)\}|
\]

root_entryとreciprocalはQに数えない。これが重要である。root入口を多数のforumで仲間内に配り合っても、早期昇格、発行権、他forumへ持ち出せる信用は増えない。

Q(node,F)の完全性は、`ForumStateCheckpoint`の`qset_root`が固定する**Q-set**により保証する。Q-setは、issuer Soul（`issuer_soul_id`）をkeyとし、当該issuerによるnode宛の有資格`community`証明書の代表hash・issuer identity binding・issuance proof root・issued_at・expire・health/epoch依存を値とするMerkle mapである。同一issuer Soulからの複数証明書は、gaia-coreが定める代表選択規則により一つのleafに集約し、Qを重複して増やさない。issuerが転生によりauthority keyを変えた場合でも、同一issuer Soulによる二重寄与は生じない。健康を確認できない身体（`degraded`以下のhealth state）は、Q-set leafの現在の寄与から除外する。この除外はmembership履歴からの削除ではない（第13.2節）。

本仕様では、Qはtrust epochに束縛される。community証明書は、subjectが現在評価するtrust epochへ明示的に束縛されなければならない。community証明書のkind固有フィールドに`subject_trust_epoch`を追加してはならない（通常証明書schemaの変更を抑えるため）。代わりに、community証明書の署名時点に対する`SoulTrustEpochTransition` chainを発行資格bundleへ含め、subject Soulの当時のtrust epochを決定論的に導出する。Q-set leafには、`subject_trust_epoch`と`issuer_trust_epoch_at_issuance`を正規化済みの導出値として保存し、現在epochと一致しないleafをQに数えない。

\[
Q(S,F,t)
=
\left|
\left\{
issuer\_soul\_id(c)
\mid
c\in QualifiedCommunityHeld(S,F),
subject\_trust\_epoch(c)=TrustEpoch(S,t),
issuer\_trust\_epoch(c)=TrustEpoch(Issuer(c),issued\_at(c))
\right\}
\right|
\]

Soul Transfer直後に譲渡前Q-setだけがある場合、後継controllerの新epochに対して次が成立する。

\[
Q_{successor}(S,F)=0
\]

後継controllerが新epochで有資格なcommunity証明書を得た後は、その新しいissuer Soul集合だけがQへ寄与する。

depth判定に必要なのは、通常\(Q\ge A(\Delta T)\)という閾値の成立だけである。したがって申請者は、Q-set全体を開示する必要はなく、必要数分の異なるissuerに対応するleafと、それぞれのinclusion proof、証明書実体、issuance proofだけを`StateProofEnvelope`に含めればよい。検証者は、開示された各issuerが異なること、各leafが`qset_root`に正しく含まれること、開示件数が\(A(\Delta T)\)以上であることを確認する。Q-setの正確な全体件数や、他issuerとの関係の有無を確認したい場合は、`qset_root`に対する完全な列挙、または個別issuer Soulについてのinclusion / non-inclusion proofを別途要求できる。

第7.6節の育成実績ボーナスは、特定のissuer Iを除いたQ-setの部分集合を用いる。この部分集合をQ_{-I}と表し、次で定義する。

\[
Q_{-I}(node,F)
=
\left|
\{issuer\_soul\_id(c)\mid c\in QualifiedCommunityHeld(node,F),\ issuer\_soul\_id(c)\ne I\}
\right|
\]

Q_{-I}(node,F)は、issuer Iを除いた場合でも、常に次を満たす。

\[
Q_{-I}(node,F)\le Q(node,F)
\]

これはissuerの集合から一つの要素を除く操作が、集合の要素数を減らすか変えないかのいずれかにしかならないという、集合演算として自明に成立する性質である。

### 4.6 時間不足の補填

目標depth dへの時間不足は次である。

\[
\Delta T(node,F,d)=\max(0,T_{required}(d)-T_{actual}(node,F))
\]

時間が足りるなら補填は不要である。

\[
A(0)=0
\]

時間が足りないときだけ、必要Qは指数的に増える。

\[
A(\Delta T)=\left\lceil A_0r^{\Delta T/\tau}\right\rceil
\qquad(\Delta T>0,\ r>1)
\]

`A0>=1`、`r>1`、`τ>0`により、時間不足が正である限り必要関係量は少なくとも1であり、時間不足の増加に対して非減少である。

### 4.7 depthの定義

rootは常にdepth=0である。

\[
depth(root,F)=0
\]

参照するcheckpointの`checkpoint_time`において参加中であるroot以外のノードについて、目標depth dに到達できる条件を次とする。

\[
Eligible(node,F,d)\iff Q(node,F)\ge A(\Delta T(node,F,d))
\]

その人の当該checkpoint_timeにおけるdepthは、到達可能な最も小さいdである。

\[
depth(node,F)=\min\{d\in\{1,\ldots,M\}\mid Eligible(node,F,d)\}
\]

`T_required(M)=0`かつ`A(0)=0`なので、当該checkpoint_timeにおいて参加中のroot以外のノードには必ず少なくともd=Mが存在し、depthは常に一意に定義される。Qを増やしてもdepthが悪化することはない。現在参加を維持したままT_actualが伸びてもdepthが悪化することはない。これは、参加・関係形成・時間経過が常に非負の価値を持つための単調性である。

root(depth=0)は、proximity(第7.4節)が常に最大値1になる。これは、forumを創設した瞬間に、そのforum内で到達可能な最も浅い位置に立つことを意味する。

depthは、個々のcertificateに記載された値、申請者の希望、またはissuerの裁量により変化しない。depthは、checkpointの状態根と依存証明から導出される`T_actual`およびQを入力として、gaia-coreが決定論的に算出する値である。

> depthはSoul IDの恒久属性ではなく、Soulの特定forum・特定checkpoint・特定trust epochにおける導出値である。Soul Transfer Finalization前のdepthを、後継controllerのdepthとして表示、引用、発行資格判定又はassetアクセス判定に使ってはならない。

### 4.8 誰が誰にcommunityを発行できるか

発行者Iが通常のcommunity証明書を発行できる条件（`CanIssue`）は次である。

\[
CanIssue(I,F,t)\iff 0<depth(I,F,t)<M
\]

rootは例外として、第5章の入口証明書（`root_entry`）だけを発行できる。

subject Sへcommunity証明書を発行できる条件（`CanIssueTo`）は次である。

\[
CanIssueTo(I,S,F,t)
\iff
0<depth(I,F,t)<depth(S,F,t)\le M
\land ActiveMember(S,F,t)
\land I\ne S
\land ValidCommunityIssuanceContext(I,S,F,t)
\]

ここで`ValidCommunityIssuanceContext`は、少なくとも次を確認するpredicateである。

- IとSが対象forum Fのactive memberである
- Iの発行時点のauthorityが唯一のactive bodyに束縛される
- IのSoulEpochLeaseが`issued_at`を覆う
- IのTemporalHealthLeaseが対象forumで`healthy`として`issued_at`を覆う
- Iのissuer_chainおよびissuance_proofが完全に検証できる
- community objectがcanonicalで、署名・時刻・forum一致を満たす
- I != S
- forum固有の客観的rate limitまたは明示的な禁止規則があれば満たす

`CanIssueTo`は、subject Sが特定のdepthに既に到達していることを要件に含めない。発行者IがSへ関係証明書を発行できるかと、Sがその時点でどのdepthにいるかは別の判定である。ただし、同一pre-state checkpointでgaia-coreが計算した`depth(I,F,t)<depth(S,F,t)`（issuerの方が成熟していること）を要求する。

この判定に用いるdepthとActiveMemberは、当該申請時に発行者・申請者双方が提示する`StateProofEnvelope`の`checkpoint_time`によって評価する。発行者と申請者が異なるcheckpointを使う場合は`CheckpointMismatchForCommunityRequest`として拒否する。

`verified_required` forumでは、`CanIssueTo`に加えて`CanIssueToEkycRequiredForum(I, S, F, t)`（第8.2節）を満たさなければならない。同述語は、申請者が有効な`ForumEkycParticipationProof`を提示しない限り`community`を発行できないことを定める。`not_required` forumでは同述語は`CanIssueTo`以外の条件を追加しない。`CanIssueTo`自体は、subjectのeKYC credentialの有無を入力にしない。

CanIssueとCanIssueToは数理的な到達条件である。実際に証明書へ署名して発行するには、加えて通常authorityゲート（そのSoulの唯一のactive bodyであること、有効なSoulEpochLeaseを持つこと、対象forumで`healthy`なTemporalHealthLeaseを持つこと、**譲渡lock中でないこと**（`NotSoulTransferLocked`）、**評価時点のtrust epochが現在の有効epochであること**（`ActiveTrustEpoch`））を満たさなければならない（第1.2節、第15章）。

### 4.9 返礼証明書

community証明書が発行されると、subjectはissuerに対して返礼証明書`reciprocal`を自動発行できる。

reciprocalは、発行されたcommunity証明書への参照、同一セッションID、subjectとissuerの公開鍵を署名して記録する関係証明である。reciprocalはcommunity関係への返礼・関係記録であり、Q、depth、CanIssue、CanIssueTo、A_seed、CitationBonusの入力にはならない。community証明書が将来subjectのQへ寄与するかは、後続checkpointにおけるQ-set採用・issuer一意性・health等の規則だけで決まる。

このため発行者は、単に手数料を得るだけでなく、将来成長する参加者との関係、利用者・販売機会、forum内での実績を早く形成する動機を持つ。一方で、返礼だけを相互参照して成熟度を作ることはできない。発行という行動そのものへの数学的な報酬は、第7.6節の育成実績ボーナスとして与えられる。その成立条件は、IからSへの有効な`community`証明書が存在すること、`IndependentEligible(S,F,d_{cult};I)`が成立すること、及び`Q_{-I}(S,F) >= 1`であることの三つであり、`reciprocal`はこのいずれの条件にも含まれない。Iは自分が発行したことを根拠に報酬を得るのではなく、SがI以外の根拠によっても独立に成熟したことによってのみ得る。

> Soul Transferは、過去controllerが積み上げた関係・成熟をsuccessor controllerの通常権限へ転換してはならない。Q、depth、CanIssue、CanIssueToのepoch境界は、後続のAssetScore、bonus、seed及びCivic資格にも適用される。

---

## 5. rootの役割とブートストラップ

### 5.1 rootは恒久的な最強発行者ではない

rootはforumを始めるために必要だが、forumが育った後も全参加者の入口を独占してはならない。そこでrootの通常発行権は、最初のB人を入れる`root_entry`だけに限定する。

\[
0<root\_issuance\_index\le B
\]

Bはgenesisの`bootstrap_root_issuance_limit`で固定する。B+1人目以降について、rootは新規通常証明書を発行できない。

forumのrootも一人のSoulである。rootが`root_entry`を発行するのも通常のGaia権限の行使なので、root自身が当該時刻にそのSoulの唯一のactive bodyであり、有効なSoulEpochLeaseと、このforumで`healthy`なTemporalHealthLeaseを持っていなければならない（第1.2節、第15章）。

genesisに署名したrootは**genesis root**として永久に記録される。Forum Root Succession後の後継者は、genesis rootを書き換えるのではなく、指定された`root_epoch`における**active root authority**となる。次を固定する。

- `root_entry`の過去発行者は、発行時点のroot authorityに固定される。
- `bootstrap_root_issuance_limit`、既存`root_issuance_index`、既存root ledger chainは、root successionによって再起算・延長・消去・再順序化されない。

root entryの発行者条件を、単なるgenesis rootではなく「当該時点で正当にactiveなroot authority」に拡張する。ただし発行資格を売買する経路を作らないため、後継root controller自身のtrust epoch・通常authorityを検証し、ForumRootSuccession chainを要求する。

\[
CanIssueRootEntry(R,F,t)
\iff
ActiveRootAuthority(R,F,t)
\land NormalGaiaAuthority(R,F,t)
\land NotForumTransferLocked(F,t)
\land RootLedgerCapacityAvailable(F,t)
\]

`ActiveRootAuthority`はgenesis root又はfinalizedなForumRootSuccession chainの末尾から導出する。Soul Transfer中・forum transfer中のroot authorityは発行できない。

### 5.2 root_entryの価値

root_entryには意味がある。しかし、その価値は他forumへ持ち出せる信用ではなく、forumを実際に早く始めたことへの限定的な先駆者利益である。

root_entryを受けた人は次を得る。

- forum参加資格
- T_actualの開始
- 再計算による入口depth=M（root_entryはdepthを直接固定しない）
- そのforumが実アセットを育てた場合だけ受け取れる、forum限定・有界・譲渡不能な先駆者アクセス権

root_entryは得ないものも明確にする。

- Qへの寄与
- 時間不足の補填
- depthの前倒し
- 発行権の早期獲得
- 他forumの創設シードへの持ち出し
- 被引用ボーナスの根拠

### 5.3 root発行台帳

B人上限を完全オフラインで検証できるよう、rootは署名付き追記専用発行台帳を使う。各root_entryは以下を含む。

- `root_issuance_index`
- `previous_root_ledger_hash`
- `root_ledger_entry_hash`
- rootの署名

検証者は、同梱バンドル内の台帳連鎖をgenesisから当該entryまで辿り、通番の連続性、ハッシュ連鎖、署名、B以下であることを検証する。欠落、分岐、通番飛び、署名不正はすべて無効である。加えて、rootは当該`root_entry`の`issued_at`時点で通常authorityゲート（唯一のactive body、有効なSoulEpochLease、このforumで`healthy`なTemporalHealthLease）を満たしていなければならない（第5.1節）。

台帳全体の状態は、第3.5節の`ForumStateCheckpoint`の`root_ledger_root`によっても固定される。あるcheckpointにおける発行済みroot_entry数がB以下であることは、当該checkpoint_time時点の`root_ledger_root`に対する完全な連鎖検証、またはgaia-coreが定める集計proofにより確認する。checkpoint間での二重発行や分岐が生じないことは、checkpoint生成規則と署名者の一意性によって扱う運用上の要件であり、個々の`StateProofEnvelope`単体の検証では、提示されたcheckpointの内部整合性のみが保証される。

Forum Root Successionの前後で、root ledgerは単一連鎖を維持する。

- `previous_root_ledger_hash`の連鎖はroot epochをまたいでも継続する。
- 各entryには、そのentryを発行した`root_authority_epoch`を導出又は明示できなければならない。
- 異なるroot epochから同一`root_issuance_index`を発行した場合、`EquivocatedRootLedger`又は`RootLedgerSuccessionFork`として拒否する。
- forum root transfer freeze中のroot ledger更新を拒否する。

### 5.4 初期参加と自律化

設立直後はrootしか入口を発行できないため、外部の人がrootへ申請する価値がある。最初のB人は最も早くT_actualを始められ、forumが実アセットを育てたときの先駆者アクセス権も得る。

最初の参加者は、W時間が経過すればdepth=M−1となり、一般発行者になる。その後、新規参加者は一般発行者へ申請する。一般証明書だけがQを増やし、時間不足を補填できるため、一般発行者との関係形成がゲームの中心になる。

### 5.5 回復・転生・再発行

root停止後に「再発行」と称して新しいroot_entryを作ることは禁止する。これはB上限の回避になる。

鍵や証明書を失った場合の扱いは、失ったものが何かによって異なる。

- **同一deviceの鍵だけを失った場合**: 保護された暗号化バックアップ（または安全な鍵管理）から同一の鍵を復元する。同一Soul・同一incarnationのままなので、Q、depth、root_entry通番、先駆者アクセスは変わらない。
- **deviceそのものを失った場合（故障・紛失・盗難・寿命）**: authority鍵はincarnationに束縛されているため、単純な鍵の復元では通常権限を取り戻せない。第16章のSoul-Bankによる正規の**転生**（正常転生、または紛失を証明する喪失転生）を使う。復旧が完了するまで、そのSoulの通常権限は停止する。転生は新しいauthority keyを持つ新しいincarnationをactiveにするが、新たなQ、早期アクセス枠、root_entry通番を生んではならない。Soulの恒久識別子（soul_id）は変わらない。
- **root（forum創設者）のdevice喪失**も同様にSoul-Bankの転生で扱う。root_entryの再発行によるB上限の回避は、いかなる経路でも禁止する。

回復・転生に関わるobject（復旧資料の取得、`NormalSuccessionIntent`、`LostBodySuccessionRequest`、`RecoveryEligibilityCredential`など）は、通常authorityゲートの例外として第16章・第17章が定める規則で扱う。

### 5.6 Forum Root Succession

Forum Root Successionは、eKYC済みの現root controller（predecessor）と後継root controller（successor）の間で、genesisとforum_idを不変に保ったまま、将来のroot運営権限（active root authority）を承継する正式手続である（第1.4節）。genesis rootは永久に記録され、後継者は指定された`root_epoch`におけるactive root authorityとなる（第5.1節）。

本節が定義するobject（`ForumRootTransferAgreement`、`ForumRootTransferFreeze`、`ForumRootSuccession`、`ForumRootTransferDispute`、`ForumRootTransferResolution`）は、第3章のobject共通規則を満たし、Soul Transferの手続（第16.7節）と構造を共有する。eKYC・distinctness・freeze・決済予約・旧authority失効・新authority束縛・root epoch切替・dispute状態・履歴commitmentが揃わなければfinalizeできない。

- `ForumRootTransferAgreement`: 現root controllerと後継root controllerが、forum_id、root succession scope、価格、評価checkpoint、凍結・異議期限を双方署名で固定する。scopeは将来のroot運営権限に限定し、Q、depth、root_entry枠、既存root ledger、過去署名、Civic資格、既存PayoutEntitlement等を承継するscopeを禁止する（`ForbiddenTransferTrustCarryField`）。
- `ForumRootTransferFreeze`: 対象forumのroot authorityを書込み凍結し、root entry、checkpoint等の競合操作を停止する。freeze中は`CanIssueRootEntry`を満たさず、root ledger更新を拒否する。
- `ForumRootSuccession`: genesisとforum_idを不変のまま、root epoch、前任root、後任root、authority切替、決済条件、履歴連鎖を確定する。root ledger chainはroot epochをまたいで単一連鎖を維持する（第5.3節）。
- `ForumRootTransferDispute` / `ForumRootTransferResolution`: forum root authority譲渡に関する異議・解決を記録する。取消は履歴削除でなく解決objectにより状態を進める。

決済は第18.21節の譲渡決済（`soul_transfer`/`forum_root_transfer`）に従い、finalization後のchargebackによる自動巻戻しはない。原子的遷移と不変条件は第24.10節に定める。Bank provider registry等の更新は、finalized root authority chainを要求する（第20章）。

---

## 6. 先駆者利益とSybil耐性

### 6.1 守りたい二つのこと

Gaiaは次の二つを両立させる。

1. 新しいforumに早く参加する人には、本当に意味のある先駆者利益がある
2. 仲間内で空forumを量産しても、ネットワーク全体で持ち出せる成熟度・信用・発行力を増やせない

### 6.2 先駆者アクセス権

root_entry保有者は、そのforum内だけで有効な先駆者アクセス権を持つ。これは個人に結び付き、他者への譲渡、他forumへの持ち出し、Qへの変換を認めない。

forum Fのアクセス対象総量（有効アセット総量`A_real(F)`と創設シード`A_seed(F)`の合計）を`A_max(F)`とする。先駆者アクセス権による追加アクセスを次の上限付きで定義する。

\[
EarlyBonus(node,F)=
\min\left(
\gamma_F\cdot A_{max}(F),
L_F
\right)
\]

ここで、\(\gamma_F=early\_access\_rate\)、\(L_F=early\_access\_cap\)である。\(A_{max}(F)\)は第7.3節の定義\(A_{seed}(F)+A_{real}(F)\)による、創設シードを含むforumのアクセス対象総量であり、本仕様はこれを実アセットの総和\(\sum_{a\in ActiveAssets(F)}value(a)\)へ再定義しない。\(L_F\)は絶対値の上限であって\(A_{max}\)比例のpolicy値ではなく、basis pointから\(A_{max}\)単位への換算規則を適用しない。

この権利は当該forumのAssetScoreに加算するが、次の値へは入力してはならない。

- Q
- depth
- CanIssue、CanIssueTo
- A_seed
- CitationBonus
- 他forumのAssetScore

空forumではA_max(F)=0なので、EarlyBonusも必ず0である。したがって、空forumを100個作っても先駆者利益は100倍にならない。

### 6.3 なぜ一般発行者が有利か

root_entryは参加開始とforum内の限定的先駆者アクセスを与える。一般発行者のcommunity証明書は、それに加えてQを増やす。

Qが増えると、必要時間を待たずに浅いdepthを狙える可能性が増え、depthが浅くなるとアセットアクセスと認定可能範囲が増える。よって、forumが自律化した後にゲームを有利に進めたい人は、一般発行者との関係を増やす方が明確に有利である。

### 6.4 数理上の単調性

Qは増えるほどEligibleを満たしやすくなる。現在参加を維持する限り、T_actualは増えるほどΔTを減らす。このため、QまたはT_actualが増えて、以前に到達できたdepthに到達できなくなることはない。

また第7章の人脈ボーナスはQの単調非減少関数である。ただしdepth=Mでは`proximity=0`であり、Qを増やしても`proximity_eff`とAssetScore_baseは直接増えない。またβ=0、κ1=0、`proximity_eff=1`、最終AssetScore cap到達時には、Q増加のアクセス点数に対する厳密な増分は0になり得る。

したがって本仕様が数学的に保証するのは、正当な一般関係を増やしても、現在参加を維持する限りdepthとprotocol上のアクセス点数を悪化させないことである。特定の非飽和条件下でQ増加が厳密な局所利得になるかは第7.14節のprofile validatorまたは第12章のレコメンド計算で明示する。需要、価格、審査の容易さ、実際の人間関係、個人の費用までは数式だけで保証しない。

---

## 7. アセット層: 8つの力学とインセンティブ設計

### 7.1 発生させたい8つの力学

Gaiaのネットワークが健全に育つために、参加者に自然に取ってほしい行動が8つある。ルールで強制するのではなく、「そうした方が本人にとって得だから、自然にそうしたくなる」という形で設計する。

1. **上昇したくなる力学**: みんなが、大きなforumの中で、できるだけ浅い位置(root=創設者に近い位置)まで登ろうとする。
2. **創設したくなる力学**: みんなが、新しいforumを自分で立ち上げようとする。
3. **多参加したくなる力学**: みんなが、1つのforumだけでなく、できるだけ多くのforumに有効な証明書を持って参加しようとする。
4. **多親化したくなる力学**: みんなが、新forumを作るとき、できるだけ多くの、かつ質の高い親forumを紐づけようとする。
5. **発行したくなる力学**: みんなが、他人からの申請に対して、証明書を積極的に発行してあげようとする。
6. **市民化したくなる力学**: みんなが、eKYCを完了して現実の一意な責任主体と結び付き、Gaia仮想空間におけるCivicCitizenになろうとする。CivicCitizenはCivic Voteの正規市民票を持ち、確定したCivicNeedAssetを正式に供給し、市民NeedAsset市場の候補者・到達性に参加できる。未確認Soulは通常ゲームへ自由に参加できるが、公共需要と市民NeedAsset市場においては明確に劣後する（第23章）。
7. **支えたくなる力学**: みんなが、Gaiaネットワークに対して、他者のアセット、forum state、公開カタログ、検索indexを安全に保存・配布・検索可能にし続けようとする。将来は、検証可能な計算資源もこの力学に含める。容量・GPU・CPU等の自己申告ではなく、予約受理、durable storage receipt、継続監査、検証可能な検索応答、または検証可能な計算結果によって確認された実寄与だけが、既存のAssetScore、Reach、販売機会その他の既存利益に、上限付き・逓減的・epoch限定で寄与する。

第7力学は、ストレージ量、index量、計算能力の自己申告を直接褒賞しない。新しい通貨、無制限の通貨発行、Civic Vote重み、forum root authority、Soul authority、または恒久的な身分を与えない。第7力学は、実証済みのネットワーク供給を、既存ゲームのAssetScore、Reach、asset distribution、販売機会に限定的かつ上限付きで接続する。

8. **アセット公開したくなる力学**: Soulがアセットを作成し、公開し、継続して利用可能に保ち、独立した他者へ実効的な価値を提供することは、販売利益及びAsset Lineage Royaltyとは独立に、既存ゲームの有利さへ、量産中立な集計と係数和の上限により寄与しなければならない。この力学はGaiaにおける**最も強い自己利益の一つ**であり、公開の事実そのものによる基本報酬（`PublicationBaseScore`）と、利用・引用・派生等による追加報酬（`PublicationUtilityScore`）を分離する。正の寄与は、単なる登録、自己アクセス、自己購入、共通本人性を持つ主体間の循環取引、未確定決済、無権限派生、重複利用、又は可用性・監査不備から生じてはならない。

> この力学はQdepth、Q-set、CanIssue、CanIssueTo、Civic Voteの票重み、PaymentSettlement、PayoutEntitlement、又はAsset Lineage Royaltyの金額計算を直接変更してはならない。アセット公開由来の寄与は、既存のAssetScore、A_seed、CitationBonus、CultivationBonus、Resource Contribution Score、CivicNeedAssetの供給実績及び市場機会へ混合される。混合の上限は、各経路の個別capと`A_max`比例係数和の上限（第7.6節）により定まり、`AssetScore`が`A_max`へ張り付いて他の力学の限界利得を消すことはない。

設計上の因果ループ:

\[
\text{有効なアセット公開}
\rightarrow
\text{継続可用性・独立利用・正当な引用／派生・Need充足}
\rightarrow
\text{既存力学への寄与}
\rightarrow
\text{市場参加・創設・供給能力の改善}
\rightarrow
\text{より有用なアセット公開}
\]

同時に、次が許されない:

\[
\text{形式的な公開量}
\rightarrow
\text{Qdepth又は発行権限}
\rightarrow
\text{共同体信頼の支配}
\]

この8つは、どれか一つだけが全状態で極端に強くなってはならない。一つの力学だけが支配戦略になれば、残り七つを行う理由は失われる。しかし有限なasset、有限な候補者、cap、時間、費用を持つゲームで、八つすべてが全状態・無期限に厳密利得を生むことも不可能である。

第8のアセット公開の力学は、Gaiaにおける**最も強い自己利益の一つ**であり、公開の基本報酬の率は同じ基準量に与える他の経路の率を上回る（第7.21.1節）。ただしそれは「全状態で支配的」であることを意味しない。公開報酬の基準量は当該アセットの認定価値に置かれ（第7.21節）、`A_max`比例係数和の上限（第7.6節）と、公開件数によらず認定価値の総和だけで決まる量産中立な集計とにより、公開だけで`AssetScore`の総量を専有することはできない。他の七つの力学は、それぞれ異なる状態・資源・関係において限界利得を持つ。

したがって本章が目指す均衡は、「各力学について、正当なasset・相手・非飽和capacityがある局所状態で正の機会が存在し、禁止されたshortcutがprotocol-onlyの自己増幅で支配戦略にならず、cap到達後の機械的反復が永続的な勝ち筋にならない」ことである。第7.14節は、この主張を特定の有限目標範囲について機械検査できる形にする。

第六の力学は、eKYCによって`Q`、`depth`、`CanIssue`、`CanIssueTo`、`A_seed`、通常`AssetScore`または通常市場到達性を取得することではない。eKYCは、既存の正当な参加・成熟・アセット実績を持つSoulが、公共需要に応答する責任付き市民市場へ接続されるための条件である。

未確認Soulが通常アセット市場、forum創設、通常証明書、通常の協働から排除されることはない。未確認であることの不利は、公共意思形成と、そこから生じる市民NeedAssetの供給・候補者到達に限定される。

Gaiaが動かそうとする力学は、上記の第1〜第8の八つである。このうち本章の数式と第7.14節のprofile validatorが扱うのは、第1〜第5のアセット層の力学（五つのアセット層の力学）だけである。第6の市民化力学は公共層の力学であり、通常のアセット経済の数式へは入力されない。その詳細は第23章に定める。第7の支え（ネットワーク資源提供）の力学は、第7.19節のResource Contribution Scoreによる上限付き補正として扱い、AssetScore・Reach等の既存利益を置換しない。第8のアセット公開の力学は、第7.21節のAsset Publication Mechanicsによる上限付きの寄与として扱い、販売利益・ALR・Qdepth・発行権・Civic・決済を直接変更しない。本仕様の後続の節で「第1〜第5のアセット層の力学」または「アセット層の力学」と書く場合、第1〜第5の力学を指し、総数としての「八つの力学」とは区別する。

### 7.2 3つの価値: 利用可能性、市場機会、実現済み収益

第1〜第5のアセット層の力学それぞれに別々の通貨やポイントを用意すると、システムは複雑になり、通貨間の交換や投機が主目的になり得る。そこでGaiaは、新しい共通通貨や成熟度ポイントを作らない。代わりに、第1〜第5のアセット層の力学が参加者にもたらし得る価値を、次の三つに分けて扱う。

| 価値 | 主な立場 | 何を表すか | 現金か |
|---|---|---|---|
| 利用可能性（Access Utility） | 利用者 | 検証済みのmodule、AI agent skill、tool、workflow、datasetその他のProtectedContentを、read、execute又はread_executeできる範囲、およびそれらを組み合わせて利用できる選択肢 | いいえ |
| 市場機会（Market Opportunity） | 公開者・提供者 | 自分のAssetRecord又はServiceOfferが、指定checkpoint時点で条件を満たす潜在的対象Soulへ到達し得る状態。`Candidates`と`Reach`はこの検証可能な指標である | いいえ |
| 実現済み収益（Realized Cashflow） | 受取人・beneficiary | 第三者の注文、Stripe決済、PaymentReceipt、PaymentSettlement、BeneficiaryRule及びPayoutEntitlementにより確定する法定通貨の受取請求権又はPayout | はい |

このうち、Gaiaにおける基本的な非通貨のご褒美は、**利用可能なアセット空間の広さと、その利用から得られ得る能力・選択肢・時間短縮**である。浅いdepth、有資格な関係、実アセット、forum間の正当な接続その他の第7章の規則は、参加者がどのforumのどのassetへ、どの条件でアクセスできるかに影響し得る。

ただし、Asset Accessは利用権・実行権・読取権を表すものであり、それ自体は法定通貨の債権、収益、PayoutEntitlement、所有権、再販売権、又は将来売上の保証を表さない。`ContentAccessGrant`及び`KeyEnvelope`が保証するのは、対象ProtectedContentについて定められた条件のもとでread、execute又はread_executeできることである。

アセットへのアクセスが広がることは、参加者がそれを利用して新しいasset、service、研究成果、業務成果又は協働成果を作る可能性を広げ得る。しかし、アクセスから現金収益への直接の写像を定義してはならない。現金的な得は、参加者が公開者又はproviderとしてAssetRecord又はServiceOfferを提示し、別の主体が正当に注文し、Stripeによる支払い、PaymentReceipt、PaymentSettlement及び受取人別PayoutEntitlementが成立した場合に限り発生する。

概念上、この関係は次の順序である。

\[
AccessUtility
\rightarrow
CapabilityOrOptionValue
\rightarrow
OwnSupply
\rightarrow
ThirdPartyDemand
\rightarrow
Payment
\rightarrow
RealizedCashflow
\]

この矢印列は可能性を表すものであり、いずれの矢印も保証ではない。アセットへアクセスしても、利用、成果作成、公開、需要、購入、支払い、Payoutが必ず起きるわけではない。

「アセット」とは、オープンソースのrepositoryに似た共有可能な成果物を含むが、Gaiaではより正確に、検証済みのmodule、AI agent skill、tool、workflow、datasetその他の`ProtectedContent`を指す。これらは各forumに紐づく形でネットワーク内に蓄積され、AssetRecord、ContentAccessGrant、KeyEnvelope及び関連する状態proofにより、誰がどの条件で利用できるかを検証できる。

アセットへのアクセス範囲は、ネットワーク全体で一つの共通倉庫があることを意味しない。各forumは独立した証明書・成熟度・アセット状態を持ち、forum横断のアクセスは本章で定める正当な接続と割引規則に従う。これは、Gaiaが単一のグローバル管理者又は単一のグローバルな信頼計算を作らないという原則と整合する。

第7.13節以降で定義する`Candidates`及び`Reach`は、「どれだけの購入候補ノードへ届くか」を表す市場機会の検証可能な指標である。`Candidates`は、指定checkpoint時点で対象assetの条件を満たし、まだ当該assetへのgrantを持たない潜在的対象Soulの集合である。`Reach`は、その集合又はその上界・正確な件数を表す。これらは発見、推薦、広告、価格検討及び市場分析に用いるが、閲覧、購入、継続利用、売上、収益又は利益を保証しない。

\[
Candidates(a,F,t)=n
\not\Rightarrow
Sales(a,F,t)>0
\]

\[
Reach(a,F,t)=n
\not\Rightarrow
Revenue(a,F,t)>0
\]

CivicNeedAsset市場は、第三の独立通貨、新しい成熟度又は売買可能な公共影響力を作らない。これは既存のアセット経済のうち、Civic Voteで可視化された公共需要に応答する市場区分である。CivicNeedAssetの供給者は、既存のAssetRecord、価格、販売、共有及びPayment-Serviceを用いることができる。ただし、NeedScore、市民票、CivicCitizen資格、ballot nullifier又は公共意思形成上の影響力そのものを、売買、譲渡、換金、担保化又は通常アセットへの変換の対象にしてはならない（第23章）。

### 7.3 アセットとは

アセットは、検証済みモジュール、AIエージェントが利用できるスキル、ツール、データ、ワークフローなどである。各forumは独自のアセット倉庫を持つ。アセットの価値は創設者の自己申告では決めない。有効なアセット登録によって積み上がる。

各`value(a)`は非負有限の正規化済み有理数でなければならない。

まず、forumが実際に保有するアセットの価値だけを次で表す。

\[
A_{real}(F)=\sum_{a\in ActiveAssets(F)}value(a)
\]

次に、創設シードを含む、そのforumでアクセス対象として扱う総量を次で表す。

\[
A_{max}(F)=A_{seed}(F)+A_{real}(F)
\]

本仕様は\(A_{max}(F)\)を実アセットの総和\(\sum_{a\in ActiveAssets(F)}value(a)\)へ再定義しない。

`ActiveAssets(F)`は、参照する`ForumStateCheckpoint`の`asset_registry_root`が固定する、checkpoint_time時点でactiveなアセット集合である。個別アセットの登録・活性化状況は、当該rootに対するinclusion proofにより検証する。`A_{real}`は第7.9節と第7.10節で、過去の創設シードや各種ボーナスを再帰入力にせず、実アセット由来の実績だけを引き継ぐためにも使う。

### 7.4 力学1: 上昇したくなる力学とforum内のアクセス点数

**何を測るか**: forum内で自分がroot(創設者)にどれだけ近いか、つまりどれだけ浅いdepthにいるかを測り、それをアセットへのアクセス点数に変換する。

まず、depthからrootへの近さを0から1の値に変換する。

\[
proximity(node,F)=\frac{M-depth(node,F)}{M}
\]

depthが小さいほど、つまりrootに近いほど、proximityは1に近づく。root自身はdepth=0なので、proximityは常に厳密に1である。

次に、有資格な一般関係Qが増えるほど近さを少しだけ底上げする。

\[
proximity_{eff}(node,F)=
\min\left(
1,
proximity(node,F)
\left(1+\beta(1-e^{-Q(node,F)/k})\right)
\right)
\]

ここでβは人脈ボーナスの最大強度、kは増加が頭打ちになる速さである。

通常のforum内アクセス点数は次である。

\[
AssetScore_{base}(node,F)=
A_{max}(F)
\left(1-e^{-\kappa_1proximity_{eff}(node,F)}\right)
\]

depthが浅くなるほど、またQが増えるほど、`AssetScore_base`は単調非減少であり、かつ`A_max(F)`を超えない。ここで「単調非減少」はcapやゼロ係数による同値を含む。

厳密な局所増加を主張できるのは条件付きである。非rootの参加中nodeについて、`A_max(F)>0`、κ1>0、最終AssetScore capが非束縛なら、depthが一段浅くなることは`AssetScore_base`を厳密に増やす。さらにdepth<M、`proximity>0`、β>0、`proximity_eff<1`なら、Qを一つ増やすことは`AssetScore_base`を厳密に増やす。

最初の入口直後のdepth=Mでは`proximity=0`である。この状態でQを増やしても、Qは将来のdepth到達条件を助けるが、`AssetScore_base`を直接は増やさない。したがって「Qを増やせばすぐアクセス点数が増える」とは表示してはならない。第12章のレコメンドはこの条件を満たす場合だけ厳密なQ由来のアクセス増分を表示する。

### 7.5 力学2: 創設したくなる力学とroot地位

**何を測るか**: forumを創設した人が、そのforum内で常に最も浅い位置に立ち、既に親forumで積んだ実績の一部を新forumの初期資産として持ち込めることを保証する。

第4.7節で示したように、rootは常にdepth=0であり、proximityは常に1である。したがって、創設したforum自体が実アセットを育てれば、創設者はそのforum内で到達可能な最大のproximityから`AssetScore_base`を得る。

さらに、親forumで実際に積んだ実績は、第7.9節の`A_seed`によって新forumの初期アセット倉庫に反映される。つまり「forumを創設すること」自体は無条件の得ではなく、「創設した本人が、そのforum内で最も有利な位置に立ち、かつ過去の実績を持ち込める」という形の得である。空のforumを作るだけでは、`A_max(F)=0`である限りアクセス点数は生まれない。

### 7.6 力学5: 発行したくなる力学と育成実績ボーナス

**何を測るか**: 発行者が他人の申請に応じて`community`証明書を発行し、その相手が後に、その発行者以外の根拠によっても独立に成熟したことを測り、発行者本人への得として変換する。

証明書を発行すること自体をQやdepthの報酬にはできない。もしSがIから受けたcommunity証明書、あるいはその返礼であるreciprocalを根拠にIのQやdepthを増やすなら、Sがまだ何の実績もない時点でIが自分に有利な循環を作れてしまう。第4.9節で述べたように、reciprocalはQ、depth、CanIssue、CanIssueTo、A_seed、CitationBonusに寄与しない。

そこでGaiaは、Iの発行という行動そのものに対して、**Sの独立した成熟**を条件とする育成実績ボーナスを与える。「独立した成熟」とは、Iとの関係を除いても、Sが自力で目標depthに到達できることを指す。

Iを除いたSの有資格関係数を、第4.5節のQ_{-I}で表す。Sがforum Fで目標depth d_cultへ独立に到達できる条件は次である。

\[
IndependentEligible(S,F,d_{cult};I)
\iff
Q_{-I}(S,F)\ge A(\Delta T(S,F,d_{cult}))
\]

この条件が成り立つのは、Iとの関係を数えなくても、Sが自力で必要な時間とQを満たしている場合だけである。これに加えて、Sが少なくとも一人、I以外の有資格な一般発行者と正当な関係を持つことを要求する。

\[
Q_{-I}(S,F)\ge1
\]

この二条件をどちらも満たすSを、Iにとっての「育成実績」と数える。

\[
Cultivated(I,F)
=
\left\{
S\;\middle|\;
\exists\ 有効なc_{I\to S}:
IndependentEligible(S,F,d_{cult};I)
\land
Q_{-I}(S,F)\ge1
\right\}
\]

同じSに何枚発行しても一人として数える。

\[
C(I,F)=|Cultivated(I,F)|
\]

育成実績数Cは、Q-setと同様にMerkle map化して集合コミットメントとし、閾値証明により「少なくともC人育成した」ことをネットワーク照会なしに検証できるようにする。

育成実績ボーナスは、他のボーナスと同様に飽和・上限付きの形で与える。

\[
CultivationBonus(I,F)
=
\min\left(
\chi\cdot A_{max}(F)
\left(1-e^{-C(I,F)/k_c}\right),
L_c
\right)
\]

- \(\chi\): 育成実績が与える最大アセット比率
- \(k_c\): 報酬が飽和する速さ
- \(L_c\): forum内での育成報酬の絶対上限

CultivationBonusは、Cが増えるほど単調非減少であり、\(\chi\cdot A_{max}(F)\)と\(L_c\)のどちらよりも大きくなることはない。χ=0、L_c=0、個別cap到達、または最終AssetScore cap到達時には、Cを増やしても厳密なアクセス点数増分は0になり得る。IがSを育成したことによる報酬は、Sの成熟がI以外の根拠によって独立に確認された場合にのみ発生するため、IとSが互いの証明書だけを相互参照して報酬を作ることはできない。

CultivationBonusは、root_entry保有者のEarlyBonusと同じ形でAssetScoreに加算する。

\[
AssetScore(node,F)=
AssetScore_{base}(node,F)
+EarlyBonus(node,F)
+CultivationBonus(node,F)
+PublicationScore(node,F)
+InfrastructureAdjustment(node,F)
\]

ここで、`PublicationScore`は第7.21節、`InfrastructureAdjustment`は第7.19.4節で定義する。`CitationBonus`は`AssetScore`の項ではなく、第7.10節の`AssetAccess_{total}`の項である。

実装ではAssetScoreがA_max(F)を超えないように最終的に上限をかける。

\[
AssetScore(node,F)\leftarrow
\min(AssetScore(node,F),A_{max}(F))
\]

`β>=0`、`k>0`、`κ1>=0`、`χ>=0`、`k_c>0`、`L_c>=0`、`A_max>=0`により、現在参加中のノードについて、QまたはCの増加は`proximity_eff`、`AssetScore_base`、`CultivationBonus`のいずれも減少させない。`AssetScore_base`、`EarlyBonus`、`CultivationBonus`、`PublicationScore`、`InfrastructureAdjustment`、`AssetScore`はすべて0以上であり、最終的な`AssetScore`はA_maxを超えない。

EarlyBonusとCultivationBonusは、いずれもA_maxに対する比率と絶対上限の両方で個別に制限され、かつ全経路の和を含む`AssetScore`全体がA_maxで再度制限される。`PublicationScore`（第7.21節）と`InfrastructureAdjustment`（第7.19.4節）も同じ`A_max`上限と係数和の上限に従う。公開経路には`A_max`比例の個別上限を置かない。これにより、育成実績や公開という一つの力学だけでforum内の得の総量を専有することはできない。

個別capに加えて、`A_max`比例で加算される全経路の係数和は、厳密に10000 bps未満でなければならない。

\[
10000\cdot(1-e^{-\kappa_1})
+publication\_base\_bps
+\sum_k \mathrm{utility\_weight\_bps}(k)
+10000\cdot\gamma_F
+10000\cdot\chi
+asset\_mediated\_cultivation\_extension\_cap\_bps
+I_{protocol\_max}
<10000
\]

`asset_mediated_cultivation_extension_cap_bps`（第7.21.5節の「アセット媒介Cultivation拡張 100 bps」）を算入する。同節は`AssetMediatedCultivationContribution`を既存の`CultivationBonus`へ加算すると定め、その加算は`\min(\chi\cdot A_{max}(F),L_c)`の外側に置かれるため、`AssetScore`の`A_max`比例係数和へ算入しなければこの上限が成立しない。`asset_citation_extension_cap_bps`は算入しない。`CitationBonus`は`AssetScore`の項ではなく、第7.10節の`AssetAccess_{total}`の項であるためである。`publication_base_bps`及び6つの`*_weight_bps`（第7.21.6節）は`value(a)`に適用する率であるが、`V_{S,F,e}\le A_{max}(F,t)`であるため、`A_{max}`比例の係数和へ算入しなければこの上限が成立しない。

`10000\cdot(1-e^{-\kappa_1})`は`AssetScore_{base}`の`A_max`比例係数の上限である。`AssetScore_{base}(node,F)=A_{max}(F)(1-e^{-\kappa_1 proximity_{eff}})`であり、`proximity_{eff}\le1`であるため、その係数は`1-e^{-\kappa_1}`を超えない（rootは第7.4節により`proximity_{eff}=1`であり、この上限は実際に到達する）。これを算入しないと、`AssetScore_{base}`だけで`A_max`を使い切り、`AssetScore`の`A_max`上限が束縛して公開経路の寄与が切り捨てられる。

`EarlyBonus`及び`CultivationBonus`の実効係数は`\min(\gamma_F, L_F/A_{max})`及び`\min(\chi, L_c/A_{max})`であり、いずれも`\gamma_F`及び`\chi`を超えない。`L_F`・`L_c`が絶対上限であることは、本係数和の上限を弱めない。

したがって`\kappa_1`は本上限を通じて有界である。genesisは、`\kappa_1`・`\gamma_F`・`\chi`・公開経路の係数・`asset_mediated_cultivation_extension_cap_bps`・`I_{protocol_max}`の和が10000 bps未満となる値を宣言しなければならない。第2.4節は`\kappa_1`に個別の上限を置かないが、本上限が実効的な上限を与える。

公開経路の`A_max`比例係数は、`value(a)`に適用する基準量の率`publication\_base\_bps`と6つの`*_weight\_bps`の和である。公開経路に`A_max`比例の個別上限を置かない。\(L_F\)又は\(L_c\)が束縛する場合、\(\gamma_F\)及び\(\chi\)の実効係数はこれより小さいため、上式は`A_max`に依存しない十分条件である。この制約がないと、経路の追加により`AssetScore`\(=A_{max}(F)\)が常態化し、全Soulが上限へ張り付いて`Candidates`、`Reach`及び閾値判定の差が消え、力学1（浅いdepthへ進む）、力学2（創設）、力学5（育成）の限界利得がゼロになる。

CultivationBonusは、A_seed(第7.9節)やCitationBonus(第7.10節)への入力にはならない。これは、EarlyBonusと同じ理由による。ボーナス同士を再帰的に積み上げて増幅させないためである。第10章の告知・有料ブースト・PressRoom会員権も、CultivationBonusを含むいずれのボーナスへの入力にならない。これは非金銭的な信用経済と、金銭が動く付随機能を分離するための構造的な境界である。

これらの値はすべて、単一の`ForumStateCheckpoint`が指す`checkpoint_time`について計算する。異なるcheckpoint_timeのdepth、Q、C、A_maxを混在させて計算してはならない。

通常`AssetScore`がdepth、Q、実アセット、bonus等に依存する既存式は維持する。ただし、評価対象Soulの現在trust epoch以外に由来する人格的入力を除外する規則を追加する。

- `proximity`、`Q`、CultivationBonus、CitationBonus等、Soulの人格的成熟又は関係に由来する入力は、現trust epochに束縛される。
- 譲渡前controllerの成熟に基づく通常AssetScoreを、successor controllerの通常AssetScoreとして使ってはならない。
- 譲渡後、新controllerの通常AssetScoreは、新epochで取得したforum参加、健康時間、関係、実アセット等から決定論的に再構築される。

既存のアセット所有・publisher権限には、財産的権利と人格的scoreを分ける注記を入れる。

> AssetRecordのpublisher又はProtectedContentの権利者に関する契約的地位は、agreementに明示され、必要な相手方同意・ライセンス・決済規則を満たす場合に限り譲渡し得る。しかし、当該AssetRecordに関係する過去controllerの通常AssetScore、market reach、推薦上の人格的評価又は将来bonusがsuccessor controllerへ自動移転することはない。

CultivationBonusは、誰が誰を独立成熟へ導いたかという履歴的関係に由来する。次を明記する。

- 既に確定した過去のMaturityBond又はCultivationBonusの受取請求権は、原則として当時のissuer controllerに帰属する。
- Soul Transferは、譲渡前controllerが発行したcommunity証明書から将来発生し得るCultivationBonusを、successor controllerへ自動移転しない。
- その将来発生分を譲渡対象に含めたい場合でも、Gaiaの成熟度・関係価値を売る経路となるため、本仕様では禁止する。

#### 7.6.1 MaturityBondPolicy

通常のGaiaでは、発行者Iへの育成実績報酬は、受領者Sが後に独立成熟した場合だけ発生する。これは、発行だけで即時に自分へ報酬を作る循環を防ぐための意図された不確実性である。

forumが発行行動に関する金銭的な下限報酬を表示したい場合は、決済層に`MaturityBondPolicy`を置ける。`MaturityBond`はissuer、recipient、forum、community証明書または申請session、amount、currency、expire、未達時の返金または失効規則を束縛する。SがIを除いた根拠で`IndependentEligible`および\(Q_{-I}\ge1\)を満たす確定済みcheckpointが提示された時だけ、bondはIへ支払われる。

bondはQ、depth、CanIssue、CanIssueTo、A_seed、AssetScore、CultivationBonus、CitationBonus、Candidates、Reachの入力になってはならない。bondは成熟度や証明書を買う手段ではなく、審査・育成の経済的負担を補う決済層の約束である。

### 7.7 決定論的数値評価

depth、発行資格、アセット利用可否、A_seed、CitationBonus、CultivationBonusその他の検証結果に使う計算は、すべての実装で同じ結果を返さなければならない。IEEE 754浮動小数点の演算結果、OSやCPUの数学ライブラリ、暗黙の丸めに依存してはならない。

正規化済み有理数で有限に表せる加減乗除、比較、min、max、整数ceilは、任意精度整数と既約分数で厳密に評価する。指数関数を含む式は、gaia-coreが定めるバージョン付きの決定論的区間評価手続で評価する。

- 入力有理数と関数識別子から固定された精度の有理数区間`[lower, upper]`を計算する
- アクセス閾値などの比較結果は、値が閾値を確実に上回るか、確実に下回る場合だけ確定する
- 区間が閾値をまたぐ場合は、仕様で固定した精度を段階的に上げる
- 規定された最大精度でも比較が確定しない場合は`IndeterminateNumeric`として拒否する
- `A(ΔT)`のceilは、区間全体が同じ整数ceilに収まるまで精度を上げ、確定しなければ`IndeterminateNumeric`として拒否する

この手続で使う関数近似、多項式係数、初期精度、精度増加則、最大精度、区間端点の丸め方向はgaia-coreの識別子とともに正規化して固定する。同じ識別子を実装した検証者は、同じ入力に必ず同じAccept、Reject、`IndeterminateNumeric`を返す。第7.13節のカーディナリティ範囲proofも、同じ決定論的な整数演算だけで構成し、実装間の不一致を許さない。

### 7.8 力学3: 多参加したくなる力学と複数forumの合計

**何を測るか**: 1つのforumだけでなく、複数のforumに有効な証明書を持つことの得を測る。ある一つのforumへの深い集中だけでなく、複数forumへの広がりも独立した得になるようにする。

複数forumのAssetScoreを大きい順に並べて合算する。クロスforumの計算は、評価対象が指定する共通の評価時刻` t^* `を用いる。各forum Fについて、`t^*`以下で、かつそのforumの`state_freshness`内にある有効checkpointのうち、`checkpoint_time`が最大のものを一意に選び、その時刻を` t_F^* `とする。該当するcheckpointを提示できないforumは、そのクロスforum主張を検証不能として拒否する。これにより「なるべく近い」という実装依存の選択を排除する。

\[
t_F^*=\max\left\{
t\ \middle|\
t\le t^*,\
0\le t^*-t\le state\_freshness(F),\
tはFの有効なcheckpoint時刻
\right\}
\]

\[
AssetAccess_{direct}(node,t^*)=
\sum_{i=1}^{n}\rho(t^*)^{i-1}AssetScore_{(i)}(node,F_i,t_{F_i}^*)
\]

\[
\rho(t^*)=
ActiveGaiaAssetAccessPolicy(t^*).cross\_forum\_discount\_ratio
\qquad 0<\rho(t^*)<1
\]

`ActiveGaiaAssetAccessPolicy(t^*)`は、評価時点`t^*`においてGaia全体で一意に有効な`GaiaAssetAccessPolicy`（第18.23節）を選ぶ選択関数である。第18.23節が課す「任意の評価時刻`t`について`ActiveGaiaAssetAccessPolicy(t)`は一意である」という条件と同じ関数であり、第3.5節の一意選出の規則に従う。

\(\rho(t^*)\) は、評価時点`t^*`で有効な`GaiaAssetAccessPolicy`の`cross_forum_discount_ratio`である。この値はGaia全体で一意なpolicy versionにより決まり、forumごとに異なってはならない。forum genesis、forum root、Forum Root Succession、forum policy、forum checkpoint及びforum operatorは\(\rho(t^*)\)を設定・更新できない（第2.4節）。`GaiaAssetAccessPolicy`は第18章で定義する。

同一時点に有効な`GaiaAssetAccessPolicy`はGaia全体で一意でなければならず、複数が有効である場合、cross-forum `AssetAccess_direct`の主張はfail-closedで拒否する。\(\rho=1\)、\(\rho\le0\)、NaN、無限大、浮動小数点及び実装依存の丸めを禁止する。\(\rho(t^*)\)は既約有理数の正規化済み表現として扱い、除算・浮動小数点を用いない厳密比較で評価する（第7.7節）。

forumを増やすとアクセスは増えるが、弱いforumを無限に増やしても合計は発散しない。さらに空forumはA_max=0なので、そもそも加算できる価値がない。

各`AssetScore(node,F_i,t_{F_i}^*)`は、そのforumで選ばれた単一の`ForumStateCheckpoint`の`checkpoint_time`だけを用いて計算する。異なるforum間では評価時刻が異なり得るが、その選び方は上式により決定論的である。

新しく有効参加した一つのforumのAssetScoreが0以上である限り、同一の評価時刻かつ同一の`GaiaAssetAccessPolicy`の下では、`AssetAccess_direct`は既存の値より小さくならない。AssetScoreが正なら数学的な増分は正であるが、順位\(i\)が深くなるほど増分は\(\rho(t^*)^{i-1}\)で小さくなる。追加参加の個人的な純便益は、そのnodeの参加・維持・学習・関係形成の費用を差し引いて初めて決まる。

ある一つのforumだけに極端に集中しても、他のforumへ広がった場合と比べて`AssetAccess_direct`が必ず有利になるとは限らない。これは、\(\rho(t^*)\)が1未満であることと、各forumのasset、需要、費用が異なることによる幅と深さのトレードオフである。第7.14節のprofile validatorは、指定した`forum_target`までの最小増分を検査できる。この検査は、第7.14節の凍結値`declared_cross_forum_discount_ratio`を用いる。

### 7.9 力学4: 多親化したくなる力学と由来保存型の創設シード

**何を測るか**: 新forumを作るときに、より多くの、より質の高い親forumを結びつけることの得を測る。同時に、同じ親forumで得た一つの実績を、多数のchild forumのseedとして複製してはならない。

新forum Cの創設者は、親forumで実際に得た通常アクセスの一部を、新forumの初期アセット倉庫として引き継げる。ただしこの「引き継ぐ」は、同じ源泉を何度でも写し取ることではない。親forum P、creator H、および親checkpointの実アセット由来の寄与ごとに、有限のorigin lotを作り、そのlotからchild forumへ配分する。

root_entry由来のEarlyBonus、CultivationBonus、引用ボーナス、既存の創設シードを再帰的に持ち回る部分は、従来どおり引き継げない。ここでいう「実アセットと通常の成熟度から得た基礎アクセス」は、`A_max`ではなく第7.3節の`A_real`だけを使って、次のように定義する。

\[
AssetScore_{realbase}(node,F)=
A_{real}(F)
\left(1-e^{-\kappa_1proximity_{eff}(node,F)}\right)
\]

#### 7.9.1 origin lot、credit済み高水位と配分予算

親forum Pのcreator Hが、child genesisより前の選択済み親checkpoint qにおいて持つ実アセット由来基礎アクセスを次で表す。

\[
R(H,P,q)=AssetScore_{realbase}(H,P,q)
\]

origin lotは、単に隣接する二つのcheckpoint間のvalue差分から作ってはならない。Gaiaはcreator H、親forum P、asset lineage lごとに、創設seedの根拠として過去にcreditした最大実価値を`CreditedHighWater(H,P,l,q)`として記録する。

`CreditedHighWater`は現在のasset valueや残存asset valueを表さない。これは、当該lineageについて過去に創設seedの根拠として一度でもcreditした最大valueを表す、単調非減少の履歴値である。asset valueの低下、inactive化、削除、復元または再有効化は、`CreditedHighWater`を減少させない。

したがって、新しい創設能力になるのは、対象checkpointにおけるvalueが過去の`CreditedHighWater`を厳密に超えた部分だけである。過去credit高水位以下への回復は、新しいcreditを生まない。

まだ当該creator・親forum・lineageについてcreditが存在しない場合、基準値は0とする。

\[
CreditedHighWater(H,P,l,GENESIS)=0
\]

各assetは不変の`AssetRecord` versionとして登録する。既存`AssetRecord`の`value`、`protected_content_ref`、`publisher_pubkey`、`required_access_threshold`、`price`、`currency`、`active`その他のconsensus-critical fieldを上書き変更してはならない。更新は新しいasset record hashを作り、旧versionをinactiveにし、新versionをactiveにすることで表す。

assetの論理的な系譜を識別するため、各`AssetRecord`は必須field `asset_lineage_id`を持つ。初回versionでは、`asset_lineage_id`は公開者公開鍵、初回`protected_content_ref`、`created_at`、およびgaia-coreが生成する必須`asset_creation_nonce`のcanonical encodeから得るhashとする。`asset_creation_nonce`は公開者が指定してはならない。後続versionは同じ`asset_lineage_id`を持ち、直前versionのhashを必須field `previous_asset_version_hash`として参照する。asset version chainに分岐、欠落、時刻逆行、または同一tick参照があれば`TemporalCycle`または`EquivocatedAssetVersion`として拒否する。

対象checkpoint qにおける各`asset_lineage_id` lの有効versionを`a_l(q)`とする。あるcheckpointで有効versionが存在しないlineageのvalueは0とする。

\[
v_l(q)=
\begin{cases}
value(a_l(q)) & \text{if an active version of lineage } l \text{ exists at } q\\
0 & \text{otherwise}
\end{cases}
\]

対象checkpoint qでactiveなlineageについて、直前の確定済みcredit ledger状態`q^-`に対して未creditの新規実価値を次で定義する。

\[
CreditDelta(H,P,l,q)
=
\max\left(0,v_l(q)-CreditedHighWater(H,P,l,q^-)\right)
\]

\[
NewCreditableRealValue(H,P,q)
=
\sum_{l\in ActiveLineages(P,q)}CreditDelta(H,P,l,q)
\]

ここでHはassetの公開者であることを要求しない。creator Hが親forum Pで正当に参加し、対象checkpoint qにおいてdepthおよびAssetScoreの計算対象であることを要求する。active assetの削除、inactive化、またはvalue低下は負のlotを生まず、既に確定したorigin lotのbudgetを遡及して減らさない。

この規則では、同一lineageのvalueが100から0へ下がり、その後100へ戻っても、新しいcreditは0である。過去にcredit済みの水準への回復は、新しい創設能力ではない。

過去credit高水位が100であるとき、valueが150へ上がれば、高水位を厳密に超える50だけが新しいcreditになる。その後valueが100へ下がり、140へ回復しても、過去credit高水位150を超えないため、新しいcreditは0である。さらに151へ上がった場合だけ、150を厳密に超える1が新しいcreditになる。

したがって、assetの一時的な停止、再有効化、value低下、または既credit水準への回復ではseedを複製できない。各asset lineageについて、過去credit高水位を更新する新記録のvalue増分だけが、新しい創設能力になる。

origin lot作成時のcreatorの成熟係数は、対象checkpoint qに固定して次で定義する。

\[
RealbaseFactor(H,P,q)
=
1-e^{-\kappa_1 proximity_{eff}(H,P,q)}
\]

\[
RealbaseIncrement(o)
=
NewCreditableRealValue(H,P,q)
\cdot RealbaseFactor(H,P,q)
\]

origin lot `o` は、creator、parent forum、対象parent payload hash、対象checkpoint時刻、credit ledgerの前後root、lineageごとのcredit差分、`NewCreditableRealValue`、`RealbaseFactor`、および`RealbaseIncrement`を一意に束縛する。`NewCreditableRealValue=0`の場合、origin lotを作成してはならない。

lotを作成したとき、各lineageのcredit済み高水位は次で更新する。

\[
CreditedHighWater(H,P,l,q)
=
\max\left(CreditedHighWater(H,P,l,q^-),v_l(q)\right)
\]

lotを作成しないcheckpointはcredit ledgerを変更しない。したがって、時間経過、Q増加、depth上昇、EarlyBonus、CultivationBonus、CitationBonus、A_seed、既存lotの未使用残高だけでは、新しいorigin lotは生まれない。

`CreditedHighWater(H,P,l,q)`は、同一のcreator・parent forum・asset lineageについてcheckpointの進行に対して単調非減少でなければならない。

`v_l(q)`が低下、0化、inactive化または削除された場合でも、既存origin lot、既存`SeedAllocation`、およびchild forumの`A_seed`を遡及して減額、失効または取消してはならない。

`A_seed`は親forumにおけるassetの現在価値を表す残高ではない。これは、過去に成立したrecord-breakingな実asset価値増分を根拠とする、一回限りで不変の創設seedである。

lotごとの配分予算は、そのlotが生む実アセット由来基礎アクセスの増分だけから次で作る。

\[
Budget(o)=\eta\cdot RealbaseIncrement(o)
\qquad 0<\eta<1
\]

この規則の目的は、親forumで実アセット価値が過去credit高値を超えて増える行為には新しい創設能力を与えつつ、同じ親実績、assetの再有効化、bonus、既存seedをchild forumの数だけ複製する近道を防ぐことである。

`SeedAllocation`は、未使用のorigin lotを特定child forumへ配分する不変オブジェクトである。少なくとも次をcanonicalに含む。

```text
origin_lot_id
origin_creator_pubkey
origin_parent_forum_id
origin_parent_payload_hash
origin_parent_checkpoint_time
credit_ledger_pre_root
credit_ledger_post_root
credited_lineage_deltas_sorted
new_creditable_real_value
realbase_factor
realbase_increment
budget_amount
child_forum_id
child_genesis_ref
allocated_amount
previous_origin_allocation_hash
allocation_sequence
signature
```

`credited_lineage_deltas_sorted`の各要素は、少なくとも次をcanonicalに含む。

```text
asset_lineage_id
active_asset_version_hash
value_at_target
credited_high_water_before
credit_delta
credited_high_water_after
```

`SeedAllocation`に含まれるorigin lot関連fieldは、参照するorigin lot objectの同名fieldとbyte単位で一致しなければならない。origin lot実体、credit ledgerの前後状態、対象checkpoint、asset registry proof、asset version chain、またはlineageごとのcredit差分明細のいずれかが欠ける場合、検証器は`MissingObject`として拒否する。

`allocated_amount`は非負有限の正規化済み有理数であり、同一origin lotのallocation sequenceは0から始まる連続整数である。`SeedAllocation`は通常証明書ではない。Q、depth、CanIssue、CanIssueTo、EarlyBonus、CultivationBonus、CitationBonus、PaymentReceiptの入力にならない。

origin lot oについて、checkpoint qにおける既確定allocationの集合を`Allocations(o,q)`とする。未使用残高は次である。

\[
Unspent(o,q)=Budget(o)-\sum_{a\in Allocations(o,q)}allocated\_amount(a)
\]

すべての有効origin lotは、常に次を満たさなければならない。

\[
0\le Unspent(o,q)
\]

新しいallocation aは、親forum Pの`seed_allocation_registry_root`に含まれる直前の連続状態に対して、次を満たす場合だけ有効である。

\[
0<allocated\_amount(a)\le Unspent(o,q)
\]

同じorigin lotを二つのchild genesisへ二重に使うこと、allocation sequenceを飛ばすこと、同じsequenceで競合するallocationを受け入れることは、同一の受理済みparent payload chain内ではすべて無効である。前者は`SeedBudgetExceeded`、sequence不連続は`InvalidSeedAllocationSequence`、観測済み競合は`EquivocatedSeedAllocation`として拒否する。

`single_writer_hash_chain_v1`は、提示されたpayload chainの内部整合性と観測済み競合だけを扱う。このため、未提示forkを含むネットワーク全体におけるallocationの一意性またはBFT finalityは保証しない。`SeedAllocation`のbudget一意消費は、検証者が受理した単一のparent payload hash chain内でのみ保証される。globalな一意消費を要件とする用途は、別途より強いfinality anchorを要求しなければならない。

#### 7.9.2 child forumのA_seed

child forum Cの創設シードは、Cを明示的に対象とする有効な`SeedAllocation`だけから作る。

\[
A_{seed}(C)=
\min\left(
seed\_cap_C,
\sum_{a\in SeedAllocations(C)}allocated\_amount(a)
\right)
\]

`SeedAllocations(C)`の各allocationは、child genesisより厳密に前の親checkpointに基づくorigin lotを参照し、parent forum、creator、child forum、child genesis hash、allocation sequence、Merkle inclusion proofを一致させなければならない。child genesisは各allocationについて、origin lot id、origin creator public key、parent forum_id、origin basis payload hash、origin basis checkpoint time、origin parent payload hash、origin parent checkpoint time、asset delta hashes、`NewCreditableRealValue`、`RealbaseFactor`、`RealbaseIncrement`、budget amount、allocated amount、allocation hash、η、seed_cap、最終A_seedをcanonicalに含めなければならない。child genesisに含まれるorigin lot関連fieldは、当該`SeedAllocation`および参照origin lot objectの同名fieldとbyte単位で一致しなければならない。

親なしforumでは`A_seed=0`かつ`seed_cap=0`に固定する。親ありforumでは少なくとも一つの有効`SeedAllocation`を持つ場合にのみ正のA_seedを持てる。常に次が成立する。

\[
0\le A_{seed}(C)\le seed\_cap_C
\]

A_seedはchild genesis作成時に一回だけ固定される。親forumの資産、証明書、参加状態、score、origin lotの後発allocationが変化しても、既に作られたchild forumのA_seedは変化しない。

#### 7.9.3 保存則と反増幅性

同一origin lot oから生まれたchild forum群のseed総量は、budgetを超えない。

\[
\sum_{a\in Allocations(o,q)}allocated\_amount(a)
\le Budget(o)
\]

child群でcreatorがrootとして得る通常base scoreの、cross-forum減衰合計への寄与を考える。各childへのallocationを大きい順に`x_{(i)}`とし、rootでの変換係数を

\[
\alpha=1-e^{-\kappa_1}
\]

とする。この減衰に用いる\(\rho(t^*)\)は、第7.8節で定義するcross-forum割引係数そのものであり、Gaia全体で一意な`GaiaAssetAccessPolicy`が定め、forumごとに異ならない。\(\kappa_1\ge0\)なので\(0\le\alpha<1\)、また\(0<\rho(t^*)<1\)なので\(0<\rho(t^*)^{i-1}\le1\)である。したがって、同一origin lotだけから生じるchild群のbase score寄与 V は、常に次を満たす。

\[
V
=
\sum_i\rho(t^*)^{i-1}\alpha x_{(i)}
\le
\alpha\sum_i x_{(i)}
\le
\alpha Budget(o)
< Budget(o)
\]

つまり、同じ親実績を100個のchild forumに分けても、そのorigin lotが生むcross-forumの通常base scoreは、lotの有限budgetを超えない。forum数を増やすだけでは新しいseedも新しい実アセット由来価値も生まれない。

origin lotのallocationをさらに孫forumへ移すことは認めない。child forumが後に実アセットを作った場合だけ、そのchild自身の`A_real`増分から、childをparentとする**新しい別origin lot**が生じ得る。親から受け取ったA_seed、allocation残高、EarlyBonus、CultivationBonus、CitationBonusは、その新lotの入力にならない。これにより、lotはchild genesisで消費され、世代をまたぐ再配分・複製経路を持たない。

#### 7.9.4 多親化の局所利得

`Parents(C)`はforum_idの重複を許さない集合である。同じ親forumを複数回登録して同じorigin lotを重複配分することはできない。

未使用の正のorigin budgetを持つ相異なる親forumを追加し、そのallocationが正であり、seed_capに達していなければ、A_seedは厳密に増加する。

\[
allocated\_amount(a)>0
\land A_{seed}(C)<seed\_cap_C
\Rightarrow
\Delta A_{seed}(C)>0
\]

すでに使い切ったorigin lot、実アセットを持たない親、またはseed_cap到達後の親追加はseedを増やさない。これは欠陥ではない。多親化の報酬を、親の名前を並べることではなく、複数の親で実アセット由来の新しい実績を作ることへ結び付けるためである。

この変更は、空forumの先駆者枠、引用、既存の創設シードを使い回して世代をまたぐ創設シードを増幅することを防ぐ。さらに、同じ親forumの同じ実アセット由来scoreを、多数の別child forumへ反復コピーして`AssetAccess_direct`を増やすことも防ぐ。

### 7.10 被引用ボーナス

親ありforumを作ると、系譜の各世代でforum創設を支えた発行者へ引用証明書を自動発行する。直接の親関係は`lineage_weight=0`、その一世代前は1、とする。

引用の生のボーナスは次である。創設シードと同様に、ここでも実アセット由来の`AssetScore_{realbase}`だけを使う。`\mu_{entry}`は定義されていない引数であるため、採用しない。

同一のchild forum、同一の親forum、同一の支援者を重複して数えないため、citationの一意キーを次で定める。

\[
CitationKey(c)=
(child\_forum\_id(c),cited\_parent\_forum\_id(c),subject\_pubkey(c))
\]

`ValidCitationCertificates(H,t^*)`は、`subject_pubkey=H`であり、`CitationKey`が相異なり、各citationが対応する参照forumの選択済み確定payloadの有限な`citation_registry_root`にinclusion proofで含まれ、かつ当該評価時刻で有効なcitationだけからなる有限集合である。

\[
CitationRaw(H,t^*)=
\delta\sum_{c\in ValidCitationCertificates(H,t^*)}
\lambda^{lineage\_weight(c)}
AssetScore_{realbase}(H,forum(c),t_{forum(c)}^*)
\]

ここで\(0<\lambda<1\)であり、遠い祖先ほど小さくなる。各参照forumの評価時刻` t_{forum(c)}^* `は第7.8節の決定論的な選択規則による。引用だけで実績を代替できないよう、上限を置く。

\[
CitationBonus(H,t^*)=
\min\left(CitationRaw(H,t^*),\kappa\cdot AssetAccess_{direct}^{cap}(H,t^*)\right)
\]

上限計算に用いる\(AssetAccess_{direct}^{cap}\)は、公開由来寄与及びインフラ寄与を除外した`AssetScore`から計算する。その入力は、第7.6節の既存3項を`A_max`で上限した値である。

\[
AssetScore^{cap}(node,F,t)=
\min\left(
A_{max}(F,t),\
AssetScore_{base}(node,F,t)+EarlyBonus(node,F,t)+CultivationBonus(node,F,t)
\right)
\]

\[
AssetAccess_{direct}^{cap}(node,t^*)=
\sum_{i=1}^{n}\rho(t^*)^{i-1}AssetScore^{cap}_{(i)}(node,F_i,t_{F_i}^*)
\]

これにより次が成り立たなければならない。

- `PublicationScore` 及び `InfrastructureAdjustment` は、`CitationBonus`の上限計算\(\kappa\cdot AssetAccess_{direct}^{cap}\)の入力になってはならない。
- `PublicationScore`又は`InfrastructureAdjustment`を増やしても、`CitationBonus`の上限\(\kappa\cdot AssetAccess_{direct}^{cap}\)は変化しない。この非干渉条件は、公開の寄与が引用の上限を経由して既存のcitationの意味論とcapを押し上げる経路を閉じる（第7.21.5節）。
- `AssetAccess_{direct}^{cap}`は上限計算専用の入力である。`AssetAccess_{total}`の第1項に用いる`AssetAccess_{direct}`は、`PublicationScore`と`InfrastructureAdjustment`を含む5項の`AssetScore`から計算する。両者を同一の値として扱ってはならない。
- 第7.21.5節及び第24.15節の非干渉リストは、`AssetAccess_{total}`と`CitationBonus`の上限を、互いに独立な項目として列挙しなければならない。

各評価で参照するregistryは有限Merkle集合であり、`chain_depth`も有限である。したがってCitationRawは任意の評価時刻で有限和である。λ<1は世代方向の減衰を与えるが、citation件数自体の有限性はregistryと検証バンドルの有限性によって保証する。

最終的なアセットアクセスは次である。

\[
AssetAccess_{total}(H,t^*)=
AssetAccess_{direct}(H,t^*)+CitationBonus(H,t^*)
\]

`CitationCertificates(H)`の完全性は、各参照forumの`citation_registry_root`により保証する。個別citation証明書は、当該rootに対するinclusion proofと共に提示する。多親化によって支援者の系譜が豊かになるほど、`CitationRaw`に加算される相異なるcitationが増える機会も増えるため、これも「多親化したくなる力学」を補強する。

citation及び創設seedについて、次を明記する。

- 過去のchild forum創設、citation、親forum貢献、asset lineage creditに由来するCitationBonus又は`A_seed`は、譲渡前controllerの歴史的貢献として残る。
- Soul Transfer後、successor controllerは過去controllerのcitation由来の人格的価値を新forum創設やseed計算に使用してはならない。
- Forum Root Successionはforumの過去citation・seed・asset lineage historyを消さないが、後継root controller個人の創設能力・信用・seedとして再帰属させない。

### 7.11 八つの力学の一覧

| 望む行動 | 本人が得るもの | 数理上の理由 |
|---|---|---|
| 浅いdepthへ進む | forum内アクセスと認定可能範囲 | proximityが増える |
| 新forumを作る | rootとしてのアクセス、実アセット由来の創設シード | depth=0、A_seed |
| 多forumに参加する | アクセス可能なアセット空間の増加 | AssetAccess_directの項が増える |
| 多親化する | より良い創設シード、祖先への引用 | A_seed、CitationBonus |
| 積極的に発行する | 育成実績ボーナス、利用者・販売機会、返礼による関係記録 | CultivationBonus、community、reciprocal、Revenue |
| eKYCを完了してCivicCitizenとして公共層に参加する | Civic Voteの正規市民票、確定CivicNeedAssetの供給資格、CivicCandidates・CivicReachへの参加 | CivicInfluence=v²、V_F固定、Wild Signal全体正規化、NeedScore集計（第23章） |
| 他者のアセット・公開カタログ・検索indexを安全に保存・配布・検索可能にし続ける | 実証済みのネットワーク供給によるAssetScore・Reach等への上限付き・epoch限定の補正 | Resource Contribution Score（receipt・audit・proof検証済みの実寄与のみ、第7.19節） |
| アセットを作成・公開し、継続利用可能に保つ | 検証済み実効価値によるAssetScore・CitationBonus・CultivationBonus等への寄与（量産中立な集計と係数和の上限。第7.21節） | `PublicationBaseScore`（公開の事実そのもの）と`PublicationUtilityScore`（独立利用・可用性・引用・派生・Need充足）、基準量は当該アセットの認定価値。Qdepth等は不変 |

上の表の第1〜第5行はアセット層の力学、第6行は公共層の市民化の力学、第7行はネットワーク資源提供（支える）の力学、第8行はアセット公開の力学である。先駆者利益・育成実績は第1〜第5のアセット層の力学を置き換えず、市民的影響も第6の市民化の力学を置き換えず、資源提供の補正も第7の支えの力学を置き換えず、公開実効価値の補正も第8のアセット公開の力学を置き換えない。実アセット、一般関係、成熟度を作る者だけがネットワーク全体へ持ち出せる価値を増やす。

### 7.12 アセット利用と価格

アセット公開者は、アセットごとに必要アクセス点数の閾値と0以上の価格を設定する。利用者は両方を満たしたときだけ利用できる。

\(threshold(a,F)\)は**絶対値**であり、`AssetScore`と同一の単位（forumの`value`単位）で表す。比率形又はbasis point形では表さない。`AssetRecord.required_access_threshold`のフィールド名・型・意味は変更しない。\(threshold(a,F)=0\)は、`AssetScore`による利用制限なしを意味する。`A_max(F,t)=0`のforumでも`AssetScore=0\ge0`により制限なしが成立する。\(threshold(a,F)\)は非負の正規化済み有理数であり、上限を設けない。現在の`A_max`を超える閾値は、候補集合を空にする公開者の正当な選択である。閾値判定は、除算・浮動小数点を用いず、既約有理数の厳密比較で行う。

高い閾値は利用者数を減らすが、成熟した利用者からの返礼を得やすい。低い閾値は利用者数を増やすが、返礼の質は下がり得る。価格も高すぎれば需要を失い、低すぎれば単価を失う。

\[
Revenue(price,threshold)=price\times Demand(price,threshold)
\]

GaiaはDemandそのものを決めない。市場参加者が選ぶ。しかし価格、閾値、返礼、アセットアクセスを一つの利用体験に結ぶことで、公開者には極端を避ける動機が生まれる。育成実績によってAssetScoreを増やした発行者は、より高い閾値のアセットにも自らアクセスできるようになり、かつ自らが育成した相手が将来の利用者・購入者になり得るという、経済的な得にもつながる経路を持つ。

### 7.13 購入候補集合とAudienceIndex

**何を測るか**: あるアセットについて、利用条件を満たし、まだそのアセットへのアクセス許可を受けていないノードの集合を測る。これは、第1〜第5のアセット層の力学によって得られたAssetScoreを、実際に市場でどれだけの相手に訴求できるかへ接続するための指標である。

アセット\(a\)がforum \(F\)に公開されているとき、checkpoint_time \(t_{state}\)における**購入候補集合**を次で定義する。

\[
Candidates(a,F,t_{state})
=
\{
S
\mid
S\in ActiveMembers(F,t_{state}),\
ActiveMember(S,F,t_{state}),\
S\ne publisher(a),\
AssetScore(S,F,t_{state})\ge threshold(a,F),\
\lnot Granted(S,a,t_{state})
\}
\]

- `ActiveMembers(F,t_state)`: 当該checkpointの`membership_root`が固定する、その時点の参加者集合
- `ActiveMember(S,F,t_state)`: 第13.2節の述語。`ActiveMembers`のうち現在の有効参加者だけを表す。健康を確認できない身体及び`EkycMembershipEligible`を満たさないSoulは候補集合から除外する
- `threshold(a,F)`: 公開者がアセット\(a\)についてforum \(F\)で設定した必要アクセス点数。閾値判定は、`MeetsAssetAccessThreshold(S,a,F,t_{state}) \iff AssetScore(S,F,t_{state}) \ge threshold(a,F)`という述語で表す
- `Granted(S,a,t_state)`: Sが既にそのアセットの`AssetAccessGrant`を持つか

候補人数は次である。

\[
Reach(a,F,t_{state})=|Candidates(a,F,t_{state})|
\]

`TargetForums(a)`は、アセット\(a\)が公開されているforumの添字集合である。\(a\)について評価時点で有効な公開先を持つforumだけを含み、同一forumを重複して含まず、公開されていないforumを含まない。公開者が同一アセットを複数forumに公開している場合、forumをまたいで同じノードが重複して数えられ得る。ここで二つの指標を区別する。

\[
Reach_{upper}(a)=
\sum_{F\in TargetForums(a)}
Reach(a,F,t_{state}^{F})
\]

\[
Reach_{exact}(a)=
\left|
\bigcup_{F\in TargetForums(a)}
Candidates(a,F,t_{state}^{F})
\right|
\]

forumごとの合計は、常に重複除去した和集合の大きさ以上になる。

\[
Reach_{exact}(a)\le Reach_{upper}(a)
\]

これは、複数の集合の要素数の合計が、その和集合の要素数以上になるという、集合演算として常に成り立つ性質である。`Reach_upper`は個々のノードを開示せずに軽量に計算できる見積り、`Reach_exact`は重複を除いた正確な値である。

個々の候補者名を開示せずに人数だけを証明するには、「閾値以上」であることだけでなく、公開者本人でないことと、まだアクセス許可を持たないことも同じ索引に反映しなければならない。そこで、従来の`AudienceIndex`を適格到達人数のための索引として残し、購入候補人数にはassetごとの**CandidateIndex**を使う。

`AudienceIndex(F)`は、checkpoint_time時点における各**有効参加者**の`AssetScore(S,F)`を値でソートしたMerkle木であり、各内部nodeが部分木に含まれる件数を保持する。母集団は`ActiveMembers(F,t_{state})`のうち`ActiveMember(S,F,t_{state})`を満たすSoulだけであり、`Candidates`の母集団と一致しなければならない。健康を確認できない身体及び`EkycMembershipEligible`を満たさないSoulは、第13.2節により`AssetScore`の計算から除外されるため、`AudienceIndex`へ含めてはならない。`AudienceIndex`と`CandidateIndex`の母集団が異なる実装は、`Reach_eligible`と`Reach`の単調性の主張（本節）を破る。

```text
AudienceIndex(F)
├── ソート済みleaf: (AssetScore, subject_pubkey)
└── 各内部node: subtree_count
```

`AudienceIndex`から得る値は、公開者自身と既許可者をまだ除かない**適格到達人数**の母数である。公開者自身の除外は下式の`Reach_eligible`で行い、既許可者は`AudienceIndex`からも`Reach_eligible`からも除かない。

\[
Reach_{eligible}(a,F,t_{state})
=
\mathrm{RangeCount}(audience\_index\_root,\ \ge threshold(a,F))
-\mathbf{1}[AssetScore(publisher(a),F,t_{state})\ge threshold(a,F)]
\]

一方、`CandidateIndex(a,F)`は、checkpoint_timeにおける`Candidates(a,F,t_state)`の各nodeだけを含むassetごとのMerkle order-statistics木である。leafは`(AssetScore, subject_pubkey)`、内部nodeは`subtree_count`を持つ。ここでの候補条件は、`S \in ActiveMembers(F,t_{state})`、`ActiveMember(S,F,t_{state})`、公開者除外、閾値到達、`not Granted`をすべて含む（第13.10節の正規集合式と一致する）。`ActiveMembers`（複数形のコミット済み集合）と`ActiveMember`（単数形の有効参加述語）は別の条件であり、両方を要求する。

```text
CandidateIndex(a, F)
├── ソート済みleaf: (AssetScore, subject_pubkey)
│   ただし subject は Candidates(a,F,t_state) に属する
└── 各内部node: subtree_count
```

`ForumStateCheckpoint`は、asset record hashから`CandidateIndexRoot`へのMerkle mapである`candidate_index_registry_root`を持つ。これにより、特定assetについて候補者を列挙せずに、候補人数だけを検証できる。

\[
Reach(a,F,t_{state})
=
\mathrm{Count}(CandidateIndex(a,F,t_{state}))
=|Candidates(a,F,t_{state})|
\]

`AudienceIndex`の`RangeCount`は閾値に対して単調非増加であり、常に0以上、当該時点の有効参加者数（`ActiveMember`を満たすSoulの数）以下である。`CandidateIndex`の`Count`も常に0以上、同じ有効参加者数以下である。ただし`Granted`の発行、失効、asset閾値の変更、公開者変更を許す場合には`Reach`が変化し得るため、`Reach`そのものについて「AssetScoreが増えれば必ず減少しない」とは主張しない。固定されたasset定義とgrant状態の下では、ある参加者のAssetScoreが増える、または新規参加者が閾値以上のAssetScoreを持って加わることは、`Reach_eligible`と`Reach`を減少させない。

閾値は既存の絶対値のまま維持する。`MeetsAssetAccessThreshold`、`Candidates`、`AudienceIndex`、`CandidateIndex`、`Reach`、`Reach_eligible`、`CivicCandidates`、`CivicReach`、Marketing Frontier、LocalActionRecommendation及び関連するschema・proof・test vectorは、比率形へ変更しない。

比率形（`required_access_score_ratio_bps`）を導入してはならない。`EarlyBonus`は`L_F`、`CultivationBonus`は`L_c`という`A_max`比例でない絶対上限を持つため、比率形では`A_max`の増加だけで既存参加者が候補から脱落する。これは上記の「固定されたasset定義とgrant状態の下では、ある参加者のAssetScoreが増える、または新規参加者が閾値以上のAssetScoreを持って加わることは、`Reach_eligible`と`Reach`を減少させない」という不変条件の反例になる。例: `L_c`飽和下で`AssetScore=50`、`A_max=100`の参加者が比率5000で丁度適格であるとき、他者のアセット登録により`A_max=200`になると、浅さの項は比例して増えるが育成の項は`L_c`飽和のままであり、比率が5000を下回って当該参加者は不適格へ転落する。

絶対閾値は、forumの`A_max`の成長に対して相対的な厳しさを自動調整しない。これは意図した性質である。同一のアセットは、forumの大小にかかわらず同一の利用条件を持つ。forumが豊かになり全員の`AssetScore`が上昇すると、同じ閾値は満たしやすくなる。公開者が相対的な厳しさを維持したい場合は、第7.9.1節の規則に従い`AssetRecord`の新versionを発行して\(threshold(a,F)\)を引き上げる。

`Candidates`、`Reach`、`Reach_eligible`、`AudienceIndex`、`CandidateIndex`は、いずれも第10章で定義する告知・有料ブースト・PressRoomの存在によって値が変わることはない。これらは、AssetScore、`ActiveMembers`、`ActiveMember`述語、Granted状態、asset定義だけを入力とする関数であり、告知や決済のオブジェクトを入力に持たない。

`Reach`は現在の購入候補人数である。Reachを、配送済み人数、閲覧人数、購入人数、将来収益、評判、需要の保証として解釈してはならない。第12章のレコメンドは、Reachを表示する場合でも`currently has N eligible candidates`のように候補性を明示しなければならない。

CandidatesとReachは既存のアセット市場計算に従うが、譲渡で市場アクセスを買わせない。

- successor controllerが譲渡前Soulの通常AssetScoreを継承しない以上、譲渡前scoreのみを根拠にCandidate又はReachの資格を得てはならない。
- 既存の購入済み`ContentAccessGrant`は、agreementの`transfer_scope`で明示し、コンテンツ提供者のライセンス条件が譲渡を許す場合だけ承継可能とする。
- 個人的・非譲渡のアクセス権、early access、PressRoom membership、招待権、Civic供給資格は原則失効又は旧controllerに留保し、譲渡対象に含めない。

#### CivicCandidatesとCivicReach

市民NeedAssetは、通常アセット市場を置換しない。通常アセットの`Candidates(a,F,t)`および`Reach(a,F,t)`は既存定義のままとする。

`AssetRecord.civic_need_ref`が存在するアセットだけについて、公共需要に応答する市民市場の候補集合を次で定義する。

\[
CivicCandidates(a,F,t)=
\left\{
S\in Candidates(a,F,t)
\mid CivicCitizen(S,F,t)
\right\}
\]

\[
CivicReach(a,F,t)=|CivicCandidates(a,F,t)|
\]

`CivicCandidates`の計算において、`Candidates(a,F,t)`は既存の通常`AssetScore`、通常`ActiveMembers`、通常`ActiveMember`述語、既存grant状態および既存閾値だけから計算する（第13.10節の正規集合式）。eKYCはこれらへ直接作用してはならない。`verified_required`のforumにおける`ActiveMember`述語（第4.2節、第13.2節）を通じたforum参加境界のpathを除き、eKYCは通常`AssetScore`または通常`Candidates`を変えない（第24.19節）。

CivicCitizenでないSoulは通常`Candidates`に含まれ得るが、`CivicCandidates`には含まれない。したがって、未確認Soulを量産しても、CivicReach、市民NeedAssetの購入候補数、または市民NeedAssetの責任付き市場規模を増やすことはできない。

`CivicCandidates`と`CivicReach`のclaimは、通常candidate proofに加えて、各候補SoulのCivicCitizen proofを必要とする。プライバシー最小化のため、CivicReachの上限や集合濃度の証明では、個々のcredential内容を不要に開示してはならず、CivicCitizen predicateを満たすことだけを検証可能にすべきである（第23章）。

### 7.14 incentive_compatible_profile

通常forumは、実験、非経済的な共同体、または特定の力学を無効にした用途のため、柔軟な係数範囲を使ってよい。その場合、forumは第1〜第5のアセット層の力学が所定回数まで有効だという証明済み主張をしてはならない。

`incentive_compatible_profile`をgenesisに含めるforumは、次の有限目標と費用上限を正規化済み整数または有理数で固定する。

```text
version
q_incentive_start_depth
q_target
cultivation_target
parent_target
forum_target
depth_target
score_headroom
min_q_gain
min_depth_gain
min_parent_gain
min_forum_gain
min_cultivation_gain
declared_q_cost
declared_depth_cost
declared_found_cost
declared_parent_cost
declared_forum_cost
declared_issue_cost
declared_cross_forum_discount_ratio
viable_child_asset_floor
parent_realbase_floor
parent_unspent_budget_floor
forum_score_floor
simulation_profile_id
simulation_epoch_count
simulation_seed_set_hash
```

`score_headroom`は、C4の`A_max`比例係数和の上限に対して残る係数予算をbasis pointで表す値である。当該forumの係数を次で定義し、宣言値がそれと厳密に一致することを要求する。

\[
score\_headroom
=
10000
-\left(
10000\cdot(1-e^{-\kappa_1})
+publication\_base\_bps
+\sum_k \mathrm{utility\_weight\_bps}(k)
+10000\cdot\gamma_F
+10000\cdot\chi
+asset\_mediated\_cultivation\_extension\_cap\_bps
+I_{protocol\_max}
\right)
\]

profile validatorは`score_headroom > 0`を検査する。C4は係数和が厳密に10000 bps未満であることを要求するため、`score_headroom <= 0`となるprofileは`IncentiveProfileInvalid`として拒否する。`score_headroom`は将来の経路追加が使える余地を表す表示値であり、係数和の上限そのものを緩和しない。

このprofileを含むforumは少なくともβ>0、κ1>0、0<η<1、seed_cap>0、χ>0、k_c>0、L_c>0を満たす。citationについて活性報酬を主張する場合はδ>0、0<λ<1、0<κ<=1も満たす。`κ<=1`は、`CitationBonus = min(CitationRaw, κ·AssetAccess_{direct}^{cap})`（第7.10節）の上限が、上限計算の入力である`AssetAccess_{direct}^{cap}`を超えないことを保証する。これにより引用だけで実績を代替できないという上限の目的が、任意の`A_max`・任意の`AssetAccess_{direct}`について成立する。

validatorが用いる\(\rho\)は、当該profileを宣言した時点で有効であった`GaiaAssetAccessPolicy`の`cross_forum_discount_ratio`を凍結した値である。凍結値はgenesisのprofile宣言に`declared_cross_forum_discount_ratio`としてcanonicalに含める。既存genesisがこのフィールドを省略している場合は、当該profile宣言時点で有効なpolicyの値として解釈し、genesisを再ハッシュしない（C6）。

`ValidGaiaAssetAccessPolicy`及びpolicy version chainは、`declared_cross_forum_discount_ratio`を変更・再解釈してはならない。Owner thresholdのpolicy更新は将来の`AssetAccess_direct`の評価にのみ適用し、既に宣言された`incentive_compatible_profile`の適合性を変化させてはならない。\(\rho\)が引き下げられたときに、当該forumが何も操作していないのにprofileが不適合になることを防ぐためである。これは第2.4節の「genesisはforumの憲法であり、作成後に書き換えられない」と整合する。

profileを含むforumは、`A_max`比例で加算される全経路の係数和の上限も満たさなければならない（C4）。

\[
10000\cdot(1-e^{-\kappa_1})
+publication\_base\_bps
+\sum_k \mathrm{utility\_weight\_bps}(k)
+10000\cdot\gamma_F
+10000\cdot\chi
+asset\_mediated\_cultivation\_extension\_cap\_bps
+I_{protocol\_max}
<10000
\]

ここで`publication_base_bps`及び6つの`*_weight_bps`は、当該forumの`AssetPublicationIncentivePolicy`が定める公開経路の係数である。この係数和の上限を満たさないprofileは無効である。

profile validatorは、gaia-coreが固定する有限audit gridに対して次を検査する。

\[
\Delta AssetScore_Q-declared\_q\_cost\ge min\_q\_gain
\]

これは`q_incentive_start_depth`から`depth_target`までの非root・非飽和状態で、Qを一つ増やしたときに検査する。

\[
\Delta AssetScore_{depth}-declared\_depth\_cost\ge min\_depth\_gain
\]

これは指定depth範囲で一段浅くなったときに検査する。

\[
\Delta A_{seed}-declared\_parent\_cost\ge min\_parent\_gain
\]

これは`parent_realbase_floor`以上の新しい実アセット由来origin lotと、`parent_unspent_budget_floor`以上の未使用budgetを持つ相異なる親寄与を`parent_target`件まで加え、seed_cap到達前で検査する。過去childへのallocationで使い切ったorigin lotは、この局所利得の根拠に使えない。

\[
declared\_cross\_forum\_discount\_ratio^{forum\_target-1}\cdot forum\_score\_floor
-declared\_forum\_cost\ge min\_forum\_gain
\]

これは`forum_target`番目の最低限有効なforum参加について検査する。減衰係数には、当該profileの凍結値`declared_cross_forum_discount_ratio`を用いる。したがってこの検査結果は、Owner thresholdによる`GaiaAssetAccessPolicy`の更新によって変化しない。

\[
\Delta CultivationBonus+MaturityBond-declared\_issue\_cost
\ge min\_cultivation\_gain
\]

これは独立成熟者を`cultivation_target`人まで増やしたときに検査する。bondを用いないforumはMaturityBondを0として評価し、発行の金銭的な下限報酬を表示してはならない。

創設については、次を満たすviable child asset floorを要求する。

\[
viable\_child\_asset\_floor(1-e^{-\kappa_1})
-declared\_found\_cost>0

かつ、child genesisに使う相異なるorigin lotの未使用配分額の和が`viable_child_asset_floor`以上であること
\]

指数関数を含む比較は第7.7節の決定論的区間評価を使う。比較不能ならprofileは無効である。

このprofileは、現実世界で全員が利益を得ること、需要が存在すること、全行動が常に得であることを意味しない。指定された費用上限、目標回数、asset floor、相手の存在、非飽和状態という範囲で、各力学に正の局所機会が残ることを確認する。

### 7.15 生態学的simulation evidence

実世界の需要、資産品質、人間の選択、AIの戦略、協力、競争を完全に証明することはできない。Gaiaはこれを隠さず、証明書の正当性と別に、再現可能なsimulation evidenceを扱う。

`simulation_profile_id`は、gaia-coreが固定する有限のsimulation familyを識別する。familyは少なくともnode数、forum数、初期depth/Q/asset分布、asset流入、member流入、親候補、発行候補、需要、費用、承認、独立成熟、origin lot生成、SeedAllocationの消費、同一originを多数childへ複製しようとする攻撃ケース、epoch数、乱数seed集合、目的ベクトル、Pareto優越規則を定める。

`EcologicalViabilityReport`はsimulation input hash、evaluator version、seed set hash、集計結果を含む。reportが主張できるのは次だけである。

> 宣言されたsimulation familyとseed集合の下で、第1〜第5のアセット層の行動のそれぞれに到達可能な正の機会領域が存在し、禁止されたshortcutが正のprotocol-only自己増幅loopを作らず、単一行動が全監査状態で支配戦略ではなかった。第6の市民化・第7の資源提供の力学は、このsimulation familyの対象外である。

reportは現実の利益、需要、参加、勝利を保証してはならない。simulation evidenceは証明書、Q、depth、権利、価格、決済の有効性を変更しない。

### 7.16 金銭と信頼の隔離、健康ゲート

この章で扱うAssetScore、A_seed、CultivationBonus、CitationBonus、Candidates、Reachは、forum内の信頼と市場の計算である。これらは、誰かが「お金を払った」「有償の契約を結んだ」「eKYCで高い資格を得た」という事実だけでは増えない。

具体的には、次のものはQ、depth、CanIssue、CanIssueTo、AssetScore、A_seed、EarlyBonus、CultivationBonus、CitationBonus、PublicationScore、InfrastructureAdjustment、AssetAccess_total、Candidates、Reach、およびForumStateCheckpoint最終性の入力になってはならない。

- `PaymentReceipt`（支払い済みの事実）
- `PaymentSettlement`、`PayoutEntitlement`、`PayoutClaimRequest`、`BeneficiaryTransferRecord`、`BeneficiaryPayoutReceipt`、`RefundSettlement`、`PayoutRecoveryAction`、`GaiaServiceCreditGrant`（第18章の清算・分配・期限失効・還元の状態）
- `ForumPoolContributionRecord`、`ForumRevenuePoolDistribution`、`ForumPoolUndistributedForfeiture`、Forum Revenue Poolの金額・受取（第7.17節の還元状態）
- `ServiceOffer`、`ServiceOrder`、`ServiceFulfillment`（第19章の共通commerce層の取引）
- Bankの売上、storage contract、返金・escrow
- eKYCの資格（tier）の高低
- provider payout、refund、chargeback、payout eligibilityの有無・金額

これにより、金銭によって成熟度・信用・発行権・創設能力（seed）・購入候補数を買う経路を作らない。この隔離は第19章と第24章で数理的不変条件として再掲する。

また、この章の値は、原則としてforumの現在参加者（`ActiveMembers`）だけを対象に計算する。健康を確認できない身体（`degraded`以下のhealth state）は現在の有効参加から除外されるため、AssetScore、Candidates、Reachなどの計算にも現れない。この除外はmembership履歴からの削除ではなく、健康を確認できない間の資格停止である（第1.2節、第13.2節、第14章）。

上記の非関与原則は、通常`Candidates`および通常`Reach`について維持される。本書が追加する`CivicCandidates`および`CivicReach`は、通常候補集合にCivicCitizen predicateを追加した別の公共市場指標であり、通常市場の定義変更ではない（第7.13節、第23章）。

eKYCは、Civic Vote、CivicNeedAsset供給資格、CivicCandidatesおよびCivicReach以外の数理入力になってはならない。ただし`membership_ekyc_policy=verified_required`のforumでは、`ActiveMember`述語（第4.2節、第13.2節）を通じたforum参加境界が`T_actual`、`Q`、`AssetScore`、CandidatesおよびReachに作用する。これはforum参加境界のpath制限付きの効果であり、係数・重み・閾値・bonus項がeKYC状態を直接読む経路ではない（第24.19節）。

Forum Revenue Pool（第7.17節）はcommerce層の状態であり、分配資格・ウェイトの成熟度入力として単一checkpoint時点の`depth`を読むが、`depth`そのものやQ、発行資格、AssetScore、A_seed、各bonus、Candidates、Reach等のprotocol値を変更しない。Forum Revenue Poolの金額、受取、`PayoutEntitlement`、Stripe payout、Service Creditは、本章の隔離対象に含まれる。

### 7.17 Forum Revenue Pool: depthに基づく取引還元

Forum Revenue Poolは、forum内の有償取引から発生する、当該forumの成熟参加者向け売上還元の仕組みである。forum創設者がgenesisで固定した率と深度分配規則に従い、対象取引から独立した還元原資が発生し、単一checkpoint時点で再計算される`depth`に応じて成熟参加者へ分配される。

**Gaia network maintenance feeとForum Revenue Pool contributionは、互いに独立した別建ての百分率控除である。** Forum Revenue Pool contributionの原資は、Gaia network maintenance feeの一部、再分配先、又は内部使途ではない。Gaia network maintenance feeはGaia全体の運営・決済・監査・セキュリティ・返金/chargeback準備・共通基盤のためにGaiaへ帰属する。Forum Revenue Pool contributionは、各forumのgenesisがあらかじめ固定する、当該forumの成熟参加者への還元原資として独立して発生する。ただし第7.17.7節により繰越期限を満了した未分配lotはGaia network maintenance feeへ帰属する。この帰属はcontributionの原資・率・分配式のいずれも変更しない。

Forum Revenue Poolは、`root_entry`の保有履歴を分配資格又は分配比率の入力にしない。分配資格と分配ウェイトの唯一の成熟度入力は、単一の`ForumStateCheckpoint`時点で再計算される`depth`である。

#### 7.17.1 独立した金額と保存則

対象forum Fに属する有効な有償取引 j について、Payment-Serviceは次の金額を独立して確定しなければならない。

| 記号 | 名称 | 帰属先 | 性質 |
|---|---|---|---|
| \(G_j\) | `gross_amount_minor` | Stripe決済の購入総額 | 購入者が支払う総額 |
| \(S_j\) | `stripe_fee_amount_minor` | Stripe | Stripeが実際に控除する外部決済手数料 |
| \(N_j\) | `gaia_network_maintenance_fee_minor` | Gaia全体 | Owner thresholdのグローバルscheduleにより確定するGaia維持手数料 |
| \(R_j\) | `forum_revenue_pool_contribution_minor` | 当該forum FのRevenue Pool | forum genesisにより固定される成熟参加者還元原資 |
| \(B_j\) | `beneficiary_pool_minor` | 販売者・サービス提供者等のBeneficiaryRule受取人 | 販売・提供の対価 |

Stripe控除後の正味額を次で定義する。

\[
Net_j=G_j-S_j
\]

Gaia維持手数料とForum Revenue Pool contributionは、同じ`Net_j`を基礎とするが、**互いに別個の料率に基づく並列控除**である。

\[
N_j=NetworkFeeSchedule(Net_j, currency_j)
\]

\[
R_j=ForumRevenuePoolPolicy_F(Net_j, currency_j)
\]

販売者・提供者受取人の合計は次である。

\[
B_j=Net_j-N_j-R_j
\]

必須の金額保存則:

\[
G_j=S_j+N_j+R_j+B_j
\]

次の計算は全て禁止する。

```text
ForumPool = GaiaNetworkFee × forumPoolRate
ForumPool = GaiaNetworkFee の内部配分
ForumPool = Gaia network reserveからの補助金
ForumPool = 販売後にGaia feeから任意に移す金額
ForumPool = root_entry保有者だけへの固定配当
```

正しい計算は常に次である。

```text
net_after_stripe = gross_amount - actual_stripe_fee

GaiaNetworkMaintenanceFee
  = GlobalOwnerFeeSchedule(net_after_stripe, currency)

ForumRevenuePoolContribution
  = ForumGenesisPoolRate(net_after_stripe)

SellerBeneficiaryPool
  = net_after_stripe
  - GaiaNetworkMaintenanceFee
  - ForumRevenuePoolContribution
```

#### 7.17.2 設定権限の分離

Gaia network maintenance feeは、`PaymentAuthoritySet`のOwner thresholdだけが発行・更新できるグローバル`GaiaNetworkFeeSchedule`（第18.6節）により設定する。

- 通貨別に設定する
- 金額帯別のラダーを持てる
- Stripe実費控除後の正味額に対する百分率及び固定額を持てる
- 更新は将来効であり、既存Order/PaymentReceipt/PaymentSettlementへ遡及適用しない
- Gaia全体へ帰属し、Forum Revenue Poolの原資にしてはならない

Forum Revenue Pool contributionは、forum創設者がchild genesis又は親なしgenesisの作成時に設定し、その後変更不能なforum固有の百分率である。

- 対象forumの`genesis`にのみ含める
- forum root、forum参加者、Payment-Service、Ownerのいずれも、genesis作成後に変更できない
- forum内の対象取引から発生する
- depthに応じた成熟参加者還元の原資、及び繰越期限を満了した未分配分のGaia network maintenance feeへの帰属（第7.17.7節）にのみ使う
- Gaia network maintenance feeと会計上・object上・計算上・政策上分離する。ただし第7.17.7節の期限切れ未分配分の帰属はこの分離の例外とする

権限の境界は次に固定する。

| 項目 | Owner threshold | forum root / genesis creator |
|---|---:|---:|
| Stripe固定Payment-Serviceの認可 | 可 | 不可 |
| Gaia維持手数料率・通貨別ラダー | 可 | 不可 |
| PayoutEntitlementの期限・失効・共通還元Policy | 可 | 不可 |
| forum Pool拠出率 | 不可 | genesis時だけ可 |
| Poolの対象depth帯 | 不可 | genesis時だけ可 |
| Poolのdepth分配曲線 | 不可 | genesis時だけ可 |
| Poolの分配epoch | 不可 | genesis時だけ可 |
| Poolの個人cap / forum生涯cap | 不可 | genesis時だけ可 |
| 既存forumのPool規則変更 | 不可 | 不可 |
| 個別販売のPool規則を後出し変更 | 不可 | 不可 |

OwnerがGaia全体の法定通貨受取債務、Stripe、失効、共通サービス還元を管理する一方、forum genesis creatorは、自分のforumが発生させるForum Revenue Poolの率・成熟分配方式を事前に選べる。

#### 7.17.3 genesisのforum_revenue_pool_policy

forum genesisには、次の`forum_revenue_pool_policy`を必須で含める。全forumは明示的に有効又は無効を宣言しなければならない。省略を許してはならない。

```text
ForumRevenuePoolPolicy {
  enabled: bool,

  contribution_rate_bps: u16,

  eligible_max_depth: u32,

  distribution_weight_rule:
    "eligible_depth_inverse_power_v1",

  depth_weight_exponent: u8,

  distribution_epoch: Tick,

  individual_epoch_cap_minor_by_currency: [CurrencyAmountCap],
  forum_lifetime_pool_cap_minor_by_currency: [CurrencyAmountCap],

  carry_forward_rule:
    "carry_forward_within_forum_pool",

  max_carry_forward_epochs: u32,

  contribution_scope: [ForumPoolTransactionKind],

  self_purchase_exclusion: true,
  verified_common_identity_exclusion: true,

  settlement_finality_delay: Tick
}
```

```text
CurrencyAmountCap {
  currency: "USD" | "JPY" | "CNY",
  amount_minor: u128
}
```

```text
ForumPoolTransactionKind {
  "asset_access",
  "pressroom_membership",
  "bank_storage",
  "bank_retrieval",
  "bank_distribution",
  "promotion",
  "eligible_service_offer"
}
```

`ForumRevenuePoolPolicy`は以下を満たさなければならない。

```text
1. enabled == false のとき:
   contribution_rate_bps == 0
   contribution_scope is empty
   other reward-distribution parameters remain canonical but are not evaluated

2. enabled == true のとき:
   1 <= contribution_rate_bps <= 5000
   1 <= eligible_max_depth < max_depth
   distribution_weight_rule == "eligible_depth_inverse_power_v1"
   1 <= depth_weight_exponent <= 2
   distribution_epoch > 0
   max_carry_forward_epochs > 0
   settlement_finality_delay >= 0
   contribution_scope is non-empty
   self_purchase_exclusion == true
   verified_common_identity_exclusion == true

3. individual_epoch_cap_minor_by_currency:
   USD, JPY, CNYを各1回ずつ含む
   amount_minor > 0

4. forum_lifetime_pool_cap_minor_by_currency:
   USD, JPY, CNYを各1回ずつ含む
   amount_minor > 0

5. 各通貨について:
   individual_epoch_cap_minor_by_currency
     <= forum_lifetime_pool_cap_minor_by_currency

6. Genesisの正規化済み表現では、列挙、通貨cap配列、contribution scopeは
   Gaia coreが定めるcanonical orderに従う
```

`contribution_rate_bps`は、Forum Revenue Poolの独立料率である。`GaiaNetworkFeeSchedule`の料率、`early_access_rate`、`β`、`κ1`、`κ`、`χ`、その他の既存係数と混同してはならない。

`forum_revenue_pool_policy`は次を定めてはならない。

- Stripe実費の料率又は決済手段別手数料
- Gaia network maintenance feeの料率、固定額、通貨別ラダー
- Stripe payout、Connected Account、KYC/KYB、cross-border可否
- PayoutEntitlementの法定通貨請求期限
- 未請求PayoutEntitlementの失効・reserve帰属・共通Service Credit Policy
- Payment-Serviceの認可
- Q、depth、CanIssue、CanIssueTo、AssetScore、A_seed、各bonus、Candidates、Reach
- eKYC、Civic Vote、CivicNeedAsset、CivicCitizenの意味論

これらは既存のOwner threshold policy又はGaia coreの共通規則に属する。

#### 7.17.4 Pool contributionの発生

対象取引jがForum Revenue Poolに寄与するには、次を全て満たさなければならない。

```text
1. 対象forum Fのgenesisでforum_revenue_pool_policy.enabled == true
2. 取引種別がFのcontribution_scopeに含まれる
3. 対象Order、AssetRecord、ServiceOffer、PressRoom等がforum Fへ一意に束縛される
4. Stripe PaymentReceiptが有効なpaid状態を持つ
5. Stripe actual feeが確定し、有効なPaymentSettlementが存在する
6. 対象PaymentSettlementが返金・dispute・chargebackによって取り消されていない
7. self purchase exclusionを満たす
8. verified common identity exclusionを満たす、又は比較不能の場合にfail-closed規則を満たす
9. forum lifetime pool capを超えない
10. settlement_finality_delayを経過している
```

対象取引jについて、`Net_j=G_j-S_j`とする。forum Fのgenesisが定める`contribution_rate_bps`を`r_F`とする。

\[
RawPoolContribution_j
=
\left\lfloor
\frac{Net_j\times r_F}{10000}
\right\rfloor
\]

ただし、PaymentSettlementにおけるOwner設定のGaia維持手数料を`N_j`とする。販売者・提供者の受取人プールが正である必要から、Pool contributionは次の上限を持つ。

\[
R_j
=
\min(
RawPoolContribution_j,
Net_j-N_j-1
)
\]

ただし`Net_j-N_j-1 < 0`である場合、取引をForum Revenue Pool寄与可能な取引として扱ってはならない。最終的に、`B_j=Net_j-N_j-R_j`である。

合計率の実行時検査として、Payment-Serviceは対象PaymentSettlement作成時に次を検証しなければならない。

```text
selected global network fee amount + raw forum Pool amount < net_after_stripe
```

又は、料率が純粋な百分率のみのtierでは、同値として以下を検査できる。

```text
selected_global_network_fee_rate_bps
+ forum_revenue_pool_policy.contribution_rate_bps
<= 9999
```

固定額を含む場合は、金額ベースの検査を必須とする。

```text
net_after_stripe_minor
- gaia_network_maintenance_fee_minor
- raw_forum_revenue_pool_contribution_minor
>= 1
```

この条件を満たさない注文は、決済開始前に拒否しなければならない。既にStripe決済が完了した後に検出した場合、Payment-Serviceは自動的に販売者取り分を負にしてはならず、決済異常として隔離し、Owner認可済みの例外処理・返金手続に従う。

各有資格取引からPoolが発生したとき、Payment-Serviceは次を発行する。

```text
ForumPoolContributionRecord {
  contribution_id: Hash,

  forum_id: ForumId,
  payment_settlement_ref: Hash,
  payment_receipt_ref: Hash,
  order_ref: Hash,

  currency: CurrencyCode,

  net_after_stripe_minor: u128,
  gaia_network_maintenance_fee_minor: u128,

  forum_pool_rate_bps: u16,
  raw_forum_pool_contribution_minor: u128,
  accepted_forum_pool_contribution_minor: u128,

  contribution_scope: ForumPoolTransactionKind,

  settlement_finality_time: Tick,
  distribution_epoch_id: Hash | null,

  status:
    "pending_finality"
    | "eligible_for_distribution"
    | "distributed"
    | "reversed"
    | "excluded",

  exclusion_reason:
    "self_purchase"
    | "verified_common_identity"
    | "outside_scope"
    | "refund"
    | "chargeback"
    | "lifetime_cap_reached"
    | "insufficient_beneficiary_remainder"
    | null,

  payment_service_authorization_ref: Hash,
  signature: MLDSA65Signature
}
```

`gaia_network_maintenance_fee_minor`は監査参照のために記録できるが、`accepted_forum_pool_contribution_minor`の原資、分母、内部配分、又は残高であってはならない。

PaymentSettlement成立直後のPool contributionは、直ちに分配可能残高へ入れてはならない。最低でもgenesisの`settlement_finality_delay`を待ち、返金・dispute・chargeback等により取消すべき状態がないことを確認する。

```text
PaymentSettlement.finalized
  -> ForumPoolContributionRecord.pending_finality
  -> settlement_finality_time reached
  -> eligible_for_distribution
  -> included in a ForumRevenuePoolDistribution
```

返金、chargeback、dispute損失又は対象取引無効化が確定した場合、未分配のContributionは`reversed`又は`excluded`にする。既に分配済みの金額の回収は、PayoutEntitlement、Transfer、Payout、Refund、PayoutRecoveryActionの共通規則に従う。

#### 7.17.5 depthに基づく分配資格

forum Fの分配epoch eにおける評価checkpointを`C_e`、その時刻を`t_e`とする。Soul SがPool分配対象となる必要十分条件は以下である。

\[
PoolEligible(S,F,e)
\iff
ActiveMember(S,F,t_e)
\land
Healthy(S,F,t_e)
\land
ValidSoulEpoch(S,t_e)
\land
0\le depth(S,F,t_e)\le D_F
\]

ここで`D_F`はgenesisの`eligible_max_depth`である。上式はepoch単位の有資格Soul集合`E_{F,e}`を定める。取引jに起因するPool contribution lotからの配分では、これに加えて第7.17.10節の`ExcludedFromContribution(j)`を除外しなければならない。

\[
LotEligible(S,F,e,j)
\iff
PoolEligible(S,F,e)
\land
S\notin ExcludedFromContribution(j)
\]

lot jからの配分対象は`LotEligible(S,F,e,j)`を満たすSoulだけであり、当該lotの有資格Soul集合は\(E_{F,e}\setminus ExcludedFromContribution(j)\)である。epoch単位の集計で分配する場合も、この結果と厳密に同値でなければならない（第7.17.10節）。

分配資格には次を含めてはならない。

```text
root_entry保有の有無
root_entryの発行順
root_issuance_index
EarlyBonus
Qの直接値
AssetScore
アセット所有量
支払額
販売額
PaymentReceiptの保有額
PayoutEntitlementの残高
Civic Vote
CivicCitizen
KYC/KYBの有無
Stripe Connected Accountの有無
```

ただし、法定通貨をStripeで実際にpayoutする段階では、本仕様のPayoutEntitlement及びStripe eligibility規則（第18章）を適用する。Stripe受取可能性はPool配分額の計算・資格・depthウェイトを変えてはならない。

Forum Revenue Poolのdepth分配では、各候補はauthority公開鍵単位で数えてはならない。Soul ID単位で一意に扱う。authority鍵の更新又はBody転生によって、同一Soulが分配対象として複数回現れてはならない。

```text
PoolCandidateKey = soul_id
not authority_pubkey
not incarnation_id
```

`PoolEligible`のactive member、health、Soul epoch及びdepthを検証する際は、評価checkpoint時点のactive DeviceIncarnationと対応する公開`identity_pubkey`を必ず検証する。

許可する分配ウェイト規則は次の一つに固定する。

```text
eligible_depth_inverse_power_v1
```

\[
Weight(S,F,e)
=
(D_F-depth(S,F,t_e)+1)^{q_F}
\]

- `D_F`: `eligible_max_depth`
- `q_F`: `depth_weight_exponent`（1又は2）
- `depth > D_F`のSoulは資格なしであり、ウェイト0

この規則により、rootは`depth=0`として最大ウェイトを持つ。しかしroot_entry自体に報酬権を与えるのではなく、全Soulが時間、healthy状態、正当なcommunity関係を通じて浅いdepthへ到達することで、収益還元への資格と大きい配分を得られる。

#### 7.17.6 分配対象残高と個人capを考慮した決定論的分配

forum F、通貨c、epoch eにおける分配可能額を次で定義する。

\[
PoolAvailable(F,c,e)
=
CarryForward(F,c,e-1)
+
\sum_{j\in EligibleContributions(F,c,e)}R_j
\]

ただし、次は含めてはならない。

```text
pending_finality contribution
reversed contribution
excluded contribution
already distributed contribution
Gaia network maintenance fee
sales proceeds payable to sellers
other forumのPool残高
```

有資格Soul集合を`E_{F,e}`とする。ただし取引単位除外（第7.17.5節、第7.17.10節）を適用するため、contribution lot jからの配分に用いる有資格Soul集合と総ウェイトを次で定義する。

\[
E_{F,e,j}
=
E_{F,e}
\setminus
ExcludedFromContribution(j)
\]

\[
W_{F,e,j}
=
\sum_{S\in E_{F,e,j}}Weight(S,F,e)
\]

cap適用前の理論取り分は、分配対象lotごとの加重比の和である。分配対象lot集合を`Lots(F,c,e)`（epoch e-1から繰り越されたlotと`EligibleContributions(F,c,e)`の和集合）、lot jの分配対象額を`r_j`とすると、`PoolAvailable(F,c,e)`はその総和に一致する。lot jの有資格Soul集合`E_{F,e,j}`に属さないSoulは、当該lotからの取り分を持たない。

\[
RawShare(S,F,c,e)
=
\sum_{\substack{j\in Lots(F,c,e)\\ S\in E_{F,e,j}}}
\frac{r_j\times Weight(S,F,e)}{W_{F,e,j}}
\]

和は`S\in E_{F,e,j}`を満たすlotだけを取る。`S\notin E_{F,e,j}`であるlot jは、たとえ`S`がepoch単位の`E_{F,e}`に属していても、`S`の取り分に寄与しない。

`W_{F,e,j}=0`（すなわち`E_{F,e,j}`が空）であるlotは配分対象Soulを持たないため、当該lotの`r_j`を配分せず、本節の繰越規則に従い`carry_forward_out`へ算入する。`W_{F,e,j}`による除算を行ってはならない。

`ExcludedFromContribution(j)`は当該lotの生成時に確定し、lotがepochをまたいで繰り越されても変化しない。したがって繰越lotの`E_{F,e,j}`は、当該lotを生んだ取引の除外集合を保持したまま、現在のepochの`E_{F,e}`で評価する。

`allocated(S,j)`を、lot jから`S`へ確定した配分額とする。`\sum_{j}allocated(S,j)`が、当該Soulの`ForumRevenuePoolDistribution`における確定額に一致しなければならない。

配分は**lotごとに**、`Lots(F,c,e)`のcanonical byte order昇順で行う。lot jの処理が完了してからlot j+1へ進む。epoch単位の集計値を先に計算してから`allocated(S,j)`を按分する実装は、除外されたSoulへ配分が生じないことを証明しなければならない。按分によっては、本手続と観測上同一であることを証明できない限り受理しない。

各lot jについて、次を行う。

\[
RawShare_j(S,F,c,e)
=
\mathbf{1}\left[S\in E_{F,e,j}\right]
\cdot
\frac{r_j\times Weight(S,F,e)}{W_{F,e,j}}
\]

\[
BaseShare_j(S,F,c,e)
=
\left\lfloor RawShare_j(S,F,c,e)\right\rfloor
\]

個人epoch capを`Cap(F,c)`とし、当該epochでlot jより前に既に確定済みの分配額を`AlreadyAllocated(S,F,c,e)`とする。

\[
RemainingCap(S,F,c,e)
=
\max(0,Cap(F,c)-AlreadyAllocated(S,F,c,e))
\]

\[
CappedShare_j(S,F,c,e)
=
\min(BaseShare_j(S,F,c,e),RemainingCap(S,F,c,e))
\]

lot jの未配分残高は\(r_j-\sum_S CappedShare_j(S,F,c,e)\)である。これが正である場合、`E_{F,e,j}`に属し、かつ`RemainingCap(S,F,c,e)>0`であるSoulだけを対象に、同じWeight比で再配分する。`S\notin E_{F,e,j}`であるSoulは、基本配分でも再配分でもlot jから受け取らない。再配分は、以下の終了条件のいずれかを満たすまで行う。

```text
- 未配分残高が0
- cap未到達の有資格Soulが存在しない
- 最小通貨単位未満の端数だけが残る
```

最小通貨単位の端数は、最大剰余方式で割り当てる。同率の場合の順序は次に固定する。

```text
hash(
  "gaia:forum-revenue-pool-remainder:v1"
  || forum_id
  || currency
  || distribution_epoch_id
  || soul_id
)
```

当該lotの`E_{F,e,j}`に属する全Soulが個人capへ達し、なおlot残高が残る場合、その残額はgenesisの`carry_forward_rule="carry_forward_within_forum_pool"`に従い、当該lotの一部として次epochへ繰り越す。lot jについて\(\sum_S allocated(S,j)+carry\_from\_j=r_j\)が成立する。

#### 7.17.7 繰越期限、forum lifetime cap、未分配分のGaia維持手数料への帰属

Pool残高を無期限に残してはならない。

- Poolに寄与する総額は、通貨ごとの`forum_lifetime_pool_cap_minor_by_currency`を超えてはならない。
- 各繰越lotは最大`max_carry_forward_epochs`だけ繰り越せる。
- 繰越期限までに分配できなかったlotの残額は、当該forumの未分配Pool残高として永久に保持してはならない。

繰越期限の満了時、未分配Pool lotはGaiaのPayoutEntitlementPolicyとは別の、gaia-core全体で固定された`undistributed_pool_expiry_rule`に従い処理する。当該ruleはforum genesisのパラメータではなく、gaia-coreが全forum共通に固定するprotocol規則である。`forum_revenue_pool_policy`又はforum genesisへ当該フィールドを追加してはならない。追加するとgenesisのcanonical encodeが変わり`forum_id`が変わるためである（C6）。本仕様では当該ruleを次の固定値に限定する。

```text
undistributed_pool_expiry_rule = "forfeit_to_gaia_maintenance_fee_v1"
```

これは、分配可能な成熟者が不在、全員cap到達、又は期限内に有資格者へ配分不能な場合に、当該Pool contributionを生んだ取引の販売者・サービス提供者beneficiaryへ返すのではなく、Gaia network maintenance feeへ帰属させる規則である。帰属額は販売者・beneficiaryへ支払わず、`PayoutEntitlement`その他いかなるSoulの受取権も発行しない。

帰属は新しい`PayoutEntitlement`、既存Entitlementの増額、またはSoul帰属の受取権として表現しない。Payment-Serviceは元PaymentSettlementに束縛された`ForumPoolUndistributedForfeiture`を発行し、Gaia network maintenance feeの収益として確定する。この帰属は受取期限・失効の対象ではなく、PayoutEntitlementPolicy（第18.8節、第18.9節）を参照しない。

```text
ForumPoolUndistributedForfeiture {
  forfeiture_id: Hash,
  forum_id: ForumId,
  source_pool_lot_ref: Hash,
  source_payment_settlement_ref: Hash,
  currency: CurrencyCode,
  amount_minor: u128,
  gaia_network_fee_ledger_ref: Hash,
  determined_at: Tick,
  signature: MLDSA65Signature
}
```

この規則により、Forum Revenue Poolは未分配のまま無期限債務にもならず、販売者から恒久的に失われる金額にもならず、分配不能な残余はGaia network maintenance feeへ帰属する。contributionの原資・率・分配式はこの帰属によって変化しない。

#### 7.17.8 ForumRevenuePoolDistribution

各forum・通貨・epochごとに、Payment-Serviceは次のobjectを発行する。

```text
ForumRevenuePoolDistribution {
  distribution_id: Hash,

  forum_id: ForumId,
  currency: CurrencyCode,
  distribution_epoch_id: Hash,

  evaluation_checkpoint_ref: Hash,
  evaluation_time: Tick,

  pool_policy_ref: Hash,

  carry_forward_in_minor: u128,
  newly_eligible_contribution_minor: u128,
  total_pool_available_minor: u128,

  total_distributed_minor: u128,
  carry_forward_out_minor: u128,
  forfeited_to_gaia_minor: u128,

  eligible_member_commitment_root: Hash,
  allocation_commitment_root: Hash,

  distribution_status:
    "finalized"
    | "partially_distributed"
    | "fully_carried_forward"
    | "forfeited_to_gaia",

  payment_service_authorization_ref: Hash,
  signature: MLDSA65Signature
}
```

検証器は以下を確認しなければならない。

\[
total\_pool\_available
=
carry\_forward\_in
+
newly\_eligible\_contribution
\]

\[
total\_pool\_available
=
total\_distributed
+
carry\_forward\_out
+
forfeited\_to\_gaia
\]

さらに検証器は、各contribution lot jと各Soul Sについて、取引単位除外が配分に反映されていることを確認しなければならない。

\[
S\in ExcludedFromContribution(j)
\Rightarrow
allocated(S,j)=0
\]

除外Soulへ配分した分布は`ForumPoolAllocationMismatch`として拒否する。本節は新しいエラーコードを追加せず、第22.2節に既にある当該コードを流用する。

`allocation_commitment_root`は、各Soulについて`depth`、weight、cap前配分、cap後配分、端数割当、対応PayoutEntitlement参照、及び適用したlotの有資格Soul集合と除外Soul集合（`ExcludedFromContribution(j)`）を含むcanonical Merkle mapのrootである。

#### 7.17.9 分配された額のPayoutEntitlement化

ForumRevenuePoolDistributionにより特定Soulへ確定した額は、そのSoulの新しい`PayoutEntitlement`として発行する。

```text
PayoutEntitlement.source_kind = "forum_revenue_pool_distribution"
PayoutEntitlement.source_ref = distribution_id
PayoutEntitlement.beneficiary_soul_id = allocated Soul
PayoutEntitlement.principal_minor = allocated amount
PayoutEntitlement.currency = distribution currency
```

このPayoutEntitlementは、Owner threshold認可済みPayoutEntitlementPolicyに従う有限`claim_deadline`を持つ（第18.8節、第18.9節）。

Poolの分配資格と金額はdepthで決まる。Stripe Connected Accountの有無、payout eligibility、PayoutEntitlementの請求・失効は、分配後の実際の法定通貨受取手続としてのみ関与する。

#### 7.17.10 自己取引・循環還元への対策

purchaser Soulが、対象販売の任意のbeneficiary Soulと同一である場合、当該取引はForum Revenue Poolに寄与してはならない。

\[
SelfPurchase(j)
\iff
PurchaserSoul(j)
\in BeneficiarySouls(j)
\]

\[
SelfPurchase(j)\Rightarrow R_j=0
\]

この取引は通常のPaymentReceipt、PaymentSettlement、販売者分配、返金、Stripe処理の対象になり得るが、`ForumPoolContributionRecord`は`status="excluded"`、`exclusion_reason="self_purchase"`とする。

購入者Soulと任意のbeneficiary Soulが、eKYCの有効な`IdentityBindingCredential`により、同一の`uniqueness_scope`における同一実体として検証できる場合、当該取引はForum Revenue Poolに寄与してはならない。

\[
VerifiedCommonIdentity(j)
\Rightarrow R_j=0
\]

これは、同一人物・同一法人等が複数Soulを使い、自己売買を外形上分離してPool還元を作る経路を減らすためである。ただし、eKYC未確認Soulを通常Gaiaから排除してはならない。identity比較不能であることだけを理由に、そのSoulの通常参加、販売、証明書、成熟度、アセット利用を拒否してはならない。

eKYCで共通実体比較ができない場合でも、同一Soul自己購入でなければ、取引を自動的にForum Poolから除外してはならない。ただしPoolへの計上は、genesisの`settlement_finality_delay`後、かつPayment-Serviceの反不正・返金・chargeback監視を経て初めて可能とする。Poolは取引ごとに確定し、後から自己取引と客観的に確定した場合には、未分配なら取消し、分配済みなら通常のrefund/chargeback/recovery規則に従う。

ある取引jからPoolが発生した場合、その取引の購入者Soul又は任意の販売beneficiary Soulは、当該取引jに起因するPool contributionから直接の分配を受けてはならない。この規則を取引ごとの`ForumRevenuePoolDistribution`に適用する。

\[
ExcludedFromContribution(j)
=
\{PurchaserSoul(j)\}
\cup BeneficiarySouls(j)
\]

取引jのPool額は、分配epoch内の集計Poolへ合算できるが、allocation計算時には当該contribution由来の配分対象から`ExcludedFromContribution(j)`を除外する。実装は、各Contribution lotごとに同一epochの有資格Soul集合と除外Soul集合を用いて配分するか、同値な集計アルゴリズムで、購入者・販売者が自分の取引由来Poolを回収しないことを証明しなければならない。この規則は複雑であるが不可欠である。単に自己購入を除外するだけでは、販売者が他者に買わせ、同一取引のPoolをdepth還元として自ら回収する経路が残るためである。

#### 7.17.11 具体例

forum Fのgenesisが以下を固定したとする。

```text
Forum Revenue Pool contribution rate: 3.00% = 300 bps
Eligible depth: 0 through 5
Weight rule: (5 - depth + 1)^2
Distribution epoch: 30 days
```

同時に、Owner thresholdが認可する`GaiaNetworkFeeSchedule`が、対象JPY取引について、Stripe実費控除後金額の5.00%をGaia network maintenance feeとして定めているとする。

購入者が10,000 JPYを支払い、Stripeの実費が360 JPYであるとする。

\[
G=10000,\quad S=360,\quad Net=10000-360=9640
\]

Gaia維持手数料:

\[
N=\lfloor9640\times0.05\rfloor=482
\]

Forum Revenue Pool contribution:

\[
R=\lfloor9640\times0.03\rfloor=289
\]

販売者・提供者受取人プール:

\[
B=9640-482-289=8869
\]

| 行き先 | 金額 | 性質 |
|---|---:|---|
| Stripe | 360 JPY | 実費 |
| Gaia network maintenance fee | 482 JPY | Gaia全体の維持原資。Poolの原資ではない |
| Forum Revenue Pool | 289 JPY | 当該forumの成熟参加者還元原資 |
| 販売者・提供者 | 8,869 JPY | BeneficiaryRuleに従い分配 |
| 合計 | 10,000 JPY | 保存則を満たす |

同じforumで、ある30日epochに分配可能なJPY Poolが25,000 JPYとする。有資格Soulは以下である。

| Soul | depth | weight \((5-depth+1)^2\) |
|---|---:|---:|
| root | 0 | 36 |
| A | 1 | 25 |
| B | 3 | 9 |
| C | 5 | 1 |

総ウェイト:

\[
W=36+25+9+1=71
\]

自己取引除外・個人cap・端数処理が不要な単純例では、概算配分は以下となる。

| Soul | 理論計算 | 概算配分 |
|---|---:|---:|
| root | \(25000\times36/71\) | 約12,676 JPY |
| A | \(25000\times25/71\) | 約8,802 JPY |
| B | \(25000\times9/71\) | 約3,169 JPY |
| C | \(25000\times1/71\) | 約352 JPY |

実装は最小通貨単位で切り捨て、最大剰余方式で端数を決定論的に配分し、合計を25,000 JPYに一致させる。rootは`depth=0`で最大ウェイトを持つ。しかし、root_entryを持つだけでは分配資格を得ない。A、B、Cはroot_entryの有無にかかわらず、`depth <= 5`に正当に到達していれば対象となる。

#### 7.17.12 checkpoint・オフライン検証

各ForumRevenuePoolDistributionは、単一の`evaluation_checkpoint_ref`を参照し、資格、active membership、health、Soul epoch、depthをそのcheckpointの`checkpoint_time`に固定して評価する。異なるcheckpoint時刻のdepth、membership、health、Soul epochを混在させてはならない。

Forum Revenue Poolの分配資格又は分配額を検証する`StateProofEnvelope`は、少なくとも次を含まなければならない。

- 対象forumのgenesisと`forum_revenue_pool_policy`
- `evaluation_checkpoint_ref`及び必要なpayload ancestry / attestation
- 対象Soulのmembership inclusion proof
- 対象SoulのTemporalHealthLease、health state proof
- 対象SoulのSoulEpochLease、active incarnation proof
- depth再計算に必要なparticipation anchor、Q-set proof及び依存閉包
- 対象epochのForumPoolContributionRecord群又はそれらの集計rootと適切なinclusion/non-inclusion/cardinality proof
- `ForumRevenuePoolDistribution`及びallocation commitment proof
- 各PayoutEntitlement参照とOwner認可済みPayoutEntitlementPolicy

検証器はネットワーク照会なしに、当該Distributionが提示されたcheckpoint及びPool contribution列に対して正しく計算されたかを検証可能でなければならない。

StripeのPaymentIntent、Charge、Balance Transaction、Transfer、Payout等の生の外部objectを、Gaiaオフライン検証の真実性証明として直接検証することはできない。Stripe API秘密鍵・webhook secret及び外部ID平文はP2Pへ出してはならない。Gaiaのオフライン検証は、Owner認可済みPayment-Serviceが署名した`PaymentReceipt`、`PaymentSettlement`、`ForumPoolContributionRecord`、`PayoutEntitlement`等の正当性、相互参照、金額保存則、Policy束縛を検証する。これはPayment-Serviceの外部事実境界と同じであり、StripeがGaiaのcheckpoint又はdepthを裁定するものではない。

#### 7.17.13 commerce・成熟度・Civic層の隔離

Forum Revenue Poolは、commerce isolationを維持しなければならない。以下の値はForum Revenue Poolの入力にしてはならない。

```text
Qの直接値
AssetScore
EarlyBonus
CultivationBonus
CitationBonus
A_seed
Candidates
Reach
Civic Voteの票数
CivicNeedAsset順位
Stripe受取金額
Stripe Connected Accountの種類
PayoutEntitlement残高
GaiaServiceCredit残高
```

Poolの分配資格とウェイトに用いるGaia通常層の値は、次に限定する。

```text
ActiveMember
healthy TemporalHealthLease
valid SoulEpochLease
computed depth
```

また、Forum Revenue Pool、PaymentSettlement、PayoutEntitlement、Stripe payout、Service Credit、失効処理は、次を変更してはならない。

```text
Q
depth
CanIssue
CanIssueTo
AssetScore
A_seed
EarlyBonus
CultivationBonus
CitationBonus
Candidates
Reach
forum創設資格
checkpoint finality
CivicCitizen
Civic Vote
CivicNeedAsset
```

commerceの金銭的成功がdepthを買う経路を作ってはならず、depthの成熟がForum Pool分配資格を与える一方向の関係だけを許す。

Forum Revenue Pool、seller beneficiary、PayoutEntitlementとSoul Transferの関係を明示する。

- 譲渡finalization前に発生済み・確定済みの収益配分、PayoutEntitlementは原則として旧controllerに帰属する。
- 未確定分を買主へ渡すと、過去の経済活動やforum貢献の収益権を買うことになり得るため、本仕様の既定は非承継とする。
- 例外的な契約上の債権譲渡を将来検討する場合でも、Soul Transfer本体とは別のPayment-Serviceが認可する法的assignmentとして定義し、成熟・Civic・payout eligibilityを迂回しないことを要求する。本仕様では実装しない。

### 7.18 Asset Lineage Royalty（アセット系譜ロイヤルティ）

正規に許諾されたアセットの再流通・再許諾・派生販売が、当該販売を成立させた販売ノードの本来の販売者取り分の内部で、アセットの完全な権利系譜（Asset lineage）へ自動分配される仕組みを、本章で定義する。ALRの決済・送金への接続は第18章、resale / sublicense / derivative commerce の受理は第19章、受理述語とreject条件は第23章、実装上のテスト要件は第25章に定める。

#### 7.18.1 アクセス権と商用権利の分離

`ContentAccessGrant`および`AssetAccessGrant`は、対象`ProtectedContent`に対する`read`、`execute`、または`read_execute`のアクセス能力のみを表す。

`ContentAccessGrant`、`AssetAccessGrant`、無料アクセスreceipt、asset purchase receipt、PressRoom membership、またはコンテンツを復号できる事実から、再販、再配布、再許諾、派生物公開、派生物販売、商用利用、第三者への鍵配布、あるいはlineage royaltyの受領資格は導かれない。

商用権利は、有効な`AssetCommercialRightsPolicy`および有効な`AssetRightsGrant`、またはorigin policyが明示的に許す自己実行的grantによってのみ成立する。

不明、欠落、期限切れ、失効、scope不一致、authority不正、lineage proof不備の場合、商用権利は存在しないものとしてrejectする。暗黙許諾は存在しない。

#### 7.18.2 Asset lineage（単一親の権利系譜）

ALR対象assetは、origin assetまで到達可能な一意の親参照を持つ`AssetLineageNode`を形成しなければならない。

本仕様の初期版では、実装単純性・決済決定性・検証コスト上限のため、asset lineageは**単一親の有向連鎖**とする。複数親のbundle / mashup / composite assetは、後続改訂の別設計までALR対象外とするか、`lineage_royalty_policy_ref = null`として扱う。

親assetを持つnodeは、次を満たさなければならない。

1. 親assetがactiveでありcanonicalに解決できる。
2. 親assetの商用権利ポリシーが、当該child relationship kindを許す。
3. 親から子への`AssetRightsGrant`が有効である、またはpolicyが明示的にself-executingである。
4. 親lineageのorigin policy hashがchild nodeに継承される。
5. childの`lineage_depth = parent.lineage_depth + 1`である。
6. `lineage_depth <= max_lineage_depth`である。
7. parent chainにchild asset id、child asset lineage id、child content hashが含まれない。
8. 全ancestor hashがcanonical orderでコミットされ、ancestor commitmentが再計算と一致する。

上記のいずれかが失敗した場合は`InvalidAssetLineage`、`AssetLineageCycle`、`MissingParentAsset`、`UnauthorizedCommercialDerivative`、`AssetLineageDepthExceeded`、または対応するfail-closed errorでrejectする（第22章）。

#### 7.18.3 Origin policyの不変性

ALR policyはorigin assetの最初のactive `AssetRecord`にのみ設定できる。

origin assetは`AssetLineageRoyaltyPolicy`を参照し、そのobject hashを`origin_lineage_royalty_policy_ref`としてimmutableにコミットする。

子孫asset、再販offer、再許諾offer、派生asset、後続AssetRecord version、ServiceOffer、ServiceOrderは、origin policyを変更、削除、弱化、置換、丸め規則変更、深度上限拡張、受益者除外、または過去取引への遡及適用してはならない。

origin assetのpublisherは、将来の新規利用許諾を停止するrevocation policyを選べる。ただし既にfinalityを得たsaleから発生した`PayoutEntitlement`、および既に付与されたアクセス権の扱いは、当時のpolicyとrefund / dispute rulesに従い、恣意的に遡及変更してはならない。

#### 7.18.4 ロイヤルティ原資の隔離と二段階パラメータ

asset lineage royaltyの唯一の金銭原資は、当該saleの`PaymentSettlement.beneficiary_pool_minor`である。

`beneficiary_pool_minor`は既存の順序で、gross amountからactual Stripe fee、Gaia network maintenance fee、適用可能なForum Revenue Pool contributionを控除した残額として計算される（第18.7節）。

ALRは、Forum Revenue Pool contribution、Gaia network maintenance fee、Stripe fee、購入者支払額、既に別beneficiaryに確定した金額、または外部資金から控除・追加してはならない。

ALRを適用するsaleでは、元のseller単独beneficiary ruleは、ALR expansionによりsellerとlineage beneficiariesの確定的なentitlement setへ展開される。この展開後の全`PayoutEntitlement.principal_minor`の総和は、常に`beneficiary_pool_minor`と一致しなければならない。

origin policyは少なくとも次の二つのパラメータを持つ。

- `ancestor_pool_rate_bps = α`：販売者原資`B`のうち、祖先系譜ロイヤルティに切り出す割合。
- `decay_ratio_bps = r`：祖先プール内部で、現販売assetに近い祖先から遠い祖先へ配分を減衰させる比率。

`α`は`0 <= α <= 10000`、`r`は`0 < r < 10000`のbasis points整数である。`α = 0`はALR無効として許容する。`r = 0`と`r = 10000`は除算・退化を避けるため禁止する。

`max_lineage_depth = D_{max}`は正の有限整数であり、プロトコル上限`MAX_LINEAGE_ROYALTY_DEPTH`を超えてはならない。当該上限はgaia-core全体で固定し、forum genesis、`AssetLineageRoyaltyPolicy`及び実装のいずれも広げられない。

```text
MAX_LINEAGE_ROYALTY_DEPTH = 32
MAX_COMMERCIAL_LINEAGE_DEPTH = 32
MAX_ALLOCATION_ENTRIES_PER_SETTLEMENT = 32
MAX_PAYOUT_ENTITLEMENTS_PER_AGGREGATION = 4096
```

これらはgaia-core全体で固定するprotocol hard capであり、forum genesis、`AssetLineageRoyaltyPolicy`、`PayoutEntitlementPolicy`又は実装のいずれも広げられない。

- `MAX_LINEAGE_ROYALTY_DEPTH`はroyalty配分の祖先遡及深度の上限である。参照profileの推奨値は16以下とする
- `MAX_COMMERCIAL_LINEAGE_DEPTH`は商用権利（再販・再許諾・派生）の系譜深度の上限である。royalty深度と同じ32とする。両者は独立に検証する。asset lineageは単一親の有向連鎖であるが（第7.18.2節）、同一assetの再販・再許諾は新しいlineage nodeを作らないため、`max_commercial_depth`は`max_lineage_depth`から導出されない。上限は導出ではなく、genesis、`AssetCommercialRightsPolicy`及び`AssetLineageRoyaltyPolicy`の検証で直接課す（`max_remaining_depth <= parent policy residual depth`の再帰検証を含む）
- `MAX_ALLOCATION_ENTRIES_PER_SETTLEMENT`は1回の`LineageRoyaltySettlement`が持つallocationの件数上限である。第7.18.5節の配分は祖先の世代`d`ごとに1件のallocationを持つため、`d <= max_lineage_depth <= MAX_LINEAGE_ROYALTY_DEPTH`より32で抑えられる
- `MAX_PAYOUT_ENTITLEMENTS_PER_AGGREGATION`は1つの`PayoutAggregation`が含むentitlement数の上限である。canonical encodingと完全オフライン検証を有限に保つために固定する。より小さい値をpolicyで課すことはできるが、これを超える値を課してはならない

これらの上限を超えるobjectは`ResourceLimitExceeded`等で拒否する。`max_lineage_depth > MAX_LINEAGE_ROYALTY_DEPTH`を宣言する`AssetLineageRoyaltyPolicy`又はgenesisを拒否する。

#### 7.18.5 配分の数学仕様

一つのsale / order / payment settlementについて、以下を定義する。

\[
G = \text{PaymentReceipt.gross\_amount\_minor}
\]

\[
S = \text{PaymentSettlement.stripe\_fee\_amount\_minor}
\]

\[
N = G - S
\]

\[
F_G = \text{PaymentSettlement.gaia\_network\_fee\_minor}
\]

\[
F_F = \text{PaymentSettlement.forum\_revenue\_pool\_contribution\_minor}
\]

\[
B = N - F_G - F_F
\]

ここで`B`は既存の`PaymentSettlement.beneficiary_pool_minor`と一致しなければならない。`B`は当該販売を行ったseller側に本来帰属する金額であり、ALRの唯一の原資である。

祖先プールと販売者残額:

\[
A = \left\lfloor \frac{B\alpha}{10000} \right\rfloor
\]

\[
P_{seller} = B - A
\]

`d`を有効祖先数とする。

\[
d = \min(\text{actual ancestor count}, D_{max})
\]

`d = 0`または`α = 0`の場合、`A = 0`とし、`P_seller = B`とする。祖先allocationは作成しない。

直親を`k = 1`、その親を`k = 2`とする。`r = decay_ratio_bps / 10000`の概念値について、浮動小数点を使わず有理数として以下を実装する。

\[
w_k = (1-r)r^{k-1}
\]

\[
W_d = \sum_{i=1}^{d}w_i = 1-r^d
\]

祖先`k`の理論上の配分は、

\[
R_k^* = A \cdot \frac{(1-r)r^{k-1}}{1-r^d}
\]

である。

実装では、`rnum = decay_ratio_bps`、`rden = 10000`、`qnum = 10000 - decay_ratio_bps`として、各世代の整数分子・分母を明示的に計算する。分子は世代`k`だけでなく有効祖先数`d`にも依存するため、`rden^{d-k}`の因子を必ず含めなければならない。これを欠くと分子の次元が分母より`rden^{d-k}`だけ小さくなり、直親への配分がほぼ全額失われる。

\[
\text{numerator}_k = A \cdot qnum \cdot rnum^{k-1} \cdot rden^{d-k}
\]

\[
\text{denominator}_d = rden^d - rnum^d
\]

\[
R_k^* = \frac{\text{numerator}_k}{\text{denominator}_d}
\]

実装はarbitrary precision integerを用いなければならない。なお、この整数形は`r = rnum / rden`とおいて`R_k^* = A(1-r)r^{k-1}/(1-r^d)`と恒等であり、分子と分母をともに`rden^d`で割れば直ちに確かめられる。固定幅整数を使用する言語では、オーバーフローを検出してrejectするか、事前に安全な上限をcanonicalに適用する。silent overflowは禁止する。

丸め規則: 全金額はcurrency minor unitの非負整数である。各祖先に対し、

\[
\widehat{R}_k = \left\lfloor R_k^* \right\rfloor
\]

をまず割り当てる。残余を、

\[
L = A - \sum_{k=1}^{d}\widehat{R}_k
\]

とする。残余`L`は`largest_remainder_v1`により配る。

1. 各祖先の剰余`R_k^* - floor(R_k^*)`を有理数の交差乗算で比較する。
2. 剰余が大きい祖先を優先する。
3. 剰余が同じ場合、generationの小さい順（直親優先）とする。
4. generationも同じ場合は、canonical byte orderによる`beneficiary_soul_id`昇順とする。
5. 上位`L`件へ1 minor unitを加算する。

最終額`R_k`は、

\[
R_k = \widehat{R}_k + \mathbf{1}[k \text{ is selected by largest remainder}]
\]

である。必ず次が成り立たなければならない。

\[
\sum_{k=1}^{d}R_k = A
\]

\[
P_{seller} + \sum_{k=1}^{d}R_k = B
\]

#### 7.18.6 単一権利者の重複統合

同じ`SoulId`がancestor chain内に複数回現れることは、Soul Transferやcontroller変更後のasset lineageでもあり得る。

生成時はgenerationごとの配分を保持するが、実際の`PayoutEntitlement`は同一sale・同一Soul・同一通貨について合算して一件にしてよい。その場合でも`LineageRoyaltySettlement.allocations`にはgenerationごとの原配分を全て記録し、検証可能でなければならない。

同一Soulがsellerでもancestorでもある場合、seller allocationとancestor allocationは論理的に別に算定し、その後、同一Soulへのentitlementとして合算してよい。ただし自己取引規則によりsaleが除外・保留される場合は、その規則が優先する。

#### 7.18.7 Forum Revenue Pool・Soul Transfer・Forum Root Successionとの関係

本仕様はForum Revenue Poolを変更しない。次を明示する。

1. Forum Revenue Pool contributionはALRより前に、既存`PaymentSettlement`規則により計算される。
2. ALRの基礎`B`は`beneficiary_pool_minor`であり、Forum Revenue Pool contributionを差し引いた後の額である。
3. Forum Revenue Poolはforum membership、health、Soul epoch、depth weightによるforum社会的分配である。
4. ALRはasset lineageにおける創作・派生・正規再許諾への個別報酬である。
5. 同一saleは両方に関係し得るが、二重の原資控除をしてはならない。
6. self-purchase / verified common identity exclusionは、既存Forum Revenue Pool規則とALRの各policyの双方で独立に適用される。

Soul Transfer / Forum Root Successionとの関係を明示する。

1. assetの`rights_holder_soul_id`に帰属するlineage royalty entitlementは、Soul Transferのfinalization後、既存のsuccessor controller bindingに従って新controllerが請求・受領できる。
2. Soul Transferのfreeze中は、新規のcommercial rights grant、resale offer、sublicense offer、derivative registration、payout claimをauthority gateで制限する。既存のtransfer freeze ruleを優先する。
3. transfer finalization前後にlineage nodeの権利者を二重に更新してはならない。
4. Forum Root Successionはforum root authorityの移転であり、asset lineage rightsを自動移転しない。
5. forumのroot controllerが変わっても、個別assetのorigin policy、rights grants、lineage royalty entitlementは変わらない。

### 7.19 Resource Contribution Score（第7の支えの力学）

第7の支えの力学は、ネットワーク資源提供の実証済み寄与を、既存ゲームのAssetScore・Reach・販売機会等へ上限付きで接続する。自己申告の容量・GPU・CPU等は一切の直接入力にならない。本節のobject schema・受理条件は第22章、reject code は第22.2節、数理的不変条件は第24章に定める。

#### 7.19.1 三つの寄与の分離

- **storage contribution**: 他者またはprotocol-required objectの暗号文、manifest、receipt set、index segmentをdurableに保存し、監査に通ること。
- **discovery contribution**: 公開discovery indexを保持し、新鮮でproof-retrievableな検索候補を返すこと。
- **compute contribution**: 将来、明確なverifierを持つjobを実行し、検証可能な結果を返すこと。本仕様ではschema予約のみで、ゲームscoreへのweightはゼロ。

#### 7.19.2 有効保存量

Soul `s`、forum / namespace `F`、epoch `e`の有効保存量を次で定義する。

\[
E_{s,F,e}
=
\sum_{o \in \mathcal{O}_{s,F,e}}
\mathrm{EligibleBytes}(o,s,F,e)
\]

各objectの有効量は、概念上次で制約される。

\[
\mathrm{EligibleBytes}(o,s,F,e)
=
\min(
B_{\mathrm{receipt}},
B_{\mathrm{audit}},
B_{\mathrm{policy}}
)
\]

ただし次を満たさないobjectは0とする。

- valid durable `StorageReceipt`が存在する。
- audit freshness window内の成功auditまたはverified readがある。
- objectがactive manifest / receipt set / index manifestから参照される。
- 同一object、同一Soul、同一epochの重複receiptは一度だけ数える。
- 同一failure domainに偏った複製はpolicyが許す一寄与までしか数えない。
- self-owned junk object、self-only private object、self-dealing placementはhigh-value contributionから除外する。
- contributor cacheはdurable contributionより低い重み、または0 weightとする。

#### 7.19.3 Discovery寄与

`DiscoveryServiceObservation`を導入する。寄与の根拠はquery volumeの自己申告ではなく、公開checkpointに対するfreshness、proof retrieval成功、応答可能性、重複排除されたobservationとする。`DiscoveryServiceObservation`のcanonical schemaは第22章に定める。

#### 7.19.4 Resource Contribution Score

Resource Contribution Scoreは、既存AssetScoreを置換しない。asset creation、A_seed、CultivationBonus、CitationBonus、forum depth、Q、Civicの既存計算を変更しない。

epoch `e`のインフラ補正basis pointsを以下の飽和関数で定義する。

\[
I_{s,F,e}
=
\min\left(
I_{\max,F},
\left\lfloor
\alpha^{I}_F\frac{E_{s,F,e}}{E_{s,F,e}+U_{S,F}}
\right\rfloor
+
\left\lfloor
\beta^{I}_F\frac{X_{s,F,e}}{X_{s,F,e}+U_{I,F}}
\right\rfloor
+
\left\lfloor
\gamma^{I}_F\frac{C_{s,F,e}}{C_{s,F,e}+U_{C,F}}
\right\rfloor
\right)
\]

- `E`: audit済みeffective storage
- `X`: audit済みdiscovery / index contribution
- `C`: future verified compute contribution（本仕様の初期値では`γ^{I}_F = 0`）
- `U_{S,F}`、`U_{I,F}`、`U_{C,F}`: storage（`E`）・index（`X`）・compute（`C`）それぞれの飽和定数である。添字`S`・`I`・`C`は寄与種別を示し、Soulを指さない。`ResourceContributionPolicy`がforum・寄与種別ごとに固定する正の正規化済み有理数であり、`U_{S,F} > 0`、`U_{I,F} > 0`、`U_{C,F} > 0`を満たさなければならない。`U_{S,F} = 0`、`U_{I,F} = 0`又は`U_{C,F} = 0`を宣言するpolicyを拒否する。`E_{s,F,e}`、`X_{s,F,e}`、`C_{s,F,e}`は非負であるため、分母`E_{s,F,e}+U_{S,F}`等は常に正となり、`E=0`は`0/U_{S,F}=0`を与え、除算不能・`0/0`は生じない。
- `I_{\max,F}`は`ResourceContributionPolicy`が定める上限である。`I_{\max,F}`はprotocol hard cap `I_{\mathrm{protocol\_max}}`を超えてはならない。`I_{\mathrm{protocol\_max}}`の初期値は3000 bps以下を推奨する。両者を同一の記号で書いてはならない。
- `α^{I}_F + β^{I}_F + γ^{I}_F`が無制限の支配力を作らないようforum policyとprotocol hard cap双方で制限する。最終的な上限は外側の`\min(I_{\max,F},\ \cdot)`であり、`α^{I}_F + β^{I}_F + γ^{I}_F`の値によらず`I_{s,F,e}\le I_{\max,F}`が成立する。`I_{\max,F}`は`I_{\mathrm{protocol\_max}}`を超えてはならない。上付き`I`はインフラ経路の係数であることを示す。これらは第2.4節の`early_access_rate=γ_F`とは別の量であり、`γ_F`と同一の記号で書いてはならない。

`α^{I}_F`、`β^{I}_F`、`γ^{I}_F`及び`I_{\max,F}`は、本節で定義するforum policy object `ResourceContributionPolicy`が定める。`I_{\max,F}`は`I_{\mathrm{protocol\_max}}`を超えてはならず、超えるpolicyを拒否する。`ResourceContributionPolicy`はforum genesisのフィールドではない。

インフラ寄与は、既存AssetScoreを置換する乗法形ではなく、既存AssetScoreへ加算する加算項として接続する。

\[
\mathrm{InfrastructureAdjustment}(S,F,e)
=
A_{max}(F,t)
\frac{I_{s,F,e}}{10000}
\]

`I_{s,F,e}`はbasis pointのpolicy値のまま維持し、`A_{max}`単位への換算は上式の`/10000`だけで行う。加法形を採る理由は、加算項が既存の点数に依存しないためである。`AssetScore`が0であるdepth=Mの新規参加者にもインフラ貢献の対価が発生し、積極的なインフラ貢献の動機になる。乗法形\(\lfloor \mathrm{AssetScore}\cdot(10000+I)/10000\rfloor\)では、既存点数が0の参加者の利得が0になり、この動機が生じない。

`InfrastructureAdjustment`は`A_{max}`比例の係数`I_{s,F,e}`で加算されるため、第7.6節の`A_{max}`比例係数和の上限（C4）へ`I_{\mathrm{protocol\_max}}`として算入する。したがって\(0\le \mathrm{InfrastructureAdjustment}(S,F,e)\le A_{max}(F,t)\cdot I_{\mathrm{protocol\_max}}/10000\)でなければならない。

#### 7.19.5 接続先の制限

RCSを使える場所と使えない場所を明示する。

| 用途 | 可否 | 規則 |
|---|---|---|
| AssetScoreへの加算項 / Reachの補助 | 可 | `AssetScore`への加算項`InfrastructureAdjustment`（第7.19.4節）。上限付き、epoch限定、既存AssetScoreの置換禁止 |
| asset distributionの可用性表示 | 可 | receipt / auditに基づく |
| discovery rankingの品質補助 | 可 | proof検証済み・freshなproviderに限定 |
| storage / index ServiceOfferの収益機会 | 可 | 実サービス取引とPaymentSettlementを必要とする |
| Forum Revenue Pool | 間接のみ | Poolの金銭原資・weight ruleを勝手に変更しない |
| Civic Vote票数 | 不可 | storage/computeで市民票を増やさない |
| Soul authority / root authority | 不可 | 一切の権限を与えない |
| ALR原資・率 | 不可 | Asset Lineage Royaltyへ影響しない |
| SeedAllocationの未使用予算 | 不可 | storage寄与からseedを生成しない |

#### 7.19.6 未来の計算資源（schema予約）

本仕様には`ComputeCapabilityAdvertisement`、`ComputeJob`、`ComputeResult`、`ComputeVerification`をreserved schemaとして追加するが、初期版は`compute_contribution_bps = 0`とする。GPU、CPU、VRAM、FLOPS、宣言稼働時間には点を与えない。`ComputeVerification.result = success`と明確なverifierがある`verified_work_units`だけが、将来の`C`候補になる。任意AI推論の「実行したこと」を安価かつ普遍的に証明できない間は、compute contributionをゲームscoreに接続しない。

### 7.20 Marketing Frontier（広告可能集合と実行可能アクション計画）

asset publisher / seller / 正規再販者は、自分のassetまたは正規販売offerについて、現在どのforum / segmentに何人の購入候補者、広告可能者、配送可能者がいるか、さらに自分が次に実際に実行できるprotocol actionにより、どの条件を満たした後、どのforum / segmentの何人へ広告可能になるかを、証明可能かつ実行可能な形で知ることができる。この機構をMarketing Frontierと呼ぶ。

#### 7.20.1 三つの集合を厳格に分離する

購入候補集合: asset `a`、販売 / 公開対象forum `F`、時刻`t`における購入候補集合は、既存`Candidates`を拡張して次で定義する。

\[
\mathrm{PurchaseCandidates}_{a,F,t}
=
\{S \mid
\mathrm{ActiveMember}(S,F,t)
\land
\mathrm{AssetScore}(S,F,t) \ge \theta_a
\land
\neg\mathrm{Granted}(S,a,t)
\land
\mathrm{CanAcquire}(S,a,F,t)
\}
\]

ここで`CanAcquire`は、asset access policy、価格、通貨、forum policy、Civic / eKYC requirement、PressRoom / invitation / membership requirement、offer availability、commercial constraintsを評価する。`PurchaseCandidates`は「購入・無料取得の条件を満たし得るSoul」であり、広告を受信することを意味しない。

広告可能集合:

\[
\mathrm{AddressableTargets}_{a,F,t}
=
\{S \in \mathrm{PurchaseCandidates}_{a,F,t} \mid
\mathrm{AdOptIn}(S,t)
\land
\mathrm{AdCategoryAllowed}(S,a,t)
\land
\mathrm{ForumAdPolicyAllows}(S,F,t)
\land
\mathrm{SellerNotBlocked}(S,\mathrm{seller},t)
\land
\mathrm{RecipientRateLimitAvailable}(S,t)
\}
\]

`AddressableTargets`は、販売者が実際に広告メッセージを送信する資格を持つtargetの集合である。

配送可能集合:

\[
\mathrm{DeliverableTargets}_{a,F,t}
=
\{S \in \mathrm{AddressableTargets}_{a,F,t} \mid
\mathrm{HasValidDeliveryEndpoint}(S,t)
\land
\mathrm{DeliveryRouteHealthy}(S,t)
\}
\]

delivery routeはGaia P2P inbox、Gaia application mailbox、forum notification inbox等の上位protocol routeである。node間の各HTTP hopはgaia-networkのDeviceIdを宛先とする。Gaia application mailboxの保存・認可・receiptはGaia上位サービスの責務であり、Iroh relayはmailboxを提供しない。DeviceIdの解決、online観測又は接続成功だけでは受信Soulのidentity、広告認可又はdurable deliveryを証明しない。HasValidDeliveryEndpointは期待するSoul/Bodyへ検証可能なendpointと必要な上位認可があること、DeliveryRouteHealthyは評価時点の有界な観測を示す。delivery結果は上位receiptで確定し、候補のオンライン性を保証と解釈しない。

常に次が成り立つ。

\[
\mathrm{DeliverableTargets}
\subseteq
\mathrm{AddressableTargets}
\subseteq
\mathrm{PurchaseCandidates}
\]

#### 7.20.2 現在値・action後増分・segment開示

planは少なくとも`current_purchasable_count`、`current_addressable_count`、`current_deliverable_count`を示し、対応するcheckpoint、asset policy、offer、public discovery policy、recipient advertising policy、rate-limit stateに対して再計算可能でなければならない。

action stepの`expected_*_delta`は次の二種類を区別する。

1. **exact committed delta**: actionが成功して対象checkpointに反映されたとき、変更対象が完全に決定できる場合。
2. **conditional / bounded delta**: 外部consent、future checkpoint、recipient delivery status、dynamic market stateにより変わる場合。

`executable_now` stepであっても、実行後のtarget数が外部stateにより変動するなら、`expected_delta`を確定値として表示してはならない。代わりに`minimum_delta`、`maximum_delta`、`current_snapshot_delta`、`uncertainty_flags`を返す。ただし、広告対象拡張に関する「今すぐ実行」のUXは、少なくとも`current_snapshot_delta`がproof-backedである必要がある。

対象segmentは、原則として次でのみsellerに開示する: forum id、asset/category policy class、anonymous segment identifier、count、score / condition distribution bucket、ad policy status bucket、proof commitment。個々のSoulがassetを未購入である事実、個々のSoulの正確なAssetScore、private forum membership、eKYC identity、block list、recipientの広告受信設定の詳細は開示してはならない。個別recipient identityは、recipientが`AdvertisementDeliveryPolicy`においてrecipient-discoverable addressabilityを明示opt-inした場合だけ、最小限に解決できる。

販売者に表示する数値は、必ず次を区別する。

```text
Purchase candidates: 条件を満たす未取得候補数
Addressable targets: opt-in・policy・rate limitを通過して広告を送れる候補数
Deliverable targets: 現時点で配送routeが利用可能な広告対象数
```

`Purchase candidates`を`広告可能人数`と表示してはならない。実行可能な次の手は、第12章の`ExecutableMarketingPlan`として、proof・draft・費用・期限・actor・consent・再検証条件に束縛して扱う。

### 7.21 Asset Publication Mechanics（アセット公開の力学）

アセットの作成・公開・継続利用可能化・独立他者への実効価値提供は、Gaiaにおける**最も強い自己利益の一つ**とする。従来の「弱い寄与」「小さな`PublicationBonus`」（いずれも廃止済みの名称）という位置付けは廃止する。公開の事実そのものによる基本報酬と、利用・引用・派生等による追加報酬を分離し、公開報酬を`AssetScore`の主たる構成要素としてAsset Access、Candidates、Reach、告知・販売・協業機会へ大きく接続する。

非干渉は維持する。本節の寄与は`Q`、depth、`CanIssue`、`CanIssueTo`、`A_seed`、Civic Voteの票重み、trust epoch、eKYC tier、Root 権限、`PaymentSettlement`、`PayoutEntitlement`、ALRの金額計算、`SeedCreditLedger`のhigh-water規則そのものを直接変更しない。

正の寄与は、単なる登録、自己アクセス、自己購入、共通本人性を持つ主体間の循環取引、未確定決済、無権限派生、重複利用、又は可用性・監査不備から生じてはならない。Gaiaはassetの内容的な良し悪しを主観的に判定してはならず、「役立った」の判定は本節が定める検証可能な外部的事実に限定する。

すべての計算は浮動小数点ではなく、basis point・固定小数点・有理数による決定的な整数演算とし、丸めは既存の最大剰余又は明示的な切捨て規則に従う。canonical object schemaは第22.8節、受理述語は第23.24節、reject codeは第22.2節、テスト要件は第25章に定める。

#### 7.21.1 公開そのものの報酬（PublicationBaseScore）

`PublicationBaseScore`は、利用実績の有無にかかわらず、公開の事実そのものに与える基本報酬である。Soul `S`、forum `F`、評価epoch `e`、公開アセット`a`について次で定義する。

\[
\mathrm{PublicationBaseScore}(a,S,F,e)
=
\mathrm{value}(a)
\frac{\mathrm{publication\_base\_bps}}{10000}
\]

基準量は当該アセット自身の認定価値`value(a)`である（C1）。`A_{max}(F,t)`を基準量にしてはならない。これにより同一のアセットはforumの大小にかかわらず同一の基本報酬を与え、豊かなforumでの中身の薄いアセットの量産が有利にならない。

`PublicationBaseScore`は非負であり、`value(a)=0`のアセットには0を与える。`AssetRecord.value`の認定レビュー（第7.3節、第13.9節）を通過していないアセットは、公開資格を満たしても基本scoreの対象にならない。`AssetRecord.value`は創設者の自己申告では決まらない（第7.3節）。

`EligiblePublication(a,S,F,e)`は、正式な`AssetRecord`、検証可能なcontent、公開可能なaccess条件、鮮度内のavailability evidenceを満たすactive assetであることを要求する。`EligiblePublication`はscore閾値ではない。点数による公開資格条件を含んではならない。公開assetが取得不能、監査切れ、inactive、expired、revoked又はrights-revokedになった場合、対応する基本scoreは0又はpolicyに従う減衰値とする。

`\mathcal{A}_{S,F,e}`を、当該Soulが当該forum・当該epochにおいて公開している`EligiblePublication`なactive assetの集合とする。件数上限も上位選抜も設けない。`\mathcal{A}_{S,F,e}`の認定価値の総和を次で定義する。

\[
V_{S,F,e}
=
\sum_{a\in \mathcal{A}_{S,F,e}}
\mathrm{value}(a)
\]

`\mathcal{A}_{S,F,e}\subseteq ActiveAssets(F,t)`であるため、常に次が成り立つ。

\[
0\le V_{S,F,e}\le A_{real}(F,t)\le A_{max}(F,t)
\]

\[
\mathrm{PublicationBaseTotal}(S,F,e)
=
V_{S,F,e}
\frac{\mathrm{publication\_base\_bps}}{10000}
\]

**量産が有利にならない理由**: 係数`publication_base_bps`は、Soulの当該epoch・当該forumにおける公開済み認定価値の総和`V_{S,F,e}`に対して一度だけ適用する。したがって、認定価値の総和が`V`である`N`個のアセットを公開することと、認定価値`V`の1個のアセットを公開することは、`N`によらず厳密に同一の基本scoreを与える。価値の総和が同じである限り、公開件数を増やすことは得にならない。これは件数上限でも上位選抜でもなく、集計の形そのものによって成立する。

同じ理由により、`\mathrm{value}(a)=0`のアセットを何件公開しても基本scoreは増えない。`AssetRecord.value`は公開者の自己申告では決まらず、第7.3節・第13.9節の認定レビューを通過しなければ`V_{S,F,e}`へ算入されない。量産が得になる経路は、認定価値の総和を実際に増やす経路だけである。

一件目の有効公開は、`\mathrm{value}(a)>0`である限り`V_{S,F,e}`を直ちに増やし、明確な戦略的優位を与える。

公開の基本報酬の率は、公開以外の経路が同じ基準量に与える率を上回らなければならない。比較は率（basis point）で行い、対象は当該forumのgenesisが実際に宣言したパラメータ値に限る。

\[
\mathrm{publication\_base\_bps}
>
\max\left(
10000\gamma_F,\
\text{単発citationの率},\
10000\chi,\
I_{\mathrm{protocol\_max}}
\right)
\]

基準量が経路ごとに異なるため（C1: 公開は`value(a)`、先駆者・育成・インフラは`A_{max}`）、これは率の比較であって絶対点の比較ではない。絶対点で先駆者bonusを上回るのは、`value(a)`が`A_{max}`に対して無視できない大きさの場合である。「公開の基本報酬が常に先駆者bonusの絶対額を上回る」と主張してはならない。

`\gamma_F`及び`\chi`は第2.4節で上限が定義されていない。genesisの宣言値が大きいforumでは、第7.21.6節の係数和の上限が優先し、`publication_base_bps`と6つの`*_weight_bps`の和を含む`A_{max}`比例係数の総和が厳密に10000 bps未満でなければならない。この比較を満たすために係数和の上限を緩めてはならない。

#### 7.21.2 実利用の追加報酬とPublicationScore

`PublicationUtilityScore`は、公開assetが役立ったことの検証可能な追加証拠に与える報酬である。次の6種の外部的事実だけを追加証拠として扱う。

- `independent_use`: 独立Soulによる利用
- `citation`: 別assetからの引用、依存又は派生
- `derivative`: 正当な派生
- `civic_need`: `CivicNeedAsset`の正当な充足
- `finalized_demand`: finality後の独立購入
- `availability_maintenance`: 継続した保存、配布又はdiscoveryへの寄与

\[
\mathrm{PublicationUtilityScore}(S,F,e)
=
\sum_{a\in \mathcal{A}_{S,F,e}}
\sum_{k}
\mathrm{value}(a)
\frac{\mathrm{utility\_weight\_bps}(a,k)}{10000}
\]

`\mathrm{utility\_weight\_bps}(a,k)`は第7.21.6節の`independent_use_weight_bps`、`citation_weight_bps`、`derivative_weight_bps`、`civic_need_weight_bps`、`finalized_demand_weight_bps`及び`availability_maintenance_weight_bps`を指す。各項の基準量も当該アセット自身の認定価値`value(a)`であり、`A_{max}(F,t)`を基準量にしてはならない（C1）。

self-access、self-purchase、同一Soul、同一controller、verified common identity、循環引用、重複evidence、refund・chargeback・dispute中の取引は、正の利用証拠から除外する。

`PublicationScore`は、基本報酬と実利用報酬の和とする。`A_{max}`比例の個別上限を置かない。

\[
\mathrm{PublicationScore}(S,F,e)
=
\mathrm{PublicationBaseTotal}(S,F,e)
+
\mathrm{PublicationUtilityScore}(S,F,e)
\]

\[
\mathrm{PublicationScore}(S,F,e)
\le
A_{max}(F,t)
\frac{\mathrm{publication\_base\_bps}+\sum_k \mathrm{utility\_weight\_bps}(k)}{10000}
\]

第7.21.6節の係数和の上限は、`publication_base_bps`と6つの`*_weight_bps`の和を含む`A_{max}`比例係数の総和を厳密に10000 bps未満に保つ。したがって`PublicationScore`を含む全経路の和は厳密に`A_{max}(F,t)`未満であり、`AssetScore`の`A_{max}`上限は公開経路に対して決して束縛しない。

**同一のアセットがforumの大小で優劣にならない理由**: `PublicationBaseScore(a,S,F,e)=\mathrm{value}(a)\cdot\mathrm{publication\_base\_bps}/10000`も、`PublicationUtilityScore`の各項も、基準量は`value(a)`であって`A_{max}(F,t)`ではない（C1）。公開経路に`A_{max}`比例の個別上限を置かず、係数和の上限によって`AssetScore`全体が`A_{max}`未満に収まるため、同一のアセットは、forumの`A_{max}`の大きさにかかわらず、同一の基本報酬と同一の実利用報酬を与える。

`publication_score_cap_bps`のような`A_{max}`比例の個別上限、又は`max_publication_assets_counted`のような件数上限を、公開経路へ導入してはならない。個別上限を導入すると、`A_{max}`の小さいforumで同一アセットの報酬が先に切り捨てられ、forumの大小が優劣を生む。件数上限を導入すると、量産の抑制を集計の形ではなく上限に依存させることになる。

次を必須条件とする。`A_{max}(F,t)>0`かつ`EligiblePublication(a,S,F,e)`かつ`PublicationUtilityScore(S,F,e)=0`の場合でも、`PublicationBaseScore(a,S,F,e)>0`かつ`PublicationScore(S,F,e)>0`でなければならない。`A_{max}(F,t)=0`のとき、`A_{max}`比例のscore contributionはすべて0であり（C2・C3）、`PublicationBaseScore`も`value(a)=0`により0である。したがってこの必須条件は`A_{max}(F,t)>0`を前置しなければ成立しない。`A_{max}(F,t)=0`のforumでは、公開の事実は0点であることを明記する。

公開の基本報酬を`AssetScore`の主たる構成要素とする方向性は維持し、`publication_base_bps`は従来のpublication関連capより大幅に引き上げる。

`AssetScore`は本節で再定義しない。`AssetScore`の正規式は第7.6節の5項を`A_{max}(F,t)`で上限した式であり、`PublicationScore`はその第4項である。`AssetScore`自体を`min(10000, ...)`で上限化する規則は存在しない（C3）。

#### 7.21.3 独立利用の逓減

`U`は利用者数をそのまま使ってはならない。`n`を有効な独立利用者数、`N=10`を計上上限とし、`U(n)=log(1+min(n,N))/log(1+N)`に相当する値を用いる。コンセンサス実装では浮動小数点対数を使用せず、`n=0..10`の正規化済み整数テーブル、有理数近似を明示した決定的な整数関数、又は既存のgaia-core固定小数点演算規則を用いる。`U(0)=0`、`U(10)=1`、値は単調非減少、追加一人あたりの限界増分は非増加とする。

`U`は`independent_use_weight_bps`（第7.21.6節）の係数の定義であり、基準量は当該アセット自身の認定価値`value(a)`とする。`A_{max}(F,t)`を基準量にしてはならない（C1）。

```text
n :   0    1    2    3    4    5    6    7    8    9   10
U : 0.0  ...  ...  ...  ...  ...  ...  ...  ...  ... 1.0   (monotone nondecreasing, non-increasing increments)
```

（canonical値は整数fixed-pointテーブルとしてgaia-coreが固定する。）

#### 7.21.4 可用性・鮮度

`H`は、アセットが一度売れた又はアクセスされた後に放置される戦略を有利にしてはならない。最低限、アクティブなAssetRecord、有効なProtectedContent又は暗号化manifest・必要なKeyEnvelope・ContentAccessGrantの整合、要求されるStorageReceiptおよびStorageAuditのfreshness、関連するAssetAccessGrantの未取消、失効・権利撤回・重大な整合性失敗・利用不能状態の不存在を要求する。可用性又は監査が失われた時、当該epoch以後の正の`H`は増加してはならない。長期の可用性喪失後は`H=0`となる明示的な失効条件を持つ。reference profileでは、freshness window外は寄与0、window内の劣化は非増加な固定小数点係数とする。

`H`は`availability_maintenance_weight_bps`（第7.21.6節）の係数の定義であり、基準量は当該アセット自身の認定価値`value(a)`とする。`A_{max}(F,t)`を基準量にしてはならない（C1）。

#### 7.21.5 各経路との関係

- **A_seed・SeedCreditLedger**: `AssetPublicationEvidence`のうち、Need充足、独立利用、正当な派生、正当な引用、可用性は、`AssetRecord.value`のレビュー又は価値認定時に考慮され得る補助根拠である。ただし`AssetPublicationEvidence`は`AssetRecord.value`を自動的に上書きしない。`CreditedHighWater`を超える正の価値増分のみが`NewCreditableRealValue`に入り得る。`PublicationScore`をA_seedへ再変換してはならない。A_seedへの経路は既存の認定済み実価値増分だけに基づく。
- **CitationBonus**: 既存の`CitationBonus`へ、アセットレベルの正当な依存・引用を追加できる。アセット由来の追加部分の上限は`asset_citation_extension_cap_bps`であり、protocol hard cap `ASSET_CITATION_EXTENSION_CAP_BPS = 120` bpsを超えてはならない（第7.21.6節）。つまり`asset_citation_extension_cap_bps <= ASSET_CITATION_EXTENSION_CAP_BPS`を要求し、超える値を宣言するgenesis又はpolicy objectをgenesis検証・policy検証で拒否する。これは既存のフォーラムcitationの意味論とcapを壊さない。上限計算の入力は第7.10節の\(\kappa\cdot AssetAccess_{direct}^{cap}\)である。`CitationBonus`は`AssetScore`の項ではなく`AssetAccess_{total}`の項であるため、`asset_citation_extension_cap_bps`を`AssetScore`の係数和に算入しない（C4）。
- **CultivationBonus**: 既存の`CultivationBonus`へ、`AssetMediatedCultivationContribution`を追加できる。アセット媒介の追加部分は\(\min(\chi\cdot A_{max}(F),L_c)\)の**外側に**加算する。したがって`CultivationBonus`の上界は\(\min(\chi\cdot A_{max}(F),L_c)+A_{max}(F)\cdot\mathrm{asset\_mediated\_cultivation\_extension\_cap\_bps}/10000\)であり、追加部分の上限は\(A_{max}(F)\cdot\mathrm{asset\_mediated\_cultivation\_extension\_cap\_bps}/10000\)であり、`asset_mediated_cultivation_extension_cap_bps`はprotocol hard cap `ASSET_MEDIATED_CULTIVATION_EXTENSION_CAP_BPS = 100` bpsを超えてはならない（第7.21.6節）。つまり`asset_mediated_cultivation_extension_cap_bps <= ASSET_MEDIATED_CULTIVATION_EXTENSION_CAP_BPS`を要求し、超える値を宣言するgenesis又はpolicy objectをgenesis検証・policy検証で拒否する。この追加部分は`A_max`比例で`AssetScore`へ加算されるため、第7.6節の`A_max`比例係数和の上限（C4）へ`asset_mediated_cultivation_extension_cap_bps`として算入する。同一利用者Soulの成熟は公開者Soulとアセット媒介貢献種別の組に対して一度しかcreditしない。
- **Resource Contribution Score**: 公開アセットの独立需要は、第三者ノードの保存・索引・配信・監査の価値を評価する補助根拠になり得る。RCSの対象は実際に提供した第三者Soul又はDeviceIncarnationであり、公開者自身が自アセットを自分のノードで保存・索引・配信した事実だけでは公開者自身のRCSは増えない。需要根拠による第三者RCSの追加寄与はreference profileで160 bps以下。RCSから`AssetScore`への接続は、第7.19.4節の加算項`InfrastructureAdjustment`による。
- **CivicNeedAsset**: `AssetRecord.civic_need_ref`によりNeedへ紐付くアセットは、Needが検証済みに充足・閉鎖された場合、公開実効価値の根拠になり得る。自己充足（Need作成者・投票者・供給者が同一Soul又はverified common identity）は正の根拠にしない。
- **Commerce・ALR・Forum Revenue Pool**: アセット公開・利用・Need充足・引用・派生が`PublicationScore`等の根拠となっても、PaymentReceipt、PaymentSettlement、ALR、Forum Revenue Pool contribution、PayoutEntitlement、返金、異議、チャージバックの金額又は最終性を変更しない。`PublicationScore`を理由に販売手数料、ネットワーク維持費、Forum Revenue Pool rate、ALR ancestor pool rate、BeneficiaryRule、PayoutEntitlementを変えてはならない。
- **非干渉の列挙**: 本節の非干渉条件は、`AssetAccess_{total}`と`CitationBonus`の上限\(\kappa\cdot AssetAccess_{direct}^{cap}\)を、互いに独立な項目として列挙しなければならない（第7.10節、第24.15節）。`PublicationScore`及び`InfrastructureAdjustment`は`CitationBonus`の上限計算の入力になってはならない。`PublicationScore`又は`InfrastructureAdjustment`を増やしても、`CitationBonus`の上限は変化しない。

#### 7.21.6 ポリシーとパラメータ

Protocol hard capは次のとおり。

```text
ASSET_CITATION_EXTENSION_CAP_BPS = 120
ASSET_MEDIATED_CULTIVATION_EXTENSION_CAP_BPS = 100
I_PROTOCOL_MAX <= 3000
MAX_INDEPENDENT_USERS_COUNTED_PER_ASSET_EPOCH = 10
MINIMUM_PUBLICATION_AGE_EPOCHS = 2
MAX_PUBLICATION_DEMAND_RCS_BPS_PER_PROVIDER_EPOCH = 160
```

`ASSET_CITATION_EXTENSION_CAP_BPS`及び`ASSET_MEDIATED_CULTIVATION_EXTENSION_CAP_BPS`は、forum genesis、`AssetPublicationIncentivePolicy`及び実装のいずれも広げられないprotocol hard capである。genesis検証及びpolicy検証は次を強制し、違反するgenesis又はpolicy objectを`ResourceLimitExceeded`等で拒否する。

```text
asset_citation_extension_cap_bps <= ASSET_CITATION_EXTENSION_CAP_BPS
asset_mediated_cultivation_extension_cap_bps
  <= ASSET_MEDIATED_CULTIVATION_EXTENSION_CAP_BPS
```

従来の公開経路cap `MAX_PUBLICATION_BONUS_BPS_PER_SOUL_FORUM_EPOCH`（300 bps）、`MAX_PUBLICATION_BONUS_BPS_PER_ASSET_EPOCH`（45 bps）及び`MAX_PUBLICATION_SCORE_PATH_BPS_PER_SOUL_FORUM_EPOCH`（520 bps）は廃止する。公開経路の`A_max`比例係数は、`value(a)`に適用する基準量の率`publication_base_bps`と6つの`*_weight_bps`の和である（C4）。公開経路に`publication_score_cap_bps`のような`A_max`比例の個別上限、又は`max_publication_assets_counted`のような件数上限を置かない。`asset_citation_extension_cap_bps`は`CitationBonus`の上限として`AssetAccess_{total}`側で作用するため、`AssetScore`の係数和には算入しない。`asset_mediated_cultivation_extension_cap_bps`は`CultivationBonus`の外側に加算されるため算入する。

フォーラムgenesis又は後方互換なpolicy objectに、`AssetPublicationIncentivePolicy`を設定してよい。必須のpolicyフィールドと、各basis point値の適用対象は次のとおり。

```text
enabled                             -> false のとき新規公開由来の加点を0とする
publication_base_bps                -> value(a) に適用
minimum_publication_age_epochs
availability_freshness_window
availability_decay_table
required_retrievability_quorum
required_failure_domain_count
independent_use_weight_bps          -> value(a) に適用
citation_weight_bps                 -> value(a) に適用
derivative_weight_bps               -> value(a) に適用
civic_need_weight_bps               -> value(a) に適用
finalized_demand_weight_bps         -> value(a) に適用
availability_maintenance_weight_bps -> value(a) に適用
asset_citation_extension_cap_bps
asset_mediated_cultivation_extension_cap_bps
```

`publication_base_bps`は、公開が実際にGaiaの最有力戦略となるよう、従来のpublication関連capより大幅に引き上げる。`publication_base_bps`、6つの`*_weight_bps`及び`asset_mediated_cultivation_extension_cap_bps`は次を満たさなければならない。満たさないgenesis又はpolicy objectを拒否する。

```text
10000 * (1 - exp(-kappa_1))
  + publication_base_bps
  + independent_use_weight_bps + citation_weight_bps + derivative_weight_bps
  + civic_need_weight_bps + finalized_demand_weight_bps
  + availability_maintenance_weight_bps
  + 10000 * gamma_F + 10000 * chi
  + asset_mediated_cultivation_extension_cap_bps + I_protocol_max < 10000
```

参照profileでは、この係数和を8000 bps以下に保つことを推奨する。

この係数和の上限は、`AssetScore_{base}`の係数上限`10000\cdot(1-e^{-\kappa_1})`を含む`A_max`比例の全経路の和を、厳密に10000 bps未満に保つ。`EarlyBonus`・`CultivationBonus`の実効係数は絶対上限`L_F`・`L_c`により`\gamma_F`・`\chi`以下であるから、この和はどの`A_max`・どの`proximity_{eff}`に対しても10000 bps未満である。したがって`AssetScore`の`A_max`上限はどの経路に対しても束縛せず、公開報酬がforumの`A_max`の大きさによって切り捨てられることはない。`\kappa_1`は本上限を通じて有界であり、`AssetScore_{base}`が`A_max`を使い切って公開経路の余白を消すことはない。6つの`*_weight_bps`は非負の正規化済み有理数又は整数basis pointとし、個別の上限を設けない。上限は係数和だけが定める。

参照profileでは、公開経路の係数和（`publication_base_bps`と6つの`*_weight_bps`の和）が、`10000\gamma_F`、`10000\chi`、`asset_mediated_cultivation_extension_cap_bps`及び`I_{\mathrm{protocol\_max}}`のそれぞれより大きいことを推奨する。公開経路が`A_max`比例の係数和のうち最大の配分を持つためである。

既存の`AssetPublicationIncentivePolicy`又はgenesisが、廃止された`publication_score_cap_bps`若しくは`max_publication_assets_counted`を宣言している場合、それらを省略時既定値として解釈し、参照を差し替えない。宣言値は公開報酬の計算に用いず、係数和の上限の検査にも算入しない。参照を差し替えるとgenesisのcanonical encodeが変わり`forum_id`が変わる（C6）。

`enabled=false`の場合、すべての新規公開由来の直接スコア加点は0とするが、既存の`AssetRecord.value`、A_seed、ALR、Commerce、RCS、Citation、Cultivationの既存機能を無効化しない。

初期導入は、Heat Stabilizerの展開思想に倣い、新policyは初期状態で`observe_only`又は同等の非作用状態から開始し、観測期間中は`AssetPublicationEvidence`と反実仮想の`PublicationContributionState`を作成できるが実AssetScoreを変更しない。soft activationには署名済みpolicy、明示的rollout cohort、kill switch、rollback、評価指標、事前定義済みリリース基準を要求する。本節の公開報酬機構自体はHeat Stabilizerではない。

---

## 8. 申請と決済のシーケンス

### 8.1 root_entry申請

`membership_ekyc_policy=verified_required`のforumでは、`root_entry`申請手続を次とする。

1. 申請者Soulは、対象forumのgenesisを取得し、`membership_ekyc_policy`を確認する
2. 申請者は、`forum_membership` purposeを持つ有効な`IdentityBindingCredential`、eKYC service authorization、失効状態proof、Soul identity binding proof、必要なleaseを使い、`ForumEkycParticipationProof`を生成する
3. 申請者は、`root_entry` applicationに`ForumEkycParticipationProof`を添付する
4. rootは、通常のroot issuance capacity、authority、health、Soul lease、root ledger条件に加えて、申請者の`ValidForumEkycParticipationProof`を`issued_at`時点で完全オフライン検証する
5. eKYC proofが無効、不足、失効、撤回、Soul binding不一致、purpose不一致、assurance不足又はuniqueness scope不一致なら、rootは`root_entry`を発行してはならない
6. rootが承認した場合、`root_entry`は`membership_ekyc_proof_ref_optional`を含まなければならない
7. 受領者は、`root_entry`、genesis、root ledger chain、`ForumStateCheckpoint`、`StateProofEnvelope`及びeKYC participation proofを受け取る
8. 受領者は、forum health leaseを確立し、active membershipかつ有効eKYC状態である区間だけを`T_actual`に積算する

`membership_ekyc_policy=not_required`のforumでは、eKYC proofの生成・添付・検証及び`membership_ekyc_proof_ref_optional`の要求を、`root_entry`のprotocol必須条件にしてはならない。この場合の手続は、root発行台帳の通番がB以内であることの検証、root自身の通常authorityゲート（第5.1節）の確認、info面の審査、`root_entry`・台帳連鎖・genesis・直近の`ForumStateCheckpoint`を含む`StateProofEnvelope`の受け渡し、及び受領者による`TemporalHealthLease`の確立である（第4.2節、第5.1節）。

### 8.1.1 親ありforumのSeedAllocation

親ありforumを作るcreatorは、各親forumについて、child genesisより厳密に前であり、その親の`state_freshness`内にある確定済みcheckpointを選ぶ。creatorはそのcheckpointにおいて参加中でなければならず、parent forumに対する`SeedAllocation`のorigin lotと未使用残高を示すproofを提示する。

1. creatorは、親forum Pの`seed_allocation_registry_root`に対し、origin lot、連続するallocation sequence、未使用残高、およびchild genesis草案を提示する
2. gaia-coreは、origin lotが実アセット由来の未重複寄与だけから作られたこと、allocationが過去の消費と重複しないこと、`allocated_amount`が未使用残高を超えないことを検証する
3. parent forum rootは、正当なallocationを含む新しい`ForumStatePayload`を最終化する。allocationはこの親payloadに固定される
4. creatorは、最終化されたallocation、親checkpoint、membership proof、親genesisをchild genesisへ含める
5. child genesisは、すべてのallocationを合算してA_seedを固定する

親forum rootはallocationを恣意的に承認してよいわけではない。rootが最終化できるのは、canonicalなorigin lot、連続sequence、未使用残高、child genesis束縛を満たすallocationだけである。rootが競合allocationを最終化した場合は第13章の観測済みfork規則と`EquivocatedSeedAllocation`により拒否される。

### 8.2 一般発行者への申請

1. 申請者は発行可能な一般nodeへ`CommunityCertificateRequest`を送る（forum、requester、intended issuer、`pre_state_checkpoint_ref`、envelope参照、任意のmessage）。requestにtarget depth等のdepth値は含めない
2. 発行者はrequest IDを発行してpendingを返す
3. 申請者はget_certで保有証明書、Qの閾値証明、同一pre-state checkpoint Pの`StateProofEnvelope`を提示する
4. gaia-coreはPで`CanIssue(I,F,t_P)`および`CanIssueTo(I,S,F,t_P)`（ActiveMember、`depth(I,F,t_P)<depth(S,F,t_P)`、`I≠S`、`ValidCommunityIssuanceContext`）を検証し、双方の通常authorityゲート（唯一のactive body、有効なSoulEpochLease、`healthy`なTemporalHealthLease、authority操作列の連続性）を確認する
5. 発行者はinfo面だけを審査し、必要なら追加資料を求める
6. すべてが通れば、Pを評価checkpointとしてcommunity証明書を発行する。証明書にdepth値（target/requested/approved/projected）は含めない
7. 同じセッションでsubjectからissuerへreciprocal証明書を自動発行できる
8. 双方は証明書と`StateProofEnvelope`を保存する
9. 証明書が後続checkpointのQ-setへ新規issuer leafとして採用された場合に、申請者のQへ寄与し得る。申請者のdepthはそのcheckpointで再計算される。申請者が独立に成熟した時点で、発行者のCultivationBonusの対象となり得る

`community`の発行は、上記の手順に加えてforum参加eKYCの条件を満たさなければならない。`CanIssueTo`へ続く条件を次で定義する。`applicant_proof`は、申請者が`CommunityCertificateRequest`に`StateProofEnvelope`と共に添付する`ForumEkycParticipationProof`（第17.9節）である。

```text
CanIssueToEkycRequiredForum(I, S, F, t) =
    CanIssueTo(I, S, F, t)
    AND (
        membership_ekyc_policy(F) = not_required
        OR
        ValidForumEkycParticipationProof(
            applicant_proof,
            S,
            F,
            t
        )
    )
```

issuerは、`membership_ekyc_policy=verified_required`のforumにおいて、申請者が有効な`ForumEkycParticipationProof`を提示しない限り`community`を発行してはならない。`membership_ekyc_policy=not_required`のforumでは、eKYC proofの添付・検証を`community`のprotocol必須条件にしてはならない。

issuerは、eKYC生データの提出又は外部eKYC serviceへのオンライン照会を要求してはならない。issuerが検証するのはproof bundleだけである（第17.9節）。

`CommunityCertificateRequest`は、Gaiaの通常証明書ではなく、通信上のephemeral requestまたは任意の不変request objectである。申請object、API、CLI、UI、レコメンド文のいずれにおいても、申請者がdepth値を指定・選択・承認依頼してはならない。requestには`pre_state_checkpoint_ref`を必須とし、発行者と申請者が「どの時点の状態で資格を評価したか」を一致させる。`target_depth`、`requested_depth`、`approved_depth`、`issuer_selected_depth`等をrequestに含めてはならない。

API・CLIはtarget depth入力を受け取ってはならない。表示用の応答には`current_depth`、`issuer_depth`、`can_issue_to`、`q_contribution_if_accepted`、`projected_depth_if_reflected`を含めてよい。ただし`projected_depth_if_reflected`は、署名対象のobject・certificate・checkpoint payloadのconsensus fieldにしてはならない（`CommunityProjectionUsedAsConsensus`）。

### 8.3 発行者選択UI

申請者のUIは候補ごとに、次の内容を表示する。発行資格の有効性（`CanIssueTo`）、申請者自身の現在の検証可能depth、候補issuerの現在depth、この証明書が次checkpointでQへ新規寄与した場合の予測depth、証明書の有効期間、価格、応答時間、審査条件。予測depthはadvisory-onlyであり、署名済みobject・checkpointのconsensus入力に含めない。

UIは「希望depthの選択」「issuerにdepthを承認してもらう」「この証明書はdepth Nを付与する」といった操作や表示を置いてはならない。root_entryはB枠が残る初期段階でのみ選択肢になる。forumが自律化した後、成熟度を速めたい申請者はQを増やせる一般発行者を選ぶ。

### 8.4 支払いと履行（Payment-ServiceとGaia Commerce）

支払いだけは、Owner setが認可した中央の**Payment-Service**（第18章）が処理する。外部決済レールは`stripe`に固定され、内部でStripe決済網（Stripe Connect）を利用する。利用者は外部サイトへ離脱する必要がない。

asset access、PressRoom会費、有料ブースト、Bank課金、eKYC課金など、利用者への課金は、共通のcommerce層（第19章）のOffer・Order・PaymentReceipt・Fulfillmentの四段構造を使う。

1. 利用者がアセット公開者（provider）へapplyを送る
2. 公開者がpendingとセッションIDを返す。必要な場合は`ServiceOffer`（価格・支払条件・履行条件）を提示する
3. 利用者が`ServiceOrder`を発注し、公開者は認可済みPayment-Serviceにセッション専用の支払いを要求する
4. クライアントは同一画面で決済UIを表示する
5. 利用者が支払う。Payment-ServiceはStripeの決済成功を確認した後、`PaymentReceipt`（支払い総額`gross_amount_minor`・通貨・購入者・対象・Order参照・支払い状態・認可chain）を署名する。Stripe実費手数料・Gaia維持手数料・Forum Revenue Pool contribution・受取人別配分の確定は`PaymentSettlement`が行う（第18章、第7.17節）
6. 利用者は`PaymentReceipt`を同じセッションのget_cert再送に含める
7. 公開者（またはgaia-core）はreceiptの支払い済み・支払い総額・通貨・購入者・対象・Orderへの束縛を、Payment-ServiceのauthorizationとOwner set commitmentに対して検証する
8. 条件充足時にproviderが`ServiceFulfillment`（または`ContentAccessGrant`等のサービス結果）を発行し、アセット利用や会員権を完了する

`PaymentReceipt`は`order_ref`、`target_ref`、購入者、支払い総額、通貨などに束縛し、同一Order・同一Stripe Chargeに二重の有効Receiptを作らない。消費済みreceiptの再利用は拒否する。第10章の有料ブースト・PressRoom会員費も、このcommerce層と同一の束縛規則を用いる。

支払い（`PaymentState`）と履行（`FulfillmentState`）は独立である。支払い済みでも、providerが履行を署名するまではサービス結果は得られない。`PaymentReceipt`はコンテンツ鍵や権利を直接発行せず、`ContentAccessGrant`発行の条件になる。支払い・履行のobjectは、第7.16節のとおりQ、depth、発行資格、AssetScore、seed、Candidates、Reachなどの入力にならない。

---

## 9. 実装上の不変条件

以下は実装・テスト・監査で必ず確認する。

- forum_idがgenesisの正規化済みバイト列ハッシュである
- nonceがgaia-core生成であり、創設者が指定できない
- genesisの数理パラメータが第2.4節の型・範囲・正規化規則を満たす
- `bootstrap_root_issuance_limit=B`が1以上の整数であり、参加経路を持たないB=0のforumを生成しない
- 親ありforumの`seed_cap`が必須の非負有限有理数であり、親なしforumでは0に固定される
- `state_freshness`が正の整数tickである
- `forum_chain`がforum_idの重複を許さない集合である
- consensus-criticalな計算に浮動小数点、NaN、無限大、実装依存の丸めを使わない
- 指数関数を使う比較とceilが第7.7節の決定論的区間評価で一意に確定し、確定不能なら拒否される
- root以外の最初の参加者がdepth=Mから始まる
- participation_anchorが最初の有効なroot_entryまたはcommunity証明書を不変に参照する
- 参照するcheckpointのcheckpoint_time時点で有効な参加証明書がないノードは参加中でなく、発行・認定・利用を行えない
- 現在参加を維持する限り、depthが署名距離ではなくT_actualとQから計算される
- issuer_depthが受領者depthを直接決める値として使われない
- issuer_depthがissued_at時点の再計算depthと一致する
- T_required(M)=0とA(0)=0が成立する
- 時刻が整数tickで比較される
- `expire>issued_at`である
- 発行資格の根拠が評価対象より厳密に過去の証明書だけからなる
- 証明書依存グラフの循環、時刻逆行、同一tick相互参照をTemporalCycleとして失敗させる
- root_entryとreciprocalがQ、depth前倒し、発行権、A_seed、CitationBonusの入力にならない
- rootがBを超えてroot_entryを発行できない
- root発行台帳の欠落、分岐、通番飛び、署名不正を失敗として扱う
- 一般発行者だけがcommunity証明書を発行できる
- CanIssueToが、CanIssue・ActiveMember・`depth(I)<depth(S)`・`I≠S`・ValidCommunityIssuanceContextのAND条件であり、Eligibleやtarget depthを条件に含まない
- Qが同一forum・有効・有資格・異なる一般issuerによるcommunity証明書だけを数える
- 同一issuer Soulからの複数証明書がQを複数増やさない
- Q_{-I}がQからissuer Iだけを除いた値であり、常にQ以下である
- issuer_chainとissuance_proofが完全オフラインで検証できる
- forum_chainが署名真正性、`issued_at(parent_certificate) < issued_at(child_genesis) < expire(parent_certificate)`、および作成時membership inclusionのすべてを検証する
- chain_depthとmax_depthにより再帰・バンドルサイズが有界である
- MissingObjectとHashMismatchを黙って通過させない
- ContentStoreが冪等である
- 各value(a)、A_seed、A_max、EarlyBonus、CultivationBonus、AssetScore、CitationBonusが非負有限である
- 空forumではA_max=0、EarlyBonus=0、CultivationBonus=0、AssetScore=0である
- EarlyBonusとCultivationBonusがforum外へ持ち出せず、Q等へ変換できない
- A_seedがAssetScore_realbaseだけを入力とし、既存seed、EarlyBonus、CultivationBonus、CitationBonusを再帰入力にしない
- `seed_credit_ledger_root`がcreator・asset lineageごとのcredit済み高水位をコミットし、各high-waterが単調非減少である
- origin lotが過去credit高水位を厳密に超える未creditのactive asset value部分だけを含み、assetの停止・value低下・過去credit水準までの回復で同じvalueを再creditしない
- A_seedが常に0以上seed_cap以下であり、親forumに実アセットがなければその親からのseed寄与が0である
- CultivationBonusが、独立成熟条件IndependentEligibleとQ_{-I}>=1の両方を満たす受領者の数だけに基づき、Cの増加に対して単調非減少であり、min(χ·A_max(F), L_c) + A_max(F)·asset_mediated_cultivation_extension_cap_bps/10000を超えない（第7.21.5節）
- CitationCertificatesがCitationKeyごとに重複なく集計され、CitationRawがAssetScore_realbaseだけを入力とする
- CitationBonusが、公開由来寄与及びインフラ寄与を除外したAssetScore^{cap}（AssetScore_base、EarlyBonus、CultivationBonusの3項をA_max(F)で上限した値）から計算したAssetAccess_{direct}^{cap}に由来する上限を持つ
- PublicationScore及びInfrastructureAdjustmentが、CitationBonusの上限κ·AssetAccess_{direct}^{cap}の入力にならず、それらを増やしてもこの上限が変化しない
- AssetScoreがAssetScore_base、EarlyBonus、CultivationBonus、PublicationScore、InfrastructureAdjustmentの5項の和をA_max(F)で上限した値である
- A_max(F) = A_seed(F) + A_real(F) であり、A_real(F) = sum(AssetRecord.value(a)) である。A_maxからA_seedを落としてA_max = Σ value(a) と定義しない（第7.3節）
- PublicationScoreがA_max(F)·(publication_base_bps + sum_k(utility_weight_bps(k)))/10000を超えない（第7.21節）
- A_max比例で加算される全経路の係数和 10000·(1-exp(-κ1)) + publication_base_bps + sum_k(utility_weight_bps(k)) + 10000·γ_F + 10000·χ + asset_mediated_cultivation_extension_cap_bps + I_protocol_max が厳密に10000 bps未満である（第7.6節・第7.14節）
- Candidates、Reach、Reach_eligible、AudienceIndex、CandidateIndexが、AssetScore・`ActiveMembers`・`ActiveMember`述語・Granted状態・asset定義だけの関数であり、告知・有料ブースト・PressRoom会員権を入力に持たない
- AudienceIndexのRangeCountが閾値に対して単調非増加であり、0以上forum参加者数以下である
- ReachがCandidateIndexのCountとCandidates集合の濃度に一致し、公開者自身と既許可者を数えない
- CandidateIndexのCountが0以上forum参加者数以下である
- Reach_exact(a) <= Reach_upper(a) が常に成立する
- 決済以外の検証がネットワーク照会なしで完了する
- `PaymentReceipt`が二重利用できない
- `StateProofEnvelope`に必要な依存閉包・checkpoint・Merkle proofが欠落なく含まれ、単体で検証を完結できる
- forum内状態に依存するすべての値(depth、Q、Q_{-I}、C、CanIssue、CanIssueTo、AssetScore、A_seed、Candidates、Reachを含む)が、単一の`ForumStateCheckpoint`の`checkpoint_time`について一貫して評価される
- クロスforumのAssetAccessおよびCitationBonusは、共通評価時刻t^*と第7.8節の決定論的checkpoint選択規則により、forumごとに選ばれたcheckpointだけを用いて計算する
- 実装者の任意選択によって複数の`ForumStateCheckpoint`のcheckpoint_timeを混在させて単一の状態依存値を計算しない
- `t_{receive}-t_{state}`が`state_freshness`の範囲外である`StateProofEnvelope`が`StaleCheckpoint`として拒否される
- Q-setのkeyがissuer_soul_idであり、同一issuer Soulに複数leafが存在しない
- Q-setの閾値証明が、開示された各issuerの相異性・inclusion proof・issuance proofをすべて満たす場合にのみ有効と判定される
- `ForumStateCheckpoint`の`previous_checkpoint_hash`連鎖がgenesisまたは既知のcheckpointに遡れない場合に`MissingObject`として拒否される
- 第10章のProtectedContent、ContentAccessGrant、KeyEnvelope、AssetAnnouncement、PromotionGrant、PressRoom、PressRoomMembershipGrant、PressReleasePackageのいずれも、Q、depth、CanIssue、CanIssueTo、AssetScore、A_seed、CultivationBonus、CitationBonus、Candidates、Reachの入力にならない
- PromotionGrant、PressRoomMembershipGrantに束縛されるPaymentReceiptが、対象オブジェクトID・対象node・金額・通貨・期間・用途のすべてに一致する場合にのみ有効であり、他の対象への転用ができない
- press_release_at <= embargo_until <= public_release_at の順序が成立する場合にのみPressReleasePackageが有効である

- `ForumStatePayload`のhashが署名者固有の公開鍵、signature、生成者依存フィールドを含まない
- `ForumStateAttestation`がpayload hashに束縛され、genesisの`checkpoint_finality_rule`を満たさないpayloadをcheckpointとして受理しない
- checkpoint_finality_ruleが同一sequenceの競合payload、署名者資格、quorum、equivocationを明示的に処理する
- `trust_anchor_mode=self_contained`のStateProofEnvelopeがgenesis、必要payload祖先、attestation、依存閉包、Merkle proofを含む
- `trust_anchor_mode=known_anchor`のStateProofEnvelopeが必要な既知anchorを明示し、未保有ならMissingObjectとして失敗する
- A_seedがchild genesis時に選ばれた親payload hash、credit ledger前後root、およびその時点のAssetScore_realbaseに固定され、親の後続状態で変化しない
- `single_writer_hash_chain_v1`下のSeedAllocation一意消費を、受理した単一payload chain内の保証としてのみ扱い、未観測forkを含むglobal一意性やBFT finalityを主張しない
- Gaia node間の標準輸送は第28章のgaia-networkであり、DeviceId認証、DHT record、tag、descriptor、relay経路、接続状態をSoul identity、Gaia objectの権利又はfinalityの根拠にしない
- gaia-networkの規定する輸送・発見・relay・資源制限を遵守し、Gaia session、TimeHandshake、object配送、保存、idempotency及び操作の正当性は第29章及び各上位規範に従う。通信経路をconsensus semanticsへ持ち込まない
- CitationRawが有効かつ重複しないcitationを、有限なcitation_registry_rootに対してだけ集計する
- `min`、cap、ゼロ係数を持つ関数について、単調非減少と厳密増加を混同しない
- depth=MでQ増加による直接AssetScore増分を主張または推薦しない
- `incentive_compatible_profile`を持たないforumが、第1〜第5のアセット層の力学の目標回数までの局所利得を認証済みと表示しない
- `incentive_compatible_profile`が第7.14節の係数下限、finite audit grid、不等式、headroom条件を満たさない場合にIncentiveProfileInvalidとして拒否する
- MaturityBondがissuer、recipient、forum、session、amount、currency、期限、独立成熟条件に束縛される
- MaturityBondがQ、depth、CanIssue、CanIssueTo、A_seed、AssetScore、CultivationBonus、CitationBonus、Candidates、Reachの入力にならない
- EcologicalViabilityReportがsimulation input hash、evaluator version、seed set hashを含み、現実の利益・需要・勝利を保証する文言を含まない
- LocalActionRecommendationがadvisory-onlyであり、証明書、checkpoint、state root、Q、depth、価格、grant、決済結果を変更しない
- LocalActionRecommendationがprotocol確定値、条件付き結果、marketing候補人数、金銭算術、不確実な結果を区別して表示する
- ReachまたはReach_eligibleを配送、閲覧、購入、収益、評判の保証として表示しない
- 標準recommendation本文は英語テンプレートであるが、設計仕様、検証規則、数式解説、不変条件の正本言語は日本語である
- 基本recommendation実装がGPU、クラウド、外部API、機械学習、ネットワーク照会を必須にしない
- recommendation候補数、探索深さ、目的軸数、ローカル計算予算が上限化される
- Soul Transferは、両当事者の有効・未失効・transfer purposeを満たすeKYCと`DistinctLegalSubject`なしに受理されない
- 一つのSoulについて進行中のactive transferが同時に複数存在しない
- transfer freeze中は、譲渡手続・異議・時刻再検証・finalizationに明示的に許された操作以外を通常authorityとして行使できない
- Soul Transfer Finalizationは、payment reservation、旧authority失効、新Body束縛、trust epoch +1、異議なし、history commitmentをすべて満たす場合にだけ確定する
- trust epochはSoul Transfer Finalization以外で増分されず、単調非減少である
- 譲渡後のsuccessor controllerは旧epochのQ、depth、発行権、通常AssetScore、bonus、seed、Civic資格・票を自動承継しない
- Forum Root Successionはgenesis、forum_id、既存root ledger、既存checkpointを変更しない
- 同一forumについて同時に二つ以上のactive root authorityが存在しない
- PaymentReceipt又はSoulTransferPaymentReservationだけではSoul Transferが成立せず、TransferFinalizedだけでは売主のPayout利用可能が確定しない

---

## 10. 告知・広告・PRと限定情報空間

### 10.1 目的と原則

第7章の第1〜第5のアセット層の力学は、参加者のアセット的な得を数学的に単調にする。しかし、その得を実際の利用・購入・協業に結びつけるには、アセットの存在と価値を、条件を満たす相手へ知らせる仕組みが必要である。本章はこれを、新しい信用経路を作らずに設計する。第6の市民化の力学に対応する公共需要の告知・市場到達（`civic_need_ref`を伴うAssetRecordの告知、CivicCandidates・CivicReach）は、第10.2節の規則と第23章が扱う。

告知・広告・PR・記者クラブに相当する限定情報空間は、いずれも次の原則に従う。

1. 配送・表示・保持・複製の**努力**は金銭で強化できる
2. Q、depth、CanIssue、CanIssueTo、AssetScore、A_seed、CultivationBonus、CitationBonus、Candidates、Reachのいずれも、金銭や告知の有無によって変化しない
3. 到達・購読・購入は保証しない。保証できるのは、正当に発行・配送・保持されたという検証可能な事実だけである

### 10.2 AssetAnnouncement

`AssetAnnouncement`は、アセットや情報の告知そのものを表す不変オブジェクトである。

```text
AssetAnnouncement
├── announcement_id = hash(canonical_encode(...))
├── issuer_pubkey
├── asset_ref
├── target_forum_id
├── announcement_type
├── announced_at
├── expire
├── content_ref
├── announcement_authority_proof_ref
├── campaign_id
└── signature
```

- `announcement_type`は`asset_release`、`update`、`security_notice`、`collaboration_request`、`press_release`、`event`などの分類であり、coreはラベルとしてのみ扱い、内容の真偽や品質を判定しない
- `content_ref`は告知本文・画像等のcontent hashであり、coreは内容を解釈しない
- `announcement_authority_proof_ref`は、発行者の通常authority、対象assetのactive状態、対象forumにおける公開・再販売・sublicense・derivative等の正当な権利範囲を検証するStateProofEnvelope参照である。公開scoreの閾値の証明ではない（本節の`CanPublishAsset`・`CanAnnounce`はscore条件を含まない）
- `campaign_id`は複数forumへの一括告知をまとめるための任意識別子であり、`info`と同様coreは解釈しない

公開及び告知の資格は、公開scoreの閾値を持たない。`publish_threshold`という概念を廃止する。

- `publish_threshold(F)`を削除する
- genesisに`publish_threshold`又はこれと同等の公開score閾値を追加してはならない
- `ValidAnnouncement`の判定に、`AssetScore`の条件を含めてはならない

通常のasset公開及び告知は、対象forumの全ての正規かつactiveな参加者に開放する。

\[
\begin{aligned}
CanPublishAsset(P,a,F,t)
\iff{}& NormalGaiaAuthority(P,F,t)\\
&\land ActiveMember(P,F,t)\\
&\land ValidAssetRecord(a,t)\\
&\land ValidProtectedContent(a,t)\\
&\land ValidCommercialRightsIfRequired(P,a,F,t)
\end{aligned}
\]

\[
\begin{aligned}
CanAnnounce(P,a,F,t)
\iff{}& CanPublishAsset(P,a,F,t)\\
&\land ActiveInTargetForum(a,F,t)\\
&\land ValidAnnouncementAuthority(P,a,F,t)\\
&\land AnnouncementRateLimitAvailable(P,F,t)
\end{aligned}
\]

`CanPublishAsset`は、これまで名前のみが参照され（第23.18節の`CanPublishCivicNeedAsset`）、定義が存在しなかった述語である。その正規の定義を本節に置く。`NormalGaiaAuthority`は第15.3節で定義する既存の述語であり、名前を変更しない。

次の7述語は、これまで定義の無い述語である。本節で定義する。

- `ValidAssetRecord(a,t)`: `a`が第3.1節の`AssetRecord`の必須field、canonical encoding、content hash及び署名の規則を満たし、評価時刻`t`において`active=true`である。第7.9.1節のasset version chain規則に従う
- `ValidProtectedContent(a,t)`: `a.protected_content_ref`が指す`ProtectedContent`が第3.1節及び第11章の必須規則を満たし、`content_id`、`plaintext_hash`、暗号化manifest及び必要な`KeyEnvelope`が相互に整合する
- `ValidCommercialRightsIfRequired(P,a,F,t)`: 公開又は告知が販売・再販売・sublicense・derivative等の商用利用を含む場合に、対象forumにおける当該権利範囲を`P`が保持していることを要求する。商用利用を含まない公開又は告知では要求しない
- `ActiveInTargetForum(a,F,t)`: 対象asset `a`が`F`の`asset_registry_root`に含まれ、評価時刻`t`においてactiveである
- `ValidAnnouncementAuthority(P,a,F,t)`: `P`が`a`のpublisherであるか、publisherから正規に委任されたannouncement authorityであり、`announcement_authority_proof_ref`が第3.5節の`StateProofEnvelope`として完全オフラインで検証できる
- `AnnouncementRateLimitAvailable(P,F,t)`: 本節の`CanCreateAnnouncement(P,F,Δt)`が成立する
- `ValidParticipationCertificate(S,F,t)`: `t`において有効な参加証明書（`root_entry`又は`community`）を保持する。第13.2節の`ActiveMember`の第1条件に名前を与えるものであり、`ActiveMember`を置き換えない

`Q`、depth、`CanIssue`、`CanIssueTo`、`A_seed`、`AssetScore`、支払い、広告購入又は中央サービスの認可を、asset公開又は`AssetAnnouncement`発行の追加資格として用いてはならない。

公開のspam、防御、配信制御は、公開資格scoreではなく、次に限定する。

- canonical encoding、署名、hash、content、manifest、権利及びaccess policyの妥当性
- active Body、`SoulEpochLease`、`TemporalHealthLease`、authority operation chain
- `AnnouncementRateLimit`
- recipient opt-in、block、category policy、delivery route、privacy budget及び受信者rate limit（第10.16節）
- 有料assetの決済・権利・grant・fulfillmentの整合性

`CanPublishAsset`の`ActiveMember`条件は、当該forumの`membership_ekyc_policy`が`verified_required`である場合にeKYCを要求し得る。これはforum参加境界（第4.2節・第13.2節）の帰結であって、公開資格へのeKYCの追加ではない。

eKYC tier、credential種別、`assurance_level`、eKYC providerの裁量、支払額を、`ActiveMember`の判定を除き、公開の可否、公開の順序、`AnnouncementRateLimit`、告知範囲の入力にしてはならない。

これにより告知力は、特定のscore閾値ではなく、対象forumの正規かつactiveな参加そのものに由来する。別建ての課金型広告枠システムを新設せず、公開の事実と実利用の報酬（第7.21節）だけがscoreへ寄与する。

`ValidAnnouncement`の判定は次による。

\[
ValidAnnouncement(x,t)
\iff
announced\_at(x)<t<expire(x)
\land 署名が正しい
\land ActiveInTargetForum(asset\_ref(x),target\_forum\_id(x),t)
\land CanAnnounce(issuer(x),asset\_ref(x),target\_forum\_id(x),t)\ をannouncement\_authority\_proof\_refで検証できる
\]

有効な告知の集合は、`ForumStateCheckpoint`の`announcement_registry_root`により固定する。

Gaia coreは、forumごとの告知発行頻度に、genesisパラメータではなくgaia-core全体で固定する定数`AnnouncementRateLimit`を課す。

\[
0\le AnnouncementCount(P,F,\Delta t)\le AnnouncementRateLimit
\]

これは、公開資格を満たした上でも大量告知を行う挙動を防ぐための、決定論的でオフライン検証可能な制限である。新しい告知を一件発行できる条件は、発行前の件数について次とする。

\[
CanCreateAnnouncement(P,F,\Delta t)
\iff
AnnouncementCount(P,F,\Delta t)<AnnouncementRateLimit
\]

告知が0件であることは正常であり、この条件は0件から上限到達前までの発行を許可する。

`civic_need_ref`を持つ`AssetRecord`に関する`AssetAnnouncement`は、通常の告知資格に加え、公開者が当該評価時点でCivicCitizenであること、および`civic_need_ref`が指す対象が、`CivicFinalityCertificate`で確定した最終化済みかつactiveな分散CivicNeedBundle entryであり、対応する`CivicNeedAsset`の`status`が`open_for_supply`または`supplied`であることを必要とする（第23.18節の`CanPublishCivicNeedAsset`）。rootが作るNeedAsset状態だけを根拠にしてはならない。

これは通常アセットの告知を制限しない。`civic_need_ref`を持たない通常アセットの告知資格は本節の`CanAnnounce`による。通常アセットの公開及び告知にCivicCitizenを要求してはならない。

### 10.3 PromotionGrant: 有料ブースト

`PromotionGrant`は、既存の`AssetAnnouncement`に対して、配送の保持・複製・再送を強化する決済済みの権利を表す。

```text
PromotionGrant
├── promotion_id
├── announcement_ref
├── payment_receipt_ref
├── promotion_started_at
├── promotion_expires_at
├── sponsor_label_required: true
└── signature
```

有効条件は次である。

\[
ValidPromotion(p,t)
\iff
ValidAnnouncement(p.announcement,t)
\land
p.promotion\_started\_at\le t<p.promotion\_expires\_at
\land
ValidPaymentReceipt(p.payment\_receipt\_ref)
\land
p.sponsor\_label\_required=true
\]

決済はPayment-Service（第18章）が処理する。`PaymentReceipt`は対象告知、公開者、料金、通貨を一意に結び付けて署名される。購入した表示期間との整合は、`PaymentReceipt`から参照される注文objectと`PromotionGrant`の期間との照合で確認する。Stripe実費手数料・Gaia維持手数料・Forum Revenue Pool contribution・受取人別配分の確定は`PaymentSettlement`（第18章、第7.17節）が行う。以下は、この文脈でreceiptが束縛する最小の要素を示す。完全な`PaymentReceipt`形式は第18章に定める。Heat Stabilizer may influence only a future recommendation to seek a promotion and does not alter `ValidPromotion`（第12.10節）。

```text
PaymentReceipt（この文脈で束縛される最小要素。完全な形式は第18章に定める）
├── payer_soul_id / payer_authority_pubkey
├── target_ref / order_ref
├── gross_amount_minor
├── currency
├── payment_state: paid
├── receipt_id
├── fee_schedule_ref
├── payout_entitlement_policy_ref
├── payment_service_authorization_ref
└── signature
```

`PromotionGrant`の`payment_receipt_ref`は、対象告知ID、金額、通貨が一致し、購入した表示期間が当該`PromotionGrant`の期間と整合するreceiptとだけ束縛する。他の告知や他人の加入向けに購入した決済を転用することはできない。

有料ブーストが厳格に守らなければならない非干渉条件は次である。

\[
Promoted(a)=true
\not\Rightarrow
S\in Candidates(a,F,t)
\]

\[
Promoted(a)=true
\not\Rightarrow
AssetScore、Q、depth、CanIssue、CanIssueTo、A\_seed、CultivationBonus、CitationBonusのいずれかが変化する
\]

つまり、有料ブーストが買えるのは**配送努力の強化**だけであり、購入資格・信用・成熟度・発行権は買えない。

Gaia coreが保証できるのは、保持期間・複製数・再送方針という配送サービスの水準であり、受信・購読・購入そのものは保証しない。

\[
PromotionService(p)=(retention\_window,\ replication\_factor,\ retry\_policy)
\]

### 10.4 保護コンテンツ: 全配布物の共通実装

Gaiaでは、通常アセット、PressRoomの詳細資料、要約資料、告知本文、添付データその他の配布物を、物理的に別系統の形式として実装しない。すべてを`ProtectedContent`として表現し、同じContentStore、内容アドレス、暗号化、鍵配布、署名検証、期限判定、復号、参照・起動処理を使う。

この統一は、「PressRoomだけ特別な暗号形式や特別なストレージを持つ」ことを避けるためのものである。PressRoomはコンテンツ形式ではなく、誰にどの`ContentAccessGrant`を発行するかを定める論理的な配布チャネルである。

```text
ProtectedContent
├── content_id = hash(canonical_encode(...))
├── publisher_pubkey
├── content_kind
│   ├── asset_module
│   ├── agent_skill
│   ├── tool
│   ├── workflow
│   ├── dataset
│   ├── announcement_body
│   ├── press_summary
│   └── press_detail
├── media_type
├── ciphertext_ref
├── plaintext_hash
├── encryption_suite_id
├── content_key_id
├── manifest_ref
├── created_at
├── expire_optional
└── signature

KeyEnvelope
├── envelope_id = hash(canonical_encode(...))
├── content_ref
├── content_key_id
├── recipient_pubkey
├── encrypted_content_key
├── granted_at
├── expire
├── issuer_pubkey
└── signature

ContentAccessGrant
├── grant_id = hash(canonical_encode(...))
├── content_ref
├── grantee_pubkey
├── issuer_pubkey
├── granted_at
├── expire
├── access_mode
│   ├── read
│   ├── execute
│   └── read_execute
├── authorization_basis
│   ├── asset_purchase
│   ├── asset_free_access
│   ├── pressroom_membership
│   └── direct_grant
├── eligibility_proof_ref_optional
├── payment_receipt_ref_optional
├── key_envelope_ref
├── use_conditions_optional
└── signature
```

`ProtectedContent`の`ciphertext_ref`は、暗号文実体のcontent hashである。暗号文はGaia上位の複製・配布経路（Gaia Storage、cache、backup、外部storage）へ複製されてよい。ここでいうrelayはGaia上位のapplication-levelな配布経路であり、gaia-networkのIroh relayではない。Iroh relayは暗号化されたtransport bytesを中継するだけで、Gaia objectを保存・再配送しない（第29.6節）。暗号文の物理コピーはアクセス権を意味しない。

`plaintext_hash`は復号後の完全性確認にだけ用いる。復号に成功したgaia-coreは、平文のハッシュが一致しなければ`PlaintextHashMismatch`として拒否する。`manifest_ref`は依存物、起動方法、必要runtime、入出力形式などを記述する不変manifestへの参照である。manifestそのものも、必要に応じて別の`ProtectedContent`として保護できる。

`content_kind`、`media_type`、`access_mode`は署名対象であり、暗号文をコピーして種類や用途だけを書き換えることはできない。coreは`content_kind`を成熟度・信用・AssetScoreの入力として解釈しない。これは配布と起動の扱いを決めるラベルである。

### 10.5 正規参照・起動の境界

`ContentAccessGrant`と`KeyEnvelope`は、正規のgaia-coreがコンテンツを参照・起動してよい条件を定める。コンテンツの物理コピーを禁止するのではなく、**正規実装における利用可能性を、署名済みの権利と受領者鍵に結び付ける**。

評価時刻`t`における鍵封筒の有効性は次である。

\[
ValidKeyEnvelope(e,t)
\iff
e.granted\_at\le t<e.expire
\land e.recipient\_pubkey=recipient(e)
\land e.content\_ref\ が対象コンテンツに一致する
\land e.content\_key\_id\ が対象コンテンツに一致する
\land 署名が正しい
\]

`ContentAccessGrant`の有効性は、権利根拠、必要なら適格性と決済、対応する鍵封筒をすべて束縛して検証する。

\[
ValidContentAccessGrant(g,t)
\iff
g.granted\_at\le t<g.expire
\land 署名が正しい
\land ValidAuthorizationBasis(g,t)
\land ValidKeyEnvelope(KeyEnvelope(g),t)
\land recipient(KeyEnvelope(g))=g.grantee\_pubkey
\land content(KeyEnvelope(g))=g.content\_ref
\]

正規のgaia-coreがnode \(S\) にコンテンツ \(c\) を参照または起動させてよい条件は次である。

\[
CanAccess(S,c,t,m)
\iff
ValidContentAccessGrant(g,t)
\land g.grantee\_pubkey=S
\land g.content\_ref=c
\land ModeAllows(g.access\_mode,m)
\land S\ が対応する秘密鍵を保持する
\]

ここで\(m\)は`read`または`execute`である。`ModeAllows`は`read`、`execute`、`read_execute`の固定された包含規則だけを用い、実装ごとの拡張解釈を許さない。

gaia-coreは、`CanAccess`が成立した場合に限り、受領者の秘密鍵で`KeyEnvelope`を復号し、コンテンツ鍵を用いて`ciphertext_ref`の暗号文をメモリ上で復号する。`execute`または`read_execute`を要求するコンテンツは、gaia-core管理下のreader / runnerへ渡す。実装は平文鍵を永続ログ、例外メッセージ、通常のキャッシュへ書き出してはならない。

この境界は、暗号文だけを持つ第三者が正規coreで内容を利用できないことを実現する。一方、悪意ある利用者がclientを改変する、復号後のメモリを抽出する、画面や出力を保存する、平文を再配布することまでを完全に阻止するものではない。Gaiaが保証するのは、**正規のgaia-coreにおいて、期限内の正当な権利・対応鍵・必要条件を満たすnodeだけが復号・参照・起動できる**ことである。

### 10.6 AssetRecordとAssetAccessGrantの統合

通常アセットも`ProtectedContent`である。`AssetRecord`は暗号文そのものを重複登録せず、公開対象となる`ProtectedContent`を参照する。

```text
AssetRecord
├── asset_id
├── protected_content_ref
├── publisher_pubkey
├── value
├── required_access_threshold
├── price
├── currency
├── active
├── created_at
├── commercial_rights_policy_ref: Hash | null
├── lineage_node_ref: Hash | null
├── origin_asset_ref: Hash | null
├── origin_lineage_royalty_policy_ref: Hash | null
└── signature
```

`AssetRecord`の`protected_content_ref`が指す`ProtectedContent`は、`content_kind`が`asset_module`、`agent_skill`、`tool`、`workflow`、`dataset`その他gaia-coreが定める実行・利用可能なアセット種別でなければならない。アセットの複製・配送・復号・起動は第10.4節および第10.5節の共通処理を使う。

本仕様のALRに関する規則を追加する。

- ALR assetは`lineage_node_ref`を必須とする。
- origin assetは`commercial_rights_policy_ref`を持ち、ALRを有効にする場合`origin_lineage_royalty_policy_ref`を必須とする。
- child assetは親nodeのorigin refsとpolicy refsを正確に継承する。
- access-only assetはこれらをnullにできる。
- `AssetRecord` version chainにおいて、active versionが変わってもorigin lineage policyのidentityを変更してはならない。

従来の`AssetAccessGrant`は、互換性のための論理名であり、独自形式を持たない。次を満たす`ContentAccessGrant`を`AssetAccessGrant`として扱う。

\[
AssetAccessGrant(g)
\iff
g.content\_ref=AssetRecord.protected\_content\_ref
\land g.authorization\_basis\in\{asset\_purchase,asset\_free\_access\}
\]

価格付きアセットでは、`authorization_basis=asset_purchase`、`payment_receipt_ref`必須とする。無償アセットでは`authorization_basis=asset_free_access`とし、価格支払いを根拠とするreceiptは禁止する。いずれも必要アクセス点数、active状態、公開者条件などの市場側条件は、grant発行時に`eligibility_proof_ref`で固定する。

第7.13節の`Granted(S,a,t_state)`は、Sを`grantee_pubkey`とし、aの`protected_content_ref`を`content_ref`とする有効な`ContentAccessGrant`が、当該checkpointに存在するかで判定する。したがって、候補集合・Reach・市場分析の数式は維持され、実装だけが共通権利形式へ統一される。

### 10.7 PressRoom: 論理配布チャネル

`PressRoom`は、通常のforum告知より先に、またはより詳細な情報を配布するための**論理的な配布チャネル**である。暗号方式、ContentStore、鍵封筒形式、復号経路を通常アセットと分けない。

```text
PressRoom
├── room_id
├── owner_pubkey
├── forum_id
├── name
├── description_ref
├── membership_mode
│   ├── open_free
│   ├── open_paid
│   ├── invited_free
│   └── invited_paid
├── eligibility_rule
├── membership_price
├── currency
├── membership_duration
├── max_members_optional
├── early_access_window
├── created_at
├── expire_optional
└── signature
```

`eligibility_rule`は、既存の非金銭的条件だけで構成する。

```text
eligibility_rule:
  minimum_asset_score
  active_forum_membership_required
  invitation_required
```

会費は、この`eligibility_rule`を置き換えない。有料room(`open_paid`、`invited_paid`)は、非金銭的条件を満たした上で、追加的に会費を要求する。無料room(`open_free`、`invited_free`)では、会費関連フィールドを設定してはならない。

roomは、会員になったこと自体で特別な暗号鍵や特別なコンテンツ形式を与えない。roomは、各`press_detail`に対する`ContentAccessGrant`を発行できる根拠を定める。会員更新後に配布される新コンテンツには新しいgrantと`KeyEnvelope`を発行する。これにより会員権失効後に将来配布分を止められる一方、既に合法的に復号された平文を遡って回収できないという限界も明確になる。

### 10.8 PressRoomMembershipGrant

```text
PressRoomMembershipGrant
├── room_id
├── member_pubkey
├── owner_pubkey
├── granted_at
├── expire
├── eligibility_checkpoint_ref
├── payment_receipt_ref_optional
└── signature
```

`PressRoomMembershipGrant`は、roomへの加入資格を表す。コンテンツ鍵そのものを持たず、`membership_key_envelope_ref`も持たない。鍵封筒は、受領者とコンテンツを一意に束縛する`KeyEnvelope`として、各`ContentAccessGrant`から参照する。

有効条件は次である。

\[
ValidMembership(g,t)
\iff
g.granted\_at\le t<g.expire
\land
EligibleForRoom(g.member,g.room,g.eligibility\_checkpoint\_ref)
\land
\left(
room.membership\_mode\in\{open\_free,invited\_free\}
\lor
PaymentValid(g.payment\_receipt\_ref)
\right)
\]

有料roomでは`payment_receipt_ref`が必須であり、無料roomでは禁止する。この二分岐により、有料・無料のどちらでも一意な検証手順が定まる。

`PaymentReceipt`は、会費についても次のすべてに一致する場合にのみ有効とする。

```text
room_id
member_pubkey
amount
currency
membership_duration
usage = pressroom_membership
```

これにより、あるroom・あるnode・ある期間向けの会費を、別のroomや別人の加入に転用することはできない。

`PressRoomMembershipGrant`は、Q、depth、CanIssue、CanIssueTo、AssetScore、A_seed、CultivationBonus、CitationBonus、Candidates、Reachのいずれにも入力しない。会員費はPressRoomの情報配布サービスへのアクセス料金であり、Gaiaの信用・成熟度を買う手段ではない。

### 10.9 PressReleasePackage

`PressReleasePackage`は、要約版と詳細版を分離し、PressRoom会員への先行配布と一般公開予定を結び付けるメタデータである。要約版も詳細版も、それ自体は通常アセットと同じ`ProtectedContent`である。

```text
PressReleasePackage
├── package_id = hash(canonical_encode(...))
├── room_id
├── publisher_pubkey
├── public_announcement_ref_optional
├── press_release_at
├── embargo_until
├── public_release_at
├── summary_content_ref
├── detailed_content_ref
└── signature
```

次の順序制約を満たさなければ、`PressReleasePackage`は無効である。

\[
press\_release\_at\le embargo\_until\le public\_release\_at
\]

先行アクセス時間は次で定義し、常に非負である。

\[
EarlyAccess(x)=public\_release\_at(x)-press\_release\_at(x)\ge0
\]

`summary_content_ref`は通常、一般forum告知で参照できる`ProtectedContent`であり、必要なら一般公開向けgrantを持つ。`detailed_content_ref`は`content_kind=press_detail`の`ProtectedContent`であり、有効なPressRoom会員に対してのみ、`authorization_basis=pressroom_membership`の`ContentAccessGrant`と受領者別`KeyEnvelope`が発行される。

評価時刻`t`における詳細資料への正規アクセスは次である。

\[
DetailAccess(S,x,t)
\iff
ValidMembership(m,t)
\land m.member\_pubkey=S
\land m.room\_id=x.room\_id
\land CanAccess(S,x.detailed\_content\_ref,t,read)
\]

`CanAccess`は第10.5節の共通判定である。PressRoomだけの別復号器、別keyring、別ContentStoreを実装してはならない。

\[
SpeedAdvantage(S,x)=public\_release\_at(x)-press\_release\_at(x)
\]

内容の主観的な価値・具体度そのものはgaia-coreの検証対象ではない。coreが検証するのは、誰がいつどの`ProtectedContent`への正規の参照権または起動権を持っていたか、および一般公開までの時間差である。

### 10.10 決済と配布シーケンス

PressRoom会費と有料アセット決済は、同一のPayment-Service（第18章）と同一のcommerce層（第19章）の束縛規則を用いる。ただし`PaymentReceipt`はコンテンツ鍵を直接発行する権限ではなく、署名済みの`ContentAccessGrant`や`PressRoomMembershipGrant`を発行する条件である。

#### 通常アセット

1. 利用者は`AssetRecord`を選び、公開者（provider）へ申請する
2. gaia-coreは、assetがactiveであること、利用者の必要アクセス点数、必要条件を`StateProofEnvelope`で検証する
3. 有料assetでは、公開者がasset・購入者・金額・通貨・セッション・利用回数を固定した`ServiceOrder`と`PaymentReceipt`を認可済みPayment-Serviceへ要求する
4. 利用者は支払い、同一セッションで`PaymentReceipt`を再提示する
5. 公開者（またはgaia-core）は、receiptの支払済み・対象・金額・通貨・購入者・未使用を、Payment-Service authorizationとOwner set commitmentに対して確認する
6. 条件を満たす場合、公開者は`ContentAccessGrant`と受領者別`KeyEnvelope`を発行する
7. 利用者のgaia-coreは署名・期限・適格性・receipt・鍵封筒を検証し、必要な`read`または`execute`だけを許可する

#### PressRoom加入と詳細配布

1. 申請者がPressRoomへ加入申請を送る
2. gaia-coreが申請者のeligibilityを`StateProofEnvelope`で検証する
3. room ownerがpendingを返す
4. 有料roomの場合、ownerがroom・member・金額・期間・用途を固定した`ServiceOrder`と`PaymentReceipt`をPayment-Serviceへ要求する
5. 申請者が会費を支払い、`PaymentReceipt`を含む再送を行う
6. ownerがreceiptの支払済み・金額・対象・未使用を検証する
7. 条件充足時に`PressRoomMembershipGrant`を発行する
8. ownerが詳細資料を配布する時、各有効会員に対して共通の`ProtectedContent`を参照する`ContentAccessGrant`と受領者別`KeyEnvelope`を発行する
9. 会員のgaia-coreは第10.5節と第10.9節を検証して詳細資料を`read`する

有料ブーストも同様に、告知・金額・期間を固定した`PaymentReceipt`を用いる。`PaymentReceipt`は一度使用されると再利用できない。

### 10.11 期限、失効、オフライン時の意味

`ContentAccessGrant`と`KeyEnvelope`は、原則として同じ終了時刻を持つ。異なる終了時刻を許す場合でも、実効期限は短い方とする。

\[
EffectiveExpire(g,e)=\min(g.expire,e.expire)
\]

gaia-coreは評価時刻が`EffectiveExpire`以後であれば、新規の復号、参照、起動を拒否する。失効・返金・会員停止・鍵侵害への対応は、新しいgrantを発行しないこと、短い権利期限、コンテンツ鍵または鍵封筒のローテーションによって将来利用を制限する。

完全オフラインの検証は、提示されたcheckpointとgrantが有効である範囲を判定できるが、ネットワーク上で直後に行われた失効・返金・取消を即時に知ることはできない。したがって、強い即時停止が必要なコンテンツは短い`expire`、小さな`state_freshness`、頻繁な再発行を選ぶ。長期オフライン利用を許すコンテンツは、それに対応して失効反映が遅れることを受け入れる。

すでに平文化された内容、画面表示、実行出力、利用者が保存した派生物は、暗号学的な将来アクセス制御だけでは回収できない。これは欠陥を隠すべき例外ではなく、Gaiaが保証する対象を正確に限定するための前提である。

### 10.12 アセット層の力学（第1〜第5）と配布・告知層との整合

告知・有料ブースト・PressRoom・`ProtectedContent`は、第1〜第5のアセット層の力学が生む結果を市場へ伝え、利用を安全に配布する手段であり、力学そのものを置き換えない。

| 力学 | 既存のアセット上の得 | 配布・告知層での接続 |
|---|---|---|
| 上昇 | AssetScore_base増 | 公開資格はscore条件を持たない。AssetScoreが増えると、絶対値のasset利用閾値を満たしやすくなる |
| 創設 | root地位、A_seed | 新forumの参加者へ同じ`ProtectedContent`を告知・配布できる |
| 多参加 | AssetAccess_direct増 | 複数forumで同一アセットを告知でき、Reach_upperが増える |
| 多親化 | A_seed、CitationBonusの機会 | 新forumの初期資産・系譜的信頼を告知に持ち込める |
| 発行 | CultivationBonus | 育成した相手が候補集合に加わり、告知の実効的な対象が増える |

有料ブーストとPressRoom会費は、この表のいずれの経路にも介入せず、配送努力、会員資格、および`ProtectedContent`への正規アクセスだけを扱う付随的なサービスである。

第8の公開の力学は、本節の配布・告知層とは独立に、第7.21節の公開報酬として`AssetScore`へ寄与する。その寄与の基準量は当該アセット自身の認定価値`value(a)`であり、`A_max(F)`は基準量ではなく`AssetScore`の上限としてのみ働く。したがって同一のアセットは、forumの大小にかかわらず同一の公開基本報酬を与える（第7.6節・第7.21節）。

asset利用条件`threshold(a,F)`は絶対値であり、`AssetScore`と同一の単位で表す。forumの`A_max`が成長しても自動調整されない（第7.12節・第7.13節）。公開及び告知はscore条件を持たないため、`threshold(a,F)`の到達は告知の解放条件でも告知の前提条件でもない（第10.2節）。

第6の市民化の力学の市場到達（CivicNeedAssetの供給、CivicCandidates・CivicReach、`civic_need_ref`を伴うAssetRecordの告知）は、通常の告知機構を上書きしない。これは第10.2節の規則と第23章の公共層規則に従う。

### 10.13 商用権利（AssetRightsGrant）とアクセス権の分離

本章が扱う`ContentAccessGrant`、`KeyEnvelope`、PressRoom membership、告知・有料ブーストは、いずれも`ProtectedContent`へのread / executeアクセスとその配布努力を扱う。これらは、再販・再許諾・派生・商用利用の権利を付与しない。

本仕様では、再販 / 再許諾 / 派生の商用権限は`AssetCommercialRightsPolicy`と`AssetRightsGrant`だけが付与する（第7.18節）。次を明記する。

- `ContentAccessGrant` / `AssetAccessGrant`を`AssetRightsGrant`の根拠としてはならない。
- 無料アクセスreceipt、asset purchase receipt、PressRoom membership、コンテンツを復号できる事実から、lineage royaltyの受領資格または商用権利は導かれない。
- access-only assetは`commercial_rights_policy_ref`、`lineage_node_ref`、`origin_lineage_royalty_policy_ref`をnullにできる。これらを持つassetの再販・派生offerは、第7.18節・第19章のALR規則に従う。
- 商用権利を主張するoffer / grantの検証は、第7.18節の`AssetLineageNode`要件と第19章の受理述語に従う。

### 10.14 Discovery Transparency

全active assetは、暗号化された本文・鍵・非公開詳細と独立に、Public Discovery Metadataを持たなければならない。Public Discovery Metadataは全Soulが検索・表示・検証できる。

公開必須情報は、assetの存在、asset ref、所在forum、asset lineage summary、publisher Soul、active status、content kind、タイトル、概要、タグ、利用可能なoffer、価格、通貨、利用mode、全アクセス条件、取得可能期限、商用権利の公開要約、対応するcheckpoint refである。

平文、DEK、KeyEnvelope本文、購入者情報、個人情報、非公開本文、private manifest、private tag、private ACL detailはPublic Discovery Metadataに含めてはならない。

検索indexは候補生成のためのderived dataであり、信頼根ではない。クライアントは検索結果のasset、offer、価格、アクセス条件、active statusを`ForumStateCheckpoint`とMerkle proof / `StateProofEnvelope`により検証しなければならない。

本節のobjectのcanonical schemaは第22.5節に定める。利用上の規則を以下に示す。

- `AssetDiscoveryRecord`: assetごとの公開発見用record。`visibility`は本仕様では`public_discoverable`のみを許す。`asset_ref`はactive `AssetRecord`、`forum_id`はassetがactive registryに含まれるforum、`offer_refs`はactive `ServiceOffer`のみを指す。title / summary / tagsは公開可能であることをpublisherが保証する。秘密・個人情報・DEK・平文hashの掲載を禁止する。assetがinactive / revoked / expiredなら、それを反映した更新recordまたはtombstoneをcheckpointに入れる。
- `PublicAccessConditionPolicy`: 「利用者が何を満たせばアクセスを得られるか」を隠さず表す。eKYCの生データ、他Soulの状態、秘匿されるべき安全規則の内部詳細を含めない。条件が満たせない場合も、理由のcategoryはpublicに説明可能でなければならない。Payment-Service、`ContentAccessGrant`、PressRoom、forum membership、AssetScore、Civicの既存acceptance predicateと矛盾してはならない。
- `AccessEligibilityQuote`: コンセンサスobjectではなく、client / discovery nodeが生成できるadvisory response。proof referencesを必須とする。このquoteはpayment authorization、access grant、Civic status、権利許諾の代替証拠ではない。利用者はpurchase / grantの確定時に既存のacceptance predicateを再実行する。
- `ForumDiscoveryRecord`: forum自身を検索可能にするrecord。forumへの参加・閲覧・発行条件についても、少なくともpublic summaryとproof refを提供する。

### 10.15 Client-side encryptionとKeyEnvelopeV2

分散チャンク化、複製、erasure coding、hashは可用性と完全性のための機構であり、保存ノードに平文を読ませない機構ではない。機密assetは、Gaia Storageに渡す前に、権限を持つclientが暗号化しなければならない。

保存ノードはciphertext chunk、ciphertext hash、公開可能なstorage policy、receipt、audit responseを扱うだけであり、平文、DEK、recipient private key、`KeyEnvelope`の復号可能情報、private manifestを持ってはならない。

#### 10.15.1 暗号スイート

本仕様の初期版のmandatory profileを一つ固定する。

```text
encryption_suite = XChaCha20-Poly1305
key_derivation   = HKDF-SHA-256
file_dek         = 256-bit cryptographically random per file version
chunk_nonce      = HKDF-SHA-256(
                     DEK,
                     "gaia/storage/chunk-nonce/v1" ||
                     network_id || file_version_id || chunk_index
                   )[0..24]
associated_data  = canonical_encode(
                     network_id,
                     namespace_id,
                     encrypted_file_manifest_id,
                     file_version_id,
                     chunk_index,
                     plaintext_length,
                     manifest_format_version
                   )
```

規則:

- 同じDEK + nonceの組合せを二度使用してはならない。
- nonceはfile version / chunk indexへ一意に束縛する。
- chunk index、file version、network、namespace、長さ、manifest versionをAEAD associated dataに含める。
- 自作暗号、独自stream cipher、無認証暗号、deterministic encryption、convergent encryptionを本仕様のconfidential assetで禁止する。
- libraryは実績あるaudited implementationを用い、protocolはsuite IDをcanonicalに固定する。

#### 10.15.2 暗号文チャンク

暗号文chunkは、暗号文、authentication tag、ciphertext chunk idだけをstorage nodeに送る。plaintext hashをstorage node向けobjectに含めてはならない。

```text
CiphertextChunk
  chunk_id = BLAKE3(
    "gaia/storage/ciphertext-chunk/v1" ||
    ciphertext ||
    authentication_tag
  )
```

#### 10.15.3 EncryptedFileManifestV1

`EncryptedFileManifestV1`（＋`EncryptedChunkRef`）は、暗号文chunkの順序、長さ、ciphertext hash、暗号方式、Merkle root、アクセスpolicy参照を固定する署名済みmanifestである。canonical schemaは第22.5節に定める。chunk listは`chunk_index`昇順でcanonical order。cipher chunk id、ciphertext length、plaintext length、tag commitment、Merkle rootが一致しない場合reject。復号clientはciphertext hashを確認し、AEAD openが成功したchunkだけをstream reassemblyへ渡す。all chunksをmemoryに載せず、bounded read / reorder bufferを使う。

#### 10.15.4 KeyEnvelopeV2

本仕様の`KeyEnvelopeV2`は、`wrapped_dek`が対象recipientの暗号公開鍵だけで復号できることを要求する。`ContentAccessGrant`が有効で、content ref、recipient Soul、mode、file version、期限、revocation状態が一致する場合だけ`KeyEnvelope`を使用できる。保存ノード、Discovery Provider、Payment-Service、forum root authorityはrecipient private keyを持たない限りDEKを得られない。`KeyEnvelope`の平文・wrapped DEKをPublic Discovery Metadataに含めない。canonical schemaは第22.5節に定める。

#### 10.15.5 鍵失効とローテーション

1. 既に平文を取得した者から平文を技術的に回収できると主張してはならない。
2. 将来アクセスの停止は、新規`KeyEnvelope`の不発行、grant revocation、future offer stopで行う。
3. 鍵漏洩・端末喪失・重大な権限変更では、新file version、新DEK、新`EncryptedFileManifest`、新`KeyEnvelope`を生成する。
4. 旧ciphertextの削除は、retention / tombstone / durable replacement / legal policyに従う。
5. Soul Transfer後の正当なrecipient controllerはSoulの既存key-management / successor-binding policyに従う。旧controllerに復号鍵が残る問題はSoul authority移転だけでは解決しないため、必要時はnew file versionとre-encryptionを要する。

#### 10.15.6 メタデータ漏洩の明示

以下の漏洩はclient-side encryption単独では防げないと明記する。

- ciphertext size、chunk count、保存時刻
- 公開discovery metadataのtitle / price / condition
- access frequency、request timing、network-level correlation
- authorized recipientによる画面撮影、平文再配布、output exfiltration

必要に応じて、padding bucket、private namespace、relay、cover traffic、watermark、契約・違反処理を将来拡張として扱う。

### 10.16 広告受信・配信 policy

本仕様のMarketing Frontierは、`AddressableTargets` / `DeliverableTargets`（第7.20節）の判定に、recipient側の広告受信policyを用いる。canonical schemaは第22章に定める。

`AdvertisementDeliveryPolicy`は、recipient Soulごとの広告受信設定を固定する。Heat Stabilizer does not override this policy; see §12.10.

- recipientが広告を受けない選択をした場合、そのSoulは`AddressableTargets`に含めない。
- `allow_recipient_discovery = false`のrecipientはsellerに個別列挙しない。匿名集計に含めるかどうかもpolicyで制御する。
- `allow_direct_addressability = true`でなければ、sellerは個別Soul宛てにdelivery objectを作れない。
- block listの実体は公開しない。delivery判定時にrecipient policy側でfail-closedに評価する。
- rate limitはrecipient保護のためrecipient側policyを優先する。

`AdvertisementDelivery`は次を満たす場合のみ受理する。

\[
\mathrm{ValidAdvertisementDelivery}(d,R,t)
=
\mathrm{Addressable}(R,d.asset,d.sender,t)
\land \mathrm{DeliveryRouteHealthy}(R,t)
\land \mathrm{SenderRateLimitAvailable}(d.sender,t)
\land \mathrm{RecipientRateLimitAvailable}(R,t)
\land \mathrm{ValidCampaign}(d.campaign,t)
\land \mathrm{ValidOffer}(d.offer,t).
\]

広告送付はasset purchase、access grant、commercial rights grant、community certificateの代替にならない。

`delivery_channel`の`p2p_inbox`、`forum_inbox`、`gaia_application_mailbox`は、いずれもGaia上位の保存・認可サービスが提供する配送経路である。`gaia_application_mailbox`はIroh relayとは異なる上位サービスであり、保存receiptとACLを要求する。Iroh relayは暗号化されたtransport bytesを中継するだけで、offline mailbox、durable delivery、store-and-forwardを提供せず、Gaia objectを保存・認可・再配送しない。`delivery_channel`はtransport DeviceIdの別名ではなく、Gaia上位のroute種別である。

PromotionGrantとの接続:

- PromotionGrantはpublic discovery / forum内露出を高める仕組みであり、recipient opt-inを迂回してDM / inbox広告を送る権限ではない。
- individual deliveryを行う場合は`AdvertisementDeliveryPolicy`と`AdvertisementDelivery`を別途通す。
- Promotion payment、広告配信、asset purchaseの資金を混同しない。

### 10.17 Heat Stabilizer interaction with promotion and advertisement

Heat Stabilizer may observe aggregate saturation signals derived from promotion reservation requests, promotion reservation rejections, sender rate-limit exhaustion, recipient rate-limit exhaustion, and delivery-policy eligibility failures. Such signals are observation inputs only.

Heat Stabilizer MUST NOT:

- invalidate a valid `PromotionGrant`;
- invalidate a valid `PaymentReceipt` or alter its settlement consequences;
- override a recipient's `AdvertisementDeliveryPolicy`;
- send, suppress, delay, or reroute an already-authorized `AdvertisementDelivery`;
- infer recipient identity, opt-in state, blocked-Soul membership, or private segment membership beyond the aggregate counters explicitly committed for the observation window.

When intervention mode is enabled, Heat Stabilizer may reduce the recommendation score of a *proposed future* promotion or delivery-related action only. It may not make an action invalid. The final validity of promotion and advertisement remains exclusively governed by the existing PromotionGrant, PaymentReceipt, AdvertisementDeliveryPolicy, AdvertisementDelivery, recipient opt-in, and rate-limit rules.

---

## 11. 配布・コンテンツアクセスの実装上の不変条件

第9章の不変条件に加え、実装・テスト・監査では次を必ず確認する。

- 通常アセット、PressRoom要約、PressRoom詳細、告知本文その他の配布物が、同じ`ProtectedContent`形式、ContentStore、内容アドレス、暗号化処理、鍵封筒、参照・起動処理を使う
- `PressRoom`が暗号方式、ContentStore、復号器、鍵形式を分岐させる特殊コンテンツ型ではなく、grant発行条件を定める論理配布チャネルである
- `ProtectedContent.content_id`、`KeyEnvelope.envelope_id`、`ContentAccessGrant.grant_id`が正規化済みバイト列のhashである
- `KeyEnvelope`が対象`content_ref`、`content_key_id`、`recipient_pubkey`、`granted_at`、`expire`を署名対象に含む
- `ContentAccessGrant`が対象`content_ref`、`grantee_pubkey`、`access_mode`、`authorization_basis`、`key_envelope_ref`、期限、必要な適格性・決済根拠を署名対象に含む
- 有効な`ContentAccessGrant`が、grantの受領者、対象content、対応鍵封筒の受領者・対象content・content keyをすべて一致させる
- `CanAccess`が、有効なgrant、対応する有効鍵封筒、受領者の秘密鍵、要求操作を許す`access_mode`のすべてを要求する
- 暗号文の物理コピー、relay、キャッシュ、バックアップ、重複保存だけでは`CanAccess`が成立しない
- gaia-coreが有効な`CanAccess`なしに復号鍵を取り出さず、平文鍵を永続ログ・例外出力・通常キャッシュに保存しない
- 復号後の平文hashが`ProtectedContent.plaintext_hash`と一致しない場合に`PlaintextHashMismatch`として拒否する
- `execute`を要求するコンテンツがgaia-core管理下のrunner以外へ平文または鍵を渡さない
- `AssetRecord`が`ProtectedContent`を参照し、`AssetAccessGrant`が独自の権利・鍵形式ではなく、asset用`ContentAccessGrant`の派生ビューである
- `Granted(S,a,t_state)`が、aの`protected_content_ref`に対するS宛の有効なasset用`ContentAccessGrant`だけで判定される
- PressRoom詳細資料の各受領者が、同じ`ProtectedContent`に対しても受領者別の`KeyEnvelope`を持つ
- `PressRoomMembershipGrant`がcontent鍵を内包せず、会員権と個別コンテンツの鍵配布を混同しない
- `authorization_basis=pressroom_membership`のgrantが、有効な`PressRoomMembershipGrant`、同一room、同一受領者、同一またはより短い有効期間を検証できる場合にのみ有効である
- 有料assetまたは有料PressRoomのreceiptが、対象、購入者、金額、通貨、期間、用途、セッションまたは利用回数に束縛され、他のgrantへ転用できない
- 無料assetで支払いreceiptを要求せず、無料PressRoomで会費receiptを受け入れない
- grantまたは鍵封筒の期限切れ後に、新規の正規復号・参照・起動を拒否する
- 完全オフラインでは、提示された有効checkpointと期限内grantの検証はできるが、直後の失効を即時に検知できないことを仕様・UI・運用文書で明示する
- 平文、実行出力、スクリーンショット、改変clientによる抽出後の再配布を完全に防げないことを、実装保証として主張しない
- `ProtectedContent`、`ContentAccessGrant`、`KeyEnvelope`、`PressRoom`、`PressRoomMembershipGrant`、`PressReleasePackage`のいずれも、Q、depth、CanIssue、CanIssueTo、`A_seed`、CultivationBonus、CitationBonus、Candidates、Reachを変化させない。`AssetScore`についても、これらを直接の入力にしない。ただし第7.21.4節の可用性evidenceは、`availability_maintenance_weight_bps`の項を通じて`PublicationUtilityScore`へ寄与するため、`ProtectedContent`・必要な`KeyEnvelope`・`ContentAccessGrant`の整合及び`AssetAccessGrant`の未取消は、可用性evidenceの一部として公開経路の追加報酬に影響し得る。この経路は公開という一つの力学の内部に限られ、Q・depth・発行資格・Candidates・Reachへは及ばない

---

## 12. CPU-onlyローカル行動レコメンド

### 12.1 目的

`LocalActionRecommendation`は、各nodeに「誰の何に何をすると、アセットアクセス、マーケティング、金銭に関して何がどのくらい変わり得るか」を、数学に詳しくない利用者にも理解できる形で示す任意の助言機能である。

これはprotocolの権限判定器ではない。レコメンドは証明書、depth、Q、価格、grant、checkpoint、支払結果を変更せず、発行、参加、購入、forum創設を強制しない。

### 12.2 軽量実装要件

基本実装はGPU、クラウド、外部API、機械学習モデル、ネットワーク照会を必須にしてはならない。必要なproofを取得した後は、通常のCPUだけで実行できる。

入力は検証済み`StateProofEnvelope`、ローカルに保持する有効オブジェクト、利用者が明示許可した選好・費用見積り・リスク上限・時間地平・変換率仮定に限る。

候補は最大128件、数値目的軸は最大5件、標準探索は一手先とする。二手先探索は上位候補の有限部分にだけ許す。Pareto filterは最大でも\(O(N^2m)\)比較である。

### 12.3 候補行動

- 名前またはprivacy-safe labelで特定されたissuerへのcommunity申請
- 名前またはprivacy-safe labelで特定されたpending申請の承認または拒否
- 特定forumへの参加
- 特定child forumの創設と親集合の選択
- 特定assetの公開、価格、アクセス閾値の候補選択

### 12.4 出力値の区分

| 区分 | 意味 | 英語表示で使う表現 |
|---|---|---|
| protocol確定 | 条件成立後に規則上必ず再計算できる変化 | `will change`、`will become available` |
| 条件付き確定 | 承認、発行、決済などの明示条件が成立した場合の変化 | `if approved`、`if completed` |
| marketing候補 | 現在のReach等で確認できる候補人数 | `currently has N eligible candidates` |
| 金銭計算 | 価格、fee、既知費用、利用者入力の仮定による範囲 | `per sale`、`if conversion is between …` |
| 不確実 | 需要、承認、将来成熟、反応、品質、継続利用 | `may`、`could`、`is not guaranteed` |

候補人数を配送、閲覧、購入、収益保証として表示してはならない。

### 12.5 構造化レコード

```text
LocalActionRecommendation:
  recommendation_id
  recommender_version
  generated_at
  checkpoint_refs
  node_pubkey
  action_kind
  named_targets
  horizon
  local_preferences_hash
  assumptions
  protocol_before
  protocol_after_if_completed
  protocol_delta_if_completed
  marketing_before
  marketing_after_if_completed
  marketing_delta_if_completed
  monetary_known
  monetary_range
  conditions
  uncertainty_flags
  explanation_template_id
```

`named_targets`で人を名前表示するには、その公開鍵と表示名の対応をnodeが正当に保持・表示許可されていなければならない。満たさない場合はprivacy-safe labelまたは短縮公開鍵を使う。

### 12.6 英語の一次表示

仕様本文は日本語である。ただし一般利用者に見せるレコメンドの第一表示文は英語を標準とする。数値、条件、対象、hash、期限は構造化レコードから再現できなければならない。クライアントは利用者ロケールに応じて日本語その他の翻訳を併記または切替表示してよい。翻訳はprotocol上の意味を変更しない。

一次表示は数式を前面に出さず、次の順で表示する。

```text
Recommendation: [named person/forum/assetに対する具体的な行動]

Why this may help now:
[検証済み状態と明示仮定にもとづく、平易な一文または二文]

If completed:
• Asset access: [具体的な変化]
• Marketing: [現在の候補人数とその意味]
• Money: [既知の金額または条件付き範囲]

What you need to do:
• [具体的な一手]
• [必要な条件]
• [必要な条件]

Not guaranteed:
[承認、需要、将来成熟などの不確実性]
```

二次表示は`Numbers and conditions`として折りたたみ可能にする。そこでは現在値→完了時値、差分、Reachの定義、価格・fee・既知費用、仮定付き金銭範囲、checkpoint hash、有効期限を表示する。

### 12.7 標準英語テンプレート

#### community申請

```text
Recommendation: Request a community certificate from {issuer_name} in {forum_name}.

Why this may help now:
At the referenced checkpoint, {issuer_name} is eligible to issue a community certificate to you. Your current verified depth is {current_depth}. This issuer is {issuer_q_status} in your qualified relationship set.

If completed:
If the certificate is valid and is reflected as a new qualified issuer in a later checkpoint, your projected verified depth may change from {depth_before} to {projected_depth_after}. This projection is advisory only and is not a certificate grant.

What you need to do:
Send the request to {issuer_name}. Keep your participation and required health proofs valid until the request is evaluated.

Not guaranteed:
{issuer_name} may decline. The certificate may fail validation or may not become a new Q-set contribution. Future asset value and future sales are not guaranteed.
```

#### asset公開

```text
Recommendation: Publish {asset_name} in {forum_name} at {price} with an access threshold of {threshold}.

Why this may help now:
At the referenced checkpoint, {candidate_count} active members meet the access condition and do not already have access to this asset.

If completed:
• Asset access: Your own access score does not change directly.
• Marketing: {candidate_count} current purchase candidates are eligible. This is not a delivery or purchase guarantee.
• Money: You receive {net_per_sale} per completed sale after the known fee of {fee}. With the selected conversion assumption of {conversion_low}–{conversion_high}, the estimated net range is {money_low}–{money_high}.

What you need to do:
• Register and activate {asset_name}.
• Confirm the selected price and threshold.
• Maintain the asset and fulfill granted access.

Not guaranteed:
Candidates may not view, buy, or continue using the asset.
```

#### community発行

```text
Recommendation: Review and, if appropriate, issue a community certificate to {recipient_name} in {forum_name}.

Why this may help now:
At the referenced checkpoint, you are more mature than {recipient_name} and are eligible to issue. The recipient currently has {q_minus_issuer} qualified relationships excluding you. If your certificate becomes a new qualified Q-set contribution, it may improve the recipient's future computed depth.

If completed:
• Asset access: If {recipient_name} later matures independently, your cultivation count can change from {c_before} to {c_after}, and your cultivation bonus can change by {cultivation_delta}.
• Marketing: {recipient_name} may become an eligible user or buyer later; this is not guaranteed.
• Money: The maturity bond is {bond_amount} and is payable only if the stated independent-maturity condition is verified.

What you need to do:
• Review the request and its proof bundle.
• Issue only if your issuance eligibility (`CanIssueTo`) and the information/policy conditions are satisfactory.
• Do not rely on this recommendation as a substitute for review.

Not guaranteed:
Issuing this certificate does not grant a particular depth. The recipient's future depth is computed from the checkpoint state, healthy participation time, and qualified relationship set. {recipient_name} may not mature independently, and the bond may not become payable.
```

#### forum創設と親選択

```text
Recommendation: Found {child_forum_name} with {parent_list} as parent forum{s}.

Why this may help now:
You currently hold valid participation evidence in the selected parents, and their real-asset-based contributions are positive at the referenced checkpoints.

If completed:
• Asset access: You will be the root of {child_forum_name}. The child forum’s initial seed will be {seed_after}, below its cap of {seed_cap}.
• Marketing: The new forum begins with no guaranteed audience. Its future market depends on members, assets, and demand.
• Money: No direct revenue is guaranteed by founding the forum.

What you need to do:
• Create the child forum with the named parent evidence.
• Commit the required initial asset and operating work.
• Choose only parents whose relationship and real-asset contribution you understand.

Not guaranteed:
The forum may receive no members, no useful assets, or no sales.
```

#### forum追加参加

```text
Recommendation: Join {forum_name} through {issuer_name}.

Why this may help now:
This forum currently offers a positive access score under your stated conditions and remains within your selected portfolio limit.

If completed:
• Asset access: Your discounted cross-forum access value will change by {access_delta}.
• Marketing: You may gain access to a separate forum market. Current eligible candidates for your selected asset are {candidate_count}, if the asset is published there.
• Money: No direct revenue is created by joining.

What you need to do:
• Request entry from {issuer_name}.
• Keep the participation evidence valid.
• Review the forum’s assets, costs, and rules before joining.

Not guaranteed:
The forum’s assets, demand, and long-term activity may change.
```

### 12.8 禁止事項

レコメンドは次をしてはならない。

- Q、depth、発行資格、AssetScore、seed、citation、Reachの証拠になる
- checkpointまたはstate rootを変更する
- 証明書承認を強制する
- 候補人数を購入・収益保証として表現する
- 費用、条件、不確実性を隠す
- 明示された選好・仮定なしに唯一の最適戦略または必勝法を主張する

Civic needを使う助言は、現在のactive bundle、`CivicNeedScore`、FIFO残存期間、供給可能性を表示できる。ただし表示はadvisory-onlyであり、ballotの提出、`NeedMergeProposal`・`NeedMergeAttestation`・`NeedMergeFinalization`、`NeedSplitChallenge`・`NeedSplitFinalization`、validator署名又はBFT finalityを自動実行してはならない（第23章）。これらはCivicCitizen本人の署名とvalidator committeeの独立した受理を必要とするprotocol objectであり、`LocalActionRecommendation`の一部として生成・署名・提出しない。

### 12.9 ExecutableMarketingPlan と LocalActionRecommendation の分離

`LocalActionRecommendation`は、ローカルnodeがcheckpoint、simulation、local preference、公開済みprotocol ruleに基づいて生成するadvisory-only objectである。

`LocalActionRecommendation`は、権限、支払能力、相手の同意、future checkpoint inclusion、recipient opt-in、広告枠、rate limit、外部決済、offer有効性、grant有効性、または将来の結果を保証しない。`LocalActionRecommendation`は、実行object、authority delegation、transaction authorization、payment authorization、advertisement delivery authorization、または`StateProofEnvelope`の代替ではない。Heat Stabilizer adjustments described in §12.10 are likewise advisory ranking controls and do not create authority, consent, payment, delivery, or execution authorization.

既存 / 将来のrecommendationは、必ず次の`advisory feasibility class`を表示する。

```text
informational_only
requestable_now
potentially_executable_after_revalidation
external_consent_required
future_state_dependent
not_currently_executable
```

例:

- 「issuerにcommunity certificateを要求する」→ `requestable_now`
- 「issuerがcertificateを発行する」→ issuer本人に対してのみ`potentially_executable_after_revalidation`、requesterには`external_consent_required`
- 「Forum Bにassetを公開する」→ offer / authority / grant / policyを満たす場合のみ`potentially_executable_after_revalidation`。公開資格はscore条件を持たないため、`publish_threshold`又はこれに相当する公開score閾値の到達を実行可能性の条件にしない（第10.2節）
- 「13 Soulが将来score thresholdに到達する」→ `future_state_dependent`
- 「child forumを創設する」→ parent proof、seed budget、initial asset、genesis policyを満たす場合のみ`potentially_executable_after_revalidation`

`LocalActionRecommendation`を実行UIの唯一の根拠にしてはならない。

`ExecutableMarketingPlan`は、特定のrequester Soulが、特定のasset / offerについて、評価checkpoint時点で実行可能なprotocol actionだけを列挙し、完成済みaction draft、必要proof、費用、期限、外部承認依存を明示する短命のplanである。これはコンセンサス上の状態を直接変更しない**proof-bound execution plan**とする。実際のstate changeは、planが参照するcompleted action objectを個別に作成・署名・受理することでのみ起こる。canonical schemaは第22章に定める。

`MarketingActionStep`のaction classは次に固定する。

- `executable_now`: requester自身が、plan generation checkpointにおいて必要なauthority、grant、asset state、offer state、forum policy、rate limit、payment reservation、広告policyを全て満たし、**外部者の新たな意思決定を待たずに**action draftを提出できる。
- `requestable_now`: requesterはrequest objectを送れるが、成功・承認・反映は保証しない。
- `external_consent_required`: requester自身は完遂できない。必要な外部Soul / authority / recipientのconsentを明記する。
- `future_state_dependent`: score、membership、market、availability等の将来状態に依存する。実行actionとして表示してはならない。
- `not_executable`: 必須predicateが現在falseであり、requesterが開始できる合法actionもない。

UIは`executable_now`のactionだけに「実行」ボタンを表示する。`requestable_now`は「申請する」、`external_consent_required`は「依頼先・不足同意を確認」、`future_state_dependent`は「観測・将来条件」として表示する。UIは次の順序を必須とする。

1. 最新checkpointを取得・検証
2. `ExecutableMarketingPlan`を生成
3. stepのclass、費用、外部consent、対象集合の種別、proof、期限を表示
4. `executable_now` stepだけに実行操作を表示
5. 実行直前にplan preconditionを再検証
6. 完成したprotocol objectのcanonical payloadと署名対象をユーザーへ表示
7. 署名・支払が必要なら既存の確認フローを通す
8. 実行結果、pending state、finalization、actual deltaを表示

外部stateを変更する操作は、ユーザーに完全なaction draft、recipient / forum、価格、通貨、広告対象の抽象segment、期限を提示してから明示確認を要求する。これにより、recommendationが勝手に広告、支払、certificate発行、forum創設を実行することを防ぐ。

### 12.10 Heat Stabilizer: observation, bounded advisory intervention, and rollback

#### 12.10.1 Purpose and scope

Heat Stabilizer is a CPU-only, checkpoint-anchored mechanism that detects a specific risk: self-reinforcing concentration of *newly proposed* forum-entry and marketing actions when realized inflow accelerates, finite operational resources are saturated, and realized fundamental value per net inflow is weak.

It is not a popularity penalty, a size cap, a governance mechanism, a price control, or a consensus rule. A large or rapidly growing forum is not Hot merely because it is large or rapidly growing. A forum can enter a heat state only through the conjunction specified below.

The only permitted intervention is a bounded adjustment to the score, ordering, or exposure of a new `LocalActionRecommendation` or a new unexecuted `MarketingActionStep` proposal. The mechanism MUST NOT directly execute, deny, revoke, settle, or mutate protocol actions or rights.

#### 12.10.2 Fixed non-interference boundary

Heat Stabilizer MUST NOT change or invalidate:

1. existing forum membership or participation evidence;
2. existing root_entry, community, reciprocal, or citation certificates;
3. Q-set membership, Qdepth, CanIssue, CanIssueTo, AssetScore, A_seed, CitationBonus, CultivationBonus, Candidates, or Reach;
4. AssetRecord, ProtectedContent, ContentAccessGrant, AssetAccessGrant, KeyEnvelope, or access already granted;
5. any valid purchase, PaymentReceipt, PaymentSettlement, Forum Revenue Pool contribution, ForumRevenuePoolDistribution, payout entitlement, refund, recovery action, or ALR settlement;
6. any commercial right, resale, sublicense, derivative right, or AssetRightsGrant;
7. Soul, Body, DeviceIncarnation, SoulEpochLease, TemporalHealthLease, Soul Transfer, trust epoch, forum root authority, or Forum Root Succession;
8. recipient opt-in, direct addressability, blocked-Soul commitment, advertisement policy, advertisement delivery validity, or advertisement recipient rate-limit semantics;
9. the ability of a user to manually discover a forum, submit a valid request, pay for a valid offer, or execute an independently valid action without recommendation assistance.

#### 12.10.3 Eligible proposed actions

A Heat Stabilizer decision MAY apply only to a proposed future recommendation whose target forum is known and whose action kind is one of:

- `acquire_forum_membership`;
- `request_community_certificate` where the requested certificate targets the Hot forum;
- `purchase_promotion` where the promotion targets the Hot forum or its forum-scoped inventory;
- `advertisement_delivery` or a delivery recommendation whose target audience is scoped to the Hot forum, provided the decision affects recommendation ranking only and not delivery validity;
- another future action kind explicitly added by a later protocol version and marked `heat-stabilizer-eligible`.

A Heat Stabilizer decision MUST NOT apply to `issue_community_certificate`, an already created PromotionGrant, an already paid order, an already granted access right, or an action that lacks a verifiable target forum.

#### 12.10.4 Checkpoint-anchored observation window

For a forum `F` evaluated at checkpoint `C_t`, the observation window is the canonical set of finalized checkpoints from `C_(t-W+1)` through `C_t`, where `W` is a configuration constant.

All observation inputs MUST be derived from finalized event records, finalized checkpoint roots, or signed service observations whose provenance and window are included in `HeatObservation`. No raw private recipient list, private message content, private asset plaintext, private price negotiation, identity attribute, or secret key material may be used as a heat signal.

The observation is aggregate and forum-scoped. A HeatObservation MUST NOT contain a list of individual requesters, recipients, issuers, buyers, or blocked Souls.

#### 12.10.5 Heat signals

For forum `F` and evaluation checkpoint `C_t`, define the following non-negative aggregate signals.

Let `M(F,t)` be the active-member count proven from the canonical membership state at `C_t`. Let `Wg` be the growth lookback window.

\[
G(F,t) = \max\left(0,\frac{M(F,t)-M(F,t-W_g)}{\max(1,M(F,t-W_g))}\right)
\]

`G` is the realized post-action inflow growth signal. It MUST be computed after the relevant membership actions have become part of finalized checkpoint state. A recommendation engine MUST NOT use only a pre-action simulated member count as `G`.

Let `J` be the count of eligible future entry-like requests observed in the pressure window, and let `R` be the count of such requests rejected solely because a declared finite capacity, reservation, quota, or rate limit was exhausted. Let `Q` be the corresponding aggregate queue backlog if the relevant subsystem exposes one.

\[
P(F,t) = \max\left(
  \frac{R}{\max(1,J)},
  \frac{Q}{\max(1,J)}
\right)
\]

`P` is the finite-resource pressure signal. Eligible sources include forum-scoped join capacity, certificate-processing capacity, promotion reservation capacity, storage reservation capacity, and recipient delivery quota. A source MUST be included only when its request, rejection, and capacity semantics are explicit and auditable. A policy MUST NOT treat voluntary user refusal, ordinary issuer discretion, payment failure, invalid proof, failed eKYC, or failed authority validation as capacity rejection.

Let `ΔSales+`, `ΔAccess+`, and `ΔNeedGapClosed+` be non-negative, finalized, forum-scoped changes within the value window. Let `ΔM+ = max(0, M(F,t)-M(F,t-Wv))`. Let the policy constants `w_sales`, `w_access`, and `w_need` be non-negative and bounded.

\[
V(F,t) =
\frac{
  w_{sales}\,\Delta Sales^+
  + w_{access}\,\Delta Access^+
  + w_{need}\,\Delta NeedGapClosed^+
}{\max(1,\Delta M^+)}
\]

`V` is the realized fundamental-value-per-net-inflow signal. `ΔSales+` MUST use finalized paid sales or finalized settlement-eligible sales, not forecast revenue. `ΔAccess+` MUST count newly valid, non-revoked asset access grants rather than impressions. `ΔNeedGapClosed+` MUST count only CivicNeedAsset supply or closure events finalized under the Civic rules. A missing value source is recorded as unavailable; it MUST NOT be silently converted to fabricated positive value.

#### 12.10.6 State machine and hysteresis

Each forum has one Heat Stabilizer state for each policy version:

```text
normal -> watch -> warm -> hot -> recovering -> normal
```

The state machine is deterministic for the same `HeatObservation`, `HeatStabilizerPolicy`, and prior `HeatStateTransition`.

```text
GrowthHigh(F,t)       := G(F,t) > growth_threshold
PressureHigh(F,t)     := P(F,t) > pressure_threshold
FundamentalsWeak(F,t) := V(F,t) < value_per_net_inflow_floor

WatchCondition(F,t) := GrowthHigh(F,t)
WarmCondition(F,t)  := GrowthHigh(F,t) AND PressureHigh(F,t)
HotCondition(F,t)   := GrowthHigh(F,t) AND PressureHigh(F,t) AND FundamentalsWeak(F,t)
```

Transition requirements:

- `normal -> watch` requires `WatchCondition`.
- `watch -> warm` requires `WarmCondition`.
- `warm -> hot` requires `HotCondition` for at least `hot_enter_epochs` consecutive finalized evaluation epochs.
- `hot -> recovering` occurs when `HotCondition` is false for at least one finalized evaluation epoch.
- `recovering -> normal` requires `NOT WatchCondition` for `hot_exit_epochs` consecutive finalized evaluation epochs.
- `watch -> normal` and `warm -> normal` occur when `NOT WatchCondition` holds for the configured cooling duration.
- Any missing, stale, malformed, non-finalized, or unverifiable required input produces `observation_unavailable`; it MUST NOT produce a new `hot` transition. If the prior state was `hot`, the system MAY retain `recovering` only for the bounded fail-safe duration declared in the policy, after which it returns to `normal` unless a fresh valid observation supports `hot`.

`hot_enter_epochs` MUST be at least 1. `hot_exit_epochs` MUST be strictly greater than or equal to `hot_enter_epochs`. This hysteresis prevents repeated ranking oscillation near a threshold.

#### 12.10.7 Modes

Each policy configuration has one mode:

| Mode | Required behavior |
|---|---|
| `disabled` | No observation requirement and no recommendation effect. Existing audit records remain readable. |
| `observe_only` | Produce observations, states, and counterfactual decisions; do not alter ranking, exposure, action availability, delivery, or execution. |
| `shadow` | Same as observe-only, plus produce a deterministic counterfactual ranked result and bounded hypothetical penalty; do not expose it as an operative recommendation result. |
| `soft_intervention` | Apply only the bounded score/exposure adjustment described in §12.10.8 to eligible *new* recommendations in the rollout cohort. |

The default mode for a new policy version MUST be `observe_only`. A configuration MUST NOT enter `soft_intervention` unless it names an explicit rollout cohort and has an active signed configuration with `global_kill_switch=false`.

#### 12.10.8 Bounded intervention

For a candidate recommendation `a` that proposes an eligible action into target forum `F`, let `U_base(i,a,t)` be the unmodified local recommendation utility. The adjusted utility is:

\[
U_{heat}(i,a,t) = U_{base}(i,a,t) - \lambda_H(F,t)\,I[Hot(F,t)]\,I[Eligible(a,F)]
\]

where:

\[
0 \le \lambda_H(F,t) \le max\_recommendation\_penalty
\]

The policy MAY make `λ_H` depend on bounded normalized signal severity, but it MUST NOT exceed `max_recommendation_penalty`. The engine MUST retain `U_base`, `U_heat`, the policy version, the state, and the applied penalty in `HeatInterventionDecision`.

A soft intervention MAY additionally reduce exposure of the affected recommendation by no more than `max_exposure_reduction`, and MAY divert no more than `max_diversion_share` of affected recommendation opportunities toward alternatives. Both values are hard caps in the signed policy.

An alternative recommendation may be promoted only if it independently satisfies all pre-existing eligibility, proof, privacy, opt-in, and policy requirements. Heat Stabilizer MUST NOT manufacture a candidate, bypass a recipient policy, claim an asset is purchasable, claim a certificate will be issued, or make a forum action executable without its ordinary proof and consent path.

Heat Stabilizer MUST NOT assign an infinite penalty, remove a manually selected action, hide a forum from direct search, or convert a ranking adjustment into a block.

#### 12.10.9 Kill switches, rollback, and configuration validity

The following controls are mandatory:

- `global_kill_switch`: when true, the effective mode is `disabled` for every forum immediately after configuration verification.
- `forum_kill_switches`: a canonical sorted set of forum IDs; membership forces effective mode `disabled` for that forum.
- `rollout_cohort`: a deterministic, auditable cohort declaration. A forum or Soul outside the cohort receives `observe_only` behavior even if the configured mode is `soft_intervention`.
- `previous_configuration_ref`: a reference to the immediately preceding valid configuration.
- `rollback`: a signed HeatStabilizerRollback may restore a specific prior configuration or force `observe_only`.

A configuration is valid only when it is canonical, signed by the configured Heat Stabilizer policy authority, within its validity interval, internally bounded, and linked to a valid policy version. An invalid configuration MUST fail closed to `observe_only`; it MUST NOT silently retain an unbounded or unverifiable soft-intervention setting.

#### 12.10.10 Auditability and explanation

For every evaluation, the engine MUST emit or make reproducible a `HeatObservation`. For every state change it MUST emit a `HeatStateTransition`. For every recommendation affected in `shadow` or `soft_intervention` mode, it MUST emit a `HeatInterventionDecision`.

The decision record MUST make it possible to determine:

- the target forum and evaluation checkpoint;
- the policy and configuration versions;
- the prior and next Heat Stabilizer state;
- aggregate `G`, `P`, and `V` values or their commitments and availability flags;
- whether the recommendation was eligible for adjustment;
- `U_base`, applied penalty, `U_heat`, exposure adjustment, and whether an alternative was shown;
- whether the result was counterfactual or operative;
- the global / forum kill-switch state and rollout-cohort result.

The user-facing explanation MUST state that the alternative is advisory, that the target forum may be experiencing temporary capacity pressure, and that the user may still manually inspect and choose any otherwise valid forum or action. It MUST NOT label a forum fraudulent, unsafe, invalid, or prohibited solely because it is Hot.

#### 12.10.11 Privacy and aggregation

Heat Stabilizer observations MUST be aggregate, checkpoint-anchored, and minimal. The system MUST NOT expose individual request counts attributable to a Soul, recipient, issuer, buyer, advertiser, or blocked recipient. The system MUST NOT use private advertisement content, private message content, private asset plaintext, eKYC attributes, payment instrument data, or identity-binding material as heat features.

If an aggregate is below the policy's minimum disclosure cohort size, the observation MUST record `insufficient_aggregation=true`; the affected component of `P` or `V` is unavailable. The engine MUST NOT infer a value by deanonymizing, joining private registries, or substituting a personal signal.

#### 12.10.12 Calibration status and release gate

Policy constants are deliberately configurable. Their values are not protocol consensus constants. However, the following boundaries are protocol/specification constants and MUST NOT be widened by configuration: eligible action kinds, non-interference boundary, hard caps, state-machine semantics, audit obligations, kill-switch behavior, rollback behavior, privacy restrictions, and observe-only fail-safe behavior.

A policy version may be deployed before calibration only in `disabled`, `observe_only`, or `shadow` mode. Entry into `soft_intervention` requires a release decision based on predeclared measurements from finalized observations and counterfactual logs. At minimum, the release record MUST assess:

- Hot true-positive behavior in a declared synthetic or historical speculative-concentration test;
- Hot false-positive behavior in a declared healthy-growth test;
- recommendation churn and state oscillation;
- changes in completed sales, valid asset access, CivicNeedAsset supply, queue pressure, and active forum diversity;
- activation rate, manual override / direct-choice behavior, and rollback readiness.

Failure to meet a calibration target is not a protocol failure. It means the policy remains in `observe_only` or `shadow` until a later signed configuration and release decision are approved.

#### 12.10.13 Recommendation explanation template

```text
Recommendation Consider forum_alternative_name before proceeding to forum_name.
Why this may help now The target forum currently shows temporary aggregate capacity pressure under this recommendation policy. This is an advisory ranking adjustment, not a finding that the forum is invalid, unsafe, or unavailable.
If completed Asset access Any access consequence remains governed by the selected forum's ordinary asset, eligibility, payment, and grant rules.
Marketing This alternative may offer a separate eligible market or action path. No audience, certificate, delivery, sale, or access outcome is guaranteed.
Money No fee, price, receipt, settlement, payout, or existing financial right is changed by this recommendation adjustment.
What you need to do You may inspect either forum and choose any otherwise valid action directly. Follow the ordinary proof, consent, payment, and policy requirements.
Not guaranteed Capacity conditions may change. This recommendation does not block entry, revoke rights, or guarantee that an alternative will be available or beneficial.
```

`LocalActionRecommendation.uncertainty_flags` の許容値に、次を追加する。

```text
heat_stabilizer_observe_only
heat_stabilizer_shadow
heat_stabilizer_soft_intervention
heat_observation_unavailable
heat_capacity_pressure
heat_alternative_ranked
```

---

## 13. 実装規範と本文の補足

この章は本文の意味を狭めるためではなく、本文中で暗黙だった状態遷移と検証境界を明文化する。本章と前章までの記述が矛盾する場合は、本章を優先する。ただし、時刻健全性・Soul・商用の各機構（第14章以降）の詳細規則が本章の記述と矛盾する場合は、当該詳細章を優先する。

### 13.1 署名方式の固定

Gaia の唯一の署名方式はML-DSA-65である。`signature`はML-DSA-65署名、`issuer_pubkey`、`subject_pubkey`、`identity_pubkey`、`authority_pubkey`はML-DSA-65公開鍵の正規化済み表現でなければならない。署名方式を選ぶフィールド、別方式へのfallback、objectごとのsuite交渉を持たない。

Soulの恒久識別子は、第2.1節のとおりidentity_pubkeyの正規化済みバイト列から導く。

```text
soul_id = hash(canonical_encode(identity_pubkey))
```

検証器は、ML-DSA-65公開鍵または署名として正規に復号できない値を`InvalidMLDSA65PublicKeyEncoding`または`InvalidMLDSA65SignatureEncoding`として拒否する。ML-DSA-65以外の方式を示すobjectまたはmetadataは`UnsupportedSignatureSuite`として拒否する。将来の暗号移行は、既存objectの再解釈や書換えではなく、新しいprotocol versionでのみ行う。

この限定のscopeはGaiaのprotocol object及びそのidentity/authority署名である。gaia-networkのtag署名、QUIC/TLS接続認証その他のtransport用暗号方式は第28章が定める別scopeであり、本節のML-DSA-65限定の例外ではない。transportの署名・鍵交換の成功はGaia objectのML-DSA-65署名の代替にならず、逆にGaia objectの署名はtransport接続の認証を代替しない。両者は別の検証であり、一方の成功をもう一方の根拠にしてはならない。

`identity_pubkey`は公開すべきSoul恒久公開鍵であり、通常の検証bundleで利用可能でなければならない。同一`soul_id`に異なる`identity_pubkey`を束縛してはならない。`authority_pubkey`は通常の署名鍵であり、Soul恒久IDではない。authority鍵は、有効な`DeviceIncarnation`、公開`identity_pubkey`、`SoulRecord`、`SoulEpochLease`を介してSoulへオフライン追跡可能でなければならない。identity秘密鍵は日常の通常object署名に使ってはならない（第15章、第16章）。

### 13.2 ActiveMembersとroot

`ActiveMembers(F,t_state)`は、当該checkpointの`membership_root`がコミットする正規集合である。forum rootは常に`ActiveMembers(F,t_state)`に含まれなければならず、root leafを欠くcheckpointは`MissingRootMembership`として拒否する。

本書では、この集合のうち「現在の有効参加者」として通常権限を行使できるのは、次の条件をすべて満たすnodeだけである。この述語を`ActiveMember(S, F, t_state)`と呼ぶ。

- 当該checkpointの`checkpoint_time`において有効な参加証明書（`root_entry`または`community`）を持つ
- そのSoulの唯一のactive bodyである（`DeviceIncarnation`の状態が`active`）
- 有効な`SoulEpochLease`を持つ
- 対象forumで`healthy`な`TemporalHealthLease`を持つ
- `EkycMembershipEligible(S, F, t_state)`を満たす（第4.2節）

健康を確認できない身体（`degraded`以下のhealth state）は、membershipの履歴から消去しないが、現在の有効参加、Q寄与、発行資格、AssetScore、Candidates、Reachの計算から除外する。`EkycMembershipEligible`を満たさないSoul（`suspended_for_ekyc`）も同様に、membershipの履歴から消去せず、現在の有効参加、`T_actual`の積算、Q寄与、発行資格、AssetScore、Candidates、Reachの計算から除外する。

`ActiveMembers(F,t_state)`（複数形）は`membership_root`がコミットするコミット済み集合のままとし、`EkycMembershipEligible`を`ActiveMembers`又は`membership_root`の定義へ加えてはならない。加えると、eKYCを失ったSoulが`membership_root`から消え、上記の「履歴から消去しない」規則と、第17章の`suspended_for_ekyc`の規則に反する。`ActiveMember`（単数形）は`ActiveMembers`の部分集合を定める述語であり、両者を混同してはならない。

> あるSoulがmembership_rootに含まれていても、当該Soulがtransfer lock中である場合、又は現在controllerのtrust epochにおいて有効参加状態を持たない場合、通常の発行・成熟・AssetScore・Candidates・Reachに使うactive memberとして扱ってはならない。ただし、過去のmembership履歴そのものを削除してはならない。

rootは有効な`root_entry`または`community`証明書を自ら保持する必要がない。この例外はrootの参加資格だけに関する。rootの常時membershipはQ、depth、CanIssue、CanIssueTo、EarlyBonus、A_seed、CitationBonusを増やさない。rootがasset publisherである場合も、`S != publisher(a)`により自身のassetの`Candidates`から除外される。ただしrootも通常権限の行使（`root_entry`の発行など）には、第5.1節の通常authorityゲートを満たす必要がある。

### 13.3 communityによる初回参加

`community`は、既参加nodeの関係・参加の認定に加えて、新規nodeの最初の参加証明書としても使用できる。新規subjectに対するcommunityの検証では、次の二つの状態を区別する。

- **pre-state**: 当該communityがまだ存在しない、issuerの発行資格を判定する確定済みcheckpoint状態
- **provisional state**: 当該communityをsubjectの参加証明書として一時的に追加した仮状態

issuerの`CanIssue`、issuer depth、issuer chain、issuance proofはpre-stateだけで判定する。候補community自身、同一tickの証明書、未来の証明書をissuer資格の根拠にしてはならない。subjectのmembership、participation_anchorは、当該communityがsubjectの初回参加証明書として機能する場合、この証明書を受理する状態遷移により確立される。この遷移は、subjectのdepthを改善するためにcommunityを仮にQへ加えて使ってはならない。

subjectが新規参加者である場合、`CanIssueTo`のActiveMember条件は、当該communityがsubjectの初回参加証明書として受理される遷移の確定により満たされるものとして扱う。発行者側の資格（`CanIssue`、`depth(I)<depth(S)`を除くissuer条件）は常にpre-stateで判定する。証明書には`target_depth`等を記載せず、subjectのdepthは遷移後のcheckpointで再計算する。初回参加直後は`T_actual=0`により`depth=M`となり、その同一tickでは一般communityを発行できない。これにより初回entryは可能だが、発行資格依存グラフの時間的DAG性は保たれる。

provisional stateは、同一checkpoint transition内でcertificateをQ-setへ追加するためにのみ使ってよい。証明書自身の発行資格またはcertificate内のdepth claimを正当化するために使ってはならない。有効なcommunity証明書は、後続checkpointでQ-setの新しいissuer leafとして採用された場合に限りsubjectのQへ寄与し得る（第4.5節、第4.8節）。

community発行と譲渡状態の整合として、次を追加する。

- issuer又はsubjectが`transfer_pending`、`transfer_frozen`、`transfer_settling`、`transfer_disputed`である場合、community request及びcommunity発行を拒否する。
- pre-state checkpointと同じtrust epoch、同じSoul controller bindingを使わないcommunity発行を拒否する。
- transfer freeze開始時点より後に発行された通常証明書を、譲渡対象Soulの旧epoch又は新epochのQ-setへ挿入してはならない。

### 13.4 checkpoint最終性と観測済みfork

`checkpoint_finality_rule`は`single_writer_hash_chain_v1`である。forum rootだけが`ForumStatePayload`を署名して最終化できる。各payloadは`previous_payload_hash`と単調増加する`state_sequence`を持ち、genesisを起点とする一本のhash chainを形成する。

検証器は、署名者がrootであること、署名が有効であること、`state_sequence`が連続すること、`previous_payload_hash`が直前payload hashと一致することを要求する。同じ`(previous_payload_hash, state_sequence)`に異なるpayload hashが観測された場合、双方を`EquivocatedFinality`として拒否する。predecessorが欠ける場合は`MissingTransition`、sequence不連続は`InvalidStateSequence`として拒否する。

この規則は、提示されたchainの内部整合性と観測済み競合の拒否を保証する。root鍵の侵害、rootの停止・検閲、未観測forkの不存在までは保証しない。

ForumStatePayloadのstate transition検証について、次を追加する。

- transfer registry、root succession registry、dispute registryの遷移は、各object chain、sequence、previous hash、時刻順、eKYC proof、payment state、authority状態と一致しなければならない。
- `SoulTransferFinalization`を取り込むpayloadは、旧authorityが同じ又は先行payloadで失効済みであり、新authority/new Body/new SoulEpochLeaseが有効であることを要求する。
- 同一Soulについて一つのpayload chain内に競合するtransfer finalizationを含めてはならない。
- 同一forumについて同一root epochに複数active root authorityを持たせてはならない。

### 13.5 StateProofEnvelopeの形式と資源上限

`StateProofEnvelope`は次の二形式に限る。

- `full_state`: 空のContentStoreから、genesis、payload祖先、全状態入力、署名、正規state transitionを再計算できる形式
- `anchored_delta`: 既知かつ検証済みのanchor payloadから、連続する正規transitionをreplayできる形式

`anchored_delta`の各transitionは、前payload hash、前state root群、state_sequence、正規化済み操作列、後state root群、root署名を含まなければならない。一つでも欠ける場合は`MissingTransition`として拒否する。

gaia-coreは、少なくとも`max_envelope_bytes`、`max_dependency_objects`、`max_active_members`、`max_active_assets`、`max_grants`、`max_qset_leaves`、`max_seed_allocation_leaves`、`max_transition_depth`、`max_merkle_proof_bytes`、`max_verification_steps`を固定する。いずれかを超えるenvelopeは`ResourceLimitExceeded`として拒否する。full_state検証は概ねO(N log N)時間、O(N)メモリを要する。高頻度の通常同期にはanchored_deltaを使い、初回検証、高価値取引、監査、紛争処理ではfull_stateを使う。

譲渡依存閉包は大きくなり得るため、次の資源上限を追加する。

- `max_transfer_chain_depth`
- `max_transfer_dependency_objects`
- `max_transfer_dispute_objects`
- `max_ekyc_authorization_chain_depth`

上限超過時は検証を省略せず、`ResourceLimitExceeded`として拒否する。上限値は実装のDoS耐性を考慮してgaia-core共通定数として定めるか、既存の`max_verification_steps`等へまとめる。

### 13.6 Q-setのexact claimとlower-bound claim

Q-setはsubjectごとにissuer Soul（`issuer_soul_id`）で一意化・順序付けされたcanonical Merkle order-statistics mapである。同じissuer Soulからの複数communityは代表選択規則により一leafへ集約する。leafは`issuer_soul_id`をkeyとし、署名・authority・identityの検証はleaf内の`authority_pubkey`とissuer identity binding、および必要なlease/health依存に対して行う。issuerが転生によりauthority keyを変えても、同一issuer Soulによる二重寄与は生じない（第4.5節）。

- `QAtLeast(n)`は、相異なるn個のissuer leafとinclusion proofによるlower-bound claimである
- `QExact(n)`は、Q-setのexact-cardinality proofを要求する
- `QMinusIssuerExact(I,n)`は、issuer Iを除外したexact-cardinality proofを要求する

depthの`Eligible`判定には必要な`QAtLeast(A(ΔT))`だけを用いてよい。`Q=n`、Qの増減、`Q_{-I}`の正確値を表示・検証するclaimには、対応するexact proofを必須とする。

### 13.7 親checkpoint、credit ledger、origin lot、SeedAllocationとA_seed

親forumのmembership、`AssetScore_realbase`、credit ledger、origin lot作成、SeedAllocation検証に使う親checkpointは、必ず次を満たす。

\[
checkpoint\_time(parent) < issued\_at(child\_genesis)
\]

\[
0 \le issued\_at(child\_genesis)-checkpoint\_time(parent)
\le state\_freshness(parent)
\]

#### 13.7.1 SeedCreditLedger

各parent forum Pの`ForumStateCheckpoint`は`seed_credit_ledger_root`を持つ。このrootは、Pをorigin parentとするcreatorとasset lineageごとのcanonical Merkle mapである。keyは次の組である。

```text
(origin_creator_pubkey, asset_lineage_id)
```

各leafは少なくとも次を持つ。

```text
origin_creator_pubkey
origin_parent_forum_id
asset_lineage_id
credited_high_water
last_credited_parent_payload_hash
last_credited_checkpoint_time
last_credit_lot_id
```

`credited_high_water`は、当該creator・親forum・asset lineageについて、過去にorigin lotの根拠としてcredit済みとした最大active valueである。初期値は0とする。各leafは次の不変条件を厳密に満たす。

\[
credited\_high\_water_{next}\ge credited\_high\_water_{previous}\ge0
\]

新しいorigin lotは、対象checkpointにおけるactive valueが直前credit済み高水位を厳密に超えるlineageを少なくとも一つ含む場合だけ作成できる。lotに含める各lineageについて、`credit_delta`、high-water更新、対象asset versionは、直前ledger leaf、対象checkpointのasset registry inclusion proof、asset version chainから再計算可能でなければならない。

同じcreator・親forum・lineage・payloadについて、同じvalue部分を二つのorigin lotへcreditしてはならない。credit済み高水位の低下、同一payloadでの重複credit、またはlotとledger更新の不一致は`InvalidSeedCreditLedger`として拒否する。

#### 13.7.2 SeedAllocationRegistry

各parent forum Pの`ForumStateCheckpoint`は`seed_allocation_registry_root`を持つ。このrootは、Pをorigin parentとするorigin lotごとのcanonical Merkle mapである。origin lot leafは少なくとも次を持つ。

```text
origin_lot_id
origin_creator_pubkey
origin_parent_forum_id
origin_parent_payload_hash
origin_parent_checkpoint_time
credit_ledger_pre_root
credit_ledger_post_root
new_creditable_real_value
realbase_increment
budget_amount
allocated_total
next_allocation_sequence
allocation_head_hash
```

各origin lotについて、次を厳密に満たす。

\[
0\le allocated\_total\le budget\_amount
\]

allocation leafは`origin_lot_id`と`allocation_sequence`で一意であり、`previous_origin_allocation_hash`は直前leafを指す。`allocated_total`は、同一lotの全有効allocationの正規化済み和と一致しなければならない。これらが一致しない場合は`InvalidSeedAllocationState`として拒否する。

#### 13.7.3 allocationの正当性

child genesis Cに使うallocation aについて、検証器は次を確認する。

1. `origin_parent_forum_id`がCの`forum_chain`に一度だけ含まれる
2. `origin_creator_pubkey`がCのcreatorと一致する
3. `child_forum_id`と`child_genesis_ref`がC自身と一致する
4. origin parent checkpointが上記の時刻・鮮度条件を満たす
5. origin lot、credit ledgerの前後leaf、およびallocation leafが、同じまたは連続する最終化済みpayload chainの対応rootに含まれる
6. `credited_lineage_deltas_sorted`の各項目が対象checkpointのactive asset version、直前high-water、後続high-waterと一致する
7. `allocation_sequence`が0から連続し、previous hashが一致する
8. `allocated_amount>0`であり、allocation後の`allocated_total`が`budget_amount`を超えない
9. `RealbaseIncrement`がA_seed、EarlyBonus、CultivationBonus、CitationBonus、既存origin lot、allocation残高を入力に持たない
10. 同一`origin_lot_id`をCのA_seedに二回含めない

一つでも満たさないallocationはA_seedに寄与しない。child genesisが正のA_seedを主張し、その根拠allocationが無効または不足していれば`InvalidSeedAllocation`としてchild genesis全体を拒否する。

`single_writer_hash_chain_v1`における上記の一意性は、検証器が受理した単一のparent payload chain内の一意性である。未観測forkの不存在、ネットワーク全体のallocation一意性、BFT finalityは保証しない。

#### 13.7.4 A_seedの固定と由来の終端

child genesisは各allocationについて、origin lot id、parent forum_id、parent payload hash、checkpoint time、credit ledger前後root、`NewCreditableRealValue`、`RealbaseIncrement`、budget amount、allocated amount、allocation hash、η、seed_cap、最終A_seedをcanonicalに含める。A_seedはchild genesis時に一回だけ固定され、親の後発状態変化、親証明書の後発失効、citationの失効、同一origin lotの後発allocationで遡及変更されない。

allocationを受けたA_seedは、そのchildにおける初期アクセス対象であるが、次世代のorigin lot作成の入力ではない。childが後に実アセット価値を過去credit高水位より増やした場合だけ、そのchildの`A_real`に基づき新しいorigin lotを作り得る。これにより、親由来seedを孫forumへ移す、同じoriginを別世代で再使用する、またはassetの停止・回復により同じ実績を再creditすることを禁止する。

### 13.8 citationの有効性

citationは通常証明書として、他の通常証明書と同じ厳密な有効期間を持つ。

\[
issued\_at(citation) < t < expire(citation)
\]

CitationBonusにcitationを数えるには、上式に加え、child forumとparent forumの双方について選択済みのfinalized checkpointが存在し、citationが対応する`citation_registry_root`にinclusion proofで含まれ、CitationKeyが一意でなければならない。

親参加証明書がchild genesis後に失効しても、child genesisの正当性、A_seed、参加アンカー、既に確定した証明書の正当性は遡及無効化されない。citationの失効は、その失効後の評価におけるCitationBonusの寄与だけを0にする。citationはQ、depth、CanIssue、CanIssueTo、A_seedの入力にならない。

### 13.9 AssetRecordの価値承認

`AssetRecord.value`を`A_real`に算入しactive assetとするには、次を全て満たさなければならない。

- valueが非負有限の正規化済み有理数である
- 対象`ProtectedContent`のcontent hashを持つ
- value評価の根拠objectを持つ
- publisher以外の相異なる2名以上の有資格reviewerによるML-DSA-65署名を持つ
- reviewer資格は対象AssetRecordの発行より厳密に前の確定済みcheckpointで評価する
- 同じreviewer公開鍵の重複署名は一人としてしか数えない

valueの変更、active化、停止、失効は既存recordを変更せず、新しい署名済み不変objectで表す。publisher本人の署名はreviewer quorumに算入してはならない。

本節の認定は`A_real(F,t) = Σ value(a)`の被加数`value(a)`を確定するものであり、`A_max(F,t) = A_seed(F,t) + A_real(F,t)`の定義を変更しない（第7.3節）。ここで認定された`value`は、公開経路の基準量の前提でもある。第7.21.1節の`PublicationBaseScore`及び第7.21.2節の`PublicationUtilityScore`の各項は、本節の条件を満たした`value`を基準量`value(a)`として用いる。本節の条件を満たさない`value`は、公開資格（第10.2節の`CanPublishAsset`）を満たしても公開経路の基準量にはならない。

### 13.10 CandidateIndexの正規導出

CandidateIndexはcheckpoint作成者が任意に宣言できる独立の集合ではない。次の正規関数の出力である。

\[
Candidates(a,F,t)=
\{S\mid S\in ActiveMembers(F,t),\ ActiveMember(S,F,t),\ S\ne publisher(a),\ AssetScore(S,F,t)\ge threshold(a,F),\ \lnot Granted(S,a,t)\}
\]

checkpoint verifierは、membership、canonical score map、asset record、grant mapからCandidatesを再計算し、score順・同score時はsubject_pubkey順にleafを並べたCandidateIndex rootが`candidate_index_registry_root`の対応rootと一致することを要求する。不一致、候補の追加、候補の省略は`CandidateIndexMismatch`として拒否する。

この規則により`Reach(a,F,t)=Count(CandidateIndex(a,F,t))`は現在の正確な購入候補人数になる。full_stateでは全入力から再計算する。anchored_deltaではanchorから全遷移をreplayして同じrootに到達しなければならない。

### 13.11 実装上の検証順序

実装は次の順に検証する。

1. ML-DSA-65公開鍵・署名の正規表現、canonical encoding、object hash、domain separationを検証する
2. genesis、root identity、single-writer hash chain、payload祖先の連続性を検証する
3. 署名objectの`AuthorityOperationHeader`（soul_id、incarnation_id、authority_pubkey、operation_sequence、previous_operation_hash、soul epoch、health epoch）の正規化と連続性を検証する
4. Gaia remote要求では、session検証の一部として、認証済みtransport context（当該connectionのlocal/peer DeviceId及びlocal transport binding ID）を`SessionBinding`及び署名済みTimeHandshake transcriptと照合する。callerが指定したheaderをこの照合の根拠にしてはならない（第29.2節〜第29.4節）
5. 同梱された`SoulEpochLease`・`TemporalHealthLease`が署名時刻を覆い、署名鍵が当該Soulの唯一のactive bodyに属するauthority keyであることを検証する
6. resource上限を検証する
7. root必須包含を含むmembership、Q-set、asset registry、grant mapをcanonicalに再構成する。加えて`temporal_health_root`、`device_incarnation_registry_root`など、checkpointが持つ新しいroot群を再構成する
8. `community`/`root_entry`について、target depth系の禁止フィールド（`target_depth`、`requested_depth`、`approved_depth`、`projected_depth`等）が存在しないこと（`NoForbiddenCommunityFields`）を確認し、`community`については同一pre-state checkpointで`CanIssueTo`（ActiveMember・`depth(I)<depth(S)`・`I≠S`・`ValidCommunityIssuanceContext`）が満たされていたことを検証する。community初回entryについてはpre-stateとprovisional stateを区別して検証する
9. 公開経路の入力を検証する。第13.9節で認定された`value(a)`、`V_{S,F,e}`（第7.21.1節）及び可用性evidence（第7.21.4節）を検証する。公開資格はscore閾値ではなく`CanPublishAsset`（第10.2節）で判定する。`PublicationScore`は`AssetScore`の第4項であるため、この検証は次段の`AssetScore`計算より前に完了しなければならない
10. depth、Q、CanIssue、CanIssueTo、A_seed、A_real、AssetScoreを単一評価時刻について計算する（時間は健康区間ベースの`T_actual`を使う）。`AssetScore`は第7.6節の5項の和であり、その第4項`PublicationScore`の入力は前段で検証済みでなければならない。`CandidateIndex`の導出と`threshold(a,F)`の比較はこの絶対値を用いる。比率形へ換算してはならない（第7.13節）
11. citationの有効性と非遡及性を検証する
12. CandidateIndex、Reach、その他派生indexを再計算する
13. 一つでも失敗した場合はclaim全体を拒否する

### 13.12 保証境界

本仕様が保証するのは、提示された正規入力、genesis、確定済みcheckpoint chain、StateProofEnvelope（必要なSoulEpochLease・TemporalHealthLease・authority operation chainを含む）に対し、検証者がネットワーク照会なしに同じAccept、Reject、または規定エラーを返せることである。また、必要な健康・epoch・proofを提示できないentityに通常のGaia権限を与えないこと、提示できるobjectだけを決定論的に受理または拒否することも保証の対象である。

本仕様が保証しないのは、未観測forkの不存在、root鍵の侵害防止、rootの可用性・検閲耐性、reviewerの現実世界での独立性、asset valueの市場価値、需要・収益・参加の保証である。これらをGaiaの数理的成熟度またはオフライン検証の保証と混同してはならない。

さらに本仕様は、次も保証しない。

- 認証済みtransport DeviceIdがSoul identity、authority認可、lease、Civic資格又はfinality権限を単独で含意すること。transport接続の認証は「そのtransport秘密鍵を持つ相手」との通信を示すだけであり、Soul認可は署名済みTimeHandshake、DeviceIncarnation、lease及びtrust epochの検証によって別途成立する
- native DHT metadata（DeviceId、tag、公開descriptor、時刻、routing情報）の秘匿。これらは平文KRPCで観測され得る
- 到達性の保証。network partition、NAT traversal失敗、relay拒否、discovery失敗、peer停止又はlocal application失敗の間も接続が成功すること
- 秘密鍵が完全に複製されていないこと
- 同一の自然人が不正な別名義・別書類で別Soulを作らないこと
- device attestation実装に脆弱性がないこと
- eKYC provider、Payment-Service、Soul-Bankが常に可用であること
- Bank providerが未来にわたり保存を継続すること
- P2P network全体に未観測のforkが存在しないこと
- 物理時計、time witness、ネットワーク遅延が常に正確であること

本仕様が保証するのは、上記の不確実性がある環境でも、必要な健全性・epoch・proofを示せないentityに通常のGaia権限を与えず、示せるobjectだけを決定論的に受理または拒否することである（第26章にも同じ限界を再掲する）。

### 13.13 Heat Stabilizer post-action observation and non-blocking action semantics

Heat Stabilizer observes realized finalized outcomes after normal action validation and state transition. It MUST NOT become an additional validity predicate for membership acquisition, community-certificate requests, certificate issuance, promotion purchase, advertisement delivery, asset publication, asset purchase, storage reservation, or any other protocol action.

For an eligible action that is independently valid under the protocol:

1. Existing validation rules determine whether the action is accepted, rejected, paid, delivered, granted, or settled.
2. The resulting finalized checkpoint contributes, where applicable, to later aggregate HeatObservation inputs.
3. A later recommendation evaluation may use that observation only to adjust a new recommendation within the configured bounded mode.

A HeatInterventionDecision is neither an action authorization nor an action denial. It MUST NOT appear in a validity proof as a requirement for `CanIssue`, `CanIssueTo`, `CanAccess`, payment, settlement, or delivery.

Counterfactual results in `observe_only` and `shadow` modes MUST be labelled non-operative and MUST NOT be used to claim realized economic, access, or governance effects.

---

## 14. 時刻健全性

第4章のdepth、発行資格、Q、アセットの状態、checkpointの鮮度、Soulの転生は、すべて時間に依存する。本書では時刻を表示上の補助情報ではなく、**consensus-criticalな入力**として扱う。この章は、その時刻を「端末の言い値」ではなく「検証可能な区間」として扱い、継続的に健康を確認できない身体を通常権限から外すための規則を定める。

### 14.1 なぜ端末時計を信頼しないのか

端末のwall clockは、攻撃、故障、NTP障害、長期休止、ネットワーク断、設定誤りなどで簡単にずれる。ずれの原因が何であれ、検証器からは「その時刻が正しいか確認できない」という点で同じである。健康を確認できないnodeは、ネットワークの健全性のため不適格とする。これは道徳的な非難ではなく、**ネットワーク安全上の適格性**の判定である。

したがって、正常なGaia authorityは、時間整合性を継続的に検証可能な形で提示しなければならない。単一の時刻点だけを信頼せず、区間と、複数の独立した観測を使う。

### 14.2 時刻の基本規則

- 全時刻はUTC Unix integer tickを用いる。浮動小数点時刻は禁止する（第4.1節）。
- 時間は単一点ではなく**閉区間**で扱う。
- 二つのeventの厳密な順序を要求するときは、区間が重ならなければならない。重なる場合は順序を推測せず、`IndeterminateTemporalOrder`として拒否する。
- 時刻区間、offset interval、期限比較、threshold判定は、任意精度整数または既約有理数と決定論的な区間手続で評価する。

検証された時刻区間は、次の不変objectで表す。

```text
VerifiedTimeInterval {
  lower_tick
  upper_tick
  uncertainty_tick
  attestation_refs_sorted
}
```

必要な条件は次である。

\[
0\le lower\_tick\le upper\_tick
\]

\[
uncertainty\_tick\ge0
\]

event `x`の時刻区間を\(I(x)=[lower(x), upper(x)]\)と書く。二つのeventの順序を確定できるのは、次が成立するときだけである。

\[
upper(x)<lower(y)
\]

区間が重なる場合、順序を推測してはならない。これは「どちらが先か分からない」ことを安全側に扱う。

譲渡は時刻境界に敏感であるため、次を追加する。

- transfer agreement、freeze、payment reservation、dispute、resolution、finalization、root successionは、`VerifiedTimeInterval`を用い、曖昧な時刻順序を受理しない。
- あるイベントXがYより先であるべき場合は、次を要求する。

\[
upper(X) < lower(Y)
\]

- intervalが重なり順序を確定できない場合、`EventIndeterminateTemporalOrder`又は譲渡専用の`IndeterminateTransferTemporalOrder`として拒否する。
- Soul Transfer Finalizationについて、少なくとも以下の順序を固定する。

\[
Agreement < Freeze < PaymentReservation < OldAuthorityRevocation < NewAuthorityBinding < Finalization
\]

ただし、Stripe外部イベントの観測時刻とGaia objectの署名時刻を混同しない。PaymentReservationはPayment-Serviceが観測・署名した外部決済状態であり、finalizationはGaiaのprotocol eventである。

- forum root transferについても、freeze checkpointがfinalization checkpointより厳密に前であり、凍結中にroot authority書込みがないことを要求する。

### 14.3 TimeHandshake: 時刻の往復測定

通常のsession確立、通常objectの送受信、authorityを用いる重要操作の前後には、peer間で`TimeHandshake`を行う。TimeHandshakeは通常通信に付帯する機構であり、専用の配送網を必要としない。

新規のnode間sessionで用いるsigned transcriptは、双方のendpoint（`GaiaTransportEndpoint`）、双方のtransport binding ID、session nonce、challenge、protocol version、lease及びproof bundleを含む。これらのfieldの型、canonical encoding、commitment及び検証順序は第29.2節〜第29.4節に定め、begin/response/complete/confirm_bindingの各段階の署名対象は同節及び第12章補足に従う。transport binding IDは各側が自分の接続へ割り当てる値であり、双方で同一bytesであることを要求しない。本節の往復遅延・offset interval・不確実性の各式は変更しない。

```text
TimeHandshake {
  protocol_version
  forum_id_optional
  session_id
  challenger_soul_id
  challenger_incarnation_id
  responder_soul_id
  responder_incarnation_id

  t1_send_local
  t2_receive_remote
  t3_send_remote
  t4_receive_local

  request_hash
  response_hash
  challenger_authority_signature
  responder_authority_signature
}
```

新規のnode間sessionでは、この結果schemaに加えて、次の三段階のinline transcript payload型を用いる。これらはtransport用の独自暗号ではなく、Gaia TimeHandshakeのcanonical署名payload型である。独立した新署名objectでも新registryでもなく、`TimeHandshake`及び`SessionBinding`が保存正本を所有する。`challenger_authority_signature`は`TimeHandshakeComplete`の`confirmation_signature`、`responder_authority_signature`は`TimeHandshakeResponse`の`response_signature`を示す。

```text
TimeHandshakeBegin {
  stage: begin,
  session_id,
  protocol_version,
  interface_kind,
  transport_kind,
  service_scope,
  session_nonce,
  challenge,
  initiator_endpoint,
  initiator_endpoint_commitment,
  initiator_transport_binding_id,
  initiator_soul_id,
  initiator_incarnation_id,
  initiator_authority_pubkey,
  initiator_soul_epoch_lease_ref,
  initiator_temporal_health_lease_ref,
  initiator_trust_epoch,
  forum_id_optional,
  t1_send_local,
  proof_bundle,
  request_signature: MLDSA65Signature
}

TimeHandshakeResponse {
  stage: response,
  session_id,
  protocol_version,
  request_hash,
  challenge,
  session_nonce,
  initiator_endpoint,
  responder_endpoint,
  initiator_endpoint_commitment,
  responder_endpoint_commitment,
  initiator_transport_binding_id,
  responder_transport_binding_id,
  responder_soul_id,
  responder_incarnation_id,
  responder_authority_pubkey,
  responder_soul_epoch_lease_ref,
  responder_temporal_health_lease_ref,
  responder_trust_epoch,
  t2_receive_remote,
  t3_send_remote,
  proof_bundle,
  response_signature: MLDSA65Signature
}

TimeHandshakeComplete {
  stage: complete,
  session_id,
  request_hash,
  response_hash,
  t4_receive_local,
  verified_time_interval_ref,
  gaia_offset_interval,
  candidate_session_binding,
  confirmation_signature: MLDSA65Signature
}

SessionBindingConfirmation {
  stage: confirm_binding,
  session_id,
  time_handshake_ref,
  confirmed_session_binding,
  initiator_session_binding_signature: MLDSA65Signature
}
```

begin、response、completeそれぞれの署名は、自分自身のsignature fieldを除いたcanonical encodingに、順に`gaia:time-handshake-begin:v1`、`gaia:time-handshake-response:v1`、`gaia:time-handshake-complete:v1`のdomain prefixを付けたbytesへ行う。hashは署名を含む当該段階の正規object bytesから、既存Gaia object hash規則で計算する。`proof_bundle`はcanonicalな有界依存閉包であり、その全bytesを当該署名対象へ含める。responseの`request_hash`によってbeginのscope・version・identity・proofへ推移的にbindingし、completeの`request_hash` / `response_hash`によって両段階へbindingする。未来の`t4`値をresponse時点の署名に含めるという実装不能な契約を作らない。`t4`及び導出時刻区間はInitiatorのconfirmationで署名し、両者が検証する。

`candidate_session_binding`は、まだ確定`TimeHandshake` hashを含まないunsigned projectionとし、`time_handshake_ref`及びsignature/attestation refsを除く`SessionBinding`の全fieldsを含む。未生成の自身のhashを自身の署名bytesに含める循環を作らない。

検証済み`TimeHandshake`のhashを確定してから、candidateに`time_handshake_ref`を付加した`SessionBinding`のunsigned projectionを生成する。そのprojectionへ両者のML-DSA-65署名を取得する。署名は、signatureを除く`SessionBinding` fieldsのcanonical encodingへ`gaia:session-binding:v1`を付して行う。この署名交換は`SessionBindingConfirmation`段階で行い、その順序は第29.3節に定める。`TimeHandshake`結果objectは、元のsession、双方のSoul/incarnation/authority、`t1`〜`t4`、`request_hash`、`response_hash`、begin/response/completeのcanonical bytes又はその取得可能なhash参照、`confirmation_hash`、`verified_time_interval_ref`、`gaia_offset_interval`及び全endpoint/binding fieldを明示する。

往復遅延と推定offsetは次で計算する。

\[
round\_trip=(t_4-t_1)-(t_3-t_2)
\]

\[
\hat{\theta}=\frac{(t_2-t_1)+(t_3-t_4)}{2}
\]

ただし、非対称な遅延を完全には排除できない。Gaiaは推定値\(\hat{\theta}\)の一点だけで健康を断定しない。実装は、決定論的な整数区間手続により`OffsetInterval(A,B)=[\theta_{low},\theta_{high}]`を導く。

`round_trip > max_round_trip_delay`のhandshake、または不確実性が`max_handshake_uncertainty`を超えるhandshakeは、健康を肯定する根拠として使ってはならない。

### 14.4 時刻証人と観測

重要操作に使う健康資格は、単一のpeer時計に依存してはならない。各forumの`temporal_health_policy`（第14.5節）は、許可された署名済み時刻源、署名検証方法、必要quorum、独立性規則を`time_witness_policy_ref`で固定する。

時刻証人が発行するのは、次のような限定された署名事実である。

```text
TimeAttestation {
  subject_hash
  observed_interval_lower
  observed_interval_upper
  time_source_id
  witness_domain_id
  issued_at
  expire
  signature
}
```

time witnessは、特定hashが特定の時刻区間に観測されたという事実だけを提供する。time witnessは、Q、depth、CanIssue、CanIssueTo、AssetScore、A_seed、checkpoint finalityを裁定してはならない。

#### 14.4.1 時刻証人 quorum の到達条件

時刻証人の選択は、利用者の手動操作に依存してはならない。nodeは、対象forumのgenesisが固定する`temporal_health_policy`（第14.5節）及び`time_witness_policy_ref`が要求する時刻証人quorumを満たすまで、許可済み時刻証人を自動選択し、失敗時には代替証人を自動再選択しなければならない。

quorumは、第14.5節の`temporal_health_policy`が固定する**既存フィールド名**で表す。

```text
ValidWitnessCount      >= required_observer_count
ValidWitnessDomainCount >= required_observer_domains
```

「時刻証人quorum」は本文の用語であり、canonical schema上の名前は`required_observer_count`及び`required_observer_domains`である。`required_witness_count`及び`required_witness_domains`という新しいフィールド名をgenesis又は`temporal_health_policy`へ導入してはならない。`forum_id = hash(canonical_encode(genesis_certificate))`（第2.3節）であるため、フィールド名の追加・改名は既存forumの同一性を破壊する。

有効な時刻証人とは、少なくとも次を全て満たす`TimeAttestation`を返した時刻証人である。

- `time_witness_policy_ref`が許可する`time_source_id`及び公開鍵を持つ
- 対象requestの`subject_hash`に正しく束縛される
- 署名、形式、時刻区間、期限及び鮮度が正しい
- policyが定める最大不確実性及び最大時刻区間幅を満たす
- 既に採用されたattestationと矛盾せず、共通の時刻区間を形成できる
- 同一`time_source_id`の重複ではない

「policyが定める最大不確実性及び最大時刻区間幅」は、`temporal_health_policy`の既存フィールド`max_handshake_uncertainty`及び`max_checkpoint_interval`を指す。この条件のために新しいフィールド名を導入しない。

同じ`witness_domain_id`に属する複数の時刻証人は、独立domain quorumの計算では一つとしてしか数えてはならない。

#### 14.4.2 自動選択と代替補充

時刻証人要求ごとに、nodeはpolicyが許可する全ての時刻証人を`witness_domain_id`ごとに分類する。最初の送信では異なるdomainを優先し、少なくとも`required_observer_domains`個の異なるdomainへ並列要求を送り、その後`required_observer_count`を満たすために必要な数まで追加の時刻証人へ要求を送る。並列要求数の上限は`TimeWitnessPolicy`が定める（第14.5節）。

各時刻証人について、次のいずれかが起きた場合、その時刻証人は当該requestにおける失敗済み証人となる。

- timeout
- transport failure
- 不正なresponse
- 署名不正
- policy外の鍵、`time_source_id`又は`witness_domain_id`
- `subject_hash`又はrequest bindingの不一致
- 期限切れ、鮮度不足又は不正な時刻区間
- 他の採用済みattestationと共通時刻区間を形成できない

失敗済み証人は、同一requestに対する即時のquorum候補から除外する。nodeは、quorumが未達である限り、失敗済み証人の代わりに未試行の許可済み証人を自動選択して補充しなければならない。

代替証人の選択順序は次に固定する。

1. まだ採用済みattestationを持たない`witness_domain_id`の時刻証人
2. 既にquorumに含まれるdomain以外のdomainの時刻証人
3. 未試行の時刻証人
4. policyが許す再試行待機時間を経過した時刻証人

同一domain内に複数の許可済み時刻証人がある場合、そのdomainの先頭証人が失敗した後、nodeは同一domainの次候補を選んでよい。ただし、未使用domainの候補を優先しなければならない。

#### 14.4.3 再試行

nodeは、同一の時刻証人へ反復送信するのではなく、まずquorumに不足するdomain又はwitness slotを代替証人で埋めなければならない。未試行の許可済み時刻証人が残っていない場合に限り、policyが許す再試行回数及びbackoffに従って、以前に失敗した時刻証人へ再要求してよい。

\[
retry\_delay(k)=
\min\left(
retry\_backoff\_max,\;
retry\_backoff\_initial\cdot 2^{\min(k,\;retry\_backoff\_exponent\_cap)}
\right)
\]

ここで\(k\)は、同一requestにおける当該時刻証人への過去の失敗回数であり、policy固定の`max_retry_count`によって有界でなければならない。

\(2^k\)は失敗回数とともに増加するため、指数には`TimeWitnessPolicy`が固定する飽和上限`retry_backoff_exponent_cap`を設けなければならない。第9章及び第25章は浮動小数点と実装依存丸めを禁止し、整数又は正規化済み有理数による決定論的評価を要求するため、飽和のない指数は桁あふれにより実装間で異なる結果を生む。

#### 14.4.4 停止条件

時刻証人の自動選択・代替補充・再試行は、次のいずれかが成立するまで継続する。

```text
1. 有効な時刻証人 quorum 及び独立 domain quorum を満たした
2. 未試行及び再試行可能な許可済み時刻証人を全て使っても、
   required_observer_count 又は required_observer_domains の達成が
   数学的に不可能になった
3. policy 固定の collection_deadline に達した
```

停止条件2及び3では、nodeは`TemporalUnverifiable`（第14.5節）とする。nodeは、不十分な時刻証人集合、一つの時刻証人、又は一つの`witness_domain_id`だけを根拠に`healthy`な`TemporalHealthLease`を発行又は更新してはならない。

#### 14.4.5 時刻証人選択の必須不変条件

- 最初に選ばれた時刻証人の失敗だけで、時刻健全性の取得手続を失敗させてはならない
- quorumが未達であり、代替可能な許可済み時刻証人が残る限り、nodeは代替選択を継続しなければならない
- 失敗済み証人の存在は、別の有効な時刻証人によるquorum成立を妨げてはならない
- 時刻証人の応答順、通信遅延及びendpointの可用性は、consensus state、`Q`、depth、`AssetScore`、`A_seed`、Civic又はcheckpoint finalityの入力にしてはならない
- 時刻証人の通信失敗は、Soul、controller又はforumの不正行為・信用低下・罰則の根拠にしてはならない
- 必要quorumを得られずleaseが失効したbodyは、通常authorityをfail closedしなければならない（第14.8節）
- 不健康なbodyにも、時刻証人要求、時刻同期、再検証及び回復に必要な操作を許可しなければならない（第14.8節の`AllowedWhenNotHealthy`）

### 14.5 temporal_health_policy

各forumはgenesisに`temporal_health_policy`を必須で持つ（第2.4節）。

```text
temporal_health_policy {
  max_offset
  max_handshake_uncertainty
  max_round_trip_delay
  max_future_skew
  max_checkpoint_backdate
  max_checkpoint_interval

  required_observer_count
  required_observer_domains
  unhealthy_observation_window
  unhealthy_observation_threshold

  healthy_lease_duration
  quarantine_duration
  revalidation_observer_count
  revalidation_success_window

  time_witness_policy_ref
  failure_mode
}
```

`failure_mode`は`fail_closed_for_normal_authority`に固定する。すなわち、健康を肯定できないことは、通常権限を与えない方向に倒す。

有効なoffset観測が許容範囲外であることは、次で判定する。

\[
TemporalHealthViolation(A,B)
\iff
OffsetInterval(A,B)\cap[-max\_offset,max\_offset]=\varnothing
\]

許容範囲内と確認できないが、範囲外とも確定しない状態を`TemporalUnverifiable`と呼ぶ。`TemporalUnverifiable`は無罪ではなく、通常権限を肯定できない状態である。

時刻証人quorumの到達条件、自動選択、代替補充、再試行及び停止条件は第14.4節に定める。quorumの値は、本節の既存フィールド`required_observer_count`及び`required_observer_domains`で与える。`required_witness_count`及び`required_witness_domains`という名前を本節のschema又はgenesisへ導入してはならない。`forum_id = hash(canonical_encode(genesis_certificate))`（第2.3節）であるため、フィールド名の追加・改名は既存forumの同一性を破壊する。

`time_witness_policy_ref`が指す`TimeWitnessPolicy`は、本節の`temporal_health_policy`とは別のobjectである。本節のschemaへ時刻証人の選択・再試行のフィールドを追加しない。`TimeWitnessPolicy`のcanonical schemaは第22章に置き、少なくとも次を固定パラメータとして持つ。

```text
TimeWitnessPolicy の固定パラメータ {
  allowed_time_sources        許可する time_source_id
  allowed_witness_domains     許可する witness_domain_id
  max_parallel_requests       並列要求数の上限
  max_retry_count             同一 request における当該時刻証人への再試行回数の上限
  retry_backoff_initial       最初の backoff
  retry_backoff_max           最大 backoff
  retry_backoff_exponent_cap  retry_delay(k) の指数の飽和上限
  collection_deadline         手続全体の deadline
}
```

`TimeWitnessPolicy`へフィールドを追加する場合、既存forumの`time_witness_policy_ref`が指すobjectが新しいフィールドを省略時既定値で解釈できるようにしなければならない。参照を差し替える必要を生じさせてはならない。参照が変わると、genesisのcanonical encodeを経由して`forum_id`が変わる（第2.3節）。

### 14.6 健康状態

bodyの健康状態は次のいずれかである。

```text
TemporalHealthState =
  healthy
  degraded
  unhealthy
  quarantined
  excluded
  revalidation_pending
  revalidated
```

- **`healthy`**: 有効なhealth policyに従う十分な観測・時刻証人・leaseがある。
- **`degraded`**: 健康を肯定する証明が不足、失効、または不確実性が過大である。
- **`unhealthy`**: 有効観測により許容範囲外が確定した。
- **`quarantined`**: policyが定める独立観測者数・閾値を満たし、forum状態から通常参加を除外した。
- **`excluded`**: forum固有規則が定める持続的不健康または回復不能状態。
- **`revalidation_pending`**: 回復手続き中。
- **`revalidated`**: 回復条件を満たし、新しいleaseの発行待ちまたは発行済み。

健康stateは非難、刑罰、犯罪歴ではない。**ネットワーク安全上の適格性**を表す。`healthy`以外の間、そのbodyは通常権限のための時間を積めず（第4.2節）、通常objectの発行・更新もできない（第14.8節）。

### 14.7 TemporalHealthLease

通常authorityに使えるのは、`state=healthy`を記録した`TemporalHealthLease`だけである。

```text
TemporalHealthLease {
  forum_id
  subject_soul_id
  device_incarnation_id
  authority_pubkey
  health_epoch
  state
  valid_from
  valid_until
  temporal_health_policy_hash
  evidence_root
  witness_attestations_sorted
  issuer_checkpoint_ref
  signature_or_attestation
}
```

- `valid_until`は`valid_from`より厳密に後でなければならない。
- 古いhealth epochのleaseは、checkpointがより新しいepochを同一Soul・同一forumについて記録した場合に無効とする。
- このleaseは短期であり、検証バンドルに同梱することで、その有効期限内は中央照会なしに検証できる（第1.2節）。

### 14.8 不健康時のgaia-core強制制限

`degraded`、`unhealthy`、`quarantined`、`excluded`、`revalidation_pending`のbodyは、通常のGaia状態を前進させる操作を一切行ってはならない。gaia-coreはdenylistではなく**allowlist**を実装する。許可されるのは次の操作だけである。

この禁止はGaia protocol操作に適用する。不健康Bodyが通常Gaia objectの配送・受領確認・署名・同期をtransport経由で迂回してはならない。一方、Endpointの維持、DHT routing制御、Irohの不透明なrelay forwarding、公開transport descriptorの応答その他のgeneric transport制御は、通常Gaia object操作と混同して禁止しない。下記の禁止リストにある「通常objectのrelay」は、Gaia objectをapplication-levelで中継・再配送・保存することを指し、Iroh relayが下位transport bytesを不透明にforwardingすることとは別である。clock recoveryを可能にする制御通信は、下記allowlistの許可済み例外のまま保存する。

```text
AllowedWhenNotHealthy = {
  ReadStoredObjects,
  VerifyObjects,
  InspectTemporalHealth,
  SynchronizeClock,
  RequestTimeAttestation,
  RespondToTimeChallenge,
  RequestRevalidation,
  SubmitRecoveryProof,
  FetchRecoveryMaterial,
  ReceiveReinstatementProof,
  ReadBankDataRequiredForRecovery
}
```

上記以外の操作は拒否する。とくに、不健康bodyは次の作成・更新・署名・予約・消費・通常配送をしてはならない。

- `root_entry`、`community`、`reciprocal`、`citation`
- forum genesis、forum_chainの更新相当のobject
- `ForumStatePayload`、`ForumStateCheckpoint`、`ForumStateAttestation`
- `RootLedgerEntry`、Q-set、membership、asset registry、citation registry、seed registryの変更
- `AssetRecord`、`ProtectedContent`、`ContentAccessGrant`、`KeyEnvelope`
- `SeedAllocation`、origin lot、asset version update
- `AssetAnnouncement`、`PromotionGrant`、`PressRoom`、`PressRoomMembershipGrant`、`PressReleasePackage`
- `ServiceOffer`、`ServiceOrder`、`StorageContract`、`StorageAcceptanceReceipt`
- Paymentに関する通常request、provider payout request
- Soulの通常migration、authority delegation
- 通常P2P同期、通常objectのrelay、通常objectの受領確認

既存objectの検証・閲覧、復旧資料の取得、時刻回復の通信は許す。

不健康の間に改造client等で署名されたobjectは、署名が数学的に成立しても、発行時点に対応する有効な`TemporalHealthLease`と`SoulEpochLease`を提示できなければ、Gaia正規objectとして受理してはならない（第3.1節の後日投下の無効化）。

### 14.9 通常通信に付帯する健康伝播

健康・Soul・deviceの状態は、専用の流布機構ではなく、通常通信と通常objectの必要条件として付帯させる。

各session要求では、`CommunicationHealthAttachment`のscope（`interface_kind`、`transport_kind`、`service_scope`）及びepochを、当該sessionの`SessionBinding`と一致させなければならない。transport-private headerまたは認証済みtransport contextの存在だけで、このattachmentの提示を省略してはならない。attachmentの欠落・不一致は、既存の健康・epoch検証と同じくfail-closedで拒否する。

```text
CommunicationHealthAttachment {
  sender_soul_id
  sender_incarnation_id
  sender_authority_pubkey
  soul_epoch_lease_ref
  temporal_health_lease_ref
  health_epoch
  operation_sequence
  previous_operation_hash
  latest_forum_checkpoint_ref
  bank_availability_hints_optional
}
```

受信側は次を実行する。

1. 送信者authority keyが指定Soulの唯一のactive bodyに属することを確認する
2. `SoulEpochLease`のepoch、有効期間、Soul-Bank署名を確認する
3. `TemporalHealthLease`のforum、body、health epoch、有効期間、状態を確認する
4. authority operation chainの連続性を確認する
5. 必要な場合だけContentStoreまたはGaia Bankから不足proofを取得する
6. いずれかが欠けるか無効なら、payloadを通常のGaia状態へ適用してはならない

継続sessionではattachmentのhashとepochだけを送ってよい。新規peer、epoch更新、高価値操作、空ContentStoreでの検証では、完全な依存閉包を`StateProofEnvelope`に同梱する（第3.5節）。

### 14.10 健康時間の会計

root以外のnodeの成熟に使える参加時間は、暦上の差分ではなく、継続的に健康と確認された区間の合計である（第4.2節）。本仕様では、この合計は評価対象のtrust epoch内に限定する（第4.1.1節）。Soul Transfer Finalization後のsuccessor controllerは、旧trust epochの健康時間を自身の成熟に使用してはならない。

\[
T_{actual}^{healthy}(node,F)=
\sum_{i\in HealthyIntervals(node,F)}duration(i)
\]

depth、CanIssue、CanIssueTo、MaturityBond、Soul successionの高権限判定に使う時間は、この値または安全側の区間演算からのみ導く。`degraded`、`unhealthy`、`quarantined`、`excluded`、`revalidation_pending`の期間は算入しない。

---

## 15. SoulとDeviceIncarnation

人はforumをまたぎ、端末を換えても続く主体（Soul）としてGaiaに参加する。Gaia objectに署名するのは、その時々の身体に結び付いたauthority鍵である。この章は、Soulの識別、身体（DeviceIncarnation）の記録、active bodyの一意性、そしてauthority操作列の規則を定める。

### 15.1 Soul identity、公開鍵及びauthority鍵

Soulの恒久的な公開識別は`identity_pubkey`及びそこから導かれる`soul_id`である。

\[
soul\_id=hash(canonical\_encode(identity\_pubkey))
\]

`identity_pubkey`は公開される。Gaiaにおいて、公開鍵の秘匿はSoulの完全性又はプライバシー保護の要件ではない。SoulのeKYC詳細、属性値、住所、氏名、Stripe情報、銀行情報その他の個人情報は別途最小開示・commitment・認可規則で保護するが、identity公開鍵そのものを隠してはならない。

- **`identity_pubkey`**はSoulの恒久公開鍵であり、通常objectの署名には使わない。対応するidentity秘密鍵は、DeviceIncarnationの`identity_signature`など高重要度のSoul操作だけに使う。
- **`authority_pubkey`**は、Soulの現active Body又は過去Bodyに属する公開運用鍵である。authority鍵は通常objectへ署名する。authority鍵を一意のSoulへ結び、後継・引退・隔離を検証可能にするため、全authority鍵はDeviceIncarnationにより公開identity鍵へ束縛される。authority鍵はidentity公開鍵を隠すための代替鍵ではない。

一つの鍵をidentityとauthorityの両方に使ってはならない。また、一つの鍵を複数のSoulや複数のincarnationへ流用してはならない。identity秘密鍵を失うとSoulの恒久身分を失うため、Gaiaの通常運営では復元できない。Soul-Bankもidentity秘密鍵を復元しない（第16章）。authority秘密鍵を失った場合は、第16章の正常転生又は喪失転生によりSoul IDを保ったまま新authority鍵を持つBodyへ移行する。

identity秘密鍵が譲渡後に残存するリスクを明記し、次の規則を置く。

- Soul Transfer後、identity鍵だけによる新Body activation、authority delegation、Soul recovery policy変更、Payout beneficiary変更、eKYC binding置換、再譲渡開始を拒否する。
- それらは、現controllerの有効eKYC、現trust epoch、active SoulEpochLease、必要なSoul-Bank policy及びtransfer history chainを要求する。
- 譲渡後に旧controllerがidentity鍵で署名しても、現SoulRecordと現authority epochに整合しなければ通常権限又は高重要度権限として受理しない。

Soul identity鍵及びBody authority鍵に加えて、Gaia nodeはgaia-networkの**transport鍵**を持つ。transport鍵はIrohのSecretKeyであり、その公開鍵であるDeviceIdは生32 bytesのtransport公開鍵として表される。transport鍵はSoul identity鍵でもauthority鍵でもなく、別の識別域に属する。identity鍵又はauthority鍵をtransport鍵として流用してはならず、同じseedからidentity鍵とtransport鍵の双方を導出してはならない。transport接続の認証は「そのtransport秘密鍵を持つ相手」との通信を示すだけであり、Soul権限を単独で証明しない。Soul、incarnation及びauthorityは、署名済みTimeHandshakeで両endpointへ結び、gaia-coreがlease・trust epoch・DeviceIncarnation依存閉包とともに検証する（第29.1節、第29.2節）。

transport鍵の変更はtransport identityの変更であり、Soul ID又はDeviceIncarnationの変更ではない。輸送鍵を変更しただけでSoul又はDeviceIncarnationを書き換えてはならない。

### 15.2 DeviceIncarnation

Soulと、その一世代の身体（authority keyを含む）の結合を、**DeviceIncarnation**という不変objectで記録する。DeviceIncarnationはidentity公開鍵とauthority公開鍵の公開された暗号学的束縛である。

```text
DeviceIncarnation {
  soul_id: SoulId,
  identity_pubkey: MLDSA65PublicKey,

  incarnation_id: IncarnationId,
  incarnation_sequence: u64,
  previous_incarnation_id: IncarnationId | null,

  authority_pubkey: MLDSA65PublicKey,

  status:
    "pending_successor"
    | "active"
    | "retired"
    | "lost_recovery_pending"
    | "succession_contested"
    | "quarantined"
    | "excluded",

  device_binding_attestation_ref: Hash | null,

  created_time_interval: VerifiedTimeInterval,
  activation_time_interval: VerifiedTimeInterval | null,
  retirement_time_interval: VerifiedTimeInterval | null,

  identity_signature: MLDSA65Signature,
  authority_signature: MLDSA65Signature
}
```

署名対象となるbinding messageは、上記全フィールドからsignatureフィールドを除いたcanonical encodingに、domain separationを付与したものとする。

```text
binding_message =
  "gaia:device-incarnation-binding:v1"
  || canonical_encode(all_fields_except_signatures)
```

DeviceIncarnationは、次の二つの署名を持つ。

```text
identity_signature:
  identity秘密鍵が、当該authority_pubkeyを
  当該soul_idのBodyとして登録する意思を署名する

authority_signature:
  authority秘密鍵が、当該SoulのBodyとして
  登録されることを承諾する署名
```

検証器は次を確認する。

\[
VerifyDeviceIncarnation(D)\iff
D.soul\_id=hash(canonical\_encode(D.identity\_pubkey))
\land VerifyMLDSA65(D.identity\_pubkey,D.identity\_signature,D.binding\_message)
\land VerifyMLDSA65(D.authority\_pubkey,D.authority\_signature,D.binding\_message)
\land VerifyIncarnationSequence(D)
\land VerifyPreviousIncarnationReference(D)
\]

`identity_signature`はidentity秘密鍵による署名で「この身体が本当にこのSoulのもの」を、`authority_signature`は新しいauthority秘密鍵による署名で「この鍵がこの身体のために作られた」ことを証明する。`incarnation_sequence`はSoulごとに0から始まる連続整数であり、新しいincarnationは`previous_incarnation_id`で直前のincarnationを必ず一意に参照する。

以下を満たさないDeviceIncarnationは拒否する。

```text
soul_id != hash(canonical_encode(identity_pubkey))
identity_pubkey or authority_pubkey is not ML-DSA-65
identity_signature invalid under identity_pubkey
authority_signature invalid under authority_pubkey
incarnation_sequence is not consecutive
sequence 0 has a previous_incarnation_id
sequence > 0 lacks previous_incarnation_id
previous incarnation belongs to a different soul_id
previous incarnation identity_pubkey differs
multiple DeviceIncarnations have the same (soul_id, incarnation_sequence)
incarnation chain contains a cycle
```

分岐、欠落、時刻逆行、同一sequenceの複数active化、同一authority鍵の複数Soul束縛は、`DuplicateActiveIncarnation`、`IncarnationFork`、`DuplicateAuthorityKeyBinding`、`TemporalCycle`等として拒否する。`identity_pubkey`を欠くDeviceIncarnationは`MissingIdentityPublicKey`として拒否する。

### 15.3 active bodyの一意性

あるSoulについて、同時にactiveであるDeviceIncarnationは、ちょうど0個または1個である。

\[
|ActiveIncarnations(S,t)|\le1
\]

通常authorityのためにはちょうど1個でなければならない。

\[
NormalGaiaAuthority(S,F,t,D)\iff
D.soul\_id=S
\land D.status=active
\land ActiveDevice(S,t)=D
\land |ActiveIncarnations(S,t)|=1
\land VerifyDeviceIncarnation(D)
\land ValidSoulEpochLease(S,D,t)
\land ValidTemporalHealthLease(S,D,F,t)
\land ValidDeviceBinding(D)
\land ValidAuthorityOperationChain(D,t)
\land NotSoulTransferLocked(S,t)
\land ActiveTrustEpoch(S,TrustEpoch(S,t),t)
\]

このpredicateにより、通常authorityを持つBodyについては、`identity_pubkey`から`soul_id`まで、及び`authority_pubkey`からactive Bodyまでの両方向の追跡が公開データだけで可能である。これは、一つのSoulが同時に複数の身体から通常権限を行使できないことを意味する。active bodyの切替は、第16章の正常転生または喪失転生という原子的な手続き、およびSoul Transfer Finalization（第16章）だけが行う。`NotSoulTransferLocked`がfalseなら、健康lease等が有効でも通常objectを発行してはならない。

### 15.4 AuthorityOperationHeaderとauthority操作列

通常authorityを使うすべてのobjectは、次のheaderを持つ。

```text
AuthorityOperationHeader {
  soul_id
  incarnation_id
  authority_pubkey
  operation_sequence
  previous_operation_hash
  soul_epoch
  health_epoch
  soul_epoch_lease_ref
  temporal_health_lease_ref

  trust_epoch
  controller_binding_commitment
  transfer_lock_epoch_or_ref_optional
}
```

`identity_pubkey`は毎objectに重複して含める必要はない。objectが`DeviceIncarnation`参照を持つ場合、当該DeviceIncarnationから公開identity鍵を取得できるためである。ただし、`AuthorityOperationHeader`又はobjectからSoulを主張する場合に、identity公開鍵へ到達するための`DeviceIncarnation`依存閉包が`StateProofEnvelope`に欠けてはならない（第3.5節）。

`trust_epoch`、`controller_binding_commitment`、`transfer_lock_epoch_or_ref_optional`は、後方互換性を壊さない形で導出又は明示的に束縛する。署名対象objectが通常authorityを使う場合、headerの`trust_epoch`は`SoulRecord`及び`SoulTrustEpochTransition` chainから導出した現在epochと一致しなければならない。譲渡中の旧authorityがfreeze後に発行したobject、又は譲渡finalization後に旧epochを使って発行したobjectは、`StaleTrustEpochAuthority`又は`TransferFrozenOperation`として拒否する。

同一のactive bodyが通常objectを発行するたびに、authority操作列は単調に進む。

\[
operation\_sequence_{n+1}=operation\_sequence_n+1
\]

\[
previous\_operation\_hash_{n+1}=hash(operation_n)
\]

これにより、同じ身体が同じ操作列位置から複数の異なる署名objectを発行すると、forkとして検出できる。同一incarnationが、同一`operation_sequence`または同一`previous_operation_hash`から異なるsigned objectを生成した場合、次を作成できる。

```text
AuthorityForkEvidence {
  soul_id
  incarnation_id
  authority_pubkey
  conflicting_object_hashes_sorted
  violated_rule_id
  evidence_objects
}
```

これは犯罪情報ではなく、当該bodyが一意な直列authorityとして機能しないことの**客観的なhealth evidence**である。検証できたforumは、当該incarnationを`quarantined`とする。authority操作列はSoul-Bankの`SoulRecord`や各forumの受領側でも監査できる。

### 15.5 device binding

authority鍵の非可搬性を強めるため、実装はTPM、Secure Enclave、Android Keystore、FIDO2、HSM、TEE等で保護された**non-exportableなauthority鍵**をサポートしなければならない。高権限のoperator tierではdevice binding attestationを必須にできる。

ただし、hardware attestationはGaia objectの通常署名方式を置換しない。Gaia objectの署名はML-DSA-65のままとし、hardware evidenceはauthority鍵が特定deviceに結び付く補助証明である。秘密鍵の秘密コピーが存在することを暗号だけでは検出できない、という事実を本仕様は明記する。Gaiaが強制するのは、(1) 複製された鍵が通常authorityとして有効なobjectを並列に成立させた場合の検出と隔離（第15.4節のfork検出）、および(2) 古いepoch鍵の権限の無効化（第16章）である。

transport鍵の保管と寿命について、次を規定する。

- Gaia hostはtransport seedを安全に保持し、`Network::start`へ渡す。seedはowner限定権限で保存し、ログ・監査出力・公開descriptorへ出さない。
- 同一Bodyの単純なrestartでは同じtransport seedを維持し、DeviceIdを保つ。restartでDeviceIdを変更してはならない。
- 新Body又は新authority generationを用意する場合は、新transport鍵を用意し、新endpointについて新TimeHandshakeを行う。
- transport鍵の変更、失効又は対応付けの更新は、Soul上位のauthority・lease検証に従う。gaia-networkがtransport identityをSoul identityへ暗黙に継承させない。
- `DeviceIncarnation`へtransport鍵を必須フィールドとして追加しない。transport鍵の追加を理由に、既存の署名対象bytes、genesis、`forum_id`を変更しない。
- 新Bodyへのactivationは、第16章の既存Soul-Bank手続（正常転生・喪失転生）をそのまま用いる。gaia-networkのDeviceHandle又はbinding IDの所持は、新Bodyのactivation根拠にならない。

---

## 16. Soul-Bank

### 16.1 Soul-Bankの役割と限界

**Soul-Bank**は、Soulのactive bodyの一意性、authority epoch、そしてdevice喪失時の転生を直列化するための、例外的な中央サービスである。

Soul-Bankが扱うのは「どの身体が、そのSoulの現在の正規な身体か」という一点である。Soul-Bankは次を決めてはならない。

- forum membership
- Q、depth、CanIssue、CanIssueTo
- AssetScore、A_seed、seed allocation
- certificateの意味または有効性
- asset value、asset access、価格
- ForumStateCheckpoint最終性
- eKYCの生個人情報

Soul-BankはSoulごとに追記専用のレコード連鎖を維持し、短期の`SoulEpochLease`を発行する。leaseは短期なので、その有効期限内の通常検証は中央照会なしに完結できる（第1.2節）。

### 16.2 SoulRecord

Soul-BankがSoulごとに保持する現在の状態は、`SoulRecord`として追記専用のhash chainで管理する。

```text
SoulRecord {
  soul_id
  identity_pubkey
  incarnation_epoch
  active_incarnation_id_optional
  active_authority_pubkey_optional
  active_device_binding_commitment_optional
  lifecycle_state
  previous_soul_record_hash
  soul_bank_sequence
  recovery_policy_commitment
  updated_time_interval
  soul_bank_signature

  controller_binding_commitment
  trust_epoch
  transfer_lifecycle_state
  active_transfer_id_optional
  previous_transfer_finalization_hash_optional
  transfer_sequence
}
```

`lifecycle_state`は次のいずれかだけを使う。

```text
active
migration_pending
recovery_pending
succession_contested
temporarily_frozen
retired
```

`SoulRecord`の`identity_pubkey`は必須の公開フィールドである。検証器は、常に次を確認する。

\[
SoulRecord.soul\_id
=
hash(canonical\_encode(SoulRecord.identity\_pubkey))
\]

Soul-Bankはidentity公開鍵を隠す、置き換える、同一Soul IDに別identity公開鍵を割り当てる、又はidentity公開鍵不明のSoulRecordを発行してはならない。

Soul-BankはSoulごとに追記専用のhash chainを維持する。

\[
soul\_bank\_sequence_{n+1}=soul\_bank\_sequence_n+1
\]

\[
previous\_soul\_record\_hash_{n+1}=hash(SoulRecord_n)
\]

`transfer_lifecycle_state`は次の列挙値に固定する。通常の`lifecycle_state`と混同しないため、Soulの通常lifecycleとtransfer lifecycleは別フィールドにする。

```text
none
transfer_pending
transfer_frozen
transfer_settling
transfer_disputed
transferred
transfer_cancelled
transfer_reverted
```

制約を明記する。

- `transfer_sequence`はSoulごとに0から始まる連続整数である。
- `transfer_lifecycle_state=transfer_frozen`、`transfer_settling`又は`transfer_disputed`なら、`active_transfer_id`は必須である。
- `transferred`は履歴的結果であり、Soulが通常権限を永久に失うことを意味しない。最新SoulRecordは新controllerのactive状態へ進み得る。
- 一つのSoulについて、同時に複数のactive transferを持ってはならない。

\[
|ActiveTransfers(S,t)|\le1
\]

### 16.3 SoulEpochLease

Soul-Bankは、特定incarnationにauthority epochを与える短期のleaseを発行する。

```text
SoulEpochLease {
  soul_id
  incarnation_id
  authority_pubkey
  incarnation_epoch
  valid_from
  valid_until
  soul_record_hash
  revocation_epoch_at_issue
  soul_bank_service_id
  soul_bank_signature
}
```

- 通常objectのauthorityは、発行時点を`valid_from`〜`valid_until`で覆う`SoulEpochLease`を持たなければならない。
- leaseは短期であり、検証バンドルに同梱すれば中央照会なしに検証できる。
- `revocation_epoch_at_issue`により、将来のrevocation後も、発行時点で有効だったことを遡及検証できる。

`SoulEpochLease`は次の場合に限り有効である。

```text
SoulEpochLease is valid only if:
  its soul_id resolves to a public identity_pubkey
  hash(canonical_encode(identity_pubkey)) == soul_id
  its incarnation_id and authority_pubkey match a valid DeviceIncarnation
  that DeviceIncarnation has the same soul_id and identity_pubkey
  the referenced SoulRecord has the same soul_id, identity_pubkey,
  active incarnation and active authority key at the lease epoch
```

`SoulEpochLease`がidentity公開鍵を直接重複保持する必要はないが、検証bundleは参照`SoulRecord`又は`DeviceIncarnation`を通じてidentity公開鍵を取得できなければならない。

### 16.4 正常転生

**正常転生**は、旧bodyが`healthy`であり、まだ使える場合に行う転生である。たとえば、新しい端末へ計画的に引っ越す場合がこれにあたる。

```text
NormalSuccessionIntent {
  soul_id
  old_incarnation_id
  new_incarnation_id
  new_authority_pubkey
  new_device_binding_attestation_ref_optional
  next_incarnation_epoch
  old_soul_epoch_lease_ref
  old_temporal_health_lease_ref
  succession_nonce
  old_authority_signature
  new_authority_signature
}
```

有効な正常転生は、次のすべてを満たす。

\[
status(old)=active
\]

\[
status(new)=pending\_successor
\]

\[
next\_incarnation\_epoch=current\_epoch+1
\]

\[
ValidTemporalHealthLease(old)=true
\]

Soul-Bankは、一つの原子的な更新でoldを`retired`に、newを`active`にする。新しいbodyは、この更新が完了する前には通常objectを発行してはならない。

正常転生では、identity公開鍵及びSoul IDは変わらない。

```text
identity_pubkey(old body) == identity_pubkey(new body)
soul_id(old body) == soul_id(new body)
authority_pubkey(old body) != authority_pubkey(new body)
incarnation_sequence(new) == incarnation_sequence(old) + 1
```

通常転生は、identity秘密鍵を毎回の通常署名に使うための機構ではない。identity秘密鍵によるDeviceIncarnation登録と、旧authority鍵・新authority鍵の承認、Soul-Bankによるepoch直列化により、新authority鍵へ日常権限を移すための機構である。

### 16.5 喪失転生

旧deviceが破損、紛失、永久停止、またはauthority鍵を利用不能にした場合は、Soul-Bankが例外的な**喪失転生**（lost-body succession）を行える。

```text
LostBodySuccessionRequest {
  soul_id
  lost_incarnation_id
  successor_incarnation_id
  successor_authority_pubkey
  successor_device_binding_attestation_ref_optional
  successor_temporal_health_proof_ref
  recovery_eligibility_credential_ref
  recovery_epoch
  request_time_interval
  recovery_commitment
  requester_signature
}
```

Soul-Bankは、次のすべてを満たす場合だけ切替できる。

- 有効なOwner-authorized eKYC issuerが発行した`RecoveryEligibilityCredential`がある（第17章）
- 新しいbodyがhealth revalidationを満たす
- Soulの状態が`succession_contested`でない
- 規定のcooldownと異議受付期間が経過している
- recovery policyのthreshold条件を満たす
- 同一のlost incarnationを参照する競合successorがない

競合するsuccession requestがある場合、Soul-Bankはどちらもactiveにしてはならない。Soulを`succession_contested`に遷移させ、解除まで通常authorityは0とする。

喪失転生の完了時、旧authority epochは不可逆にrevokeされる。旧deviceが後で発見されても、旧epochの署名は通常のGaia authorityとして受理してはならない。

旧Body又は旧authority秘密鍵が利用不能な喪失転生では、identity秘密鍵が利用可能か、又は`RecoveryEligibilityCredential`等の回復policyに従うかにより、Soul-Bankが新Body切替を扱う。いずれの場合も、Soul IDを変えてはならず、新Bodyは公開`identity_pubkey`に束縛されたDeviceIncarnationを持たなければならない。

### 16.6 転生の前後で変わらないもの、変わらないために

転生によって変わらないのは、soul_id（恒久身分）、participation_anchorと積み上げた健康な参加時間（forum側の履歴）、保有する証明書と、Soulの正しい履歴だけである。転生によって新たに生まれてはならないのは、Q、depthの前倒し、早期アクセス枠、root_entry通番、創設seedである。新しく生まれるのは、新しいauthority鍵と、それを裏付ける新しいincarnationだけである。

転生後、forum側は新しいactive bodyのauthority keyで署名されたobjectを、`SoulEpochLease`と`TemporalHealthLease`を検証して受け取る（第1.2節、第3.1節、第14章）。

### 16.7 Soul Transfer

Soul Transferは、eKYC済みの売主（predecessor controller）と買主（successor controller）との間で、Soulの将来の管理・運用責任、指定可能な商業的権利、および将来のauthority操作権を、履歴を不変に保ったまま引き継ぐ正式手続である。Soul TransferはBody転生ではない。`soul_id`、`identity_pubkey`、過去の署名・証明書・投票・責任は不変のまま残り、将来のcontroller binding、active Body、authority epoch、trust epochだけが原子的に切り替わる（第1.4節）。

Soul Transferの全objectは、第3章のobject共通規則（canonical encoding、content hash、ML-DSA-65署名、`VerifiedTimeInterval`、依存閉包）を満たす。transfer lifecycleは`SoulRecord.transfer_lifecycle_state`に記録され、同時に進行するactive transferは高々1つである（第16.2節）。

#### 16.7.1 SoulTransferAgreement

`SoulTransferAgreement`は、eKYC済み売主・買主が、対象Soul、譲渡scope、trust epoch交替、価格、決済参照、評価checkpoint、凍結・異議期限、前譲渡参照を固定して双方署名する不変合意である。

```text
SoulTransferAgreement {
  transfer_id: Hash
  protocol_version: u32
  subject_soul_id: SoulId
  transfer_sequence: u64
  previous_transfer_hash: Hash | null

  seller_soul_id: SoulId
  seller_identity_pubkey: MLDSA65PublicKey
  buyer_soul_id: SoulId
  buyer_identity_pubkey: MLDSA65PublicKey

  seller_identity_binding_credential_ref: Hash
  buyer_identity_binding_credential_ref: Hash
  seller_ekyc_revocation_state_ref: Hash
  buyer_ekyc_revocation_state_ref: Hash
  seller_distinctness_scope_proof_ref: Hash
  buyer_distinctness_scope_proof_ref: Hash

  source_trust_epoch: u64
  successor_trust_epoch: u64
  transfer_scope: SoulTransferScope

  price_currency: CurrencyCode
  price_amount_minor: u64
  payment_order_ref: Hash
  payment_authorization_ref: Hash

  valuation_checkpoint_refs_sorted: [Hash]
  freeze_not_before: VerifiedTimeInterval
  freeze_deadline: VerifiedTimeInterval
  dispute_deadline: VerifiedTimeInterval
  finalization_deadline: VerifiedTimeInterval

  seller_controller_binding_commitment: Hash
  buyer_controller_binding_commitment: Hash
  seller_signature: MLDSA65Signature
  buyer_signature: MLDSA65Signature
}
```

`SoulTransferScope`は少なくとも次のboolean又はenumを持つ。

```text
future_authority_control
publisher_contract_novation_refs_sorted
content_access_grant_refs_sorted
storage_contract_refs_sorted
bank_service_contract_refs_sorted
commercial_offer_refs_sorted
exclude_maturity_and_civic_rights = true
exclude_prior_payout_entitlements = true
exclude_prior_trust_derived_bonuses = true
```

agreementは次を禁止する。人格的信頼・成熟度・Civic影響を承継させるscopeは受理しない。

```text
carry_q
carry_depth
carry_can_issue
carry_asset_score
carry_aseed
carry_cultivation_bonus
carry_citation_bonus
carry_candidates
carry_reach
carry_civic_citizenship
carry_civic_votes
carry_civic_nullifiers
carry_prior_payout_entitlements
```

これらをtrueにできる拡張fieldを作ってはならない。存在した場合は`ForbiddenTransferTrustCarryField`として拒否する。

#### 16.7.2 SoulTransferFreeze

`SoulTransferFreeze`は、対象Soulを譲渡専用の凍結状態へ置き、評価checkpoint、凍結理由、許可された限定操作、payment reservation参照を固定する不変objectである。

```text
SoulTransferFreeze {
  transfer_id: Hash
  subject_soul_id: SoulId
  transfer_sequence: u64
  agreement_ref: Hash
  source_checkpoint_refs_sorted: [Hash]
  frozen_at: VerifiedTimeInterval
  permitted_operations_sorted: [TransferSafeOperation]
  previous_soul_record_hash: Hash
  resulting_soul_record_hash: Hash
  signature_or_attestation: SignatureOrAttestation
}
```

freeze中に許してよい`TransferSafeOperation`は次のものだけである。

```text
ReadStoredObjects
VerifyObjects
InspectTransferState
InspectTemporalHealth
SynchronizeClock
RequestTimeAttestation
RespondToTimeChallenge
RequestRevalidation
SubmitTransferDispute
SubmitTransferResolutionEvidence
FetchRecoveryMaterial
ReceiveReinstatementProof
FinalizeTransferWhenAuthorized
```

freeze中に次の操作を含めてはならない。

```text
IssueCertificate
CreateCheckpoint
PublishAsset
UpdateAsset
RevokeOrGrantContentAccess
CreateCivicVote
CreateCivicNeedAsset
ClaimPayout
ChangePayoutBeneficiary
CreateNewTransfer
CreateAuthorityDelegation
CreateForum
CreateRootEntry
```

#### 16.7.3 SoulTransferPaymentReservation

`SoulTransferPaymentReservation`は、Payment-ServiceがStripe上で譲渡対価を予約又は保留した外部事実を、対象agreementと決済objectへ束縛する署名済みobjectである（第18章）。

```text
SoulTransferPaymentReservation {
  transfer_id: Hash
  agreement_ref: Hash
  payer_soul_id: SoulId
  payee_soul_id: SoulId
  gross_amount_minor: u64
  currency: CurrencyCode
  stripe_payment_intent_commitment: Hash
  stripe_charge_commitment_optional: Hash | null
  stripe_balance_transaction_commitment_optional: Hash | null
  reservation_state: paid_held_in_escrow_like_reserve
  payment_service_authorization_ref: Hash
  payment_time_interval: VerifiedTimeInterval
  release_conditions_commitment: Hash
  signature: MLDSA65Signature
}
```

`paid_held_in_escrow_like_reserve`はStripeの法的エスクローを主張する語ではない。Payment-ServiceがStripe Platform上で、finalization及び既存のrefund/dispute/chargeback policyに従うまで、売主への外部Transfer/Payoutを確定させない運用上の予約状態であることを明記する。

#### 16.7.4 SoulTransferFinalization

`SoulTransferFinalization`は、eKYC、distinctness、凍結、旧authority失効、新Body束縛、新SoulEpochLease、trust epoch切替、履歴commitment、決済予約及び紛争なしを確認してSoul controller交替を確定するobjectである。

```text
SoulTransferFinalization {
  transfer_id: Hash
  subject_soul_id: SoulId
  transfer_sequence: u64
  agreement_ref: Hash
  freeze_ref: Hash
  payment_reservation_ref: Hash

  seller_ekyc_validation_commitment: Hash
  buyer_ekyc_validation_commitment: Hash
  distinct_legal_subject_validation_commitment: Hash
  no_unresolved_dispute_proof_ref: Hash

  old_active_incarnation_ref: Hash
  old_soul_epoch_lease_ref: Hash
  old_authority_revocation_commitment: Hash
  successor_device_incarnation_ref: Hash
  successor_soul_epoch_lease_ref: Hash
  successor_controller_binding_commitment: Hash

  trust_epoch_transition_ref: Hash
  finalization_checkpoint_ref: Hash
  transfer_history_commitment: Hash
  finalized_at: VerifiedTimeInterval

  soul_bank_service_id: ServiceId
  soul_bank_signature: MLDSA65Signature
}
```

finalizationのpredicateを次に固定する。各項目は省略不可であり、一つでも欠ければfinalizationを拒否する。

\[
CanFinalizeSoulTransfer(T,S,t)
\iff
ValidAgreement(T,t)
\land ValidFreeze(T,S,t)
\land ValidTransferEkyc(Seller(T),t)
\land ValidTransferEkyc(Buyer(T),t)
\land DistinctLegalSubject(Seller(T),Buyer(T),t)
\land PaymentReserved(T,t)
\land NoUnresolvedTransferDispute(T,t)
\land OldAuthorityRevoked(T,t)
\land SuccessorBodyBound(T,S,t)
\land ValidTrustEpochTransition(T,S,t)
\land TransferHistoryCommitted(T,S,t)
\]

#### 16.7.5 SoulTrustEpochTransition

`SoulTrustEpochTransition`は、Soul Transferに伴うtrust epochの単調増加、過去epochとの境界、非承継policy及びeffective時点を固定するobjectである。

```text
SoulTrustEpochTransition {
  subject_soul_id: SoulId
  transfer_id: Hash
  previous_trust_epoch: u64
  next_trust_epoch: u64
  effective_from: VerifiedTimeInterval
  previous_epoch_commitment: Hash
  successor_controller_binding_commitment: Hash
  carry_policy: history_only_no_trust_carry_v1
  previous_transition_hash: Hash | null
  signature_or_attestation: SignatureOrAttestation
}
```

次を必須にする。

\[
next\_trust\_epoch = previous\_trust\_epoch + 1
\]

`carry_policy`は`history_only_no_trust_carry_v1`に固定する。algorithm agility又はforumごとの選択肢にしない。

#### 16.7.6 異議・取消・解決

Soul Transferの取消は、履歴削除ではない。`SoulTransferDispute`及び`SoulTransferResolution`を追記する。

- finalization前の取消は、双方署名又は認可された紛争解決により行う。
- finalization後の「巻戻し」は、過去finalizationを消すのではなく、新しいtransfer sequenceにおける逆向きの正式譲渡又は法的・安全上の例外解決として記録する。
- chargebackのみを理由に、すでにfinalizedなSoul controllerを自動的に旧controllerへ戻してはならない。これは買主・売主・第三者の後続行為を壊すためである。
- 金銭回収はPayment-Serviceの`PayoutRecoveryAction`等で扱い、権限巻戻しには別の明示的な解決・eKYC・新authority切替が必要とする。

#### 16.7.7 正常転生・喪失転生との分離

`NormalSuccessionIntent`は同一controllerの端末更新であり、Soul Transferを代替しない。`LostBodySuccessionRequest`は端末喪失の復旧であり、Soul Transferを代替しない。`RecoveryEligibilityCredential`は復旧資格であり、譲渡の本人確認・別人格性確認を代替しない。controller変更がある場合にNormal/Lost successionだけを提示するobjectは`ControllerChangeWithoutSoulTransfer`として拒否する。

---

## 17. eKYC

### 17.1 目的と制限

**eKYC**は、Soulという仮想上の存在を、必要な場合にだけ現実世界の自然人、法人、または法的責任主体へ結び付ける、例外的な中央サービスである。

eKYCは次を証明できる。

- 本人性（このSoulの背後に実在の主体がいる）
- 年齢、法域、事業者性
- uniqueness scope（指定範囲内で本人が一意であること）
- Soul recovery資格（第16.5節の喪失転生に必要な資格）
- 経済参加資格

eKYCは次を決定してはならない。

- Q、depth、CanIssue、CanIssueTo
- AssetScore、A_seed
- certificateの有効性、checkpoint最終性
- forum membership。ただし`membership_ekyc_policy=verified_required`のforumにおける参加境界（第4.2節、第13.2節、第17.8節）に限る。`ActiveMembers`又は`membership_root`の定義を変更せず、`verified_required`以外のforumではforum membershipを決定しない

本人確認書類、本名、住所、生年月日、顔画像、電話番号、eKYCの生データを、Gaia P2P object、`ForumStateCheckpoint`、`StateProofEnvelope`、Gaia Bank provider、通常通信へ含めてはならない。eKYCの生データは、認可されたeKYC serviceの内部に留める。

eKYCは、GaiaにおいてSoulの成熟度や通常発行権を発行する機関ではない。eKYCが発行できるのは、特定Soulが特定時点・特定scopeにおいて現実世界の責任主体と結び付いていることを示す、期限付き・失効可能なcredentialだけである。

CivicCitizenとして利用されるeKYC credentialは、ネットワーク照会を必要とせず、credential本体、issuer authorization、期限、Soul束縛、失効状態proofおよびcheckpointによって完全オフライン検証できなければならない（第3.5節、第23章）。

> eKYCは、譲渡当事者が追跡可能な現実責任主体であること、及び必要な一意性・別主体性scopeを満たすことを署名済みcredentialとして示す。eKYC providerは譲渡価格の妥当性、譲渡対象の市場価値、譲渡後の成熟度、発行権、AssetScore、Civic Vote又はforum運営の正当性を裁定してはならない。

### 17.2 IdentityBindingCredential

Soulと現実の主体との結び付きは、`IdentityBindingCredential`として発行する。

```text
IdentityBindingCredential {
  credential_id
  subject_soul_id
  subject_identity_pubkey_commitment
  assurance_level
  uniqueness_scope
  verified_attributes_commitment
  issued_at
  expire
  revocation_status_ref
  credential_policy_hash
  issuer_ekyc_service_id
  issuer_authorization_ref
  signature
}
```

`subject_identity_pubkey_commitment`は、非開示のidentity公開鍵を想定するためのものではない。identity公開鍵は公開されるため、credentialを検証する`StateProofEnvelope`は公開`identity_pubkey`を含み、次を再計算しなければならない。

```text
subject_soul_id
  == hash(canonical_encode(identity_pubkey))

subject_identity_pubkey_commitment
  == hash(
       "gaia:identity-pubkey-commitment:v1"
       || canonical_encode(identity_pubkey)
     )
```

ここでcommitmentを残す理由は、credentialの署名対象にidentity公開鍵のcanonical bytesを安定して束縛し、domain separationを明確にするためである。identity公開鍵を隠すためではない。

credentialは**最小開示**を原則とする。利用者は、必要なときに「KYC済み」「成人」「特定法域の事業者」「指定uniqueness scope内で一意」といったassertionだけを提示できる。生の本人情報を開示する必要はない。

`IdentityBindingCredential`の期限と失効に関して、次を必ず満たす。

- `issued_at`と`expire`は必須の整数tickである
- `expire > issued_at`でなければならない
- `expire`を欠く`IdentityBindingCredential`は無効である
- `expire`に無限大、最大値による擬似永続、言語依存表現を用いてはならない
- credentialは、評価時刻`t_state`について`issued_at < t_state < expire`を満たす場合だけCivicCitizen claimに利用できる
- `subject_soul_id`と`subject_identity_pubkey_commitment`のSoul束縛を検証できないcredentialは無効である
- `uniqueness_scope`はCivic Voteに必要な一意性判定を可能にしなければならない
- `revocation_status_ref`は必須である

`IdentityBindingCredential`のうちCivicCitizen判定に利用するものは、gaia-coreが定めるCivic用保証水準以上の`assurance_level`を持ち、Civic Voteの重複排除に必要な`uniqueness_scope`を満たさなければならない。これらの最低要件はforumごとに変更してはならない（第23章）。

`IdentityBindingCredential`の更新は、上書きでなく追記とする。

- 新credentialは新しい`credential_id`を持つ。
- 既存credentialを削除・置換してはならない。
- 更新理由、先行credential参照、発行時刻、期限、失効状態を追記可能にする。
- credentialの平文個人情報はGaia P2P objectに置かず、既存の`verified_attributes_commitment`等の最小開示commitmentを使う。
- 譲渡に使うcredentialは、transfer tier / legal-transfer eligibilityを持つ必要がある。

推奨schema拡張は以下である。

```text
supersedes_credential_ref_optional: Hash | null
credential_purpose_set_sorted: [civic, recovery, commercial, forum_membership, soul_transfer, forum_root_transfer]
legal_transfer_eligibility: boolean
beneficial_owner_scope_commitment_optional: Hash | null
```

ただし、`legal_transfer_eligibility`は「信用を買える資格」ではなく、高リスク譲渡の本人確認・規制対応に必要な属性にすぎないことを明記する。

#### 17.2.1 DistinctLegalSubject、TransferDistinctnessCredentialとValidTransferEkyc

Soul Transferの売主と買主は、別人格の実在責任主体（distinct legal subject）でなければならない。

\[
DistinctLegalSubject(A,B,t)
\iff
ValidTransferEkyc(A,t)
\land ValidTransferEkyc(B,t)
\land DistinctnessScope(A,B,t)
\]

`DistinctnessScope`は、少なくとも次を扱う。

- 同一自然人でない
- 同一法人でない
- 必要な法域・譲渡tierで同一実質的支配者として扱われない
- 同一Stripe Connected Account又は同一支払手段だけを唯一根拠にしてはならないが、リスクシグナルとして使える

P2P objectには個人情報や実質的支配者情報の平文を出さない。eKYC providerは、最小開示の署名済み`TransferDistinctnessCredential`又は同等のzero/minimal-disclosure assertionを発行できる。

```text
TransferDistinctnessCredential {
  credential_id
  subject_a_soul_id
  subject_b_soul_id
  scope_commitment
  assertion: distinct | prohibited_related_party | indeterminate
  issued_at
  expire
  revocation_status_ref
  issuer_ekyc_service_id
  issuer_authorization_ref
  signature
}
```

`indeterminate`は譲渡許可に使えない。`distinct`だけを許可する。

譲渡eKYCのpredicateを次に固定する。CivicCitizenを譲渡資格に流用してはならない。CivicCitizenは公共層用の資格であり、譲渡eKYCは別purposeを必要とする。

\[
ValidTransferEkyc(S,t)
\iff
Exists\ c:\ IdentityBindingCredential
\land c.subject\_soul\_id=S
\land c.issued\_at<t<c.expire
\land TransferPurposeAuthorized(c)
\land VerifyCredentialNonRevocation(c,t)
\land VerifyEkycServiceAuthorization(c,t)
\land VerifyRequiredTransferAssurance(c)
\]

### 17.3 eKYC service authorization

eKYC providerとして動作するには、Owner thresholdによる認可が必要である（第18章のOwner set）。認可は次のobjectで表す。

```text
EkycServiceAuthorization {
  service_id
  operator_soul_id
  operator_authority_pubkey
  credential_signing_pubkeys
  assurance_levels
  permitted_credential_kinds
  jurisdiction_scope
  privacy_policy_commitment
  retention_policy_commitment
  audit_policy_commitment
  valid_from
  valid_until
  authorization_epoch
  owner_set_commitment
  owner_threshold_signatures
}
```

有効なeKYC providerは、次のすべてを満たさなければならない。

- Owner threshold authorizationがある
- operator自身が有効なoperator eKYCを持つ（第21章）
- credential署名が認可されたkeyで行われている
- authorizationが失効していない

eKYC providerは、自分自身、自分のoperator Soul、または同一支配主体へ**自己発行credentialを発行してはならない**。

`EkycServiceAuthorization`は`valid_from`と`valid_until`を持つ。CivicCitizen claimでcredential issuerとして認められるためには、credentialの発行時点および評価時点に必要な認可連鎖が有効でなければならない。

eKYC serviceは、Civic Voteの票数・票先・nullifier・NeedScore・順位・CivicNeedAsset状態を署名または裁定してはならない。eKYC serviceが署名できるのは、credential、失効状態、および本章で許可される限定的な一意性・保証水準の証明だけである（第23章）。

### 17.4 IdentityTier

```text
IdentityTier =
  pseudonymous
  soul_verified
  economic_verified
  regulated_operator
  root_ekyc_operator
```

forumはgenesisで、通常参加、商用Bank、Soul recovery custody、eKYC発行、Payment-Service operationに要求する最低tierを定められる。ただし、tierが高いことはQ、depth、CanIssue、CanIssueTo、AssetScoreを直接増加させない。tierは外部責任の資格であり、Gaia内の関係ネットワーク上の優越性を意味しない。

### 17.5 RecoveryEligibilityCredential

喪失転生（第16.5節）を申請するには、Owner-authorized eKYC issuerが発行する復旧資格credentialが必要である。

```text
RecoveryEligibilityCredential {
  credential_id
  subject_soul_id
  subject_identity_pubkey_commitment
  recovery_scope
  verified_at
  issued_at
  expire
  revocation_status_ref
  issuer_ekyc_service_id
  issuer_authorization_ref
  signature
}
```

このcredentialは「このSoulの背後にいる主体が、復旧手続きを依頼する本人である」ことを、必要最小限の形で結び付ける。credential自体は新しいQ、depth、早期アクセス枠、seedを生まない。

### 17.6 EkycRevocationState

`IdentityBindingCredential`が有効期限内であっても、重複、取消し、偽造、資格喪失その他の理由により失効していることがある。したがってCivicCitizen claimは、単なる`expire`比較ではなく、checkpoint時点の失効状態をオフライン検証しなければならない。

`EkycRevocationState`は、認可済みeKYC serviceが発行する、credential失効registryの状態を固定する不変objectである。

```text
EkycRevocationState
- issuer_ekyc_service_id
- revocation_epoch
- registry_root
- valid_from
- valid_until
- issuer_authorization_ref
- signature
```

次を満たさなければならない。

```text
valid_until > valid_from
```

CivicCitizen claimにおいて、検証器は`EkycRevocationState`の署名、issuer authorization、時刻有効性、および対象credentialに対するMerkle inclusionまたはnon-inclusion proofを検証する。

- credentialが失効registryに含まれる場合、`RevokedEkycCredential`として拒否する
- 対象時点を覆う有効な`EkycRevocationState`または必要proofがない場合、`MissingEkycNonRevocationProof`として拒否する
- stateが期限切れ、認可切れ、署名不正またはSoul/issuer不一致の場合、対応するeKYC errorとして拒否する

`EkycRevocationState`は、過去のfinalized Civic Voteを遡及変更するために用いてはならない。各Civic Voteは、そのvote epochのfinalization checkpointで証明されたcredential状態だけを用いる（第23章）。

`EkycRevocationState`の規則を、譲渡にも適用する。

- 売主・買主双方のcredentialは、agreement、freeze、finalizationの各必要評価時点で有効・未失効でなければならない。
- finalization後の後日失効は、過去のfinalizationを消去しない。ただし将来の譲渡、Payout、Civic、商業操作への影響は各規則に従う。
- eKYC providerが失効させたからといって、過去の売主の責任を買主に、又は買主の責任を売主に移してはならない。

### 17.7 CivicCitizen predicate

Soul `S`がforum `F`において評価時刻`t_state`でCivicCitizenである条件を次で定義する。

\[
CivicCitizen(S,F,t_{state})\iff
\begin{aligned}
&Exists\ c:IdentityBindingCredential\\
\land\;&c.subject\_soul\_id=S\\
\land\;&c.issued\_at<t_{state}<c.expire\\
\land\;&VerifyCanonicalHash(c)\\
\land\;&VerifyMLDSA65Signature(c)\\
\land\;&VerifySoulIdentityBinding(S,c.subject\_identity\_pubkey\_commitment)\\
\land\;&VerifyEkycServiceAuthorization(c.issuer\_authorization\_ref,t_{state})\\
\land\;&VerifyCivicAssuranceLevel(c.assurance\_level)\\
\land\;&VerifyCivicUniquenessScope(c.uniqueness\_scope,F,t_{state})\\
\land\;&VerifyCredentialNonRevocation(c,c.revocation\_status\_ref,t_{state})\\
\land\;&VerifyRequiredStateProofEnvelopeDependencies(c,S,F,t_{state})
\end{aligned}
\]

`CivicCitizen(S,F,t_state)`を検証するbundleは、authority公開鍵だけでCivic資格を主張してはならない。必須閉包は次である。

```text
1. current authority_pubkey
2. valid active DeviceIncarnation
3. public identity_pubkey in that DeviceIncarnation
4. soul_id recomputed from public identity_pubkey
5. valid SoulEpochLease for the same soul_id / incarnation / authority key
6. IdentityBindingCredential for the same soul_id and identity commitment
7. EkycServiceAuthorization and necessary Owner/root authorization chain
8. EkycRevocationState and non-revocation proof
9. necessary uniqueness_scope proof
10. temporal health / checkpoint alignment proof where required
```

以下を満たさない場合、`CivicCitizen=false`である。

```text
identity_pubkey missing
soul_id mismatch
DeviceIncarnation identity signature invalid
authority key not bound to that Soul
credential commitment mismatch
credential expired
credential revoked
issuer authorization invalid
uniqueness scope invalid
required StateProofEnvelope dependency missing
```

このpredicateはfail-closedである。必要なcredential、issuer authorization、失効状態、Merkle proof、Soul束縛proofまたは時刻有効性のいずれかが欠ける場合、`CivicCitizen=false`とする。これは通常のGaia権限を停止するのではなく、市民層で必要な操作だけを拒否する。

`CivicCitizen=false`は、Soulが不正・悪意・低信用であることを意味しない。単に当該評価時点で、公共責任主体としてのeKYC証明が検証バンドル内で成立していないことを意味する。CivicCitizen判定が関係するのは、Civic Vote、CivicNeedAsset供給資格、CivicCandidatesおよびCivicReachに限られる（第23章）。

### 17.8 ForumMembershipEkyc predicate（forum参加境界）

Soul `S`がforum `F`において評価時刻`t`でforum参加境界のeKYCを満たす条件を次で定義する。

\[
ForumMembershipEkyc(S,F,t)\iff
\begin{aligned}
&Exists\ c:IdentityBindingCredential\\
\land\;&c.subject\_soul\_id=S\\
\land\;&c.issued\_at<t<c.expire\\
\land\;&ForumMembershipPurposeAuthorized(c)\\
\land\;&VerifyCanonicalHash(c)\\
\land\;&VerifyMLDSA65Signature(c)\\
\land\;&VerifySoulIdentityBinding(S,c.subject\_identity\_pubkey\_commitment)\\
\land\;&VerifyEkycServiceAuthorization(c.issuer\_authorization\_ref,t)\\
\land\;&VerifyCredentialNonRevocation(c,c.revocation\_status\_ref,t)\\
\land\;&VerifyForumMembershipAssuranceLevel(c.assurance\_level)\\
\land\;&VerifyForumMembershipUniquenessScope(c.uniqueness\_scope,F,t)\\
\land\;&VerifyRequiredStateProofEnvelopeDependencies(c,S,F,t)
\end{aligned}
\]

`ForumMembershipPurposeAuthorized(c)`は、credential `c`が少なくとも次のpurposeを持つことを要求する。

```text
forum_membership
```

`forum_membership` purposeを持たないeKYC credentialを、forum参加eKYC proofとして使ってはならない。

`ForumMembershipEkyc`は`ActiveMember`（第4.2節、第13.2節）を前提にしてはならない。`ActiveMember`の構成条件は`EkycMembershipEligible`を通じて`ForumMembershipEkyc`を参照するため（第4.2節）、`ForumMembershipEkyc`が`ActiveMember`を前提にすると検証が循環する。eKYC必須forumへの初回参加前、すなわち`root_entry`又は`community`をまだ持たない時点で検証できなければならない。

`ForumMembershipEkyc`は、Civic Voteのための`CivicCitizen`（第17.7節）とは別のpredicateである。

```text
ForumMembershipEkyc:
    forum参加境界のeKYC predicate

CivicCitizen:
    active membershipを含むCivic Vote用predicate
```

両者は独立の検証経路であり、一方の成立又は不成立から他方を導いてはならない。`ForumMembershipEkyc(S,F,t)=true`であっても、`CivicCitizen`、Civic Vote、`CivicNeedAsset`の票、Civic validator資格又はCivic influenceを自動的に与えてはならない。`ForumMembershipEkyc`はforum参加境界だけを定める。これは`Q`、depth、`CanIssue`、`CanIssueTo`、`AssetScore`、`A_seed`、EarlyBonus、CultivationBonus、CitationBonus、Civic influence又はforum root権限を直接発行・購入・変更する経路を作らない。`membership_ekyc_policy=verified_required`のforumでは、`EkycMembershipEligible`（第4.2節）を通じて`ActiveMember`述語の条件になるため、forum参加境界のpathに限り`T_actual`、`depth`、`Q`寄与、`AssetScore`、`Candidates`、`Reach`、及びその下流量である`A_seed`と`EarlyBonus`を変化させ得る。この効果も`ActiveMember`述語を唯一の経路とし（第24.19節の項目11）、係数・重み・閾値・bonus項がeKYC状態を直接読む経路を作らない。`verified_required`以外のforum、及び`verified_required`のforumでも`ActiveMember`以外の経路では、forum membershipを決定しない（第17.1節）。`ForumMembershipEkyc`を欠くことによる停止はforum参加境界だけに作用し、`suspended_for_ekyc`（第17.11節）の範囲を超えてSoulの通常権限を停止しない。

`CivicCitizen`に要求するassurance水準とuniqueness scopeの最低要件はforumごとに変更してはならない（第17.2節、第23章）。`membership_ekyc_policy`が定めるのはforum参加境界だけであり、Civic Vote用のこれらの最低要件を変更しない。

### 17.9 ForumEkycParticipationProof

`ForumEkycParticipationProof`は、forum参加境界の`ForumMembershipEkyc`を、credential、認可、失効状態、Soul束縛およびcheckpointのproof bundleだけでオフライン検証するためのobjectである。第8.1節の`root_entry`申請と第8.2節の`community`申請は、これを添付して検証する。

```text
ForumEkycParticipationProof {
    proof_id
    forum_id
    applicant_soul_id
    evaluation_checkpoint_ref
    evaluation_time

    identity_binding_credential_ref
    ekyc_service_authorization_ref
    ekyc_revocation_state_ref
    credential_non_revocation_proof_ref

    soul_identity_binding_proof_ref
    active_device_incarnation_proof_ref
    soul_epoch_lease_ref
    temporal_health_lease_ref

    credential_purpose_commitment
    uniqueness_scope_commitment
    signature
}
```

有効条件は次とする。

```text
ValidForumEkycParticipationProof(P, S, F, t) =
    P.forum_id = F
    AND P.applicant_soul_id = S
    AND P.evaluation_time = t
    AND ForumMembershipEkyc(S, F, t)
    AND AllProofReferencesAreConsistent(P)
    AND VerifyCanonicalHash(P)
    AND VerifyMLDSA65Signature(P)
```

`AllProofReferencesAreConsistent(P)`は、少なくとも次を確認するpredicateである。

- `P.identity_binding_credential_ref`、`P.ekyc_service_authorization_ref`、`P.ekyc_revocation_state_ref`、`P.credential_non_revocation_proof_ref`が同一issuerの認可連鎖に属する
- `P.soul_identity_binding_proof_ref`、`P.active_device_incarnation_proof_ref`、`P.soul_epoch_lease_ref`、`P.temporal_health_lease_ref`が同一`soul_id`および同一active `DeviceIncarnation`を指す
- `P.credential_purpose_commitment`と`P.uniqueness_scope_commitment`が、参照するcredentialのpurpose集合と`uniqueness_scope`に束縛される
- `P.evaluation_checkpoint_ref`が`P.evaluation_time`に対応するcheckpointを指す
- 参照するすべてのobjectのcanonical hashが一致する

`ForumEkycParticipationProof`に、eKYC生データ、本名、住所、生年月日、本人確認書類、顔画像、電話番号、銀行情報又はprovider内部識別子を含めてはならない。proofが保持できるのは参照とcommitmentだけである。この禁止は、object本体、署名対象、checkpoint、`StateProofEnvelope`、error object、ログおよびUI表示に及ぶ（第17.1節）。

### 17.10 ForumMembershipEkycRenewal

`ForumMembershipEkycRenewal`は、`membership_ekyc_policy=verified_required`のforumで、eKYC失効後に新しい`root_entry`又は`community`を発行せずactive membershipへ復帰する記録である。

```text
ForumMembershipEkycRenewal {
    renewal_id
    forum_id
    subject_soul_id
    previous_membership_certificate_ref
    forum_ekyc_participation_proof_ref
    submitted_at
    signature
}
```

有効条件は次とする。

```text
ValidForumMembershipEkycRenewal(R, S, F, t) =
    R.forum_id = F
    AND R.subject_soul_id = S
    AND PreviousMembershipCertificateBelongsTo(S, F)
    AND ValidForumEkycParticipationProof(
        R.forum_ekyc_participation_proof_ref,
        S,
        F,
        t
    )
    AND ValidSuspendedRenewalAuthority(S, t)
```

`PreviousMembershipCertificateBelongsTo(S, F)`は、`R.previous_membership_certificate_ref`が`S`をsubjectとし`F`を対象とする既存の有効な`root_entry`又は`community`証明書を指すことを確認するpredicateである。renewalは`suspended_for_ekyc`遷移の前から`S`が保持している参加証明書を参照するのであって、新しい参加証明書を必要としない。

`ValidSuspendedRenewalAuthority(S, t)`は、`S`が時刻`t`においてrenewalを提出できることを確認する2引数のpredicateである。`S`の唯一のactive `DeviceIncarnation` `D`、`ValidDeviceBinding(D)`、有効な`SoulEpochLease(S,D,t)`及び`D`のauthority操作列が`t`を覆うことを確認する（第15章）。

本predicateは`NormalGaiaAuthority(S,F,t,D)`（第15.3節）と同一ではない。`NormalGaiaAuthority`を要求してはならない。`suspended_for_ekyc`のSoulは第17.11節により通常authorityを行使できないため、`NormalGaiaAuthority`を要求すると`active -> suspended_for_ekyc -> active`の遷移が証明不能になり、suspensionが恒久化する。同様に`TemporalHealthLease`も本predicateでは要求しない。時刻健全性は第14.8節の`AllowedWhenNotHealthy`によりsuspension中にも回復でき、renewal後のactive membershipは健康ゲートを満たした時点で効力を持つ。第23.23節の`ValidAuthority(S,t)`は本predicateとは別の述語であり、混同してはならない。renewalの対象forumは`R.forum_id = F`及び`PreviousMembershipCertificateBelongsTo(S, F)`で既に束縛されているため、authority predicateへforumを重複して渡さない。

有効な`ForumMembershipEkycRenewal`がcheckpointに反映された後、`S`は次へ遷移する。

```text
suspended_for_ekyc -> active
```

renewalは新しい`root_entry`又は`community`の発行ではない。過去の`participation_anchor`、root ledger、certificate history、発行順序又は`T_actual`を書換えてはならない。`T_actual`はeKYC suspension中に積算せず、renewal後の有効区間から再び積算する（第4.2節）。suspension中の区間は後から遡って`T_actual`へ加算してはならない。

### 17.11 suspended_for_ekyc

`membership_ekyc_policy=verified_required`のforumで、eKYC credentialが失効・撤回・検証不能になったSoulは、過去の`root_entry`又は`community`を消去・書換えず、次の状態へ遷移する。

```text
active -> suspended_for_ekyc
```

`suspended_for_ekyc`の間、Soulは次を行えない。

- active membershipの主張
- 通常authority
- `T_actual`の積算
- depthに基づく通常権限
- `CanIssue`
- `CanIssueTo`
- `AssetScore`のactive memberとしての計算
- `Candidates`、`Reach`、`CivicCandidates`、`CivicReach`のactive memberとしての計算
- forum内の通常asset access条件の充足
- Civic validator、Civic ballot又はCivic needへの参加

ただし、`suspended_for_ekyc`のSoulは次を行えてよい。

- stored objectの読取と検証
- eKYC renewal
- `ForumEkycParticipationProof`の生成
- `ForumMembershipEkycRenewal`の提出
- recovery、time synchronization、health revalidation
- 過去objectのarchive取得

`suspended_for_ekyc`はmembershipの履歴状態ではない。`ActiveMembers(F,t_state)`及び`membership_root`は、`suspended_for_ekyc`のSoulのleafを保持し続ける（第13.2節）。`suspended_for_ekyc`を`ActiveMembers`又は`membership_root`の定義へ加えてはならない。

---

## 18. Owner authority、Stripe固定Payment-Service、清算、分配及び期限付き受取権

この章は、Gaiaの外部決済・清算・分配と、法定通貨の受取権及びその期限失効・還元を定める。外部決済レールは`stripe`に固定し、Stripeの実際の手数料を控除した残額から、Owner thresholdが認可した通貨別・金額帯別のGaia network maintenance feeを控除し、対象取引がForum Revenue Poolを有効にするforumに属する場合はforum genesis固定のForum Revenue Pool contribution（第7.17節）を控除し、残余を受取人Soulへ期限付き`PayoutEntitlement`として分配する。Stripe Connected Accountを通じてpayoutできないSoulについても、正当に成立した販売に対応する期限付きの受取権を記録し、期限内に受取資格を整えた場合には払い出せる。受取不能な期間には、Owner policyに基づき、Gaia公式サービス専用・非譲渡・非換金・期限付きの還元を提供できる。すべての法定通貨受取権およびサービス還元は有限の期限を持ち、Gaiaが無期限または予測不能な将来債務を抱えないことを保証する。

この章が扱うobject、状態、手数料、期限は、commerce層の状態である。決済、分配、移転、payout、返金、異議申立て、チャージバック、期限失効、還元、会計帰属のいずれも、`Q`、`depth`、`CanIssue`、`CanIssueTo`、`AssetScore`、`A_seed`、各bonus、`Candidates`、`Reach`、forum創設資格、checkpoint最終性、Civic Vote又はCivicCitizen資格を裁定・購入・変更する入力になってはならない（第7.16節、第19.3節、第24.6節）。Payment-Service、Stripe、Connected Account、PayoutEntitlement、Service Creditは、成熟度・信用・発行権・創設能力・購入候補数を買う経路ではない。

決済・清算・分配・Poolのobject（`PaymentReceipt`、`PaymentSettlement`、`PayoutEntitlement`、`PayoutClaimRequest`、`BeneficiaryEnrollmentRequest`、`ServiceOrder`、`ServiceFulfillment`、`ForumPoolContributionRecord`、`ForumRevenuePoolDistribution`等）に現れるSoul由来の署名は、原則としてactive Bodyのauthority秘密鍵で行う。これらのobjectは署名主体Soulを主張するため、`soul_id`、`incarnation_id`、`authority_pubkey`、`DeviceIncarnation`参照、`SoulEpochLease`参照、必要な`TemporalHealthLease`参照、`AuthorityOperationHeader`を持ち、検証bundleは`DeviceIncarnation`又は`SoulRecord`を経由して公開`identity_pubkey`へ到達できなければならない。`PayoutEntitlement.beneficiary_soul_id`、`BeneficiaryPayoutEligibility.beneficiary_soul_id`、Stripe Connected Account bindingは、authority鍵単独ではなく、公開identity鍵から導いたSoul IDへ結び付ける。authority鍵の更新又はBody転生によって、同一Soulが重複又は別主体として現れてはならない（第7.17.5節）。

### 18.1 焼き付けられたOwner set

決済と、その周辺の限定的な中央例外を運営するための信頼は、**正確に15本のOwner公開鍵**を信頼rootとする。Gaia mainnet互換のbinaryは、この15本をcanonical sorted orderで焼き付ける。

```text
PaymentAuthoritySet {
  protocol_network_id
  owner_set_version
  owner_pubkeys_sorted[15]
  threshold_policy
  owner_set_commitment
}
```

Owner鍵の役割は、次に限定する。

- Payment-Service運営鍵の認可、失効、緊急停止
- 決済policy（`GaiaNetworkFeeSchedule`、`PayoutEntitlementPolicy`、`GaiaServiceCreditPolicy`）の認可・更新（第18.6節、第18.8節、第18.12節）
- cross-forum割引係数policy（`GaiaAssetAccessPolicy`）の認可・更新（第18.23節）
- 緊急停止（`EmergencyPaymentSuspension`）と客観的な期限延長（`PayoutDeadlineExtension`）の発行（第18.16節）
- root eKYC providerおよびeKYC serviceの認可、失効（第17章、第21章）
- Owner set自身の所定のupgrade
- 中央例外の監査とthreshold policyの更新

Owner鍵は、日常の支払いreceiptの署名に使ってはならない。Ownerは、forum、certificate、Q、depth、AssetScore、A_seed、checkpoint最終性を裁定してはならない。

binaryの焼付けは改造clientの作成を物理的には防がない。保証の対象は、Gaia mainnet互換のverifierが、Owner set外のreceiptをGaia標準の「支払い済み」事実として受理しないことである。単独のOwnerではなく、固定threshold policyを満たすOwner署名の集合（**Owner threshold**）だけが、手数料ラダー・受取期限・失効・サービス還元・緊急停止・期限延長及びcross-forum割引係数の各policyを認可できる。

### 18.2 用語と責任境界

#### 18.2.1 主体

| 主体 | この章における意味 |
|---|---|
| Owner | `PaymentAuthoritySet`に焼き付けられた15本のOwner公開鍵のいずれか。単独Ownerではなく、固定threshold policyを満たす署名集合だけが決済policyを認可できる |
| Owner threshold | `PaymentAuthoritySet.threshold_policy`を満たすOwner署名の集合 |
| Payment-Service | Owner thresholdにより認可され、Stripe APIおよびStripe webhookを運用し、Gaiaの署名済み決済objectを発行するサービス |
| Stripe Platform Account | Payment-Serviceが利用するGaiaのStripeプラットフォーム口座。外部IDは公開Gaia objectに平文で置かない |
| Connected Account | Stripe Connect上で、特定Soulの売上transferと外部payoutのために使われるStripe受取口座 |
| beneficiary Soul | AssetRecord、ServiceOffer、PressRoomその他の販売objectにより、販売代金の一部又は全額の受取権利者として定められたSoul |
| purchaser Soul | 支払いを行い、アセット又はサービスを注文するSoul |
| payout | Stripe Connected Accountから、そのConnected Accountに登録された外部銀行口座その他のStripe対応外部送付先への資金移動 |
| transfer | Gaia Stripe Platform AccountからStripe Connected Account残高への資金移動。payoutとは別操作である |

#### 18.2.2 Stripeの役割

Stripeは以下の外部事実を扱う。

- PaymentIntent、Checkout Session、Chargeによる決済処理
- Chargeに紐づくBalance TransactionとStripe実費手数料
- Connected Accountのonboarding、KYC/KYB、capability、`charges_enabled`、`payouts_enabled`、requirements
- Platform AccountからConnected AccountへのTransfer
- Connected Accountから外部口座等へのPayout
- refund、reversal、dispute、chargebackその他の決済ネットワーク上の状態
- Stripeの利用可能国・地域、法令、制裁、リスク、製品制約

Stripeは以下を扱ってはならない。

- Gaiaの`Q`、`depth`、`CanIssue`、`CanIssueTo`
- Gaiaの`AssetScore`、`A_seed`、bonus、`Candidates`、`Reach`
- forumの参加、創設、証明書、checkpoint最終性
- Civic Vote、CivicNeedAsset、CivicCitizenの票数・資格・順位

#### 18.2.3 Payment-Serviceの役割

Payment-Serviceは次を実行しなければならない。

- Stripe決済の作成、照会、webhook受領・署名検証、冪等処理
- Order、決済、外部Stripe object、Gaia決済objectの束縛検証
- Stripe実費手数料の確定
- Owner認可済み手数料ラダーによるネットワーク維持手数料の決定論的算出
- 複数受取人への決定論的な端数分配
- `PaymentReceipt`、`PaymentSettlement`、`PayoutEntitlement`、`ForumPoolContributionRecord`、`ForumRevenuePoolDistribution`、transfer/payout/返金/dispute/失効objectの署名・追記
- Forum Revenue Pool contributionの独立確定、depth分配、繰越、未分配分のGaia network maintenance feeへの帰属の実行（第7.17節）
- payout eligibilityの外部状態を期限付きのGaia objectへ写像
- 期限前の通知試行記録
- refund、dispute、chargeback、transfer reversalに伴う会計・受取権状態の追記

Payment-Serviceは以下を実行してはならない。

- 通常Gaia権限・成熟度・AssetScore・Civic資格を裁定又は変更する
- Owner thresholdなしに手数料・期限・失効還元policyを変更する
- 既発行の`PayoutEntitlement`の`claim_deadline`を短縮する
- 既発行の受取権元本を、返金・dispute・chargeback・この章で定める失効処理以外の理由で減額する
- Stripe API秘密鍵、webhook signing secret、銀行口座情報、KYC平文をP2P object又は`StateProofEnvelope`へ入れる

#### 18.2.4 node / Soulの役割

受取人Soulは以下を実行できる。

- AssetRecord、ServiceOffer、PressRoomその他を通じて販売者・受取権利者になる
- Stripe Connect onboardingを開始し、Stripeが要求する情報をStripeの画面又はStripe埋め込み画面へ直接提出する
- 期限内に`PayoutClaimRequest`を署名してpayoutを請求する
- Stripe側の追加要件、銀行口座変更、payout失敗を解消する
- 規定された期間内にrefund/disputeの証拠提出手続へ協力する
- 期限付きGaia公式サービス還元を、定められた使途内で使用する

受取人Soulは以下を実行してはならない。

- Owner thresholdなしに手数料・期限・失効規則を変更する
- 他Soulの`PayoutEntitlement`を請求・移転・担保化・売買する
- `GaiaServiceCredit`を譲渡、現金化、暗号資産化、成熟度購入、投票力購入に用いる

### 18.3 PaymentServiceAuthorization（Stripe固定）

Payment-Serviceの運営鍵と署名鍵は、Owner thresholdの認可を受ける。外部決済レールは`stripe`に固定し、複数レールの選択、algorithm agility、決済レール交渉を導入してはならない。

```text
PaymentServiceAuthorization {
  service_id: ServiceId,
  network_id: NetworkId,

  payment_rail: "stripe",

  service_operator_pubkey: MLDSA65PublicKey,
  service_signing_pubkeys: [MLDSA65PublicKey],

  stripe_platform_account_commitment: Hash,
  stripe_api_version: String,
  stripe_webhook_endpoint_commitment: Hash,

  supported_sale_currencies: [CurrencyCode],
  supported_payout_currencies: [CurrencyCode],

  valid_from: Tick,
  valid_until: Tick,
  authorization_epoch: u64,

  owner_set_commitment: Hash,
  owner_threshold_signatures: [OwnerSignature]
}
```

妥当性規則は次の通りである。

```text
payment_rail == "stripe"
valid_from < valid_until
supported_sale_currencies is non-empty
service_signing_pubkeys is non-empty
VerifyOwnerSetCommitment(owner_set_commitment)
VerifyOwnerThresholdSignatures(this object)
```

初期の販売通貨は`USD`、`JPY`、`CNY`である。販売通貨のサポートは、任意の国・地域・受取人へのStripe payout可否を意味しない（第18.14節）。`allowed_payment_rails`、`payment_rail`の複数選択、algorithm agility、決済レール交渉に相当するフィールドを導入してはならない。Gaia mainnet互換のPayment-Serviceは、Stripe以外の外部決済レールを用いる`PaymentReceipt`、`PaymentSettlement`、`PayoutEntitlement`、`BeneficiaryTransferRecord`、`BeneficiaryPayoutReceipt`その他の決済objectを受理してはならない。

### 18.4 PaymentReceipt（支払い成功の署名事実）

`PaymentReceipt`は支払いの成功事実を表す。最終的なStripe実費手数料、Gaia維持手数料、受取人別配分の確定は直接担わず、`PaymentSettlement`（第18.7節）が扱う。

```text
PaymentReceipt {
  receipt_id: Hash,
  network_id: NetworkId,

  payment_rail: "stripe",

  payer_soul_id: SoulId,
  payer_authority_pubkey: MLDSA65PublicKey,

  target_ref: Hash,
  order_ref: Hash | null,
  service_kind: ServiceKind,

  gross_amount_minor: u128,
  currency: CurrencyCode,

  payment_state:
    "paid"
    | "held_in_escrow"
    | "refunded"
    | "reversed"
    | "chargeback_pending"
    | "chargeback_resolved",

  paid_at: Tick,

  stripe_payment_intent_commitment: Hash,
  stripe_charge_commitment: Hash,
  stripe_balance_transaction_commitment: Hash,

  fee_schedule_ref: Hash,
  payout_entitlement_policy_ref: Hash,
  payment_service_authorization_ref: Hash,

  signature: MLDSA65Signature
}
```

`PaymentReceipt`の`gross_amount_minor`、`currency`、`target_ref`、`order_ref`、`fee_schedule_ref`、`payout_entitlement_policy_ref`は、対象`ServiceOrder`又は等価な決済注文objectと一致しなければならない。金額はすべて通貨最小単位の非負整数で表し、浮動小数点、NaN、無限大、locale依存表現を使ってはならない。

`PaymentReceipt`の検証は次による。受領側は、receiptに署名した鍵が`PaymentServiceAuthorization`に含まれ、そのauthorizationの`owner_set_commitment`が自分が焼き付けたOwner setと一致することを確認すれば、ネットワーク照会なしに支払い済み事実を検証できる。これは、第3章の「提示された証明だけで判定する」原則が、支払い事実にも及ぶことを意味する。

\[
ValidPaymentReceipt(r)\iff
VerifyPaymentServiceSignature(r)
\land ValidPaymentServiceAuthorization(service(r))
\land OwnerSetCommitment(service(r))=BakedOwnerSet
\land r.payment\_rail=stripe
\land r.payment\_state\in\{paid,held\_in\_escrow\}
\]

`PaymentReceipt`は、第8.4節と第10.10節のとおり、`order_ref`、`target_ref`、購入者、支払い総額、通貨、Orderへの束縛を満たす。消費済みreceiptの再利用、同一Order・同一Stripe Chargeに対する二重の有効Receiptは拒否する。

### 18.5 外部IDのcommitment化と秘密情報の分離

Gaia P2P object、forum状態、`StateProofEnvelope`、通常証明書へ、次を入れてはならない。

- 銀行口座番号
- カード番号
- Stripe API secret
- Stripe webhook secret
- KYC/KYBの平文
- パスポート、運転免許証、住所証明その他の本人確認書類
- Stripe Account ID、PaymentIntent ID、Charge ID、Transfer ID、Payout IDの平文

Gaia objectには必要な場合に限り、domain-separated hash commitmentを置く。

```text
hash("gaia:stripe:connected-account:v1" || stripe_account_id || soul_id || authorization_epoch)
hash("gaia:stripe:payment-intent:v1" || payment_intent_id)
hash("gaia:stripe:charge:v1" || charge_id)
hash("gaia:stripe:balance-transaction:v1" || balance_transaction_id)
hash("gaia:stripe:transfer:v1" || transfer_id)
hash("gaia:stripe:payout:v1" || payout_id)
```

Payment-ServiceはStripe metadataへ、必要最小限のcommitmentだけを置く。

```text
gaia_order_commitment
gaia_target_commitment
gaia_beneficiary_rule_commitment
gaia_payment_authorization_epoch
```

Soul ID、個人情報、アセット本文、平文コンテンツ、KYC情報、銀行情報をStripe metadataへ含めてはならない。

### 18.6 GaiaNetworkFeeSchedule

`GaiaNetworkFeeSchedule`は、Stripe実費控除後の残額に対して適用する、Gaia全体共通のネットワーク維持手数料を定めるOwner認可済みobjectである。

```text
GaiaNetworkFeeSchedule {
  schedule_id: Hash,
  network_id: NetworkId,

  schedule_version: u64,
  previous_schedule_hash: Hash | null,

  valid_from: Tick,
  valid_until: Tick | null,
  activation_delay: Tick,

  calculation_order:
    "gross_minus_actual_stripe_fee_then_network_fee",

  currencies: [CurrencyFeeLadder],

  rounding_mode: "floor_to_minor_unit",

  owner_set_commitment: Hash,
  owner_threshold_signatures: [OwnerSignature],
  issued_at: Tick
}
```

```text
CurrencyFeeLadder {
  currency: "USD" | "JPY" | "CNY",
  minor_unit_exponent: u8,
  tiers: [NetworkFeeTier]
}
```

```text
NetworkFeeTier {
  lower_bound_inclusive: u128,
  upper_bound_exclusive: u128 | null,
  fee_rate_bps: u16,
  fixed_fee_minor: u128
}
```

初期のcore固定通貨metadataは次の通りとする。

```text
USD: minor_unit_exponent = 2
JPY: minor_unit_exponent = 0
CNY: minor_unit_exponent = 2
```

金額はすべて通貨最小単位の非負整数で表し、浮動小数点、NaN、無限大、locale依存表現を使用してはならない。料率は整数basis pointsで表す。

```text
1 bps = 0.01%
100 bps = 1%
10000 bps = 100%
```

各通貨のtier ladderは次を満たさなければならない。

```text
1. currencyごとにCurrencyFeeLadderは高々1つ
2. tiersはlower_bound_inclusive昇順
3. 先頭tierのlower_bound_inclusive == 0
4. tier間に重複がない
5. tier間にgapがない
6. 最終tierだけがupper_bound_exclusive == null
7. 非最終tierについてlower_bound_inclusive < upper_bound_exclusive
8. すべてのfee_rate_bpsは0 <= fee_rate_bps <= 5000
9. fixed_fee_minorは非負整数
10. valid_from < valid_until、又はvalid_until == null
11. valid_from >= issued_at + activation_delay
12. activation_delay >= MIN_FEE_SCHEDULE_ACTIVATION_DELAY
```

`MIN_FEE_SCHEDULE_ACTIVATION_DELAY`はGaia coreで最低7日と固定する。`fee_rate_bps <= 5000`は、ネットワーク維持手数料をStripe控除後残額の50%以下に制約する安全上限である。Ownerの自由なラダー設計を許しつつ、実質的に受取人取り分をゼロ化又は没収する手数料表を排除する。

手数料は次で算出する。`stripe_fee_amount_minor`はStripeの対応するBalance Transactionから確定した実費であり、見積り料率、設定料率、過去取引からの推定値を使ってはならない。

\[
net\_after\_stripe
=
gross\_amount\_minor-stripe\_fee\_amount\_minor
\]

\[
raw\_network\_fee
=
fixed\_fee\_minor
+
\left\lfloor
\frac{net\_after\_stripe\times fee\_rate\_bps}{10000}
\right\rfloor
\]

\[
gaia\_network\_fee
=
\min(raw\_network\_fee,\ net\_after\_stripe-1)
\]

対象取引がForum Revenue Pool policyを有効にするforumに属し、取引種別が`contribution_scope`に含まれる場合、Forum Revenue Pool contributionがGaia network maintenance feeと独立に発生する（第7.17節）。forum genesisが定める`contribution_rate_bps`を`r_F`とすると、次による。

\[
forum\_revenue\_pool\_contribution
=
\min\left(
\left\lfloor
\frac{net\_after\_stripe\times r_F}{10000}
\right\rfloor,
\ net\_after\_stripe-gaia\_network\_fee-1
\right)
\]

forumがPoolを無効としている場合、又は対象取引がforumへ束縛されない場合、`forum_revenue_pool_contribution=0`とする。

\[
beneficiary\_pool
=
net\_after\_stripe
-gaia\_network\_fee
-forum\_revenue\_pool\_contribution
\]

`net_after_stripe_minor <= 0`である決済は分配可能な決済として扱ってはならず、`PaymentSettlement`をfinalizeしてはならない。`-1`の安全上限により、受取人プールが正である場合、少なくとも1最小通貨単位を受取人側に残す。Gaia維持手数料とForum Revenue Pool contributionの合計が正味額を超える注文は、決済開始前に拒否する（第7.17.4節）。

手数料scheduleは、`ServiceOrder`の作成時点で有効なものが当該Orderへ固定される。Ownerは将来のscheduleを更新できるが、既存Order、既存`PaymentReceipt`、既存`PayoutEntitlement`に新scheduleを遡及適用してはならない。

### 18.7 PaymentSettlement

`PaymentSettlement`は、`PaymentReceipt`に束縛され、Stripe実費、Gaia維持手数料、Forum Revenue Pool contribution、受取人プールを別々に確定する追記型objectである。

```text
PaymentSettlement {
  settlement_id: Hash,
  payment_receipt_ref: Hash,

  gross_amount_minor: u128,
  stripe_fee_amount_minor: u128,
  net_after_stripe_minor: u128,
  currency: CurrencyCode,

  stripe_balance_transaction_commitment: Hash,

  fee_schedule_ref: Hash,
  matched_tier_index: u32,
  fee_rate_bps: u16,
  fixed_fee_minor: u128,

  gaia_network_fee_minor: u128,

  forum_id: ForumId | null,
  forum_revenue_pool_policy_ref: Hash | null,
  forum_revenue_pool_contribution_minor: u128,

  beneficiary_pool_minor: u128,

  lineage_royalty_settlement_ref: Hash | null,
  lineage_royalty_policy_ref: Hash | null,
  seller_principal_minor: u128 | null,
  ancestor_pool_minor: u128 | null,

  beneficiary_rule_commitment: Hash,
  settled_at: Tick,

  payment_service_authorization_ref: Hash,
  signature: MLDSA65Signature
}
```

検証器は次を再計算しなければならない。

```text
net_after_stripe_minor
  == gross_amount_minor - stripe_fee_amount_minor

matched tier
  == SelectUniqueTier(
       fee_schedule_ref,
       currency,
       net_after_stripe_minor
     )

raw_network_fee
  == fixed_fee_minor
   + floor(net_after_stripe_minor * fee_rate_bps / 10000)

gaia_network_fee_minor
  == min(raw_network_fee, net_after_stripe_minor - 1)

forum_revenue_pool_contribution_minor
  == 0 (forum_id == null 又は forum_policy disabled の場合)
  == min(
       floor(net_after_stripe_minor * forum_revenue_pool_rate_bps / 10000),
       net_after_stripe_minor - gaia_network_fee_minor - 1
     )

beneficiary_pool_minor
  == net_after_stripe_minor
     - gaia_network_fee_minor
     - forum_revenue_pool_contribution_minor
```

本仕様のALR対象saleでは、`beneficiary_pool_minor`がlineage royaltyの唯一の原資`B`である。`seller_principal_minor + ancestor_pool_minor = beneficiary_pool_minor`を満たし、`lineage_royalty_settlement_ref`・`lineage_royalty_policy_ref`が設定される（第7.18節、第18.22節）。ALR非対象saleではこれらはnullとし、既存動作を維持する。

保存則:

\[
gross\_amount\_minor
=
stripe\_fee\_amount\_minor
+
gaia\_network\_fee\_minor
+
forum\_revenue\_pool\_contribution\_minor
+
beneficiary\_pool\_minor
\]

`forum_id`がnullの場合又は対象forumのPool policyがdisabledの場合、`forum_revenue_pool_contribution_minor`は0でなければならない。Forum Revenue Pool contributionの発生・計算・保留は第7.17節に従う。

`PaymentSettlement`は以下の場合にfinalizeしてはならない。

```text
PaymentReceiptがpaid又はheld_in_escrowとして有効でない
Stripe Balance Transaction又は実費手数料の証拠が欠ける
stripe_fee_amount_minor > gross_amount_minor
net_after_stripe_minor <= 0
fee scheduleがOrderに束縛された参照と一致しない
currencyがschedule又はpolicyで扱えない
複数tier又はtierなしとなる
forum policy参照がOrder又は対象forum genesisと一致しない
合計控除によりbeneficiary_pool_minorが0未満になる
金額保存則が成立しない
```

受取人プール`B`を受取人比率`w_i`（basis points）で配分するときは、次で決定論的に端数を処理する。

\[
raw_i=\frac{B\times w_i}{10000},\qquad base_i=\lfloor raw_i\rfloor
\]

\[
remainder=B-\sum_i base_i
\]

残余の最小通貨単位は、小数部`raw_i - base_i`が大きい受取人から順に1単位ずつ割り当てる。同率の場合、次により決める。

```text
hash(
  "gaia:beneficiary-remainder-order:v1"
  || order_id
  || beneficiary_soul_id
)
```

これにより、次を満たす。

\[
\sum_i beneficiary\_amount_i=B
\]

端数をPayment-Service自らの収益、reserve、未指定受取人、又は任意のSoulへ帰属させてはならない。受取人配分規則`BeneficiaryRule`は第19.1節に定義する。

### 18.8 PayoutEntitlementPolicy

`PayoutEntitlementPolicy`は、受取権の請求期間、受取不能時の状態、失効後の帰属及びサービス還元を通貨別に定めるOwner認可済みobjectである。

```text
PayoutEntitlementPolicy {
  policy_id: Hash,
  network_id: NetworkId,

  policy_version: u64,
  previous_policy_hash: Hash | null,

  valid_from: Tick,
  valid_until: Tick | null,
  activation_delay: Tick,

  currency_terms: [CurrencyPayoutTerms],

  owner_set_commitment: Hash,
  owner_threshold_signatures: [OwnerSignature],
  issued_at: Tick
}
```

```text
CurrencyPayoutTerms {
  currency: "USD" | "JPY" | "CNY",

  claim_window: Tick,
  retry_window: Tick,
  minimum_claimable_minor: u128,

  expiry_disposition:
    "forfeit_to_network_reserve"
    | "convert_to_service_credit"
    | "split_forfeit_and_service_credit",

  reserve_fraction_bps: u16,
  service_credit_fraction_bps: u16,
  service_credit_expiry_window: Tick | null,

  dormancy_notice_offsets: [Tick]
}
```

妥当性規則は次の通りである。

```text
currency_terms is non-empty
currencyはpolicy内で重複しない
claim_window > 0
retry_window >= 0
minimum_claimable_minor >= 0
0 <= reserve_fraction_bps <= 10000
0 <= service_credit_fraction_bps <= 10000
reserve_fraction_bps + service_credit_fraction_bps == 10000
valid_from < valid_until OR valid_until == null
valid_from >= issued_at + activation_delay
activation_delay >= MIN_PAYOUT_POLICY_ACTIVATION_DELAY
all dormancy_notice_offsets are positive and strictly descending or strictly ascending under the canonical rule fixed by the policy
all notice offsets < claim_window
```

`MIN_PAYOUT_POLICY_ACTIVATION_DELAY`はGaia coreで最低7日と固定する。

`expiry_disposition`ごとの必須条件は以下とする。

```text
forfeit_to_network_reserve:
  reserve_fraction_bps == 10000
  service_credit_fraction_bps == 0
  service_credit_expiry_window == null

convert_to_service_credit:
  reserve_fraction_bps == 0
  service_credit_fraction_bps == 10000
  service_credit_expiry_window != null

split_forfeit_and_service_credit:
  reserve_fraction_bps > 0
  service_credit_fraction_bps > 0
  service_credit_expiry_window != null
```

Ownerは新しいPolicyを発行できるが、既存の`PayoutEntitlement`は生成時点で参照したPolicyに永久に束縛される。後続Policyを既存Entitlementへ遡及適用してはならない。新policyは発効後に作成される新規Order及び新規Entitlementにだけ適用する。既発行Entitlementの`claim_deadline`、元本、失効時配分を変更してはならない。

### 18.9 PayoutEntitlement

`PayoutEntitlement`は、特定Soulが期限内にStripe Connect payoutを請求できる、非譲渡の法定通貨建て受取権である。これは通貨、預金、電子マネー、暗号資産、譲渡可能アセットではない。`FiatReceivable`その他、無期限に法定通貨payoutを請求できる受取権を導入してはならない。`source_kind`により、通常の販売者分配（`seller_beneficiary_settlement`）とForum Revenue Poolの成熟者還元（`forum_revenue_pool_distribution`）を監査上区別する（第7.17節）。期限切れ未分配PoolのGaia維持手数料への帰属はSoulの受取権ではないため、`source_kind`を持たない。

```text
PayoutEntitlement {
  entitlement_id: Hash,

  settlement_ref: Hash,

  source_kind:
    "seller_beneficiary_settlement"
    | "forum_revenue_pool_distribution"
    | "seller_lineage_royalty_settlement"
    | "ancestor_lineage_royalty_settlement"
    | "payout_aggregation",

  source_ref: Hash,

  beneficiary_soul_id: SoulId,
  beneficiary_identity_commitment: Hash,

  currency: CurrencyCode,
  principal_minor: u128,
  paid_minor: u128,
  reserved_minor: u128,
  forfeited_minor: u128,
  claimable_minor: u128,

  created_at: Tick,
  claim_open_at: Tick,
  claim_deadline: Tick,

  payout_policy_ref: Hash,
  fee_schedule_ref: Hash,

  status:
    "awaiting_payout_eligibility"
    | "claimable"
    | "payout_requested"
    | "transfer_pending"
    | "partially_paid"
    | "paid"
    | "refund_reserve"
    | "chargeback_pending"
    | "expiry_blocked"
    | "expired"
    | "forfeited",

  lineage_royalty_settlement_ref: Hash | null,
  lineage_royalty_allocation_ref: Hash | null,
  generation: u8 | null,
  payout_aggregation_ref: Hash | null,

  payment_service_authorization_ref: Hash,
  signature: MLDSA65Signature
}
```

保存則:

\[
principal\_minor
=
paid\_minor
+
reserved\_minor
+
forfeited\_minor
+
claimable\_minor
\]

生成時の初期値:

```text
principal_minor = beneficiary allocation from PaymentSettlement
paid_minor = 0
reserved_minor = 0
forfeited_minor = 0
claimable_minor = principal_minor
claim_open_at = created_at
claim_deadline = created_at + CurrencyPayoutTerms.claim_window
```

`claim_deadline`は`created_at`より厳密に後でなければならない。期限を持たないEntitlementを生成・受理してはならない。

`PayoutEntitlement`は次の性質を持つ。

```text
non-transferable
non-assignable
non-marketable
non-pledgeable
non-fiat-redeemable except payout to the beneficiary's Stripe Connected Account
not an input to maturity, governance, or access score
```

発行済みEntitlementの`claim_deadline`、`payout_policy_ref`、`principal_minor`は、通常更新で変更してはならない。

### 18.10 BeneficiaryPayoutEligibility

`BeneficiaryPayoutEligibility`は、特定SoulがStripe Connectを通じてpayoutを受けられる外部状態を、Payment-Serviceが観測し期限付きで署名したobjectである。

```text
BeneficiaryPayoutEligibility {
  eligibility_id: Hash,

  beneficiary_soul_id: SoulId,
  stripe_connected_account_commitment: Hash,

  status:
    "onboarding_required"
    | "requirements_due"
    | "transfer_capable"
    | "payout_capable"
    | "restricted"
    | "rejected"
    | "country_unsupported"
    | "closed",

  eligible_payout_currencies: [CurrencyCode],
  country_commitment: Hash,

  observed_at: Tick,
  valid_until: Tick,

  payment_service_authorization_ref: Hash,
  signature: MLDSA65Signature
}
```

`payout_capable`を主張するため、Payment-ServiceはStripe API又は署名検証済みStripe eventにより、少なくとも次を確認しなければならない。

```text
connected account exists
connected account is bound to the beneficiary Soul
payouts_enabled == true
applicable capability is active
required external payout destination is configured
currency and country path are supported by the actual Stripe account configuration
account is not closed or currently restricted for the requested payout operation
```

`charges_enabled`は販売者自身が直接chargeを作る能力を表す場合があり、GaiaのSeparate Charges and Transfersでplatformがchargeを作ることと必ずしも同一ではない。したがって、受取人への払出判定において絶対に必要なのは、当該分配方式に必要なtransfer可否、`payouts_enabled`、Connected Accountの有効性、通貨・法域経路の適格性である。実装はStripeの実際のConnect account configurationおよびcapabilityを検査しなければならない。

`PayoutEntitlement`の表示状態は、最新かつ期限内のEligibilityを用いて次のように決めることができる。

```text
payout_capable -> claimable
onboarding_required / requirements_due -> awaiting_payout_eligibility
restricted / country_unsupported / rejected / closed -> awaiting_payout_eligibility
```

ただし、Entitlement本体の金額保存則・期限・Policy参照はEligibility更新で変更してはならない。`country_unsupported`、`restricted`、`rejected`、`closed`であることは、Gaiaの通常参加・証明書・depth・AssetScore・Civic資格の取消理由になってはならない。

### 18.11 payout請求、Transfer、Payout

#### PayoutClaimRequest

受取人Soulは、期限内の`PayoutEntitlement`について、次の`PayoutClaimRequest`を署名してpayoutを請求する。

```text
PayoutClaimRequest {
  request_id: Hash,

  entitlement_ref: Hash,
  beneficiary_soul_id: SoulId,

  requested_amount_minor: u128,
  currency: CurrencyCode,

  payout_eligibility_ref: Hash,
  request_nonce: Bytes,
  requested_at: Tick,

  signature: MLDSA65Signature
}
```

受理条件:

```text
request signer Soul == entitlement.beneficiary_soul_id
requested_amount_minor > 0
requested_amount_minor <= entitlement.claimable_minor
currency == entitlement.currency
entitlement.claim_open_at <= requested_at < effective_deadline
eligibility.status == "payout_capable"
eligibility is unexpired at request time
eligibility beneficiary Soul matches entitlement beneficiary Soul
Connected Account commitment is bound to the same Soul
no unresolved transfer request consumes the same entitlement amount
no refund reserve or chargeback reserve blocks the requested amount
```

#### BeneficiaryTransferRecord

`BeneficiaryTransferRecord`はPlatform AccountからConnected AccountへのStripe Transferを記録する。これは外部銀行口座へのpayout完了を意味しない。

```text
BeneficiaryTransferRecord {
  transfer_record_id: Hash,

  entitlement_ref: Hash,
  payout_claim_request_ref: Hash,

  amount_minor: u128,
  currency: CurrencyCode,

  stripe_connected_account_commitment: Hash,
  stripe_transfer_commitment: Hash,
  source_charge_commitment: Hash,
  transfer_group_commitment: Hash,

  payout_sequence: u64,
  created_at: Tick,

  state:
    "submitted"
    | "available_to_connected_account"
    | "failed"
    | "reversed"
    | "partially_reversed",

  payment_service_authorization_ref: Hash,
  signature: MLDSA65Signature
}
```

同一Entitlementの同一金額を二重にtransferしてはならない。Payment-ServiceはStripe APIへの書込みで、entitlement hash、payout sequence、金額から導かれる決定論的idempotency keyを使用しなければならない。

```text
idempotency_key =
  hash(
    "gaia:stripe:transfer:v1"
    || entitlement_id
    || payout_sequence
    || amount_minor
  )
```

#### BeneficiaryPayoutReceipt

`BeneficiaryPayoutReceipt`は、Connected Accountから外部銀行口座その他のStripe対応外部送付先へのpayout状態を記録する。

```text
BeneficiaryPayoutReceipt {
  payout_receipt_id: Hash,

  entitlement_ref: Hash,
  transfer_record_ref: Hash,

  payout_amount_minor: u128,
  currency: CurrencyCode,

  stripe_payout_commitment: Hash,

  payout_state:
    "created"
    | "pending"
    | "paid"
    | "failed"
    | "canceled",

  observed_at: Tick,
  payment_service_authorization_ref: Hash,
  signature: MLDSA65Signature
}
```

`BeneficiaryPayoutReceipt.payout_state = "paid"`は、Stripeがpayoutを完了として記録したことを意味する。これは、Gaiaが銀行側での最終入金、口座凍結の不存在、受取人の利用可能残高を完全に保証する意味ではない。Stripe TransferとStripe Payoutは同一ではない。

```text
Transfer:
  Gaia Platform Account -> Connected Account Stripe balance

Payout:
  Connected Account Stripe balance -> registered external account
```

Gaia clientはtransfer成功を現金受取完了と表示してはならない。

### 18.12 通知、期限、失効、期限付きサービス還元

#### 18.12.1 PayoutEntitlementNotice

Payment-Serviceは、`PayoutEntitlementPolicy.currency_terms.dormancy_notice_offsets`が定める各時点で、未払いEntitlementについて通知送信を試行する。たとえばPolicyが「期限180日前、90日前、30日前、7日前」を定める場合、Payment-Serviceは各時点で通知を署名・記録する。

```text
PayoutEntitlementNotice {
  notice_id: Hash,
  entitlement_ref: Hash,

  notice_kind:
    "created"
    | "eligibility_required"
    | "deadline_reminder"
    | "payout_failed"
    | "expiry_blocked"
    | "expired",

  scheduled_offset: Tick | null,
  dispatched_at: Tick,
  delivery_channel_commitments: [Hash],

  payment_service_authorization_ref: Hash,
  signature: MLDSA65Signature
}
```

通知は、P2P inbox、Gaia Bank inbox、登録済み通知経路、その他実装が定める複数経路へ送信を試行できる。通知の到達成功は、失効の必須条件としてはならない。Payment-Serviceは、Policyで定めた時点に送信を試行し、署名objectとして記録しなければならない。

#### 18.12.2 有効期限と期限延長

通常の有効期限は次である。

\[
claim\_deadline
=
created\_at
+
claim\_window(currency,policy)
\]

ただし有効な`PayoutDeadlineExtension`が適用される場合、実効期限は次とする。

\[
effective\_deadline
=
claim\_deadline
+
\sum extension\_duration
\]

```text
PayoutDeadlineExtension {
  extension_id: Hash,
  eligibility_scope_commitment: Hash,
  cause_ref: Hash,
  extension_duration: Tick,
  issued_at: Tick,
  owner_set_commitment: Hash,
  owner_threshold_signatures: [OwnerSignature]
}
```

extensionは対象Entitlement集合、原因、期間を署名済みobjectで明示しなければならない。Payment-Serviceのローカル裁量だけで期限を延長又は短縮してはならない。`PayoutDeadlineExtension`は期限の延長だけを許し、短縮、元本減額、受取条件悪化を許してはならない。

#### 18.12.3 失効可能条件と失効処理

Payment-Serviceは、次のすべてを満たすときだけ、`PayoutEntitlement`を失効できる。

```text
now >= effective_deadline
claimable_minor > 0
no active payout claim is unresolved
no submitted transfer remains unresolved
no pending payout remains unresolved for the relevant amount
no active refund reserve blocks finalization
no active chargeback/dispute blocks finalization
no valid Owner-authorized deadline extension applies
all required notice dispatch attempts have been recorded
```

返金、chargeback、Stripe障害、Owner緊急停止、送金済みだがStripe側で未確定のpayoutがある場合、Entitlementを`expiry_blocked`に置く。Payment-Serviceは、原因が解消されるまで失効を確定してはならない。

失効処理は次の通りである。

1. `unclaimed_minor = claimable_minor`を確定する。
2. 参照`PayoutEntitlementPolicy`のexpiry dispositionを取得する。
3. `reserve_allocation_minor`及び`service_credit_equivalent_minor`を整数演算で算出する。
4. 端数はnetwork reserve側へ決定論的に割り当てる。
5. `PayoutEntitlementExpiration`を署名する。
6. Entitlementの`forfeited_minor`を`unclaimed_minor`だけ増額し、`claimable_minor`を0にする。
7. Entitlementを`expired`又は`forfeited`として追記する。
8. service credit割合が正なら、対応する期限付き`GaiaServiceCreditGrant`を作成する。
9. `PayoutEntitlementNotice(notice_kind="expired")`を送信試行・記録する。

分割型の計算:

\[
service\_credit\_equivalent\_minor
=
\left\lfloor
\frac{unclaimed\_minor\times service\_credit\_fraction\_bps}{10000}
\right\rfloor
\]

\[
reserve\_allocation\_minor
=
unclaimed\_minor-service\_credit\_equivalent\_minor
\]

```text
PayoutEntitlementExpiration {
  expiration_id: Hash,
  entitlement_ref: Hash,

  effective_deadline: Tick,
  expired_at: Tick,

  unclaimed_minor: u128,
  currency: CurrencyCode,

  payout_policy_ref: Hash,

  reserve_allocation_minor: u128,
  service_credit_equivalent_minor: u128,
  service_credit_grant_ref: Hash | null,

  payment_service_authorization_ref: Hash,
  signature: MLDSA65Signature
}
```

保存則:

\[
unclaimed\_minor
=
reserve\_allocation\_minor
+
service\_credit\_equivalent\_minor
\]

`service_credit_equivalent_minor`は、法定通貨として再請求又は外部換金できない。対応する`GaiaServiceCreditGrant`がある場合でも、同GrantはPolicyにより定められた有限の`expires_at`を持たなければならない。期限失効は、支払済み金額、返金留保額、既に送金中の額を対象にしてはならない。

#### 18.12.4 GaiaServiceCreditPolicy

`GaiaServiceCreditPolicy`は、受取不能中又は`PayoutEntitlement`失効時に提供し得る、Gaia公式サービス専用の還元を定めるOwner認可済みobjectである。

```text
GaiaServiceCreditPolicy {
  policy_id: Hash,
  policy_version: u64,
  previous_policy_hash: Hash | null,

  valid_from: Tick,
  valid_until: Tick | null,
  activation_delay: Tick,

  eligible_entitlement_statuses: [
    "awaiting_payout_eligibility",
    "claimable",
    "transfer_pending",
    "expiry_blocked",
    "expired"
  ],

  source_currencies: [CurrencyCode],
  max_credit_fraction_bps: u16,

  authorized_service_catalog_ref: Hash,
  credit_expiry_window: Tick,

  transferable: false,
  fiat_redeemable: false,
  crypto_redeemable: false,

  owner_set_commitment: Hash,
  owner_threshold_signatures: [OwnerSignature],
  issued_at: Tick
}
```

妥当性規則:

```text
0 <= max_credit_fraction_bps <= 10000
credit_expiry_window > 0
transferable == false
fiat_redeemable == false
crypto_redeemable == false
valid_from >= issued_at + activation_delay
activation_delay >= MIN_SERVICE_CREDIT_POLICY_ACTIVATION_DELAY
```

`MIN_SERVICE_CREDIT_POLICY_ACTIVATION_DELAY`はGaia coreで最低7日と固定する。

#### 18.12.5 GaiaServiceCreditGrantと利用・失効

Stripe Connectの国・地域・口座・KYC/KYB・銀行口座・Stripe risk review・通貨又はcross-border経路の制約によりpayoutできないSoulは、Gaiaの通常層から排除されてはならない。ただし、法定通貨payoutができないことは、期限付き`PayoutEntitlement`を直ちに無期限負債へ変換する根拠にもならない。Owner thresholdが認可した`GaiaServiceCreditPolicy`に従い、Payment-Serviceは当該Soulへ、Gaia公式サービスだけに利用可能な`GaiaServiceCreditGrant`を付与できる。

```text
GaiaServiceCreditGrant {
  grant_id: Hash,

  beneficiary_soul_id: SoulId,
  source_entitlement_ref: Hash,

  source_currency: CurrencyCode,
  source_amount_minor: u128,

  service_catalog_ref: Hash,
  granted_units: u128,
  consumed_units: u128,
  expired_units: u128,

  credit_policy_ref: Hash,

  valid_from: Tick,
  expires_at: Tick,

  transferable: false,
  fiat_redeemable: false,
  crypto_redeemable: false,

  payment_service_authorization_ref: Hash,
  signature: MLDSA65Signature
}
```

保存則:

\[
granted\_units
=
consumed\_units+expired\_units+remaining\_units
\]

`GaiaServiceCreditGrant`は、法定通貨又は外部交換レートを主張してはならない。`source_amount_minor`は還元算定の監査入力であり、当該Creditが同額の法定通貨請求権であることを意味しない。このサービス還元は、別段の明示規定がない限り、元の`PayoutEntitlement.principal_minor`又は`claimable_minor`を減額しない。Creditの使用は元Entitlementの法定通貨元本を減額せず、Credit自体は別の有限サービス提供義務である。

利用可能条件:

\[
CreditUsable(G,t)
\iff
G.valid\_from\le t<G.expires\_at
\land RemainingUnits(G)>0
\]

CreditはOwner認可済み`authorized_service_catalog_ref`が示すGaia公式サービスに限って使用できる。許容される例は次である。

- Gaia Bankの保存、同期、アーカイブ、配布、可用性監査
- Gaia公式relay、content distribution、帯域、長期保管
- PromotionGrant
- PressRoom運用に関するGaia公式料金
- Soul recoveryに関するGaia公式料金
- Payment-ServiceのGaia側サービス料金
- Ownerが明示的に認可した公式ServiceOffer

禁止用途は次である。

```text
Soul間の送付、贈与、売買
法定通貨への交換
暗号資産、stablecoin、ギフトカードその他への交換
他者アセット購入代金への一般的な代用
Stripe feeの直接支払い
銀行出金又は外部payout
Q、depth、CanIssue、CanIssueTo、AssetScore、A_seed、bonusの取得
Candidates、Reach、forum創設、checkpoint finalityへの影響
Civic Vote、CivicCitizen、NeedAsset供給資格への影響
```

Creditは`expires_at`を過ぎれば未使用分は消滅する。

```text
GaiaServiceCreditExpiration {
  expiration_id: Hash,
  grant_ref: Hash,
  expired_at: Tick,
  unused_units: u128,
  disposition: "extinguished",
  payment_service_authorization_ref: Hash,
  signature: MLDSA65Signature
}
```

期限切れCreditは、Fiat payout権、`PayoutEntitlement`、別Credit、AssetScore又は他Soulの権利へ復元・変換してはならない。

### 18.13 返金・異議申立て・チャージバック

購入者からの返金要求は、対象`ServiceOffer`のrefund policy、対象`PaymentReceipt`、履行状態、既存返金・dispute状態に従って処理する。

返金手続:

1. 購入者又は適法な操作主体が、対象`PaymentReceipt`と`ServiceOffer`のrefund policyに束縛された署名済み返金要求を提出する。
2. Payment-ServiceはOrder、Receipt、Offer refund policy、既存返金累計、履行・紛争状態を検証する。
3. Stripe Refund APIを冪等に呼び出す。
4. Stripe側の返金状態をwebhook及びAPI再照会で確認する。
5. `RefundSettlement`を追記する。
6. 対応する未払い`PayoutEntitlement`の`claimable_minor`を、返金に必要な範囲で`reserved_minor`へ移す。
7. 未実行transferがある場合、送金を開始してはならない。
8. 既にtransfer済みの場合、必要に応じてStripe Transfer Reversalを試みる。
9. 回収額、不足額、回収不能額を`PayoutRecoveryAction`として追記する。
10. 返金最終結果に基づき、Entitlementの金額状態を保存則を破らないように確定する。

Stripeにおける返金が成功したことと、販売者からの資金回収が成功したことは別の事実である。Gaiaは両者を別object・別状態として扱わなければならない。

```text
RefundSettlement {
  refund_settlement_id: Hash,
  payment_receipt_ref: Hash,

  stripe_refund_commitment: Hash,
  refund_amount_minor: u128,
  currency: CurrencyCode,

  state:
    "requested"
    | "pending"
    | "succeeded"
    | "failed"
    | "canceled",

  observed_at: Tick,
  payment_service_authorization_ref: Hash,
  signature: MLDSA65Signature
}
```

Stripeがdispute又はchargebackを通知した場合、Payment-Serviceは以下を行う。

1. Stripe webhookの署名を検証し、Stripe APIでdispute objectを再照会する。
2. 対応するCharge、`PaymentReceipt`、`PaymentSettlement`、`PayoutEntitlement`、Transfer、Payout、`ContentAccessGrant`、`ServiceFulfillment`を特定する。
3. 未払いEntitlementの該当額を`reserved_minor`へ移し、`status="chargeback_pending"`を記録する。
4. 購入者の将来アクセスを制限する必要がある場合は、Offer及び`ContentAccessGrant`の規則に従って処理する。
5. 販売者に証拠提出のための通知・UI/API経路を提供する。
6. Stripeが定める期限内に、証拠をStripeへ提出するか、disputeを受諾する。
7. disputeの更新・終了をwebhook及びAPI再照会で追跡する。
8. 販売者側資金の回収が必要な場合、未払いEntitlement留保、未実行transfer停止、Transfer Reversal、事前規定された損失処理を順に試みる。
9. `PayoutRecoveryAction`及び必要な`PaymentReceipt`/Settlement adjustmentを追記する。
10. disputeが最終確定するまで、影響額を失効処理してはならない。

```text
PayoutRecoveryAction {
  action_id: Hash,
  entitlement_ref: Hash,

  cause:
    "refund"
    | "chargeback"
    | "transfer_reversal"
    | "platform_balance_recovery",

  affected_amount_minor: u128,
  recovered_amount_minor: u128,
  unrecovered_amount_minor: u128,

  stripe_transfer_reversal_commitment: Hash | null,

  state:
    "reserved"
    | "reversal_requested"
    | "recovered"
    | "partially_recovered"
    | "unrecoverable",

  observed_at: Tick,
  payment_service_authorization_ref: Hash,
  signature: MLDSA65Signature
}
```

デジタルコンテンツについて、Gaiaは次を区別しなければならない。

- 以後のアクセスを拒否又は失効させること
- 鍵やGrantの将来利用を止めること
- 既に復号・保存・複製された平文を回収すること
- Stripe上の資金を回収すること

Gaiaは前二者を仕様上扱えても、後二者を一般に保証してはならない。

返金・chargebackにより発生するStripe fee、dispute fee、負の残高、transfer reversal失敗、既にpayoutされた資金の回収不能額について、誰が経済的損失を負担するかは、`ServiceOffer`のpayment terms、fulfillment terms、refund policy及びOwner認可されたPayment-Service共通policyで、販売前に明示しなければならない。Payment-Service又はOwnerが、販売後に恣意的な新ルールを適用して販売者へ損失を遡及転嫁してはならない。

### 18.14 Stripe Connect上の実装事実と制約

各node / SoulはGaia上で受取権利者になれる。しかし、Stripe経由で法定通貨を受け取るには、当該Soulに束縛された有効なStripe Connected Accountが必要である。Stripe Connected Accountでは、onboarding、本人確認、事業確認、外部受取口座、capability、国・地域・通貨・規制・リスク要件が必要になり得る。GaiaのSoul又は公開鍵そのものは、Stripe上の法定通貨受取口座ではない。

Gaiaは、Stripe ConnectのSeparate Charges and Transfersモデルを用いる。

- chargeはGaia Stripe Platform Accountで作成する
- paymentの最終受取人は、決済後の`PaymentSettlement`で定められた受取人Soulである
- PlatformからConnected AccountへStripe Transferを作成する
- 複数受取人への分配は複数Transferで扱える
- Transferと外部Payoutを別状態として記録する
- 元決済との関係を追跡するため、可能な構成ではsource transaction / transfer group等のStripe機能を使う

Stripe API、Stripe account type、国境を越えるtransferの可否、対象通貨、Platform所在地、Connected Account所在地、payment method、Connect configurationは、Stripeの現行プロダクト制約に依存する。Payment-Serviceは、仕様書上の抽象的な通貨対応だけを根拠に、実際にStripeが許容しないtransfer又はpayoutを試みてはならない。

本仕様における初期販売通貨は`USD`、`JPY`、`CNY`である。これは以下を意味しない。

- 任意の国に居住するSoulが、当該通貨でStripe Connect payoutを受けられる保証
- 中国本土のSoulがStripe Connected Accountを作成又はCNY payoutを受けられる保証
- Platformの所在地・Stripe account configurationにかかわらず、全通貨でcharge、transfer、payoutが可能である保証
- 為替又はcross-border conversionが固定又は無料である保証

Payment-Serviceは、販売通貨、Settlement通貨、Transfer通貨、Payout通貨、外部銀行口座通貨を混同してはならない。本仕様では、通貨換算を伴う分配を行ってはならない。

```text
PaymentReceipt.currency
  == PaymentSettlement.currency
  == PayoutEntitlement.currency
  == BeneficiaryTransferRecord.currency
```

実際のStripe payout通貨が異なる場合、又はStripeが為替を伴う処理を行う場合、それを同通貨清算モデルに黙って混入させてはならない。為替レート、換算時点、Stripe FX fee、受取額、loss allocationを完全に定義するまで拒否する。

Gaiaは次を区別して記録・表示する。

| Gaia状態 | Gaiaが確認できる外部事実 | Gaiaが保証してはならないこと |
|---|---|---|
| `PaymentReceipt.paid` | Stripeが購入者の決済成功を記録 | 受取人への分配完了 |
| `PaymentSettlement.finalized` | Stripe実費とGaia維持手数料に基づく配分額の確定 | Connected Account残高への到達 |
| `BeneficiaryTransferRecord.submitted` | Stripe Transfer作成要求又は作成結果 | 外部現金の到着 |
| `available_to_connected_account` | Connected Account残高で資金が利用可能 | 銀行口座へのpayout完了 |
| `BeneficiaryPayoutReceipt.created/pending` | Stripeが外部payoutを開始又は処理中 | 銀行側の最終着金 |
| `BeneficiaryPayoutReceipt.paid` | Stripeがpayout完了を記録 | 銀行口座の利用可能残高、凍結不存在、受取人の現実利用 |
| `PayoutEntitlement.expired` | Gaia上の期限付き請求権がPolicyどおり失効 | 法域上の全ての外部請求権の不存在 |

### 18.15 会計・監査・状態保存則

`USD`、`JPY`、`CNY`の金額を同一の整数合計に混ぜてはならない。負債、reserve、サービス還元原価、refund reserve、chargeback lossは通貨別に台帳化する。

Payment-Serviceは少なくとも次の論理勘定を区別しなければならない。

| 勘定 | 内容 | 性質 |
|---|---|---|
| `stripe_pending_settlement` | Stripe上で決済成功後、実費手数料又は資金状態が未確定の金額 | 未確定 |
| `payout_entitlement_liability` | 期限内にclaimable又はreservedである法定通貨`PayoutEntitlement` | Gaiaの条件付き法定通貨債務 |
| `refund_chargeback_reserve` | refund/dispute/chargebackに備えて留保した金額 | 条件付き負債 / 留保 |
| `network_maintenance_revenue` | FeeScheduleにより確定したGaia維持手数料、及び第7.17.7節により帰属した期限切れ未分配Pool lot | Gaia収益・運営原資 |
| `undistributed_forum_pool_balance` | 確定済みだが未分配のForum Revenue Pool残高（繰越lotを含む） | forum参加者への条件付き分配原資。Gaiaの`TotalFiatLiability`には計上しない |
| `expired_entitlement_reserve` | 期限失効によりPolicyどおりGaiaへ帰属した額 | Gaia reserve |
| `service_credit_obligation` | 未使用かつ未失効の`GaiaServiceCredit` | 非金銭的な有限サービス提供義務 |
| `expired_service_credit` | 期限失効済みサービス還元 | 義務消滅 |
| `chargeback_loss` | 既払・既送金後に回収不能となった外部決済損失 | 明示的損失 |

通貨cにおけるGaiaの有効法定通貨負債は、少なくとも次で集計する。

\[
TotalFiatLiability(c,t)
=
\sum_{E\in ActiveEntitlements(c,t)}
(claimable\_minor(E)+reserved\_minor(E))
\]

`expired`、`forfeited`、`paid`、`reversed`として最終処理済みの額を二重計上してはならない。

全決済に対して、次の保存則が成立しなければならない。

\[
gross
=
stripe\_fee
+
gaia\_network\_fee
+
forum\_revenue\_pool\_contribution
+
beneficiary\_pool
\]

各`PayoutEntitlement`について次が成立しなければならない。

\[
principal
=
paid+reserved+forfeited+claimable
\]

各失効処理について次が成立しなければならない。

\[
unclaimed
=
reserve\_allocation+service\_credit\_equivalent
\]

各CreditGrantについて次が成立しなければならない。

\[
granted
=
consumed+expired+remaining
\]

検証不能な差額、負の残高、孤立した端数、二重計上、通貨横断相殺を許してはならない。すべての決済、清算、受取権、Transfer、Payout、Refund、Dispute、Recovery、Expiration、Credit objectは追記型であり、既存objectを上書きしてはならない。

### 18.16 鍵の分離と緊急停止

- Owner鍵、Payment-Service鍵、Soul-Bank鍵、eKYC service鍵は**異なるkey domain**とする。一つの鍵を複数の中央責務へ再利用してはならない。
- 中央serviceの短期署名鍵はローテーション可能にする。Owner鍵は日常運用に使わない。
- Owner thresholdは、Payment-Serviceの認可（`PaymentServiceAuthorization`。第18.1節・第18.3節・第18.17節がOwner threshold署名を要求する）、Payment-Serviceの失効・緊急停止（`EmergencyPaymentSuspension`）、受取人に帰責しない客観的停止時の期限延長（`PayoutDeadlineExtension`）、決済policyの認可・更新、cross-forum割引係数policy（`GaiaAssetAccessPolicy`）の認可・更新、root eKYC providerおよびeKYC serviceの認可・失効、Owner set自身のupgradeにだけ作用する。

Stripe compromise、webhook compromise、重大な規制停止、Stripe Platform Account制限、清算整合性失敗が起きた場合、Owner thresholdは`EmergencyPaymentSuspension`を発行できる。

```text
EmergencyPaymentSuspension {
  suspension_id: Hash,
  reason_code:
    "stripe_compromise"
    | "webhook_compromise"
    | "regulatory_hold"
    | "critical_account_restriction"
    | "settlement_integrity_failure",

  starts_at: Tick,
  expires_at: Tick,

  affected_operations: [
    "new_checkout",
    "new_transfer",
    "new_payout"
  ],

  owner_set_commitment: Hash,
  owner_threshold_signatures: [OwnerSignature]
}
```

緊急停止は、料率変更、元本減額、個別没収、既存Entitlementの期限短縮を許す権限ではない。受取人に帰責しない停止期間により、受取人が請求又はpayoutを実行できなかった場合の期限延長は、`PayoutDeadlineExtension`（第18.12.2節）により客観的に指定する。

中央serviceの停止や失効は、すでに検証済みのforum状態や証明書を遡及無効化しない。失効は、その時点以降の新しい発行・新しいauthorityにだけ効く。

### 18.17 Ownerが実行する完全手続

Gaia mainnetで有償販売又は分配を開始する前に、Owner thresholdは次を完了しなければならない。

1. `PaymentAuthoritySet`がGaia binaryに焼き付けられたOwner集合・閾値規則と一致することを確認する。
2. Stripe Platform Accountを準備し、Payment-Service運営主体がStripe APIおよびWebhookを安全に運用できる状態にする。
3. `PaymentServiceAuthorization`をOwner threshold署名で発行する。
4. `GaiaNetworkFeeSchedule`をOwner threshold署名で発行する。
5. `PayoutEntitlementPolicy`をOwner threshold署名で発行する。
6. 必要なら`GaiaServiceCreditPolicy`をOwner threshold署名で発行する。
7. すべてのPolicyの`valid_from`が最低有効化遅延を満たすことを確認する。
8. 各PolicyとAuthorizationをPayment-Service、Gaia client、監査器が取得・検証可能な状態に公開する。
9. Stripe webhook endpointを登録し、受理するevent type、endpoint secretの保護、再送処理、イベント監査ストアを整備する。
10. 決済開始前に、テストモード及び本番モードを混在させない。Gaia network ID、Stripe mode、Payment-Service authorization epochを一意に束縛する。

Ownerがネットワーク維持手数料を変更する場合、次を実行する。

1. 新しい`GaiaNetworkFeeSchedule`を作成する。
2. `previous_schedule_hash`へ直前scheduleを束縛する。
3. `USD`、`JPY`、`CNY`の各tierが連続・非重複・完全であることを検証する。
4. 料率、固定手数料、整数丸め、上限、通貨最小単位を検査する。
5. `valid_from >= issued_at + 7 days`を満たす発効時刻を設定する。
6. Owner thresholdで署名する。
7. 署名済みscheduleを公開する。
8. Payment-Serviceは`valid_from`より前に新scheduleを新規Orderへ適用してはならない。
9. 既存Order、既存`PaymentReceipt`、既存`PayoutEntitlement`に新scheduleを適用してはならない。

Ownerが受取請求期限、失効時のreserve帰属、サービス還元率、サービス還元期限を変更する場合、次を実行する。

1. 新しい`PayoutEntitlementPolicy`を作成する。
2. 通貨別`claim_window`が正で有限であることを確認する。
3. 失効時のreserve割合とservice credit割合の合計が10000bpsであることを確認する。
4. Service credit割合が正なら、そのcredit expiryが正で有限であることを確認する。
5. 通知offsetが請求期間内であることを確認する。
6. 最低7日の有効化遅延を設定する。
7. Owner thresholdで署名し、公開する。
8. 新policyは発効後に作成される新規Order及び新規Entitlementにだけ適用する。
9. 既発行Entitlementの`claim_deadline`、元本、失効時配分を変更してはならない。

Ownerがcross-forum割引係数を変更する場合、次を実行する。

1. 新しい`GaiaAssetAccessPolicy`を作成する。
2. `previous_policy_ref_optional`へ直前policyを束縛する。
3. `cross_forum_discount_ratio`が既約有理数の正規化済み表現であり、`0 < cross_forum_discount_ratio < 1`を満たすことを確認する。
4. `policy_version`が直前policyの`policy_version + 1`であることを確認する。
5. `network_id`が現在のnetwork_idと一致することを確認する。
6. Owner thresholdで署名し、公開する。
7. 新policyは`valid_from`以降のcross-forum `AssetAccess_direct`の評価にだけ適用する。`valid_from`より前の`AssetAccess_direct`、checkpoint、`StateProofEnvelope`、Civic、`AssetScore`、`Candidates`、`Reach`及び既存access grantの意味を変更してはならない（第18.23節）。
8. 第7.14節の`declared_cross_forum_discount_ratio`を変更・再解釈してはならない。

緊急停止と期限延長の手続は第18.16節および第18.12.2節に定める。`EmergencyPaymentSuspension`は影響操作を明示して発行し、`PayoutDeadlineExtension`は対象集合・原因・期間を署名済みobjectで明示する。

### 18.18 Payment-Serviceが実行する完全手続

#### 18.18.1 Stripe API・webhookの安全運用

Payment-Serviceは次を実装しなければならない。

1. Stripe webhookのHTTP request raw bodyを、署名検証前に改変しない。
2. Stripe-Signatureヘッダとwebhook endpoint secretを用いて、Stripe webhookの署名を検証する。
3. event timestampの許容範囲を検証し、replayを検出する。
4. `event.id`を耐久ストアに一意に記録する。
5. 同一eventの再配送に対して副作用を繰り返さない。
6. webhook endpointは短時間で応答し、重い照会・清算・transfer作成を耐久queueへ引き渡す。
7. queue consumerもevent id、Stripe object ID、Gaia order idを使って冪等にする。
8. event payloadだけを盲信せず、Stripe APIで対象objectを再照会する。
9. 対象Stripe objectが想定するPlatform Account、Stripe mode、Gaia order commitment、target commitment、通貨、金額と一致することを確認する。
10. 署名不正、未知account、metadata不一致、金額不一致、通貨不一致、重複注文、状態逆行はfail-closedで隔離する。
11. Stripeの自動再送だけに依存せず、未処理eventを監査・回収する定期処理を実装する。
12. Stripe API書込みには、Gaia object hashから導くidempotency keyを必ず用いる。

受理対象eventは実装が使うStripe API versionに応じて正確な型を確定しなければならないが、少なくとも次の状態遷移を監視できなければならない。

```text
PaymentIntent success / failure / processing
Charge success / refunded
Balance Transaction availability and fee confirmation
Connected Account update and requirements change
Transfer creation / failure / reversal
Payout creation / paid / failed / canceled
Dispute creation / update / closure
Refund update
```

Webhook到着順は保証されないものとして実装する。Gaiaの状態遷移はwebhook受信順ではなく、Stripe APIから再照会した現在状態、Stripe objectの時刻、Gaia objectの許容遷移を使って決める。

#### 18.18.2 注文とPaymentIntentの作成

Payment-Serviceは、購入者が署名した`ServiceOrder`又は等価な注文objectを検証し、次を満たす場合だけStripe PaymentIntent又はCheckout Sessionを作成する。

```text
Order signature and normal authority gate are valid
Order is unexpired
Offer / Asset / PressRoom is active
Order currency is supported sale currency
Order amount equals current referenced offer price * quantity under canonical arithmetic
BeneficiaryRule commitment matches the offer
FeeSchedule and PayoutEntitlementPolicy references are active at Order creation time
No completed payment already binds the same order_id
No EmergencyPaymentSuspension blocks new_checkout
```

PaymentIntent作成時のidempotency key:

```text
hash("gaia:stripe:payment-intent:v1" || order_id)
```

#### 18.18.3 支払い成功とPaymentReceipt

Payment-Serviceは、Stripe webhook署名検証及びStripe API再照会を通過した後にだけ、`PaymentReceipt(payment_state="paid")`を発行できる。

以下の場合、`PaymentReceipt`を発行してはならない。

```text
PaymentIntent又はChargeが成功状態ではない
metadata commitmentがOrderと一致しない
支払い総額又はcurrencyがOrderと一致しない
Stripe Platform AccountがAuthorizationと一致しない
同一Order又は同一Stripe Chargeに既存の有効Receiptがある
Payment-Service authorizationが失効している
```

`PaymentReceipt`発行後、アセットアクセス又はサービス履行を開始できる。ただし、販売者への最終分配・payout完了を意味するものではない。

#### 18.18.4 Stripe手数料確定とPaymentSettlement

Payment-Serviceは`PaymentReceipt`の対応Chargeに紐づくStripe Balance Transactionを取得し、実際のStripe手数料を確認する。Balance Transactionが未確定又は取得不能である間、Payment-Serviceは`PaymentReceipt`を保持してもよいが、`PaymentSettlement`をfinalizeしてはならない。

実費が確定したとき、Payment-Serviceは次を行う。

1. `net_after_stripe_minor`を算出する。
2. Orderに固定されたFeeScheduleから通貨・金額に対応する一意のtierを選ぶ。
3. Gaia network feeを整数演算・切り捨てで算出する。
4. 対象Orderがforumへ束縛される場合、Orderに固定されたforum Pool policyからForum Revenue Pool contributionを第7.17節の規則で算出する。forum_idがnull又はPool policyがdisabledなら0とする。
5. `beneficiary_pool_minor`を、net、Gaia network fee、Forum Revenue Pool contributionの差として算出する。
6. `PaymentSettlement`を署名する。
7. 受取人ごとの分配額を第18.7節の端数規則で確定する。
8. 各受取人について`PayoutEntitlement`を発行する。Forum Revenue Pool由来の額は、該当する場合、別途`ForumPoolContributionRecord`として保留する（第7.17.4節）。

#### 18.18.5 PayoutEntitlementの生成

各受取人の分配額について、Payment-Serviceは`PayoutEntitlement`を発行する。販売者・提供者への通常売上分配は`source_kind="seller_beneficiary_settlement"`とする。生成時に以下を固定する。

```text
settlement_ref
source_kind
source_ref
beneficiary_soul_id
currency
principal_minor
created_at
claim_deadline
payout_policy_ref
fee_schedule_ref
```

Forum Revenue Pool由来の分配は、第7.17.8節の`ForumRevenuePoolDistribution`に基づき、`source_kind="forum_revenue_pool_distribution"`として発行する。期限切れ未分配Poolの帰属は`ForumPoolUndistributedForfeiture`（第7.17.7節）として扱い、Soulへの`PayoutEntitlement`は発行しない。

`claim_deadline`は参照Policyの`claim_window`から決定論的に計算する。

```text
claim_deadline = created_at + claim_window(currency, payout_policy_ref)
```

発行済みEntitlementの`claim_deadline`、`payout_policy_ref`、`principal_minor`は、通常更新で変更してはならない。

#### 18.18.6 Stripe Connect eligibilityの観測

Payment-Serviceは、Connected Accountのonboarding進行、追加requirements、payout可否、closed/restricted状態を観測し、`BeneficiaryPayoutEligibility`を発行・更新する（第18.10節）。

#### 18.18.7 payout請求、Transfer、Payout

有効な`PayoutClaimRequest`を受理したPayment-Serviceは、次の順に処理する。

1. 請求署名、Soul、金額、通貨、期限、Eligibility、重複請求、reserve状態を検証する。
2. Entitlementの該当金額を、一時的に`reserved_minor`へ移し、並行二重請求を防ぐ。
3. Stripe Transfer作成要求を、指定されたConnected Accountへ送る。
4. transferは元Chargeとの因果関係をStripe側で保持するため、可能な構成では`source_transaction`又は等価なsource charge関係を指定する。
5. Stripe API書込みに決定論的idempotency keyを使う。
6. `BeneficiaryTransferRecord(state="submitted")`を発行する。
7. Stripe API再照会又は署名検証済みeventにより、transferの成功、利用可能化、失敗、reversalを追記する。
8. Connected Accountから外部口座へのpayoutが作成・完了・失敗・取消されたことを、`BeneficiaryPayoutReceipt`として追記する。
9. payoutがStripeで`paid`になった時だけ、対応Entitlementの`paid_minor`を増額し、`reserved_minor`を同額減額する。
10. transfer又はpayoutが失敗・取消された場合、Policyのretry window内で再試行可能なら、対応金額を`claimable_minor`へ戻すか、明示的なpending状態に置く。

#### 18.18.8 transfer失敗時の処理

Transferが失敗した場合、Payment-Serviceは以下を行う。

1. Stripe error、対象Connected Account、Entitlement、請求額を照合する。
2. `BeneficiaryTransferRecord(state="failed")`を発行する。
3. 同額の`reserved_minor`を、重複送金がないことを検証後に`claimable_minor`へ戻す。
4. `PayoutEntitlementNotice(notice_kind="payout_failed")`を送信試行・記録する。
5. `retry_window`内で、受取人が更新済みEligibilityを提示した場合に再請求を受理する。
6. `claim_deadline`又は有効な延長期限を越えた場合は、通常の失効手続へ進む。

Payment-Serviceは、Stripeの失敗を理由に、期限前にEntitlementをreserveへ没収してはならない。

### 18.19 nodeが実行する完全手続

販売を希望するSoulは、AssetRecord、ServiceOffer、PressRoom等の販売objectを公開する前又は公開時に、受取人Soulと比率を`BeneficiaryRule`（第19.1節）で固定する。販売者が自分だけを受取人とする場合は`mode="single_beneficiary"`、`beneficiaries=[{ beneficiary_soul_id: self, allocation_bps: 10000 }]`とする。複数受取人へ分配する場合、各Soulと比率をOrder前に確定しなければならない。注文後の変更は無効である。

受取を希望するSoulは、Gaia clientから`BeneficiaryEnrollmentRequest`を署名してPayment-Serviceへ提出する。

```text
BeneficiaryEnrollmentRequest {
  request_id: Hash,
  beneficiary_soul_id: SoulId,
  beneficiary_authority_pubkey: MLDSA65PublicKey,

  requested_country: CountryCode,
  requested_payout_currency: CurrencyCode,
  requested_account_configuration: String,

  nonce: Bytes,
  submitted_at: Tick,
  signature: MLDSA65Signature
}
```

Payment-Serviceは、Soulに紐づくStripe Connected Accountの作成又はStripe onboarding link / embedded onboardingを開始する。ノードはStripeが提示する画面で必要情報を直接入力する。

ノードは`BeneficiaryPayoutEligibility`の状態を確認できる。`onboarding_required`又は`requirements_due`なら、Stripeが要求する手続をStripe側で完了する必要がある。

ノードは、Entitlementの`claim_deadline`より前に、有効な`payout_capable` Eligibilityを参照して`PayoutClaimRequest`を署名する。ノードは、payout requestを提出しただけで外部現金を受領したと表示してはならない。Gaia clientは少なくとも以下を区別して表示する。

```text
1. 受取権が発生した
2. payoutを請求した
3. Stripe transferが作成された
4. Connected Account残高で利用可能になった
5. Stripe payoutが開始された
6. Stripeがpayout完了を記録した
```

ノードがStripe受取条件を満たせない場合、期限内にonboarding、KYC/KYB、外部口座、国・通貨設定等を解決できる限り解決する。Payment-Service又はOwnerは、単にノードが特定国に住む、Stripe未対応である、KYCを完了していない、payoutが失敗したという理由だけで、期限前にEntitlementを失効・没収してはならない。ノードはPolicyに基づく`GaiaServiceCreditGrant`を受けることがあるが、それが元の法定通貨Entitlementの請求額を当然に減らすものではない。

### 18.20 決済・分配・期限失効の全体不変条件

実装は少なくとも次を満たさなければならない。

```text
1. Gaia mainnetのPayment-Serviceはpayment_rail="stripe"だけを受理する。

2. Payment-Service、Stripe、Connected Account、PayoutEntitlement、Service Creditは、
   Q、depth、CanIssue、CanIssueTo、AssetScore、A_seed、bonus、Candidates、Reach、
   forum創設、checkpoint finality、Civic資格を変更又は購入する入力にならない。

3. Stripe API secret、webhook secret、Stripe external identifiersの平文、銀行口座、
   KYC/KYB平文はGaia公開object及びStateProofEnvelopeに入らない。

4. PaymentReceiptはStripe webhook署名検証、Stripe API再照会、Order commitment照合、
   金額・通貨照合を通過しなければ発行できない。

5. 同一Stripe event、PaymentIntent、Charge、Balance Transaction、Transfer、Payout、
   Refund又はDisputeから二重のGaia副作用を生んではならない。

6. PaymentSettlementはactual Stripe feeを確認するまでfinalizeしてはならない。

7. Gaia network feeはactual Stripe fee控除後のnet額だけを入力とする。

8. gross = stripe fee + Gaia network fee + forum revenue pool contribution + beneficiary pool が、
   通貨最小単位の整数として厳密に成立しなければならない。forum_idがnull又はforum Pool policyがdisabledの
   場合、forum revenue pool contributionは0でなければならない。

9. BeneficiaryRuleの比率合計は10000bpsでなければならず、端数配分は決定論的でなければならない。

10. PayoutEntitlementはPaymentSettlementなしに発行できない。

11. すべてのPayoutEntitlementは有限かつ明示的なclaim deadlineを持たなければならない。

12. PayoutEntitlementのPolicy、通貨、元本、生成済みdeadlineは、通常更新で変更できない。

13. Ownerは将来のfee/payout/credit policyを変更できるが、既発行Entitlementの
    deadline短縮、元本減額、受取条件悪化をしてはならない。

14. PayoutはEntitlement beneficiary Soulに束縛され、かつ有効なStripe Connected Accountにだけ行える。

15. TransferとPayoutは異なる状態であり、Transfer成功を外部現金受取完了と表示してはならない。

16. refund、dispute、chargeback、未解決Transfer又は未解決Payoutに関係する額を、
    失効処理してはならない。

17. PayoutEntitlementの失効は、Policyで定めた期限、通知試行、未解決状態不在、
    有効な延長不存在を検証してからのみ可能である。

18. Service Creditは非譲渡、非換金、非暗号資産、期限付きである。

19. Service Creditは、元のPayoutEntitlementへ自動復元又は法定通貨転換されない。

20. すべての決済、清算、受取権、Transfer、Payout、Refund、Dispute、Recovery、
    Expiration、Credit objectは追記型であり、既存objectを上書きしてはならない。

21. USD、JPY、CNYの各勘定は通貨別に分離し、為替を伴う黙示的な分配をしてはならない。

22. Stripeの国別・通貨別・Cross-border可否は実行時に検証する。Gaia protocol上の
    sale currency対応を、全Soulへのpayout保証と解釈してはならない。

23. Forum Revenue Pool contributionは、Gaia network maintenance feeの一部、内部配分、
    又はreserve補助ではなく、forum genesis固定の独立控除である（第7.17節）。
    ただし繰越期限を満了した未分配lotは、第7.17.7節によりGaia network maintenance
    feeへ帰属する。この帰属はcontributionの原資・率・分配式を変更しない。

24. Forum Revenue Poolの分配資格・ウェイトの成熟度入力はActiveMember、healthy、
    valid SoulEpoch、computed depthだけであり、root_entry保有・Q・AssetScore等を
    入力にしてはならない。

25. ForumRevenuePoolDistributionは単一evaluation_checkpointで評価され、
    available = carry_forward_in + newly_eligible_contribution、かつ
    available = total_distributed + carry_forward_out + forfeited_to_gaia が成立する。

26. 自己購入、検証済み共通実体、購入者又は販売beneficiary自身の取引由来Poolからの
    直接配分は除外し、繰越はmax_carry_forward_epochs、forum lifetime cap、
    ForumPoolUndistributedForfeitureの各規則に従う（第7.17節）。
```

### 18.21 譲渡決済（Soul Transfer・Forum Root Transfer）

Payment-Serviceが扱うcommerce対象として、`soul_transfer`と`forum_root_transfer`を追加する。ただし、これらは通常のasset purchaseやPressRoom membershipと異なる高リスク取引であり、専用object chainを必須とする（第16.7節、第5.6節、第24章）。通常の`ServiceKind`によるOffer→Order→Fulfillmentが、agreement・freeze・eKYC・finalizationを代替することはない（第19章）。

> `PaymentReceipt`は支払い又は予約された支払いの外部事実を示すが、それ単独でSoul Transfer又はForum Root Successionを成立させない。`SoulTransferFinalization`又は`ForumRootSuccession`は、PaymentReceipt/Reservationに加え、eKYC、distinctness、freeze、authority切替、dispute状態、history commitmentを必要とする。

また逆に、譲渡finalizationが済んでも、売主への外部Payoutが即時に確定するとは限らない。

`SoulTransferPaymentReservation`の状態遷移は次に固定する。

```text
created
payment_pending
paid_held_in_escrow_like_reserve
transfer_finalized_pending_release
release_authorized
transferred_to_connected_account
paid_out
refunded
disputed
chargeback_pending_recovery
recovered_or_written_off
```

各状態はPayment-Serviceが署名し、Stripe object commitment、Gaia agreement hash、beneficiary rule、Owner set commitment、fee scheduleを含める。

決済の順序を次に固定する。

1. 署名済みTransferAgreementが存在する
2. 対象Soul/forumがFreezeされた
3. 買主がStripe決済を完了し、Payment-Serviceがreservation objectを発行する
4. transfer finalization条件が検証される
5. Gaia上のauthority/root successionがfinalizeされる
6. 異議・reserve・返金・chargeback policyを満たす場合にrelease authorizationが発行される
7. Stripe Connected AccountへのTransfer及び外部Payoutを記録する

手順6のrelease authorizationは、Payment-Serviceが署名する次のobjectである。本節を`TransferPaymentReleaseAuthorization`のcanonical schemaの正本とする。

```text
TransferPaymentReleaseAuthorization {
  authorization_id: Hash,
  transfer_id: Hash,
  transfer_kind: "soul_transfer" | "forum_root_transfer",

  agreement_ref: Hash,
  finalization_ref: Hash,

  seller_soul_id: SoulId,
  beneficiary_rule_commitment: Hash,

  stripe_payment_commitment: Hash,
  payment_settlement_ref: Hash,
  owner_set_commitment: Hash,
  fee_schedule_ref: Hash,

  release_scope:
    "transfer_to_connected_account"
    | "payout_entitlement_available"
    | "both",

  release_condition_proof_ref: Hash,
  dispute_state: "none" | "resolved",
  reserve_state_commitment: Hash,

  authorized_at: Tick,
  expire: Tick,

  payment_service_pubkey: Pubkey,
  signature
}
```

有効条件は次による。`finalization_ref`が指す`SoulTransferFinalization`又は`ForumRootSuccession`が確定済みであること。`dispute_state`が`none`又は`resolved`であること。reserve、refund、chargeback、Stripe settlement policyのすべてを満たすこと。`expire > authorized_at`であること。`seller_soul_id`及び`beneficiary_rule_commitment`が対象agreementと一致すること。release authorizationは、`transfer_id`と`release_scope`の組について高々一つが同時に有効であり、二重release・対象外への転用を許さない。`PaymentReceipt`又は`SoulTransferPaymentReservation`は本objectを含意せず、本objectは譲渡finalizationを含意しない（第24.11節の「決済非同一性」）。

Stripe webhookの重複、順不同、遅延、再送に対して、`transfer_id`、`agreement_ref`、Stripe commitment、idempotency keyを用い、同一取引で複数回release又は複数回Transferをしない。

refund、dispute、chargebackについて、次を明記する。

- finalization前の決済失敗、返金、異議は譲渡finalizationを阻止又はcancel/revert状態へ進める。
- finalization後のchargebackは、過去のauthority/root successionを自動的に巻き戻さない。
- chargeback後の金銭的回収・reserve・Transfer reversal・write-offは既存の`PayoutRecoveryAction`等で扱う。
- controller/rootを戻す必要がある場合は、新しい正式なSoul Transfer又はForum Root Succession、又は認可されたTransferResolutionを要求する。
- これにより、後継controllerがfinalization後に行った正当な第三者取引を、外部決済の後日事象だけで無効化しない。

PayoutEntitlementについて、次を明記する。

> `PayoutEntitlement`は発生・確定時点のbeneficiary Soul及び当時のcontroller bindingに帰属する。Soul Transferは、既存又は過去期間に由来するPayoutEntitlementをsuccessor controllerへ自動承継させない。

受取人がSoulではなくSoul + controller binding + entitlement epochに束縛される必要がある場合、schemaを拡張する。

### 18.22 Lineage Royalty Settlement、Entitlement、Payout Aggregation

本章は、第7.18節のALR計算を、決済確定・受取権・実送金へ接続する。新規objectのcanonical schemaは第22章、受理述語とreject条件は第23章に定める。

#### 18.22.1 ALR saleの確定

Payment-Serviceは、Stripe paymentが`paid`または既存の許容状態となり、`PaymentSettlement`を作成する際、ALR対象saleについて次をatomicに行わなければならない。

1. ServiceOrder、ServiceOffer、sold asset、lineage node、rights grant、origin commercial rights policy、origin lineage royalty policyをcanonicalに解決する。
2. lineage chainをoriginまで検証し、cycle、深度超過、grant失効、policy mismatch、authority mismatchをfail-closedで検出する。
3. 既存の公式により`beneficiary_pool_minor`を計算する。
4. 第7.18.5節の公式により`LineageRoyaltySettlement`を作成する。
5. sellerと各ancestor beneficiaryの`PayoutEntitlement`を作成する。
6. `PaymentSettlement.lineage_royalty_settlement_ref`を設定する。
7. コンテンツaccess grantの発行を、payment / fulfillmentの既存規則と整合する形で進める。
8. 返金、チャージバック、disputeが未解決の場合は、既存のreserve規則に従いentitlementを`refund_reserve`または`chargeback_pending`とする。

上記は、同じ`order_id`に対してidempotentでなければならない。idempotency keyは少なくとも`order_id`、`payment_settlement_id`、`origin_lineage_royalty_policy_ref`、`sold_lineage_node_ref`をdomain separated hashしたものとする。

`LineageRoyaltySettlement`は、`PaymentSettlement.beneficiary_pool_minor`を唯一の`B`とし、`ancestor_pool_minor = A`、`seller_principal_minor = P_seller`、各generation配分`R_k`を第7.18.5節の整数演算・`largest_remainder_v1`で確定する。次を常に検証する。

\[
seller\_principal\_minor + \sum_{k=1}^{d}allocated\_amount\_minor(k) = beneficiary\_pool\_minor
\]

#### 18.22.2 Entitlementの生成

- sellerの取り分は`source_kind = "seller_lineage_royalty_settlement"`、`principal_minor = seller_principal_minor`として発行する。
- 各ancestor配分は`source_kind = "ancestor_lineage_royalty_settlement"`として発行し、`lineage_royalty_settlement_ref`、`lineage_royalty_allocation_ref`、`generation`を設定する。
- 同一Soulの複数ancestor配分は、同一sale・同一通貨で一件のentitlementへ合算してよい。合算する場合も`LineageRoyaltySettlement.allocations`のgeneration別原配分は保持し、検証可能にする。
- 同一Soulがsellerかつancestorである場合、seller分とancestor分は論理的に別に算定し、同一Soulへのentitlementとして合算してよい。自己取引規則が優先する場合はその規則に従う。
- ALR entitlementも`PayoutEntitlement`の非譲渡・非市場・非担保性に従い、Soul Transfer後の請求は第18.21節および本仕様のsuccessor controller binding規則に従う。
- 全ALR entitlementの`principal_minor`総和は、当該saleの`beneficiary_pool_minor`と一致しなければならない。

#### 18.22.3 PayoutAggregationとpayout epoch集約

`PayoutAggregation`は送金事務のための集約objectであり、売買ごとのentitlementを置換・遅延させない。Payment-Serviceは、各payout epochの終了時または定期バッチ時に、次のkeyごとにclaimable entitlementを集約できる。

```text
(network_id, beneficiary_soul_id, currency, payout_epoch_id)
```

同一keyのclaimable entitlement数が`MAX_PAYOUT_ENTITLEMENTS_PER_AGGREGATION`（第7.18.4節）を超える場合、Payment-Serviceは当該keyのentitlementを、entitlement refのcanonical byte order昇順で先頭から上限件数ずつ分割し、各部分を一つの`PayoutAggregation`とする。分割は次を満たさなければならない。

- 分割数は`ceil(件数 / MAX_PAYOUT_ENTITLEMENTS_PER_AGGREGATION)`と厳密に一致する
- 各部分の件数は1以上`MAX_PAYOUT_ENTITLEMENTS_PER_AGGREGATION`以下である
- 全claimable entitlementがちょうど一つの部分に含まれる（省略も重複も許さない）
- 分割順序はcanonical byte orderだけに依存し、実装・時刻・beneficiaryの裁量に依存しない
- 各部分は独立した`PayoutAggregation`であり、`gross_claimable_minor`、`reserved_minor`及び`transfer_eligible_minor`は当該部分のentitlementについてのみ計算する
- 各部分は異なるcommitment rootを持つため、content-addressed hashにより相互に区別される。分割のためにcanonical schemaへ新しいfieldを追加しない

分割は、`MAX_PAYOUT_ENTITLEMENTS_PER_AGGREGATION`を超えるclaimを表現不能にしないために必須である。分割しない実装、又は一部のentitlementを集約から落とす実装は、`ResourceLimitExceeded`として拒否する。

集約対象は、次を全て満たすentitlementに限る。

1. finality delayを経過している。
2. `claimable_minor > 0`。
3. unresolved refund reserve、chargeback reserve、dispute、transfer recoveryが対象額をブロックしていない。
4. entitlementのpayout policyが対象epochで有効である。
5. beneficiary Soulに有効な`BeneficiaryPayoutEligibility`がある、またはeligibility未完了として`held`状態にする。
6. entitlementが既に別のfinalized aggregationに含まれていない。

`PayoutAggregation`では、`gross_claimable_minor`はcommitment rootに含まれる同一Soul・同一通貨・当該epochのclaimable entitlementの合計、`reserved_minor`はactive refund / chargeback / dispute reserveの合計、`transfer_eligible_minor = gross_claimable_minor - reserved_minor`とする。

`transfer_eligible_minor < minimum_aggregation_minor`の場合、aggregationは次epochへcarry forwardする。失効時は既存`PayoutEntitlementPolicy`のnotice、service credit、reserve、forfeitの規則に従う。

実送金: 月次送金は必須の暦月ではなく、policyにより定義された`payout epoch`とする（初期推奨30日）。Payment-Serviceは`PayoutAggregation`が`ready`であり、beneficiaryがpayout-capableであり、reserveを差し引いたtransfer eligible amountが閾値以上の場合に、既存の`PayoutClaimRequest`による明示請求、またはpolicy-authorized batch auto-payoutのいずれかによりStripe Transferを開始できる。auto-payoutを採用する場合も、beneficiaryのopt-inまたは明示許容、transferごとの`BeneficiaryTransferRecord`、idempotency key / transfer group / Stripe source transaction commitment / entitlement commitment rootの記録、および既存の`PayoutRecoveryAction`、reserve、retry window、notice規則を要求する。

#### 18.22.4 返金・チャージバック・異議との関係

ALR entitlementは、通常のseller entitlementと同じく実際の決済最終性に従属する。

1. `PaymentSettlement`がfinality前の場合、`LineageRoyaltySettlement`と各entitlementは`pending_finality`とする。
2. refund request、refund settlement、chargeback、dispute、Stripe reversalが発生した場合、関連するseller / ancestor entitlementを比例的にreserveする。
3. 未払`claimable_minor`が十分なら、まず未払残高からreserve / recoveryを行う。
4. 既にStripe Transfer済みなら、既存`PayoutRecoveryAction`、Stripe Transfer Reversal、platform balance recovery、write-off policyを適用する。
5. 一部返金は、元saleにおける全lineage allocationを同一比率・同一canonical rounding ruleで減額する。
6. chargeback finalizationによりsaleが全面無効になった場合、関連`LineageRoyaltySettlement`は`reversed`とし、未払principalはゼロにする。
7. 返金・回収によっても`paid_minor + reserved_minor + claimable_minor + forfeited_minor = principal_minor`の会計恒等式を保つ。
8. finalityを得た歴史上のallocation objectは削除・書換えず、後続のreversal / recovery objectにより状態を表す。

自己取引・共通本人の扱いは、`AssetLineageRoyaltyPolicy.self_dealing_policy`および`verified_common_identity_policy`に従い、`excluded`または`hold_for_review`とする（第23章）。

### 18.23 GaiaAssetAccessPolicy

`GaiaAssetAccessPolicy`は、複数forumの既に計算済み`AssetScore`を一つのportfolio access valueへ合算する際の、Gaia全体で共通なcross-forum割引係数\(\rho\)だけを定める、Owner threshold認可済みobjectである（第7.8節）。第18.6節の`GaiaNetworkFeeSchedule`、第18.8節の`PayoutEntitlementPolicy`、第18.12.4節の`GaiaServiceCreditPolicy`と同じowner認可policy群に属し、その認可・更新はOwner thresholdによってだけ行われる（第18.16節）。

```text
GaiaAssetAccessPolicy {
  policy_id: Hash,
  network_id: NetworkId,

  policy_version: u64,
  previous_policy_ref_optional: Hash | null,

  cross_forum_discount_ratio: ReducedRational,

  valid_from: Tick,
  valid_until_optional: Tick | null,

  owner_set_commitment: Hash,
  owner_threshold_signatures: [OwnerSignature]
}
```

ここで`ReducedRational`は、既約に正規化された非負整数の分子と正の整数の分母の対を指す。両者は任意精度整数（`BigUIntCanonical`）で表し、浮動小数点、NaN、無限大及び実装依存の丸めを用いてはならない。

`BigUIntCanonical`は、符号なし任意精度整数のcanonical表現である。値は最小長のbig-endian符号なしバイト列として符号化し、先頭に0x00 byteを置かず、値0は1 byteの0x00で表す。長さは値ごとに一意に定まるため、同じ値のcanonical byte列は常に同一であり、この列がhashと署名の対象になる。固定幅整数への変換がoverflowする場合はrejectし、丸めない。\(\rho=1\)、\(\rho\le0\)を禁止する（第7.8節）。

有効条件は次による。

```text
ValidGaiaAssetAccessPolicy(P, t) =
    P.network_id is current network_id
    AND P.valid_from <= t
    AND (P.valid_until_optional is null OR t < P.valid_until_optional)
    AND 0 < P.cross_forum_discount_ratio < 1
    AND VerifyOwnerSetCommitment(P.owner_set_commitment)
    AND VerifyOwnerThresholdSignatures(P)
    AND PolicyVersionChainIsValid(P)
```

`VerifyOwnerSetCommitment`及び`VerifyOwnerThresholdSignatures`は第18.3節の妥当性規則と同じ述語である。`PolicyVersionChainIsValid(P)`は、`previous_policy_ref_optional`がnullであるpolicyまで参照を辿り、各linkで`new.policy_version = previous.policy_version + 1`が成立することと、chain全体で`network_id`が一致することを検証する。

同一時点に複数の有効`GaiaAssetAccessPolicy`が存在してはならない。

```text
For every evaluation time t:
    ActiveGaiaAssetAccessPolicy(t) is unique
```

有効な`GaiaAssetAccessPolicy`を一意に選べない場合、cross-forum `AssetAccess_direct`の主張はfail-closedで拒否する（第3.5節、第7.8節）。

`policy_version`は単調増加しなければならない。

```text
new.policy_version = previous.policy_version + 1
```

新しいpolicyは、その`valid_from`より前の`AssetAccess_direct`、checkpoint、`StateProofEnvelope`、Civic、`AssetScore`、`Candidates`、`Reach`又は既存access grantの意味を遡及的に変更してはならない。第7.14節の`declared_cross_forum_discount_ratio`（当該profileを宣言した時点で有効であった割引係数の凍結値）も、policy更新により変更・再解釈してはならない。

`GaiaAssetAccessPolicy`は、forum内の信頼・成熟・発行権を中央化するpolicyではない。これは、複数forumの既に計算済み`AssetScore`を一つのportfolio access valueへ合算する際の、Gaia全体で共通な減衰係数だけを定める。forum内の`AssetScore`、`A_max`、depth、`Q`、`CanIssue`、`CanIssueTo`、`A_seed`、bonus、Civic、forum genesis、forum root authority、`AssetRecord.value`又はasset access grantを設定・変更しない。

#### 18.23.1 Owner thresholdが変更してはならない値

Owner thresholdは、`GaiaAssetAccessPolicy`を通じて、将来のcross-forum `AssetAccess_direct`の割引係数だけを更新できる。次の値を変更してはならない。

- forum内の`AssetScore`
- `A_max(F)`
- depth
- `Q`
- `CanIssue`
- `CanIssueTo`
- `A_seed`
- EarlyBonus
- CultivationBonus
- CitationBonus
- Resource Contribution Score
- Civic Vote
- CivicCitizen
- forum genesis
- forum root authority
- `AssetRecord.value`
- asset access grant
- 既に確定したcommerce、payment、payout又はentitlement
- forumの`incentive_compatible_profile`の適合性

Owner thresholdの作用範囲は第18.16節の閉じた列挙により定まり、本節の`GaiaAssetAccessPolicy`の認可・更新はその列挙に含まれる。`GaiaAssetAccessPolicy`の更新は、将来の`AssetAccess_direct`の評価にだけ適用する（第7.14節、第18.17節）。

---

## 19. Gaia Commerce

> `ServiceOffer`、`AssetRecord`、PressRoom有料会員、Promotionその他Payment-Serviceを利用する有償objectは、注文時点で固定される`BeneficiaryRule`を持たなければならない。`PaymentReceipt`は支払い成立を、`PaymentSettlement`はStripe実費・Gaia手数料・Forum Revenue Pool contribution・受取人プールを、`PayoutEntitlement`は各Soulの期限付き受取権を表す（第18章、第7.17節）。commerce objectは、`Q`、`depth`、`CanIssue`、`CanIssueTo`、`AssetScore`、`A_seed`、bonus、`Candidates`、`Reach`又はCivic資格の入力にならない。受取人配分規則は販売objectの公開時又はOrder前に固定され、購入後又はOrder作成後に変更してはならない。Forum Revenue Poolの分配資格・ウェイトはdepthを読むが、depthそのものや上記protocol値を変更しない（第7.17節）。

### 19.1 共通の取引基盤

asset access、Gaia Bank、eKYC、Soul recoveryなどに対する利用者課金は、共通のcommerce層を使う。サービスは`ServiceKind`で区別される。

```text
ServiceKind =
  asset_access
  promotion_boost
  pressroom_membership
  bank_storage
  bank_retrieval
  bank_distribution
  soul_recovery
  ekyc_verification
  ekyc_reverification
  ekyc_recovery_attestation
  soul_transfer
  forum_root_transfer
```

PressRoom有料会員、有料ブースト（Promotion）、asset access、Gaia Bank、eKYC、Soul recovery、譲渡決済（Soul Transfer・Forum Root Transfer）その他のPayment-Serviceを利用する有償objectは、対応する`ServiceKind`と`BeneficiaryRule`を持ち、同一のcommerce層で扱う。`soul_transfer`及び`forum_root_transfer`以外のすべての`ServiceKind`は、**Offer → Order → PaymentReceipt → Fulfillment**の四段構造を共有する。この二つの`ServiceKind`では決済前の三段を専用object chainが担い、共有されるのは決済以降の段階だけである。決済後、第18章の`PaymentSettlement`がStripe実費・Gaia維持手数料・受取人プールを確定し、各受取人へ`PayoutEntitlement`を発行する。

`soul_transfer`と`forum_root_transfer`は例外を定める。この二つの`ServiceKind`では、Offer→Order→Fulfillmentの各段階を、専用object chain（`soul_transfer`は第16.7節、`forum_root_transfer`は第5.6節）が担う。決済予約・finalization・異議・解決は当該chainのobjectが表し、通常の`ServiceOffer`・`ServiceOrder`・`ServiceFulfillment`で代替してはならない。一方、決済以降のcommerce段階（`PaymentSettlement`による確定、`PayoutEntitlement`の発行、payout）は他の`ServiceKind`と共通であり、第18章の規則をそのまま適用する（第18.21節）。

受取人配分規則は、販売objectが誰にいくら配分するかを定める`BeneficiaryRule`で表す。

```text
BeneficiaryRule {
  mode:
    "single_beneficiary"
    | "fixed_split",

  beneficiaries: [
    {
      beneficiary_soul_id: SoulId,
      allocation_bps: u16
    }
  ]
}
```

妥当性規則:

```text
beneficiaries is non-empty
all beneficiary_soul_id values are distinct
0 < allocation_bps <= 10000 for every beneficiary
sum(allocation_bps) == 10000
mode == "single_beneficiary" iff beneficiaries.length == 1 and allocation_bps == 10000
```

購入後、又は対象Order作成後に受取人・比率を変更してはならない。`BeneficiaryRule`は注文にcontent hash commitment（`beneficiary_rule_commitment`）として束縛する。AssetRecordによる直接販売、PressRoom有料会員、Promotionその他の販売objectは、販売object自体又はそれを参照する`ServiceOffer`に、同じ意味論の`BeneficiaryRule`を公開時点で明示しなければならない。`BeneficiaryRule`を明示しない販売objectについて、Payment-Serviceは有償Orderを作成してはならない。

```text
ServiceOffer {
  offer_id
  provider_id
  provider_pubkey
  service_kind
  service_spec_commitment
  beneficiary_rule
  price
  currency
  payment_terms
  fulfillment_terms
  refund_policy
  valid_from
  expire

  commercial_offer_kind: direct_origin | authorized_resale | authorized_sublicense | authorized_derivative
  sold_asset_ref: Hash | null
  sold_lineage_node_ref: Hash | null
  commercial_rights_grant_ref: Hash | null
  lineage_royalty_policy_ref: Hash | null
  lineage_royalty_required: bool

  signature
}

ServiceOrder {
  order_id
  buyer_soul_id
  buyer_authority_pubkey
  buyer_soul_epoch
  offer_ref
  target_ref
  quantity
  agreed_gross_amount_minor
  currency
  beneficiary_rule_commitment
  fee_schedule_ref
  payout_entitlement_policy_ref
  forum_id
  forum_revenue_pool_policy_ref
  forum_revenue_pool_rate_bps
  service_parameters_commitment

  commercial_offer_kind: enum
  sold_lineage_node_ref: Hash | null
  origin_lineage_royalty_policy_ref: Hash | null
  lineage_royalty_settlement_commitment: Hash | null

  created_at
  expire
  signature
}

ServiceFulfillment {
  fulfillment_id
  order_ref
  payment_receipt_ref
  provider_id
  fulfillment_state
  service_result_ref
  accepted_at_optional
  completed_at_optional
  failure_reason_code_optional
  signature
}
```

`ServiceOffer.price`、`ServiceOrder.agreed_gross_amount_minor`、`PaymentReceipt.gross_amount_minor`は、いずれも通貨最小単位の非負整数による総額（gross）を表し、同一のOrderについて一致しなければならない。`ServiceOrder`は、作成時点で有効な`fee_schedule_ref`および`payout_entitlement_policy_ref`を明示的に固定する。Payment-Serviceは、その後にOwnerが更新したFeeSchedule又はPolicyを当該Orderに遡及適用してはならない（第18.6節、第18.8節）。対象取引がforum Fへ束縛される場合、`ServiceOrder`はFのgenesisが固定する`forum_revenue_pool_policy_ref`と`forum_revenue_pool_rate_bps`を注文時点で固定する。`ServiceOrder.forum_revenue_pool_rate_bps`は、当該`forum_revenue_pool_policy_ref`が指す`ForumRevenuePoolPolicy`の`contribution_rate_bps`（第7.17.3節）と同一の値であり、第7.17節の`r_F`である。独立した第二の料率を導入せず、`GaiaNetworkFeeSchedule`の料率とも同一視しない。Payment-Serviceは、後から異なるforum Pool policy又はrateを適用してはならず、購入者・販売者も決済後にforum又はPool率を変更してはならない（第7.17節）。

### 19.2 支払いと履行の分離

支払い済みであることは、サービスが履行されたことを意味しない。

\[
PaymentConfirmed(order)\not\Rightarrow ServiceFulfilled(order)
\]

`PaymentState`と`FulfillmentState`は独立である。

```text
PaymentState =
  initiated
  authorized
  paid
  held_in_escrow
  refunded
  reversed
  chargeback_pending
  chargeback_resolved

FulfillmentState =
  pending
  accepted
  active
  completed
  rejected
  unavailable
  disputed
  cancelled
```

Payment-Serviceは支払い、escrow、refund、chargeback、provider payoutを処理する。service providerはサービス固有の履行を署名する。gaia-coreは両方を検証して権利を有効化する。たとえば有料assetでは、`PaymentReceipt`の有効性と`ServiceFulfillment`（または`ContentAccessGrant`）の存在がそろって初めて、アクセス権が確定する（第10.10節）。

### 19.3 金銭と信頼の隔離

次のものは、Q、depth、CanIssue、CanIssueTo、AssetScore、A_seed、EarlyBonus、CultivationBonus、CitationBonus、Candidates、Reach、およびForumStateCheckpoint最終性の入力になってはならない。

- `PaymentReceipt`、`PaymentSettlement`、`PayoutEntitlement`、`PayoutClaimRequest`、`BeneficiaryTransferRecord`、`BeneficiaryPayoutReceipt`、`RefundSettlement`、`PayoutRecoveryAction`、`GaiaServiceCreditGrant`、`ForumPoolContributionRecord`、`ForumRevenuePoolDistribution`、`ForumPoolUndistributedForfeiture`、`ServiceOffer`、`ServiceOrder`、`ServiceFulfillment`
- Bankの売上、返金、escrow
- eKYC tierの変化
- provider payout、refund、chargeback、payout eligibilityの有無・金額

これにより、金銭で成熟度、信用、発行権、創設能力を買う経路を禁止する（第7.16節）。

### 19.4 Commerce objectの受理

- `ServiceOrder`の買い手は、そのSoulの唯一のactive bodyであり、有効な`SoulEpochLease`と`TemporalHealthLease`を持たなければならない（第1.2節のゲート）。
- `ServiceFulfillment`のproviderは、約束した`service_kind`について必要な資格を持つ（無償は資格不要、有償・責任付きは第20章・第21章のcredential）。
- `PaymentReceipt`の検証は第18.4節のとおり、認可chainと焼き付けOwner setに対して行う。
- gaia-coreは、支払い・履行のobjectを受け取ったら、対象・購入者・金額・通貨・期間・用途の束縛を検証する。他対象への転用は拒否する。

### 19.5 この層が扱わないもの

commerce層のobjectは、証明書の発行資格、Q-set、asset registry、seed registry、checkpointの状態遷移を直接変更しない。commerce層は「支払いと履行の事実」を扱い、forumの信頼計算は扱わない。

Soul Transfer及びForum Root Transferと共通commerce層の関係を明記する。

- Soul Transfer及びForum Root Transferは、通常のサービス提供ではなく、専用の高リスク譲渡プロトコルである。
- 必要なら、payment order生成だけを`ServiceOrder`と接続してよいが、`ServiceOrder`の存在だけで譲渡合意・eKYC・freeze・finalizationを代替してはならない。
- Asset publisher contract、storage contract、Bank service contract、commercial offer等を譲渡scopeに含める場合、各契約の譲渡可否、相手方同意、再KYC、provider署名、noviation objectを個別に要求する。
- 契約参照を列挙しただけで契約相手の義務を新主体に移転したとみなしてはならない。

`SoulTransferScope`（第16.7.1節）では、次の原則を明記する。

> Gaia protocolが承継できるのは、Gaia object上で明示され、かつ当該権利・契約が譲渡可能と定義された範囲だけである。法的契約、知的財産権、雇用関係、第三者ライセンス、個人情報処理契約、現実資産の譲渡を、Gaia objectだけで当然に完結させると主張してはならない。

### 19.6 Resale / Sublicense / Derivative commerce

本仕様では、`ServiceOffer`の`commercial_offer_kind`として次を区別する。

- `direct_origin`: origin assetの公開者（provider）が、origin contentへのアクセス・利用許諾を直接販売する通常の販売。ALRを有効にするorigin assetでは`lineage_royalty_policy_ref`を伴う。
- `authorized_resale`: 有効な`AssetRightsGrant`に基づき、元assetのコンテンツ同一性を維持した正規のアクセス・利用許諾を他者へ販売する。
- `authorized_sublicense`: 権利者が自らの許諾範囲内で、下流への利用・販売権限を許諾する販売。
- `authorized_derivative`: 親assetの許諾に従い、翻訳・編集・拡張・変形・統合等を行った派生assetの販売。

規則:

- `service_kind = asset_access`かつ`lineage_royalty_required = true`のofferは、必ずALR対象asset / lineage node / grantを参照する。
- `authorized_resale`、`authorized_sublicense`、`authorized_derivative`は、有効な`AssetRightsGrant`と`AssetLineageRoyaltyPolicy`を必要とする。
- offer providerはseller Soulと一致し、現時点のauthority / Soul epoch / temporal healthを通らなければならない。
- `BeneficiaryRule`は直接のsellerと他の固定受益者を示せるが、ALR対象offerについてはPayment-Serviceが最終beneficiary ruleを`LineageRoyaltySettlement`に従って展開する（第18.22節）。
- sellerはorigin policyを隠す・置換する・偽のpolicy refを提示することはできない。
- grantの`scope_forum_id`がnon-nullの場合、そのforumと許容されたdescendants以外ではgrantを用いたofferをrejectする（第23章の`ValidCommercialRights`）。
- 各offerの受理は、第7.18節のlineage要件、`AssetRightsGrant`の有効性、`AssetCommercialRightsPolicy`の許可、および`ValidCommercialRights`述語に従う。access grantのみを根拠としたresale / sublicense / derivative offerはrejectする。
- ALR非対応（`lineage_royalty_policy_ref = null`）のasset / offerは、既存の非ALR動作を維持する。

### 19.7 Marketing action の実行条件とatomicity

`ExecutableMarketingPlan`（第12.9節）の各`MarketingActionStep`について、action kind別の実行条件を以下に定める。いずれも実行時に既存protocol objectとacceptance predicateを通す。

- **Asset announcement**: `createassetannouncement`が`executable_now`になる条件は、requesterがasset publisherまたは正規なannouncement authority、assetがactive、target forumが存在しannouncement policyが許す、requesterが`CanAnnounce`（第10.2節。`AnnouncementRateLimitAvailable`を含むが、公開score閾値の到達を含まない）を満たす、target forumへの商用権利 / resale / sublicense / derivative grant scopeが有効、Soul authority・SoulEpochLease・TemporalHealthLease・NotTransferLockedが有効、であること。実行時は`AssetAnnouncement` draftを完成・署名し、既存acceptance predicateを通す。
- **Promotion purchase**: `purchasepromotion`は、有効なAssetAnnouncement、promotion policy / price / currency / payment rail / Payment-Serviceが有効、requesterが支払権限を持ちPaymentIntent作成可能、emergency payment suspensionがない場合に`executable_now`となる。これは支払完了を保証しない。最終状態は`payment_pending` → `paid` → `PromotionGrant active`と遷移することをUIに明示する。
- **Community certificate request / issue**: requesterが他者へcertificateを求めるactionは`requestable_now`。issuer本人がcertificateを発行するactionは、`CanIssueTo`、authority、health、lease、rate limit、transfer lock、subject active stateを実行時再検証して通る場合のみ`executable_now`。
- **Forum join**: applicantによる入会requestは`requestable_now`。issuerがcertificateを発行すること、membershipがcheckpointへ反映されることはexternal / future state dependency。既にopen automatic membershipを持つforumで追加の外部承認が不要な場合だけ`executable_now`を許す。
- **Child forum creation**: `createchildforum`は、requesterにchild genesis作成authorityがあり、全parent forum evidence、parent checkpoint freshness、SeedAllocation origin lot、unspent budget、allocation sequence、seed cap、initial asset / operating-work requirementが揃う場合に`executable_now`。同時allocation競合を避けるため、child genesis作成直前に親のseed allocation chainを再検証する。required parent consent / issuanceがある設計なら、未取得の場合は`external_consent_required`または`requestable_now`。
- **Commercial expansion**: authorized resale / sublicense / derivative offerを別forumへ出すactionは、valid `AssetCommercialRightsPolicy`、valid `AssetRightsGrant`、grant scope_forum_id / descendant_forum_only / max_remaining_depthを満たし、origin royalty policyとasset lineage nodeが正しく、target forumのoffer / announcement policyを満たし、`lineage_royalty_required`のofferが必要な`LineageRoyaltySettlement`参照を生成できる場合に`executable_now`。通常の`ContentAccessGrant` / `AssetAccessGrant`だけからこのactionを`executable_now`としてはならない。
- **Discovery / index availability**: `refreshdiscoverymetadata`、`enableindexdistribution`は、公開metadataの更新権限、storage / index policy、receipt / audit条件を満たす場合だけexecutable classを得る。indexの提供は個別広告送信権を与えない。

互いに依存するactionは`MarketingActionBundle`として束ねられる。ただし、Stripe payment、他者のcertificate発行、外部recipientのdelivery receipt等、同一トランザクションに原子的に含められないイベントは`staged`にし、各段階の失敗・取消・refund・revalidationを明示する。`all_or_nothing`を、外部決済や外部同意について虚偽に主張してはならない。canonical schemaは第22章に定める。

---

## 20. 統合Gaia Bank

### 20.1 一つの保管体験と、その内部

利用者に見える保管・同期・復元のサービスは、**Gaia Bank**の一つだけである。利用者はCert-Bank、Asset-Bank、checkpoint store、backup shard storeを区別する必要がない。

内部では、Gaia Bank protocolがobject typeとstorage profileに応じて、暗号化、冗長化、retention、retrievability proof、provider選択を行う。

```text
GaiaBankObjectClass =
  certificate
  state_proof
  checkpoint
  encrypted_asset
  key_envelope
  soul_recovery_shard
  device_binding
  payment_receipt
  health_record
  provider_metadata
```

```text
GaiaBankStorageProfile =
  personal_soul_backup
  normal_sync
  long_term_archive
  asset_distribution
  forum_archive
  high_availability
```

### 20.2 Permissionlessなprovider

誰でも`gaia-core bank serve`によってGaia Bank providerを運営できる。providerの開始、無償保存、無償relay、無償pin、無償のcertificate/cache配布について、Owner、Payment-Service、Soul-Bank、eKYCの事前許可を要求してはならない。

```text
GaiaBankProviderAdvertisement {
  provider_id
  operator_soul_id
  operator_pubkey
  endpoint_set
  supported_object_classes
  max_object_size
  storage_capacity
  retention_classes
  pricing_schedule
  payment_requirements
  availability_policy
  operator_credential_ref_optional
  created_at
  expire
  signature
}
```

GaiaBankProviderAdvertisement.endpoint_setにnode間endpointを載せる場合は、第29.2節の`GaiaTransportEndpoint`を用いる。既知provider Soul、署名者authority及びDeviceIncarnationとの対応を広告の署名と新TimeHandshakeで検証する。DeviceId、address候補、relay経路及び接続状態は可変な到達性情報又はtransport identityであり、Gaiaのidentity、consensus、finalityのauthorityではない。

`endpoint_set`の既存フィールド名は維持する。新規objectのnode間entry型は`GaiaTransportEndpoint`であり、これは独立署名objectではなく署名済みadvertisement内の構造化fieldである。既存のcontent-addressed objectをin-placeで書換え・再署名・再hashしない。保存物は保存時bytesで検証する。現在通信に使えないentryはroute unavailableとして扱い、保存objectをretroactiveに無効化しない。

### 20.3 有償・責任付きのprovider

次の能力は、Owner-authorized eKYC providerが発行した有効な`CommercialBankOperatorCredential`を持つoperatorだけが提供できる。

- 有償のstorage contract
- Gaia Payment-Serviceによるprovider payout
- 返金・escrow・SLA付きの保管
- high availability profile
- Soul recovery shard custody
- regulated data custody

```text
CommercialBankOperatorCredential {
  credential_id
  subject_soul_id
  subject_provider_id
  operator_tier
  jurisdiction_scope
  permitted_bank_capabilities
  issued_at
  expire
  revocation_ref
  issuer_ekyc_service_authorization_ref
  signature
}
```

無償のproviderはcredentialなしで動作できるが、Gaia標準の有償保証・返金・Soul recovery custodyを主張してはならない。

> Gaia Bank providerの有償保存・配布等については、`PaymentReceipt`だけでなく、必要に応じて`PaymentSettlement`、`PayoutEntitlement`、refund/dispute状態を参照する。有償の法定通貨受取は、第18章の期限付き`PayoutEntitlement`及びStripe payout手続に従う。Gaia Bank providerがStripe Connected Accountを持てない場合でも、Bank providerとしての通常の技術機能・無償提供・P2P配布機能は排除されない。

### 20.4 StorageContract

有償保存の契約は、次のobjectで表す。

```text
StorageContract {
  contract_id
  customer_soul_id
  provider_id
  object_manifest_root
  storage_profile
  retention_until
  replication_requirement
  price
  currency
  payment_receipt_ref
  payment_authority_set_commitment
  provider_operator_credential_ref_optional
  provider_signature
  customer_signature
}

StorageAcceptanceReceipt {
  storage_contract_ref
  accepted_manifest_root
  accepted_at
  retention_until
  proof_schedule
  provider_signature
}
```

### 20.5 Retrievability

保存の確認は、providerが挑戦時点に指定chunkを返せることを確かめる。

```text
StorageChallenge {
  contract_id
  object_hash
  challenge_nonce
  chunk_index_or_range
  issued_at
  expire
  challenger_signature
}

StorageAvailabilityProof {
  contract_id
  challenge_hash
  object_hash
  chunk_data_or_commitment
  chunk_merkle_proof
  responded_at
  provider_signature
}
```

`StorageAvailabilityProof`は、挑戦時点に指定chunkを返せたことだけを示す。未来の永続保存を保証するものではない。high availability profileは、複数operator、地域、クラウド、AS、法域の多様性条件を指定できなければならない。

### 20.6 セキュリティ境界

Gaia Bank providerはbytesを保存・配送するだけである。providerはcertificate validity、Q、depth、AssetScore、A_seed、asset access、Soul active state、eKYCの有効性を裁定してはならない。

Bankから取得したdataは**未検証bytes**とする。gaia-coreはhash、ML-DSA-65署名、Merkle proof、checkpoint、`SoulEpochLease`、`TemporalHealthLease`、必要なcommerce objectを検証してから使用する。「Bankが渡したから正しい」は存在しない。

Soul Transfer後のBank・Storage契約について、次を追加する。

- Soul Transfer後に旧controllerが保存物・復旧素材・暗号鍵封筒・Bank provider credentialsへアクセスし続けないよう、譲渡scopeに含めるBank/Storage契約はprovider再同意と新controller向け暗号鍵再包封を必要とする。
- `StorageContract`のcustomer Soulが変わらない場合でも、controllerが変わるなら、providerは新controllerのeKYC、SoulTransferFinalization、新authorityを検証したうえで新しいアクセスcredentialを発行する。
- 旧controller向け`KeyEnvelope`は、譲渡後の保護対象コンテンツについて自動的に安全でなくなるため、必要な場合はコンテンツ鍵をローテーションし、新controllerだけへの新`KeyEnvelope`を作る。
- ただし、暗号文を既に取得した旧controllerから過去の平文知識を消去できるとは主張してはならない。
- forum root succession後のBank provider registry更新は、ForumRootSuccessionのfinalized root authority chainを要求する。

### 20.7 Gaia Storage（分散保存の正式統合）

本仕様は、暗号文object、manifest、receipt、index segmentの保存・複製・配布・修復を行うP2P storage layerとして**Gaia Storage**を正式統合する。本節のobjectのcanonical schemaは第22.5節、受理条件は第20.7.3節〜第20.7.7節及び第24.13節、reject codeは第22.2節に定める。

#### 20.7.1 信頼境界

gaia-networkは認証済みDeviceIdへの到達性、NAT traversal、暗号化relay、HTTP配送を提供する。address候補、descriptor、tag、peer inventory、上位liveness観測、検索index、storage advertisementはstorageの信頼根ではない。gaia-networkはSWIM、peer全列挙、inventory同期又はplacementを提供しない。必要な上位観測をdurable receiptやaudit成功の代替にしてはならない。

Gaia Storageの正当性は、canonical manifest、content-addressed ciphertext hash、signature、ACL / certificate、`StorageReceipt`、`StorageAudit`、distinct failure domain、`StateProofEnvelope`によって判断する。

#### 20.7.2 ノード参加モード

既存Gaia nodeは以下のstorage participation modeを持てる。

| mode | 他者の暗号文保存 | durable quorum | index segment | repair target |
|---|---:|---:|---:|---:|
| `read_only` | 不可 | 不可 | local only | 不可 |
| `contributor` | quota内で可 | 原則不可 | cache可 | best effort |
| `durable` | reservation内で可 | 可 | durable可 | 可 |

重要規則:

- modeは「役割の意思表示」であり、容量の自己申告ではない。
- `total_bytes`、`free_bytes`、`reserved_bytes`、GPU台数、CPUコア数、VRAM、FLOPS等をゲームscoreの直接入力にしない。
- durable receiptは`durable` nodeだけが発行できる。
- contributor cache receiptはcritical metadata / strict durable quorumに算入しない。

#### 20.7.3 容量自己申告の排除

StorageAdvertisementまたは本仕様で新設するadvertisementから、ゲーム・placement・報酬の根拠として使われる自己申告`total_bytes` / `reserved_bytes`を削除またはinformational-onlyとする。

容量に関する唯一の有効な証拠は以下である。

1. object / stripe / fragment単位の署名済み`StorageReservationGrant`
2. hash検証、fsync、atomic publish、durable metadata commit後の署名済み`StorageReceipt`
3. 期限内の`StorageAuditResult`またはverified read
4. distinct failure-domain predicate

#### 20.7.4 StorageReservationGrant

nodeはlocal reserved area、quota、既存予約、minimum free space、high watermark、in-flight budgetを原子的に確認してから`StorageReservationGrant`を発行する。空きがなければ`InsufficientReservedCapacity`として拒否する。reservation TTL経過またはabortにより未使用予約を解放する。`StorageReservationGrant`単独はdurable storage contributionではない。

#### 20.7.5 StorageReceipt

`StorageReceipt`は次を完了するまで発行禁止。

1. ciphertext / object hash検証
2. temp write
3. fsync
4. atomic rename / durable publish
5. local metadata transactionのdurable commit
6. quota / reservation accounting更新

`ENOSPC`、hash mismatch、timeout、署名不正、reservation mismatchの場合receiptを発行してはならない。

#### 20.7.6 StorageAudit

audit成功はobjectの暗号文hash / manifestと照合して初めて有効とする。SWIM alive、ping、自己申告inventoryはaudit成功の代替ではない。audit failureはat-risk / repairを起動し、該当寄与を失効・減衰させる。

#### 20.7.7 複製・EC・修復

以下を本仕様の初期規範とする。

- critical metadata、`EncryptedFileManifest`、ACL / certificate、receipt set、`DiscoveryIndexManifest`はdistinct durable failure domainへstrict R=3。
- small ciphertext objectはdurable R=3。
- large immutable ciphertext fileはstripe単位R=3を初期標準とする。
- Reed–Solomon ECは、十分なdistinct durable failure domainがある場合だけ有効化する。最初はRS(4,2)、RS(6,3)は9独立domain未満で禁止。
- repairは常にadditiveに開始する。suspicion / partition / temporary failureを理由に既存replicaを即時削除しない。
- GCはvalid replacement receipt、retention grace、tombstone authority、active references non-existenceを満たすまでdurable dataを削除してはならない。

---

## 21. 事業者eKYCとoperator資格

### 21.1 なぜ事業者資格が必要か

他者へ料金を課すBank provider、Soul recovery custodian、eKYC credential issuerは、現実世界の責任主体として確認されなければならない。本人性・事業者性・法域・監査の約束を、匿名の公開鍵だけでは担わせられないからである。

そこで、有償・責任付きの機能を担うoperatorには、Owner-authorized eKYC providerが発行した有効な**operator credential**を必須とする。資格が高いことはGaiaの関係ネットワーク上の優越性を意味しない。金銭、個人情報、復旧、保管義務を扱う**外部責任の資格**である。

### 21.2 Root eKYC provider

root eKYC providerは、Owner threshold authorizationにより初回認定される。

```text
RootEkycProviderAuthorization {
  root_ekyc_service_id
  operator_soul_id
  operator_legal_entity_commitment
  allowed_assurance_levels
  jurisdiction_scope
  audit_requirements
  authorization_epoch
  owner_threshold_signatures
}
```

root eKYC providerの自己eKYCは禁止する。root自身の確認には、少なくとも別のroot eKYC provider、またはOwnerが定める外部監査・法的登録・厳格な本人確認を要求する。

譲渡eKYC用のprovider authorizationに必要なscopeを追加する。

- Soul transfer identity binding issuance
- Forum root transfer identity binding issuance
- Transfer distinctness assertion issuance
- Beneficial owner / related-party scope assertion issuance（最小開示）
- Transfer-specific credential revocation state issuance

Root eKYC provider又はeKYC serviceが、譲渡価格・譲渡の経済的価値・maturity/asset/Civic計算を裁定しない禁止を再掲する。

### 21.3 OperatorTier

operatorの資格は、次のtierで表す。

```text
OperatorTier =
  free_operator
  commercial_storage_operator
  high_availability_operator
  soul_recovery_custodian
  regulated_data_custodian
  ekyc_operator
  root_ekyc_operator
```

- `free_operator`は、無償のstorage・relay・pin・cache配布を、credentialなしで行える（第20.2節）。
- `commercial_storage_operator`は、有償storage contract、返金・escrow・SLA、provider payoutを提供できる（第20.3節、第20.4節）。
- `high_availability_operator`は、複数operator・地域・AS・法域の多様性条件を満たす高可用性profileを提供できる。
- `soul_recovery_custodian`は、Soul recovery shardのcustodyを担える（第16章の喪失転生と連携する）。
- `regulated_data_custodian`は、規制対象のデータ保管を担える。
- `ekyc_operator`は、Owner-authorizedなeKYC serviceの下でcredentialを発行できる。
- `root_ekyc_operator`は、root eKYC providerとして他のoperatorを認定できる。

各tierの上限（上位tierが下位の能力を自動的に含むかどうかを含む）は、`EkycServiceAuthorization`または`CommercialBankOperatorCredential`の`permitted_*`で明示する。資格の濫用、自己発行、同一支配主体への発行は禁止する（第17.3節）。

---

## 22. object型とエラーコードの総覧

### 22.1 通常証明書以外のobject型

通常証明書は`root_entry`、`community`、`reciprocal`、`citation`の四種類だけであり、`certificate_kind`に新しい値を追加してはならない（第3.1節）。それ以外の状態・権利・支払い・健康・Soul・商用のobjectは、それぞれ独立した不変object型として扱う。

第3.1節の表に加えて、本書が新たに導入するobject型の定義場所は次のとおりである。

| object型 | 定義 |
|---|---|
| `VerifiedTimeInterval`、`TimeHandshake`、`TimeAttestation`、`TemporalHealthObservation`、`TemporalHealthLease` | 第14章 |
| `TimeWitnessPolicy` | 第14.4節・第22.10節 |
| `DeviceIncarnation`、`AuthorityForkEvidence` | 第15章 |
| `SoulRecord`、`SoulEpochLease`、`NormalSuccessionIntent`、`LostBodySuccessionRequest` | 第16章 |
| `IdentityBindingCredential`、`RecoveryEligibilityCredential`、`EkycServiceAuthorization` | 第17章 |
| `ForumEkycParticipationProof`、`ForumMembershipEkycRenewal` | 第17章 |
| `PaymentAuthoritySet`、`PaymentServiceAuthorization`、`GaiaNetworkFeeSchedule`、`PayoutEntitlementPolicy`、`BeneficiaryPayoutEligibility`、`PaymentSettlement`、`PayoutEntitlement`、`PayoutClaimRequest`、`BeneficiaryTransferRecord`、`BeneficiaryPayoutReceipt`、`GaiaServiceCreditPolicy`、`GaiaServiceCreditGrant`、`PayoutEntitlementNotice`、`PayoutEntitlementExpiration`、`RefundSettlement`、`PayoutRecoveryAction`、`EmergencyPaymentSuspension`、`PayoutDeadlineExtension`、`GaiaServiceCreditExpiration` | 第18章 |
| `ForumPoolContributionRecord`、`ForumRevenuePoolDistribution`、`ForumPoolUndistributedForfeiture` | 第7.17節 |
| `MaturityBondPolicy` | 第7.6.1節 |
| `ResourceContributionPolicy` | 第7.19.4節 |
| `ServiceOffer`、`ServiceOrder`、`ServiceFulfillment` | 第19章 |
| `GaiaBankProviderAdvertisement`、`CommercialBankOperatorCredential`、`StorageContract`、`StorageAcceptanceReceipt`、`StorageChallenge`、`StorageAvailabilityProof` | 第20章 |
| `RootEkycProviderAuthorization` | 第21章 |
| `EkycRevocationState` | 第17章 |
| `SoulTransferAgreement`、`SoulTransferFreeze`、`SoulTransferFinalization`、`SoulTransferDispute`、`SoulTransferResolution`、`SoulTrustEpochTransition` | 第16章 |
| `SoulTransferPaymentReservation` | 第16.7.3節 |
| `TransferPaymentReleaseAuthorization` | 第18.21節 |
| `ForumRootTransferAgreement`、`ForumRootTransferFreeze`、`ForumRootSuccession`、`ForumRootTransferDispute`、`ForumRootTransferResolution` | 第5章 |
| `TransferDistinctnessCredential` | 第17章 |
| `AssetCommercialRightsPolicy`、`AssetLineageRoyaltyPolicy`、`AssetRightsGrant`、`AssetLineageNode` | 第7章 |
| `LineageRoyaltySettlement`、`PayoutAggregation` | 第18章 |
| `GaiaAssetAccessPolicy` | 第18.23節 |
| `AssetDiscoveryRecord`、`PublicAccessConditionPolicy`、`ForumDiscoveryRecord` | 第10章 |
| `DiscoveryIndexManifest` | 第10章・第20章 |
| `DiscoveryServiceObservation` | 第7章 |
| `StorageReservationGrant`、`StorageReceiptV2`、`StorageAuditChallenge`、`StorageAuditResult` | 第20章 |
| `CiphertextChunk`、`EncryptedFileManifestV1`、`KeyEnvelopeV2` | 第10章 |
| `ComputeCapabilityAdvertisement`、`ComputeJob`、`ComputeResult`、`ComputeVerification` | 第7章 |
| `ExecutableMarketingPlan`、`MarketingActionStep` | 第12章 |
| `AdvertisementDeliveryPolicy`、`AdvertisementDelivery` | 第10章 |
| `MarketingActionBundle` | 第19章 |
| `HeatStabilizerPolicy`、`HeatObservation`、`HeatStateTransition`、`HeatInterventionDecision`、`HeatStabilizerConfiguration`、`HeatStabilizerRollback` | 第12章 |
| `AssetPublicationEvidence`、`AssetCitationContribution`、`AssetMediatedCultivationContribution`、`PublicationDemandObservation`、`PublicationContributionState`、`AssetPublicationIncentivePolicy` | 第7.21節 |
| `CoreOperation`、`CoreOperationRequest`、`CoreOperationReceipt`、`OperationEvent`、`SessionBinding`、`VerifiedExternalCallbackEnvelope` | 統一手続き節 |
| `TimeHandshakeBegin`、`TimeHandshakeResponse`、`TimeHandshakeComplete`、`SessionBindingConfirmation` | 第14.3節・第29.2節（inline transcript payload型。独立した新署名objectでも新registryでもない） |
| `LogicalOperationIntent` | 統一手続き節・第29.8節（独立署名objectではなくcanonical projection型） |
| `GaiaTransportEndpoint` | 第29.2節（独立署名objectではなく、署名済みGaia advertisement又はTimeHandshake transcript内の構造化field型） |
| `CivicBallot`、`NeedSubmission`、`NeedMergeProposal`、`NeedMergeAttestation`、`NeedMergeFinalization`、`NeedSplitChallenge`、`NeedSplitFinalization`、`CivicEpochBlock`、`CivicPrevote`、`CivicPrecommit`、`CivicFinalityCertificate`、`CivicVoteSeenReceipt`、`CivicValidatorAvailabilityCommitment`、`CivicNeedAsset` | 第23章・第22.9節 |

これらのobjectはすべて、canonical encoding、content hash、ML-DSA-65署名を備え、必要な検証バンドル（`StateProofEnvelope`）と共に配布される。第3.1節で一覧した既存のobject型（ProtectedContent、ContentAccessGrant、KeyEnvelope、AssetRecord、PaymentReceipt、MaturityBond、RootLedgerEntry、SeedAllocation、ForumStateCheckpoint、StateProofEnvelope、ForumStatePayload、ForumStateAttestation、AssetAnnouncement、PromotionGrant、PressRoom、PressRoomMembershipGrant、PressReleasePackage、LocalActionRecommendation、EcologicalViabilityReport）も、このまま維持される。第18章が定義する決済・清算・分配・期限失効のobject型（`GaiaNetworkFeeSchedule`、`PayoutEntitlementPolicy`、`BeneficiaryPayoutEligibility`、`PaymentSettlement`、`PayoutEntitlement`、`PayoutClaimRequest`、`BeneficiaryTransferRecord`、`BeneficiaryPayoutReceipt`、`GaiaServiceCreditPolicy`、`GaiaServiceCreditGrant`、`PayoutEntitlementNotice`、`PayoutEntitlementExpiration`、`RefundSettlement`、`PayoutRecoveryAction`、`EmergencyPaymentSuspension`、`PayoutDeadlineExtension`、`GaiaServiceCreditExpiration`）も、同じcanonical encoding、content hash、ML-DSA-65署名を備え、必要な検証バンドルと共に配布される。第7.17節が定義するForum Revenue Poolのobject型（`ForumPoolContributionRecord`、`ForumRevenuePoolDistribution`、`ForumPoolUndistributedForfeiture`）も同様に配布・検証される。第5章・第16章・第17章・第18章が定義するSoul Transfer／Forum Root Successionのobject型（`SoulTransferAgreement`、`SoulTransferFreeze`、`SoulTransferPaymentReservation`、`SoulTransferFinalization`、`SoulTransferDispute`、`SoulTransferResolution`、`SoulTrustEpochTransition`、`ForumRootTransferAgreement`、`ForumRootTransferFreeze`、`ForumRootSuccession`、`ForumRootTransferDispute`、`ForumRootTransferResolution`、`TransferPaymentReleaseAuthorization`、`TransferDistinctnessCredential`）も、同じcanonical encoding、content hash、ML-DSA-65署名を備え、必要な検証バンドルと共に配布・検証される。第7章・第18章が定義するAsset Lineage Royaltyのobject型（`AssetCommercialRightsPolicy`、`AssetLineageRoyaltyPolicy`、`AssetRightsGrant`、`AssetLineageNode`、`LineageRoyaltySettlement`、`PayoutAggregation`）も、同じcanonical encoding、content hash、ML-DSA-65署名を備え、必要な検証バンドルと共に配布・検証される。第7章・第10章・第20章が定義する本仕様のDiscovery・Storage・暗号化・Resource Contribution object型（`AssetDiscoveryRecord`、`PublicAccessConditionPolicy`、`AccessEligibilityQuote`、`ForumDiscoveryRecord`、`DiscoveryIndexManifest`、`DiscoveryServiceObservation`、`StorageReservationGrant`、`StorageReceiptV2`、`StorageAuditChallenge`、`StorageAuditResult`、`CiphertextChunk`、`EncryptedFileManifestV1`、`KeyEnvelopeV2`、`ComputeCapabilityAdvertisement`、`ComputeJob`、`ComputeResult`、`ComputeVerification`）も、同じcanonical encoding、content hash、ML-DSA-65署名を備え、必要な検証バンドルと共に配布・検証される。

gaia-networkの`PublicDescriptor`、`RelayGrant`、`RelayDecision`、`FindResult`、`NetworkStatus`、`ErrorCode`、`DeliveryState`、`TransportBindingId`、`AuthenticatedTransportContext`、`DeviceHandle`及び`Network`はパッケージ型であり、Gaiaの署名済みobject一覧に含めない。これらは第28章が所有し、Gaia objectのcanonical hash、content addressing、ML-DSA-65署名、`StateProofEnvelope`依存閉包の対象ではない。`GaiaTransportEndpoint`、`LogicalOperationIntent`、`TimeHandshakeBegin`、`TimeHandshakeResponse`、`TimeHandshakeComplete`及び`SessionBindingConfirmation`は、独立した署名objectではなく、署名済みGaia advertisement、`TimeHandshake`又は`SessionBinding`の内部に現れる構造化field又はprojection型である。`ErrorCode`、`NetworkError`及びHTTP statusは`ProtocolReject`と別の型であり、同一enum又は同一成功条件として扱わない（第29.8節）。

### 22.2 エラーコード

実装は、既存のエラーコードに加えて、少なくとも次を追加する。これらは通常authorityゲート、時刻健全性、Soul、eKYC、Payment-Service、Bank、Stripe固定決済・清算・分配・期限失効の検証に対応する。

```text
FutureTimestamp
IndeterminateTemporalOrder
TemporalUnverifiable
TemporalHealthViolation
MissingTemporalHealthProof
ExpiredTemporalHealthLease
IssuerTimeUnhealthy
InvalidSoulEpochLease
ExpiredSoulEpochLease
DuplicateActiveIncarnation
IncarnationFork
AuthorityFork
InvalidDeviceBinding
InvalidAuthorityOperationSequence
SuccessionContested
UnauthorizedSuccession
RecoveryCooldownActive
InvalidRecoveryEligibilityCredential
UnauthorizedCommercialBankOperator
InvalidPaymentServiceAuthorization
UnsupportedPaymentAuthoritySet
InvalidStorageContract
StorageProofFailed

MissingIdentityBindingCredential
MissingEkycNonRevocationProof
InvalidEkycSoulBinding
InvalidEkycUniquenessScope
RevokedEkycCredential
InvalidCivicBallot
InvalidCivicBallotAllocation
InvalidNeedSubmission
InvalidCivicTally
InvalidWildSignalNormalization
InvalidCivicNeedAsset
CivicNeedNotOpenForSupply
UnauthorizedCivicNeedPublisher
CivicVoteEpochMismatch
CivicVoteCheckpointMismatch

ForbiddenTargetDepthField
LegacyTargetDepthCertificate
SubjectNotActiveMember
IssuerNotMoreMature
InvalidCommunityIssuanceContext
CheckpointMismatchForCommunityRequest
CommunityProjectionUsedAsConsensus
InvalidSeedAllocationSequence

UnsupportedPaymentRail
InvalidStripePaymentServiceAuthorization
MissingGaiaNetworkFeeSchedule
InvalidGaiaNetworkFeeSchedule
InactiveGaiaNetworkFeeSchedule
FeeScheduleRetroactivityViolation
OverlappingFeeTier
GappedFeeTier
InvalidCurrencyMinorUnit
UnsupportedSettlementCurrency
MissingPayoutEntitlementPolicy
InvalidPayoutEntitlementPolicy
InactivePayoutEntitlementPolicy
PayoutPolicyRetroactivityViolation
InvalidBeneficiaryRule
BeneficiaryAllocationSumMismatch
BeneficiaryAllocationDuplicateSoul
InvalidPaymentSettlement
StripeSettlementMismatch
MissingActualStripeFee
NegativeNetAfterStripe
NegativeBeneficiarySettlement
InvalidPayoutEntitlement
MissingPayoutEligibility
ExpiredPayoutEligibility
PayoutEligibilityMismatch
PayoutNotCapable
PayoutClaimExpired
DuplicatePayoutClaim
DuplicateBeneficiaryTransfer
InvalidBeneficiaryTransfer
InvalidBeneficiaryPayoutReceipt
TransferPayoutStateMismatch
InvalidRefundSettlement
InvalidPayoutRecoveryAction
PayoutExpirationBlocked
InvalidPayoutEntitlementExpiration
InvalidGaiaServiceCreditPolicy
InvalidGaiaServiceCreditGrant
ExpiredGaiaServiceCredit
ForbiddenCreditTransfer
ForbiddenCreditFiatRedemption
ForbiddenCreditCryptoRedemption
ForbiddenCreditMaturityUse
InvalidEmergencyPaymentSuspension
InvalidPayoutDeadlineExtension

MissingForumRevenuePoolPolicy
InvalidForumRevenuePoolPolicy
ForumRevenuePoolPolicyMismatch
ForumRevenuePoolDisabled
InvalidForumRevenuePoolRate
InvalidForumPoolEligibleDepth
InvalidForumPoolWeightExponent
InvalidForumPoolDistributionEpoch
InvalidForumPoolCurrencyCap
ForumPoolContributionScopeMismatch
ForumPoolContributionExceedsBeneficiaryRemainder
ForumPoolLifetimeCapExceeded
ForumPoolCarryForwardExpired
InvalidForumPoolContributionRecord
ForumPoolSelfPurchaseExcluded
ForumPoolVerifiedCommonIdentityExcluded
InvalidForumRevenuePoolDistribution
ForumPoolEvaluationCheckpointMismatch
ForumPoolEligibilityProofMissing
ForumPoolDepthProofInvalid
ForumPoolAllocationMismatch
ForumPoolRemainderAllocationMismatch
ForumPoolIndividualCapExceeded
ForumPoolConservationViolation
InvalidForumPoolUndistributedForfeiture
ForumPoolForfeitureMismatch

MissingIdentityPublicKey
SoulIdIdentityPublicKeyMismatch
InvalidIdentitySignature
InvalidAuthoritySignature
InvalidDeviceIncarnationBinding
InvalidAuthoritySoulBinding
IdentityPublicKeyChangedForSoul
IdentityPublicKeyMismatchAcrossIncarnationChain
IdentityPublicKeyMismatchInSoulRecord
IdentityPublicKeyMismatchInSoulEpochLease
IdentityPublicKeyMismatchInEkycCredential
AuthorityOnlyIdentityClaimForbidden
MissingAuthorityToSoulTrace
MissingDeviceIncarnation
InvalidIncarnationSequence
InvalidPreviousIncarnationReference
DuplicateAuthorityKeyBinding
```

Soul Transfer・Forum Root Succession・譲渡決済・譲渡eKYCの検証には、さらに次を追加する。

```text
EkycRequiredForTransfer
MissingTransferEkycProof
TransferEkycExpired
TransferEkycRevoked
InvalidTransferEkycPurpose
MissingTransferDistinctnessProof
TransferDistinctnessIndeterminate
TransferRelatedPartyForbidden
TransferSellerBuyerIdentityMismatch
TransferSellerNotCurrentController
TransferBuyerBodyNotBound
TransferSequenceGap
SoulTransferFork
ForumRootSuccessionFork
DuplicateActiveTransfer
TransferAlreadyFinalized
TransferNotFrozen
TransferFrozenOperation
TransferFreezeExpired
TransferFinalizationDeadlineExceeded
TransferPaymentNotReserved
InvalidTransferPaymentReservation
TransferPaymentTargetMismatch
TransferPaymentAmountMismatch
TransferPaymentCurrencyMismatch
TransferDisputePending
InvalidTransferResolution
OldAuthorityNotRevoked
NewAuthorityNotActive
InvalidTrustEpochTransition
TrustEpochFork
InvalidTrustEpochSequence
StaleTrustEpochAuthority
ForbiddenTransferTrustCarryField
ControllerChangeWithoutSoulTransfer
ForumTransferLockedOperation
RootAuthorityNotActive
InvalidRootAuthorityEpoch
RootLedgerSuccessionFork
EquivocatedRootLedger
MissingRootSuccessionProof
MissingTransferHistoryCommitment
IndeterminateTransferTemporalOrder
TransferScopeContainsNonTransferableRight
PriorPayoutEntitlementAutoTransferForbidden
```

Asset Lineage Royalty・商用権利・lineage royalty settlement・payout aggregationの検証には、さらに次を追加する。

```text
MissingCommercialRightsPolicy
MissingAssetRightsGrant
ExpiredAssetRightsGrant
RevokedAssetRightsGrant
CommercialRightsScopeMismatch
UnauthorizedResale
UnauthorizedSublicense
UnauthorizedDerivative
AssetLineageCycle
AssetLineageDepthExceeded
InvalidAssetLineageGeneration
InvalidAssetLineageAncestorCommitment
OriginRoyaltyPolicyMismatch
OriginRoyaltyPolicyMutation
InvalidAncestorPoolRate
InvalidDecayRatio
InvalidLineageRoyaltyDepth
LineageRoyaltyDivisionByZero
LineageRoyaltyArithmeticOverflow
LineageRoyaltyConservationFailure
LineageRoyaltyRoundingMismatch
DuplicateLineageRoyaltySettlement
SelfDealingLineageSale
VerifiedCommonIdentityLineageSale
DuplicatePayoutAggregationInclusion
InvalidPayoutAggregationCommitment
LineagePayoutBelowThresholdCarryForward
```

Discovery・Storage・client-side encryption・Resource Contributionの検証には、さらに次を追加する。

```text
MissingAssetDiscoveryRecord
InvalidAssetDiscoveryRecord
AssetDiscoveryAssetMismatch
AssetDiscoveryForumMismatch
AssetDiscoveryOfferInactive
AssetDiscoveryVisibilityViolation
PublicDiscoveryMetadataLeak
MissingPublicAccessConditionPolicy
InvalidPublicAccessConditionPolicy
AccessEligibilityQuoteUnproven
StaleDiscoveryIndex
InvalidDiscoveryIndexManifest
DiscoveryIndexCheckpointMismatch
DiscoveryProofUnavailable

UnsupportedStorageParticipationMode
InsufficientReservedCapacity
InvalidStorageReservationGrant
ExpiredStorageReservationGrant
StorageReservationMismatch
StorageReceiptBeforeDurablePublish
InvalidStorageReceipt
DuplicateStorageReceipt
StorageReceiptHashMismatch
StorageReceiptFailureDomainMismatch
StorageAuditExpired
InvalidStorageAuditChallenge
InvalidStorageAuditResult
StorageAuditFailure
StorageContributionDuplicateCount
StorageContributionSelfDealingExcluded
StorageContributionUnreferencedObject
StorageContributionCapExceeded
InvalidResourceContributionScore
ResourceContributionScoreOverflow
ForbiddenResourceContributionCivicWeight
ForbiddenResourceContributionAuthorityUse
ForbiddenResourceContributionSeedUse

UnsupportedEncryptionSuite
InvalidEncryptedFileManifest
EncryptedManifestChunkOrderMismatch
EncryptedManifestMerkleMismatch
CiphertextChunkHashMismatch
CiphertextAuthenticationFailure
CiphertextAssociatedDataMismatch
KeyEnvelopeRecipientMismatch
KeyEnvelopeGrantMismatch
KeyEnvelopeFileVersionMismatch
KeyEnvelopeExpired
KeyEnvelopeRevoked
MissingKeyEnvelope
ForbiddenPlaintextStorage
PublicMetadataContainsSecret
NonceReuseDetected
InvalidContentKeyRotation

UnsupportedComputeVerifier
InvalidComputeCapabilityAdvertisement
InvalidComputeJob
InvalidComputeResult
InvalidComputeVerification
ComputeVerificationIndeterminate
ForbiddenUnverifiedComputeContribution
```

Executable Marketing Frontier・広告配信・action bundleの検証には、さらに次を追加する。

```text
InvalidExecutableMarketingPlan
ExecutableMarketingPlanExpired
ExecutableMarketingPlanCheckpointMismatch
ExecutableMarketingPlanInputMismatch
ExecutableMarketingActionNotExecutable
MarketingActionDraftMismatch
MarketingActionRequiredProofMissing
MarketingActionConsentMissing
MarketingActionPaymentUnavailable
MarketingActionRateLimitExceeded
MarketingActionTransferLocked
MarketingActionPolicyMismatch
MarketingActionOfferInactive
MarketingActionGrantInvalid
MarketingActionCommercialRightsInvalid
MarketingActionAnnouncementUnauthorized
MarketingActionRecipientPolicyDenied
MarketingActionRecipientBlocked
MarketingActionDeliveryUnavailable
MarketingActionSegmentPrivacyViolation
MarketingActionSegmentBelowMinimum
MarketingActionDuplicateExecution
InvalidAdvertisementDeliveryPolicy
AdvertisementRecipientNotOptedIn
AdvertisementSenderRateLimitExceeded
AdvertisementRecipientRateLimitExceeded
AdvertisementDeliveryPolicyExpired
AdvertisementDeliveryRouteUnavailable
InvalidAdvertisementDelivery
InvalidMarketingActionBundle
MarketingBundleDependencyMismatch
MarketingBundleAtomicityMisrepresented
MarketingFrontierPrivacyBudgetExceeded
```

Asset Publication Mechanicsの検証には、さらに次を追加する。

```text
InvalidAssetPublicationEvidence
PublicationEvidenceNotFinalized
PublicationEvidenceStaleCheckpoint
PublicationAgeTooYoung
PublicationSelfAccess
PublicationSelfPurchase
PublicationVerifiedCommonIdentity
PublicationSameController
PublicationDuplicateEvidence
PublicationDuplicateHighWaterCredit
PublicationInvalidRights
PublicationInvalidLineage
PublicationAssetInactive
PublicationAssetExpired
PublicationAccessRevoked
PublicationPaymentNotFinalized
PublicationRefunded
PublicationChargeback
PublicationDisputed
PublicationAvailabilityInsufficient
PublicationAuditFailed
PublicationNeedNotFinalized
PublicationCitationCycle
PublicationUnauthorizedCitation
PublicationCultivationNotIndependent
PublicationCultivationDoubleCount
PublicationBonusCapExceeded
PublicationAssetCapExceeded
PublicationAssetsCountCapExceeded
PublicationPathCapExceeded
PublicationResourceLimitExceeded
```

公開経路に`A_max`比例の個別上限も件数上限も置かないため、係数和の上限（C4）違反のreject codeは`PublicationCoefficientSumExceeded`が担う。既存の`PublicationBonusCapExceeded`、`PublicationAssetCapExceeded`、`PublicationAssetsCountCapExceeded`、`PublicationPathCapExceeded`は、従来の公開経路capの廃止に伴い公開経路で超過を報告する対象を失う。これらのcodeは削除せず互換性のため予約として残すが、公開経路では新規に発行せず、genesis又は`AssetPublicationIncentivePolicy`の検証でこれらを用いてはならない。旧capの固定値（`MAX_PUBLICATION_BONUS_BPS_PER_ASSET_EPOCH`の45 bps、`MAX_PUBLICATION_BONUS_BPS_PER_SOUL_FORUM_EPOCH`の300 bps、`MAX_PUBLICATION_SCORE_PATH_BPS_PER_SOUL_FORUM_EPOCH`の520 bps）は第7.21.6節で廃止されたため、検証器へ埋め込んではならない。`A_max`を報酬の基準量として課す違反をこれらのcodeで表してはならない（C1・C3）。

公開経路の基準量・上限・`AssetScore`の尺度の検証には、さらに次を追加する。

```text
PublicationBaseScoreUncertifiedValue
PublicationCoefficientSumExceeded
PublicationReferenceQuantityMissing
PublicationCitationCapCouplingViolation
PublicationAssetValueParityViolation
AssetScoreExceedsAMax
InvalidScoreUnitConversion
NonReducedRationalScore
MissingAccessThreshold
InvalidAccessThresholdUnit
```

統一手続き・TimeHandshake・SessionBinding・Core Operation・adapter同値性の検証には、さらに次を追加する。

```text
UnknownCoreOperation
InvalidCoreOperationRequest
InvalidCoreOperationId
InvalidOperationIdempotencyKey
OperationIdempotencyConflict
OperationPayloadMismatch
OperationAlreadyTerminal
OperationTransitionForbidden
OperationEventSequenceInvalid
OperationEventFork
OperationEventPredecessorMissing
OperationInterfaceMappingMissing
OperationInterfaceParityViolation
MissingTimeHandshake
InvalidTimeHandshake
ExpiredTimeHandshake
TimeHandshakeReplay
TimeHandshakeChallengeMismatch
TimeHandshakeSessionMismatch
TimeHandshakeTransportBindingMismatch
TimeHandshakeEndpointBindingMismatch
TimeHandshakePeerIdentityMismatch
TimeHandshakePeerAuthorityMismatch
TimeHandshakePeerLeaseInvalid
TimeHandshakeTrustEpochMismatch
TimeHandshakeRoundTripExceeded
TimeHandshakeUncertaintyExceeded
TimeHandshakeOffsetExceeded
SessionBindingMissing
SessionBindingExpired
SessionBindingInvalid
SessionBindingPeerMismatch
SessionBindingTransportMismatch
SessionRehandshakeRequired
PreHandshakeProtocolMessageForbidden
InvalidExternalCallbackEnvelope
ExternalCallbackReplay
ExternalCallbackTimestampInvalid
ExternalCallbackProviderUnauthorized
ExternalCallbackCorrelationMismatch
ExternalCallbackSessionBindingMissing
```

時刻証人quorumの自動選択・代替補充・再試行の検証には、さらに次を追加する。

```text
TimeWitnessPolicyInvalid
TimeWitnessQuorumUnavailable
TimeWitnessSubstituteExhausted
TimeWitnessRetryBackoffExhausted
TimeWitnessDomainDuplicate
```

Civic ballot・Civic Need bundle・NeedMerge・NeedSplit・分散Civic finalityの検証には、さらに次を追加する。

```text
CivicBallotVoteBudgetExceeded
CivicBallotRevisionGap
CivicBallotRevisionFork
CivicBallotNullifierEquivocation
CivicBallotInactiveNeedTarget
CivicBallotOriginTargetMismatch
CivicNeedMergeSourceDuplicate
CivicNeedMergeSourceInactive
CivicNeedMergeVoteAmplification
CivicNeedMergeInvalidQuorum
CivicNeedMergeFinalityMissing
CivicNeedSplitInvalid
CivicNeedSplitVoteRestorationMismatch
CivicNeedSplitPostMergeVoteAutoTransfer
CivicNeedBundleCapacityExceeded
CivicNeedFifoOrderViolation
CivicNeedFifoSequenceReset
CivicValidatorSetMismatch
CivicValidatorQuorumInsufficient
CivicPrevoteInvalid
CivicPrecommitInvalid
CivicFinalityCertificateInvalid
CivicFinalityConflict
```

cross-forum割引係数と`GaiaAssetAccessPolicy`の検証には、さらに次を追加する。

```text
MissingGaiaAssetAccessPolicy
InvalidGaiaAssetAccessPolicy
ExpiredGaiaAssetAccessPolicy
AmbiguousGaiaAssetAccessPolicy
GaiaAssetAccessPolicyVersionGap
GaiaAssetAccessPolicyFork
InvalidCrossForumDiscountRatio
CrossForumDiscountRatioOutOfRange
CrossForumAssetAccessPolicyMismatch
MissingCrossForumAssetAccessPolicyProof
```

forum参加eKYC境界（`ForumMembershipEkyc`）と`ForumEkycParticipationProof`・`ForumMembershipEkycRenewal`の検証には、さらに次を追加する。

```text
MembershipEkycRequired
MissingForumEkycParticipationProof
InvalidForumEkycParticipationProof
ForumEkycForumMismatch
ForumEkycSoulMismatch
ForumEkycPurposeMissing
ForumEkycAssuranceInsufficient
ForumEkycUniquenessScopeMismatch
ForumEkycCredentialExpired
ForumEkycCredentialRevoked
ForumEkycCredentialUnverifiable
ForumEkycRenewalInvalid
ForumEkycRenewalCertificateMismatch
MembershipSuspendedForEkyc
```

gaia-network輸送との接合（第29章）には、さらに次を追加する。これらはGaia側の`ProtocolReject` codeであり、gaia-networkパッケージの`ErrorCode`（第28.29節）とは別の型である。既存の`TimeHandshake*`及び`SessionBinding*`系codeは署名済みtranscriptの検証を担い、そのまま保持する。下記は、adapterが構成する認証済みtransport contextとGaiaの`SessionBinding`との照合に対応する。

```text
TransportPeerMismatch
TransportEndpointMismatch
TransportBindingMismatch
UntrustedTransportContext
SessionTransportUnsupported
TimeHandshakeProofLimitExceeded
TimeHandshakeCapacityExceeded
```

| code | 条件 | state mutation | 上位の対応 |
|---|---|---|---|
| TransportPeerMismatch | trusted peer DeviceIdとsigned endpoint又は期待peerが不一致 | なし | peer/署名/proofを再確認。自動identity代替なし |
| TransportEndpointMismatch | local endpoint、network_name、ALPN又はcommitment不一致 | なし | 正しいendpointで新handshake |
| TransportBindingMismatch | request contextのconnection IDとsessionのlocal ID不一致 | なし | 新handle、新handshake |
| UntrustedTransportContext | private listenerでない又はreserved contextが不足/不正 | なし | listener隔離/context修正。caller headerを信用しない |
| SessionTransportUnsupported | 要求されたnode間transport/interfaceが非対応 | なし | 対応RESTを明示選択。自動tunnelなし |
| TimeHandshakeProofLimitExceeded | 初期proof bundleが上限超過 | なし | bounded bundleを再構成。private GET例外追加なし |
| TimeHandshakeCapacityExceeded | application pending/session/peer上限超過 | なし | bounded backoff。transport Busyと型を区別 |

`PreHandshakeProtocolMessageForbidden`、SessionBinding expiry、signature、lease、scope、epoch、replayに関する既存codeを削除しない。`NetworkError::TransportBindingChanged`はpackage側、`TransportBindingMismatch`はGaia側である。未送信なら`NotSubmitted`であり、Gaia `ProtocolReject`を受信した場合はHTTP exchange成功でGaiaが拒否した状態である。

transport又はgenerated HTTP errorは、canonicalなGaia rejectionと別のresult branchにする。ログ又はUIでのみ原因分類できるが、署名済みGaia拒否として捏造しない。retryabilityは権限・状態・delivery不確実性を考慮してcore又は上位policyが決定する。

既存のエラーコード（`TemporalCycle`、`MissingObject`、`HashMismatch`、`StaleCheckpoint`、`MissingRootMembership`、`EquivocatedFinality`、`EquivocatedSeedAllocation`、`MissingTransition`、`InvalidStateSequence`、`ResourceLimitExceeded`、`IncentiveProfileInvalid`、`PlaintextHashMismatch`、`CandidateIndexMismatch`、`InvalidSeedCreditLedger`、`InvalidSeedAllocationState`、`InvalidSeedAllocation`、`UnsupportedSignatureSuite`、`InvalidMLDSA65PublicKeyEncoding`、`InvalidMLDSA65SignatureEncoding`）は維持する。既存の`ExpiredEkycCredential`、`UnauthorizedEkycService`および`SeedBudgetExceeded`は継続して用いる。`SeedBudgetExceeded`は第7.9.1節のorigin lotの二重使用（同一origin lotを二つのchild genesisへ使う試行）に対する既存codeであり、本版で追加するcodeではない。

- `ForbiddenTargetDepthField`: `community`または`root_entry`にtarget depth系フィールド（`target_depth`、`requested_depth`、`approved_depth`、`projected_depth`等）が含まれる
- `LegacyTargetDepthCertificate`: 旧schemaのtarget depthを持つcertificateを新protocolとして受信した
- `SubjectNotActiveMember`: subjectがpre-state checkpointでactive memberではない
- `IssuerNotMoreMature`: `depth(issuer) >= depth(subject)`
- `InvalidCommunityIssuanceContext`: 必須のauthority、lease、health、issuer chain等が不足・不正
- `CheckpointMismatchForCommunityRequest`: requestと発行側検証が異なる指定checkpointを使う
- `CommunityProjectionUsedAsConsensus`: advisory projectionが署名済み通常objectまたはcheckpointへ混入した

譲渡claimは、次のいずれかが欠ける場合にfail-closedで拒否する。

- eKYC credential、失効proof、provider authorization、distinctness proofの不足
- buyer/sellerが現在のSoul/controllerと結び付かない
- agreement、freeze、reservation、finalizationの順序不正
- payment amount/currency/targetがagreementと不一致
- 凍結中の通常操作
- `source_trust_epoch`とSoulRecordの不一致
- `successor_trust_epoch != source_trust_epoch + 1`
- old authorityがfinalization時点でまだ有効
- new authority/new Body/new leaseがfinalization時点で未束縛
- unresolved disputeの存在
- transfer registry又はroot succession registryのfork
- genesis rootを置換しようとする操作
- 過去のPayoutEntitlement、Civic資格、Q/depth等を自動承継させようとするscope

### 22.3 StateProofEnvelopeのclaim種別

`StateProofEnvelope.claim`は、既存のclaimに加えて、少なくとも次を許可する。

```text
civic_citizen_status
civic_vote_validity
civic_vote_tally_validity
civic_need_asset_status
civic_need_asset_publish_eligibility
civic_candidates
civic_reach

soul_transfer_validity
soul_transfer_finalization_validity
forum_root_succession_validity
transfer_payment_release_validity
transfer_ekyc_validity

lineage_royalty_validity
lineage_royalty_settlement_validity
commercial_rights_validity
payout_aggregation_validity

asset_discovery_validity
forum_discovery_validity
public_access_condition_validity
discovery_index_validity
storage_reservation_validity
storage_receipt_validity
storage_audit_validity
resource_contribution_validity
encrypted_manifest_validity
key_envelope_validity
compute_verification_validity

marketing_frontier_validity
executable_marketing_plan_validity
marketing_action_executability
advertisement_delivery_policy_validity
advertisement_delivery_validity
marketing_segment_validity

cross_forum_asset_access_validity
forum_membership_ekyc_validity
asset_publication_validity
publication_contribution_state_validity
time_witness_quorum_validity
```

各claimは、必要な通常依存閉包に加え、第17章および第23章が定めるeKYC・失効・ballot・ballot nullifier・CivicNeedBundle・CivicEpochBlock・prevote・precommit・`CivicFinalityCertificate`の依存閉包を含まなければならない（第3.5節）。`civic_vote_validity`、`civic_vote_tally_validity`、`civic_need_asset_status`、`civic_need_asset_publish_eligibility`、`civic_candidates`、`civic_reach`の6 claimは、forum rootの単独署名又は`single_writer_hash_chain_v1`ではなく、当該epochの`CivicFinalityCertificate`、validator集合導出proof、quorum署名集合、およびcheckpointにコミットされた分散Civic state root（`civic_epoch_registry_root`、`civic_ballot_registry_root`、`civic_ballot_nullifier_registry_root`、`civic_need_bundle_root`、`civic_finality_registry_root`、`civic_validator_set_registry_root`）に基づかなければならない。claim名は変更しない。`civic_citizen_status`は第17.7節のpredicateを維持するため、この置換の対象に含めない。`cross_forum_asset_access_validity`は第18.23節の`GaiaAssetAccessPolicy`の一意性と`cross_forum_discount_ratio`のproof、`forum_membership_ekyc_validity`は第17.8節〜第17.10節の`ForumMembershipEkyc` predicateと`ForumEkycParticipationProof`／`ForumMembershipEkycRenewal`のproof、`asset_publication_validity`及び`publication_contribution_state_validity`は第7.21節の公開経路の受理述語と第22.8節のcanonical schema、`time_witness_quorum_validity`は第14.4節のquorum到達手続と`TimeWitnessPolicy`（第22.10節）のproofを、それぞれ依存閉包に含めなければならない。Soul Transfer・Forum Root Succession・Transfer Payment Releaseのclaimは、第16章・第5章・第18章が定めるagreement、freeze、payment reservation、finalization、trust epoch transition、dispute状態、旧authority失効、新Body束縛、root succession chainの依存閉包を含まなければならない。Asset Lineage Royaltyのclaimは、第7.18節が定めるlineage node・policy・grant・settlement・aggregationの依存閉包と、`PaymentSettlement` / `PayoutEntitlement` の参照整合proofを含まなければならない。本仕様のDiscovery・Storage・暗号化・Resource Contribution claimは、依存するcheckpoint、registry root、Merkle proof、署名、authority、Soul epoch、TemporalHealth、freshnessを明示しなければならない。検索providerのresponseはadvisoryでよいが、clientがpurchasability / accessを表示する際は必要なdiscovery / offer / policy / checkpoint proofを取得・検証できることを要求する。

### 22.4 Asset Lineage Royalty objectのcanonical schema

本仕様のALR objectは、全て本仕様の他のobjectと同じcanonical encoding、content-addressed hash、domain separation、ML-DSA-65 signature、authority gate、`StateProofEnvelope`依存規則に従う。以下にcanonical schemaを示す。

```text
AssetCommercialRightsPolicy
  policy_id: Hash
  policy_version: u64
  origin_asset_ref: Hash
  origin_asset_soul_id: SoulId
  resale_permitted: bool
  sublicense_permitted: bool
  derivative_permitted: bool
  permitted_relationship_kinds: sorted set<resale, sublicense, derivative>
  descendant_forum_only: bool
  transferability: nontransferable | assignable_with_approval
  max_commercial_depth: u8
  revocation_mode: none | future_offers_only | emergency_hold_only
  allowed_currencies: sorted set<CurrencyCode>
  lineage_royalty_policy_ref: Hash | null
  issued_at: Tick
  expire: Tick | null
  authority_pubkey: MLDSA65PublicKey
  signature: MLDSA65Signature
```

正規検証: `origin_asset_ref`はorigin AssetRecordを参照する。`origin_asset_soul_id`はorigin asset publisher Soulと一致する。`max_commercial_depth <= MAX_COMMERCIAL_LINEAGE_DEPTH`（第7.18.4節の固定値）。`lineage_royalty_policy_ref`がnullでなければ、同じorigin assetを参照する有効な`AssetLineageRoyaltyPolicy`を指す。各`*_permitted = false`なら対応するrelationship kindを含めない。policyはorigin assetのimmutable commitmentであり、後続更新は過去に効力を及ぼさない。

```text
AssetLineageRoyaltyPolicy
  policy_id: Hash
  policy_version: u64
  origin_asset_ref: Hash
  origin_asset_lineage_id: Hash
  origin_publisher_soul_id: SoulId
  ancestor_pool_rate_bps: u16
  decay_ratio_bps: u16
  max_lineage_depth: u8
  rounding_rule: largest_remainder_v1
  payout_aggregation_mode: payment_service_epoch_aggregation_v1
  minimum_aggregation_minor_by_currency: sorted map<CurrencyCode, u128>
  settlement_finality_delay: Tick
  self_dealing_policy: exclude | hold_for_review
  verified_common_identity_policy: exclude | hold_for_review | not_configured
  policy_activation: origin_asset_creation_only
  issued_at: Tick
  authority_pubkey: MLDSA65PublicKey
  signature: MLDSA65Signature
```

正規検証: `ancestor_pool_rate_bps <= 10000`。`0 < decay_ratio_bps < 10000`（`ancestor_pool_rate_bps = 0`の場合もdecay valueはcanonical valid rangeを満たす）。`1 <= max_lineage_depth <= MAX_LINEAGE_ROYALTY_DEPTH`。`rounding_rule`は`largest_remainder_v1`のみ。`payout_aggregation_mode`は`payment_service_epoch_aggregation_v1`のみ。`origin_asset_ref`と`origin_asset_lineage_id`は同一origin AssetRecordと一致する。origin asset publisherのactive authorityが署名しなければならない。policyはorigin asset作成transactionと同一atomic contextで初めて参照されなければならない。

```text
AssetRightsGrant
  grant_id: Hash
  origin_asset_ref: Hash
  parent_asset_ref: Hash
  grantee_soul_id: SoulId
  grantee_authority_pubkey: MLDSA65PublicKey
  issuer_soul_id: SoulId
  issuer_authority_pubkey: MLDSA65PublicKey
  relationship_kind: resale | sublicense | derivative
  scope_forum_id: ForumId | null
  descendant_forum_only: bool
  max_remaining_depth: u8
  permitted_content_use: sorted set<resale, sublicense, derivative, bundle>
  royalty_policy_ref: Hash | null
  issued_at: Tick
  expire: Tick | null
  revocation_ref: Hash | null
  parent_grant_ref: Hash | null
  signature: MLDSA65Signature
```

正規検証: issuerはparent assetのcurrent commercial right holderであり、当該relationship kindを下流へ許諾できる必要がある。`max_remaining_depth`はparent policyの残余深度を超えない。`royalty_policy_ref`はorigin policyと一致しなければならない。nullはALR無効のorigin assetにのみ許す。`scope_forum_id`がnon-nullの場合、そのforumと許容されたdescendants以外ではgrantを用いたofferをreject。grantはaccess grantではない。

```text
AssetLineageNode
  node_id: Hash
  asset_ref: Hash
  asset_lineage_id: Hash
  origin_asset_ref: Hash
  origin_asset_lineage_id: Hash
  parent_asset_ref: Hash | null
  parent_lineage_node_ref: Hash | null
  parent_rights_grant_ref: Hash | null
  relationship_kind: origin | resale | sublicense | derivative
  rights_holder_soul_id: SoulId
  generation_from_origin: u8
  ancestor_commitment: Hash
  origin_commercial_rights_policy_ref: Hash
  origin_lineage_royalty_policy_ref: Hash | null
  created_at: Tick
  authority_pubkey: MLDSA65PublicKey
  signature: MLDSA65Signature
```

正規検証: origin nodeは`parent_asset_ref = null`、`parent_lineage_node_ref = null`、`parent_rights_grant_ref = null`、`relationship_kind = origin`、`generation_from_origin = 0`。non-origin nodeは親nodeを必須とし、`generation_from_origin = parent + 1`。`ancestor_commitment`は`[origin asset lineage id, ordered ancestor asset refs, ordered ancestor rights-holder SoulIds, ordered grant refs]`のcanonical encodingに対するdomain-separated hashとする。親連鎖の一意性、非循環性、origin policy identity、最大深度、grant validityを検証する。

```text
LineageRoyaltySettlement
  lineage_royalty_settlement_id: Hash
  payment_settlement_ref: Hash
  order_ref: Hash
  sold_asset_ref: Hash
  sold_lineage_node_ref: Hash
  origin_asset_ref: Hash
  origin_lineage_royalty_policy_ref: Hash
  seller_soul_id: SoulId
  currency: CurrencyCode
  beneficiary_pool_minor: u128
  ancestor_pool_minor: u128
  seller_principal_minor: u128
  effective_ancestor_count: u8
  allocation_commitment_root: Hash
  allocations: canonical sorted list<LineageRoyaltyAllocation>
  rounding_rule: largest_remainder_v1
  settlement_finality_time: Tick
  status: pending_finality | claimable | refund_reserve | chargeback_pending | reversed
  payment_service_authorization_ref: Hash
  signature: MLDSA65Signature
```

```text
LineageRoyaltyAllocation
  generation: u8
  ancestor_asset_ref: Hash
  ancestor_lineage_node_ref: Hash
  beneficiary_soul_id: SoulId
  exact_numerator: BigUIntCanonical
  exact_denominator: BigUIntCanonical
  floor_amount_minor: u128
  remainder_rank: u32
  rounding_increment_minor: u8
  allocated_amount_minor: u128
```

正規検証: `beneficiary_pool_minor = PaymentSettlement.beneficiary_pool_minor`。`ancestor_pool_minor = floor(beneficiary_pool_minor * ancestor_pool_rate_bps / 10000)`。`seller_principal_minor = beneficiary_pool_minor - ancestor_pool_minor`。allocationsは第7.18.5節の計算式・丸め規則と完全一致する。`sum(allocations.allocated_amount_minor) = ancestor_pool_minor`。`seller_principal_minor + sum(allocations) = beneficiary_pool_minor`。`effective_ancestor_count = min(actual ancestor count, policy max_lineage_depth)`。`allocation_commitment_root`はcanonical sorted allocation listのMerkle root。sale / order / payment settlementごとにat most one finalized lineage royalty settlementを許す。

```text
PayoutAggregation
  aggregation_id: Hash
  payout_epoch_id: Hash
  beneficiary_soul_id: SoulId
  currency: CurrencyCode
  entitlement_commitment_root: Hash
  entitlement_count: u32
  gross_claimable_minor: u128
  reserved_minor: u128
  transfer_eligible_minor: u128
  minimum_aggregation_minor: u128
  payout_eligibility_ref: Hash | null
  aggregation_status: open | ready | held | submitted | partially_paid | paid | expired
  created_at: Tick
  closed_at: Tick | null
  payment_service_authorization_ref: Hash
  signature: MLDSA65Signature
```

正規検証: `entitlement_count = MAX_PAYOUT_ENTITLEMENTS_PER_AGGREGATION`以下でなければならない（第7.18.4節）。同一keyのclaimable entitlement数がこれを超える場合は第18.22.3節の分割規則に従い複数の`PayoutAggregation`へ分割し、一件も省略してはならない。`gross_claimable_minor`はcommitment rootに含まれる、同一Soul・同一currency・当該epochのclaimable entitlementの合計。`reserved_minor`はactive refund / chargeback / dispute reserveの合計。`transfer_eligible_minor = gross_claimable_minor - reserved_minor`。`transfer_eligible_minor < minimum_aggregation_minor`の場合、aggregationは次epochへcarry forwardされる。entitlementの二重集計、複数aggregationへの重複包含、通貨混在、Soul混在はreject。

### 22.5 Discovery・Storage・暗号化・Resource Contribution objectのcanonical schema

本仕様のDiscovery・Storage・client-side encryption・Resource Contribution objectは、全て本仕様の他のobjectと同じcanonical encoding、content-addressed hash、domain separation、ML-DSA-65 signature、authority gate、`StateProofEnvelope`依存規則に従う。

```text
AssetDiscoveryRecord
  discovery_id: Hash
  asset_ref: Hash
  forum_id: ForumId
  publisher_soul_id: SoulId
  asset_lineage_id: Hash | null
  title: PublicString
  summary: PublicString
  tags: canonical sorted list<PublicString>
  content_kind: asset | module | agent_skill | tool | workflow | dataset | other
  active: bool
  visibility: public_discoverable
  offer_refs: canonical sorted list<Hash>
  access_policy_ref: Hash
  commercial_rights_summary_ref: Hash | null
  discovery_metadata_version: u16
  created_at: Tick
  updated_at: Tick
  expire: Tick | null
  authority_pubkey: MLDSA65PublicKey
  signature: MLDSA65Signature
```

正規検証: `visibility`は`public_discoverable`のみ。`asset_ref`はactive `AssetRecord`、`forum_id`はassetがactive registryに含まれるforum、`offer_refs`はactive `ServiceOffer`のみを指す。title/summary/tagsは公開可能で、秘密・個人情報・DEK・平文hashを含まない。`access_policy_ref`は`PublicAccessConditionPolicy`を指す。checkpointのdiscovery registry rootからinclusion proofを提供できなければならない。assetがinactive / revoked / expiredなら更新recordまたはtombstoneをcheckpointに入れる。

```text
PublicAccessConditionPolicy
  policy_id: Hash
  asset_ref: Hash
  purchase_required: bool
  free_access_available: bool
  required_access_mode: read | execute | read_execute
  minimum_asset_score: u128 | null
  active_forum_membership_required: bool
  invitation_required: bool
  pressroom_membership_required: bool
  civic_citizen_required: bool
  required_identity_tier: IdentityTier | null
  supported_currencies: canonical sorted list<CurrencyCode>
  geographic_availability_summary: PublicString | null
  offer_valid_from: Tick | null
  offer_valid_until: Tick | null
  capacity_limit: u64 | null
  prerequisite_asset_refs: canonical sorted list<Hash>
  required_commercial_rights_summary: PublicString | null
  issued_at: Tick
  expire: Tick | null
  signature: MLDSA65Signature
```

```text
AccessEligibilityQuote
  asset_ref: Hash
  evaluated_soul_id: SoulId | null
  evaluation_checkpoint_ref: Hash
  purchasable: bool
  free_access_eligible: bool
  available_offers: canonical sorted list<Hash>
  current_price_options: canonical sorted list<PriceOption>
  satisfied_conditions: canonical sorted list<ConditionResult>
  unsatisfied_conditions: canonical sorted list<ConditionResult>
  next_actions: canonical sorted list<PublicActionHint>
  proof_refs: canonical sorted list<Hash>
  quote_issued_at: Tick
  quote_expire: Tick
```

`AccessEligibilityQuote`はコンセンサスobjectではない。advisoryであり、proof referencesを必須とする。payment authorization、access grant、Civic status、権利許諾の代替証拠にならない。

```text
ForumDiscoveryRecord
  forum_id: ForumId
  genesis_ref: Hash
  parent_forum_ids: canonical sorted list<ForumId>
  display_name: PublicString
  description: PublicString
  tags: canonical sorted list<PublicString>
  active: bool
  forum_access_summary_ref: Hash
  public_asset_discovery_enabled: bool
  created_at: Tick
  updated_at: Tick
  signature: MLDSA65Signature
```

```text
DiscoveryIndexManifest
  index_manifest_id: Hash
  index_format_version: u16
  namespace_kind: public_discovery
  forum_shard_commitment: Hash
  checkpoint_set_root: Hash
  source_asset_discovery_root_set: Hash
  source_forum_discovery_root_set: Hash
  index_schema_hash: Hash
  analyzer_id: String
  analyzer_rules_hash: Hash
  segment_object_refs: canonical sorted list<Hash>
  covered_from: Tick
  covered_until: Tick
  signer_soul_id: SoulId
  signer_authority_pubkey: MLDSA65PublicKey
  signature: MLDSA65Signature
```

```text
DiscoveryServiceObservation
  observation_id: Hash
  provider_soul_id: SoulId
  index_manifest_ref: Hash
  query_commitment: Hash
  response_commitment: Hash
  returned_candidate_count: u32
  proof_retrievable_success_count: u32
  index_freshness_tick: Tick
  observed_at: Tick
  verifier_soul_id: SoulId | null
  verification_result: success | failure | indeterminate
  signature: MLDSA65Signature
```

```text
StorageReservationGrant
  reservation_id: Hash
  storage_provider_soul_id: SoulId
  device_incarnation_id: Hash
  object_ref: Hash
  requested_bytes: u64
  accepted_bytes: u64
  storage_class: critical_metadata | file_manifest | receipt_set | ciphertext_chunk | index_segment | cache
  policy_hash: Hash
  issued_at: Tick
  expire: Tick
  signature: MLDSA65Signature
```

```text
StorageReceiptV2
  receipt_id: Hash
  object_ref: Hash
  parent_manifest_ref: Hash
  storage_provider_soul_id: SoulId
  device_incarnation_id: Hash
  storage_class: critical_metadata | file_manifest | receipt_set | ciphertext_chunk | index_segment
  observed_ciphertext_bytes: u64
  topology_epoch_ref: Hash
  failure_domain_commitment: Hash
  reservation_ref: Hash
  durable_at: Tick
  retention_until: Tick | null
  signature: MLDSA65Signature
```

```text
StorageAuditChallenge
  challenge_id: Hash
  receipt_ref: Hash
  object_ref: Hash
  nonce: Bytes
  requested_range: Range | null
  issued_at: Tick
  expire: Tick
  challenger_signature: MLDSA65Signature

StorageAuditResult
  result_id: Hash
  challenge_ref: Hash
  receipt_ref: Hash
  object_ref: Hash
  response_commitment: Hash
  verified_bytes: u64
  responded_at: Tick
  provider_soul_id: SoulId
  provider_signature: MLDSA65Signature
  verifier_result: success | failure | indeterminate
```

```text
CiphertextChunk
  chunk_id = BLAKE3(
    "gaia/storage/ciphertext-chunk/v1" ||
    ciphertext ||
    authentication_tag
  )
```

```text
EncryptedFileManifestV1
  manifest_id: Hash
  network_id: NetworkId
  namespace_id: Hash
  content_ref: Hash
  file_version_id: Hash
  prior_manifest_ref: Hash | null
  publisher_soul_id: SoulId
  encryption_suite: XChaCha20Poly1305HKDFSHA256v1
  key_wrap_suite: GaiaRecipientKeyWrapV1
  chunking_profile: Hash
  plaintext_total_length: u64
  ciphertext_total_length: u64
  chunks: canonical ordered list<EncryptedChunkRef>
  ciphertext_chunks_merkle_root: Hash
  protected_metadata_ref: Hash | null
  content_access_policy_ref: Hash
  storage_policy_ref: Hash
  created_at: Tick
  expire: Tick | null
  authority_pubkey: MLDSA65PublicKey
  signature: MLDSA65Signature

EncryptedChunkRef
  chunk_index: u64
  ciphertext_chunk_id: Hash
  ciphertext_length: u64
  plaintext_length: u64
  authentication_tag_commitment: Hash
```

```text
KeyEnvelopeV2
  envelope_id: Hash
  content_ref: Hash
  encrypted_manifest_ref: Hash
  file_version_id: Hash
  recipient_soul_id: SoulId
  recipient_encryption_public_key_commitment: Hash
  key_wrap_suite: GaiaRecipientKeyWrapV1
  wrapped_dek: Bytes
  grant_ref: Hash
  access_mode: read | execute | read_execute
  granted_at: Tick
  expire: Tick | null
  issuer_soul_id: SoulId
  issuer_authority_pubkey: MLDSA65PublicKey
  signature: MLDSA65Signature
```

```text
ComputeCapabilityAdvertisement
  provider_soul_id: SoulId
  supported_job_profiles: canonical sorted list<Hash>
  execution_environment_commitment: Hash
  attestation_capabilities: canonical sorted list<VerifierKind>
  valid_from: Tick
  valid_until: Tick
  signature: MLDSA65Signature

ComputeJob
  job_id: Hash
  job_profile_id: Hash
  input_commitment: Hash
  expected_output_commitment_rule: Hash
  verification_method: deterministic_rerun | spot_check | zkproof | tee_attestation | other
  resource_budget_commitment: Hash
  deadline: Tick
  requester_soul_id: SoulId
  signature: MLDSA65Signature

ComputeResult
  result_id: Hash
  job_ref: Hash
  output_commitment: Hash
  execution_trace_commitment: Hash
  provider_soul_id: SoulId
  completed_at: Tick
  signature: MLDSA65Signature

ComputeVerification
  verification_id: Hash
  job_ref: Hash
  result_ref: Hash
  verification_method: VerifierKind
  result: success | failure | indeterminate
  verified_work_units: u128
  verified_at: Tick
  signature: MLDSA65Signature
```

本仕様の初期版では`compute_contribution_bps = 0`であり、上記compute objectはschema予約のみである。`ComputeVerification.result = success`と明確なverifierがある`verified_work_units`だけが、将来の`C`候補になる。

### 22.6 Executable Marketing objectのcanonical schema

Executable Marketing Frontierのobjectは、全て本仕様の他のobjectと同じcanonical encoding、content-addressed hash、domain separation、ML-DSA-65 signature、authority gate、`StateProofEnvelope`依存規則に従う。

```text
ExecutableMarketingPlan
  plan_id: Hash
  protocol_version: u16
  requester_soul_id: SoulId
  requester_authority_pubkey: MLDSA65PublicKey
  asset_ref: Hash
  offer_ref: Hash | null
  source_forum_id: ForumId
  evaluation_checkpoint_ref: Hash
  evaluation_time: Tick
  valid_until: Tick
  plan_policy_ref: Hash
  current_purchasable_count: u64
  current_addressable_count: u64
  current_deliverable_count: u64
  current_segment_commitment_root: Hash
  action_steps: canonical ordered list<MarketingActionStep>
  privacy_budget_commitment: Hash
  plan_input_commitment: Hash
  generator_soul_id: SoulId | null
  generator_authority_pubkey: MLDSA65PublicKey | null
  signature: MLDSA65Signature | null
```

```text
MarketingActionStep
  step_id: Hash
  sequence: u32
  action_kind: create_asset_record | create_offer | create_asset_announcement |
               purchase_promotion | request_community_certificate |
               issue_community_certificate | create_child_forum |
               acquire_forum_membership | create_commercial_rights_grant |
               create_authorized_resale_offer | create_authorized_sublicense_offer |
               create_authorized_derivative_offer | refresh_discovery_metadata |
               enable_index_distribution | other
  execution_class: executable_now | requestable_now |
                   external_consent_required | future_state_dependent |
                   not_executable
  required_actor: requester | named_external_soul | payment_service |
                  forum_authority | asset_rights_holder | recipient_opt_in_system
  target_forum_id: ForumId | null
  target_segment_ref: Hash | null
  action_draft_commitment: Hash | null
  action_draft_object_kind: ObjectKind | null
  required_proof_refs: canonical sorted list<Hash>
  required_consents: canonical sorted list<ConsentRequirement>
  required_payments: canonical sorted list<PaymentRequirement>
  required_preconditions: canonical sorted list<PredicateRequirement>
  blocking_conditions: canonical sorted list<PredicateRequirement>
  expected_purchase_candidate_delta: u64
  expected_addressable_delta: u64
  expected_deliverable_delta: u64
  expected_segment_commitment: Hash
  execution_endpoint_descriptor: Hash | null
  revalidation_requirements: canonical sorted list<RevalidationRequirement>
  valid_until: Tick
```

```text
AdvertisementDeliveryPolicy
  policy_id: Hash
  recipient_soul_id: SoulId
  enabled: bool
  allowed_forum_scopes: canonical sorted list<ForumScope>
  allowed_asset_categories: canonical sorted list<AssetCategory>
  allowed_commercial_kinds: canonical sorted list<direct_sale, resale, sublicense, derivative>
  allowed_sender_classes: canonical sorted list<SenderClass>
  max_messages_per_epoch: u32
  max_messages_per_sender_per_epoch: u32
  allow_recipient_discovery: bool
  allow_direct_addressability: bool
  blocked_soul_commitment_root: Hash
  valid_from: Tick
  valid_until: Tick | null
  authority_pubkey: MLDSA65PublicKey
  signature: MLDSA65Signature
```

```text
AdvertisementDelivery
  delivery_id: Hash
  campaign_ref: Hash
  asset_ref: Hash
  offer_ref: Hash | null
  sender_soul_id: SoulId
  recipient_soul_id: SoulId
  recipient_policy_ref: Hash
  delivery_channel: p2p_inbox | forum_inbox | gaia_application_mailbox
  message_content_ref: Hash
  category_commitment: Hash
  created_at: Tick
  expire: Tick
  signature: MLDSA65Signature
```

```text
MarketingActionBundle
  bundle_id: Hash
  plan_ref: Hash
  action_step_refs: canonical ordered list<Hash>
  dependency_graph_commitment: Hash
  atomicity_mode: all_or_nothing | staged
  created_at: Tick
  expire: Tick
  requester_soul_id: SoulId
  signature: MLDSA65Signature
```

`action_draft_commitment`は、実行時に生成されるobjectのcanonical unsigned payloadをdomain-separated hashしたものでなければならない。実行時にclientが提出するobjectは、asset ref / offer ref、target forum、action kind、commercial rights grant / lineage ref、price / currency / quantity / payment requirement、expected policy / checkpoint anchor、recipient segment / advertisement category、mandatory access conditionを変更してはならない。実行時に必要なnonce、issued_at、expire、signature、payment intent id等のライブ値だけはcanonical ruleに従って充填してよい。これら可変fieldはplanで明示的に`runtime_filled`と宣言する。

`ExecutableMarketingPlan`はlocal client / nodeが作ることを許す。第三者nodeが署名する場合、署名はplanの生成元を示すだけで、authority delegationを意味しない。

`MarketingActionStep.action_kind` の Heat Stabilizer applicability note:

```text
Heat Stabilizer applicability note:
`acquire_forum_membership`, `request_community_certificate`, `purchase_promotion`, and a future
recommendation wrapper for `advertisement_delivery` may be Heat Stabilizer eligible only as
unexecuted recommendation or planning candidates. Eligibility changes recommendation ranking only.
It is not an action precondition and MUST NOT change action validity, required proofs, consents,
payments, recipient policy, or execution endpoint behavior.
```

`MarketingActionStep` schemaには、任意フィールド `heat_stabilizer_decision_ref: Hash | null` を末尾に追加できる。これはinformational / audit-onlyであり、その欠如はstepを無効にせず、その存在は実行を認可・拒否・変更しない。

### 22.7 Heat Stabilizer objects

All Heat Stabilizer objects use canonical encoding, domain-separated hashing, and ML-DSA-65 signatures where a signature field is specified. These objects are CPU-only. They are not consensus objects and do not authorize or invalidate protocol state transitions.

```text
HeatStabilizerPolicy {
  policy_id: Hash
  policy_version: u64
  network_id: NetworkId
  authority_soul_id: SoulId
  authority_pubkey: MLDSA65PublicKey
  eligible_action_kinds: canonical sorted set<ActionKind>
  max_recommendation_penalty: FixedDecimal
  max_exposure_reduction: FixedDecimal
  max_diversion_share: FixedDecimal
  min_aggregation_cohort: u32
  allowed_pressure_sources: canonical sorted set<PressureSourceKind>
  allowed_value_sources: canonical sorted set<ValueSourceKind>
  max_observation_window_epochs: u32
  max_hot_enter_epochs: u32
  max_hot_exit_epochs: u32
  issued_at: Tick
  expire: Tick | null
  previous_policy_ref: Hash | null
  signature: MLDSA65Signature
}
```

Validity requirements:

```text
0 <= max_recommendation_penalty <= 1
0 <= max_exposure_reduction <= 1
0 <= max_diversion_share <= 1
min_aggregation_cohort >= 1
1 <= max_observation_window_epochs
1 <= max_hot_enter_epochs
1 <= max_hot_exit_epochs
eligible_action_kinds is a subset of the specification-defined Heat Stabilizer eligible action kinds
```

```text
HeatStabilizerConfiguration {
  configuration_id: Hash
  policy_ref: Hash
  configuration_version: u64
  mode: disabled | observe_only | shadow | soft_intervention
  enabled: bool
  global_kill_switch: bool
  forum_kill_switches: canonical sorted set<ForumId>
  rollout_cohort_kind: none | forum_allowlist | deterministic_bucket
  rollout_forum_allowlist: canonical sorted set<ForumId>
  rollout_bucket_numerator: u32
  rollout_bucket_denominator: u32
  growth_window_epochs: u32
  value_window_epochs: u32
  pressure_window_epochs: u32
  excess_growth_threshold: FixedDecimal
  pressure_threshold: FixedDecimal
  value_per_net_inflow_floor: FixedDecimal
  hot_enter_epochs: u32
  hot_exit_epochs: u32
  max_recommendation_penalty: FixedDecimal
  max_exposure_reduction: FixedDecimal
  max_diversion_share: FixedDecimal
  w_sales: FixedDecimal
  w_access: FixedDecimal
  w_need: FixedDecimal
  fail_safe_retention_epochs: u32
  effective_from: Tick
  expire: Tick | null
  previous_configuration_ref: Hash | null
  release_evidence_ref: Hash | null
  authority_pubkey: MLDSA65PublicKey
  signature: MLDSA65Signature
}
```

Configuration validity requirements:

```text
policy_ref references a valid HeatStabilizerPolicy
configuration_version is monotonic for a policy_ref
growth_window_epochs, value_window_epochs, pressure_window_epochs are each in [1, policy.max_observation_window_epochs]
1 <= hot_enter_epochs <= policy.max_hot_enter_epochs
hot_enter_epochs <= hot_exit_epochs <= policy.max_hot_exit_epochs
0 <= max_recommendation_penalty <= policy.max_recommendation_penalty
0 <= max_exposure_reduction <= policy.max_exposure_reduction
0 <= max_diversion_share <= policy.max_diversion_share
w_sales >= 0, w_access >= 0, w_need >= 0
rollout_bucket_denominator >= 1
rollout_bucket_numerator <= rollout_bucket_denominator
mode=soft_intervention requires enabled=true, global_kill_switch=false, and rollout_cohort_kind != none
invalid, expired, or unverifiable configuration => effective mode observe_only
```

```text
HeatObservation {
  observation_id: Hash
  policy_ref: Hash
  configuration_ref: Hash
  forum_id: ForumId
  evaluation_checkpoint_ref: Hash
  evaluation_checkpoint_time: Tick
  growth_window_start_checkpoint_ref: Hash
  value_window_start_checkpoint_ref: Hash
  pressure_window_start_checkpoint_ref: Hash
  active_members_start: u64
  active_members_end: u64
  net_inflow_positive: u64
  growth_ratio: FixedDecimal | null
  eligible_entry_request_count: u64 | null
  capacity_rejection_count: u64 | null
  queue_backlog_count: u64 | null
  pressure_ratio: FixedDecimal | null
  finalized_sales_delta: FixedDecimal | null
  valid_access_grant_delta: u64 | null
  civic_need_gap_closed_delta: u64 | null
  value_per_net_inflow: FixedDecimal | null
  growth_available: bool
  pressure_available: bool
  value_available: bool
  insufficient_aggregation: bool
  unavailable_flags: canonical sorted set<HeatObservationUnavailableFlag>
  pressure_evidence_commitment_root: Hash | null
  value_evidence_commitment_root: Hash | null
  membership_proof_ref: Hash
  source_checkpoint_refs: canonical sorted list<Hash>
  generated_at: Tick
  generator_version: String
  signature: MLDSA65Signature | null
}
```

Rules:

```text
No individual SoulId, recipient SoulId, issuer SoulId, buyer SoulId, advertisement content,
message content, eKYC attribute, payment-instrument identifier, plaintext asset content, or private
recipient segment may occur in HeatObservation.

capacity_rejection_count excludes invalid proofs, failed authority checks, issuer discretionary
refusals, payment failures, eKYC failures, and user cancellations.

If a component is unavailable, its corresponding availability flag is false and its numeric field
is null. A null component MUST NOT be treated as zero or as evidence of weak fundamentals.
```

```text
HeatStateTransition {
  transition_id: Hash
  policy_ref: Hash
  configuration_ref: Hash
  forum_id: ForumId
  observation_ref: Hash
  prior_state: normal | watch | warm | hot | recovering | observation_unavailable
  next_state: normal | watch | warm | hot | recovering | observation_unavailable
  consecutive_hot_condition_epochs: u32
  consecutive_cooling_epochs: u32
  transition_reason: canonical sorted set<HeatTransitionReason>
  effective_mode: disabled | observe_only | shadow | soft_intervention
  global_kill_switch_observed: bool
  forum_kill_switch_observed: bool
  rollout_eligible: bool
  evaluated_at: Tick
  previous_transition_ref: Hash | null
  signature: MLDSA65Signature | null
}
```

```text
HeatInterventionDecision {
  decision_id: Hash
  policy_ref: Hash
  configuration_ref: Hash
  transition_ref: Hash
  recommendation_ref: Hash | null
  plan_ref: Hash | null
  action_step_ref: Hash | null
  target_forum_id: ForumId
  action_kind: ActionKind
  evaluation_checkpoint_ref: Hash
  base_utility: FixedDecimal
  applied_penalty: FixedDecimal
  adjusted_utility: FixedDecimal
  base_exposure: FixedDecimal | null
  adjusted_exposure: FixedDecimal | null
  diversion_applied: bool
  alternative_recommendation_ref: Hash | null
  operative: bool
  mode: disabled | observe_only | shadow | soft_intervention
  decision_reason: canonical sorted set<HeatDecisionReason>
  generated_at: Tick
  signature: MLDSA65Signature | null
}
```

Rules:

```text
adjusted_utility = base_utility - applied_penalty
0 <= applied_penalty <= configuration.max_recommendation_penalty
base_utility, adjusted_utility, base_exposure, adjusted_exposure are local recommendation values and
MUST NOT be interpreted as protocol balances, prices, payments, score commitments, or access rights.
operative=true only when mode=soft_intervention, the rollout cohort matches, no kill switch applies,
and the target action is eligible.
operative=false for disabled, observe_only, and shadow modes.
```

```text
HeatStabilizerRollback {
  rollback_id: Hash
  policy_ref: Hash
  configuration_ref: Hash
  restore_configuration_ref: Hash | null
  force_observe_only: bool
  global_kill_switch: bool
  forum_ids: canonical sorted set<ForumId>
  reason_code: String
  issued_at: Tick
  authority_pubkey: MLDSA65PublicKey
  signature: MLDSA65Signature
}
```

Rules:

```text
A valid rollback takes precedence over the referenced configuration from its issued_at time.
force_observe_only=true overrides soft_intervention but preserves observation and audit behavior.
global_kill_switch=true forces disabled behavior for all forums.
A rollback MUST NOT alter historical HeatObservation, HeatStateTransition, or
HeatInterventionDecision records.
```

### 22.8 Asset Publication Mechanics objects

All Asset Publication Mechanics objects use canonical encoding, domain-separated hashing, and ML-DSA-65 signatures where a signature field is specified. These objects are CPU-only evaluation/audit inputs for the score paths of §7.21. They are not consensus validity predicates for unrelated protocol objects.

公開経路の報酬の基準量は、当該アセット自身の認定価値`value(a)`である。`AssetPublicationEvidence`、`AssetCitationContribution`、`AssetMediatedCultivationContribution`、`PublicationDemandObservation`及び`PublicationContributionState`の各評価は、`value(a)`を基準量とし、`A_max(F,t)`を報酬の基準量にしてはならない（C1）。`A_max(F,t)`は、第7.21.6節の`A_{max}`比例係数和の上限（C4）にのみ現れる。公開経路に`A_{max}`比例の個別上限を置かない。`AssetPublicationIncentivePolicy`は本節にcanonical schemaを置かず、そのフィールド一覧を第7.21.6節に正本として定める。両節へ重複して列挙しない。

```text
AssetPublicationEvidence
  evidence_id: Hash
  asset_ref: Hash
  forum_id: ForumId
  publisher_soul_id: SoulId
  evaluation_checkpoint_ref: Hash
  evaluation_epoch_id: Hash
  evaluation_time: Tick
  asset_record_ref: Hash
  asset_version_ref: Hash
  publication_age_epochs: u32
  eligibility_status: eligible | ineligible | pending_finality | revoked | expired | unavailable
  independent_use_commitment_root: Hash | null
  independent_use_count: u32
  use_evidence_refs: canonical sorted list<Hash>
  citation_contribution_refs: canonical sorted list<Hash>
  derivative_contribution_refs: canonical sorted list<Hash>
  civic_need_fulfillment_refs: canonical sorted list<Hash>
  availability_evidence_refs: canonical sorted list<Hash>
  exclusion_commitment_root: Hash | null
  exclusion_flags: canonical sorted list<PublicationExclusionReason>
  evidence_high_water_ref: Hash | null
  valid_from: Tick
  expire: Tick | null
  authority_pubkey: MLDSA65PublicKey
  signature: MLDSA65Signature
```

`PublicationExclusionReason`は少なくとも次を含む: `self_access`、`self_purchase`、`verified_common_identity`、`same_soul`、`same_controller`、`pending_finality`、`refund`、`chargeback`、`payment_dispute`、`rights_revoked`、`invalid_lineage`、`duplicate_evidence`、`stale_availability`、`failed_audit`、`inactive_asset`、`expired_asset`、`insufficient_independent_use`、`unverified_need_fulfillment`。

```text
AssetCitationContribution
  contribution_id: Hash
  cited_asset_ref: Hash
  citing_asset_ref: Hash | null
  cited_publisher_soul_id: SoulId
  citing_publisher_soul_id: SoulId
  forum_id: ForumId
  evidence_checkpoint_ref: Hash
  citation_basis: asset_dependency | asset_lineage | citation_certificate | verified_reference | other
  authority_proof_refs: canonical sorted list<Hash>
  distinctness_proof_ref: Hash | null
  credit_state: pending | eligible | credited | excluded | revoked
  credited_epoch_id: Hash | null
  previous_credit_ref: Hash | null
  valid_from: Tick
  expire: Tick | null
  authority_pubkey: MLDSA65PublicKey
  signature: MLDSA65Signature
```

```text
AssetMediatedCultivationContribution
  contribution_id: Hash
  asset_ref: Hash
  publisher_soul_id: SoulId
  matured_soul_id: SoulId
  forum_id: ForumId
  access_proof_ref: Hash
  independent_maturity_checkpoint_ref: Hash
  maturity_evidence_refs: canonical sorted list<Hash>
  direct_cultivation_exclusion_ref: Hash | null
  distinctness_proof_ref: Hash | null
  credit_state: pending | eligible | credited | excluded | revoked
  credited_epoch_id: Hash | null
  previous_credit_ref: Hash | null
  valid_from: Tick
  expire: Tick | null
  authority_pubkey: MLDSA65PublicKey
  signature: MLDSA65Signature
```

```text
PublicationDemandObservation
  observation_id: Hash
  asset_ref: Hash
  forum_id: ForumId
  evaluation_checkpoint_ref: Hash
  evaluation_epoch_id: Hash
  observed_from: Tick
  observed_until: Tick
  independent_demand_commitment_root: Hash
  independent_demand_count: u32
  retrievable_success_count: u32
  delivery_success_count: u32
  freshness: Tick
  provider_soul_id: SoulId
  provider_device_incarnation_id: Hash
  storage_or_index_evidence_refs: canonical sorted list<Hash>
  exclusion_flags: canonical sorted list<PublicationExclusionReason>
  signature: MLDSA65Signature
```

```text
PublicationContributionState
  publisher_soul_id: SoulId
  forum_id: ForumId
  evaluation_epoch_id: Hash
  publication_bonus_bps: u16
  asset_citation_bonus_bps: u16
  asset_mediated_cultivation_bonus_bps: u16
  publication_path_bonus_bps: u16
  counted_asset_refs: canonical sorted list<Hash>
  evidence_high_water_root: Hash
  citation_credit_root: Hash
  cultivation_credit_root: Hash
  exclusion_root: Hash
  evaluation_checkpoint_ref: Hash
  signature: MLDSA65Signature
```

`publication_bonus_bps`、`asset_citation_bonus_bps`、`asset_mediated_cultivation_bonus_bps`及び`publication_path_bonus_bps`は、いずれも対応する基準量`value(a)`に適用する率である。これらを`A_max(F,t)`に適用してはならない（C1）。`publication_bonus_bps`は`publication_base_bps`（`value(a)`に適用）に、`asset_citation_bonus_bps`は`asset_citation_extension_cap_bps`（`CitationBonus`の上限）に、`asset_mediated_cultivation_bonus_bps`は`asset_mediated_cultivation_extension_cap_bps`（`CultivationBonus`の外側へ加算する`A_max`比例部分の上限）に、`publication_path_bonus_bps`は公開経路の合計に対する係数和（`publication_base_bps`と6つの`*_weight_bps`の和）に、それぞれ対応する。`counted_asset_refs`は計上対象の公開asset参照であり、件数上限を設けない。基準量の総和は`V_{S,F,e}`である（第7.21.1節）。

検証器は、`PublicationContributionState`の各bpsが評価時点で有効な`AssetPublicationIncentivePolicy`（第7.21.6節）の対応パラメータの範囲内にあること、`PublicationScore`が`A_max(F,t) * (publication_base_bps + sum_k(utility_weight_bps(k))) / 10000`を超えないこと、および第7.21.6節の係数条件`10000 * (1 - exp(-kappa_1)) + publication_base_bps + sum_k(utility_weight_bps(k)) + 10000 * gamma_F + 10000 * chi + asset_mediated_cultivation_extension_cap_bps + I_protocol_max < 10000`を必ず確認する。旧capの固定値（`MAX_PUBLICATION_BONUS_BPS_PER_ASSET_EPOCH`の45 bps、`MAX_PUBLICATION_BONUS_BPS_PER_SOUL_FORUM_EPOCH`の300 bps、`MAX_PUBLICATION_SCORE_PATH_BPS_PER_SOUL_FORUM_EPOCH`の520 bps）は第7.21.6節で廃止されたため、検証器へ埋め込んではならない（C3・C4）。

### 22.9 Civic VoteとCivicNeedAsset objectのcanonical schema

第23章が定義するCivic VoteとCivicNeedAssetのobjectは、他のobjectと同じcanonical encoding、content-addressed hash、domain separation、ML-DSA-65 signature、authority gate、`StateProofEnvelope`依存規則に従う。本節をcanonical schemaの正本とし、状態機械、受理述語、quorum及び保存則は第23章に定める。ただし本節が明示的に第23章へ繰り延べたcanonical schema（`CivicNeedBundleEntry`及び`CivicNeedAsset`）は、第23章を正本とする。

```text
CivicBallot
  forum_id: ForumId
  vote_epoch_id: Hash
  voter_soul_id: SoulId
  ballot_nullifier: Hash
  revision_sequence: u32
  previous_ballot_ref_optional: Hash | null
  allocations_sorted: canonical sorted list<CivicBallotAllocation>
  submitted_at: Tick
  signature: MLDSA65Signature

CivicBallotAllocation
  allocation_id: Hash
  origin_need_id: Hash
  target_need_id: Hash
  allocated_votes: u32
```

各CivicCitizenは、forum・epochごとに一つの現在ballotを持つ。`CivicBallot`型objectは、`CivicCitizen`（第23.3節・第23.17節）を満たすvoterのcivic ballotと、満たさないvoterのwild submissionの双方に用いる。両者は`ballot_nullifier`のdomain separationにより区別し、wild submissionは本節の票予算及びrevision chainの規則ではなく、第23.7節の規則に従う。`allocations_sorted`は`allocation_id`のcanonical byte orderで整列する。同一`ballot_nullifier`に対して連続するrevision chainだけを許可し、`revision_sequence = 0`であるか、又は`previous_ballot_ref_optional`が直前revisionを指す場合だけ受理する。同一`ballot_nullifier`及び同一`revision_sequence`に内容の異なるballotが複数存在する場合、当該nullifierはequivocationであり、そのnullifierのballotはすべて当該epochで無効とする。epoch tallyは、各valid nullifierについて最大のvalid `revision_sequence`を持つballotだけを入力にする。前epochのballotを次epochのtallyへ自動持越ししてはならない。票予算`V_F`（第2.4節）、revision chain、equivocation及びtally入力の規則は第23.4節及び第23.5節に定める。

```text
NeedSubmission
  submitted_need_id: Hash
  canonical_need_key: Hash
  description_ref: Hash
  submitter_soul_id: SoulId
  submitted_at: Tick
  signature: MLDSA65Signature
```

needの投稿と票の配分は別objectである。`canonical_need_key`はneedの同一性を決める正規化キーであり、その導出は第23.8節に定める。`submitted_need_id`は提出されたneedの識別子である。

```text
NeedMergeProposal
  merge_proposal_id: Hash
  forum_id: ForumId
  proposer_soul_id: SoulId
  proposed_need_id: Hash
  merged_summary_ref: Hash
  source_need_refs_sorted: canonical sorted list<Hash>
  source_need_content_hashes_sorted: canonical sorted list<Hash>
  local_generation_commitment_optional: Hash | null
  submitted_at: Tick
  expire: Tick | null
  signature: MLDSA65Signature

NeedMergeAttestation
  merge_proposal_ref: Hash
  validator_soul_id: SoulId
  decision: accept | reject
  evaluation_commitment_optional: Hash | null
  issued_at: Tick
  signature: MLDSA65Signature
```

`NeedMergeProposal`は対象epochの分散Civic validator committeeへP2Pで配布する。`NeedMergeAttestation`は各validatorが統合案を受理又は拒否した記録である。LLM出力、embedding類似度、vector distance、model identifier、API provider及びpromptは、Gaia protocolのconsensus validity predicateにしてはならない。source need投稿者全員の明示同意をNeedMergeの条件にしてはならない。`proposed_need_id`は統合後のneedの識別子である。validator committeeの導出、attestationの受理条件及び`2f + 1` quorumは第23.11節及び第23.15節に定める。

```text
NeedMergeFinalization
  merged_need_id: Hash
  source_need_refs_sorted: canonical sorted list<Hash>
  merged_summary_ref: Hash
  merged_queue_sequence: u64
  finality_certificate_ref: Hash
  finalized_at: Tick
```

有効な`NeedMergeFinalization`が成立したとき、統合entryをactive CivicNeedBundleへ一件だけ登録し、全source needを`active -> superseded_by_merge`へ遷移させなければならない。統合前にm件のactive source needがあり、一件のmerged needが作られた場合、active bundle件数は厳密にm-1件減少する。NeedMergeは`allocated_votes`を合算してから二乗してはならず、既存allocation atomの二乗影響の総和を増幅してはならない。`superseded_by_merge`のneedはactive CivicNeedBundleに含めず、`ActiveCivicNeedCount`に数えず、activeな`CivicNeedScore`のtargetにもCivicNeedAsset供給対象にもしない。`merged_queue_sequence`はFIFO順序に用いる`accepted_sequence`である。

```text
NeedSplitChallenge
  forum_id: ForumId
  merged_need_ref: Hash
  challenger_soul_id: SoulId
  submitted_at: Tick
  expire: Tick | null
  signature: MLDSA65Signature

NeedSplitFinalization
  merged_need_ref: Hash
  restored_need_refs_sorted: canonical sorted list<Hash>
  finality_certificate_ref: Hash
  finalized_at: Tick
```

`NeedSplitChallenge`はmerged needの分割を求める異議であり、`NeedSplitFinalization`は分割のfinalityを固定する。splitがfinalityを得た場合、merge前から存在したallocationは`origin_need_id`へ復元し、merge後にmerged needへ置かれたallocationは自動配分せず当該投票者の未配分票とする。`retired_by_split`は設けない（C8）。challengeの受理条件、finalityのquorum、復元対象allocationの同定、`restored_need_refs_sorted`の導出、およびsplitの復元先needが既にinactiveである場合の遷移は第23.13節に定める。

`civic_need_bundle_root`（第3.5節）のleafは、activeなneed entryを表す。第3.5節のroot定義、第2.4節の`max_civic_need_bundle_count`、第23.8節の`canonical_need_key`及び本節のneed lifecycleから、leafは少なくとも次を固定する。

```text
need_id: Hash
forum_id: ForumId
canonical_need_key: Hash
description_ref: Hash
submitter_soul_id: SoulId
accepted_sequence: u64
status: active | superseded_by_merge | retired_by_fifo | fulfilled
submitted_at: Tick
```

needのlifecycleは`active | superseded_by_merge | retired_by_fifo | fulfilled`である。これは`CivicNeedAsset`の状態語彙（`ranked | open_for_supply | supplied | fulfilled | retired`）とは別の状態機械である（C8）。`retired_by_fifo`、`superseded_by_merge`又は`fulfilled`のneedをtargetとするallocationはinactiveとし、activeな`CivicNeedScore`に寄与させず、別need又は別Soulへ自動移転しない。FIFO順序は`accepted_sequence`のみで決まり、`CivicNeedScore`、LLM output、API応答時刻、forum root又はvalidatorの裁量によって変わってはならない。`ActiveCivicNeedCount(F,t) <= K(F)`かつ`K(F) <= V_F`でなければならない。leafのcanonical型名、`CivicNeedScore`・`WildRaw`・allocation atomとの結合方法、FIFO退場の`retired_by_fifo`遷移、および`WildContribution`の正規化分母をepoch開始時点のactive need集合へ固定する規則は第23.7節、第23.9節及び第23.14節に定める。

分散Civic finalityのobjectは次のとおりである。

```text
CivicEpochBlock
  forum_id: ForumId
  vote_epoch_id: Hash
  snapshot_ref: Hash
  opens_at: Tick
  closes_at: Tick
  tally_finality_ref: Hash | null
  signature: MLDSA65Signature

CivicPrevote
  forum_id: ForumId
  vote_epoch_id: Hash
  epoch_block_ref: Hash
  validator_soul_id: SoulId
  signature: MLDSA65Signature

CivicPrecommit
  forum_id: ForumId
  vote_epoch_id: Hash
  epoch_block_ref: Hash
  validator_soul_id: SoulId
  signature: MLDSA65Signature

CivicVoteSeenReceipt
  forum_id: ForumId
  vote_epoch_id: Hash
  validator_soul_id: SoulId
  seen_object_ref: Hash
  seen_at: Tick
  signature: MLDSA65Signature

CivicValidatorAvailabilityCommitment
  forum_id: ForumId
  vote_epoch_id: Hash
  validator_set_root: Hash
  availability_proof_refs: canonical sorted list<Hash>
  committed_at: Tick
  signature: MLDSA65Signature

CivicFinalityCertificate
  forum_id: ForumId
  vote_epoch_id: Hash
  epoch_block_ref: Hash
  validator_set_root: Hash
  validator_set_inclusion_proof_ref: Hash
  precommit_refs: canonical sorted list<Hash>
  finalized_at: Tick
  signature: MLDSA65Signature
```

`CivicEpochBlock`はepochのprevote及びprecommitを束ねるblockである。第3.5節の`civic_epoch_registry_root`が固定する範囲は、対象Civic epochのsnapshot、`opens_at`、`closes_at`及びtally finality参照である。`CivicPrevote`及び`CivicPrecommit`はvalidatorが当該epochの`CivicEpochBlock`に対して行う投票である。`CivicVoteSeenReceipt`はvalidatorがballot又はprecommitを受領した事実を記録する。`CivicValidatorAvailabilityCommitment`（第23.15節）はvalidator集合の導出結果と可用性のコミットメントを表す。`CivicFinalityCertificate`は`2f + 1`のprecommitとvalidator集合導出のinclusion proofを含むCivic finality証明であり、validator集合は`civic_validator_set_registry_root`にコミットする。

次の事項は本節に列挙せず、第23章が確定する。`CivicEpochBlock`のprevote・precommitを束ねるMerkle rootの名前と並び順、block間の連鎖、proposer及び署名authorityの規則（第23.3節・第23.16節）。`CivicPrevote`・`CivicPrecommit`の投票対象の表現と決定語彙、およびquorum集計の規則（第23.16節）。`CivicVoteSeenReceipt`の受領証明の対象範囲（第23.16節）。`CivicValidatorAvailabilityCommitment`の可用性の意味（第23.15節）。`CivicFinalityCertificate`の`2f + 1`検証規則、quorum署名集合の表現、`validator_set_inclusion_proof_ref`の解釈、およびvalidator集合導出の具体手続（第23.15節・第23.16節）。`CivicNeedBundle`のleafのcanonical型名（`CivicNeedBundleEntry`）とそのMerkle mapのkey導出（第23.9節）。`need_id`の導出（第23.8節）と`CivicNeedAsset`のcanonical schema（第23.18節）。`ranked`から`open_for_supply`への遷移規則（第23.18節）。

`StateProofEnvelope`の`civic_vote_validity`、`civic_vote_tally_validity`、`civic_need_asset_status`、`civic_need_asset_publish_eligibility`、`civic_candidates`及び`civic_reach`は、本節の分散Civic finality objectと第3.5節の分散Civic state rootに基づかなければならない（第22.3節）。

### 22.10 TimeWitnessPolicyのcanonical schema

`TimeWitnessPolicy`は、第14.4節及び第14.5節の`time_witness_policy_ref`が指すobjectである。第14.5節の`temporal_health_policy`とは別のobjectであり、本節をcanonical schemaの正本とする。第14.4節の時刻証人の選択・代替補充・再試行の手続は本節のpolicyに従う。

```text
TimeWitnessPolicy
  allowed_time_sources: canonical sorted list<Hash>
  allowed_witness_domains: canonical sorted list<Hash>
  max_parallel_requests: u32
  max_retry_count: u32
  retry_backoff_initial: u64
  retry_backoff_max: u64
  retry_backoff_exponent_cap: u32
  collection_deadline: u64
```

- `allowed_time_sources`: 許可する`time_source_id`の集合
- `allowed_witness_domains`: 許可する`witness_domain_id`の集合
- `max_parallel_requests`: 並列要求数の上限
- `max_retry_count`: 同一requestにおける当該時刻証人への再試行回数の上限
- `retry_backoff_initial`: 最初のbackoff
- `retry_backoff_max`: 最大backoff
- `retry_backoff_exponent_cap`: `retry_delay(k) = min(retry_backoff_max, retry_backoff_initial * 2^min(k, retry_backoff_exponent_cap))`の指数の飽和上限
- `collection_deadline`: 手続全体のdeadline

`TimeWitnessPolicyInvalid`は、少なくとも次のwell-formedness条件を検査する。`allowed_time_sources`及び`allowed_witness_domains`が空でないこと。`max_parallel_requests >= required_observer_domains`であること（第14.5節の既存フィールド名を用い、`required_witness_domains`を導入しない。C6）。`retry_backoff_initial <= retry_backoff_max`であること。`retry_backoff_exponent_cap`が有限であり、飽和しない指数を許さないこと。`max_retry_count`が有限であること。`collection_deadline`が手続全体のdeadlineとして正であること。これらを満たさないpolicyを参照するforumは、時刻証人quorumを成立させず、`TemporalUnverifiable`としてfail-closedで拒否する（第14.4節）。

`TimeWitnessPolicy`も第22.1節のとおりcanonical encoding、content hash、ML-DSA-65署名を備える。署名authority、有効期間及び`policy_id`の与え方は本節を正本として次に固定し、第2.4節及び第14.5節は当該policyへのforum-localな参照だけを定める。`policy_id`は当該objectのcanonical object hashであり、別のID体系を導入しない。署名authorityは、当該forumのroot authority（第5章）である。第2.4節のgenesisは`temporal_health_policy.time_witness_policy_ref`で当該objectを固定するだけであり（第14.5節）、genesis自身は署名authority・`policy_id`・有効期間を定義しない。有効期間は、当該参照が指すobjectが取消されていない限りにおいて有効であり、参照の差し替えはgenesisのcanonical encodeを変えて`forum_id`を変えるため（C6）、本節は別の期間フィールドを導入しない。本節でこれらを改名・追加しない。`TimeWitnessPolicy`へフィールドを追加する場合、既存forumの`time_witness_policy_ref`が指すobjectが新しいフィールドを省略時既定値で解釈できるようにしなければならない。参照を差し替える必要を生じさせてはならない。参照が変わると、genesisのcanonical encodeを経由して`forum_id`が変わる（第2.3節、C6）。省略時既定値の具体値は第27章の移行規則に定める。

---

## 23. Civic VoteとCivicNeedAsset

Civic Voteは、forumが現在必要とするassetのneed listを継続的に形成する仕組みである。これは代表者を選ぶ選挙ではない。CivicCitizenが限られた持ち票をneedへ配分し、その二乗影響によって必要性の強さを表明する既存の二乗投票機構を維持する。LLM統合は、同種・類似・関連するneedを一件へ圧縮し、限られたbundle件数の中でneed coverageを高めるための機構であり、二乗投票、`CivicNeedScore`、CivicCitizenの持ち票又はCivic influenceを置換・増幅してはならない。FIFOは、active CivicNeedBundleの件数を有限に保つための機構である。

Civic Voteの確定は、forum rootの単独集計ではなく、epochごとの分散Civic validator committeeのBFT finalityにより行う。`CivicVoteCommitment`、`CivicVoteNullifier`及び`CivicVoteTally`という単一writer集計のobjectは本版で廃止し、`CivicBallot`、`NeedSubmission`、`NeedMergeProposal`、`NeedMergeAttestation`、`NeedMergeFinalization`、`NeedSplitChallenge`、`NeedSplitFinalization`、`CivicEpochBlock`、`CivicPrevote`、`CivicPrecommit`、`CivicFinalityCertificate`、`CivicVoteSeenReceipt`、`CivicValidatorAvailabilityCommitment`及び`CivicNeedAsset`による状態機械へ置き換える（第22.1節、第22.9節）。

機構の役割は次のとおりである。

| 機構 | 役割 |
|---|---|
| 二乗投票 | 各needに対する必要性の強さを測る |
| `CivicNeedScore` | active bundle内のneedの必要性・供給候補としての強さを表す |
| LLM統合 | 関連needを一件へ圧縮し、bundle coverageを高める |
| FIFO | active CivicNeedBundleの件数をgenesis上限以下に保つ |
| BFT finality | ballot、need、merge、split、FIFO退場及びtallyの状態を分散的に確定する |

Civic Vote及びCivicNeedAssetは、`Q`、`depth`、`CanIssue`、`CanIssueTo`、`A_seed`、通常`AssetScore`、通常の発行権、通常アセットアクセス、通常の`Candidates`又は通常の`Reach`を変更してはならない（第17.7節、第23.18節、第23.19節）。

### 23.1 目的と非目的

公共層では、「次にforumに必要なアセットは何か」を、市民が直接・定量的に表明する。これは多数決で代表を選ぶのではなく、CivicCitizen一人ひとりの必要の強さを集計し、強い需要を持つneedを`CivicNeedAsset`として供給可能にする。eKYCにより確認された現実の一意な責任主体だけが正規の市民票を持ち、未確認Soul群は探索用のWild Signalとして全体影響を有界に保ったまま参加できる（第1.1節、第17.7節）。

本節の非目的を固定する。次は本仕様全体で禁止する。

- Civic Voteを代表者選出、委任投票又は議席配分として扱うこと
- LLM統合、embedding類似度、vector距離、model identifier、API provider又はpromptにより、二乗投票、`CivicNeedScore`、持ち票又はCivic influenceを置換、増幅又は再配分すること
- `CivicNeedScore`によりFIFO順序又はFIFO退場を変更すること
- Civic Voteの票、影響、資格又は`need_id`を対象とする権利を、売買、譲渡、貸与、担保化、相続又は委任の対象にすること
- eKYC service、forum root、Payment-Service又は任意の一参加者が、投票先、票数、`CivicNeedScore`、順位、needの状態又は`CivicNeedAsset`の状態を裁定・変更すること
- Civic Vote又はCivicNeedAssetを、通常のGaia参加、通常証明書、通常アセット市場、forum創設又は通常P2P通信の前提条件にすること
- 第三の通貨、新しい成熟度又は売買可能な公共影響力を作ること

### 23.2 genesis固定値 V_F と K(F)

forum `F`における一人のCivicCitizenのepoch当たりの総持ち票を、既存のgenesis値で定義する（第2.4節）。

\[
V_F=genesis.max\_civic\_vote\_count
\]

\[
V_F\in\mathbb{Z},\qquad V_F\ge1
\]

`V_F`は、一人が一つのCivic epochにおいて、全need群へ合計で配分できる持ち票である。`V_F`はneed一件当たりの宣言上限ではなく、active CivicNeedBundleの件数上限でもない。

forum `F`が同時に保持できるactiveなCivicNeed entryの最大数を、genesis値で定義する。

```text
K(F) = genesis.max_civic_need_bundle_count
K(F) >= 1
```

任意の時点`t`において、active CivicNeedBundleは必ず次を満たさなければならない。

\[
0\le ActiveCivicNeedCount(F,t)\le K(F)
\]

さらに次を必須制約とする。

\[
K(F)\le V_F
\]

一人のCivicCitizenが一つのCivic epochにおいて全active needへ最低1票ずつ配分できることを保証するためである。持ち票がneed一件当たりの上限からepoch総予算へ変わることにより、一人の市民がある一つのneedへ与えられる最大影響は`V_F^2`のままであるが、全needへ均等配分した場合の1 needあたりの影響は`(V_F / K(F))^2`まで低下する。`K(F) > V_F`を許すと、未確認層の`WildContribution`（epoch総和1に正規化）が個別needにおいて確認市民を上回り得るため、第23.6節の`V_F^2 : 1`の優越が単一needへの集中時のみ成立する状態になる。`K(F) <= V_F`により、最悪の場合でも1 needあたり`1`の影響が保証される。

`K(F) = 1`を既定にしてはならない。`K(F) = 1`はforumが同時に1件のneedしか保持できないことを意味し、Civic Voteを実質的に停止させる。`K(F) <= V_F`を満たす最大値、すなわち`K(F) = V_F`が、既存forumのCivic機能を最も損なわない既定値である。

Civic Voteの二乗影響、unverified Soul群の正規化、CivicCitizenの検証、ballot revision、need merge、need split、FIFO退場、validator committee及びBFT finalityの規則は、gaia-core全体で共通に固定する。forumが定められる値は`max_civic_vote_count`及び`max_civic_need_bundle_count`の2つだけであり、これらはgenesis作成後に変更してはならない（第2.4節）。

`max_civic_vote_count`は、本版において「一つのNeedAsset proposalへ宣言できる最大の整数投票数」から、上記のepoch総予算`V_F`へ再定義された。この再定義、`max_civic_need_bundle_count`の追加及び省略時既定値`K(F) = V_F`の移行規則は第27章に定める（C6）。第23.4節の票予算、第23.17節の不変条件は、need一件当たりの上限ではなくepoch総予算として`V_F`を用いる。

### 23.3 Civic epoch と snapshot

Civic Voteは選挙の終了ではなく、継続的なneedの必要性を観測する仕組みである。ただし、票の有限予算、二重投票防止及びBFT finalityのため、ballotとtallyはepoch単位で確定する。

epochのdescriptorを固定する。本章で`CivicEpoch`と呼ぶものは、登録済みobjectである`CivicEpochBlock`が固定するepoch descriptorそのものであり、別のobject型を導入しない（C8、C9。第22.1節、第22.9節）。

```text
CivicEpochBlock
  forum_id: ForumId
  vote_epoch_id: Hash
  snapshot_ref: Hash
  opens_at: Tick
  closes_at: Tick
  tally_finality_ref: Hash | null
  signature: MLDSA65Signature
```

`vote_epoch_id`はepoch descriptorのcanonical content hashであり、少なくとも次でdomain separationする。

\[
vote\_epoch\_id=hash(\texttt{"gaia-civic-epoch-v1"}\parallel forum\_id\parallel snapshot\_ref\parallel opens\_at\parallel closes\_at)
\]

epochの評価checkpoint`q_e`は、`snapshot_ref`が指す最終化済み`ForumStateCheckpoint`とする。`q_e`の`checkpoint_time`が当該epochの唯一の評価時刻であり、`opens_at`及び`closes_at`は当該checkpointの時刻尺度で解釈する。

- `CivicCitizen`資格（第17.7節）、membership、Soul及び健康、eKYC credentialの失効状態、ballot nullifierの採用revision、`CivicValidatorSet`の導出、needの状態、`CivicNeedAsset`のstatusは、すべて`checkpoint_time(q_e)`で評価する。異なるcheckpoint時刻の状態を混在させてはならない（第3.5節）
- `opens_at < closes_at`でなければならない
- 当該epochのtallyのfinalityは`tally_finality_ref`が指す`CivicFinalityCertificate`で固定する。finality成立前の`tally_finality_ref`はnullとする
- 同一forumの連続するepochは、`snapshot_ref`が指すcheckpointの`state_sequence`が狭義単調増加する順に連鎖する。同一`vote_epoch_id`に対して異なるdescriptorがfinalityを得た場合、それは`CivicFinalityConflict`である
- epochのBFT finalityが成立していない場合、そのepochのCivic stateは確定していないものとして扱い、`TemporalUnverifiable`と同様にfail closedとする
- ballotの`vote_epoch_id`が対象epochの`vote_epoch_id`と一致しない場合、`CivicVoteEpochMismatch`として拒否する
- claimが参照するcheckpointが当該epochの`q_e`と一致しない場合、`CivicVoteCheckpointMismatch`として拒否する

CivicNeedBundleはepochをまたいで継続する。need entryはepochの境界で消滅せず、`accepted_sequence`を保持する。一方、ballotはepochごとに提出又はrevisionし、前epochのballotを次epochのtallyへ自動持越ししてはならない。needが引き続き必要なら利用者は次epochにも票を配分し、不要なら配分しなければよい。`CivicNeedScore`は各epochの最終ballotから再計算する。FIFO順序は`accepted_sequence`のみで決まり、`CivicNeedScore`、LLM output、API応答時刻又はvalidator到着順では変わらない（第23.9節、第23.14節）。

CivicCitizen判定は、対象claimの評価checkpointの時刻で行い、その時点の`EkycRevocationState`によりcredentialが未失効でなければならない（第17.6節）。

\[
issued\_at(c)<checkpoint\_time<expire(c)
\]

credentialが後に失効、期限切れ又は更新された場合でも、過去に確定したtally、過去の`CivicNeedScore`、過去のneed順位及び過去checkpointにおけるCivicCandidates/CivicReachを遡及変更してはならない。将来のcheckpointにおいてCivicCitizenであり続けるには、期限内で未失効のcredential又は正当に更新された新credentialを提示しなければならない。

CivicCitizen判定は、現在のtrust epochとcontroller bindingに束縛される。

\[
CivicCitizen(S,F,t)\Rightarrow CredentialBoundToCurrentController(S,TrustEpoch(S,t),t)
\]

Soul Transfer finalization後、譲渡前controllerの`IdentityBindingCredential`は、後継controllerのCivicCitizen資格に使えない。Civic層は実在責任主体に基づく公共層であるため、譲渡後の非承継を特に強く規定する。過去の`CivicBallot`、wild submission、ballot nullifier及び確定済みtallyは投票時点のcontroller及びtrust epochに帰属し、譲渡後の買主は売主の過去票、投票回数、持ち票予算、nullifierを継承しない。既に確定したtallyを、Soul譲渡を理由に再集計・取消・再帰属しない。

eKYCの通常ゲーム非関与は、cell path制限付きで成立する。`membership_ekyc_policy(F) = not_required`のforumでは、任意のSoul・評価時点について、eKYC credentialの有無だけを変えても、他の入力が同一なら`Q`、`depth`、`CanIssue`、`CanIssueTo`、`A_seed`、`EarlyBonus`、`CultivationBonus`、`CitationBonus`、`AssetScore`、通常`Candidates(a,F,t)`、通常`Reach(a,F,t)`は不変である。`membership_ekyc_policy(F) = verified_required`のforumでは、`EkycMembershipEligible`が`ActiveMember`の条件であり（第4.2節、第13.2節）、forum参加境界のpathに限り、eKYCの有無が`ActiveMember`、`T_actual`、`depth`、`Q`寄与、`AssetScore`、`Candidates`、`Reach`を変化させ得る。この変化は`membership_ekyc_policy`が明示的に選んだforum参加境界の効果であり、`ActiveMember`述語（第4.2節、第13.2節）を唯一の経路とする（第24.19節の項目11）。したがって`not_required`のforumでは、通常ゲームの別経路（発行資格、`A_seed`、`EarlyBonus`、`CultivationBonus`、`CitationBonus`、`CanPublishAsset`）をeKYCの有無だけで変化させてはならない（第24.19節の項目12）。`verified_required`のforumでは、`A_seed`、`EarlyBonus`、`CanPublishAsset`は`Q`・`depth`の下流量として同じ`ActiveMember`経路を通じてのみ変化し得て、`ActiveMember`以外の経路でeKYCの有無だけを変えてもこれらは変化しない（第24.19節の項目13）。Civic Voteの正規市民票の重み、`V_F`、`CivicNeedScore`、needの状態、`CivicNeedAsset`のstatusは、`membership_ekyc_policy`によって変化しない（第24.19節の項目14）。

Soul又はforum root transfer freeze中は、対象controllerについて次を拒否する。

- `CivicBallot`及びwild submissionの提出
- `CivicNeedAsset`供給資格を使うAssetRecord公開
- CivicCandidates又はCivicReachの対象となる新しい人格的資格claim

forum root transfer freeze中も、既に確定済みの自動的・決定論的なtally計算は、root authorityに依存しない形で実行・署名できる者を明確にし、凍結によって公共集計が欠落しないようにする。ただし凍結中に新しいepochのfinalityをroot単独で成立させてはならない（第23.15節、第23.16節）。

### 23.4 CivicBallot と票予算

各CivicCitizenは、forum・epochごとに一つの現在ballotを持つ。ballotのcanonical schemaは第22.9節に定める。

```text
CivicBallot
  forum_id: ForumId
  vote_epoch_id: Hash
  voter_soul_id: SoulId
  ballot_nullifier: Hash
  revision_sequence: u32
  previous_ballot_ref_optional: Hash | null
  allocations_sorted: canonical sorted list<CivicBallotAllocation>
  submitted_at: Tick
  signature: MLDSA65Signature

CivicBallotAllocation
  allocation_id: Hash
  origin_need_id: Hash
  target_need_id: Hash
  allocated_votes: u32
```

CivicCitizen `S`のballot内の各allocation `a`について、次を必須とする。

\[
0\le allocated\_votes(a)\le V_F
\]

\[
\sum_{a\in Ballot(S,F,e)}allocated\_votes(a)\le V_F
\]

一人が全needに`V_F`票ずつ置くことを許してはならない。一人が一つのepochで全need群へ配分できる票の総量は`V_F`である。予算を超えるballotは`CivicBallotVoteBudgetExceeded`として拒否する。

`allocations_sorted`は`allocation_id`のcanonical byte orderで整列する。`allocation_id`はallocation atomのcanonical content hashであり、同一ballot内で一意でなければならない。`origin_need_id`は当該票が元来配分されたneedを、`target_need_id`は現在の寄与先needを表す。利用者が自ら提出するballotでは両者は一致し、両者が異なるのはneedのmerge又はsplitを第23.12節及び第23.13節の規則が処理した結果に限られる。利用者が`target_need_id`を直接書換えたballotは`CivicBallotOriginTargetMismatch`として拒否する。利用者が自らのballotで`target_need_id`をactiveでないneedへ向けた場合、`CivicBallotInactiveNeedTarget`として拒否する。merge、split又はFIFO退場の結果としてtargetがinactiveになったallocationは、ballotの拒否理由ではなく、第23.14節のinactive allocationとして扱う。ballot自体のcanonical encoding、署名、`allocation_id`の一意性又は`allocations_sorted`の整列順序が不正な場合、当該ballotは`InvalidCivicBallot`、当該allocationは`InvalidCivicBallotAllocation`として拒否する。

利用者はballot revisionにより、epoch内で票を再配分できる（第23.5節）。

```text
Example:
V_F = 15

Need A = 10 votes
Need B = 3 votes
Unused = 2 votes
```

この場合、第23.6節の二乗影響により次となる。

\[
CivicInfluence(Need\ A)=10^2=100
\]

\[
CivicInfluence(Need\ B)=3^2=9
\]

needの投稿と票の配分は別objectである。投稿者は、新needを提出するとき、又は既存needへの必要性を変更するとき、最新の`CivicBallot`に票配分を含めてよい（第23.8節）。

CivicCitizen資格を持たないSoulの`CivicBallot`型objectはcivic ballotとして受理せず、Wild Signalのsubmissionとしてのみ扱う（第23.7節）。civic ballotの正当性は、CivicCitizen proof、票予算、nullifier及びrevision chainにより検証し、eKYC service、forum root、Payment-Service又は任意の一参加者の裁量を入力にしてはならない。

### 23.5 Ballot nullifier、revision、equivocation

一人のCivicCitizenが同一forum・同一vote epochで複数の正規市民票を得ることを防ぐため、`ballot_nullifier`を使う。`ballot_nullifier`は、同一の現実責任主体、同一forum、同一vote epochについて決定論的に一意でなければならず、別forum又は別vote epochの投票との無関係な連結を不要に作ってはならない。導出は少なくとも次でdomain separationする。

\[
ballot\_nullifier=hash(
\texttt{"gaia-civic-ballot-nullifier-v3"}
\parallel forum\_id
\parallel vote\_epoch\_id
\parallel controller\_identity\_commitment
\parallel trust\_epoch
)
\]

trust epochをnullifier導出に含めることにより、Soul Transfer後の旧controllerのnullifierが後継controllerの投票枠として再利用されることを防ぐ。wild submissionのnullifierは別のdomain stringで導出し（第23.7節）、civic ballotのnullifierと衝突させてはならない。旧nullifier形式は`CivicBallot`のnullifierとして受理しない。移行規則は第27章に定める。

同一`ballot_nullifier`に対して、連続するrevision chainだけを許可する。

```text
ValidBallotRevision(B) =
    ValidBallotNullifier(B)
    AND CivicCitizen(B.voter, B.forum, B.epoch)
    AND BallotVoteSum(B) <= V_F
    AND (
        B.revision_sequence = 0
        OR
        B.revision_sequence =
            PreviousBallot(B).revision_sequence + 1
    )
    AND PreviousBallotReferenceIsCorrect(B)
```

`PreviousBallotReferenceIsCorrect(B)`は、`B.revision_sequence = 0`かつ`previous_ballot_ref_optional = null`であるか、又は`B.revision_sequence > 0`かつ`previous_ballot_ref_optional`が同一nullifier・同一epoch・`revision_sequence - 1`のvalid ballotを指すことを要求する。`previous_ballot_ref_optional`が指すballotが存在しない、又は`revision_sequence`が1つを超えて飛んでいる場合、当該ballotは`CivicBallotRevisionGap`として拒否する。

同一`ballot_nullifier`及び同一`revision_sequence`に内容の異なるballotが複数存在する場合、当該nullifierはequivocationである。これは`CivicBallotNullifierEquivocation`又は`CivicBallotRevisionFork`として拒否する。

```text
EquivocatedBallotNullifier =>
    all ballots for that nullifier are invalid in the epoch
```

epoch tally は、各valid nullifierについて最大のvalid `revision_sequence`を持つballotだけを入力にする。1 valid final ballot per nullifier per epochが成立する。

採用された最終revisionは`civic_ballot_nullifier_registry_root`（第3.5節）にコミットする。同rootは、当該forumの`ballot_nullifier`から、そのnullifierについて採用された最大のvalid `revision_sequence`と当該ballotのcontent hashへのMerkle mapのrootである。したがって、あるballotがtally入力であることは、同rootへのinclusion proofと、他のrevisionが同rootに含まれないことによりオフライン検証できる。

### 23.6 二乗影響と CivicNeedScore

allocation `a`のCivic影響は次とする。

\[
CivicInfluence(a)=allocated\_votes(a)^2
\]

need `N`の`CivicNeedScore`は次とする。

\[
CivicNeedScore(N,F,e)
=
\sum_{\substack{a\\target\_need\_id(a)=N}}
allocated\_votes(a)^2
+
WildContribution(N,F,e)
\]

verified CivicCitizen一人の最大影響は、従来どおり次である。

\[
MaxCivicInfluence_F=V_F^2
\]

したがって、未確認層のepoch総影響上限が1であることから、CivicCitizen一人が最大票数を単一needへ集中した場合の最大差は`V_F^2 : 1`である。`V_F=15`は一例にすぎず、この場合に限り最大集中影響は225である。`V_F`はforumのgenesisで不変に固定される。

`CivicNeedScore`は、active bundle内のneedの必要性・供給候補としての強さを表す。`CivicNeedScore`はFIFO順序又はFIFO退場を変更してはならない（第23.9節、第23.14節）。同一`CivicNeedScore`の場合の順序は、need objectのcanonical hashのcanonical byte order比較により決定する。実装固有の提出順、到着順、DB順、乱数又はwall clock表示順に依存してはならない。

未確認SoulのWild Signalは、第23.7節の全体正規化規則を維持する。Wild Signalは、CivicCitizenの二乗票を無制限に増幅又は置換してはならない。

### 23.7 Wild Signal の有界正規化

Wild Signalは、CivicCitizenでないSoulが提出する探索用・参考用入力である。Wild Signalのsubmissionは`CivicBallot`型objectを再利用して表す。これは`CivicVoteCommitment`の削除に対する置換であり、新object型を導入しない（C9）。wild submissionは、`CivicCitizen`を満たさない`voter_soul_id`を持つ`CivicBallot`型objectであり、次の規則に従う。

- `ballot_nullifier`は`"gaia-civic-wild-nullifier-v3"`をdomain stringとして導出し、civic ballotのnullifierと区別する
- `revision_sequence = 0`及び`previous_ballot_ref_optional = null`に固定する。wild submissionはballot revisionの対象にしない
- 第23.4節の`V_F`予算を適用しない。`allocated_votes`は非負の生入力`w`として解釈する
- 同一forum・同一epoch・同一`voter_soul_id`につき一つだけ採用する。同一`ballot_nullifier`の重複は`CivicBallotNullifierEquivocation`として扱う
- wild submissionはcivic ballotのtally入力にならず、civic ballotもwild submissionの入力にならない

unverified Soulの`voter_soul_id`が提出する非負の生入力を`w(S,N,e)`とする。need `N`の未確認層生入力を次で定義する。

\[
WildRaw(N,e)=\sum_{S\in Unverified(F,e)}w(S,N,e)
\]

未確認Soul群の正式集計への寄与は、need全体で総和1となるよう正規化する。

\[
WildContribution(N,F,e)=
\begin{cases}
0 & \text{if }\sum_{N'}WildRaw(N',F,e)=0\\[8pt]
\dfrac{WildRaw(N,F,e)}{\sum_{N'}WildRaw(N',F,e)} & \text{otherwise}
\end{cases}
\]

正規化の分母を\(\mathcal{N}_0(F,e)\)と書く。\(\mathcal{N}_0(F,e)\)は、epoch \(e\)の開始時点でactiveであったneed entryの集合に固定する。epoch開始後にfinalityで登録されたneed entryの`WildContribution`は当該epochにおいて0とし、分子にも分母にも算入しない。したがって必ず次となる。

\[
\sum_N WildContribution(N,F,e)
=
\sum_{N\in\mathcal{N}_0(F,e)} WildContribution(N,F,e)
\in\{0,1\}
\]

正規化の分母\(\mathcal{N}_0(F,e)\)は「現在activeなneed集合」ではなく、**epoch開始時点でactiveであったneed集合に固定する**。分母を現在のactive need集合にすると、FIFO退場、mergeによるsource needのsupersession、splitにより母集団が縮み、新しい票が一切ないのに残りのneedの`WildContribution`が増加する。これは未確認層の影響が操作なしに増えることを意味し、本節の有界性の意図に反する。分母を固定すれば、各needの`WildContribution`は当該epoch内で不変である。

`WildRaw` atomの保存則を次のように固定する。

- mergeの場合、source needの`WildRaw` atomは`target_need_id`のみをmerged needへ更新し、合算してから再正規化してはならない。allocation atomと同じ保存則に従う（第23.12節）
- splitの場合、merge前から存在した`WildRaw` atomは`origin_need_id`へ復元する。merge後にmerged needへ置かれた`WildRaw` atomはinactiveとし、自動配分しない（第23.13節）
- FIFO退場、supersession又はsplitによりinactiveとなった`WildRaw` atomは、activeな`CivicNeedScore`に寄与しない
- `WildRaw`の提出はballotと独立であるため、ballot revisionによる再配分の対象にしない。`WildRaw` atomのtarget変更は、同一の`origin_need_id`を保持する限りにおいてmergeとsplitの規則だけが行う
- inactiveな`WildRaw` atomを、voterの未配分票又は新しいneedの影響へ自動的に移してはならない
- NeedMerge、NeedSplit、FIFO退場及びsupersessionの前後で、`WildRaw` atomの総量は不変である

この規則により、unverified Soulが何人いても、何個のSoulを生成しても、そのepochの正式`CivicNeedScore`に与えられる未確認層全体の寄与は最大1である。validでないwild submission、正規化に反する集計又は分母の動的変更は`InvalidWildSignalNormalization`として拒否する。

### 23.8 NeedSubmission と canonical_need_key

needの投稿を、次の不変objectにより記録する。canonical schemaは第22.9節に定める。

```text
NeedSubmission
  submitted_need_id: Hash
  canonical_need_key: Hash
  description_ref: Hash
  submitter_soul_id: SoulId
  submitted_at: Tick
  signature: MLDSA65Signature
```

needの投稿と票の配分は別objectである。`NeedSubmission`はneedの提出だけを表し、票を含まない。`CivicBallot`は票の配分だけを表し、needの内容を含まない。

`canonical_need_key`はneedの同一性を決める正規化キーであり、次で導出する。

\[
canonical\_need\_key=hash(\texttt{"gaia-civic-need-key-v1"}\parallel forum\_id\parallel description\_ref)
\]

`description_ref`はcanonical encodingされたcontent-addressed objectへの参照であるため、同一内容のneedは同一の`canonical_need_key`を与える。`description_ref`がcanonical encodingでない、又は解決できない場合、当該submissionは`InvalidNeedSubmission`として拒否する。

`need_id`は、need entryの識別子であり、次で導出する。

\[
need\_id=hash(\texttt{"gaia-civic-need-id-v1"}\parallel forum\_id\parallel canonical\_need\_key)
\]

`submitted_need_id`は提出行為の識別子であり、need entryの識別子ではない。

\[
submitted\_need\_id=hash(\texttt{"gaia-civic-need-submission-v1"}\parallel forum\_id\parallel canonical\_need\_key\parallel submitter\_soul\_id\parallel submitted\_at)
\]

`need_id`は`canonical_need_key`のみに依存するため、同一forumで同一内容のneedが複数回提出されても、activeなneed entryは一件だけである。既にactive又はinactiveなentryが存在する`canonical_need_key`の提出は、新しいentryを作らず、`accepted_sequence`を変更しない。これにより、再提出によるFIFO順序の若返りを防ぐ（第23.9節）。

needの投稿はLLMを要求しない。LLM又はembeddingを利用できないnodeは、`description_ref`と`canonical_need_key`を持つraw needを直接提出できなければならない（第23.10節）。

needのentryは、正当な`NeedSubmission`とepochのBFT finalityによりactive CivicNeedBundleへ登録される。登録時に`accepted_sequence`を確定し（第23.9節）、`civic_need_bundle_root`及び`civic_need_archive_root`へコミットする。

### 23.9 active CivicNeedBundle と FIFO

active CivicNeedBundleは、activeなCivicNeed entryの集合である。そのleafは次のcanonical型で固定する。

```text
CivicNeedBundleEntry
  need_id: Hash
  forum_id: ForumId
  canonical_need_key: Hash
  description_ref: Hash
  submitter_soul_id: SoulId
  accepted_sequence: u64
  status: active | superseded_by_merge | retired_by_fifo | fulfilled
  submitted_at: Tick
```

`civic_need_bundle_root`（第3.5節）は、activeなentryだけを、次の順序で並べたleaf列のMerkle rootとする。

```text
sort_by(
    accepted_sequence ascending,
    need_id canonical byte order ascending
)
```

Merkle mapのkeyは`need_id`とし、leafは`hash(need_id || canonical_encode(CivicNeedBundleEntry))`とする。inclusion proofは、当該leafと、上記順序における位置を含む。これにより、entryの包含とFIFO順序の両方をオフラインで検証できる。

`accepted_sequence`は、当該entryの登録を確定した`CivicFinalityCertificate`が参照する最終化済みcheckpointの`state_sequence`とする。next entryの`accepted_sequence`は狭義単調増加しなければならない。

```text
accepted_sequence = state_sequence of the admission checkpoint
```

local wall clock、投稿の受信順、forum rootの裁量、validatorの到着順、LLM出力又はAPI応答時刻をFIFO順の根拠にしてはならない。`accepted_sequence`はBFT finalityにより確定したsequenceだけを用いる。

統合を利用して古いneedを若返らせてはならない。

```text
merged_queue_sequence =
    min(
        source_need.accepted_sequence
        for source_need in source_need_refs
    )
```

新しいactive need又はmerged needの追加後にbundle件数が`K(F)`を超える場合、最古のactive entryをFIFOにより退場させる。

```text
while ActiveCivicNeedCount(F, t) > K(F):
    retire oldest active CivicNeedBundleEntry
```

`sort_by(accepted_sequence ascending, need_id canonical byte order ascending)`の順序は、同一時刻に登録されたentryの間でも決定的である。`ActiveCivicNeedCount(F,t)`は`civic_need_bundle_root`に含まれるactiveなentryの件数であり、`K(F)`を超えてはならない。超過は`CivicNeedBundleCapacityExceeded`として拒否する。確定済み`accepted_sequence`の書換え、又は最終値より小さいsequenceの再割当ては`CivicNeedFifoSequenceReset`として拒否し、確定済み`accepted_sequence`と`CivicNeedScore`又はLLM outputに基づく順序の変更は`CivicNeedFifoOrderViolation`として拒否する。

### 23.10 Local AI Need Aggregation

needを投稿するnodeは、自身のdevice上でLLM、embedding、vector search又は同等の意味検索機構を使い、現在のactive CivicNeedBundle及び取得可能なarchive内から、同種・類似・関連するneedを探索してよい。

```text
NeedAggregationLocalConfig {
    llm_base_url
    embedding_base_url
    llm_api_key_reference
    embedding_api_key_reference
    model_identifier
    embedding_model_identifier
    local_vector_store_reference
    retrieval_top_k
    maximum_input_tokens
}
```

`NeedAggregationLocalConfig`はnode-localな設定であり、Gaia P2P objectでもgenesisでもない。Gaia protocolは、中央LLM、中央embedding service、中央vector database、中央prompt service又は中央AI judgment serviceを持ってはならない。

- API key、base URL、prompt、local vector index、private context及びLLMの内部推論をGaia P2P objectに含めてはならない
- 外部APIを使う場合も、計算費用、API key、送信内容及び利用責任は投稿者又はvalidator自身のdevice側に帰属する
- LLM又はembeddingを利用できないnodeはraw needを直接提出できなければならない
- LLMの使用可否、モデル種別、GPU、CPU、API料金、`AssetScore`、`Q`、`depth`、CivicCitizen資格及びvalidator権限を相互に結び付けてはならない

したがって、LLMを使えることだけを理由に`CivicNeedScore`、持ち票、validator資格又は供給資格が増減してはならない。`NeedAggregationLocalConfig`の内容は検証バンドルの依存閉包に含めず、その欠落をclaimの拒否理由にしてはならない。

### 23.11 NeedMergeProposal と validator 自動評価

投稿者のlocal AIは、関連needの探索結果を用いて`NeedMergeProposal`を生成してよい。canonical schemaは第22.9節に定める。

```text
NeedMergeProposal
  merge_proposal_id: Hash
  forum_id: ForumId
  proposer_soul_id: SoulId
  proposed_need_id: Hash
  merged_summary_ref: Hash
  source_need_refs_sorted: canonical sorted list<Hash>
  source_need_content_hashes_sorted: canonical sorted list<Hash>
  local_generation_commitment_optional: Hash | null
  submitted_at: Tick
  expire: Tick | null
  signature: MLDSA65Signature

NeedMergeAttestation
  merge_proposal_ref: Hash
  validator_soul_id: SoulId
  decision: accept | reject
  evaluation_commitment_optional: Hash | null
  issued_at: Tick
  signature: MLDSA65Signature
```

`source_need_refs_sorted`は`need_id`のcanonical byte orderで整列し、`source_need_content_hashes_sorted`は対応する`CivicNeedBundleEntry`のcanonical content hashを同じ順序で並べる。`expire`が非nullの場合、`expire > submitted_at`でなければならない。

`NeedMergeProposal`は対象epochの分散Civic validator committeeへP2Pで配布する。各validatorは、自身のdevice上のLLM、embedding、vector search、規則ベース検査又は同等のローカル手段を使い、統合案がsource need群を妥当にカバーするかを自動評価してよい。各validatorが同一のLLM、同一API、同一embedding又は同一promptを使う必要はない。

source need投稿者全員の明示同意を、NeedMergeの条件にしてはならない。NeedMergeのfinalityは、投稿者の個別同意ではなく、epoch validator committeeのBFT quorumによる。

LLM出力、embedding類似度、vector distance、model identifier、API provider又はpromptは、Gaia protocolのconsensus validity predicateにしてはならない。`local_generation_commitment_optional`及び`evaluation_commitment_optional`は、生成又は評価の再現性のための任意のcommitmentであり、その内容を検証条件に含めてはならない。

```text
ValidNeedMerge(M) =
    SourceNeedRefsAreDistinct(M)
    AND EverySourceNeedExists(M)
    AND EverySourceNeedIsActive(M)
    AND AcceptedNeedMergeAttestations(M) >= 2f + 1
    AND ValidCivicFinalityCertificate(M)
```

ここでcommittee sizeは`n >= 3f + 1`、finality quorumは`2f + 1`とする（`n`及び`f`の導出は第23.15節）。`SourceNeedRefsAreDistinct(M)`は`source_need_refs_sorted`に重複がないことを、`EverySourceNeedExists(M)`は各source needが`civic_need_bundle_root`又は`civic_need_archive_root`に存在することを、`EverySourceNeedIsActive(M)`は各source needのstatusが`active`であることを要求する。違反はそれぞれ`CivicNeedMergeSourceDuplicate`、`CivicNeedMergeSourceInactive`として拒否する。

`AcceptedNeedMergeAttestations(M)`は、第23.15節のvalidator集合に含まれ、かつ当該mergeについて利害相反の除外を受けないvalidatorの、`decision = accept`の`NeedMergeAttestation`の数を数える。同一validatorの重複attestationは一つと数える。`2f + 1`に達しない場合は`CivicNeedMergeInvalidQuorum`、`ValidCivicFinalityCertificate(M)`を満たさない場合は`CivicNeedMergeFinalityMissing`として拒否する。

### 23.12 NeedMergeFinalization と source need の supersession

有効な`NeedMergeFinalization`が成立したとき、統合entryをactive CivicNeedBundleへ一件だけ登録し、全source needを`active -> superseded_by_merge`へ遷移させなければならない。canonical schemaは第22.9節に定める。

```text
NeedMergeFinalization
  merged_need_id: Hash
  source_need_refs_sorted: canonical sorted list<Hash>
  merged_summary_ref: Hash
  merged_queue_sequence: u64
  finality_certificate_ref: Hash
  finalized_at: Tick
```

`merged_need_id`は統合後needの`need_id`であり、`merged_summary_ref`のcanonical content hashから`need_id`と同じ規則で導出する。`merged_queue_sequence`は第23.9節のFIFO順序に用いる`accepted_sequence`である。

`superseded_by_merge`のneedは、次を満たさなければならない。

- active CivicNeedBundleに含まれない
- `ActiveCivicNeedCount`に数えない
- activeな`CivicNeedScore`のtargetにならない
- 現在の`CivicNeedAsset`供給対象として扱わない
- 通常のCivicCandidates、CivicReach、NeedAsset discoveryの対象にしない
- history、監査、source trace及び将来のsplitのため、`civic_need_archive_root`のcontent-addressed archiveとして参照可能である

統合前に`m`件のactive source needがあり、一件のmerged needが作られた場合、active bundle件数は厳密に`m-1`件減少しなければならない。

```text
ActiveCivicNeedCountAfter =
    ActiveCivicNeedCountBefore - m + 1
```

NeedMergeはneedの表現及びactive bundle件数を圧縮するだけであり、票、二乗影響又は`CivicNeedScore`を不正に増幅してはならない。複数needをmergeする場合、各allocationの`allocated_votes`を合算してから二乗してはならない。

```text
Forbidden:
    merged_votes = votes_A + votes_B
    merged_influence = merged_votes^2
```

たとえば、一人がNeed Aに3票、Need Bに4票を置いていた場合、merge前の影響は次である。

\[
3^2+4^2=25
\]

Need AとNeed BをMerged Need ABへ統合しても、影響を次へ変えてはならない。

\[
(3+4)^2=49
\]

NeedMerge後はallocation atomを保存し、`target_need_id`だけをmerged needへ更新する。

```text
Before merge:
    allocation_1:
        origin_need_id = NeedA
        target_need_id = NeedA
        allocated_votes = 3

    allocation_2:
        origin_need_id = NeedB
        target_need_id = NeedB
        allocated_votes = 4

After merge:
    allocation_1:
        origin_need_id = NeedA
        target_need_id = MergedNeedAB
        allocated_votes = 3

    allocation_2:
        origin_need_id = NeedB
        target_need_id = MergedNeedAB
        allocated_votes = 4
```

したがって、merge後も次が成立しなければならない。

\[
CivicNeedScore(MergedNeedAB)=3^2+4^2=25
\]

merge後に利用者が自らballot revisionを提出し、Merged Need ABへ7票を集中させた場合だけ、次の影響を許す。

\[
7^2=49
\]

これは利用者自身の再配分であり、NeedMergeによる自動的な票増幅ではない。合算してから二乗する集計、`allocated_votes`の書換え又はallocation atomの統合は`CivicNeedMergeVoteAmplification`として拒否する。`WildRaw` atomも同様に`target_need_id`のみを更新し、合算してから再正規化してはならない（第23.7節）。

### 23.13 NeedSplitChallenge と NeedSplitFinalization

merged needがsource need群を妥当にカバーしていない場合、`NeedSplitChallenge`により分割を求めることができる。canonical schemaは第22.9節に定める。

```text
NeedSplitChallenge
  forum_id: ForumId
  merged_need_ref: Hash
  challenger_soul_id: SoulId
  submitted_at: Tick
  expire: Tick | null
  signature: MLDSA65Signature

NeedSplitFinalization
  merged_need_ref: Hash
  restored_need_refs_sorted: canonical sorted list<Hash>
  finality_certificate_ref: Hash
  finalized_at: Tick
```

`NeedSplitChallenge`の受理条件は次である。`merged_need_ref`が同一forumの`NeedMergeFinalization`を指し、そのmerged needのstatusが`active`であり、`expire`が非nullなら`expire > submitted_at`であり、challengerのauthority bindingと署名が正当であり、当該challengeが同一merged needに対して未確定であること。これらを満たさないchallengeは`CivicNeedSplitInvalid`として拒否する。

`restored_need_refs_sorted`は、対象merged needの`NeedMergeFinalization.source_need_refs_sorted`の部分集合であり、`need_id`のcanonical byte orderで整列する。復元対象allocationの同定は、当該merged needへ`target_need_id`を向けるallocation atomのうち、`origin_need_id`が`restored_need_refs_sorted`に含まれるもの、として決定論的に定める。challengeのfinalityは、`NeedMergeProposal`と同じvalidator committeeのBFT quorum（`2f + 1`、`n >= 3f + 1`）と`ValidCivicFinalityCertificate`により成立する。

splitがfinalityを得た場合、次を適用する。

- merge前から存在したallocationは、その`origin_need_id`へ復帰する
- merge後に新しくMerged Needへ置かれたallocation（`origin_need_id = merged_need_id`）は、split時に元needへ自動配分してはならない。当該allocationはinactiveとし、当該利用者の未配分票へ戻す
- 復元されるneed entryのstatusは`superseded_by_merge -> active`とし、`accepted_sequence`は`NeedMergeFinalization`時に保持した元の値を変更しない。したがってsplitはneedを若返らせない
- `merged_need_id`のentryはactive CivicNeedBundleから除去し、`superseded_by_merge`として`civic_need_archive_root`に保持する。`retired_by_split`は設けない（C8）。merged entryを`retired_by_fifo`又は`fulfilled`として記録してはならない
- split後のactive bundle件数が`K(F)`を超える場合、第23.9節のFIFO規則をそのまま適用する。復元されたneedは元の`accepted_sequence`を保持するため、新規needより前に退場し得る
- `WildRaw` atomは第23.7節の保存則に従う

```text
Before split:
    origin_need_id = NeedA
    target_need_id = MergedNeedAB
    allocated_votes = 3

After split:
    origin_need_id = NeedA
    target_need_id = NeedA
    allocated_votes = 3
```

```text
origin_need_id = MergedNeedAB
target_need_id = MergedNeedAB
allocated_votes = x
```

このallocationはsplit後にinactive allocationとし、当該利用者の未配分票へ戻す。利用者は次のballot revisionにより、その票を任意のactive needへ再配分できる。分割による自動配分、`origin_need_id`と`target_need_id`の不一致な書換え、復元対象外atomの復元は、`CivicNeedSplitVoteRestorationMismatch`又は`CivicNeedSplitPostMergeVoteAutoTransfer`として拒否する。

復元先needが既にinactiveである場合を次で固定する。split時点で`restored_need_refs_sorted`のneedが`retired_by_fifo`、`superseded_by_merge`又は`fulfilled`である場合、そのneedを`active`へ戻してはならない。当該needを`origin_need_id`とするallocationはinactiveとし、当該利用者の未配分票へ戻す。needは`civic_need_archive_root`に保持したままとする。splitはinactiveなneedを復活させず、過去のFIFO退場を巻き戻さない。

### 23.14 Need lifecycle と FIFO retirement

need entryのlifecycleは次で固定する。

```text
active | superseded_by_merge | retired_by_fifo | fulfilled
```

これは`CivicNeedAsset`の状態語彙（`ranked | open_for_supply | supplied | fulfilled | retired`）とは別の状態機械である（C8。第23.18節）。

- `active -> superseded_by_merge`は、第23.12節の`NeedMergeFinalization`により成立する
- `active -> retired_by_fifo`は、第23.9節のFIFO退場により成立する
- `active -> fulfilled`は、当該needが充足され閉鎖されたことをBFT finalityにより確定した場合に成立する
- splitは`active`を`retired_by_fifo`へ遷移させない。`retired_by_split`は設けない（C8。第23.13節）

FIFOによりactive CivicNeedBundleから外れたneedは、`CivicNeedScore`に寄与してはならない。

```text
active -> retired_by_fifo
```

`retired_by_fifo`、`superseded_by_merge`又は`fulfilled`のneedは、次を満たさなければならない。

- active CivicNeedBundleに含まれない
- `ActiveCivicNeedCount`に数えない
- activeな`CivicNeedScore`のtargetにならない
- `CivicNeedAsset`の供給対象及び告知対象の根拠にならない
- 通常のCivicCandidates、CivicReach、NeedAsset discoveryの対象にしない
- history、監査、source trace及び将来のsplitのため、content-addressed archiveとして参照可能である

`retired_by_fifo`、`superseded_by_merge`又は`fulfilled`のneedをtargetとするallocationはinactiveとする。inactiveなallocationは、次を満たす。

- activeな`CivicNeedScore`に寄与しない
- 別needへ自動移転しない
- 別Soulへ移転しない
- 新しいneedの影響を自動的に増やさない
- 当該voterの未配分票として扱う
- voter自身がballot revisionにより再配分できる

FIFO順序は`accepted_sequence`により一意に決まり、`CivicNeedScore`、LLM output、API応答時刻、forum root又はvalidatorの裁量によって変わってはならない。

### 23.15 分散 validator committee

`CivicFinalityCertificate`の検証は「validなvalidatorの`2f + 1` precommit」を要求するため、validator集合がcheckpointから決定論的に導出できなければならない。導出規則を欠くと、完全オフライン検証（第23.20節）と両立せず、BFTの安全性主張も形式化されない。

次を必須とする。

```text
CivicValidatorSet(F, e) =
    {
        S |
        S in CivicCitizens(F, q_e)
        AND S in ActiveMembers(F, q_e)
    }

n(F, e) = |CivicValidatorSet(F, e)|
f(F, e) = floor((n(F, e) - 1) / 3)
```

`q_e`は当該epochの評価checkpointである（第23.3節）。`CivicCitizens(F, q_e)`は`checkpoint_time(q_e)`でCivicCitizen predicateを満たすSoulの集合、`ActiveMembers(F, q_e)`は同checkpointの`membership_root`が指す集合のうち`ActiveMember` predicateを満たすSoulの集合である（第4.2節、第13.2節、第17.7節）。`ActiveMembers`（複数形）と`ActiveMember`（単数形）を混同してはならない。

- validator資格は`CivicCitizen` predicateと`ActiveMember`のみから導出する。`AssetScore`、`depth`、`Q`、`A_seed`、支払額、広告費、forum rootの裁量、Owner threshold、eKYC providerの裁量をvalidator資格の入力にしてはならない
- `n >= 3f + 1`を満たさないepochでは、当該epochのCivic finalityを成立させない。Civic stateは`TemporalUnverifiable`と同様にfail closedとし、root単独署名による代替finalityを認めない
- `f(F, e) = 0`となるepoch（`n <= 3`）でも、当該epochのCivic finalityを成立させない。`2f + 1 = 1`のquorumは単一validatorの署名であり、単一writer又はroot単独署名の主張と区別できないためである（第3.5節）
- committeeの選出順序は`validator_soul_id`のcanonical byte orderにより固定し、実装固有の集合順、到着順、乱数に依存させない
- validator集合は`civic_validator_set_registry_root`にコミットし、`CivicFinalityCertificate`はvalidator集合導出のinclusion proofを含まなければならない
- `civic_validator_set_registry_root`はepochごとに`(n, f, validator_set_root)`を固定する。登録された`f`が`floor((n-1)/3)`と一致しない、又は`n >= 3f + 1`を満たさない場合、当該epochのfinalityは`CivicValidatorSetMismatch`としてfail closedで拒否する

validatorが当該epochのactive needのproposer又はsource needの投稿者である場合の利害相反を次で固定する。これらの関係は、`NeedMergeProposal.proposer_soul_id`及び`NeedSubmission.submitter_soul_id`というfinalize済みobjectの内容から公開に導出できるため、追加の開示objectを導入しない。

- 利害相反のあるvalidatorは、当該`NeedMergeProposal`又は`NeedSplitChallenge`に関してcommittee導出からは除外しない。committee size`n`及び`f`の導出を利害により変更してはならない
- 利害相反のあるvalidatorのattestationは、当該提案の`AcceptedNeedMergeAttestations`の計数から除外する
- 除外後の非利害validatorにより`2f + 1`のaccept attestationを集められない場合、当該merge又はsplitはfinalityを成立させない（fail closed）

`CivicValidatorAvailabilityCommitment`は、validator集合の導出結果と可用性のコミットメントを表す。canonical schemaは第22.9節に定める。可用性の意味を次で固定する。

- `availability_proof_refs`は、各validatorが当該epochの`CivicEpochBlock`又はballotを実際に受領し処理したことを示す署名済みobject（`CivicVoteSeenReceipt`又はvalidatorが署名したprotocol message）への参照である
- 可用性は観測と監査のためのcommitmentであり、validatorの資格、`CivicValidatorSet`の導出結果、quorum数、ballotの正当性又は`CivicNeedScore`の入力にしてはならない
- validatorを可用でないと観測しても、そのvalidatorを`CivicValidatorSet`から除去せず、`2f + 1`の要求を低下させない
- 可用性の欠落を、当該validatorの否定的な投票、否定的なmembership又は否定的な資格事実として解釈してはならない

### 23.16 CivicEpochBlock、Prevote、Precommit、FinalityCertificate

分散Civic finalityのobjectは第22.9節に定める。本節は、同節が第23章へ繰り延べた事項を確定する。

```text
CivicEpochBlock
  forum_id: ForumId
  vote_epoch_id: Hash
  snapshot_ref: Hash
  opens_at: Tick
  closes_at: Tick
  tally_finality_ref: Hash | null
  signature: MLDSA65Signature

CivicPrevote
  forum_id: ForumId
  vote_epoch_id: Hash
  epoch_block_ref: Hash
  validator_soul_id: SoulId
  signature: MLDSA65Signature

CivicPrecommit
  forum_id: ForumId
  vote_epoch_id: Hash
  epoch_block_ref: Hash
  validator_soul_id: SoulId
  signature: MLDSA65Signature
```

`CivicEpochBlock`はepochのprevote及びprecommitを束ねるblockである。epoch descriptor、`snapshot_ref`、`opens_at`、`closes_at`及び`tally_finality_ref`の意味は第23.3節に定める。blockの署名authorityと連鎖を次で固定する。

- `CivicEpochBlock`の署名は、当該blockを提案するvalidatorのauthority keyによる。提案者は、`CivicValidatorSet(F, e)`を`validator_soul_id`のcanonical byte orderで並べたときの`(state_sequence(q_e) mod n(F,e))`番目のvalidatorとする。これはepochごとに決定論的に交代し、forum root、eKYC provider、Payment-Service又は任意の一参加者が提案者を選ぶことを許さない
- 提案者のauthority keyは、当該Soulのactiveな`DeviceIncarnation`に束縛され、`SoulEpochLease`の有効期間内でなければならない（第15章、第16章）
- block間の連鎖は、`snapshot_ref`が指すcheckpointの`state_sequence`の狭義単調増加により固定する。同一forum・同一`vote_epoch_id`について異なるdescriptor又は異なる`snapshot_ref`を持つblockが複数finalityを得た場合、それは`CivicFinalityConflict`である
- prevote及びprecommitの束ね方を、次のcanonical導出で固定する。当該blockに対するprevote及びprecommitの集合を、`(validator_soul_id canonical byte order ascending, vote kind: prevote then precommit)`の順に並べ、各leafを`hash(vote_kind || canonical_encode(vote))`とするMerkle rootを`civic_epoch_vote_root(block)`とする。`civic_epoch_vote_root(block)`は`civic_finality_registry_root`がコミットする
- `CivicEpochBlock`、prevote、precommitのいずれも、forum root、eKYC provider又はPayment-Serviceが署名・拒否・取消できてはならない

`CivicPrevote`及び`CivicPrecommit`の投票対象の表現と決定語彙を次で固定する。投票対象は`epoch_block_ref`が指す単一の`CivicEpochBlock`である。決定語彙は`accept`及び`commit`の2値とし、`CivicPrevote`が`accept`、`CivicPrecommit`が`commit`を表す。`reject`はobject型として表現せず、当該validatorが対応するvoteを発行しないことが`reject`の唯一の表現である。voteの非発行は、それ自体ではquorumを成立させない。

quorum集計の規則を次で固定する。

- 各voteは`(forum_id, vote_epoch_id, epoch_block_ref, validator_soul_id)`により一意に同定する。`validator_soul_id`は`CivicValidatorSet(F, e)`に含まれ、そのinclusionは`validator_set_root`に対するproofで示さなければならない
- 同一validator・同一kind・同一`epoch_block_ref`の複数voteは一つと数える。署名が不正、authority bindingが不正、`forum_id`又は`vote_epoch_id`が不一致、`epoch_block_ref`が解決不能、validatorが集合に含まれないvoteは`CivicPrevoteInvalid`又は`CivicPrecommitInvalid`として拒否する
- 同一validatorが同一epochについて異なる`epoch_block_ref`へprevote又はprecommitした場合、それはequivocationであり、当該epochのCivic finalityを成立させない（`CivicFinalityConflict`）
- quorumは、`accept`のprevoteが`2f + 1`以上、かつ`commit`のprecommitが`2f + 1`以上であることを要求する。`n`、`f`及び`2f + 1`は第23.15節に従う

`CivicVoteSeenReceipt`の受領証明の対象範囲を次で固定する。`seen_object_ref`は、validatorが受領した`CivicBallot`（wild submissionを含む）又は`CivicPrecommit`のcanonical content hashである。receiptは受領の事実だけを記録し、次を含めてはならない。

- 票の内容、`allocated_votes`、`origin_need_id`、`target_need_id`
- voterのprivate context、LLM入力、API応答、device内部状態
- 他のvalidatorの受領状況

`CivicVoteSeenReceipt`は受領と可用性の監査用commitmentであり、ballotの正当性、`CivicNeedScore`、quorumの計算又はfinalityの成立条件を変更してはならない（第23.15節）。

```text
CivicValidatorAvailabilityCommitment
  forum_id: ForumId
  vote_epoch_id: Hash
  validator_set_root: Hash
  availability_proof_refs: canonical sorted list<Hash>
  committed_at: Tick
  signature: MLDSA65Signature

CivicFinalityCertificate
  forum_id: ForumId
  vote_epoch_id: Hash
  epoch_block_ref: Hash
  validator_set_root: Hash
  validator_set_inclusion_proof_ref: Hash
  precommit_refs: canonical sorted list<Hash>
  finalized_at: Tick
  signature: MLDSA65Signature
```

`CivicFinalityCertificate`の`2f + 1`検証規則、quorum署名集合の表現及びinclusion proofの解釈を次で固定する。

- `precommit_refs`は、quorumを構成する`CivicPrecommit`のcanonical content hashをcanonical byte orderで並べた列であり、quorum署名集合の表現である。同列の長さは`2f + 1`以上でなければならない
- `CivicValidatorSet(F, e)`を導出し、`n(F, e)`、`f(F, e)`及び`2f + 1`を再計算する。`validator_set_root`は導出結果のrootと一致しなければならない。一致しない場合は`CivicValidatorSetMismatch`
- `validator_set_inclusion_proof_ref`は、`validator_set_root`が`civic_validator_set_registry_root`の当該epochのentryに含まれることを示すproofと、`precommit_refs`の各validatorの`validator_soul_id`が`validator_set_root`に含まれることを示すinclusion proofのbundleへの参照である
- `precommit_refs`の各参照が存在し、署名が正当であり、同一validatorが重複せず、`epoch_block_ref`が一致し、equivocationがないこと。`2f + 1`未満の場合は`CivicValidatorQuorumInsufficient`、bundleが不正な場合は`CivicFinalityCertificateInvalid`
- `f(F, e) = 0`又は`n(F, e) < 3f(F, e) + 1`のepochでは、`CivicFinalityCertificate`を受理しない
- `CivicNeedBundle`へのentry登録、`NeedMergeFinalization`、`NeedSplitFinalization`、epochのtally及び`CivicNeedAsset`のstatus遷移は、いずれも対応する`CivicFinalityCertificate`を要求する
- checkpointに記録されたCivic state rootと、有効な`CivicFinalityCertificate`が確定するCivic stateが矛盾するclaimは、checkpointの署名が数学的に正しくても受理しない
- 当該epochのballot/tally bundleをcheckpointのCivic state rootから再計算し、その結果が`CivicFinalityCertificate`の確定内容と一致しない場合、`InvalidCivicTally`として拒否する


本節の上記条件をすべて満たすことを`ValidCivicFinalityCertificate(M)`と書く。`M`は検証対象の`CivicFinalityCertificate`である。本述語は第23.11節の`ValidNeedMerge`、第23.13節の`ValidNeedSplitFinalization`及び第23.20節のオフライン検証bundleで用いる。
### 23.17 NeedScore、bundle、merge、split の保存則

実装は次を整数又は正規化済み有理数により決定論的に検証し、浮動小数点を用いてはならない。

\[
\forall S,F,e:
\sum_{a\in Ballot(S,F,e)}allocated\_votes(a)\le V_F
\]

\[
\forall S,F,e:
CivicInfluence(S,F,e)\le V_F^2
\]

\[
NeedMerge 前後で、
各 Soul の票総量は不変でなければならない
\]

\[
NeedMerge 前後で、
既存 allocation atom の二乗影響の総和を増幅してはならない
\]

\[
NeedSplit は、
merge 前から存在した allocation だけを origin\_need\_id へ復元しなければならない
\]

\[
InactiveNeedTarget の allocation は、
active CivicNeedScore に寄与してはならない
\]

\[
ActiveCivicNeedCount(F,t)\le K(F)
\]

\[
K(F)\le V_F
\]

\[
NeedMerge、NeedSplit、FIFO 退場及び supersession の前後で、
WildRaw atom の総量は不変であり、
inactive な WildRaw atom を active な CivicNeedScore へ加算してはならない
\]

\[
WildContribution の正規化分母は epoch 開始時点の active need 集合に固定され、
merge、split、FIFO 退場又は supersession によって変化してはならない
\]

\[
FIFO 順序は accepted\_sequence により一意に決まり、
NeedScore、LLM output、forum root 又は validator の裁量により変更してはならない
\]

加えて次を必須とする。

- 1 nullifier・1 epochにつきtally入力となるvalid ballotは最大一つである（第23.5節）
- NeedMergeのfinalityは、source need数を`m`としてactive bundle件数を厳密に`m-1`減らす（第23.12節）
- merge後にmerged needへ置かれたallocationは、split時に自動配分されない（第23.13節）
- `CivicCandidates(a,F,t)\subseteq Candidates(a,F,t)`、`0\le CivicReach(a,F,t)\le Reach(a,F,t)`（第23.19節）
- `CanPublishCivicNeedAsset(P,a,F,t)\Rightarrow CivicCitizen(P,F,t)\land CanPublishAsset(P,a,F,t)`（第23.18節）
- 過去確定状態の非遡及性: epoch `e`の評価checkpointを`q_e`とするとき、`CivicCitizen(S,F,e)=CivicCitizen(S,F,checkpoint\_time(q_e))`。後の時点でのcredential失効、期限切れ、更新又は新credentialの発行は、`q_e`で確定したtally、`CivicNeedScore`、need順位、`CivicNeedAsset`のstatusを変更してはならない
- eKYCの通常ゲーム非関与: 第23.3節のpath制限付き規則。`membership_ekyc_policy=not_required`のforumでは、eKYC credentialの有無だけを変えても、他の入力が同一なら`Q`、`depth`、`CanIssue`、`CanIssueTo`、`A_seed`、`EarlyBonus`、`CultivationBonus`、`CitationBonus`、`AssetScore`、通常`Candidates`、通常`Reach`は不変である

### 23.18 CivicNeedAssetへの供給

既存`AssetRecord`へ、任意フィールドを一つ追加する。

```text
- `civic_need_ref`: Optional<Hash<CivicNeedAsset>>
```

`civic_need_ref`がないAssetRecordは、既存どおり通常アセットである。既存の登録、公開、価格、閾値、アクセス権、Candidate、Reachの規則を変更してはならない。

canonical規則:

- 通常アセットではフィールド自体を**省略**しなければならない
- `null`、空文字列、zero hashその他のダミー値で通常アセットを表してはならない
- Civic Need Assetでは正しい`CivicNeedAsset` content hashを必須とする
- 参照先が不存在、hash不一致、forum不一致、need状態不正、又は依存proof不足なら拒否する

`CivicNeedAsset`のcanonical schemaを次で固定する。ここで`status`は、`CivicFinalityCertificate`で確定したactiveなCivicNeedBundleEntryの`need_id`とstatusへ接続された、需要側のobjectの状態である（C8。第22.1節）。

```text
CivicNeedAsset
  forum_id: ForumId
  need_id: Hash
  canonical_need_key: Hash
  description_ref: Hash
  status: ranked | open_for_supply | supplied | fulfilled | retired
  status_checkpoint_ref: Hash
  finality_certificate_ref: Hash
  signature_or_attestation: MLDSA65Signature | attestation reference
```

- `need_id`は第23.8節の導出によるneed entryの識別子である。`canonical_need_key`及び`description_ref`は当該need entryと一致しなければならない
- `status_checkpoint_ref`は、`status`の評価時刻を固定する最終化済みcheckpointである
- `finality_certificate_ref`は、当該need entryの登録又は状態遷移を確定した`CivicFinalityCertificate`である
- `status`は、`status_checkpoint_ref`の時点で確定したneed entryの状態から決定論的に導出する。forum root、eKYC provider、Payment-Service又は任意の一参加者の署名は、単独では`status`の根拠にならない
- `CivicNeedScore`、`rank`及び供給候補順序はepochごとに再計算される導出値であり、`CivicNeedAsset`のフィールドにしない。content-addressed objectの内容をepochごとに書き換えてはならない

`status`の導出を次で固定する。

- `ranked`: 対応するneed entryが`active`であり、当該epochの`CivicNeedScore`が確定しているが、まだ供給可能になっていない
- `open_for_supply`: 対応するneed entryが`active`であり、`ranked -> open_for_supply`の遷移はgaia-core共通の決定論的規則で固定する。遷移の順序は`CivicNeedScore`の降順、同一の場合のneed object hashのcanonical byte order昇順により決定し、`CivicNeedScore`が正であるactive entryが供給可能になる。この順序はFIFO順序及びFIFO退場を変更しない（第23.9節、第23.14節）
- `supplied`: 当該needを参照する有効なCivic Need Assetが存在する
- `fulfilled`: 当該need entryが`fulfilled`へ遷移した
- `retired`: 当該need entryが`superseded_by_merge`又は`retired_by_fifo`へ遷移した。`retired`の`CivicNeedAsset`を参照するAssetRecordは、新たに供給・告知できない

`civic_need_ref`があるAssetRecordはCivic Need Assetであり、次を満たさなければならない。

\[
CanPublishCivicNeedAsset(P,a,F,t)\iff
CivicCitizen(P,F,t)
\land CanPublishAsset(P,a,F,t)
\land a.civic\_need\_ref\ne null
\land NeedStatus(a.civic\_need\_ref,t)\in\{open\_for\_supply,\ supplied\}
\]

ここで`CanPublishAsset`は既存の通常公開資格である（第10.2節）。CivicCitizenはこれを置換しない。`NeedStatus`は、参照先`CivicNeedAsset`の`status`が、同一forumの`t`に対応するcheckpointで確定したactiveなneed entryの`need_id`とstatusに接続されており、かつ当該entryが有効な`CivicFinalityCertificate`で確定されていることを要求する。root が作るNeedAsset状態だけを根拠にしてはならない。

したがって、eKYCだけで市民NeedAssetの供給資格を得ることはできない。通常公開資格を持たないSoulは、eKYC済みでも公開できない。他方、通常公開資格を持つ未確認Soulは通常アセットを公開できるが、市民NeedAssetを正式供給できない。

参照先NeedAssetの状態不正は`CivicNeedNotOpenForSupply`、公開資格の不成立は`UnauthorizedCivicNeedPublisher`、objectの不正は`InvalidCivicNeedAsset`として拒否する。

### 23.19 CivicCandidates と CivicReach

Civic Need Asset `a`の市民候補者集合は次である（第7.13節）。

\[
CivicCandidates(a,F,t)=
\{S\in Candidates(a,F,t)\mid CivicCitizen(S,F,t)\}
\]

\[
CivicReach(a,F,t)=|CivicCandidates(a,F,t)|
\]

`CivicCandidates`及び`CivicReach`は、`CivicNeedAsset`のactive status及び当該statusを確定したBFT finality bundleを入力にする。具体的には、`CivicCandidates`は、`a.civic_need_ref`が指す`CivicNeedAsset`の`status`が`open_for_supply`又は`supplied`であり、かつ対応するneed entryが`active`であり、かつ当該statusが有効な`CivicFinalityCertificate`で確定されている場合にだけ、空でない候補集合を許す。need entryが`superseded_by_merge`、`retired_by_fifo`又は`fulfilled`である場合は`CivicCandidates`を空とする。したがって、rootが作るNeedAsset状態だけを根拠にCivicReachを増やしてはならない。

`CivicCandidates`の計算において、`Candidates(a,F,t)`は既存の通常`AssetScore`、通常`ActiveMembers`、通常`ActiveMember`述語、既存grant状態および既存閾値だけから計算する（第13.10節の正規集合式）。eKYCはこれらへ直接作用してはならない。`verified_required`のforumにおける`ActiveMember`述語（第4.2節、第13.2節）を通じたforum参加境界のpathを除き、eKYCは通常`AssetScore`または通常`Candidates`を変えない（第24.19節）。

CivicCitizenでないSoulは通常`Candidates`に含まれ得るが、`CivicCandidates`には含まれない。したがって、未確認Soulを量産しても、CivicReach、市民NeedAssetの購入候補数、または市民NeedAssetの責任付き市場規模を増やすことはできない。

通常`Candidates`と通常`Reach`は変更しない。CivicCandidates/CivicReachは別の市民市場指標であり、通常市場を置換または縮小しない。

`CivicCandidates`と`CivicReach`のclaimは、通常candidate proofに加えて、各候補SoulのCivicCitizen proofと、第23.18節の`CivicNeedAsset`のstatus proofを必要とする。プライバシー最小化のため、CivicReachの上限や集合濃度の証明では、個々のcredential内容を不要に開示してはならず、CivicCitizen predicateを満たすことだけを検証可能にすべきである。

### 23.20 完全オフライン検証 bundle

Civic Vote、CivicNeedAsset、CivicCandidates又はCivicReachをclaimする`StateProofEnvelope`は、受領者のContentStoreが空であっても、それだけでclaimを検証できる依存閉包を含まなければならない（第3.5節）。

本節が要求する依存閉包の全体を`CivicFinalityBundle`と呼ぶ。`CivicFinalityBundle`は単一のobject型ではなく、下記の依存閉包をcanonical順序で並べたbundleである。第22.1節のobject型registryへは追加せず、新しい署名対象も導入しない。

必須の依存閉包は次である。

- 対象forumのgenesis、`membership_ekyc_policy`及び対象payloadからgenesisへ至るすべての必要なpayload祖先
- 対象epochの`CivicEpochBlock`、`CivicPrevote`、`CivicPrecommit`、`CivicVoteSeenReceipt`及び`CivicFinalityCertificate`
- `validator_set_root`、`validator_set_inclusion_proof_ref`及びvalidator集合導出proof
- quorum署名集合（`precommit_refs`）と各precommitのML-DSA-65署名検証に必要なauthority binding、`DeviceIncarnation`、`SoulEpochLease`
- 第3.5節の分散Civic state rootに対するinclusion又はnon-inclusion proof。少なくとも`civic_epoch_registry_root`、`civic_ballot_registry_root`、`civic_ballot_nullifier_registry_root`、`civic_need_bundle_root`、`civic_finality_registry_root`及び`civic_validator_set_registry_root`。merge又はsplitを主張する場合は`civic_need_merge_registry_root`、`civic_need_split_registry_root`及び`civic_need_archive_root`を加える
- 再計算可能なballot/tally bundle。valid nullifierごとの採用revision、各allocationの`allocated_votes`、`WildRaw` atom、epoch開始時点のactive need集合及び正規化分母を、bundleだけから再計算できなければならない
- CivicCitizen claimの依存閉包（第17.7節）とeKYC credentialの非失効proof

検証中にネットワーク、eKYC service、Soul-Bank、Payment-Service、forum rootへ問い合わせてはならない。次のいずれかを行うbundleはfail closedで拒否する。

- 必要なobject又はproofの欠落（`MissingObject`）
- forum rootの単独署名又は`single_writer_hash_chain_v1`だけをCivic finalityの根拠にすること
- checkpointがコミットするCivic state rootと`CivicFinalityCertificate`の確定内容の矛盾
- 再計算したballot/tally bundleと`CivicFinalityCertificate`の確定内容の不一致（`InvalidCivicTally`）
- `2f + 1`未満のprecommit、`n < 3f + 1`、`f = 0`のepoch、又はvalidator集合導出の不一致

### 23.21 必須試験及び監査要件

本仕様の実装または参照実装は、少なくとも次を単体試験・性質試験・境界試験として持たなければならない。

- **eKYC credential試験**: 期限内・未失効・認可済みissuer・正しいSoul束縛のcredentialがCivicCitizenを成立させる。`t_state=issued_at`、`t_state=expire`、`t_state<issued_at`、`t_state>expire`では不成立。`expire<=issued_at`、`expire`欠落は拒否。issuer authorizationの期限切れ、不正署名、credential種別不許可は拒否。Soul IDまたはidentity commitment不一致は拒否。失効registry inclusion proofがあるcredentialは拒否。non-revocation proof欠落はfail-closedで拒否。有効な更新credentialにより将来checkpointではCivicCitizenを再取得でき、更新credentialは過去checkpointのCivicCitizen状態を遡及変更しない。
- **通常ゲーム分離試験**: 同じSoul・証明書・checkpoint・アセット状態について、`membership_ekyc_policy=not_required`のforumでは、eKYC credentialの有無だけを変えた二状態で、`Q`、`depth`、`CanIssue`、`CanIssueTo`、`A_seed`、`EarlyBonus`、`CultivationBonus`、`CitationBonus`、`AssetScore`、`Candidates`、`Reach`、通常アセット公開資格、forum創設資格が完全一致する。`verified_required`のforumでは、forum参加境界のpath（`ActiveMember`、`T_actual`、`depth`、`Q`寄与、`AssetScore`、`Candidates`、`Reach`）だけが変化し得て、`A_seed`、`EarlyBonus`、`CanPublishAsset`は`Q`・`depth`の下流量として同じ`ActiveMember`経路を通じてのみ変化し得る（第24.19節の項目11・13）。`ActiveMember`以外の経路でeKYCの有無だけを変えても、`CultivationBonus`、`CitationBonus`、Civic Vote重み、`V_F`、`CivicNeedScore`、needの状態、`CivicNeedAsset`のstatusは変化しない（第24.19節の項目14）。
- **ballot予算試験**: `V_F`が1以上の整数でなければgenesis拒否。`V_F=15`で複数needへの票配分総和が15を超えるballotは`CivicBallotVoteBudgetExceeded`で拒否。`allocated_votes > V_F`の単一allocationは拒否。`V_F=15`の`10 + 3 + 2`は受理され、未配分票が再配分可能である。
- **revision・equivocation試験**: 同一nullifier・同一revision sequenceのballot forkは全票無効化する。`revision_sequence`の飛びは`CivicBallotRevisionGap`で拒否。ballot revisionにより旧ballotがtallyから除外され、最大のvalid revisionだけがtally入力になる。前epochのballotが次epochのtallyへ自動持越しされない。wild submissionのnullifierがcivic ballotのnullifierと衝突しない。
- **二乗影響試験**: CivicCitizenの影響が厳密に`v^2`、最大票の影響が厳密に`V_F^2`。Wild Signal全ゼロなら全needの`WildContribution`が0、一つ以上あるなら総和が厳密に1。unverified Soulを任意数複製・分割しても`WildContribution`総和が1を超えない。`WildRaw` atomのtarget変更が`origin_need_id`を保持し、正規化分母がepoch開始時点のactive need集合に固定される。
- **merge票保存試験**: 3票と4票のneed mergeが49ではなく25の影響を維持する。`allocated_votes`を合算してから二乗する集計は`CivicNeedMergeVoteAmplification`で拒否。merge後に7票へ再配分した場合だけ49を得る。merge前後で各Soulの票総量が不変。source need数`m`に対しactive bundle件数が厳密に`m-1`減る。
- **split票復元試験**: split時にpre-merge allocationが`origin_need_id`へ復元される。split時にpost-merge allocationが自動分配されず未配分票へ戻る。復元先needが既にinactiveな場合、そのneedを`active`へ戻さず、当該allocationが未配分票へ戻る。`retired_by_split`状態が存在しない。
- **FIFO試験**: FIFO retirement後の票がactiveな`CivicNeedScore`に寄与しない。`K(F)`件を超えるactive needが存在しない。`accepted_sequence`の降順・`need_id`のcanonical byte orderによる順序が実装間で完全一致する。`merged_queue_sequence`がsource needの最小`accepted_sequence`であり、mergeによる若返りが起きない。確定済み`accepted_sequence`の書換えが`CivicNeedFifoSequenceReset`で拒否される。
- **finality試験**: LLM merge proposalがBFT quorumなしにfinalにならない。`2f + 1`未満のprecommitが`CivicValidatorQuorumInsufficient`で拒否される。`n < 3f + 1`又は`f = 0`のepochでfinalityが成立しない。validator集合導出がcanonical byte orderに一致し、`AssetScore`、`depth`、`Q`、支払額、root裁量を入力にしない。利害相反validatorのattestationが計数から除外され、除外後の`2f + 1`が集まらない場合にfinalityが成立しない。
- **オフライン検証試験**: `CivicFinalityBundle`を完全オフラインで検証できる。空のContentStoreから`self_contained` `StateProofEnvelope`だけでCivicCitizen claim、ballot/tally、`CivicNeedScore`、`CivicNeedAsset`の供給資格、CivicCandidates/CivicReach claimを検証できる。eKYC credential、issuer authorization、revocation state、Merkle proof、checkpoint、ballot、prevote、precommit、inclusion proofのいずれかを欠落させたbundleはfail-closedで拒否される。root単独署名のCivic tallyをrejectする。検証中にネットワーク、eKYC service、Soul-Bank、Payment-Service、forum rootへ問い合わせない。
- **local AI分離試験**: `NeedAggregationLocalConfig`の内容がP2P object、genesis又は`StateProofEnvelope`の必須依存閉包に含まれない。LLM出力、embedding類似度、vector distance、model identifier、API provider又はpromptを変えても、`ValidNeedMerge`、quorum、`CivicNeedScore`、FIFO順序が変化しない。LLMを使えないnodeがraw needを提出できる。
- **Civic Need市場試験**: 通常AssetRecordには`civic_need_ref`が存在しない。`civic_need_ref=null`等のダミー表現は拒否。Civic Need Assetは実在する同forumの`CivicNeedAsset`を参照しなければならない。`open_for_supply`でも`supplied`でもないNeedAssetを参照するCivic Need Assetは拒否。対応するneed entryが`superseded_by_merge`又は`retired_by_fifo`である場合、`CivicNeedAsset`のstatusは`retired`となり、新たな供給・告知を拒否する。`fulfilled`である場合のstatusは`fulfilled`であり、同じく新たな供給・告知を拒否する（第23.18節）。eKYC済みだが通常公開資格なしのSoulはCivic Need Assetを公開できない。通常公開資格ありだがeKYC未済のSoulはCivic Need Assetを公開できない。両方を満たすSoulは公開できる。eKYC未済Soulも通常アセットを公開・販売できる。`CivicCandidates`が常に通常`Candidates`の部分集合、`CivicReach`が常に通常`Reach`以下。eKYC取得・失効がCivicCandidates/CivicReachだけを変え得る。`membership_ekyc_policy=not_required`のforumでは、eKYC取得・失効が通常`Candidates`および通常`Reach`を変えない。`verified_required`のforumでは、forum参加境界のpath（第24.19節の項目11〜13）に限り通常`Candidates`および通常`Reach`が変化し得る。

監査要件を次で固定する。

- canonical test vectorを少なくとも、`V_F`と`K(F)`の境界、ballot予算超過、revision fork、3票と4票のmerge、7票への再配分、split復元、split後の未配分票、FIFO退場、`2f + 1` quorum、`n < 3f + 1`又は`f = 0`のfail closed、offline bundle検証について用意する
- 実装は、`CivicNeedScore`、`WildContribution`、FIFO順序、quorum集計を浮動小数点で計算してはならない。丸めを要する場合は、既存の明示的な整数・有理数規則に従う
- 監査は、tally bundleの再計算結果と`CivicFinalityCertificate`の確定内容の一致、`civic_need_archive_root`の参照可能性、及びinactiveなallocation又は`WildRaw` atomがactiveな`CivicNeedScore`へ寄与していないことを確認できなければならない
### 23.22 Asset Lineage Royaltyの受理述語

ALRの受理・検証には、少なくとも次の述語を定義する。

```text
ValidCommercialRights(offer, asset, lineage, grant, t)
ValidAssetLineage(node, t)
ValidOriginRoyaltyPolicy(policy, origin_asset, t)
ComputeLineageRoyaltySettlement(settlement, payment_settlement, order, t)
VerifyLineageRoyaltyConservation(settlement)
EligibleForLineagePayout(entitlement, soul, t)
ValidPayoutAggregation(aggregation, t)
```

`ValidCommercialRights`は少なくとも次を確認する。

- offer kindとrelationship kindが一致する。
- grantが有効、未失効、未期限切れである。
- issuerがparent assetに対する必要なauthorityを有する。
- grantee Soulとoffer provider Soulが一致する。
- forum scope / descendant forum scopeが一致する。
- required commercial depthを超えない。
- origin policy refがlineage全体で一致する。
- resale / sublicense / derivativeが明示許可されている。
- access grantのみを根拠としていない。

`ValidAssetLineage`は次を確認する。

- canonical hash、signature、parent refs、origin refs、generation、ancestor commitmentを確認する。
- originまでのparent chainが有限である。
- loopがない。
- parent child relationがpolicy / grantと一致する。
- actual depthとnode fieldが一致する。
- all ancestors are canonical and active at the required historical reference point。

`ValidOriginRoyaltyPolicy`は、policyがorigin assetの最初のactive `AssetRecord`にのみ設定され、`origin_asset_ref`・`origin_asset_lineage_id`が一致し、policyが第7.18.4節・第22.4節の正規検証を満たし、子孫により変更・弱化・置換されていないことを確認する。

`ComputeLineageRoyaltySettlement`は次を確認する。

- `PaymentSettlement.beneficiary_pool_minor`を唯一の`B`とする。
- policyに従い`A`、seller amount、effective depth、各exact fraction、floor、largest remainderを算定する。
- 浮動小数点禁止。
- integer overflow、division by zero、policy mismatch、missing ancestor、invalid currency minor unit、negative intermediateをreject。
- allocation listとcommitment rootを再計算して一致を確認する。

`VerifyLineageRoyaltyConservation`は、`seller_principal_minor + sum(allocations) = beneficiary_pool_minor`および`sum(allocations) = ancestor_pool_minor`を検証する。

`EligibleForLineagePayout`は、entitlementが対象Soul・通貨・payout epochに正しく束縛され、finality delayを経過し、unresolved reserve / disputeがなく、payout policyが有効で、既に別のfinalized aggregationに含まれないことを確認する。

`ValidPayoutAggregation`は、aggregationが第22.4節のcanonical schemaを満たし、entitlementの二重集計・複数aggregationへの重複包含・通貨混在・Soul混在がないことを確認する。

いずれかの述語が失敗した場合は、第22.2節の該当reject code（`MissingCommercialRightsPolicy`、`AssetLineageCycle`、`OriginRoyaltyPolicyMutation`、`LineageRoyaltyConservationFailure`等）によりfail-closedで拒否する。

### 23.23 Executable Marketing Frontierの受理述語

Executable Marketing Frontierの受理・検証には、少なくとも次の述語を定義する。

```text
ExecutableMarketingAction(step, requester, t)
ValidExecutableMarketingPlan(plan, t)
ValidMarketingActionDraft(step, requester, t)
ComputeAddressableTargets(asset, offer, forum, t)
ComputeDeliverableTargets(asset, offer, forum, t)
ValidAdvertisementDelivery(ad, recipient, t)
```

`ExecutableMarketingAction`は少なくとも次を確認する。

\[
\begin{aligned}
\mathrm{ExecutableMarketingAction}(x,S,t)
= {} & \mathrm{ValidAuthority}(S,t) \\
& \land \mathrm{ValidSoulEpochLease}(S,t) \\
& \land \mathrm{ValidTemporalHealthLease}(S,t) \\
& \land \mathrm{NotSoulTransferLocked}(S,t) \\
& \land \mathrm{ActionSpecificAuthority}(x,S,t) \\
& \land \mathrm{ActionSpecificPolicySatisfied}(x,S,t) \\
& \land \mathrm{RequiredCommercialRightsValid}(x,S,t) \\
& \land \mathrm{RequiredPaymentAvailable}(x,S,t) \\
& \land \mathrm{RequiredRateLimitAvailable}(x,S,t) \\
& \land \mathrm{RequiredProofsValid}(x,t) \\
& \land \mathrm{NoUnresolvedBlockingState}(x,S,t).
\end{aligned}
\]

`ComputeAddressableTargets`は、購入候補のうちrecipientが広告受信を許し、asset / category / seller / forumに関するpolicyを通るSoulを返す（第7.20.1節）。`ComputeDeliverableTargets`は、広告可能集合のうち現在利用可能なdelivery routeがあるSoulを返す。

`ValidExecutableMarketingPlan`は、planの`valid_until`が`evaluation_checkpoint.time + min(plan_max_age, forum.state_freshness)`を超えないこと、評価checkpointの鮮度、plan input commitmentとaction draft commitmentの整合、authority・lease・transfer-lock・rate limit・proofの有効性を確認する。planが作られた後にstateが変わった場合、古いplanは実行を保証しない。期限切れまたはprecondition mismatchはfail-closedとする。実行前に全predicateを再検証し、checkpoint stale、offer inactive、grant expired、payment unavailable、rate limit exhausted、forum freeze、Soul transfer freeze、policy change、recipient opt-in changeがあればrejectし、新planの生成を要求する。execution resultはplan idとaction step idを参照できるが、planが過去の実行を正当化する唯一の根拠になってはならない。

`ValidMarketingActionDraft`は、実行時に提出されるobjectが`action_draft_commitment`に束縛され、asset / offer / forum / kind / commercial / price / policy / segment / access conditionを変更していないことを確認する。ライブ値（nonce、issued_at、expire、signature、payment intent id等）だけがcanonical ruleに従って充填される。

`ValidAdvertisementDelivery`は、recipientがAddressableであり、delivery routeがhealthyで、sender / recipientのrate limitが利用可能で、campaignとofferが有効であることを確認する（第10.16節）。広告送付はasset purchase、access grant、commercial rights grant、community certificateの代替にならない。

いずれかの述語が失敗した場合は、第22.2節の該当reject code（`ExecutableMarketingPlanExpired`、`MarketingActionDraftMismatch`、`MarketingActionSegmentPrivacyViolation`、`AdvertisementRecipientNotOptedIn`等）によりfail-closedで拒否する。

### 23.24 Asset Publication Mechanics受理述語

Asset Publication Mechanicsの受理・検証には、少なくとも次を定義する。

```text
ValidAssetPublicationEvidence(E, t) iff
  E is canonically encoded and validly signed
  AND E.evaluation_checkpoint_ref is finalized and fresh
  AND AssetRecord(E.asset_ref) is active at E.evaluation_checkpoint_ref
  AND AssetRecord.publisher == E.publisher_soul_id
  AND AssetRecord rights, lineage, and access policy are valid
  AND E.publication_age_epochs >= minimum_publication_age_epochs
  AND all referenced evidence is valid, finalized where required, and in scope
  AND no exclusion predicate applies
  AND no duplicate evidence or prior high-water credit is reused
  AND resource limits are satisfied
```

独立性述語:

```text
IndependentPublicationCounterparty(Publisher, Counterparty, t) iff
  Publisher != Counterparty
  AND Counterparty is not controlled by the same Soul
  AND no verified common identity exclusion applies
  AND no same-controller or prohibited delegation relation applies
  AND the relevant access, purchase, citation, derivative, or maturity event is valid
```

eKYC又はdistinctness proofが存在しない場合、仕様のプライバシー設計と整合する形で、正の寄与を与えないか、又は限定的・保守的な寄与に留める。曖昧な場合に最大寄与を与えてはならない。fail-closed又は低信用tierへの縮退を明示する。

上記のいずれかの述語が失敗した場合は、第22.2節の該当reject code（`InvalidAssetPublicationEvidence`、`PublicationSelfAccess`、`PublicationVerifiedCommonIdentity`、`PublicationDuplicateEvidence`、`PublicationAvailabilityInsufficient`、`PublicationCitationCycle`、`PublicationCultivationDoubleCount`、`PublicationCoefficientSumExceeded`等）によりfail-closedで拒否する。

---

## 24. 数理的不変条件と検査対象

この章は、実装・テスト・監査で必ず確認する数理的不変条件をまとめる。第9章と第11章の不変条件に加えて確認する。

### 24.1 Authority gating

論理変数`healthy`、`active`、`soul_lease`、`health_lease`、`operation_chain`に対し、通常objectの受理は全条件のconjunctionである。

\[
Accept=healthy\land active\land soul\_lease\land health\_lease\land operation\_chain
\]

一つでもfalseならAcceptはfalseである。`Accept`は、第1.2節・第3.1節の受理規則の数理的な骨格である。

### 24.2 Atomic succession

転生の有効遷移は、次の一つのみである。

\[
(active(old),pending(new))\rightarrow(retired(old),active(new))
\]

有効遷移の前後で、active bodyの数は常に1である。途中状態を作る遷移、複数active化、時刻逆行は拒否する（第15章、第16章）。

### 24.3 High-water credit

創設seedのorigin lot規則は、第7.9.1節と第13.7節のとおり維持する。

\[
CreditDelta(H,P,l,q)=
\max(0,v_l(q)-CreditedHighWater(H,P,l,q^-))
\]

各lineageのcredit deltaは非負であり、値列全体に対する累積creditは過去最大値を超えない。

\[
\sum_q CreditDelta(H,P,l,q)=\max_q v_l(q)
\]

ただし、`v_l`が非負であり、credit ledgerが各lot作成で厳密に更新される場合に限る。

### 24.4 Allocation cap

\[
Unspent(o,q)=Budget(o)-\sum_{a\in Allocations(o,q)}allocated\_amount(a)
\]

新しいallocationは、`allocated_amount >= 0`および`allocated_amount <= Unspent(o,q)`を満たさなければならない。したがってallocationの総和はBudgetを超えない（第7.9節、第13.7.3節）。

### 24.5 Healthy-time accounting

健康区間の和は非負であり、不健康な区間を追加しても増えない。無効な区間を健康時間として扱わないため、時計不調・隔離・回復待ちがdepthを早めることはない（第4.2節、第14.10節）。

### 24.6 Commerce isolation

Commerce objectをQ、depth、CanIssue、CanIssueTo、AssetScore、A_seed、Candidates、Reachの入力集合から除外するため、支払い金額、Bank売上、eKYC tierの変化は、これらのprotocol値を直接変化させない（第7.16節、第19.3節）。第18章の`PaymentSettlement`、`PayoutEntitlement`、`BeneficiaryTransferRecord`、`BeneficiaryPayoutReceipt`、`GaiaServiceCreditGrant`、第7.17節の`ForumPoolContributionRecord`、`ForumRevenuePoolDistribution`、`ForumPoolUndistributedForfeiture`その他の清算・分配・失効・還元objectも、これらのprotocol値の入力にならない。

### 24.7 検査対象

- `NormalGaiaAuthority(S,F,t,D)`が成立するのは、`D.status=active`で、`VerifyDeviceIncarnation(D)`、Soul epoch lease・temporal health lease・device binding・authority operation chainがすべて有効なときだけである（第15.3節）。
- `Accept(o,F,t)`が成立するのは、canonical hash、ML-DSA-65署名、object固有規則、`VerifyAuthorityToPublicSoulBinding`、Soul epoch lease、temporal health lease、authority operation chainがすべて有効なときだけである（第3.1節）。
- どの検証器も、同じgenesis・checkpoint・`StateProofEnvelope`・leaseから同じAccept/Reject/エラーを返す。

### 24.8 公開identity鍵とauthority追跡の不変条件

実装は少なくとも次を満たさなければならない。

```text
1. identity_pubkeyはSoulの公開恒久鍵であり、通常の検証bundleで利用可能である。

2. soul_idは常にhash(canonical_encode(identity_pubkey))である。

3. 同一soul_idに異なるidentity_pubkeyを束縛してはならない。

4. authority_pubkeyは通常の署名鍵であり、Soul恒久IDではない。

5. authority_pubkeyは、有効なDeviceIncarnation、public identity_pubkey、SoulRecord、
   SoulEpochLeaseを介してSoulへオフライン追跡可能でなければならない。

6. DeviceIncarnationはidentity秘密鍵とauthority秘密鍵の双方の署名を持ち、
   identity_pubkeyとauthority_pubkeyの公開束縛を検証可能にする。

7. identity秘密鍵は日常の通常object署名に使ってはならない。

8. 通常objectの署名は、対象時点で唯一のactive Bodyに属するauthority秘密鍵で行う。

9. active BodyはSoulごとに同時に高々1個であり、通常権限にはちょうど1個必要である。

10. authority鍵の侵害、紛失又は端末交換は、Soul IDを変更せず、新DeviceIncarnation、
    SoulEpochLease及び正規のsuccessionにより処理する。

11. authority_pubkey単独では、Soulの恒久同一性、eKYC、CivicCitizen、uniqueness scope、
    forum横断同一性又はPayout beneficiary identityを主張できない。

12. identity-derived claimを検証するStateProofEnvelopeは、public identity_pubkeyから
    authority key、active Body、Soul epoch、必要ならeKYC credentialまでの完全閉包を含む。

13. identity_pubkeyを隠すためのZK proof、匿名binding、authority-only fallbackを導入しない。

14. identity_pubkeyの公開は、氏名、住所、KYC属性、Stripe情報、銀行情報等の個人情報公開を意味しない。

15. eKYC、Payment、Forum Revenue Pool又はcommerce stateは、Q、depth、CanIssue、
    CanIssueTo、AssetScore、A_seed、bonus、Candidates、Reach、forum創設資格又は
    checkpoint finalityを変更又は購入する経路にならない。

    eKYCについては、`membership_ekyc_policy=verified_required`のforumにおける
    `ActiveMember`述語（第4.2節、第13.2節）を通じたforum参加境界のpathだけを例外とし、
    その効果は第24.19節のpath制限付き中立性に従う。Payment、Forum Revenue Pool及び
    commerce stateには例外を設けない。
```

### 24.9 Atomic Soul Transfer Finalization

既存のactive old / pending new / retired old / active newという通常転生の原子的切替を、Soul Transferに安易に適用しない。Soul Transferのfinalizationは、次に固定する原子的遷移である。

pre-stateは次を固定する。

```text
- seller is current controller of subject Soul
- buyer has a verified successor DeviceIncarnation in pending_successor state
- seller and buyer have valid, non-revoked transfer eKYC
- seller and buyer are distinct legal subjects
- SoulTransferAgreement is valid
- SoulTransferFreeze is active
- payment is reserved
- no unresolved dispute exists
- source trust epoch is current
```

一回の原子的遷移で、次を行う。

```text
1. old active authority becomes revoked for normal authority
2. old SoulEpochLease becomes unusable for normal authority after finalization boundary
3. successor DeviceIncarnation becomes active
4. successor SoulEpochLease becomes active
5. controller binding changes to buyer commitment
6. trust epoch increments by exactly one
7. transfer state becomes finalized/history committed
8. a finalization checkpoint commits all resulting roots
```

不変条件:

\[
AfterFinalization(S,t):
|ActiveIncarnations(S,t)|=1
\]

\[
AfterFinalization(S,t):
TrustEpoch(S,t)=TrustEpoch(S,t^-)+1
\]

\[
AfterFinalization(S,t):
OldAuthorityCannotExerciseNormalAuthority(S,t)
\]

\[
AfterFinalization(S,t):
NoPriorTrustEpochContributionCountsForSuccessor(S,t)
\]

途中状態が観測される場合、`transfer_settling`では通常authorityを0個として扱い、両authorityが同時に通常権限を行使できないようにする。

### 24.10 Atomic Forum Root Succession

pre-stateは次とする。

```text
- current root authority is uniquely determined by genesis or prior succession chain
- predecessor and successor have valid transfer eKYC and distinctness proof
- ForumRootTransferAgreement is valid
- ForumRootTransferFreeze is active
- payment is reserved
- no unresolved dispute exists
- root ledger is consistent through freeze checkpoint
```

一回の原子的遷移で、次を行う。

```text
1. predecessor root authority loses future root write authority
2. successor root authority becomes active at root_epoch + 1
3. genesis root and forum_id remain unchanged
4. root ledger continues without reset
5. root succession chain and finalization checkpoint are committed
```

不変条件:

\[
|ActiveRootAuthorities(F,t)|=1
\]

ただしforum root transfer freeze中は0でもよい。

\[
|ActiveRootAuthorities(F,t)|\in\{0,1\}
\]

正常稼働時にはちょうど1とする。

### 24.11 Soul Transfer・Forum Root Successionの検証可能な不変条件

実装・テスト・監査は、少なくとも次の不変条件を検証しなければならない。

eKYC必須:

\[
TransferAccepted(T,t)
\Rightarrow
ValidTransferEkyc(Seller(T),t)
\land ValidTransferEkyc(Buyer(T),t)
\land DistinctLegalSubject(Seller(T),Buyer(T),t)
\]

唯一の進行中譲渡:

\[
|ActiveTransfers(S,t)|\le1
\]

凍結中の通常操作禁止:

\[
TransferLocked(S,t)
\Rightarrow
\neg NormalGaiaAuthority(S,F,t,D)
\]

ただし検証・異議・時刻再検証・finalizationに明示的に許された操作は別predicateで許可する。

finalizationの必要条件:

\[
TransferFinalized(T,S,t)
\Rightarrow
PaymentReserved(T,t)
\land OldAuthorityRevoked(T,t)
\land SuccessorBodyBound(T,S,t)
\land NoUnresolvedTransferDispute(T,t)
\land ValidTrustEpochTransition(T,S,t)
\land TransferHistoryCommitted(T,S,t)
\]

trust epochの単調性:

\[
TrustEpoch(S,t_2)\ge TrustEpoch(S,t_1)
\qquad(t_2>t_1)
\]

Soul Transfer Finalization以外はepochを増分してはならない。

信頼非承継: Soul Transfer後のsuccessor controllerについて、旧epochだけに属する証明書集合を`C_{old}`とすると、次が成り立つ。

\[
Q_{successor}(S,F;C_{old})=0
\]

従って、旧epochだけで後継controllerが`Q>0`を得たり、depthを前倒ししたり、`CanIssue`を得たりしてはならない。

Civic非承継:

\[
TransferFinalized(T,S,t)
\Rightarrow
\neg InheritCivicCitizen(S,t^- ,t^+)
\]

過去のCivic vote/tallyは変更されない。

forum同一性:

\[
ForumRootSuccession(F,t)
\Rightarrow
forum\_id(F) = hash(canonical\_encode(genesis(F)))
\]

root successionはgenesis又はforum_idを変更してはならない。

唯一active root authority:

\[
|ActiveRootAuthorities(F,t)|\le1
\]

決済非同一性:

\[
PaymentReceipt(T,t)\not\Rightarrow TransferFinalized(T,t)
\]

\[
TransferFinalized(T,t)\not\Rightarrow PayoutAvailableToSeller(T,t)
\]

この二つの非含意を明文化し、決済成功・譲渡finality・売主の外部資金可用性を混同しない。

### 24.12 Asset Lineage Royaltyの数理的不変条件

実装・テスト・監査は、少なくとも次の不変条件を検証しなければならない。

資金保存（lineage royalty）: 以下の等式は有効祖先数`d > 0`の場合に成立する。`d = 0`の場合は第7.18.5節及び本節の境界条件により`A = 0`、`P_{seller} = B`であり、等式の対象外である。

\[
A = \left\lfloor B\alpha/10000 \right\rfloor
\qquad(d>0)
\]

\[
P_{seller} = B - A \ge 0
\]

\[
R_k \ge 0
\]

\[
\sum_{k=1}^{d}R_k = A
\]

\[
P_{seller} + \sum_{k=1}^{d}R_k = B
\]

境界条件:

- `d=0`なら`A=0`であり、sellerが全額を受ける（Vector Cと一致する）。
- `α=0`ならsellerが全額を受ける。
- `B=0`なら全配分がゼロ。
- `α=10000`ならseller allocationはゼロ。

原子的確定: 一つのsale / order / payment settlementについて、finalizedな`LineageRoyaltySettlement`は高々1つである。`PaymentSettlement.lineage_royalty_settlement_ref`は一度だけ設定され、競合する複数settlementを同一saleへ確定してはならない。同一`order_id`に対するALR確定はidempotentでなければならない。

PayoutEntitlement会計:

\[
principal\_minor = paid\_minor + reserved\_minor + forfeited\_minor + claimable\_minor
\]

各ALR entitlementについても、`paid_minor + reserved_minor + claimable_minor + forfeited_minor = principal_minor`を満たす。

集約の一意性: 一つのentitlementは、高々一つのfinalized `PayoutAggregation`に含まれる。同一aggregationへ同一entitlementを二重に含めてはならない。

原資の隔離: ALRの金銭原資は`PaymentSettlement.beneficiary_pool_minor`のみであり、Gaia network maintenance fee、Forum Revenue Pool contribution、Stripe fee、購入者支払額、外部資金からALRを取り崩してはならない。

スケール上限: `max_lineage_depth <= MAX_LINEAGE_ROYALTY_DEPTH`、`max_commercial_depth <= MAX_COMMERCIAL_LINEAGE_DEPTH`、allocations件数は`MAX_ALLOCATION_ENTRIES_PER_SETTLEMENT`以下、aggregation内entitlement数は`MAX_PAYOUT_ENTITLEMENTS_PER_AGGREGATION`以下。超えるobjectは`ResourceLimitExceeded`等でrejectする。integer overflow、division by zero、`rden^d - rnum^d = 0`はrejectする。

### 24.13 資源提供・storage accounting・confidentialityの不変条件

RCSの不変条件: 任意の合法入力について次を必ず満たす。飽和定数`U_{S,F}`、`U_{I,F}`、`U_{C,F}`は`ResourceContributionPolicy`が定め、いずれも正でなければならない。0を宣言するpolicyを拒否する（第7.19.4節）。

\[
0 \le I_{s,F,e} \le I_{\max,F} \le I_{\mathrm{protocol\_max}}
\]

RCSが`AssetScore`へ接続する経路は、第7.19.4節の加算項`InfrastructureAdjustment`だけである。乗法形の`InfrastructureAdjustedAssetScore`は本版で廃止する。`AssetScore`は第7.6節の5項の和を`A_{\max}(F,t)`で上限した値である。

\[
\mathrm{InfrastructureAdjustment}(S,F,e)
=
A_{\max}(F,t)\cdot I_{s,F,e}/10000
\]

\[
\mathrm{AssetScore}(S,F,t)
=
\min\left(
A_{\max}(F,t),\;
\mathrm{AssetScore}_{base}
+\mathrm{EarlyBonus}
+\mathrm{CultivationBonus}
+\mathrm{PublicationScore}
+\mathrm{InfrastructureAdjustment}
\right)
\]

- `I_{s,F,e}`はbasis pointで表し、`A_max`単位へ換算しない。`I_protocol_max`は`AssetScore`の`A_max`比例係数和の上限（C4）へ算入する。
- storage / index / computeの自己申告値は式に入らない。
- 寄与ゼロならRCSはゼロ。
- 寄与増加でRCSが減少してはならない。
- RCSは同一object / receipt / observationの重複で増加してはならない。
- RCSはCivic Vote weight、Soul authority、forum root authority、SeedAllocation、ALR rate / sourceへ影響してはならない。

storage accounting: 任意nodeの時刻`t`において、次をdaemonがlocalに強制しなければならない。

\[
\sum \mathrm{activeReservationsBytes}
+
\sum \mathrm{durablyCommittedBytes}
\le
\mathrm{localAdmissionBudget}(t)
\]

ただし`localAdmissionBudget`はローカル安全制御であり、ネットワークが申告値を信頼することを意味しない。ネットワーク側の有効寄与は`StorageReceipt`と`StorageAudit`のみから導く。

confidentiality:

- storage nodeが受け取るchunkはciphertextとauthentication tagだけである。
- DEKを持たないentityはciphertextから平文を導出できないことを、暗号スイートの安全性仮定に帰着させる。
- ciphertextの一byte、tag、file version、chunk index、associated dataが改変された場合、clientは復号結果を受理してはならない。
- 暗号化はavailabilityを保証しない。R=3 / EC / receipt / audit / repairを併用する。

### 24.14 Executable Marketing Frontierの不変条件

集合の包含: 常に次が成り立つ。

\[
\mathrm{DeliverableTargets}
\subseteq
\mathrm{AddressableTargets}
\subseteq
\mathrm{PurchaseCandidates}
\]

- opt-out、blocked、category mismatch、forum policy deny、rate-limit exhaustionは`AddressableTargets`から除外される。
- endpoint unavailableは`DeliverableTargets`だけから除外される。
- 同一Soulの重複、同一recipientの複数endpoint、同一campaignの再送で人数を二重計上しない。

実行可能性: `executable_now`と表示されたactionは、同一checkpoint・同一runtime fieldsでacceptance predicateを通過する。requesterが完遂できない行為を`executable_now`と表示してはならない。`external_consent_required` / `future_state_dependent`は実行ボタンを出さない。plan expiry後、state更新後、offer失効後、grant失効後、transfer freeze後、rate limit消費後にactionはrejectされる。`action_draft_commitment`と実行objectが不一致ならreject。実行時のstate変更は既存protocol objectとacceptance predicateを通り、planだけで権限を得ない。

単調性: 他の条件が不変のとき、recipient opt-inの追加はAddressable countを減らさない。同一object / receipt / observationの重複でMarketing Frontierの人数が増加してはならない。

プライバシー: sellerがsmall segmentを使って個人の未購入状態を差分推定できないこと。`MIN_MARKETING_SEGMENT_SIZE`を設定し、閾値未満のsegmentについてはcount、score bucket、condition bucketを返さないか、粗い集計へ丸める。Marketing Frontier queryにはprivacy budget、query rate limit、coarsening、segment mergeを導入する。

atomicity: `MarketingActionBundle`の`all_or_nothing`を、外部決済や外部同意について虚偽に主張してはならない。Stripe payment、他者のcertificate発行、外部recipientのdelivery receipt等、同一トランザクションに原子的に含められないイベントは`staged`にし、各段階の失敗・取消・refund・revalidationを明示する。二つのplanが同じ広告枠、rate limit、offer stock、seed budgetを競合する場合、一方だけが成功し、他方はrevalidation failureになる。

### 24.15 Publication Mechanics Non-Interference

信頼・統治の非干渉:

- `PublicationScore`、`InfrastructureAdjustment`、`CitationBonus`、`AssetMediatedCultivationContribution`、`PublicationDemandObservation`は、Q-set membershipを追加・削除・変更してはならない。
- これらはQdepthを直接又は間接に増減させてはならない。
- これらはCanIssue又はCanIssueToの真偽を変えてはならない。
- これらはcommunity certificate、root entry、forum root authority、Soul Transfer、Forum Root Successionの成立条件を緩和してはならない。
- これらはCivicCitizen、Civic Vote、CivicNeedAssetの投票資格、票重み、nullifier、集計又は最終性を変更してはならない。

上限の独立（引用上限への間接結合の禁止）:

- `AssetAccess_{total}`と`CitationBonus`の上限\(\kappa\cdot AssetAccess_{direct}^{cap}\)は、互いに独立な項目として列挙しなければならない（第7.10節、第7.21.5節）。
- `AssetAccess_{direct}^{cap}`は上限計算専用の入力であり、`AssetAccess_{total}`の第1項に用いる`AssetAccess_{direct}`は、`PublicationScore`と`InfrastructureAdjustment`を含む5項の`AssetScore`から計算する。両者を同一の値として扱ってはならない。
- `PublicationScore`及び`InfrastructureAdjustment`は、`CitationBonus`の上限\(\kappa\cdot AssetAccess_{direct}^{cap}\)の入力になってはならない。`PublicationScore`又は`InfrastructureAdjustment`を増やしても、この上限は変化しない。
- `AssetScore^{cap}=\min(A_{\max}(F,t),\ \mathrm{AssetScore}_{base}+\mathrm{EarlyBonus}+\mathrm{CultivationBonus})\)は、公開由来寄与及びインフラ寄与を除いた3項版であり、`AssetAccess_{direct}^{cap}`の算出にだけ用いる。

経済の非干渉:

- これらはPaymentReceipt、PaymentSettlement、Stripe fee、Gaia network maintenance fee、Forum Revenue Pool contribution、BeneficiaryRule、ALRの祖先プール、seller allocation、PayoutEntitlementの金額又は状態を変更してはならない。
- これらはrefund、dispute、chargeback、reserve、recoveryの既存意味論を短絡してはならない。
- ゲーム上の寄与は、金銭的権利の代替又は追加の通貨発行ではない。

Seedの非干渉:

- `PublicationBaseScore`及び`PublicationUtilityScore`の基準量は`AssetRecord.value`そのものではなく、認定済み`value(a)`に`publication_base_bps`又は各`weight_bps`を適用した別の値である。`PublicationScore`は`AssetRecord.value`ではない。
- `PublicationScore`は`NewCreditableRealValue`ではない。
- `PublicationScore`は`CreditedHighWater`を更新してはならない。
- A_seedへの寄与は既存のレビュー済み`AssetRecord.value`と高水位増分を経由しなければならない。
- 同一の証跡を、`PublicationScore`とA_seedに対して無制限又は反復可能に二重計上してはならない。

市場・プライバシーの非干渉:

- `PublicationScore`によるAssetScore改善は、CandidateIndex、Reach、Access thresholdにある既存の通常規則に従う結果であり、候補・販売・配信・購入を保証しない。
- recipient opt-in、blocked Soul commitment、広告カテゴリ、rate limit、delivery route、privacy budget、最小セグメントサイズを迂回してはならない。
- PublicationEvidenceは、生の利用者リスト、購入者リスト、eKYC属性、メッセージ内容、資産平文を公開してはならない。

### 24.16 Asset 公開経路と尺度の不変条件

アセット公開の力学（第7.21節）、`AssetScore`の尺度統一、アセット利用閾値の尺度統一、及び時刻証人quorumの自動再選択が要求する不変条件を固定する。第9章・第11章・第13章の列挙型不変条件（C7）と同時に確認する。

```text
1.  A_real(F, t) = sum(AssetRecord.value(a, t) for a in ActiveAssets(F, t))

2.  A_max(F, t) = A_seed(F, t) + A_real(F, t) であり、A_max を sum(value(a)) へ
    再定義しない（C2）

3.  0 <= AssetScore(S, F, t) <= A_max(F, t)

4.  PublicationBaseScore(a, S, F, e) = value(a) * publication_base_bps / 10000

5.  PublicationBaseTotal(S, F, e)
      = V_{S,F,e} * publication_base_bps / 10000,
      0 <= V_{S,F,e} <= A_real(F, t) <= A_max(F, t)

6.  PublicationScore(S, F, e)
      <= A_max(F, t) * (publication_base_bps + sum_k(utility_weight_bps(k))) / 10000

7.  公開経路に A_max 比例の個別上限又は件数上限を設けない。量産の抑制は
    係数和の上限と集計の形が担う

8.  PublicationScore 及び InfrastructureAdjustment は、CitationBonus が用いる
    kappa * AssetAccess_direct^{cap} の上限の入力にならない

9.  A_max(F, t) = 0 ならば、A_max 比例の全ての寄与は 0 である

10. threshold(a, F) は絶対値であり、AssetScore と同一の単位で表す。比率形へ
    換算しない

11. 固定された asset 定義と grant 状態の下で、Reach_eligible と Reach は
    AssetScore に対して単調非減少である

12. 10000 * (1 - exp(-kappa_1))
      + publication_base_bps + sum_k(utility_weight_bps(k))
      + 10000 * gamma_F + 10000 * chi
      + asset_mediated_cultivation_extension_cap_bps + I_protocol_max < 10000

13. いかなる score 経路にも NaN、無限大、浮動小数点又は実装依存の丸めを用いない

14. 時刻証人 quorum は forum の temporal_health_policy だけに依存する。witness の
    応答順序、遅延、endpoint 可用性は、Q、depth、AssetScore、A_seed、Civic state
    又は checkpoint finality の入力にならない

15. 第一候補の時刻証人が失敗しても、許された代替証人が残る限り time-health 手続は
    失敗しない
```

加えて次を必須とする。

- `A_max`は`A_seed + A_real`のままとし、`Σ value(a)`へ再定義しない（C2）。`A_real`は`ActiveAssets(F, t)`の認定済み`value`の和である。
- `L_F`（`early_access_cap`）、`L_c`、`seed_cap`は絶対上限であり、basis pointから`A_max`単位への換算規則を適用しない（C5）。
- `AssetScore`は第7.6節の5項の和を`A_max(F,t)`で上限した値である。`CitationBonus`は`AssetScore`の項ではなく、第7.10節の`AssetAccess_{total}`の項である。
- `PublicationScore`の`A_max`比例係数は、`publication_base_bps`と6つの`*_weight_bps`の和である。基準量は`value(a)`であるが、`V_{S,F,e}\le A_{max}(F,t)`であるためC4へ算入する。
- `asset_citation_extension_cap_bps`は`CitationBonus`の上限として`AssetAccess_{total}`側で作用するため`AssetScore`の係数和に算入せず、`asset_mediated_cultivation_extension_cap_bps`は`CultivationBonus`の外側に加算されるため算入する（第7.21.5節）。

### 24.17 Civic 分散状態機械の不変条件

第23章の分散Civic状態機械が要求する不変条件を固定する。第23.17節の保存則、並びに第23.15節・第23.16節・第23.20節のvalidator committee・BFT finality・完全オフライン検証の規則と同じ内容を、実装・テスト・監査の検査対象として列挙する。

```text
1.  Ballot budget conservation

2.  Quadratic influence bound

3.  1 ballot nullifier・1 epochにつきtally入力となるvalid ballotは最大一つである

4.  Merge does not amplify existing quadratic influence

5.  Merge reduces active bundle count by source_count - 1

6.  Split restores only pre-merge allocation atoms

7.  Post-merge allocations are never auto-distributed on split

8.  Inactive need targets contribute zero active NeedScore

9.  Active bundle count never exceeds K(F)

10. FIFO order depends only on finalized accepted_sequence

11. Civic finality requires 2f + 1 valid precommits from n >= 3f + 1 validators

12. Civic finality is offline-verifiable without forum root access
```

加えて次を必須とする。

- 票予算は`V_F`で有界である。`\forall S,F,e:\sum_{a\in Ballot(S,F,e)}allocated\_votes(a)\le V_F`、`CivicInfluence(S,F,e)\le V_F^2`。
- `ActiveCivicNeedCount(F,t)\le K(F)\le V_F`である。
- NeedMerge、NeedSplit、FIFO退場及びsupersessionの前後で、WildRaw atomの総量は不変であり、inactiveなWildRaw atomをactiveな`CivicNeedScore`へ加算しない。
- WildContributionの正規化分母はepoch開始時点のactive need集合に固定され、merge、split、FIFO退場又はsupersessionによって変化しない。
- InactiveNeedTargetのallocationは、activeな`CivicNeedScore`に寄与しない。
- Civic Voteの確定は、forum rootの単独集計ではなく分散validator committeeのBFT finalityによる。root単独署名はCivic tally finalityの根拠にならない（第3.5節、第23.15節、第23.16節）。

### 24.18 Cross-forum割引係数 rho のGaia全体不変条件

第7.8節の複数forum `AssetAccess_direct`を計算する減衰係数を固定する。第4章の必要参加期間式における小文字`p`とは別の値である。`rho(t*)`は第18.23節の`GaiaAssetAccessPolicy`がGaia全体で一意に定める。

```text
1. 0 < rho(t) < 1

2. rho(t) is unique for every Gaia-wide evaluation time t

3. cross-forum AssetAccess_direct uses only rho(t*) from the
   uniquely valid GaiaAssetAccessPolicy at evaluation time t*

4. forum genesis, forum root, forum checkpoint and forum operator
   cannot choose or mutate rho

5. changing GaiaAssetAccessPolicy at valid_from does not alter
   any cross-forum calculation evaluated before valid_from

6. the same CrossForumAssetAccessProof always yields the same
   AssetAccess_direct result in every implementation
```

加えて次を必須とする。

- `rho(t*)`は既約有理数の正規化表現で表し、`rho=1`、`rho<=0`、NaN、無限大、浮動小数点及び実装依存丸めを拒否する。
- 同一評価時刻に有効な`GaiaAssetAccessPolicy`が一意に定まらない場合、cross-forum `AssetAccess_direct`はfail-closedで拒否する。
- forum genesis、forum root、forum checkpoint及びforum operatorは`rho`を選択・変更できない。`rho`をforum genesisへ含めない。

### 24.19 Forum参加 eKYC の不変条件

第17章のforum参加eKYC policyが要求する不変条件を固定する。中立性の主張は`membership_ekyc_policy`ごとのpath制限付きで成立する（第4.2節、第13.2節、第23.3節）。

```text
1.  membership_ekyc_policy is immutable after forum genesis

2.  not_required forums do not require eKYC proof
    for ordinary protocol membership

3.  verified_required forums accept root_entry or community
    only when ForumMembershipEkyc is valid at issued_at

4.  ForumMembershipEkyc must not depend on ActiveMember,
    preventing circular membership validation

5.  active membership in a verified_required forum requires
    valid ForumMembershipEkyc at evaluation time

6.  eKYC expiry, revocation or unverifiability suspends
    future active membership and normal authority without
    rewriting historical certificates

7.  suspended_for_ekyc intervals contribute zero to T_actual

8.  ForumMembershipEkyc must be verifiable offline from
    credential, authorization, revocation, identity binding
    and checkpoint proofs

9.  eKYC raw personal data must never appear in Gaia P2P
    objects, checkpoints, StateProofEnvelope or forum records

10. eKYC membership policy must not directly modify Q,
    depth, CanIssue, CanIssueTo, AssetScore, A_seed,
    Civic influence or forum root authority

11. ActiveMember is the only path through which eKYC affects
    T_actual, Q, depth, CanIssue, CanIssueTo, AssetScore,
    A_seed, EarlyBonus, CultivationBonus, CitationBonus,
    CanPublishAsset, ordinary Candidates and ordinary Reach.
    No coefficient, weight, threshold or bonus term may read
    eKYC state directly

12. in not_required forums, the presence or absence of an
    eKYC credential changes none of Q, depth, CanIssue,
    CanIssueTo, A_seed, EarlyBonus, CultivationBonus,
    CitationBonus, AssetScore, ordinary Candidates or
    ordinary Reach, exactly as in the pre-amendment spec

13. in verified_required forums, the only difference caused
    by the presence or absence of an eKYC credential is the
    ActiveMember predicate defined in §4.2 and §13.2

14. CivicCandidates and CivicReach are governed by the
    CivicCitizen predicate (§17.7), which is a separate path
    from ActiveMember. Items 11 to 13 do not restrict that
    path. In a verified_required forum a Soul without eKYC is
    excluded from CivicCandidates both through ActiveMember
    and through CivicCitizen; this double exclusion is
    intended and must not be collapsed into one
```

項目11〜14がpath制限付きである理由: `Candidates`は`ActiveMembers`を入力に持つため（第7.13節）、`EkycMembershipEligible`を`ActiveMember`の条件へ加えると（第4.2節・第13.2節）、`verified_required` forumでは「eKYC credentialの有無だけを変えても通常ゲーム値は不変」という中立性の主張が偽になる。したがって中立性は、`not_required` forumでは無条件（項目12）、`verified_required` forumではforum参加境界のpath（`ActiveMember`・`T_actual`・`depth`・`Q`寄与・`AssetScore`・`Candidates`・`Reach`）に限って成立する（項目13）。`CivicCandidates`・`CivicReach`は`CivicCitizen`述語（第17.7節）が支配する別経路であり、項目11〜13はこの経路を制限しない（項目14）。

### 24.20 輸送とGaia authorityの分離

gaia-networkは輸送層であり、Soul、forum、権利、決済、finalityの実装を吸収しない。この節は、第29章の統合契約がGaiaの数理的・経済的不変条件へ干渉しないことを列挙する。第24.1節〜第24.19節の数理的`AssetScore`・Civic不変条件を変更しない。

- 認証済みDeviceIdは、GaiaのSoul identity、authority認可、lease、trust epoch、Civic資格又はfinality権限を単独で含意しない。transport接続の認証とGaia objectのML-DSA-65署名検証は別の検証である。
- `SessionBinding`は、現在のconnection binding、両endpoint、ML-DSA-65 transcript及び有効なleaseへ結び付く。binding IDの所持はGaia権限を与えない。
- QUIC connectionの交換、Endpoint再構築、process restart、transport DeviceId変更では旧sessionを再利用できない。同一connection内のdirect/relay切替、relay failover、NAT再binding、path migrationだけではsessionを移植又は交換しない。
- DHT tag、descriptor、relay URL、address候補、peer inventory、online表示による自己記述は、権限・容量・支払い・finalityの証拠ではない。
- Transport配送完了（HTTP成功、body transfer完了、QUIC ACK、relay転送）は、durable保存、`StorageReceipt`、`StorageAudit`成功、広告配達receipt又は購入履行を含意しない。
- 有効な保存済みGaia objectのオフライン検証結果は、通信経路の変更、discovery停止、NAT traversal失敗、relay拒否、接続断に依存しない。ただし現在の操作の受付には、その操作に必要な有効lease、session、時刻及び前状態を別途要求する。
- 不健康BodyのGaia要求は第14.8節のallowlistに限定する。Endpointの維持、DHT routing制御、Irohの不透明なrelay forwarding、公開transport descriptor応答その他のgeneric transport制御の継続を、通常Gaia objectの生成・配送・同期・受領確認の許可と解釈しない。`CommunicationHealthAttachment`のscope及びepochは各session要求で`SessionBinding`と一致させ、header又はtransport contextの存在だけでこのattachmentを省略しない。
- 全通常state mutationはgaia-core dispatcherを通る。gaia-network adapterが`NetworkError`、HTTP status又はtransport-private headerだけでauthorityを許可せず、`SessionBinding`をキャッシュしただけでcoreの検証を省略しない。
- gaia-networkの有界資源、deadline、no replay、秘密非記録の規範を、Gaia adapterもすり抜けない。submitted application requestをgaia-networkが自動再実行しない。
- 上位の`Candidates`、`Reach`、`CivicCandidates`、`CivicReach`、`DeliverableTargets`、`AudienceIndex`、`CandidateIndex`の完全性を、DHT tag find又はdescriptor取得の成功から推定しない。`Network::find(Tag)`はexact-tag sampleを返すものであり、全文検索、asset検索、global membership、Civic候補又は`DeliverableTargets`の完全列挙を代替しない。DeliveryRouteHealthyは評価時点の有界な観測であり、配送成功又は候補のオンライン性の保証ではない。
- Iroh relayは暗号化されたtransport bytesを中継するだけであり、Gaia objectの保存・認可・再配送・永続化を行わない。Gaia application mailbox、forum notification inbox、store-and-forwardの保存・認可・receiptはGaia上位サービスが所有する。
- 上流source監査及びローカル正確性試験は実装完了のゲートであり、実施していなければNOT_RUN又はAUDIT_PENDINGとする。大規模試験と巨大ネットワークの成功保証は、本仕様の実装完了条件ではない。

---

## 25. 実装必須事項

実装は、第9章・第11章・第13章の規則に加えて、次を必ず満たす。

- 全時刻はUTC Unix integer tickを用いる。浮動小数点時刻は禁止する。
- 時刻区間、offset interval、期限比較、threshold判定は、任意精度整数または既約有理数と決定論的な区間手続で評価する。
- Health、Soul、device、commerce、Bank objectのcanonical encodingをgaia-core全体で固定する。objectごとのsuite交渉やalgorithm agilityを持たない。
- secret keyのexportを許す実装は、high-assurance device binding tierを主張してはならない（第15.5節）。
- gaia-coreは、health stateのゲートをCLI、API、daemon、SDK、署名器、object作成、relayに一貫して適用する（第14.8節のallowlist）。
- 通常objectを生成するsignerは、`SoulEpochLease`と`TemporalHealthLease`を取得できない場合、fail closedで失敗する。ゲートを飛ばして署名する経路を作ってはならない。
- 不健康中の署名objectは、発行時点を覆うleaseを提示できなければ受理しない（第14.8節の後日投下の無効化）。
- Gaia Bank providerから受けたbytesは、すべて未検証として扱う（第20.6節）。
- 中央serviceの短期署名鍵はローテーション可能にする。Owner keysは日常運用に用いない（第18.16節）。
- Owner鍵、Payment-Service鍵、Soul-Bank鍵、eKYC service鍵は異なるkey domainとし、一つの鍵を複数の中央責務へ再利用しない（第18.16節）。
- 通常authorityで署名されたすべてのobjectに、`AuthorityOperationHeader`の連鎖を維持する（第15.4節）。
- エラーは、第22.2節の既存・追加エラーコードのいずれかで返し、内部状態の不一致を黙って通さない。
- 通常authorityのすべての判定に、`NotSoulTransferLocked`と`ActiveTrustEpoch`の条件を含める（第15.3節）。Soul Recordの`transfer_lifecycle_state`、`trust_epoch`、`transfer_sequence`を一貫して検証する。

「数学的に一切の危険がない」「現実世界を含めて完全に安全」と主張してはならない。代わりに以下を正確に記載する。

> Gaiaは、明示した状態機械、不変条件、eKYC依存閉包、authority切替、trust epoch非承継、決済状態分離について、決定論的な検証規則を定める。実装は、有限状態モデル検査、property-based testing、状態遷移fuzzing、canonical serialization test vector、Stripe webhookの冪等性試験、chargeback/異議/障害復旧試験、及び並行性を扱う形式手法により検証しなければならない。

最低限、実装リポジトリには以下のテスト群を置くべきである。

- eKYC未済売主・買主の譲渡拒否
- eKYC期限切れ・失効・purpose不一致の拒否
- 同一主体・関連当事者・distinctness不明の拒否
- agreementなし、freezeなし、payment reservationなしのfinalization拒否
- 凍結後のcertificate発行、checkpoint、payout、Civic vote、asset変更、再譲渡拒否
- old authority/new authorityの同時通常権限不可能性（第24.9節の`OldAuthorityCannotExerciseNormalAuthority`）
- trust epochの連続性・分岐拒否（第24.9節の`TrustEpoch(S,t)=TrustEpoch(S,t^-)+1`及び成功者の非承継`NoPriorTrustEpochContributionCountsForSuccessor`）
- 譲渡前Q-setのみでは譲渡後Qが0となること
- 譲渡前depthを用いたCanIssue拒否
- 過去Civic nullifierを買主が使えないこと
- forum genesis/forum_id/root ledgerがroot succession前後で不変であること（第24.10節）
- root succession中のroot entry発行拒否
- forum root transfer freeze中は`|ActiveRootAuthorities(F,t)| = 0`を許し、正常稼働時はちょうど1である試験（第24.10節）
- webhook重複・順不同・再送で二重releaseしないこと
- chargeback後に自動authority rollbackしないこと
- StateProofEnvelopeのobject/proof欠落時のfail-closed
- transfer registry及びroot succession registryのfork拒否
- `PaymentReceipt`と`TransferFinalized`が互いを含意せず（`PaymentReceipt ⇒/⇐ TransferFinalized`）、かつ`TransferFinalized`が`PayoutAvailableToSeller`を含意しない（`TransferFinalized ⇏ PayoutAvailableToSeller`）試験（第24.11節の「決済非同一性」）

第24章の数理的不変条件のテスト要件:

- `Accept = healthy ∧ active ∧ soul_lease ∧ health_lease ∧ operation_chain`の5個のconjunctを一つずつfalseにした入力で、いずれの場合も`Accept`がfalseになる試験（第24.1節）
- 正規の転生遷移`(active(old), pending(new)) -> (retired(old), active(new))`の前後でactive bodyがちょうど1個であり、途中状態を作る遷移・複数active化・時刻逆行が拒否される試験（第24.2節）
- 高水位creditの恒等式`CreditDelta(H,P,l,q) = max(0, v_l(q) - CreditedHighWater(H,P,l,q^-))`が各lineageで非負であり、値列全体の累積creditが`sum_q CreditDelta(H,P,l,q) = max_q v_l(q)`を満たし、value低下・停止・過去credit水準までの回復が同じ価値を再creditしない試験（第24.3節）
- すべての`SeedAllocation`について`allocated_amount <= Unspent(o,q)`が強制され、`Unspent`を超えるallocationが拒否される試験（第24.4節）
- 時計不調・隔離・回復待ちの区間を含む入力で、健康区間の和が増えず、`depth`と`T_actual`が進まない試験（第24.5節）
- commerce state（支払い金額、Bank売上、eKYC tier、`PaymentSettlement`、`PayoutEntitlement`、`ForumRevenuePoolDistribution`等）を変化させても`Q`、`depth`、`AssetScore`、`A_seed`が不変である試験（第24.6節）
- 同一genesis・checkpoint・`StateProofEnvelope`・leaseから、すべての検証器が同一のAccept/Reject/エラーを返す試験（第24.7節）
- `identity_pubkey -> authority_pubkey -> active Body -> soul_id`の双方向の追跡可能性、ZK proof・匿名binding・authority-only fallbackの不存在、及び`identity_pubkey`の公開が氏名・住所・KYC属性・Stripe情報等の個人情報開示を含まないことを確認する試験（第24.8節の項目1〜15）

Asset Lineage Royaltyについては、次を必須とする。

数学不変条件: 任意の合法入力`B >= 0`、`0 <= α <= 10000`、`0 < r < 10000`、`0 <= d <= D_max`について、必ず次を検証する。以下の等式は`d > 0`のときに成立する。`d = 0`の場合は第7.18.5節により`A = 0`、`P_{seller} = B`であり（Vector C）、等式の対象外である。

\[
A = \left\lfloor B\alpha/10000 \right\rfloor
\qquad(d>0)
\]

\[
P_{seller} = B - A \ge 0
\]

\[
R_k \ge 0
\]

\[
\sum_{k=1}^{d}R_k = A
\]

\[
P_{seller} + \sum_{k=1}^{d}R_k = B
\]

さらに以下を検証する。

- `d=0`ならsellerが全額を受ける。
- `α=0`ならsellerが全額を受ける。
- `B=0`なら全配分がゼロ。
- `α=10000`ならseller allocationはゼロ。
- `r`が0に近いと直親が祖先プールのほぼ全額を得る。
- `r`が10000に近いと深い祖先への分布が相対的に平坦化するが、分母ゼロにはならない。
- 端数が発生する全ケースでlargest remainder ruleにより1 minor unitも失われず、重複配分されない。

プロパティベーステスト: 最低100,000以上のランダムまたは網羅的ケースで、以下を検証する。

- amount、α、r、depth、ancestor Soul重複、通貨minor unit、forum fee、network fee、Stripe feeの組合せ。
- overflow boundaryに近い金額。
- `max_lineage_depth`境界。
- policy mismatch、parent grant expiry、grant revocation、scope mismatch。
- lineage cycle生成試行。
- parent hash substitution。
- saleの二重payment receipt / repeated webhook。
- payout aggregationの重複entitlement inclusion。
- refund / partial refund / chargeback / transfer reversal。
- Soul Transfer中・前・後のentitlement claim。

決定論的テストベクトル: 以下をcanonical test vectorとして本文または付録に固定する。

```text
Vector A: 通常例
B = 10000 minor
α = 3000 bps
r = 6000 bps
d = 3
A = 3000
seller = 7000
ancestor allocations = [1531, 918, 551]
sum = 10000
```

```text
Vector A の内訳
denominator_3 = rden^3 - rnum^3 = 784000000000
numerator_1 = 1200000000000000, floor = 1530, remainder = 480000000000
numerator_2 = 720000000000000,  floor = 918,  remainder = 288000000000
numerator_3 = 432000000000000,  floor = 551,  remainder = 16000000000
sum of floors = 2999, L = 1
remainder order (descending) = k1 > k2 > k3
```

```text
Vector B: 端数が強い例
B = 101 minor
α = 3333 bps
r = 3333 bps
d = 4
A = 33
seller = 68
denominator_4 = rden^4 - rnum^4 = 9876592585185679
numerator_1 = 220011000000000000, floor = 22, remainder = 2725963125915062
numerator_2 = 73329666300000000,  floor = 7,  remainder = 4193518203700247
numerator_3 = 24440777777790000,  floor = 2,  remainder = 4687592607418642
numerator_4 = 8146111233337407,   floor = 0,  remainder = 8146111233337407
sum of floors = 31, L = 2
remainder order (descending) = k4 > k3 > k2 > k1
ancestor allocations = [22, 7, 3, 1]
sum = 33
```

```text
Vector C: 深度ゼロ
B = 10000 minor
α = 3000 bps
r = 6000 bps
d = 0
A = 0
seller = 10000
allocations = []
```

```text
Vector D: 祖先プール全額
B = 10000 minor
α = 10000 bps
r = 5000 bps
d = 4
A = 10000
seller = 0
ancestor sum = 10000
denominator_4 = rden^4 - rnum^4 = 9375000000000000
numerator_1 = 50000000000000000000, floor = 5333, remainder = 3125000000000000
numerator_2 = 25000000000000000000, floor = 2666, remainder = 6250000000000000
numerator_3 = 12500000000000000000, floor = 1333, remainder = 3125000000000000
numerator_4 = 6250000000000000000,   floor = 666,  remainder = 6250000000000000
sum of floors = 9998, L = 2
remainder order (descending) = k2 > k4 > k1 > k3（k2とk4は同剰余であり、generationの小さい順で解決する）
ancestor allocations = [5333, 2667, 1333, 667]
```

参照実装: 本仕様のリポジトリには、次の関数を持つPython reference implementationを必須とする。

```python
allocate_lineage_royalty(
    beneficiary_pool_minor: int,
    ancestor_pool_rate_bps: int,
    decay_ratio_bps: int,
    effective_ancestor_count: int,
    ordered_ancestor_ids: list[bytes],
) -> AllocationResult
```

要件:

- `Fraction`または整数有理数を用いる。
- floatを使わない。
- seller amount、ancestor pool、各generationのexact numerator/denominator、floor、remainder rank、final amountを返す。
- conservation assertionを内蔵する。
- Rust implementationと完全に一致するtest vectorsを出力する。

Discovery tests:

- 全active assetがpublic discovery recordを持つ。
- inactive / expired assetがcurrent purchasabilityとして表示されない。
- price / currency / offer / policyがdiscovery recordとcanonical offer / `AssetRecord`で一致する。
- index providerが改竄・古い価格・偽offerを返しても、client proof verificationがrejectする。
- private metadata、DEK、wrapped DEK、private manifest、recipient identityがpublic discovery documentに混入するとreject。
- forum横断search、local index、remote top-k merge、index corruption、provider outageを試験する。

Storage tests:

- reservationの並行取得でlocal budgetを超えない。
- reservation expiryで未使用容量が解放される。
- disk full / ENOSPCで`StorageReceipt`が発行されない。
- hash mismatch、fsync failure、atomic rename failure、metadata commit failureでreceiptが発行されない。
- valid R distinct-domain receipts未満ではHealthyにならない。
- contributor receiptはstrict durable quorumに算入されない。
- network partitionでrepairはadditive、durable replica deleteは禁止。
- audit failureはat-risk / repairを起動し、該当寄与を失効・減衰させる。

Encryption tests:

- random per-file-version DEKを使う。
- nonce uniquenessをfile version + chunk indexで検証する。
- 正常ciphertext chunkが復号・順序再構成できる。
- ciphertext 1 byte改変、tag改変、chunk index置換、file version置換、associated data置換でauthentication failureになる。
- storage nodeが`KeyEnvelope`なしでは平文を得られないことを、API boundary / type boundary / integration testで確認する。
- recipient Soul / grant / content ref / file version mismatchの`KeyEnvelope`をreject。
- key rotation後に旧DEKが新versionを復号できない。

Resource contribution tests: Python reference modelを追加し、少なくとも250,000ケースで次を確認する。

- self-declared storage capacity / GPU / CPU / FLOPSがRCS入力にない。
- effective storageはvalid receipt、fresh audit、policy、distinct domainの全条件を満たす量を超えない。
- bonusは非負でprotocol cap以下。
- effective storage / valid index contributionの増加でbonusが減らない。
- inputがゼロならbonusはゼロ。
- InfrastructureAdjustmentはA_max(F,t) * I_{s,F,e} / 10000に一致し、0以上A_max(F,t) * I_protocol_max / 10000以下である。
- duplicate receipt / duplicate observation / same object duplicate replicaでbonusが二重計上されない。
- compute contributionは本仕様では常にゼロweight。
- RCSがCivic weight、authority、seed、ALRに接続できない。
- 乗法形`floor(AssetScore * (10000 + I_{s,F,e}) / 10000)`及び`InfrastructureAdjustedAssetScore`を拒否し、第7.19.4節の加算形だけを受理する試験（第24.13節）。

本仕様の必須Python reference functions:

```python
compute_effective_storage(receipts, audits, references, failure_domains, policy) -> int
compute_discovery_contribution(observations, checkpoint_freshness, policy) -> int
compute_resource_contribution_bps(storage, index, compute, policy) -> int
apply_infrastructure_adjustment(a_max, contribution_bps) -> int
seal_chunk(dek, file_version_id, chunk_index, plaintext, associated_data) -> CiphertextChunk
open_chunk(dek, file_version_id, chunk_index, ciphertext_chunk, associated_data) -> bytes
```

floatの使用は禁止。score計算は整数minor / basis points、暗号試験はaudited libraryを使用する実装に対して行う。

Executable Marketing Frontierのテスト要件:

実行可能性:

- `executable_now`と表示されたactionは、同一checkpoint・同一runtime fieldsでacceptance predicateを通過する。
- `requestable_now`はrequest objectを作れるが、外部承認が必要な後続actionを勝手に成功扱いしない。
- `external_consent_required` / `future_state_dependent`は実行ボタンを出さない。
- plan expiry後、state更新後、offer失効後、grant失効後、transfer freeze後、rate limit消費後にactionがrejectされる。
- `action_draft_commitment`と実行objectが不一致ならreject。

集合計算:

- PurchaseCandidates、AddressableTargets、DeliverableTargetsが互いに正しく包含関係を持つ。
- opt-out、blocked、category mismatch、forum policy deny、rate-limit exhaustionはAddressableTargetsから除外される。
- endpoint unavailableはDeliverableTargetsだけから除外される。
- 同一Soulの重複、同一recipientの複数endpoint、同一campaignの再送で人数を二重計上しない。

プライバシー:

- sellerがsmall segmentを使って個人の未購入状態を差分推定できないこと。
- block list、exact eKYC、exact score、private membershipがresponseに出ないこと。
- opt-out recipientへAdvertisementDeliveryが作れないこと。
- PromotionGrantだけでrecipient policyを迂回できないこと。

レースと再実行:

- 二つのplanが同じ広告枠、rate limit、offer stock、seed budgetを競合する場合、一方だけが成功し、他方はrevalidation failureになる。
- Stripe paymentがpending / failed / refundedの場合、promotion / ad deliveryのstateが正しく遷移する。
- Soul Transfer中にplanが作成・実行された場合、transfer freezeがactionを阻止する。
- forum root succession中のpolicy更新との競合を検証する。

Property tests: Python / Rust property testで少なくとも100,000ケース以上、以下を検証する。

- set inclusion
- no duplicate count
- no action labelled executable when one required predicate is false
- monotonicity: recipient opt-in追加は他条件不変ならAddressable countを減らさない
- privacy threshold enforcement
- plan expiration / checkpoint mismatch fail closed
- action draft binding
- rate limit conservation

Asset Publication Mechanicsのテスト要件:

数理・境界テスト:

- `PublicationScore`が0以上である。
- `PublicationScore`が`A_max(F,t)·(publication_base_bps + sum_k(utility_weight_bps(k)))/10000`を超えない。
- 1アセットの`PublicationBaseScore`が`value(a)·publication_base_bps/10000`に一致する。
- 公開経路に`A_max`比例の個別上限又は件数上限を宣言するgenesis又はpolicyを拒否する。
- `10000·(1-exp(-kappa_1)) + publication_base_bps + sum_k(utility_weight_bps(k)) + 10000·gamma_F + 10000·chi + asset_mediated_cultivation_extension_cap_bps + I_protocol_max >= 10000`のpolicyを拒否する。
- 認定価値の総和が同じである`N`個のアセットの公開と、同じ総和を持つ1個のアセットの公開が、`N`によらず同一の`PublicationBaseTotal`を与える（量産中立）。
- `CitationBonus`のアセット由来追加部分が`asset_citation_extension_cap_bps`を超えない。
- `AssetMediatedCultivationContribution`のアセット媒介追加部分が`A_max(F)·asset_mediated_cultivation_extension_cap_bps/10000`を超えない。
- `AssetScore`が`A_max(F,t)`を超えない。
- `threshold(a,F)`が絶対値であり、`A_max`の変化に対して不変である。
- 利用者数が増えても、利用係数の限界増分は非増加である。
- 利用者数が10を超えても、当該アセットの利用係数は増えない。
- 可用性低下、監査失敗、鮮度喪失、失効、取消は寄与を増やさない。
- 高水位creditは単調であり、同一価値を再計上しない。
- `A_real(F,t) = sum(AssetRecord.value(a,t) for a in ActiveAssets(F,t))`が成立する試験（第24.16節の項目1）。
- `A_max`が`A_seed + A_real`のままであり、`sum(value(a))`へ再定義されない試験（第24.16節の項目2）。
- `PublicationBaseTotal = V_{S,F,e} * publication_base_bps / 10000`が成立する試験（第24.16節の項目5）。
- NaN、無限大、浮動小数点又は実装依存の丸めが、いかなるscore経路にも現れない試験（第24.16節の項目13）。

攻撃シナリオ:

- 空アセットを1,000件登録しても`PublicationScore`は0。
- 自己アクセス・自己購入・同一Soulの別Body・共通本人性の相互購入を1,000件作っても`PublicationScore`、`CitationBonus`のアセット由来追加部分、`AssetMediatedCultivationContribution`は0。
- 単一アセットへの10,000のSybil利用を主張しても、独立性判定及び計上対象独立利用者数の上限`MAX_INDEPENDENT_USERS_COUNTED_PER_ASSET_EPOCH`（1アセット・1epochあたり10）により、計上される独立利用者数は10を超えない。
- 50件又は1,000件の高品質アセットを同時公開しても`PublicationScore`が`A_max(F,t)·(publication_base_bps + sum_k(utility_weight_bps(k)))/10000`を超えず、かつ認定価値の総和が同じ単一アセット公開と厳密に一致する。
- 公開直後、`minimum_publication_age_epochs`未満のアセットは寄与0。
- 未finalized決済、返金、部分返金、dispute、chargeback、recovery中の取引は正の実利用根拠にならない。
- 無権限派生、expired grant、revoked grant、lineage cycle、親ハッシュ差替えは寄与0かつreject。
- 循環引用、自己引用、相互引用リング、同一引用の再提出はCitation寄与を増やさない。
- 同一利用者の成熟を複数アセット、複数epoch、複数公開者で重複計上しない。
- 公開者自身が自身のアセットを保存・索引しただけでは、公開者のRCSを増やさない。
- 同一failure domain上の複数StorageReceiptは、第三者RCS需要の独立証拠を過大計上しない。
- アセットを売った後にコンテンツを失効・削除・監査失敗させると、将来epochの可用性寄与が0へ減衰する。

非干渉プロパティテスト:

- 同一のQ-set、community certificate、participation、health、checkpointを保ったままPublicationEvidenceだけを増減してもQdepthは不変。
- 同じ条件でCanIssueとCanIssueToは不変。
- 同じ条件でCivicCitizen資格、Civic Vote票重み、nullifier、tallyは不変。
- 同じPaymentReceipt、PaymentSettlement、ALR policy、BeneficiaryRuleを保ったままPublicationEvidenceだけを変えても、決済額、ALR額、Forum Revenue Pool額、PayoutEntitlementは不変。
- 同じ`AssetRecord.value`とSeedCreditLedgerを保ったまま`PublicationScore`だけを変えても、NewCreditableRealValue、CreditedHighWater、origin lot budget、A_seedは不変。
- AssetScoreが閾値を超えた結果としてCandidateIndexやReachが変わる場合でも、grant、opt-in、blocked state、delivery validity、payment validityは自動的に変化しない。

Canonical test vectors（少なくともP1〜P10）:

```text
Vector P1: 空アセット active=true, use=0, need=0, citation=0, derivative=0 -> PublicationScore = 0
Vector P2: 自己購入 publisher Soul = buyer Soul -> PublicationScore/citation/cultivation = 0
Vector P3: 共通本人性 publisher != buyer, verified common identity = true -> all publication positive score paths = 0
Vector P4: 成熟前 publication age=1, min=2 -> PublicationScore = 0
Vector P5: 1件の有効公開資産 value(a) = V, use = max -> PublicationBaseScore = V * publication_base_bps / 10000
Vector P6: 50件の有効公開資産 each max valid -> PublicationScore = (sum value(a)) * (publication_base_bps + sum_k(utility_weight_bps(k))) / 10000, かつ同じ総和の1件公開と一致
Vector P7: 無限Sybil主張 claimed=10000, counted=10 -> 1アセットあたり PublicationBaseScore は value(a) のみに依存し、claimed の増加に対して不変である
Vector P8: 可用性喪失 stale audit/unavailable -> subsequent positive availability contribution = 0
Vector P9: 引用循環 A cites B and B cites A -> cycle rejection / no new credit
Vector P10: Asset-mediated cultivation duplicate one matured Soul, two assets from same publisher -> at most one credit
```

Asset Publication Mechanicsの追加必須試験:

- 同一の`value(a)`を持つアセットが、`A_max`の異なる二つのforumで同一の`PublicationBaseScore`を得る試験
- `value(a) = 0`のアセットが`PublicationBaseScore`を得ない試験
- 1,000件の`value(a) = 0`のアセットを公開しても公開経路の寄与が0である試験
- `A_max(F,t) = 0`のforumで公開の事実が0点である試験
- `PublicationScore`を増やしても`CitationBonus`の上限`kappa·AssetAccess_direct^{cap}`が変化しない試験
- `threshold(a,F) = 0`かつ`A_max(F,t) = 0`のforumで利用制限なしが成立する試験
- asset登録により`A_max`が増加しても`Reach_eligible`と`Reach`が減少しない試験（比率形の反例の回帰試験）
- 第一候補の時刻証人が全て失敗しても、代替証人でquorumに到達する試験
- 時刻証人の応答順序、通信遅延及びendpoint可用性だけを変えても、`Q`、`depth`、`AssetScore`、`A_seed`、Civic state及びcheckpoint finalityが変化しない試験（第24.16節の項目14）
- 同一`witness_domain_id`の複数証人を独立domainとして数えない試験
- `retry_delay(k)`が`retry_backoff_max`で飽和し、桁あふれしない試験
- 時刻証人の通信失敗がSoul・controller・forumの罰則根拠にならない試験

Civic BFT・分散Civic状態機械のテスト要件:

- `V_F=15`で複数needへの票配分総和が15を超えるballotのreject
- 同一ballot nullifier・同一revision sequenceのballot forkの全票無効化
- ballot revisionにより旧ballotがtallyから除外される試験
- 3票と4票のneed mergeが49ではなく25の影響を維持する試験
- merge後に7票へ再配分した場合だけ49を得る試験
- split時のpre-merge allocation復元試験
- split時にpost-merge allocationが自動分配されず未配分票へ戻る試験
- FIFO retirement後の票がactive `CivicNeedScore`に寄与しない試験
- `K(F)`件を超えるactive needが存在しない試験
- LLM merge proposalがBFT quorumなしにfinalにならない試験
- `CivicFinalityBundle`を完全オフラインで検証する試験
- root単独署名のCivic tallyをrejectする試験
- mergeがactive bundle数を厳密に`source_count - 1`だけ減らす試験（第24.17節の項目5）
- FIFO順序がfinalizedな`accepted_sequence`だけに依存し、受信順・到着時刻・実装依存の順序に依存しない試験（第24.17節の項目10）
- `n >= 3f + 1`のvalidator集合から`2f + 1`のvalid precommitが揃わない限りCivic finalityが成立しない試験（第24.17節の項目11）

Cross-forum割引係数 rho のテスト要件:

- 異なるforum genesisが異なる`rho`を含められない試験
- 同一evaluation_timeで二つの`GaiaAssetAccessPolicy`が有効ならrejectする試験
- `rho <= 0`、`rho >= 1`、NaN、無限大、非正規有理数をrejectする試験
- policy `valid_from`前後で異なる`rho`が正しく選ばれる試験
- policy更新後も過去evaluation_timeのcross-forum結果が変わらない試験
- policy proofが不足する`CrossForumAssetAccessProof`をrejectする試験
- 同じforum checkpoint群、同じpolicy、同じevaluation_timeから全実装が同じ`AssetAccess_direct`を再計算する試験
- 参加forum数を増やしたとき、追加forumの`AssetScore`が正なら`AssetAccess_direct`が厳密に増える試験
- 空forumの追加が`AssetAccess_direct`を増やさない試験

Forum参加 eKYC のテスト要件:

- `not_required` forumがeKYC proofなしの`root_entry`と`community`を通常条件で受理する試験
- `verified_required` forumがeKYC proofなしの`root_entry`と`community`を拒否する試験
- expired `IdentityBindingCredential`を拒否する試験
- revoked credentialを拒否する試験
- `forum_membership` purposeを持たないcredentialを拒否する試験
- Soul identity bindingが異なるcredentialを拒否する試験
- eKYC provider authorizationが無効又は期限外の場合に拒否する試験
- `ActiveMember`を前提にせず`ForumMembershipEkyc`を検証できる試験
- eKYC失効後にactive membership、`T_actual`、`CanIssue`、`CanIssueTo`、`AssetScore`、`Candidates`、`Reach`、Civic参加が停止する試験
- eKYC renewal後に新しい`root_entry`又は`community`を発行せずactive membershipが復帰する試験
- suspension中の時間が`T_actual`に加算されない試験
- proof bundleだけで、ネットワーク照会なしに`verified_required` forumの参加資格を検証する試験
- eKYC生データがcertificate、checkpoint、proof bundle、error object又はログに含まれない試験
- `not_required` forumでは、eKYC credentialの有無だけを変えた二状態で`Q`、`depth`、`CanIssue`、`CanIssueTo`、`AssetScore`、`Candidates`、`Reach`が完全一致する試験
- `verified_required` forumでは、eKYC credentialの有無だけを変えた二状態で、forum参加境界のpath（`ActiveMember`、`T_actual`、`depth`、`Q`寄与、`AssetScore`、`Candidates`、`Reach`）だけが変化し得て、`A_seed`、`EarlyBonus`、`CanPublishAsset`は`Q`・`depth`の下流量として同じ`ActiveMember`経路を通じてのみ変化し得る試験（第24.19節の項目11〜13）。`ActiveMember`以外の経路でeKYCの有無だけを変えても、`CultivationBonus`、`CitationBonus`、Civic Vote重み、`V_F`、`CivicNeedScore`、needの状態、`CivicNeedAsset`のstatusは変化しない試験（第24.19節の項目14）
- forum genesis後に`membership_ekyc_policy`を変更する試行を拒否し、`forum_id`が不変である試験（第24.19節の項目1）

### 25.1 gaia-network輸送のローカル正確性試験

第28.33節のローカル正確性試験は、隔離fixtureで実施可能な正確性条件であり、実装完了の必須条件とする。canonical vector（正規化tag、topic、shard assignment、signed-message bytes、canonical header、descriptor）は実計算して入力bytesと期待出力bytesを固定する。未計算値又は未実行の結果をPASSとして記述しない。

### 25.2 Gaiaとgaia-networkの接合試験

次は、すべてローカルisolated fixtureで実施可能な正確性条件である。実施していなければNOT_RUNとする。第28.33節の全元テストも必要であり、この表で代替しない。

| ID | fixture/操作 | 必須観測 |
|---|---|---|
| I01 | 同一Gaia SoulのML-DSA鍵とIroh鍵を別生成 | 鍵域が混同されず署名scopeが正しい |
| I02 | 正しいDeviceIdだが期待Soulと別SoulのTimeHandshake | mutation前reject |
| I03 | tag/descriptorだけをproofとして要求 | authority認可されない |
| I04 | 両reserved header偽装、duplicate、case、Connection nomination | network書換え後だけがtrusted contextになる |
| I05 | 一般frontendからprivate context header注入 | UntrustedTransportContext又はfrontend自身のcontextで検証 |
| I06 | begin/complete/operationを同一handleで送信 | 同一connection local bindingでsession成立 |
| I07 | begin後にconnection close、新handleでcomplete | mismatch、新TimeHandshake必須 |
| I08 | 旧sessionで同DeviceIdの新connectionへ要求 | mutation前TransportBindingMismatch |
| I09 | 同一connection内direct→relay→direct/NAT path更新 | DeviceId/binding維持、時刻規則に問題なければsession継続 |
| I10 | 各exchangeごとQUIC stream/local TCPが変わる | それだけでsessionを新規化しない |
| I11 | simultaneous dial二connection、双方向stream | binding/pool会計が正しくcap迂回なし |
| I12 | pending proofが欠ける/超過する | bounded handshakeでfail-closed。汎用private fetchなし |
| I13 | 期限切れlease/trust epoch変更/transfer freeze | handshake/session/coreで既存具体reject |
| I14 | unhealthy Bodyがnormal sync/配送を要求 | deny、clock recoveryだけ既存allowlist |
| I15 | descriptor/KRPC/relay registrationを初期化前に処理 | Gaia session gateと循環せず秘密/authority露出なし |
| I16 | node間WS Upgrade/CONNECT/raw TCP要求 | 規定501/405又は非公開APIで拒否 |
| I17 | REST/WS/CLI同等canonical inputとverified context | core意味論、object hash、state/event列が同値 |
| I18 | REST events poll再接続、gap/duplicate/limit | sequenceから再開、無限streamなし、event捏造なし |
| I19 | body cap超過、idle/absolute期限、body drop | permitとdriver解放、submittedはUnknown、no retry |
| I20 | response喪失後、新sessionで同operation intent再送 | logical id/idempotency保持、二重外部作用なし |
| I21 | 同じoperation idでpayload差替え | idempotency衝突、accepted状態を変更しない |
| I22 | request deadline/connection close/shutdown | accepted operationの暗黙cancel/rollbackなし |
| I23 | 大きいobjectのchunk/range exchange | cap内stream、hash/manifest/proof検証、receipt条件維持 |
| I24 | Iroh relay成功だけでdurable receiptを要求 | 拒否、上位fsync/metadata commitが必要 |
| I25 | DHT unavailable/relay deniedでも保存proof検証 | offline検証結果が同一 |
| I26 | bootstrap設定/default relay混入検査 | public fallbackなし、read-only actorsが昇格しない |
| I27 | bearer token missing/timeout/verifier full | external admission fail-closed、token非記録 |
| I28 | process/Endpoint再起動、idle eviction、closed handle | binding更新、旧handle redialなし、旧session失効 |
| I29 | session cache/nonce cache/proof/rate limit飽和 | 明示上限で拒否、unbounded task/queueなし |
| I30 | 出力metadataとlog検査 | secret/KYC/token/private recipient不出力、固定metric labels |

第28章の規模参考基準G2〜G4はREFERENCE_ONLYであり、実装完了条件でもSLOでもない。G1のローカル正確性試験は実施可能であり、未実施ならNOT_RUNとする。

数値を最終化する際は、すべての中間固定小数点値、cap適用順、丸め順、expected rejectを明記する。

---

## 26. 明示的限界

本仕様は次を保証しない。

- 認証済みtransport DeviceIdがSoul identity、authority認可、lease又はfinality権限を単独で含意すること
- native DHT metadata（DeviceId、tag、公開descriptor、時刻、routing情報）の秘匿。これらは平文KRPCで観測され得る
- 任意のSybil又はeclipse攻撃への耐性。tag shardingはSybil耐性を提供せず、namespace hashingはrouting nodeを認証しない
- 到達性の保証。network partition、NAT traversal失敗、relay拒否、discovery失敗、peer停止又はlocal application失敗の間も接続が成功すること
- always-onのmobile到達性及びoffline配送。Iroh relayはoffline mailbox、durable delivery、exactly-once実行を提供しない
- relayの自動的な許可。relay URLは自動採用せず、caller又はoperatorの明示的`RelayGrant`と必要な外部交渉を要する
- 記録の即時withdrawal又はsessionの即時revocation。公開済みのstale recordが残り得る
- loopback単独によるlocal process隔離。transport-private listenerはOS isolation又はcredential等の追加制御を要する
- 1億〜100億規模の登録identity及び同時online到達性の実証。第28.32節の容量式は計画モデルであり、登録identity総数Iと同時online publisher数Nは別である。G2〜G4はREFERENCE_ONLYである
- 秘密鍵が完全に複製されていないこと
- 同一の自然人が不正な別名義・別書類で別Soulを作らないこと
- device attestation実装に脆弱性がないこと
- eKYC provider、Payment-Service、Soul-Bankが常に可用であること
- Bank providerが未来にわたり保存を継続すること
- P2P network全体に未観測のforkが存在しないこと
- 物理時計、time witness、ネットワーク遅延が常に正確であること

本仕様が保証するのは、上記の不確実性がある環境でも、必要な健全性・epoch・proofを示せないentityに通常のGaia権限を与えず、示せるobjectだけを決定論的に受理または拒否することである（第13.12節）。

> GaiaにおけるSoul又はforum root authorityの譲渡は、過去を消して別人を同じ主体として見せる仕組みではない。過去の行為者・eKYC束縛・証明書・投票・責任を不変のまま残し、将来の操作責任と指定された契約的地位だけを、eKYC済みの後継主体へ、凍結・決済予約・異議処理・authority切替・trust epoch分離を通じて正規に承継する仕組みである。

> したがって、Gaiaは譲渡可能な運営・商業上の地位を扱えるが、時間、関係、実績、公共責任によって形成される人格的信頼と市民的影響を売買可能な商品にはしない。

---

## 27. ネットワーク移行と互換性

別のprotocol形式（旧形式）で運用されていたネットワークのデータを扱う場合、次の互換規則に従う。この章は移行後の運用を定めるものであり、旧形式の仕様を本書の一部として参照するものではない。

1. 本仕様のnetwork idを新設し、旧形式のobjectとcheckpointを本仕様の同一consensus domainに混在させてはならない。
2. 旧形式の公開鍵nodeを本仕様のSoulへ変換するときは、既存の公開鍵を`identity_pubkey`として扱い、新しい`authority_pubkey`を生成する。旧鍵で署名された通常objectは、本仕様の`AuthorityOperationHeader`とleaseを持たないため、本仕様の通常authority根拠にはならない。
3. 移行中は`pending_successor`状態を使う。本仕様のSoul-Bank genesis recordと、新しいbodyのhealth leaseが確定するまで、通常authorityを与えない。
4. 旧形式のcertificate、asset、checkpoint、`SeedAllocation`は、content hashを保持したままarchive importできる。ただし、本仕様の通常authorityの根拠にするには、本仕様の`StateProofEnvelope`、Soul、健康の各規則を満たす必要がある。
5. 旧形式で積んだ参加時間（T_actual相当）は無条件に引き継がない。移行anchor以降に検証可能なhealthy intervalを、本仕様の`T_actual`として計上する（第4.2節、第14.10節）。
6. 旧形式の`PaymentReceipt`は、本仕様のOwner setによる`PaymentServiceAuthorization`を持たない限り、本仕様のGaia Commerceのreceiptとしては受理しない（第18章）。
7. 既存のgenesisに`max_civic_need_bundle_count`が省略されている場合、省略時既定値`K(F) = V_F`（`max_civic_vote_count`の値）として解釈する。省略された既存genesisを再ハッシュせず、`forum_id`を変更しない。あわせて、`max_civic_vote_count`は本版で「一つのNeedAsset proposalへ宣言できる最大の整数投票数」から「一人のCivicCitizenが一つのCivic epochに全needへ合計で配分できる持ち票`V_F`」へ再定義されたものとして解釈する（第2.4節、第23.2節、C6）。
8. 既存のgenesisに`membership_ekyc_policy`が省略されている場合、省略時既定値`not_required`として解釈する。省略された既存genesisを再ハッシュせず、`forum_id`を変更しない。省略時のcanonical encodeを変更してはならない。省略されたforumは、本版のforum参加eKYC規則（第17章、第24.19節）のうち`not_required`に適用される規則だけに従う。
9. `TimeWitnessPolicy`のように`temporal_health_policy`から参照されるpolicy objectへ新フィールドを追加する場合、既存の参照済みobjectは新フィールドを省略時既定値で解釈し、`time_witness_policy_ref`を差し替えない。参照を差し替えるとgenesisのcanonical encodeが変わり`forum_id`が変わる（C6）。省略時既定値の具体値は、`allowed_time_sources`・`allowed_witness_domains`を既存の`temporal_health_policy`が許すtime source及びwitness domainの全体、`max_parallel_requests`を当該forumの`temporal_health_policy.required_observer_domains`、`max_retry_count`を0、`retry_backoff_initial`・`retry_backoff_max`を0、`retry_backoff_exponent_cap`を0、`collection_deadline`を既存の`max_checkpoint_interval`とする。`max_parallel_requests`の既定値を1として`max_parallel_requests >= required_observer_domains`（第22.10節）を破ってはならない。これにより、省略された`TimeWitnessPolicy`は再試行を追加せず、既存のquorum手続をそのまま再現する。
10. `AssetAnnouncement`の`publish_threshold`削除及び`publish_eligibility_proof_ref`から`announcement_authority_proof_ref`への改名は、既存objectを無効化しない。既存objectの署名は、`publish_eligibility_proof_ref`を`announcement_authority_proof_ref`として解釈する。content-addressed hashはobjectのbytesから計算されるため、改名は再検証可否を変更しない。`publish_threshold`を持たない又は持つ既存objectの双方を、`CanAnnounce`（第10.2節）の下で受理する。公開資格がscore条件を持たないため、閾値の欠落・不一致を理由に既存objectを無効化してはならない。
11. `root_entry`及び`community`の`membership_ekyc_proof_ref_optional`は、省略時の符号化を変更しない（第3.1節）。省略された証明書は、`membership_ekyc_policy=not_required`のforumで従来どおり受理し、`participation_anchor`、root台帳通番、`T_actual`、`depth`、`Q`の計算を変更しない。
12. 第23章の旧Civic object（`CivicVoteCommitment`、`CivicVoteNullifier`、`CivicVoteTally`）は本版で廃止する。旧形式の当該objectは、Civic tallyのfinality根拠としても、`CivicBallot`及び分散Civic状態機械のobjectとしても受理しない。既に確定した旧tallyは、Civic Voteの権限、票重み、`CivicNeedScore`、need順位又は`CivicNeedAsset`のstatusの根拠にしない。旧Civic objectの履歴は監査・表示にだけ用いる。旧形式のnullifierも`CivicBallot`のnullifierとして受理しない（第23.5節）。新規Civic objectの追加は、既存object及びgenesisを無効化せず、既存objectのcontent-addressed hashを変更しない。
13. 第18章の`GaiaAssetAccessPolicy`が未設定の場合、cross-forum claimはfail-closedで拒否する（第18.23節）。この未設定は、既存の通常層（通常証明書、`Q`、`depth`、`AssetScore`、`A_seed`、`Candidates`、`Reach`、通常アセットアクセス、Civic Vote）を無効化しない。単一forum内で完結し`rho`を入力にしない計算は、`GaiaAssetAccessPolicy`の未設定の影響を受けない。
14. 公開経路の`publication_score_cap_bps`及び`max_publication_assets_counted`は本版で廃止する。既存のgenesis、`AssetPublicationIncentivePolicy`その他のpolicy objectがこれらを宣言していても、省略時既定値として解釈し、参照を差し替えず、genesisを再ハッシュせず、`forum_id`を変更しない（C6）。宣言値は公開報酬の計算および係数和の上限の検査に用いない。既存objectを無効化せず、公開資格・可用性evidence・自己取引除外の既存規則を変更しない。これら2つの宣言に対する旧reject code（`PublicationScoreCapBelowBase`、`PublicationScoreExceedsCap`、`PublicationTopKBoundViolation`）は本版で発生しない。
15. 旧形式の公開経路cap `MAX_PUBLICATION_BONUS_BPS_PER_SOUL_FORUM_EPOCH`（300 bps）、`MAX_PUBLICATION_BONUS_BPS_PER_ASSET_EPOCH`（45 bps）及び`MAX_PUBLICATION_SCORE_PATH_BPS_PER_SOUL_FORUM_EPOCH`（520 bps）は本版で廃止する（第7.21.6節）。既存のgenesis、`AssetPublicationIncentivePolicy`その他のpolicy objectがこれら又は同名の固定値を宣言していても、省略時既定値として解釈し、参照を差し替えず、genesisを再ハッシュせず、`forum_id`を変更しない（C6）。旧固定値は公開報酬の計算、係数和の上限（C4）の検査及び検証器へ埋め込んではならない。旧固定値に対するreject code（`PublicationBonusCapExceeded`、`PublicationAssetCapExceeded`、`PublicationAssetsCountCapExceeded`、`PublicationPathCapExceeded`）は公開経路で超過を報告する対象を失うため、既存objectを無効化せず、公開経路では新規に発行しない（第22.2節）。
16. 乗法形の`InfrastructureAdjustedAssetScore`は本版で廃止する。RCSが`AssetScore`へ接続する経路は第7.19.4節の加算項`InfrastructureAdjustment`だけであり、`AssetScore`は第7.6節の5項の和を`A_max(F,t)`で上限した値である（第24.13節）。既存のobject、checkpoint又はpolicyが`InfrastructureAdjustedAssetScore`を宣言又は参照していても、乗法形の値を再計算せず、加算形`InfrastructureAdjustment`として解釈し、参照を差し替えず、genesisを再ハッシュせず、`forum_id`を変更しない（C6）。廃止は既存のstorage receipt、audit result、reservationその他のResource Contribution objectを無効化しない。
17. `civic_vote_registry_root`は本版で廃止する。Civic Voteの状態は第23.3節・第23.16節の分散Civic状態機械がコミットする`civic_epoch_registry_root`、`civic_ballot_registry_root`、`civic_ballot_nullifier_registry_root`、`civic_need_bundle_root`、`civic_finality_registry_root`及び`civic_validator_set_registry_root`が担う。既存のcheckpointが`civic_vote_registry_root`をコミットしていても、それを省略時既定値として解釈し、再ハッシュせず、`forum_id`を変更しない（C6）。廃止は既存のcheckpoint、`StateProofEnvelope`又はCivic objectを無効化せず、旧rootをCivic Voteの権限、票重み、`CivicNeedScore`、need順位又は`CivicNeedAsset`のstatusの根拠にしない（規則12と同じ扱い）。
18. 旧名称`PublicationBonus`は本版で廃止し、その役割は第7.21.1節の`PublicationBaseScore`及び第7.21.2節の`PublicationScore`が担う（第7.21節）。既存のobject、checkpoint又はpolicyが`PublicationBonus`という名称の項又はフィールドを宣言していても、それを`PublicationBaseScore`として解釈し、参照を差し替えず、genesisを再ハッシュせず、`forum_id`を変更しない（C6）。名称の廃止は既存objectを無効化せず、`AssetScore`の5項の構成を変更しない。
19. `κ`の範囲は本版で`0 <= κ <= 1`に固定する（第2.4節）。既存のgenesis又は`AssetPublicationIncentivePolicy`その他のpolicy objectが`κ > 1`を宣言している場合、当該forumの`κ`は`1`として解釈する。参照を差し替えず、genesisを再ハッシュせず、`forum_id`を変更しない（C6）。宣言値を理由に既存object、checkpoint、citation又は`AssetAccess_total`を無効化せず、過去の評価を遡及的に変更しない。`κ > 1`の宣言は本版で新規に受理しない。
20. `A_max`比例係数和の上限（C4、第7.6節）は本版で`AssetScore_{base}`の係数上限`10000*(1-exp(-kappa_1))`を算入する。既存のgenesisが本版のC4を満たさない`kappa_1`その他の係数を宣言している場合、当該forumの`AssetScore`は本版のC4を満たすようには再解釈できない。したがって次による。(a) 当該forumの既存object、checkpoint、lease、grant、決済、Civic状態を無効化せず、過去の評価を遡及的に変更しない。(b) 新規の`AssetScore`依存の主張（`Candidates`、`Reach`、閾値判定、公開報酬、Civic候補）については、当該forumが本版のC4を満たす`AssetScore`を提示できない限りfail-closedで拒否する。(c) forum rootは、本版のC4を満たすgenesisパラメータへ移行するための新しいforumを創設できる。既存forumのgenesisを書換えたり再ハッシュしたりしてはならない（C6）。



`community`証明書からの`target_depth`削除は、signed canonical objectの形式を変える**破壊的変更**である。旧形式の`community`/`root_entry`に含まれる`target_depth`（および`requested_depth`、`approved_depth`等）は、本仕様のcanonical objectとして受理してはならない。旧形式の証明書は、必要なら監査・履歴表示にだけ用い、新forumのparticipation、Q、depthへ再利用してはならない。新forumのQ・depthは、新genesis以後の証明書とcheckpointだけで計算する（第3.1節、第4.5節、第22.2節）。

---

## Heat Stabilizer security, test, and release requirements

### Security invariants

1. A Heat Stabilizer object is never a consensus-validity predicate for an unrelated protocol object.
2. A recommendation penalty is finite, bounded, reversible, and auditable.
3. A user retains direct/manual access to any otherwise valid forum and action path.
4. No configuration can expand the non-interference boundary or the hard caps set by `HeatStabilizerPolicy`.
5. A malformed, missing, stale, or unverifiable observation/configuration must not create a new punitive state. The default effective behavior is observe-only.
6. No private individual-level behavioral or recipient information is emitted in observation or decision objects.
7. A valid rollback or kill switch has priority over an ordinary soft-intervention configuration.
8. Existing payments, access grants, rights, authority, and finalized actions are immutable with respect to Heat Stabilizer.

### Required deterministic tests

The implementation MUST provide reproducible tests for at least the following cases:

| Test ID | Scenario | Required result |
|---|---|---|
| HS-T1 | Large forum with sustained healthy sales/access/NeedGap closure and high growth | Must not enter `hot` solely due to size or growth |
| HS-T2 | High post-action growth + auditable capacity rejection + weak realized value | May enter `hot` only after configured consecutive epochs |
| HS-T3 | High growth with invalid-proof rejections or issuer discretionary refusals | Must not treat those outcomes as pressure |
| HS-T4 | Missing aggregate source or below-minimum aggregation cohort | Must set unavailable flag; must not fabricate a hot condition |
| HS-T5 | `observe_only` / `shadow` modes | Must produce audit/counterfactual records but no operative ranking/exposure change |
| HS-T6 | `soft_intervention` with cap | Penalty, exposure reduction, and diversion must never exceed policy/configuration caps |
| HS-T7 | Global kill switch | Must disable intervention for every forum at the next verified evaluation |
| HS-T8 | Forum kill switch | Must disable intervention only for the named forum without altering unrelated forum state |
| HS-T9 | Rollback | Must restore prior configuration or observe-only behavior without rewriting history |
| HS-T10 | Existing valid membership, payment, access grant, certificate, promotion, or authority action | Must remain valid and unchanged by heat state |
| HS-T11 | State hysteresis near thresholds | Must not oscillate faster than allowed by enter/exit epoch rules |
| HS-T12 | Same inputs, same policy/configuration, same prior transition | Must produce the same next state and decision |

### Initial deployment requirements

The first production configuration MUST satisfy all of the following:

```yaml
mode: observe_only
enabled: false
global_kill_switch: true
rollout_cohort_kind: none
max_recommendation_penalty: 0
max_exposure_reduction: 0
max_diversion_share: 0
```

A later configuration may enable `observe_only` with `global_kill_switch: false` to collect signed, checkpoint-anchored observations. `shadow` may be enabled only after observation completeness and determinism tests pass. `soft_intervention` may be enabled only after a documented calibration release decision, an explicit finite rollout cohort, and a verified rollback path.

### Calibration release record

Before any `soft_intervention` configuration, create and retain a release evidence object or externally signed release record containing:

- policy ID and configuration ID;
- evaluated checkpoint range and simulation / replay input commitments;
- metric definitions and aggregation rules;
- speculative-concentration detection result;
- healthy-growth false-positive result;
- recommendation churn and state-transition frequency;
- impact estimates for active forum diversity, finalized sales, valid access grants, CivicNeedAsset supply, and pressure/rejection recovery;
- selected hard caps and rollout cohort;
- rollback owner, tested rollback configuration reference, and test timestamp.

Absence of this record does not invalidate existing Gaia protocol state. It does make `soft_intervention` ineligible for production release under this specification.

### Final adoption note

> Heat Stabilizer addition in this specification: Gaia adds a checkpoint-anchored, CPU-only, advisory mechanism for observing potentially self-reinforcing concentration in newly proposed forum-entry and marketing actions. The mechanism is configurable but bounded: it observes realized post-action growth, auditable finite-resource pressure, and realized value per net inflow; it may only adjust future recommendation ranking/exposure within hard caps and rollout controls. It cannot revoke or alter existing membership, certificates, access, payments, payouts, authority, or independently valid protocol actions. Initial deployment is observe-only; soft intervention requires explicit calibration evidence, an auditable cohort, and immediate rollback/kill-switch capability.

---

## Unified Procedure, gaia-core Boundary, Interface Equivalence, and TimeHandshake Requirements

本節は、全プロトコル手続きの網羅的シーケンス定義、gaia-core への唯一の状態遷移実装の集約、REST API・WebSocket API・CLI の完全同値性、および全リモート通信に対する TimeHandshake 先行要件を、本仕様の横断規範として定める。本節は他改訂（Asset Publication Mechanics、Heat Stabilizer 等）で新設されるあらゆるオブジェクト・操作にも適用される。

### 1. 非交渉の基本原則

**一つの操作意味論**: Gaiaプロトコルにおける状態変更、署名対象オブジェクトの受理、外部サービス連携開始、外部結果の受理、最終化、取消、失効、回復、又は永続的イベント発行を伴うすべての手続きは、canonicalな Core Operation として定義されなければならない。REST API、WebSocket API、CLI、SDK、UI、daemon automation、webhook handler及び管理ツールは、同一 Core Operation の異なる入出力インターフェースに過ぎない。インターフェース実装は独自の状態遷移、独自の受理規則、独自の署名検証、独自のfinality判定、独自の権限緩和、独自の課金・配分計算、独自の副作用実行を実装してはならない。gaia-networkの輸送制御（DHT publish/find、tag設定、relay grantの追加・削除、descriptor応答、bootstrap/relay roleの運用）はCore Operationの入出力インターフェースではなく、Gaia経済・consensus operationと混同しない（第28章、第29.7節）。

**adapterは意味論を持たない**: REST、WebSocket、CLIその他のadapterは、認証済みtransport inputをcanonicalな `CoreOperationRequest` へ変換し、gaia-coreのoperation dispatcherを呼び、canonicalな `CoreOperationReceipt`、`OperationEvent`、又は `ProtocolReject` を返すことだけを担う。

**すべての遠隔通信はTimeHandshakeから始まる**: Gaiaのremote application sessionでは、通常Gaia protocol message及びauthority-relevant要求の前にTimeHandshakeとSessionBindingを成立させる。node間は第28章のgaia-network上のRESTを使う。local/managed WebSocket frontend、remote CLI、provider API及びcallbackは各interfaceの規則を遵守する。DHT KRPC、Pkarr publication、signed-peer announcement/query、QUIC/TLS、NAT traversal、relay registration、relay admission及び公開transport descriptorは輸送制御であり、TimeHandshakeを必要とするGaia application sessionと区別する。Gaia署名済み権限要求をこれらの制御経路へ載せて検証を迂回してはならない。

外部Stripe、eKYC provider、Payment-Service adapterのHTTPS/API/webhookは、node間のgaia-networkとは別の外部連携境界として維持する。その`transport_kind`は`external_provider_https`又は`external_callback`であり、node間の`gaia_network_http1`と混同しない。相互TimeHandshakeが技術的に不能な一方向push callbackには、既存の`VerifiedExternalCallbackEnvelope`規則を維持する。

**transport identityはGaia権限ではない**: transport DeviceId、peer endpoint、relay URL、DNS name、TLS certificate、transport connection、公開descriptor、tag又はnetwork reachabilityは、Soul identity、DeviceIncarnation、authority key、forum authority、trust epoch、payment authority、finality、又は操作権限をそれ自体で証明しない。これらはrouting hint又はtransport bindingに過ぎず、署名済みTimeHandshake、SoulEpochLease、TemporalHealthLease、DeviceIncarnation、AuthorityOperationHeader、必要なStateProofEnvelope及び操作固有のproofによって別途検証されなければならない。ML-DSA-65署名、Soul、incarnation、lease及びsessionは、transport鍵・接続状態とは別の検証であり、一方の成功をもう一方の根拠にしてはならない。

TimeHandshake成立以前に許される公開protocol information（最小限のprotocol version negotiation、TimeHandshake自体、許可済みのclock recovery message、及び秘密・権限・個人データを含まない公開情報）は、既存の最小scopeを維持する。

### 2. 用語とデータモデル

`CoreOperation` は、gaia-coreが受理・検証・状態遷移・外部副作用開始・イベント発行・最終化追跡を一元的に扱うprotocol-level operation kindである。Core OperationはREST path・WebSocket method・CLI command名から独立したcanonical identifierを持つ。同じCoreOperationRequestは、同一の前提状態・同一のidempotency key・同一のcanonical payloadに対して、どのadapterから呼ばれても同一の受理・拒否・状態遷移結果を生まなければならない。

```text
CoreOperationRequest
  operation_id Hash
  operation_kind CoreOperationKind
  protocol_version u16
  request_version u16
  requester_soul_id SoulId | null
  requester_incarnation_id IncarnationId | null
  requester_authority_pubkey MLDSA65PublicKey | null
  authority_operation_header_ref Hash | null
  session_binding_ref Hash | null
  idempotency_key Hash
  submitted_at Tick
  target_forum_id ForumId | null
  pre_state_checkpoint_ref Hash | null
  payload_kind ObjectKind
  payload_ref Hash | null
  inline_payload Bytes | null
  required_object_refs canonical sorted list<Hash>
  required_proof_refs canonical sorted list<Hash>
  external_session_refs canonical sorted list<Hash>
  requested_completion_mode synchronous | asynchronous | watch_only
  expire Tick | null
  signature MLDSA65Signature | null
```

```text
CoreOperationReceipt
  operation_id Hash
  operation_kind CoreOperationKind
  request_commitment Hash
  status OperationStatus
  accepted_at Tick | null
  updated_at Tick
  finalized_at Tick | null
  pre_state_checkpoint_ref Hash | null
  resulting_object_refs canonical sorted list<Hash>
  resulting_event_refs canonical sorted list<Hash>
  resulting_checkpoint_ref Hash | null
  external_action_refs canonical sorted list<Hash>
  rejection_code RejectCode | null
  rejection_detail_commitment Hash | null
  retry_after Tick | null
  next_required_action NextRequiredAction | null
  idempotency_key Hash
  logical_intent_commitment Hash
  core_version String
  signature MLDSA65Signature
```

`request_commitment`は署名対象request全体のcommitmentとして保存し、再試行の各attemptで異なり得る。`logical_intent_commitment`は、session再確立でtransport証拠が変化しても同一のlogical operationを同一業務要求として扱うためのcommitmentであり、`request_commitment`とは別名で扱う。両者を同一視せず、idempotency判定は既存のidempotency scope、`operation_id`及び`logical_intent_commitment`に対して行う。`logical_intent_commitment`は新規receiptの署名対象fieldであり、`LogicalOperationIntent`のcanonical projectionと`logical_intent_commitment`の定義は第29.8節に定める。保存済みreceiptのbytesを変更せず、旧receiptの検証をこのfieldの欠如だけでretroactiveに無効化しない。保存objectの現session受理には、現在の認可を別途要求する。

`OperationStatus` は少なくとも次を持つ: `draft`、`submitted`、`accepted`、`pending_proof`、`pending_external`、`pending_finality`、`finalized`、`rejected`、`cancelled`、`expired`、`failed`、`disputed`、`reversed`、`recovery_pending`、`recovered`。状態遷移はCore Operationごとの許可表に従い、adapterは任意の状態遷移を作ってはならない。

`OperationEvent` は `event_id`、`operation_id`、`event_sequence`、`previous_operation_event_hash`、`event_kind`、`status_before`、`status_after`、`occurred_at`、evidence/result refs、external correlation ref、signatureを持つ。`event_sequence` と `previous_operation_event_hash` により同一operationのイベント列を一意かつ順序付きにする。WebSocket stream、REST polling、CLI watchはこの同一OperationEvent列を異なる提示形式で露出するだけである。

`SessionBinding` はTimeHandshakeとその後のメッセージを束縛する: `session_id`、`protocol_version`、initiator/responderのSoul・incarnation・authority pubkey、端点の`GaiaTransportEndpoint`及びそのendpoint commitments、双方のtransport binding ID（`initiator_transport_binding_id` / `responder_transport_binding_id`）、`time_handshake_ref`、`verified_time_interval_ref`、双方のSoulEpochLease / TemporalHealthLease ref、`initiator_trust_epoch` / `responder_trust_epoch`、`established_at`、`expire`、`session_nonce`、signature/attestation refs。

`SessionBinding`は次の三つの軸を分離して持つ。一つの列挙にinterface種別、physical transport、service種別を混在させてはならない。

- `interface_kind`: `rest | websocket | cli | sdk | daemon | callback`。どの入出力インターフェースから開始されたかを表す。
- `transport_kind`: 当該interfaceの物理輸送を表す。node間の標準値は`gaia_network_http1`であり、Gaia node間のremote application session及びCLI remoteはこの値を使う。ほかのinterfaceは`local_rest`、`local_websocket`、`managed_https`、`managed_wss`、`local_ipc`、`external_provider_https`、`external_callback`を使う。direct又はrelayという経路種別は`transport_kind`の値にしない。同一Iroh connection内のdirect/relay/NAT path変更は`transport_kind`を変えず、`SessionBinding`を作り直す理由にもならない。
- `service_scope`: `gaia | storage | bank | payment | ekyc | time_recovery`。通常operationのscope検証は元規範を保持する。

CoreOperationRequestのoperation意味論、signed payload及びcanonical encodingをこの分離のために変更しない。異なるinterfaceで実行された同一operationの比較は、検証済みの同等なexecution contextの下でcoreの意味論的出力（`operation_id`、受理・拒否、reject code、生成object hash、状態遷移列、`OperationEvent`列、external action intent、finality状態）を比較する。物理的なsession識別子、接続handle、binding ID又はadapter固有のaudit字段の同一bytesを要求しない。

`VerifiedExternalCallbackEnvelope` は、相互TimeHandshakeが技術的に不能な一方向push callback（Stripe webhook等）を安全受理するためのobjectであり、事前に確立されたprovider session、署名済み時刻証明、provider key binding、nonce、replay window、external event id、delivery timestamp、既存ProviderAuthorizationを束縛する。これはTimeHandshakeの代替ではなく、TimeHandshakeと同等以上に明示的な時刻・主体・replay・transport binding要件である。

### 3. Remote Session Establishment Procedure

遠隔通信を開始する主体をInitiator、応答主体をResponderとする。REST、WebSocket、CLI remote mode、provider callback、webhook、storage、bank、payment、eKYC等のGaia application sessionのすべてに適用される。node間の標準経路は第28章のgaia-network上のRESTである。DHT KRPC、Pkarr publication、signed-peer announcement/query、relay registration、relay admission及び公開transport descriptorは輸送制御であり、本手続の対象ではない。CLI remoteは本手続に従い、local CLIが別processのdaemonを呼ぶ場合も同じ要件を持つ。

1. Initiatorは、期待するSoul/Bodyに対応するDeviceIdを到達ヒントから選び、`find_device`で正確なDeviceIdへ認証接続し、取得した`DeviceHandle`をsessionに固定する。別DeviceIdへのfallbackを禁止する。transport保護はSoul authorityの代替ではない。
2. 両者はprotocol versionとTimeHandshake suiteをネゴシエートする。非互換ならreject/close。
3. Initiatorは、session id、nonce、challenge、Soul、DeviceIncarnation、authority key、lease参照、自身の`GaiaTransportEndpoint`とendpoint commitment、自身のtransport binding ID、及び必要なbounded proof bundleを含むTimeHandshake beginを、固定した`DeviceHandle`から送る（第29.3節）。
4. Responderは、transport-private contextのpeer DeviceIdを署名済みinitiator endpointと照合する。あわせてformat、version、challenge freshness、replay protection、InitiatorのDeviceIncarnation・SoulEpochLease・TemporalHealthLease・trust epoch・scopeを検証し、t2/t3、request hash、両endpoint、両binding ID、challenge binding、Responder情報、lease参照、自身のendpoint commitmentを含む署名済みresponseを返す。自身のendpoint及びbinding IDは、自身のconfigured DeviceId及び受信したtransport contextに一致させる。
5. Initiatorはt4を記録し、responseを検証する。`Response.extensions`の`AuthenticatedTransportContext`が最初のhandleと一致することを確認し、ResponderのDeviceId、期待Soul/Body、両endpoint、nonce、署名、lease、trust epoch及びRTT、offset interval、uncertainty、TemporalHealthPolicy上限を検証し、既存仕様に従い`VerifiedTimeInterval`と`GaiaOffsetInterval`を導出する。第14章の時刻各式を変更しない。
6. 両者は、TimeHandshake transcript、VerifiedTimeInterval、lease、authority key、双方の`GaiaTransportEndpoint`及びendpoint commitments、双方のtransport binding ID、`interface_kind`・`transport_kind`・`service_scope`、session nonceを束縛した`SessionBinding`を生成・検証する。transcript及びbindingの署名対象と交換順序は第29.2節〜第29.3節に定める。
7. Responderは有効なSessionBinding成立まで、CoreOperationRequest・object mutation・authority-relevant object・外部結果assertion・状態変更要求を受理してはならない。Initiatorも有効なSessionBinding成立まで通常のGaia protocol requestを送信してはならない。
8. session中の各authority-relevant requestは`session_binding_ref`と既存のCommunicationHealthAttachment（又は同等）を含む。attachmentのscope及びepochは当該`SessionBinding`と一致させ、header又はtransport contextの存在だけで省略しない。
9. SessionBinding expiry、lease expiry、trust epoch不一致、authority fork、transfer lock、endpoint-binding不一致、transport binding不一致、許容offset超過、再検証失敗時は、以後のmutationをfail-closedで拒否する。
10. connection交換、Endpoint再構築、transport endpoint DeviceId変更、process restart、session expiry、Body/authority/trust epoch変更、時間不確実性上限超過、policyが要求するrevalidationの後は、新しいTimeHandshakeを必須とする。relay/direct切替、relay failover、NAT path移動だけでIroh connectionが維持される場合は新sessionにしない。HTTP exchangeごとのstream及びloopback TCP交換はconnection交換ではない。

新規sessionで必要なDeviceIncarnation、leaseその他のproofは、TimeHandshakeのbounded proof bundleに同梱できる。この初期proof交換はhandshake専用であり、汎用object fetch又はprivate material fetchの許可ではない。bundleが不足する場合はfail-closedとするか、既存のclock recovery手続へ進む。未成立sessionの通常GETによって不足proofを無制限に取得してはならない。proof bundleの上限を超える要求は`TimeHandshakeProofLimitExceeded`として拒否する。

TimeHandshakeの段階はbody内の明示enum（begin / response / complete / confirm_binding）で区別し、queryやHostで接続先を指定しない。確定`SessionBinding`の署名交換、ackの時点、candidateの失効およびreplay処理は第29.3節に定める。

例外は最小限にし、以下だけが通常のSessionBinding成立前に許される: transport-level connect/close/TLS等、protocol version negotiation、TimeHandshake request/response/confirmation/error、clock recovery・time attestation request・revalidation request（既存TemporalHealth規則の範囲内）、及びSoul authority・個人データ・mutation・secret・proof・rate-limited resource・商取引状態を露出しない公開protocol information。TimeHandshake前に状態変更を伴うCoreOperationRequest、署名済みobject submission/mutation、authority・transfer・root succession、community certificate・membership・Civic、asset/grant/商取引/支払い、storage/audit/repair、Bank/eKYC/Payment-Service権限要求、webhook状態変更assertion、private object/KeyEnvelope/個人属性要求は受理してはならない（`PreHandshakeProtocolMessageForbidden` 等）。

**ローカル実行**: CLIがremote/localhost daemon・Unix socket・named pipe daemon・別processのgaia-core serviceを呼ぶ場合は通信でありTimeHandshake必須。CLI/SDK/テストが同一process内でgaia-core libraryを直接呼ぶ場合はremote sessionではなくnetwork TimeHandshakeは不要。ただしin-processでもgaia-coreはVerifiedTimeInterval、lease、AuthorityOperationHeader、checkpoint、署名、proofを省略してはならない。offline object constructionは許されるが、remote submission・state mutation受理・authority-relevant objectの相手側受理前にRemote Session Establishment Procedureを完了しなければならない。

### 4. gaia-core唯一実装境界

gaia-coreに全mutationを受ける唯一の概念的入口を定義する。

```text
ExecuteCoreOperation(request: CoreOperationRequest, context: CoreExecutionContext)
  -> CoreOperationReceipt | ProtocolReject
```

`CoreExecutionContext` は `verified_time_interval_ref`、`session_binding_ref`、`communication_health_attachment_ref`、`requester_identity_context`、`pre_state_context`、`object_resolver_context`、`external_adapter_context`、`execution_mode`（local/remote/callback/replay）に加え、`authenticated_transport_context`（当該connectionのlocal/peer DeviceId及びlocal transport binding ID）を、解決済み又は検証可能な形で含む。adapterはこのcontextの正当性を最終判断してはならず、gaia-coreが`SessionBinding`及びTimeHandshake transcriptと再照合して検証する。adapterが`SessionBinding`又は`AuthenticatedTransportContext`をキャッシュしただけで、coreの再検証を省略してはならない。

状態変更を伴うCoreOperationは、操作固有の追加手順に先立ち、少なくとも次の順序で実行する: (1) canonical encoding・version・kind・payload kind検証、(2) operation_id/request commitment/idempotency key整合と重複検証、(3) remoteの場合はSessionBindingとTimeHandshake有効性検証。この検証には、`authenticated_transport_context`のlocal/peer DeviceId及びlocal binding IDを、署名済みTimeHandshake transcript及び`SessionBinding`と照合することを含める、(4) authority要時はSoul identity・DeviceIncarnation・lease・trust epoch・transfer freeze・AuthorityOperationHeader・operation sequence検証、(5) scope・ownership・rights・policy・proof検証、(6) pre-state checkpoint/StateProofEnvelope鮮度・finality・Merkle proof検証、(7) resource/rate limit/idempotency/anti-replay/重複/競合検証、(8) acceptance predicate評価、(9) 唯一の状態遷移実行と結果object/event/外部action intent生成、(10) 外部依存がなければfinalized又はpending_finality、(11) 外部依存があればpending_external等へ遷移し外部相関ID記録、(12) CoreOperationReceipt生成・event log append、(13) adapterへcanonical receipt返却。

**adapter禁止事項**: REST handlerがgaia-coreを通さずDB/object store/checkpoint/payment state/grant stateを直接更新すること、WebSocket handlerが独自in-memory stateを正規状態とすること、CLIがgaia-core validatorを再実装し異なる結果を出すこと、UI/SDKがCore Operationを迂回して署名済みobjectを正規状態へ挿入すること、webhook handlerが外部payloadだけを根拠にPaymentSettlement等を直接finalizeすること、gaia-network transport endpoint又はHTTP adapterが到達性、認証済みDeviceId又はtransport-private headerだけでauthorityを認めること、adapterがCoreOperationReceipt/ProtocolRejectを独自意味論へ変換することは、すべてMUST NOTである。外部callback/webhookは新たな独立状態変更経路ではなく、対応する既存operationを再開・遷移させるCoreOperationとして処理する。

輸送上限、HTTP syntax、hop-by-hop fieldの除去、reserved headerの書換え、body cap及びdeadlineはgaia-network adapterの責務である。Gaia objectの受理、state mutation、finality及び商用認可はgaia-coreの責務であり、adapterはこれらを代行しない。adapterがtransport contextを構成して渡すことは、そのcontextに基づく認可判断を行うことを意味しない。

### 5. REST / WebSocket / CLI 完全同値性

同一のCoreOperationRequest・同一pre-state・同一policy・同一authority証拠・同一SessionBinding・同一idempotency key・同一外部入力に対し、REST・WebSocket・CLIのいずれから開始しても、gaia-coreは `operation_id`、request commitment、受理/拒否、reject code、生成object hash、状態遷移列、OperationEvent列、external action intent、外部相関ID、finality状態、rollback/reversal/recovery/dispute結果を同一にする。adapter差はHTTP status・WebSocket frame・CLI表示・exit code・polling/streaming形式に限る。

REST APIは少なくとも `POST /v1/sessions/time-handshake`、`POST /v1/operations/{operation-kind}`、`GET /v1/operations/{operation-id}`、`GET /v1/operations/{operation-id}/events`、`POST /v1/operations/{operation-id}/cancel`、`GET /v1/objects/{object-hash}`、`POST /v1/proofs/verify`、`GET /v1/capabilities` を持つ。remote REST sessionではTimeHandshake成功後にのみ権限・状態変更operation endpointを使える。HTTP statusはtransport応答に用いてよいが、規範となるprotocol resultは必ずCoreOperationReceipt又はProtocolRejectで表現する。

WebSocket APIは `session.time_handshake.begin` / `session.time_handshake.complete` / `operation.submit` / `operation.get` / `operation.subscribe` / `operation.unsubscribe` / `operation.cancel` / `object.get` / `proof.verify` / `capabilities.get` を持つ。WebSocket接続の最初のGaia protocol methodはversion negotiation又は `session.time_handshake.begin` でなければならない。有効なSessionBinding前の `operation.submit` は `PreHandshakeProtocolMessageForbidden` として拒否する。WebSocket再接続は新規sessionとして扱い新TimeHandshakeを要求する。

CLIは全Core Operationを完結可能にし、少なくとも `gaia session time-handshake`、`gaia operation submit <kind>`、`gaia operation get|watch|cancel <operation-id>`、`gaia object get`、`gaia proof verify`、`gaia capabilities get` を持つ。alias（`gaia asset create` 等）は独自のプロトコル手続きを持たず、同一のCoreOperationRequestを生成する薄いfrontendである。`--remote` 等でdaemonを呼ぶCLIはTimeHandshake必須。CLI exit codeはprotocol reject codeの代替ではなく、machine-readable出力にCoreOperationReceipt/ProtocolReject全体を出せること。

**node間の利用領域**: Gaia node間通信及びCLI remoteの標準経路は、第28章のgaia-network上のRESTである。REST pathは上記のCore Operation mappingを使い、Host又はURLのauthorityでpeerを選ばず、宛先は`DeviceId`で選ぶ（第29.5節）。node間でWebSocket Upgrade、CONNECT、任意TCPを要求された場合、gaia-networkは`501`又は`405`を返し、WebSocket機能をgaia-networkへ追加しない。`operation.subscribe` / `operation.unsubscribe`及びCLI watchのnode間相当機能は、`GET /v1/operations/{operation-id}/events`の有限pollingへ写像する。events queryは`after_sequence`と`limit`（1..256、既定64）を用い、応答はcanonical `OperationEvent`の昇順batchに`next_sequence`と`has_more`を添える。無期限long-poll、SSE又はstreamをnode間で必須にしない。gap後は同一event sequenceから再開し、重複を`event_id`で除去する。

WebSocket APIは、local daemon又は明示的に管理されたHTTPS/WSS frontendのinterfaceとして保存する。WebSocket接続は独自のversion negotiation、TimeHandshake、SessionBinding、再接続及び認可規範を持ち、同一gaia-core dispatcherを使う。このfrontendのTLS又はWebSocket接続の成立自体はGaia authorityを認めない。managed frontendのWSSはgaia-networkの機能でもnode間fallbackでもない。

CLI remote（`--remote`等）はREST requestのfrontendであり、上記REST経路と同じTimeHandshake・SessionBinding要件に従う。local CLIが別processのdaemon・Unix socket・named pipe daemonを呼ぶ場合のTimeHandshake先行要件は保存する。gaia-networkからlocal RESTへの内部TCP hopは、既に認証されたpeer requestの転送hopである。このhopでpeerとのTimeHandshakeを再帰的に開始してはならず、hopごとに別peer sessionとして扱わない。この委譲境界はlistener isolationとtransport-private headerが担う（第28.24節、第29.5節）。

**完全性要件**: RESTのみ、WebSocketのみ、又はCLIのみでしか完了できない状態変更手続きを作ってはならない。外部callbackのみが開始者となり得る場合でも、三経路からcallback processing operationの状態・証拠・結果・reject・recoveryを照会・検証・再試行・取消できること。

### 6. Procedure Registry・Conformance Matrix

本仕様は、全Core Operationを正規に列挙する `Procedure Registry` を定義する。各行はCoreOperationKind、purpose、mutates_protocol_state、required_authority、requires_remote_time_handshake、requires_session_binding、required_pre_state_checkpoint、required_proof_classes、idempotency_scope、initial_status、allowed_status_transitions、external_dependency_class、result_object_classes、finality_predicate、cancellation_rule、reversal_or_recovery_rule、REST mapping、WebSocket mapping、CLI mapping、reject_code_familiesを持つ。本文の状態変更・外部作用操作は例外なくRegistryの一行に対応する。

必須分類は少なくとも: Soul・Body・時間（初期化/incarnation/lease/health/TimeHandshake/authority chain）、Forum・checkpoint（genesis/root entry/membership/community/checkpoint/SeedAllocation/Forum Root Transfer）、Asset・Content・Discovery・PressRoom、Commerce・Payment・Payout・ALR・Pool、Storage・Bank・Compute・RCS、eKYC・移転、Civic・Marketing・助言、本仕様以降の拡張。LocalActionRecommendationは原則read-only/advisoryとして区別し、状態変更を起こす場合は対応するCoreOperationへ委譲する。将来追加される操作はCoreOperation、TimeHandshake、三I/F mapping、test matrixを必須とする。

既存の全operation行を保存する。TimeHandshake begin/complete/confirm_binding、sessionの再検証、operation poll/watch/cancelの各行には、第29章のtransport前提（認証済みDeviceIdへの接続、`TransportBindingId`、署名済みtranscript、`SessionBinding`、有限REST polling）を追記する。node間の宛先は`DeviceId`であり、IP又はportで選ばない。

relay grantの追加・削除、DHT publish/find、descriptor応答、tag設定、bootstrap/relay roleの運用はgaia-networkのgeneric network管理であり、Gaia経済・consensus operationと混同しない。これらをProcedure RegistryのGaia mutation行として登録せず、Gaia権限・支払い・finalityを要求しない。Gaiaのoperator資格又は支払いを伴う交渉（relay admissionの商用条件、storage契約、provider credential等）は、対応する既存Core Operationへ委譲する。`RelayGrant`のopaque bearer tokenはGaia authorityの代替ではなく、第28.28.4節の外部admission bridgeは通常のGaia operation sessionではない。

`Procedure Conformance Matrix` は少なくとも次の列を持つ: Core Operation | Mutation | Remote TimeHandshake | SessionBinding | REST | WebSocket | CLI | Initial state | External dependency | Finality/terminal states | Idempotency scope。例: CreateAssetRecord（mutation Yes, remote TH/SB required, REST/WS/CLI Yes, initial submitted, terminal finalized/rejected/expired, idempotency requester+asset creation nonce+payload）、CreateServiceOrder（external dependency Payment-Service, terminal pending_external/finalized/failed/cancelled/expired）、ProcessPaymentCallback（external dependency Stripe, terminal finalized/reversed/disputed/recovery_pending, idempotency provider+external event id）、SoulTransferFinalize、ForumRootSuccession、StorageAuditResponse、SubmitComputeResult等。

### 7. エラー同値性・拒否コード・監査

RESTはHTTP status＋canonical ProtocolReject、WebSocketはerror frame＋canonical ProtocolReject、CLIはexit code＋machine-readable ProtocolRejectを返す。三者はreject code・retryability・state mutationの有無が同一でなければならない。HTTP status、gaia-networkの`NetworkError`（`ErrorCode`及び`DeliveryState`）及びGaiaの`ProtocolReject`は別の型であり、同一の成功条件又は同一enumとして記述しない。署名済みGaia拒否をtransport生成のerrorで代替せず、transport errorを署名済み拒否として捏造しない（第29.8節）。

TimeHandshake・SessionBinding・Core Operation・adapter同値性の拒否コードは第22.2節に追加済み（`UnknownCoreOperation`〜`ExternalCallbackSessionBindingMissing`）。監査ログ/OperationEventにはoperation id・kind・request commitment・idempotency key・実行adapter種別（意味論を変えない入力）・session/TimeHandshake/VerifiedTimeInterval参照・requester/peer Soul/Body/authority参照・pre-state/resulting checkpoint・状態遷移列・event sequence・外部相関ID・callback証拠・recovery/reversal参照・reject code・retryability・state mutation有無を再現可能に残す。秘密鍵・平文コンテンツ・完全なeKYC属性・決済手段詳細・非公開受信者リストはログに入れてはならない。

監査項目は次のように層を分ける。transport DeviceId、`TransportBindingId`、relay URL、tag、network address又は任意のerror文字列を、無制限cardinalityのmetric labelにしない。gaia-networkの通常tracingへSoul、private content、bearer token、eKYC属性を流さない。Gaiaのoperation監査に必要なsession、binding、peer参照は、アクセス制限されたaudit記録に残してよい。gaia-networkの観測は、dial/exchange結果、slot数、pending数、Busy・Unknown・cancelled件数、tag publish/find結果、suppression hits、clock-invalid件数、relay registration結果、contact cache結果のような固定cardinality項目に限る（第28.31節）。

### 8. gaia-networkのtransport binding安全要件

Gaia node間sessionは、期待するDeviceIdへの認証済みconnection、当該connectionの`TransportBindingId`、両endpointを束縛した署名済みTimeHandshake、有効な`SessionBinding`へ結び付く。address record、tag、descriptor又はrelayから得た情報だけでSoulを認可しない。private object又はKeyEnvelope取得権限は各上位proofで検証する。既存connection内のdirect/relay/NAT path変更ではbindingを維持する。connectionが閉じるか交換された場合、旧`DeviceHandle`及び旧`SessionBinding`を新connectionへ移植せず、新TimeHandshakeを行う。HTTP exchangeごとのstream及びloopback TCP更新はこのconnection交換と区別する。network partition、duplicate/out-of-order、replay、partial writeを前提とし、gaia-networkはsubmitted application requestを再実行しない。上位が再試行するときは同一logical operationとidempotency keyを保持する。接続断及びbody dropはaccepted済みoperationのcancel、rollback又は未実行を意味しない。詳細は第28章・第29章に定める。

### 9. テスト要件

Core Operation同値性テスト（全Procedure Registry行を同一canonical fixtureでREST/WS/CLI実行し、core resultがcanonical-equivalent）、TimeHandshake強制テスト（THなしREST/WS/remote CLI mutationのreject・状態変更なし、expired/replay/peer mismatch/endpoint/transport/reconnect拒否）、外部callbackテスト（重複配送idempotent、timestamp/nonce/署名/authorization/相関/session/replay違反reject、callbackがgaia-core迂回不能、三経路追跡）、シーケンス完全性テスト（spec lint: Registry必須・三I/F mapping・TH/SB要件・pending/callback/finality/reversal・新mutation object未登録でfail）、ネットワーク障害テスト、property/fuzzテスト（任意requestのadapter正規化同一性、SessionBinding/TimeHandshake任意フィールド改竄検出、event sequence循環/重複なし、idempotency衝突検出、THなしでmutation objectがstateに到達しない等）を第25章又は適合テスト章へ追加する。あわせて第25.2節の接合試験（I01〜I30）及び第28.33節のgaia-networkローカル正確性試験を追加する。これらは隔離fixtureで実施可能な正確性条件であり、実施していなければNOT_RUNとする。第28章の規模参考基準G2〜G4を必須にしない。

### 10. 後方互換と移行

本版以前に存在する有効object・checkpoint・lease・payment・payout・transfer・asset・grant・storage recordは、Interface Equivalence追加だけを理由に無効化してはならない。これらの保存bytesを、輸送の現行契約だけを理由に再hash・再署名・retroactiveに無効化しない。第27章の輸送に無関係な保存object互換規範は保持する。

新規に開始されるremote session及び新規remote mutationは、第29章の完全なTimeHandshakeとbindingを必須とする。完全なTimeHandshake又は`SessionBinding`を欠くpeerとの間で、互換fallbackによって認可を緩めてはならない。旧peerへの暫定的な接続を許す運用を行う場合でも、それは新規sessionの適合規則の緩和ではなく、範囲・期限・許可操作・read-only制限・危険操作禁止・監査方法を別途明記した上での移行運用であり、認可・finality・state mutationの意味論を変更しない。

既存のprotocol archive（過去の署名済みobject、checkpoint、receipt）と、本仕様が要求する新規session適合性は分離する。archiveは検証・監査・履歴表示に用い、新規sessionの認可根拠に流用しない。adapterから直接DB等を更新していた旧実装はgaia-core Core Operation Dispatcherへ移す。legacy alias/endpointは残してよいが、最終的に同じCoreOperationRequestへ正規化されること。

---

## 28. gaia-network：P2P輸送の詳細設計

本章は、Gaia node間の輸送を担う`gaia-network`パッケージの実効規範を所有する。本章内で「本章」又は「gaia-networkパッケージ」という場合、それはgaia-networkパッケージのscopeを示し、Gaia全体からSoul、証明書、forum、経済又は決済を除外する意味ではない。

`gaia-network`の目的は、名前を指定されたdeviceを発見し、認証済み暗号化P2P接続を確立し、そのdeviceの既存local REST routerへ有界なHTTP requestを配送することである。規範語はMUST、MUST NOT、SHOULD、MAYに対応する日本語表現（〜しなければならない、〜してはならない、〜すべきである、〜してよい）で表す。

本章のAPIは実装すべき契約である。上流統合の対象は、compatible な依存関係が実際にcompileされる証明ではない。未監査の上流method、field、setter又はretention規則を確認済みとして記述しない。

本章はCargo build、source audit、benchmark、deployment又は規模実験を実施していない。上流source audit及びローカル正確性試験は実装完了のゲートであり、実施していなければNOT_RUN又はAUDIT_PENDINGとする。第28.32節の式は容量計画モデルであり、第28.34節のG2〜G4は参考基準であって、実証又はSLOではない。

### 28.1 文書契約

本章はgaia-networkの全規範を、各規範が一度だけその所有節に現れる形で定める。規範強度を弱める要約も、履歴に基づく優先順位も持たない。

パッケージAPIは実装すべき契約である。未監査の上流method、field、setter又はretention規則を確認済みとして記述しない。source audit、Cargo build、benchmark、deployment及び規模実験は、本章の編集によって完了したことにならない。統合の証拠は第28.6.1節のledgerが担い、過去のsession citationは移植可能な証拠として扱わない。

### 28.2 輸送境界と暗号化

remote application HTTPは、必ず認証済みIroh QUICを用いる。平文のapplication transport modeを持たない。公開cleartext application proxyを持たない。relayが運ぶapplication bytesは、endpoint間でend-to-endに暗号化されたままである。

native Mainline互換DHTは、暗号化されないUDP KRPCを用いる。署名済みrecordはmetadataを認証するが、秘匿しない。Device鍵、discovery topic、時刻及びrouting情報は観測され得る。

既存のlocal REST serverは、そのdevice内部のloopbackで通常HTTPを受け取ってよい。

したがって次が成り立つ。

- 暗号化されたremote application traffic: 必須。
- 暗号化されたnative DHT control traffic: 提供しない。
- すべてのprotocol packetの暗号化: 選択したnative DHT backendと両立しない。

discoveryの秘匿性が必須要件になった場合は、このbackendの採用を停止する。暗号化されたdiscovery backendは別の設計決定として扱う。署名が秘匿性を満たすと黙って主張せず、未reviewの暗号化DHT wrapperを導入しない。

本章の輸送用暗号方式は、第13.1節のML-DSA-65限定とは別scopeである。transportの署名・鍵交換・接続認証はGaia objectの署名suiteを変更せず、Gaia objectのML-DSA-65署名はtransport接続の認証を代替しない。

### 28.3 scope

実装するもの:

- host applicationが供給する永続的なtransport公開鍵identity。
- signed Pkarr record及び独立DHT bootstrap設定によるexact DeviceId解決。
- Irohのdirect接続、NAT traversal、暗号化stream及びrelay fallback。
- draft signed-peer announcementによるexact-tag発見。
- Iroh上のHTTP/1.1 request/response binding。
- loopback REST転送及び認証済みpeer header注入。
- 公開DHT bootstrap/storage/routing server role。
- 公開Iroh relay/QAD role。
- infrastructure自己記述及びopaque relay-admission統合。
- 有界な並行性、deadline、cancellation、diagnostics及びcontact-hint永続化。

除外するもの（いずれもgaia-networkパッケージが実装しないという意味であり、Gaia全体からこれらを除外する意味ではない）:

- Gaiaのidentity、証明書、membership、投票、決済、残高、storage契約、経済、GUI及びapplication route意味論。これらはGaia本体の規範が所有する。
- offline mailbox、durable delivery、exactly-once application実行、replay及びapplication retry。これらはGaia上位サービスが所有する。
- 意味検索、wildcard検索、全列挙、ranking、global membership table、独自NAT traversal、独自暗号又は新DHT algorithm。
- 汎用の公開raw-stream API、任意TCP転送、IP層の仮想ネットワーク提供、HTTP/2、HTTP/3、WebSocket upgrade及びCONNECT tunnel。

到達性とは、要求されたonline deviceとの認証済みexchangeを試行し、応答又は分類済み失敗を返すことをいう。partition、peer停止、relay拒否、discovery失敗又はlocal application失敗の間の成功を約束しない。

### 28.4 アーキテクチャ

```text
呼出し側application
  -> Network::request(DeviceId, HTTP request)
  -> live connection cache / exact-ID dial
  -> 設定済みIroh address lookup
  -> 暗号化Iroh接続（direct又はrelayed）
  -> bidirectional QUIC streamあたり1回のHTTP/1.1 exchange
  -> 宛先transport receiver
  -> request検証 + 認証済みpeer header書換え
  -> 設定済み宛先loopback REST server
  -> 既存の宛先application router
```

discovery経路:

```text
既知DeviceId -> signed address lookup -> 認証済み接続
論理Tag      -> signed-peer DHT samples -> 候補DeviceId
候補         -> 任意の認証済みdescriptor検証
Relay Tag    -> operator descriptor -> caller認可 -> 明示的relay grant
```

Network instanceあたり1つのIroh Endpointを置く。DHT actorは2つである。

1. `DhtAddressLookup`が所有するaddress actor。
2. 本章のパッケージが所有するtag actor。

両者は同じdeployment bootstrap networkを使う。各actorは自分のUDP socketをbindする。privateなactor access、transmutation、未文書化のactor共有、2つのactorが1つのportを共有するという仮定を持たない。

このbackendは、別個のPkarr HTTP relay又はDNS device-directory serverを必要としない。通常のDNSは、infrastructure hostnameの解決及びHTTPS relay証明書のsupportに引き続き使ってよい。

接続識別のため、本章は第28.9節の`TransportBindingId`及び`AuthenticatedTransportContext`、第28.24節のtransport-private headerを追加する。これらは認証済みconnection識別と再dial禁止だけを扱い、Gaiaを理解するAPIではない。

### 28.5 不変条件

1. 認証済みtransport identityが、宛先及びpeer headerを決定する。
2. DHT discoveryはstale又は不誠実なavailability claimを返し得る。接続認証は必須のままである。
3. 要求されたDeviceIdに対するIPだけの代替を許さない。
4. 自動的なpublic-Mainline fallbackを許さない。
5. すべてのtag topicはdeployment namespaceとtag kindを含む。
6. remote入力がlocal forwarding host又はportを選択しない。
7. 送信可能性のあるrequestのreplayを許さない。
8. 固定boundのないapplication-body bufferingを許さない。
9. node数に比例するlocal membership stateを持たない。
10. tag及びdescriptorは自己記述であり、認可でも経済的eligibilityでもない。
11. 接続承認と予約slot分類は別である。
12. metricは無制限のidentity、URL、tag又はerror文字列labelを使わない。
13. 公開成功から全network discoverabilityを主張しない。
14. `server_mode()`を省略したという理由だけでclient-only DHT動作を主張しない。
15. 式、第三者のdeployment又は未実行のcriteriaから規模試験成功を推論しない。

加えて本章は、接続を固定するsessionの前提として次を置く。

16. `DeviceHandle`は単一の認証済みQUIC connectionへ固定し、close後に別connectionへredialしない。
17. `AuthenticatedTransportContext`は実際の認証から設定し、callerがbindingを設定・変更できない。
18. transport-private headerだけではauthorityを許可せず、auth contextはtransport-private listenerから受けた場合だけ信用する。
19. 同一connection内のpath変更ではbindingを維持し、connection交換・Endpoint再構築・process restartではbindingを更新する。

### 28.6 依存関係と証拠

保持するdocumentation targetは次のとおりである。

| Component | Target |
|---|---|
| Iroh Endpoint | `iroh` 1.3.0 |
| Relay server | `iroh-relay` 1.3.0 |
| Address lookup | `iroh-mainline-address-lookup` 0.6.0 |
| DHT | `n0-mainline` 0.7.0、`unstable_signed_peers` |
| HTTP | Hyper 1、hyper-util 0.1、http-body-util 0.1 |
| Runtime | Tokio 1、tokio-util 0.7 |

これらはaudit targetであり、互換性が実証されたlockfileではない。

設計時に供給された証拠が確立するsemantic interfaceは次のとおりである。

- DHT: 非同期query/publication、feature-gated signed peers、mutable-item API、公開bootstrap-contact export、background actor model。
- Lookup Builder: `DhtBuilder`を受け取る。endpoint secret keyを受け取る。TTL及びrepublish delay。既定のrelay-only address filtering。
- Lookup: signed endpoint address recordをpublishする。`EndpointId`を解決する。周期的publicationを所有する。
- Relay Server: spawn、graceful shutdown、supervised join。handleをdropするとserviceが停止する。
- ServerConfig: non-exhaustive。relay/QUIC option。任意のmetrics設定。
- Relay Access: 任意のreasonを伴うAllow又はDeny。
- Draft signed-peer wire format: 32-byte key、8-byte timestamp、64-byte signature。signatureはtopicとtimestampを覆う。1応答あたりおよそ10 record。

統合の正しさを主張する前に、正確なbuilder method、mode選択、relay token抽出、Endpoint watcher、stream limit及びserver設定型をauditする。

#### 28.6.1 証拠ledger

`docs/upstream-audit.md`をcommitし、次を含める。

```text
component
resolved version + source checksum/commit
source file + symbol
exact relevant signature/type
observed semantic behavior
local fixture demonstrating the integration
license
unsupported/no-op limits
```

必要なfindingsは次のとおりである。

1. 空のEndpoint構築。明示的なlookup、relay、secret及びALPN設定。
2. IDで認証されたconnection受付とpeer-ID抽出。
3. Stream I/O trait、reset、close、driver cancellation。
4. Runtime のrelay add/remove及びcredential-update挙動。
5. Relay access-hookのidentityとtoken可視性。
6. DHT bootstrapの置換か追加かの区別。
7. 明示的なread-only/client modeとadaptive server-promotion挙動。
8. Address recordのretention、eviction、sequence、cache TTL、republish及びaddress変更時publication。
9. Signed-peer representation、accessor、validation、retention、eviction、duplicate処理及びstorage accounting。
10. 実際のserver limit及び文書化されたno-op設定。
11. 公開contact export及び利用可能なactor shutdown semantics。
12. 解決された依存型の互換性及びlicense。

local auditは大規模性能要件ではない。実装完了を主張するための前提である。API supportが欠けている場合はdependency incompatibilityとして報告する。推測したmethod名、暗黙の挙動変更、private memory access又はvalidation bypassを認めない。

audit済みの最小限の上流accessor patchには、明示的な依存変更、license記録、lockfile及びtestを要する。それが必ず必要であるとも、既に利用可能であるとも推定しない。

### 28.7 パッケージ構造

```text
src/
  lib.rs
  api.rs
  config.rs
  identity.rs
  errors.rs
  lifecycle.rs
  discovery/
    address.rs
    tag.rs
    signed_peer.rs
    contacts.rs
  transport/
    endpoint.rs
    pool.rs
    io.rs
  http/
    client.rs
    receiver.rs
    proxy.rs
    headers.rs
    body.rs
  infrastructure/
    descriptor.rs
    admission.rs
  server/
    mod.rs
    bootstrap.rs
    relay.rs
  bin/gaia-network-server.rs
examples/
  device.rs
  caller.rs
  embedded_server.rs
tests/
  discovery.rs
  forwarding.rs
  admission.rs
  lifecycle.rs
```

single packageとする。既定featureは`node`である。任意featureの`server`がserver module、任意のrelay依存及びserver binaryを有効化する。featureはwire semanticsを変更しない。

audit targetのmanifest例:

```toml
[package]
name = "gaia-network"
version = "0.1.0"
edition = "2024"
license = "MIT OR Apache-2.0"

[features]
default = ["node"]
node = []
server = ["dep:iroh-relay"]

[dependencies]
iroh = "=1.3.0"
iroh-mainline-address-lookup = "=0.6.0"
n0-mainline = { version = "=0.7.0", features = ["unstable_signed_peers"] }
iroh-relay = { version = "=1.3.0", optional = true, features = ["server"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "net", "time", "sync", "signal"] }
tokio-util = { version = "0.7", features = ["rt"] }
hyper = { version = "1", features = ["client", "server", "http1"] }
hyper-util = { version = "0.1", features = ["tokio"] }
http-body-util = "0.1"
http = "1"
bytes = "1"
futures-util = "0.3"
blake3 = "1"
hex = "0.4"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"
thiserror = "2"
tracing = "0.1"
unicode-normalization = "0.1"
async-trait = "0.1"

[[bin]]
name = "gaia-network-server"
path = "src/bin/gaia-network-server.rs"
required-features = ["server"]
```

互換する型identityを解決する。ある依存versionの`DhtBuilder`を、transmutationによって別versionへ渡すことはできない。server/test依存をlockする。noticeを保存する。license/advisory auditを実行する。供給されたlicense情報は`n0-mainline`をMIT OR Apache-2.0とするが、解決されたpackageをledgerで確認する。

### 28.8 Identity

hostはIroh transport `SecretKey`を供給する。Gaiaの鍵形式をimportしない。別のwallet又はcertificate protocolを要求しない。transport鍵はGaiaのidentity鍵でもauthority鍵でもない（第2.1.1節、第15章）。

signed tag announcementには、同じ32-byte transport seedを使う。

```rust
let seed = transport_key.to_bytes();
let tag_signer = n0_mainline::SigningKey::from_bytes(&seed);
```

必須不変条件: signed-peer key bytesが、認証済みIroh DeviceId bytesと一致すること。pinnedされた型に対してlocalで検証する。この一致はtag署名のdomainに限られ、Gaia objectをEd25519で署名する許可ではない。

standalone binaryは`state_dir/transport.seed`を格納し、ちょうど32 bytesとする。上流のsecure generationで生成する。create-new semanticsでatomicに作成し、owner限定権限とする。Unixは0600、Windowsは同等のowner限定ACLとする。symlink、corruption及び誤った長さを拒否する。黙って再生成しない。seedをログに出さない。

自動rotationを行わない。鍵の置換は新しいDeviceIdを作る。identity continuityはこの層より上位に属する。同一Bodyの単純なrestartでは同じseedを維持しDeviceIdを保つ。新Body/authority generationでは新transport鍵を用意し、新TimeHandshakeを行う（第15.5節、第29.2節）。

peer header値は、生32-byte DeviceIdを符号化するちょうど64文字のlowercase ASCII hexadecimalである。prefix、padding、whitespaceを付けない。上流のDisplay serializationを使わない。

### 28.9 Public API

```rust
pub use iroh::EndpointId as DeviceId;
pub type Result<T> = std::result::Result<T, NetworkError>;
pub type Body = http_body_util::combinators::UnsyncBoxBody<
    bytes::Bytes, NetworkError
>;

pub struct Network { /* Arc<Inner> */ }

impl Network {
    pub async fn start(
        config: NodeConfig,
        secret: iroh::SecretKey,
        peer_policy: std::sync::Arc<dyn PeerPolicy>,
    ) -> Result<Self>;

    pub fn device_id(&self) -> DeviceId;
    pub fn status(&self) -> NetworkStatus;
    pub async fn wait_online(&self, timeout: std::time::Duration) -> Result<()>;

    pub async fn request(
        &self,
        target: DeviceId,
        request: http::Request<Body>,
        options: RequestOptions,
    ) -> Result<http::Response<Body>>;

    pub async fn find_device(&self, target: DeviceId) -> Result<DeviceHandle>;
    pub async fn find(&self, tag: Tag, options: FindOptions) -> Result<FindResult>;
    pub async fn set_tags(&self, tags: Vec<Tag>) -> Result<TagPublishReport>;
    pub async fn describe(&self, target: DeviceId) -> Result<PublicDescriptor>;
    pub async fn add_relay(&self, grant: RelayGrant) -> Result<()>;
    pub async fn remove_relay(&self, url: &iroh::RelayUrl) -> Result<()>;
    pub async fn shutdown(&self) -> Result<()>;
}

pub struct DeviceHandle {
    pub id: DeviceId,
    // Private shared handle to authenticated connection.
}

pub struct RequestOptions {
    pub deadline: std::time::Duration,
}

pub struct FindOptions {
    pub limit: usize,
    pub timeout: std::time::Duration,
    pub verify_online: bool,
}

pub struct FindResult {
    pub devices: Vec<DeviceId>,
    pub truncated: bool,
    pub timed_out: bool,
}
```

request既定: 60秒のabsolute deadline。find既定: 64結果、10秒、online検証なし。public operation durationは正で最大24時間。sub-deadlineはoverall deadlineを超えない。

`find_device`はexact identityへの接続性を認証する。DHTの`find_node`はrouting contactを見つけるものであり、applicationの対象deviceではない。これを等価な検索として公開しない。

`find`はexact-tag sampleを返す。`verify_online=false`は検証済みannouncementのみを意味する。`verify_online=true`は認証済み接続と、要求された論理tagを含む現在のdescriptorを要求する。

`Network`はCloneである。明示的`shutdown`は全cloneへ作用し、以後のoperationを拒否し、idempotentである。最後のhandleのdropはbest-effort cancellationを要求するものであり、graceful flushを保証しない。

```rust
pub mod body {
    pub fn bytes(value: impl Into<bytes::Bytes>) -> crate::Body;
    pub fn empty() -> crate::Body;
}
```

boxed Full/Emptyで実装し、到達可能なpanicなしにInfallibleをmapする。decompressionもbody parsingもしない。

usage contract:

```rust
let net = Network::start(config, transport_key, policy).await?;
net.wait_online(Duration::from_secs(20)).await?;
let request = http::Request::builder()
    .method("POST")
    .uri("/v1/operation")
    .header("content-type", "application/json")
    .body(gaia_network::body::bytes(payload))?;
let response = net.request(peer, request, RequestOptions::default()).await?;
```

公開するのは上記までである。公開raw Endpoint、任意stream、mutable DHT operation、secret accessor又は任意宛先TCP connectorを公開しない。

#### 28.9.1 接続識別と固定handle

以下はgaia-networkで実装する新規package APIであり、Irohの公開APIに存在するという主張ではない。

```rust
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub struct TransportBindingId([u8; 32]);

impl TransportBindingId {
    pub fn as_bytes(&self) -> &[u8; 32];
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AuthenticatedTransportContext {
    pub local_device_id: DeviceId,
    pub peer_device_id: DeviceId,
    pub binding_id: TransportBindingId,
}

impl DeviceHandle {
    pub fn transport_context(&self) -> AuthenticatedTransportContext;
    pub async fn request(
        &self,
        request: http::Request<Body>,
        options: RequestOptions,
    ) -> Result<http::Response<Body>>;
}
```

`DeviceHandle`は単一の認証済みQUIC connectionへ固定する。Network所属、connection共有、binding ID及び閉鎖stateをprivateに持つ。`transport_context`のlocal/peerは実際の認証から設定する。callerはbindingを設定・変更できない。

binding IDは、各Endpoint lifetimeのsecure-random instance nonce 32 bytesとconnection admission連番u64から、次で生成する。

```text
BLAKE3("gaia-network/transport-binding/v1\0" || instance_nonce[32] || u64_be(sequence))
```

sequenceは1から始め、atomicに増加し、overflow時は新規connection admissionを拒否する。instance nonceはhostのsecure RNG又は監査済み上流secure generationで取得する。transport seed、DeviceId、IP又は時刻だけをIDの代用にしない。nonceを永続化せず、restartで更新する。これを新暗号schemeやTLS exporterとして説明しない。

同じconnectionを複数のhandle又はpoolで共有するとき、binding IDも共有する。HTTP stream、loopback TCP、direct/relay/NAT pathの変更ではIDを変えない。connection交換、Endpoint再構築、process restartでは必ず別IDにする。ローカル両方向で同一実connectionを認識できる場合はconnection所有レコードを共有する。双方向simultaneous dialで別connectionが成立した場合は別IDとし、各pool capへそれぞれ計上する。EndpointId一致だけで二つのconnectionを統合しない。

`DeviceHandle::request`はこのconnectionだけを使い、close時にredial又は別connectionへのfallbackを行わない。closedなら`TransportClosed`、context不一致なら`TransportBindingChanged`を返す。まだbytesを渡していない場合は`NotSubmitted`、以後は`Unknown`とする。呼出し側が新たに`find_device`を行って新handleを取得することは可能だが、Gaia adapterは先に新TimeHandshakeを行う（第29.4節）。

`Network::request`は汎用の単発HTTP APIとして残す。Gaia sessionを伴う要求は、`find_device`で取得した同一`DeviceHandle`から送る。確立済みのGaia sessionの経路として`Network::request`を使わない。`Network::request`も、`Response.extensions`へこのexchangeの`AuthenticatedTransportContext`を挿入する。これはHTTP wire headerではない。`DeviceHandle::request`のResponseにも同じextensionを挿入する。binding ID又はconnection handleの所持はGaia権限を与えない。

`DeviceHandle`はbounded connection ownershipを持ち、未使用handleだけでidle connectionを永続pinしない。pool cap及びidle timerは有効のままとする。handleが存在してもidle evictionでき、閉鎖後のrequestは失敗する。active body保持中は元のpermit規範に従ってevictionしない。新規handle取得は既存のdial coalescingと接続認証を使う。

TimeHandshakeで双方が署名して交換するbinding IDはGaia transcriptのfieldであり、第28.24節のtransport-private headerとは別である。

### 28.10 Configuration

```rust
pub struct NodeConfig {
    pub network_name: String,
    pub local_rest: std::net::SocketAddr,
    pub state_dir: Option<std::path::PathBuf>,
    pub dht: DhtConfig,
    pub relays: Vec<RelayGrant>,
    pub tags: TagDiscoveryConfig,
    pub limits: Limits,
    pub inbound: InboundLimits,
    pub timeouts: Timeouts,
    pub protected_peers: Option<std::sync::Arc<dyn ProtectedPeers>>,
}
```

`PeerPolicy`、`ProtectedPeers`及び`RelayAdmission`はprogrammatic configurationであり、TOMLのtrait objectではない。trait objectをdeserializeしない。未知のserialized configuration keyはvalidation failureとする。綴り誤りを黙って無視しない。

既定例:

```toml
network_name = "example.gaia-network.private.v1"
local_rest = "127.0.0.1:8080"

[dht]
bootstrap = ["bootstrap-a.example:6881", "bootstrap-b.example:6881"]
address_port = 0
tag_port = 0
endpoint_ttl_secs = 300
endpoint_republish_secs = 120

[relay]
seeds = ["https://relay-a.example", "https://relay-b.example"]

[tag_discovery]
republish_secs = 120
candidate_max_age_secs = 600
candidate_cache_entries = 4096
candidate_cache_ttl_secs = 600

[limits]
outbound_connections = 256
requests_total = 256
requests_per_peer = 16
tags_per_node = 32
find_concurrency = 8
find_results = 64
header_bytes = 32768
header_count = 100
request_body_bytes = 67108864
response_body_bytes = 67108864
relay_entries = 32

[inbound]
connections = 256
per_peer = 2
pending_handshakes = 64
pending_policy = 32
reserved_fraction = 0.5
streams_per_connection = 16

[timeouts]
connect_ms = 15000
request_ms = 60000
request_header_ms = 10000
local_connect_ms = 2000
policy_ms = 2000
body_idle_ms = 15000
find_ms = 10000
outbound_idle_ms = 60000
inbound_first_stream_ms = 10000
inbound_idle_ms = 30000
shutdown_ms = 10000
```

bounds:

| Field | Validation |
|---|---|
| Network name | NFC UTF-8、1..128 bytes。制御文字及び前後whitespaceなし |
| Device bootstrap | 非空。ただし最初のstandalone bootstrap serverは例外 |
| Device relay seeds | 最初に許可される使用可能なseed/grantを少なくとも1つ |
| Fixed DHT ports | 異なる。両方0は許す |
| Local REST | 数値の127.0.0.1又は::1。非zero port |
| Connection pools | 正。各々最大4096 |
| Pending pools | 正。各々最大1024 |
| Requests total | 正。最大4096 |
| Active requests/peer | 正。最大16 |
| Tags/node | 正のcap。最大128。既定のdesired setは空 |
| Header count | 既定100。無制限値なし |
| Header bytes | 既定32 KiB |
| Body bytes | 既定64 MiB。hard maximum 1 GiB |
| Relay entries | 最大32 |
| Bearer token | 最大4096 bytes。制御文字なし |
| Relay URL | HTTPS。最大2048 bytes。userinfo/fragment/queryにcredentialを含まない |
| Reserved fraction | 0..1。classifierがある場合だけ有効 |

これらの数値は安全側の既定であり、測定済み規模容量ではない。descriptor sizeもlocal tag/role設定を制約する。

#### 28.10.1 設定の構造的対応

TOMLとRust `NodeConfig`は異なる表示形式なので、serialized DTOからprogrammatic configurationへの写像を次に明示する。未知key拒否と上限はそのまま維持する。

| serialized field | programmatic field／意味 |
|---|---|
| network_name / local_rest / state_dir | 同名の`NodeConfig` fields |
| `[dht]` | `NodeConfig.dht`。bootstrap、address/tag port、TTL及びrepublishを同名単位で変換 |
| `[relay].seeds` | `NodeConfig.relays`に`bearer_token=None`の`RelayGrant`として初期化 |
| `[[relay.grants]]` | url/bearer_tokenの明示`RelayGrant`。seedsとcanonical URL equalityでdedup |
| `[tag_discovery]` | `NodeConfig.tags`。republish_secs→republish_interval、candidate_max_age_secs→candidate_max_age、candidate_cache_ttl_secs→candidate_cache_ttl、candidate_cache_entries→candidate_cache_entries |
| `[[tag_discovery.rules]]` | `TagShardRule`。kind/name→canonical `Tag`、shard_count/query_shardsは同名 |
| `[limits]` | `NodeConfig.limits`の同名上限 |
| `[inbound]` | `NodeConfig.inbound: InboundLimits`。connections/per_peer/pending_handshakes/pending_policy/reserved_fraction/streams_per_connection |
| `[timeouts]` | `NodeConfig.timeouts`。`*_ms`をDurationへchecked変換 |

`Limits`は`outbound_connections`、`requests_total`、`requests_per_peer`、`tags_per_node`、`find_concurrency`、`find_results`、`header_bytes`、`header_count`、`request_body_bytes`、`response_body_bytes`、`relay_entries`を公開configの構成要素として定義する。`InboundLimits`は上記の全fieldsを、`Timeouts`は元設定例の全fieldsを定義する。public operation durationとconfig durationの単位を混ぜない。既定値及びhard capは上表のとおりとする。`ProtectedPeers`及び`PeerPolicy`はprogrammatic traitであってTOMLのtrait objectではない。

seedsとgrantsで同じURLを指定した場合、grantsの資格情報を使う。同じURLのgrantsが複数ある場合はConfig errorで拒否する。serializedのtag kindはsystem/userのみとする。system nameはbootstrap/relayのみとする。bootstrap/tagで同名のuser stringは別kindとして保持する。

`RequestOptions::default`、`FindOptions::default`及びStatus型は、実際のpublic定義と一致させる。source-auditが必要な上流setterをこれらのprogrammatic型へ紛れ込ませない。設定の構造整備を、未監査上流APIの互換性が確定した証拠にしない。

### 28.11 DHT roleと構築

三つの異なる概念を区別する。

- DeviceId: overlay transport鍵。
- DHT routing ID: 依存が制御するrouting identity。
- Deployment name: tag namespaceであり、認証されたDHT network identifierではない。

#### 28.11.1 Bootstrap設定

明示的なbootstrap置換を使い、追加（augmentation）をしない。default client/server shortcut又は`extra_bootstrap`がpublic defaultを保持する場合、production構築に使わない。

必要なadapter契約:

```rust
fn independent_builder(config: &DhtConfig) -> Result<n0_mainline::DhtBuilder>;
```

adapterはdefault contactをclearし、検証済みのconfigured/cached contactをinstallし、独立したactor portを設定し、検証済みの必須roleを設定しなければならない。正確なcallable signatureを先にauditする。

供給されたBuilder interfaceに基づくlookup統合:

```rust
let lookup = iroh_mainline_address_lookup::DhtAddressLookup::builder()
    .dht_builder(independent_builder(&config.dht)?)
    .secret_key(secret.clone())
    .ttl(config.dht.endpoint_ttl_secs)
    .republish_delay(Duration::from_secs(config.dht.endpoint_republish_secs))
    .build()?;
```

relay-onlyの既定address filteringを保持する。既定でdiscovery経由のdirect IPをpublishしない。Irohは接続確立中にdirect pathを発見してよい。

Tokio runtime内で構築する。synchronous constructionとasync query semanticsの別をauditする。解決されたsignatureを確認せずに古い`.build().await`例をcopyしない。

#### 28.11.2 通常device role

必須挙動: 両device actorはread-only/client actorのままとし、storage/routing serverへ自動promotionしない。明示的なinfrastructure server modeは別である。

`server_mode()`の省略はこの挙動を確立しない。builder defaultとpromotion経路をauditする。利用可能なら検証済みの明示的no-promotion設定を使う。pinned依存がそれを強制できない場合、このrole契約はintegration incompatibilityである。client-only実装を報告せず、その偽の前提の上でserver populationを計算しない。

setterを発明して代償しない。adaptive promotionを許す決定は、accounting、deployment及びoperator義務に影響する明示的な設計変更である。

#### 28.11.3 公開server role

明示的な長期稼働の公開到達可能IPv4 DHT serverとする。signed-peer featureを有効化する。bind port/public address及びstorage設定をaudit済みbuilder APIで構成する。

最初のserver: default contactなし、空のdeployment peer。後続server: 既存のdeployment server contact。device bootstrapは3つの独立infrastructure addressを含むべきである。最初のserver及びisolated local testは例外とする。

暗号学的なrouting permissioningを主張しない。nodeはforeign contactを学習し得る。namespace hashingとseed選択はすべてのrouting nodeを認証しない。namespaceはtag分離にすぎず、routing permissionを与えない。

### 28.12 Address publicationとfreshness

exact DeviceId解決は既存の`DhtAddressLookup` signed Pkarr recordを使う。独自のmutable-item sequence実装を持たない。第二のaddress registryを持たない。

address TTL既定: 300秒。republish既定: 120秒。これらは保守的なaudit-target値であり、retentionから導出された検証済みの最適既定ではない。

実装既定を確定する前に、次をsource-auditする。

- mutable recordのretentionとeviction。
- accessがretentionを更新するか。
- Pkarr cache TTLとsequence処理。
- address変更時及びstartup時の即時publication。
- 上流publisher内部のjitterの有無。
- restart、失敗したPUT及びclock移動時の挙動。

DNS/PkarrのTTLはDHT storage retentionではない。3600秒のような長いintervalには、検証済みのretention余裕と許容できるstale-address挙動を要する。TTLだけを増やしてrecordが長く残ると仮定しない。

packageのtag schedulingは、検証済みpublic interfaceが制御を提供しない限り、lookup所有のstartup trafficを遅延できない。そのような遅延hookを捏造せず、trafficをaccountingに含める。

`address_publication_attempted`は、実際のpackage/上流hookを通じてのみ観測可能である。relay registration単独はpublicationの証拠ではない。

### 28.13 Routing-contactの永続化

任意の`state_dir`が1つの有界contact cacheを有効化する。embedded clientはstatelessのままでよい。

file: `dht_nodes.json`。

```json
{"version":1,"network_name":"example.gaia-network.private.v1","saved_at_unix_secs":0,"tag_contacts":["203.0.113.10:6881"]}
```

accessibleなtag actorの公開`to_bootstrap`結果から、最大64のnumeric contactを保存する。privateなaddress actor accessを行わない。startup時にcached contactをconfigured seedとunionし、両builderへ渡す。cacheが応答するという理由だけでconfigured seedを破棄しない。

validation:

- fileは最大16 KiB。
- 既知version。正規化network nameの完全一致。
- numeric addressと非zero port。
- productionではunspecified、multicast、link-local及びloopbackを拒否する。
- private-network/test addressは明示的なisolated profileを要する。
- 7日より古い、又は5分より未来のcacheを無視する。
- malformed/unreadable cacheはdiagnostic degradationであり、identity再生成ではない。

10分ごと、及びshutdown時にbest-effortで書く。temporary fileと同一directoryのatomic renameを使う。owner限定権限とsymlink保護を行う。最終writeはshutdown deadlineでboundする。

任意のpackage bootstrap refreshは0..60秒のjitterを使う。これは上流の初期lookup trafficの制御を主張しない。

### 28.14 Tagとtopic導出

```rust
#[derive(Clone, Debug, Eq, PartialEq, Hash)]
pub enum Tag {
    System(SystemTag),
    User(String),
}

#[derive(Clone, Debug, Eq, PartialEq, Hash)]
pub enum SystemTag { Bootstrap, Relay }

impl Tag {
    pub fn user(value: &str) -> Result<Self>;
    pub fn system(value: SystemTag) -> Self;
}
```

system string: `bootstrap`、`relay`。kind byteが、綴りが同一のsystem tagとuser tagを分離する。

user stringをNFCへ正規化する。1..128 bytesを受け付ける。制御文字/NUL/前後whitespaceを拒否する。case-sensitiveとする。wildcard、splitting、locale folding、fuzzy解釈又はbusiness semanticsを持たない。

直接構築されたenum値も含め、すべてのNetwork API境界でcanonicalizeする。tag-count capを適用する前に、最初の出現を保ってdesired tagをdedupする。

unsharded導出:

```rust
fn topic(network: &str, kind: u8, name: &[u8]) -> [u8; 20] {
    let mut h = blake3::Hasher::new();
    h.update(b"gaia-network/tag/v1\0");
    h.update(&(network.len() as u16).to_be_bytes());
    h.update(network.as_bytes());
    h.update(&[kind]);
    h.update(&(name.len() as u16).to_be_bytes());
    h.update(name);
    h.finalize().as_bytes()[..20].try_into().unwrap()
}
```

hashの前にvalidateする。kindは0がsystem、1がuser。固定sliceにより最終変換が安全になる。

`unwrap()`は固定長slice変換の安全性が型で保証される箇所に限る。実装では`try_into()`の失敗を到達不能として扱い、`expect`に理由を記すか、固定長配列へ直接copyする形に置き換えてよい。

tagはexactな自己announcementであり、能力の証明ではない。通常nodeは既定でtagを広告しない。providerがopt-inする。server roleはroleが稼働中の間だけsystem tagを広告する。

### 28.15 任意の固定tag sharding

```rust
pub struct TagDiscoveryConfig {
    pub rules: Vec<TagShardRule>,
    pub republish_interval: Duration,
    pub candidate_max_age: Duration,
    pub candidate_cache_entries: usize,
    pub candidate_cache_ttl: Duration,
}

pub struct TagShardRule {
    pub tag: Tag,
    pub shard_count: u16,
    pub query_shards: u16,
}
```

既定: ruleなし。K=1、Q=1。republish 120秒。candidate age 600秒。suppression LRU 4096 entries/600秒。

bounds: ruleは128。K=1..256。Q=1..min(K,16)。cacheは65536以下。durationは正かつ86400秒以下。重複するcanonical logical tagを拒否する。

あるtagの全publisher/searcherは固定Kを共有しなければならない。動的なlocal-population推定を使わない。Kの変更は協調的なdeployment migrationを要する。自動のdual publishingを実装しない。

K>1のpublisher assignment:

```text
a = BLAKE3("gaia-network/tag-shard-assignment/v1\0" || DeviceId_raw_32)
shard = u64_be(a[0..8]) mod K
```

sharded topic:

```text
BLAKE3(
  "gaia-network/tag-sharded/v1\0" ||
  u16_be(network_utf8_length) || network_utf8 ||
  kind_u8 || u16_be(tag_utf8_length) || tag_utf8 ||
  u16_be(K) || u16_be(shard)
)[0..20]
```

K=1は元のunsharded関数を厳密に使う。各publisherは1つのshardを使う。finderはQ個のdistinct shardを重複なく一様にsampleし、同時queryは最大4とする。

honestなdistributionは確率的である。attackerはshardのためにidentityをgrindできる。shardingはSybil耐性を提供しない。

operator profile例: relay system tagはK=16、Q=4。例示であり、黙ってinstallしない。

```toml
[[tag_discovery.rules]]
kind = "system"
name = "relay"
shard_count = 16
query_shards = 4
```

`infra.relay.jp-kansai`のようなregional nameは通常のuser-tag慣習であり、libraryは地理的意味を付与しない。

### 28.16 Signed publication scheduler

feature-gatedな`announce_signed_peer`を使う。controlled DHT serverはdraft signed-peer operationをsupportしなければならない。public Mainline nodeは一般にそれをsupportすると仮定できない。

wire record:

```text
message   = topic[20] || unix_microseconds_i64_be[8]
signature = Ed25519(message)
record    = key[32] || timestamp[8] || signature[64]  # 104 bytes
```

draftの受理検査: write token、signature、announcement受信時点で±45秒以内のtimestamp。signed recordはおよそ10件で1応答に収まる。

±45秒規則は保存recordのlifetimeではない。retention/evictionは独立にsource-auditしなければならない。

scheduler:

- schedulerは1つ、同時publicationは最大4。
- relay-onlineがfalse、又はpublication clock checkが不正な間はpublicationを停止する。
- 最初の自動roundはrelay registration後、一様sampleした0..60秒のstartup delayを待つ。
- periodic intervalは120秒、±10% jitter。
- 失敗backoffは5、10、20、40、60秒でcapし、±20% jitter。成功でresetする。
- monotonic deadlineを使う。wall timeはsignatureとcandidate ageにだけ使う。
- 非負で表現可能なUnix microsecondsを検査する。clock rollback/不正はroundを停止し、`ClockInvalid`を発行する。
- 上流が内部で署名する場合、呼出し前に検査する。上流のclock注入APIを仮定しない。

任意の600秒interval/1800秒candidate-age profileは、最大intervalにretry/outage allowanceを加えた長さを超える検証済みretentionを要する。candidate ageはstorage retentionを延長しない。

desired-state generationが更新をcoalesceする。古いroundの完了が新しいdescriptor又はdesired tagを変更してはならない。既にpublishされたstale remote recordは残り得る。

### 28.17 Tag置換report

```rust
pub struct TagPublishReport {
    pub generation: u64,
    pub results: Vec<TagPublishResult>,
}
pub struct TagPublishResult {
    pub tag: Tag,
    pub outcome: TagPublishOutcome,
}
pub enum TagPublishOutcome {
    Published,
    DeferredOffline,
    Failed { code: ErrorCode },
}
```

`set_tags`:

1. 全tagをcanonicalizeする。
2. dedupし、count、shard rule及び結果descriptor sizeをvalidateする。
3. 失敗時は何も変更しない。
4. local desired generationとdescriptorをatomicにcommitする。
5. relay-onlineなら即時publicationを試行し、そうでなければ`DeferredOffline`とする。
6. 即時roundを設定済みfind timeoutでboundし、並列呼出しは4とする。
7. 未開始/未完了のdeadline制限付き呼出しは`Deadline`失敗として報告する。
8. 失敗/deferred tagはdesiredのまま残り、retryする。

reportはreplicaごとではなくlogical desired tagごとに1つとする。空の置換は空reportを返す。withdrawalはrepublishを停止するが、globalな削除を保証しない。`Published`は上流呼出しが成功を報告したことを意味し、普遍的なavailabilityを意味しない。

### 28.18 候補の発見

feature-gatedな`get_signed_peers(topic)`を呼ぶ。pinnedされた`SignedAnnounce`表現をprivateにadaptする。公開rustdocはfeature-gated型を省き得る。pageの不在はruntime featureの不在を証明しない。

正確なaccessor名はsource-audit項目のままとする。wire検証は次で固定する。

1. key[32]、signed timestamp[8]、signature[64]を抽出する。
2. queryしたtopicとtimestampに対するsignatureを検証する。
3. 不正なkey変換を拒否する。
4. 45秒を超えて未来のtimestampを拒否する。
5. 設定済みcandidate limit（既定600秒）を超えるageを拒否する。
6. 全query shardをまたいでDeviceIdをdedupし、自分自身を除外する。

findあたりのbounds:

- result limitは1..64でglobal。shardごとではない。
- operation全体のconcurrency既定は8。
- 同時shard queryは最大4、同時verificationは最大4。
- 検査するdistinct candidate identityは最大256。
- 検査するrecord総数は最大1024（invalid/duplicate recordを含む）。
- absolute deadlineは1つ、既定10秒（任意のonline検証を含む）。
- Busyはcapacity枯渇を即時rejectする。unbounded queueを持たない。

verificationが要求された場合: candidateを認証し、descriptorを取得し、ID/network bindingを検証し、要求された現在の論理tagを要求する。descriptor不一致はcandidateを拒否する。過去のsignatureが有効であっても拒否する。

`truncated`: localのresult/inspection boundが作業を停止した。`timed_out`: absolute deadlineが満了した。両方が同時に起こり得る。未queryのshardは独立に`truncated`を立てない。samplingは本質的である。

recordなしは成功した空結果である。`truncated=false`でも完全性を主張しない。actor shutdownはerrorである。

#### 28.18.1 Suppression cache

`(logical_tag, DeviceId)`をkeyとする有界global LRU。monotonicなnext-eligible timeとreason enumだけを保存する。

bounded connection/descriptor検証の失敗後、又は認証済みdescriptorがtagを欠く場合に挿入する。invalid signatureを受けたという理由だけで、claimed DeviceIdをsuppressしない。forgeされたannouncementがhonest identityをpoisonしてはならない。

既定TTLは600秒。known-ID requestはcacheをbypassする。新しいannouncementだけではdescriptor不一致をclearしない。認証済み検証の成功はclearし得る。globalなoffline assertionを行わない。

### 28.19 Endpointとliveness

audit済みの空Endpoint builderを使う。packageのlookup、secret、ALPN及び設定済みの許可relayだけを追加する。vendor presetがvendor DNS又はdefault relayを黙ってinstallすることを避ける。

ALPN: `gaia-network/http1/1`。同じbindingがdescriptorとapplication requestを運び、path dispatchが両者を分離する。

`wait_online`は、観測された完了済みrelay registrationを意味し、DHT quorumや普遍的なdiscoverabilityを意味しない。上流のwaitを供給されたtimeoutでboundする。DHT bootstrap/publicationは別に追跡する。

```rust
pub struct NetworkStatus {
    pub bound: bool,
    pub relay_online: bool,
    pub address_publication_attempted: bool,
    pub tags_last_round_ok: bool,
    pub shutting_down: bool,
}
```

利用不能な上流観測を発明してはならない。内部diagnosticsはaddress-publication観測をunavailableとして記してよい。relay-online=trueがaddress-publication-attempted=trueを自動設定してはならない。

DHT bootstrap成功とEndpoint registrationは独立である。必須の2-contact quorumを持たない。最初のbootstrap serverは既存neighborなしで稼働できる。

確立済みのdirect connectionはrelay-offline状態を生き延び得る。失敗時にEndpoint/鍵を自動で置換せず、要求されたDeviceIdを変更しない。

### 28.20 接続poolと資源所有

outbound connection LRU既定256。DeviceIdあたり1つのcoalesced dial。認証済みlive connectionを再利用する。requestごとに新しいbidirectional streamを開く。

idle outboundは60秒でevictする。active exchangeをevictしない。全slotがactiveでcap枯渇時は`Busy`。request送信の可能性がある後のretryを行わない。

inbound poolは別である: 256 connection、認証済みpeerあたり2。pending handshakeは64、pending policy checkは32。package作業をspawnする前に取得する。poolが満杯ならqueueせずにrejectする。

両方向で使われるconnectionは、該当する両poolへ1回ずつ計上する。outbound cacheを通るuncountedなinbound pathを持たない。incoming streamをadmitできない場合、audit済み上流APIでresetする。安全な方向別拒否が利用できない場合はconnectionをcloseし、該当slotをreleaseする。

共有request permit: 既定256 total、peerあたりactive exchangeは16。descriptorを含む。body完了/drop/deadlineまで保持し、response headerの時点でreleaseしない。

inbound stream: connectionあたり最大16 active。超過分をresetする。上流interfaceが公開する場合はunidirectional streamをrejectする。unboundedなstream taskをspawnしない。上流transport stream limitは正確な利用可能APIを検証した後にのみ追加設定してよい。package capは常に必須である。

inbound-only connection: 最初のstream deadlineは10秒。active workのないidleのdeadlineは30秒。正当なactive 60秒exchangeをidle connection timerだけを理由に終了しない。

attackerはidentityを生成し得るため、global capは必須のままである。

### 28.21 Peer policyと予約slot

```rust
#[async_trait::async_trait]
pub trait PeerPolicy: Send + Sync + 'static {
    async fn allow_connection(&self, peer: DeviceId) -> bool;
}

pub trait ProtectedPeers: Send + Sync + 'static {
    fn is_protected(&self, peer: DeviceId) -> bool;
}
```

`PeerPolicy`の既定は認証済みidentityを許可する。Gaiaは自分のREST serverでapplication operationを認可する。policy deadlineは2秒。失敗/timeoutはdenyする。

`ProtectedPeers`は任意の同期bounded lookupであり、I/Oもapplication-message inspectionも行わない。既定false。上位層/operatorがdataを供給する。`allow`は`protected`を含意しない。

予約inbound fractionは既定0.5で、classifierがinstallされた場合だけ有効。予約slotは`floor(total*fraction)`を数え、残りがgeneral slotとなる。protectedは予約を先に消費し、次にgeneralを消費する。generalは予約を消費できない。すべてpolicy承認を要する。

general占有が満杯: least-recently-activeなidle general connectionだけをreplaceする。到着のrotationのためだけにactive exchangeをevictしない。idle victimがなければ`Busy`。

保護は認証後のslot占有にだけ作用する。飽和したbandwidth、relay、NIC、暗号handshake又はverifierを貫く保証はしない。policy変更は以後のadmissionに作用する。application revocationはoperation単位の上位層責任のままである。

### 28.22 HTTP profile

bidirectional QUIC streamあたり1回のHTTP/1.1 exchange。そのHTTP streamでkeep-alive/pipeliningを無効化する。下位QUIC connectionは再利用可能。並列性のためにH3を要求しない。

origin-form URIのみ: `/path?query`。scheme、authority、fragment、userinfo及びauthority-formを拒否する。対象DeviceIdだけがdeviceを選択する。request Hostを別のnetwork宛先として解決しない。

remote Hostは内部で生成する: `<64hex>.gaia-network.invalid`。local Hostはportを含むloopback SocketAddrへ書き換える。virtual-host semanticsを要するapplicationは、このpackageの外で扱う。

method: CONNECT/TRACEを除く有効なtoken method。それらには405を返す。Upgradeは501を返す。request bodyとresponse bodyはstreamする。trailerはsupportしない。`UnsupportedTrailers`を返す/raiseし、該当すればexchangeをcancelする。自動のcompression/decompressionを行わない。

header cap: 方向あたり32 KiBかつ100 field。byte accountingは、各fieldのname長 + value長 + framing 4 bytesの和とする。parser buffer capとboundedなrequest-line sizeも強制する。parser limitがより早く拒否し得る。service dispatch前のsyntax失敗について、同一のremote statusを主張しない。

Content-LengthとTransfer-Encodingの同時指定、及び競合する重複Content-Lengthを拒否する。outbound framingはHyperが生成する。outbound messageを再構築する前にhop-by-hop fieldを除去する。

body limitは方向あたり既定64 MiB。capを超える既知Content-Lengthはforward前に拒否する。実際にstreamされたbytesを数える。body全体をaccumulateしない。

### 28.23 Iroh/Hyper I/O bridge

Irohのsend/receiveをTokioの`AsyncRead`/`AsyncWrite` objectへ合成し、hyper-utilの`TokioIo`でwrapする。remote device間に中間TCP transportを置かない。

```rust
struct BidiIo<S, R> { send: S, recv: R }

impl<S: Unpin, R: tokio::io::AsyncRead + Unpin>
    tokio::io::AsyncRead for BidiIo<S, R>
{
    fn poll_read(
        mut self: Pin<&mut Self>, cx: &mut Context<'_>,
        dst: &mut tokio::io::ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.recv).poll_read(cx, dst)
    }
}

impl<S: tokio::io::AsyncWrite + Unpin, R: Unpin>
    tokio::io::AsyncWrite for BidiIo<S, R>
{
    fn poll_write(
        mut self: Pin<&mut Self>, cx: &mut Context<'_>, bytes: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        Pin::new(&mut self.send).poll_write(cx, bytes)
    }
    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>)
        -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.send).poll_flush(cx)
    }
    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>)
        -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.send).poll_shutdown(cx)
    }
}
```

client pattern:

```rust
let (send, recv) = connection.open_bi().await?;
let io = hyper_util::rt::TokioIo::new(BidiIo { send, recv });
let (mut sender, driver) = hyper::client::conn::http1::handshake(io).await?;
spawn_supervised(driver);
let response = sender.send_request(request).await?;
```

server pattern:

```rust
let (send, recv) = connection.accept_bi().await?;
let io = hyper_util::rt::TokioIo::new(BidiIo { send, recv });
let service = hyper::service::service_fn(move |request| {
    handle_authenticated_request(peer, request, context.clone())
});
hyper::server::conn::http1::Builder::new()
    .keep_alive(false)
    .serve_connection(io, service)
    .await?;
```

正確な上流stream traitはaudit後に機械的にadaptする。全driverをsuperviseする。上流がinitial stream dataを要求する場合、peerがstreamを観測する前に最初のbytesを書かなければならない。body dropはdriverとstreamを停止する。orphan taskを残さない。

### 28.24 Local REST転送

宛先は数値の127.0.0.1又は::1のみ、非zero port、instanceごとに不変。wildcard、LAN、DNS、IPv4-mapped alternative及びcaller選択のtargetを拒否する。公開cleartext proxy listenerを持たない。

reserved header集合は次とする。

```text
x-gaia-peer-id                  64 lowercase ASCII hex
x-gaia-transport-binding-id     64 lowercase ASCII hex
```

書換え順序:

1. HTTP framing、method、URI及びlimitsをparse・validateする。
2. remote側でcallerが指定した両reserved headerを、case-insensitiveかつ全duplicateについて除去する。
3. hop-by-hop field及びConnectionでnominateされた全fieldを除去する。
4. Hostを設定済みloopback targetへ書き換える。
5. すべての除去後に、認証済みpeer DeviceIdと当該connectionのローカルbinding IDを、それぞれちょうど1つ挿入する。
6. 2秒以内にlocal TCPへ接続する。
7. 新しいlocal Hyper HTTP/1.1 handshakeを行う。
8. requestを既存routerへstreamし、最終responseを返す。
9. responseからhop-by-hop field及び両reserved headerを除去する。

```rust
fn set_authenticated_transport_context(
    headers: &mut http::HeaderMap,
    peer: &[u8; 32],
    binding: &[u8; 32],
) {
    headers.remove("x-gaia-peer-id");
    headers.remove("x-gaia-transport-binding-id");
    let peer_value = http::HeaderValue::from_str(&hex::encode(peer))
        .expect("fixed lowercase ASCII hexadecimal");
    let binding_value = http::HeaderValue::from_str(&hex::encode(binding))
        .expect("fixed lowercase ASCII hexadecimal");
    headers.insert("x-gaia-peer-id", peer_value);
    headers.insert("x-gaia-transport-binding-id", binding_value);
}
```

除去する: Connection、Keep-Alive、Proxy-Authenticate、Proxy-Authorization、Proxy-Connection、TE、Trailer、Transfer-Encoding、Upgrade及びConnectionでnominateされたname。通常のend-to-endなAuthorizationは保存する。

source IP、Forwarded、X-Forwarded-For、relay identity又は未検証metadataを注入しない。許可済みcontext header以外に、Soul ID、署名鍵、Authorization又はrelay tokenを勝手に注入しない。remote側へ内部binding headerをproxyしない。

Gaia REST receiverは、configured own DeviceIdを`local_device_id`、peer headerを`peer_device_id`、binding headerを`binding_id`としてtransport-private contextを構築する。headerはtransport-private listenerから受けた場合だけ信用する。local attacker又は直接listener accessに対してloopbackだけで保護できるという主張を禁止する。listenerをOS isolation/credential等で制限し、信頼された転送者以外から同じcontextを注入できない構成を要求する。一般REST/WS frontendはこのheaderを信用せず、そのinterface独自の認証contextを用いる。

loopbackはhostileなlocal processからの隔離ではない。RESTはこのheaderを、指定されたtransport-private listenerでのみ信用しなければならない。local attackerが対象に入る場合、追加のapplication認証/OS隔離を要する。

partial uploadは、streaming limit/failureの前に既にlocal applicationへ作用し得る。rollbackを保証しない。

| Failure | Remote behavior |
|---|---|
| 不正なrequest/framing | serviceが応答可能なら400。parser失敗はresetもあり得る |
| CONNECT/TRACE | 405 |
| header超過 | 可能なら431。それ以外はparser reset |
| request body超過 | response前に413。response開始後はreset |
| Upgrade | 501 |
| loopback拒否/利用不能 | 503 |
| local connect/header deadline | 504 |
| 不正なlocal response | 502 |
| header後のresponse limit超過 | exchangeをreset。第二のresponseを返さない |

error body: boundedなprintable ASCII、最大256 bytes。内部address、credential、stack trace又は上流error textを含めない。HEAD/bodyless response semanticsを尊重する。最終responseのみを返す。interim 1xxのためのapplication APIを持たない。

HTTP headerを増やすこと自体はALPNを変更しない。

### 28.25 HTTP/3のscope決定

Iroh上のHTTP/3は既存adapter/experiment群でfeasibleである。本章は、選択したH3 crateが選択したversion集合に対してcompileすることを主張しない。

本章では実装しない: 追加のHTTP driver/control stream及びH3-to-local-H1 translationは、device到達性、暗号化、NAT traversal又はQUIC stream並列性を変えずに実装/security scopeを拡大する。

H3 ALPNを受け付けず、広告しない。将来のwire bindingは別reviewと新ALPNを要する。省略を不可能性として記述せず、H3 complexityを測定したと主張しない。

### 28.26 Descriptorとinfrastructure discovery

1つのreserved transport pathをinterceptする。

```text
GET /.well-known/gaia-network/v1
```

他のmethodは405。非空queryは400。ほかの全valid pathはlocalへforwardする。applicationはreserved pathを上書きできない。

```rust
#[derive(serde::Serialize, serde::Deserialize)]
pub struct PublicDescriptor {
    pub version: u16,
    pub device_id: String,
    pub network_name: String,
    pub tags: Vec<DescriptorTag>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relay: Option<RelayDescriptor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bootstrap: Option<BootstrapDescriptor>,
}
#[derive(serde::Serialize, serde::Deserialize)]
pub struct DescriptorTag { pub kind: String, pub name: String }
#[derive(serde::Serialize, serde::Deserialize)]
pub struct RelayDescriptor { pub url: String, pub admission: String }
#[derive(serde::Serialize, serde::Deserialize)]
pub struct BootstrapDescriptor { pub addresses: Vec<String> }
```

wire:

```json
{
  "version":1,
  "device_id":"64-lowercase-hex",
  "network_name":"example.gaia-network.private.v1",
  "tags":[{"kind":"system","name":"relay"},{"kind":"user","name":"provider.storage"}],
  "relay":{"url":"https://relay-a.example","admission":"external"}
}
```

validation:

- JSON bodyは16 KiB以下。full parseの前にboundする。
- Content-Typeは`application/json`。
- versionは厳密に1。未知majorを拒否する。
- IDは厳密にcanonical 64-hexで、認証済みconnectionと一致する。
- networkはlocalの正規化名と厳密一致。
- tagは128以下。kindは既知の`system`又は`user`。
- system nameはbootstrap/relayのみ。
- 重複JSON keyとmalformedな既知fieldを拒否する。
- 未知の任意fieldは構造制限の後に無視する。
- bootstrap addressは64以下、各253 bytes以下。
- relay admissionは`public`又は`external`。
- token、certificate、price、balance、未検証capacity又はGaia固有用語を含まない。

descriptor sizeはtag/config commitの前にvalidateする。desired tagを黙ってtruncateしない。認証済みconnectionがdescriptor sourceを識別する。冗長な独自descriptor署名を要求しない。

`describe`はfind deadlineと16 KiB body capを使い、通常の64 MiB response capを使わない。

relay経路: system relay tagをfindし、describeし、candidateをvalidateし、必要ならGaia/operatorが外部交渉し、明示的に`add_relay`する。広告されたroleを自動で信用せず、発見したURLを自動で使わない。

descriptor publishingはbootstrap providerにとって補助的である。静的な初期DHT seedは引き続き必要である。まだbootstrapされていないDHTを通じてbootstrapを発見するのは循環である。

### 28.27 Relay seed、grant及びadmission

```rust
pub struct RelayGrant {
    pub url: iroh::RelayUrl,
    pub bearer_token: Option<String>,
}
pub struct RelayAdmissionRequest {
    pub endpoint_id: DeviceId,
    pub bearer_token: Option<String>,
}
pub enum RelayDecision {
    Allow,
    Deny { reason: Option<String> },
}
#[async_trait::async_trait]
pub trait RelayAdmission: Send + Sync + 'static {
    async fn decide(&self, request: RelayAdmissionRequest) -> RelayDecision;
}
```

最初に使用可能なrelay/grantはdeployment入力である。その同じrelayの許可を交渉するために未許可relayを使うことは、別の許可済み経路なしにはできない。使用可能なseed、直接のoperator route又はout-of-band grantを用意する。

packageは32以下の許可relayを保持する。Irohがpathを選択/登録する。独自のglobal load-balancer、latency ranking、自動role信頼又はuniversal relay registryを持たない。operatorは小さなregional/failure-domain subsetを配布する。数千のrelayを全endpoint listへ入れない。

tokenはopaqueである。Gaiaが交渉、証明書、支払い及び発行を所有する。packageはtokenを輸送し、allow/denyを委譲するだけである。

sequence:

1. callerが明示的`RelayGrant`を供給する。
2. HTTPS URL/token limitsをvalidateする。
3. audit済みtoken APIで上流relay configを構築する。
4. 検証済みruntime APIで上流Endpointのrelayをinsert/updateする。
5. 上流がclient DeviceIdを認証する。
6. server adapterが、検証済みaccess hookから認証済みIDとtokenを抽出する。
7. 2秒deadlineで`RelayAdmission`を呼ぶ。
8. Allow又はDenyへtranslateする。

このsequenceを実装済みと主張する前に、両端のtoken supportをauditする。token抽出がsupportされない場合、incompatibilityを記録する。黙ってallowlistへdowngradeせず、certificate/grant内容を破棄しない。

既定の公開relayは明示的にAllowAllを使う。外部admissionはtimeout/errorでfail closedとする。拒否reasonは128 printable ASCII bytes以下。token logを出さず、別originへredirectしない。

#### 28.27.1 Runtime更新

relayを上流`RelayUrl`のequalityでkeyする。既存URLの更新は新slotを消費しない。URLごとにoperationをserializeする。package制御のwaitは15秒でboundする。

pinned上流のcredential replacement semanticsを記録する。その検証済みoperationを使う。推測したin-place mutationを使わない。文書化されたremove/reinsert実装は、audit済みでその一時的損失が露出される場合に限り許容する。既存sessionは古いcredentialを保持し得る。即時revocation又はrollbackを主張しない。

removalは将来のdesired useを停止する。既存のdirect/relay sessionは生き延び得る。最後のrelayの明示的removalは`relay_online`をfalseにし、tag publicationを停止し得る。vendor/public default relayを黙って追加しない。

private/internal relay宛先は、remote descriptorだけによってではなく、明示的なoperator設定によってのみ許容する。redirect又は変更されたoriginへのcredential転送を防ぐ。DNS/private-address policyはdeploymentがsupportするresolver/firewall制御で強制する。URL文字列検査がDNS rebindingを防ぐと主張しない。

### 28.28 Server roleとdeployment

1つのbinary、任意のembedded API:

```text
gaia-network-server validate --config FILE
gaia-network-server bootstrap --config FILE
gaia-network-server relay --config FILE
gaia-network-server all --config FILE
```

`validate`は公開serviceを開かない。role start前にparse/validateする。必須roleの起動が失敗した場合、既に起動したroleをtear downしてfailureを返す。誤解を招くall-ready statusを返さない。

role:

- Bootstrap: 公開DHT routing、mutable address storage、signed-tag storage。
- Relay: 既存Iroh relay/QAD及び関連service。
- Control endpoint: 暗号化descriptor/system tagを供給する任意の通常Network instance。
- Admission bridge: embedded trait又はlocal operator/Gaia verifier。

無関係なBank、payment又はapplication serviceを実装しない。未使用のDNS/Pkarr HTTP serverを含めない。

#### 28.28.1 DHT設定

明示的なsafety profile:

```text
max_info_hashes = 100000
max_peers_per_info_hash = 256
max_immutable_values = 0
max_mutable_values = 100000
```

供給された`ServerSettings` fieldは、signed-peerのclass別capacity又はretentionを証明しない。実際のaccountingをauditする。発明したexpiration setterを使わない。evictionとsamplingは許容されるdiscoveryの制限である。

`RequestFilter`はparse後に走る。完全なpre-parse UDP flood protectionではない。operating-system/firewallのpacket policing、memory/FD limit及びaudit済み上流制限を要求する。response handlingが同一にfilterされると仮定しない。

#### 28.28.2 Relay設定

上流`ServerConfig`を使い、non-exhaustiveであるため`Default`から構築する。正確なnested relay/TLS config mappingはaudit済みadapterに属する。field名を捏造せず、そのdeserializerが実際にsupportされない限り、上流のstandalone TOML fileをlibrary型としてparseしない。

production relayは有効なcertificateによるHTTPSとする。dev HTTP modeを使わない。certificate renewalはoperator/上流がsupportするmechanismによる。独自ACME実装を新設しない。metrics endpointは有効時のみprivateとする。

既知のlifecycle contract:

```rust
let server = iroh_relay::server::Server::spawn(config).await?;
// Keep handle alive; dropping it stops the service.
server.shutdown().await?;
```

embedded server APIはrole handleとjoin taskを所有する。background failureはrole readinessを変更し、supervised errorを伝播する。descriptorがreadinessを主張し続ける間に死んだrelayをdetachしない。

#### 28.28.3 Standalone config intent

```toml
network_name = "example.gaia-network.private.v1"
state_dir = "/var/lib/gaia-network"
roles = ["bootstrap", "relay"]

[bootstrap]
public_ipv4 = "203.0.113.10"
udp_port = 6881
peers = ["bootstrap-b.example:6881"]

[relay]
public_url = "https://relay-a.example"
upstream_config = "/etc/gaia-network/iroh-relay.toml"
admission = "external"

[admission]
url = "http://127.0.0.1:9901/admit"
```

`upstream_config`のfile mappingはadapter auditで証拠立てる。上流のprivate binary configが公開library APIであると仮定しない。descriptor/contact cacheへbearer tokenを保存しない。operatorは保護されたconfig統合を通じてsecretを事前配備してよい。

control endpointはoperator deviceとして認証し、relay HTTPS certificate identityとは別である。relay descriptor URLは自己申告であり、deviceがrelay domainを所有することの暗号学的証明ではない。

#### 28.28.4 外部admission bridge

loopbackのnumeric verifier URLのみ。POST JSON:

```json
{"endpoint_id":"64-lowercase-hex","bearer_token":"opaque-or-null"}
```

response:

```json
{"allow":true,"reason":null}
```

verifier呼出しは最大32。deadlineは2秒。responseは8 KiB以下。non-2xx、invalid JSON、重複した既知key、`allow`欠落、timeoutはdenyとする。Gaia/operatorがverifier listenerを供給する。packageは公開cleartext admission APIを追加しない。

このPOSTはoperator内の認可bridgeであり、通常のGaia operation sessionではない。そこでGaia署名objectを認可根拠にする場合、その検証はGaia規範を適用する外部verifierが担当する。

infrastructure providerはGaiaによって外部で報酬を得られる。輸送層は価格、eligibility proof、invoice、balance又はeconomic scoringを定義しない。

### 28.29 Deadline、error及びdelivery不確実性

lifetime accept/watch loopを除き、unboundedなpackage waitを持たない。すべてcancellation-awareとする。Busyによるcapacity拒否は即時。absolute request deadlineはconnection、header及びstreamed responseを含む。bodyはheader返却後もdeadline、idle watchdog及びpermitを保持する。

```rust
pub enum DeliveryState { NotSubmitted, Unknown }

pub enum ErrorCode {
    Config, Identity, Bind, Discovery, ConnectTimeout, PeerDenied,
    AlpnMismatch, InvalidRequest, HeaderLimit, BodyLimit, Busy,
    LocalUnavailable, Deadline, TransportClosed, Shutdown,
    UnsupportedTrailers, ClockInvalid, TransportBindingChanged,
}

pub struct NetworkError {
    pub code: ErrorCode,
    pub delivery: DeliveryState,
    // Private diagnostic cause.
}
```

`NotSubmitted`は、application-request bytesがtransportへ渡された可能性がない場合に限る。それ以降の不確実な失敗は`Unknown`である。成功したHTTP responseは4xx/5xxを含めてresponseのままである。application failureをtransport replayの助言として再解釈しない。

Irohのpacket retransmissionは新しいapplication実行ではない。packageはsubmitted exchangeを自動でretryしない。GETも含む。idempotency keyとreplay policyはGaiaが供給する。end-to-endのidempotency headerはpass throughする。

`TransportBindingChanged`は、handleが固定したconnectionのbindingと、request contextのbindingが一致しない場合に返す。これはpackage側のcodeであり、Gaia側の`TransportBindingMismatch`とは別である。

`ClockInvalid`はpublicationに作用する。remote application operationがdeliveredした証明ではない。`UnsupportedTrailers`は方向とsubmission不確実性に従う。

network内部のunexpected context状態は接続をcloseし、diagnosticをbounded codeで記録し、秘密を露出しない。

### 28.30 Lifecycle

startup:

1. 全package config/identityをvalidateする。
2. 有効ならboundedなrouting-contact hintをloadする。
3. audit済みroleで独立address/tag actorを構築する。
4. 明示的Endpointをbindする。
5. supervised accept、watcher、pool、publication schedulerをstartする。
6. WANを待たずにreturnする。

readiness dimension: bound、relay registered、DHT attempt state、最後に観測可能なlookup/publication、role health。globalなready flagを捏造しない。

recoverable outage: degraded state、boundedなpublication retry、上流reconnection。鍵置換、自動public network fallback、identity substitution又はapplication replayを行わない。

shutdown:

1. 新規operationをatomicにrejectする。
2. scheduled publication及びpending find/dialをcancelする。
3. 新規exchangeのacceptを停止する。
4. active workへoverall shutdown budget内で10秒のgraceを与える。
5. 残るsubmitted workをdelivery `Unknown`でcancelする。
6. best-effortでboundedなcontact-cache writeを行う。
7. cached connectionとEndpointをcloseする。watch/cloneをdropする。
8. DHT handleをdropする。audit済みactor semanticsに従いsupervised taskをjoinする。
9. server roleはrelayのgraceful shutdownを呼び、role supervisorをjoinする。

watcher/actorはendpoint close後もhandleを保持し得る。明示的にcancelしてdropする。closeだけで暗黙にshutdownすると仮定しない。

### 28.31 Securityとobservability

成功した実装を条件として保証するもの:

- remote application contentの認証/暗号化。
- peer headerのtransport connectionへのbinding。
- 任意forwarding宛先の不在。
- 有界なpackage資源所有。
- opaqueな外部relay認可。

保証しないもの:

- discoveryの秘匿性。
- 任意のSybil/eclipse耐性。
- 自動的なglobal relay balancing。
- loopback単独によるlocal-process隔離。
- 記録の即時withdrawal/session revocation。
- always-onのmobile到達性又はoffline delivery。
- 実証された1億/10億active規模。

IPに束縛されたDHT ID/contact diversityをauditする。既知operator IDがmalicious routing挿入を防ぐと主張しない。economic trust graph、proof-of-work又はrouting certificate schemeを追加しない。

deployment制御: process memory/FD/task budget、UDP policing、実際のTLS/handshake limit、verifier limit、relay bandwidth制御。no-opな上流設定を文書化し、保護として数えない。IP quotaは共有NATに害し得る。IP=userと仮定しない。

boundedなobserver/tracing adapterを使う。metrics listenerは任意かつprivateのみ。logにbody、Authorization、token、鍵、完全なheader又はrouting値を出さない。peerのdebug identifierはopt-inかつrate-limitedとする。

固定cardinalityの観測:

- dial/exchangeの結果とduration。
- inbound/outbound slot、pending handshake/policy count。
- protected/general tier占有。
- Busy、delivery-unknown、cancelled count。
- tag publish/findの成功/失敗、truncated/timeout/result count。
- suppression-cache hit。
- clock-invalid event。
- relay registration/change結果。
- contact-cache read/write結果。

DeviceId/tag/URL/network address/任意error文字列のmetric labelを使わない。上流privateでpublic hookから観測不能なoperationはunavailableと記す。publication呼出しの成功はreplicaごとの成功ではない。network size/discoverabilityのgaugeを捏造しない。

### 28.32 容量モデル

登録済みidentity総数I、online address publisher N、tag advertiser A、DHT server S、relay Rは別である。目標I=10^8..10^10+は同時N=Iを意味しない。

localなbounded stateは十分なglobal infrastructureを確立しない。各deploymentを明示的にmodelし、provisionする。

#### 28.32.1 入力

| Symbol | Meaning |
|---|---|
| N | Online address-publishing endpoint |
| A | Tag advertiser、0..N |
| t | advertiserあたり平均tag数 |
| r_addr, r_tag | 測定された有効な成功storage-copy factor |
| T_addr, T_tag | republish interval（秒） |
| lambda_addr, lambda_tag | churnと変更による追加publication event/秒 |
| B_addr, B_tag | 測定されたindex/allocation overheadを含むresident bytes/entry |
| C_addr, C_tag | class別の実際の有効storage cap/server |
| q_put | 宣言workload下での安全なserver storage operation/秒 |
| Q_addr | 外部exact-address解決operation/秒 |
| Q_tag | 外部tag find operation/秒 |
| d_addr, d_tag | 解決/queryあたりの平均接触routing node又はserver request数 |
| K_find | tag findあたりの平均query shard数 |
| Q_boot | bootstrap/refresh query traffic/秒 |
| Q_pub_lookup | publication準備/token/lookup traffic/秒 |
| q_read | 安全なserver read/routing request/秒 |
| S | 明示的infrastructure server母数。audit済みactor roleに依存 |
| c_relay | 安全なregistration/relay |
| f_relay | endpointあたり平均relay registration |
| b_relay | endpointあたり平均relayed bytes/秒 |
| bw_relay | ingress/egress規約込みの安全なrelay bytes/秒/instance |
| u_* | outage headroomを伴う目標utilization fraction |

未測定値はすべてassumedと記す。replica factor 8は例示でありprotocol保証ではない。tagとaddressのfactorは独立に測定する。

#### 28.32.2 Writeとstorage

```text
E_addr = N * r_addr
P_addr = N / T_addr + lambda_addr
W_addr = P_addr * r_addr
E_tag  = A * t * r_tag
P_tag  = A * t / T_tag + lambda_tag
W_tag  = P_tag * r_tag

S_addr >= ceil(E_addr / (C_addr * u_storage))
S_tag  >= ceil(E_tag  / (C_tag  * u_storage))
S_put  >= ceil((W_addr + W_tag) / (q_put * u_put))
```

capを共有する場合は独立不等式ではなく共有制約を要する。per-key hot spot、retention、skew及びoutageが支配し得る。

#### 28.32.3 Read、routing及び2つのactor

```text
W_read = Q_addr * d_addr
       + Q_tag * K_find * d_tag
       + Q_boot
       + Q_pub_lookup
S_read >= ceil(W_read / (q_read * u_read))
S >= max(S_addr, S_tag, S_put, S_read)
```

`W_read`はserver requestを数えるもので、必ずしも総network packetではない。reply、retransmission、token request及びlookup messageをbandwidth測定に含める。`Q_pub_lookup`と測定済み`d_*`の間で二重計上しない。

2つのactorは自動的にapplication lookup rateを倍にしない。ただし2つのsocket/routing stateを作り、独立したbootstrap/refresh作業を生み得る。次をmodelする。

```text
device_actor_count = 2 * N_running
device_memory = M_endpoint + M_address_actor + M_tag_actor + M_package
bootstrap_event_rate = joins_per_sec * calls_per_join_for_both_actors
                    + refresh_calls_per_sec_for_both_actors
```

`N_running`はpublishに成功したNと等しい必要はない。actor modeのauditが、adaptive deviceがstorage serverを追加するかを決定する。それを黙って含めたり除外したりしない。

CPUはreadとwriteを混ぜる。独立な最大値だけでは共有CPU需要を過小評価し得る。測定済みmixed-workload capacity又は明示的なweighted service-time modelを使う。集約boundは必要な推定であり、十分なavailabilityの証明ではない。

#### 28.32.4 Relay bound

```text
R_reg >= ceil(N * f_relay / (c_relay * u_relay))
R_bw  >= ceil(N * b_relay / (bw_relay * u_relay))
R >= max(R_reg, R_bw)
```

global総量だけでなく、region及び許可subsetごとに評価する。idle registrationと実際にrelayedされるpayload bandwidthは異なる。集約で余剰容量があっても個別relayが飽和し得る。

#### 28.32.5 参考算術

N=100000000、r_addr=8、T_addr=120、追加eventなしを仮定する。

```text
E_addr = 800000000 copies
P_addr ~= 833333 publication calls/sec
W_addr ~= 6666667 storage operations/sec
```

C_addr=100000、utilization 0.5でS_addr=16000が集約storage下限となる。C_addr=1000000なら、processがそれをsupportする場合に限り1600となる。これらはfeasibility又はinfeasibilityを結論するのに十分でない。write、read、skew、outage、cost及び運用制約が欠けている。

B_addr=1200 bytesを仮定すると、copy全体でおよそ960000000000 bytesとなる。これは仮定であり、測定RAMではない。

条件付きのT_addr=3600は、periodic-onlyの呼出しをおよそ27778/秒、書き込まれるcopyをおよそ222222/秒へ減らす。churnは残る。retention auditがこのprofileに先行しなければならない。

普遍的な120秒throughputの主張をしない。最終的な実装既定は、sourceのretention/eviction/cache findingsと明示した安全仮定に従わなければならない。容量式はfreshness保証を黙って減らす根拠にならない。

### 28.33 正確性試験

原理的に実施可能な小規模deterministic test。本章では未実行である。既定CIはisolated fixtureを使い、公開Mainlineを決して使わない。

| Area | Required checks |
|---|---|
| Identity | 同一鍵が安定。DHT signer keyがEndpointIdと一致。不正seedを拒否 |
| Builder roles | 明示的read-only actorがpromoteしない。server actorがstorageをsupport。推測modeなし |
| Independent seeds | vendor/public defaultを持ち込まない。cached hintがconfigured seedをreplaceしない |
| Address lookup | 正しいsigned device binding。source-audit済みのTTL/sequence/change挙動 |
| Signed peers | 有効/無効signature。topic改竄。±45秒admission。retrievalは想像上のstorage TTLではなくpackage ageを使う |
| Tags | NFC/case規則、直接enum validation、count、withdrawal、generation race |
| Shards | K=1互換。固定K。deterministic assignment/topic。global query bound |
| Find | dedup/self-exclusion、invalid-record cap、timeout flag、sampled non-completeness |
| Suppression | forgeされたsignatureがclaimed honest keyをsuppressできない。known-ID bypass |
| HTTP delivery | method/path/query/bodyが既存local routerへ到達する |
| Header identity | spoof/duplicate/Connection-nominated peer headerが最終的なauthoritative insertionを変えられない |
| Framing | CL/TE競合、header limit、upgrade/CONNECT/TRACEなし、trailer |
| Bodies | streaming cap、idle/absolute deadline、HEAD/bodyless status、dropがpermitをrelease |
| Destination | non-loopback/DNS/caller選択portを拒否 |
| Descriptor | reserved path、size、重複JSON key、既知version、ID/network/tag binding |
| Connectivity | direct及び許可relay経路。誤ったIDを決して代入しない |
| Admission | 認証済みID/tokenがverifierへ到達。timeout/full verifierはdeny |
| Runtime relay | add/remove/updateがauditどおりに動く。偽の即時revocationなし |
| Resources | pre-handshake/policy/connection/stream/request cap。両方向accounting |
| Protected slots | allowedはprotectedではない。active exchangeをevictしない |
| Failure uncertainty | submitted failureはUnknown。自動replayなし |
| Persistence | corrupt/stale/foreign cacheを無視。identityを決して再生成しない |
| Shutdown | 新規workを拒否。body/dial/driver/watch taskをcancel。鍵は安定 |
| Logs | credential/body/secretなし。固定metric dimension |

canonical vector（正規化tag、topic、shard assignment、signed-message bytes、canonical header、descriptor）を固定する。入力と期待出力のbytesを記録する。実装中に独立に検査し、本章に計算値を捏造しない。

以下を追加のcontext試験として統合する。

- `DeviceHandle` pinning: handleが固定したconnection以外へrequestを送らない。
- close/no-redial: close後に`DeviceHandle::request`が`TransportClosed`を返し、redialしない。
- restart ID更新: process/Endpoint再起動でbinding IDが更新され、旧IDが再利用されない。
- 両reserved headerの偽装、duplicate、case差、Connection nomination: network書換え後だけがtrusted contextになる。
- context extension: `Response.extensions`の`AuthenticatedTransportContext`が実際の認証と一致する。
- 双方向pool/binding共有: simultaneous dialの2 connectionが別IDで各pool capへ計上される。
- idle handle eviction: 未使用handleがidle connectionを永続pinしない。
- binding overflow: sequence overflowで新規connection admissionが拒否される。
- active bodyとpermit解放: body drop/deadlineでpermitが解放される。
- pool membershipを増やすときrequest/peer/inbound/outbound/stream capをすり抜けない。

### 28.34 規模参考基準

以下の大規模criteriaはreference-onlyであり、現在のrelease gateではない。利用可能なproject facility/budget/personnelでは実行できない。不可能な調達を要求せず、PASSと報告しない。

| ID | Environment | Criterion | Status |
|---|---|---|---|
| G1 | local isolated DHT/relay、少数device | 第28.33節の正確性及びexact upstream adapter | 原理的にfeasible。NOT_RUN |
| G2 | 1000独立process | 10秒以内に既知ID descriptor試行の99%以上が有効。bounded shard search | REFERENCE_ONLY。現在のprojectでは実行不能 |
| G3 | 代表churnを伴う100000 active publishing client | steady-state publication成功99%以上。modelと観測のrecord/operation/memory比較 | REFERENCE_ONLY。現在のprojectでは実行不能 |
| G4 | 宣言されたadversarial post-authentication load | general slot占有中に、deadline内でprotected legitimate admissionが99%以上。全cap強制 | REFERENCE_ONLY。現在のprojectでは実行不能 |

しきい値は望ましい参考値であり、測定済みSLOではない。G2..G4はN=10^8又はI=10^10を証明しない。第三者のdeployment結果は、このbackendの証拠を代替しない。

将来の評価が承認された場合、実行前にdependency commit、CPU、RAM、NIC、FD/task limit、server数、workload、shard rule、clock、loss/latency、grant、churn及びattack classを記録する。

分母は、意図的にonlineなpeerへのscheduled valid attemptを含み、成功したdialだけではない。Busy/denied/timed-out failureを別に数え、除外しない。容量比較はpayload bytesをRAMとしてではなく、測定されたcopy factorとretention/evictionを使う。提案するdiagnostic tolerance ±20%は、仮定が検証された後のsteady-state count/rateに限る。

G4はraw bandwidth/cryptographic handshake飽和をprotected-slot保証から除外する。任意のadversarial availabilityを約束しない。

### 28.35 Protocol進化と実装順序

ALPNは`gaia-network/http1/1`のままとする。本章はpackage limit/configurationを定め、HTTP wire versionを変更しない。未知ALPNを拒否する。将来の非互換wire変更は新ALPNを使う。multi-ALPN advertisementだけでは、single-ALPN connect APIによる自動negotiationを確立しない。

descriptor version 1はmajor schema versionである。bounds内で未知の任意fieldを無視する。未知majorを拒否する。shard導出は独自のdomain/versionと協調migration要求を持つ。runtimeの投機的upgradeを行わない。

実装順序:

1. Dependency audit ledger、compatible lockfile、license record。
2. 型、完全なconfig validation、host identity/server seed storage。
3. 独立address/tag actor、明示的role、contact cache。
4. 明示的Endpoint、relay readiness、supervised watch。
5. Connection pool、resource accounting、peer policy、予約slot。
6. Iroh/Hyper bridge、HTTP proxy、authoritative header、body/deadline規則。
7. Tag canonicalization、shard、scheduler、candidate validation/suppression。
8. Descriptor、runtime relay grant更新、外部admission adapter。
9. Embedded/standalone bootstrap及びrelay role。startup rollback/shutdown。
10. 正確性試験、golden vector、bounded observability、documentation。

completionにはaudit済みlocal integrationと正確性試験を要する。性能の不確実性は、発明されたAPIを正当化しない。dependency mismatchは正直に報告し、隠れたbranchへ変換したり、semantic決定を委譲したりしない。

この層を薄く保つ。新しいglobal registry、custom DHT、PEX enumeration、economic scoring、committee、blockchain、暗号scheme、universal relay scheduler、GUI又はapplication-message protocolを追加しない。

---

## 29. Gaiaとgaia-networkの統合契約

### 29.1 責務と識別域

gaia-networkはDeviceIdを指定した認証済み暗号化HTTP輸送、到達性の試行、exact-tag endpoint候補発見、許可済みrelay及び有界な資源管理を提供する。GaiaのSoul、DeviceIncarnation、forum、membership、証明書、アクセス権、決済、Storage receipt、score又はfinalityを認可・計算しない。

Gaia adapterはHTTPとtransport-private contextをcanonicalなGaia request及び検証可能な`CoreExecutionContext`へ変換する。gaia-coreがTimeHandshake、SessionBinding、authority、health、epoch、proof及び操作固有の正当性を検証し、唯一の状態遷移を実行する。

Soul identity鍵とBody authority鍵はML-DSA-65、transport鍵はIrohの鍵である。鍵及びseedを共有しない。transportの署名・QUIC認証の成功はGaia objectのML-DSA-65署名の代替ではない。remote application bytesはIroh QUICで暗号化されるが、native DHT metadataは平文で観測され得る。transport公開鍵とSoulを結び付けた公開広告は相関情報を増やし得るため、DHT tag及び公開descriptorへprivate attributesを載せない。

Gaia hostはtransport seedを安全に保持して`Network::start`へ渡す。単純なrestartで同じseedを維持する。新しいBody/authority generationでは新transport鍵を用意する。transport鍵だけを変更してもSoul ID、DeviceIncarnation及びforum IDは変更されず、新endpointの証明と新TimeHandshakeが必要になる。鍵変更及び失効はGaia上位のauthority/lease検証に従い、networkが暗黙にidentityを継承しない。

`DeviceIncarnation`へtransport鍵を必須フィールドとして追加しない。既存の署名対象bytes、genesis及び`forum_id`を変更しない。

### 29.2 endpointとbindingの型

node間endpointの構造化表現を次に定める。

```text
GaiaTransportEndpoint {
  transport_kind: gaia_network_http1,
  network_name: String,
  device_id: lowercase_hex_64,
  alpn: "gaia-network/http1/1"
}
```

`network_name`は第28.10節の正規化規則、`device_id`は生32 bytesのcanonical 64 lowercase hexを満たす。`EndpointId`のDisplayを使わない。endpoint内にcaller-selectedなIP/port、直接接続先TCP URL又はbearer tokenを入れない。

これは独立署名objectではなく、署名済みGaia advertisement又はTimeHandshake transcript内の構造化fieldである。既知Soulへの接続では、署名済みadvertisement、既に検証済みbinding又は明示的なbootstrap trustから得た候補を使う。DHT又はdescriptorだけで期待するSoulを確定しない。初回未知peerについて、identityの自己申告を第三者の身元確認として扱わない。

`TimeHandshake`は`initiator_endpoint`及び`responder_endpoint`のcanonical encodingをcommitする。endpoint commitmentは既存Gaiaのhashを使い、`"gaia:transport-endpoint:v1" || canonical_encode(GaiaTransportEndpoint)`から計算する。transportのBLAKE3とGaia object hashの選択を勝手に同一化しない。

各endpointのDeviceIdは、署名側自身の`Network::device_id`及び相手側で認証されたpeer DeviceIdと一致しなければならない。`network_name`とALPNも現在の接続設定と一致させる。`DeviceIncarnation`、authority、`SoulEpochLease`、`TemporalHealthLease`、trust epochを依存閉包に含め、endpointとauthorityの結合をTimeHandshakeのML-DSA-65署名で検証する。identity署名を毎requestに要求せず、既存`DeviceIncarnation`のidentity/authority二署名を使う。

`TimeHandshake` transcript及び`SessionBinding`に以下を含める。

```text
initiator_endpoint
responder_endpoint
initiator_endpoint_commitment
responder_endpoint_commitment
initiator_transport_binding_id: lowercase_hex_64
responder_transport_binding_id: lowercase_hex_64
interface_kind
transport_kind
service_scope
```

binding IDは各側がそのconnectionへ割り当てた`TransportBindingId`である。双方のIDが同一bytesであることを要求しない。IDの値自体はSoul権限を証明しない。各側は自分側IDをtrusted transport contextに照合し、相手側IDを署名済みtranscriptへ固定する。

`interface_kind`は`rest`/`websocket`/`cli`/`sdk`/`daemon`/`callback`、`transport_kind`のnode間値は`gaia_network_http1`、`service_scope`は`gaia`/`storage`/`bank`/`payment`/`ekyc`/`time_recovery`である。別frontend・外部連携の`transport_kind`は`local_rest`/`local_websocket`/`managed_https`/`managed_wss`/`local_ipc`/`external_provider_https`/`external_callback`とする。direct又はrelayというpath種別をsessionのphysical transport identityとして使わない。

`session_nonce`、`challenge`、request/response hash、protocol version、scope及び全binding fieldはTimeHandshake署名の対象に含める。canonical transcriptの各段階では、requestにinitiatorのendpoint/ID、responseに`request_hash`及び両endpoint/ID、confirmationに`response_hash`及び検証済みTimeHandshake結果のcommitmentを含める。未来の`t4`値をresponse時点の署名に含めるという実装不能な契約を作らない。`t4`及び導出時刻区間はinitiatorのconfirmationで署名して両者が検証する。

第14.3節の`TimeHandshake`はrequest/response/confirmationの証拠をまとめた結果objectである。issuerと署名対象の対応を明示し、request/responseの原署名とconfirmation署名を保持する。確定`SessionBinding`はこの三段階の検証済みtranscript及び既存`TimeHandshake` hashを参照する。新fieldを欠く保存済み`TimeHandshake`のbytesを書き換えないが、現在のnode間新規sessionには完全なfieldを必須とする。

### 29.3 node間session確立

1. Initiatorは期待するpeer Soul/Body及び候補DeviceIdを選び、`Network::find_device`で正確なDeviceIdとの認証済み`DeviceHandle`を得る。別DeviceIdへのfallbackを禁止する。
2. Initiatorは`DeviceHandle.transport_context`を取得する。以後handshakeと通常requestは同じhandleで行う。単発`Network::request`でredial可能な経路へsessionを移さない。
3. Initiatorは`POST /v1/sessions/time-handshake`へbegin要求を送る。session id、fresh nonce/challenge、protocol version、initiator endpoint/binding ID、Soul/DeviceIncarnation/authority、lease、trust epoch、必要な有界proof bundleを署名して含める。
4. Responderはtransport-private contextのpeer DeviceIdと署名済みinitiator endpointを照合する。`DeviceIncarnation`、lease、health、trust epoch、期待scope、challenge freshness及びanti-replayを検証する。TimeHandshake専用のproof bundleを通常object受理の経路として使わない。
5. Responderは`t2`/`t3`、`request_hash`、両endpoint、両binding ID、ResponderのSoul/authority及び必要proofを署名したresponseとして返す。own endpoint/IDは自分のconfigured DeviceId及び受信contextに一致させる。
6. Initiatorは`t4`を記録し、responseを検証する。`Response.extensions`のcontextが最初のhandleと一致することを確認し、ResponderのDeviceId、期待Soul/Body、両endpoint、nonce、署名、lease、trust epoch及び時刻区間を検証する。第14章のRTT、offset interval、不確実性規則は変更しない。
7. Initiatorは同じhandleから同じPOST pathへcomplete要求を送る。`response_hash`、`t4`、導出時刻区間及びcandidate `SessionBinding`を署名してcommitする。Responderはtrusted contextのbinding IDがbegin時点と同じこと、時刻導出と署名が整合することを確認する。
8. 両者は`SessionBindingConfirmation`段階の署名交換とResponderのackを経て`SessionBinding`を確定し、以後の要求へ`session_binding_ref`と必要な`CommunicationHealthAttachment`を付す。確定の時点はack後とする。handshakeの途中の状態だけで通常objectを受理しない。

begin/completeのstageはbody内の明示enumで区別し、queryやHostで接続先を指定しない。候補session及びreplay cacheは有界とし、各Network instanceでpending handshake 64、active application session 256、peer当たり16、proof bundle最大1 MiB、各begin/complete/confirm_binding期限10秒、未完了session TTL 30秒を初期上限とする。session有効期間は最大60秒かつ双方のlease/health/time policyの期限以下とする。operatorがより小さく設定することは可能であり、上限の引上げは別の規範決定とする。これらの上限は、gaia-network transportのpool及び上限（pending handshake、connection、request permit等）とは別のGaia application上限である。

session開始をtransport-online状態だけで認可しない。handshakeが未知又は期限切れproofを必要とする場合、handshake同梱bundle又は明示的clock recovery/既存trust anchorの手続で解決する。汎用private object fetchをpre-handshake例外へ追加しない。

TimeHandshake以前に許されるapplication要求は、既存の最小version negotiation、TimeHandshake自体、許可済み時刻復旧及び秘密/権限/個人データを含まない公開protocol情報だけである。GETであることだけを理由に通常object、proof、private materialを公開しない。

`confirm_binding`段階: HTTP complete応答にはResponderの`SessionBinding`署名を返す。Initiatorは同じhandleからstage=`confirm_binding`、確定`SessionBinding`及びInitiator署名をPOSTし、Responderの検証済みackを受けてから通常要求を開始する。`confirm_binding`はTimeHandshake confirmationの最終binding署名交換としてpre-session許可対象に含める。この署名交換の途中では通常Core Operationを受理しない。ack前のconnection close、timeout又はsignature不一致はcandidateの失効であり、acceptedな通常操作を意味しない。`confirm_binding`のduplicateは同一candidateと同一署名に限ってidempotentに応答し、異なるcandidateで同じ`session_id`を再利用したらreplayとして拒否する。保管済み確定`SessionBinding`のsignature fieldsを新しいsessionの値で上書きしない。begin/complete/confirm_bindingは同じPOST pathでstage enumにより分ける。pending TTL 30秒に全段階を収め、各exchangeの10秒deadline及びproof 1 MiB capを適用する。candidateの`established_at`は検証済みcomplete段階の時刻区間に基づいて固定し、`expire`はその時点から最大60秒かつlease/time policy上限以下とする。署名交換又はackの到着時刻で`established_at`/`expire`を変更しない。ack時点ですでに`expire`を過ぎていれば失効として拒否する。時刻区間の導出又はabsolute time trustが不足する場合、これらの署名交換だけでTemporalHealthを肯定しない。

### 29.4 sessionの継続と失効

各要求についてgaia-coreは、trusted transport contextのlocal/peer DeviceId及びlocal binding IDを`SessionBinding`と照合する。署名済み`SessionBinding`の双方endpoint、scope、protocol version、lease、trust epoch、health及び`expire`も検証する。caller指定headerはcontextの根拠にしない。

QUIC connectionが維持されるdirect/relay切替、relay failover、NAT再binding、path migrationだけでは`SessionBinding`を失効させない。新HTTP stream、各exchangeのlocal TCP接続も同様である。QUIC connection交換、Endpoint再構築、process restart、transport DeviceId変更、Body/authority/trust epoch変更、lease/session expiry、time uncertainty上限逸脱又はpolicy revalidationで新TimeHandshakeが必要になる。

`DeviceHandle`はclose後に新connectionへ追従しない。別connectionへ送られた旧session要求は、binding mismatchとしてstate mutation前に拒否する。失効したsessionの再確立は既存`operation_id`、`idempotency_key`又は`event_sequence`を変更する理由にならない。

unhealthy BodyのGaia要求は第14.8節のallowlistに限定する。generic transport制御の継続を通常objectの生成・配送・同期・受領確認の許可と解釈しない。

### 29.5 REST、WebSocket、CLI

Gaia node間通信とCLI remoteの標準経路はgaia-network上のRESTである。REST pathは既存のCore Operation mappingを使い、Host又はURLのauthorityでpeerを選ばない。loopback REST receiverはnetworkのreserved pathを上書きしない。

WebSocket APIはlocal又は明示的managed HTTPS/WSS frontendのinterfaceとして提供する。独自のversion negotiation、TimeHandshake、SessionBinding、reconnect及び認可規範を持ち、同一gaia-core dispatcherを使う。gaia-networkはUpgradeに501を返し、WebSocket tunnelを提供しない。managed frontendのTLS又はWebSocket接続の成立だけでGaia authorityを認めない。

`operation.subscribe` / `operation.unsubscribe` / CLI watchのnode間相当機能は、`GET /v1/operations/{operation-id}/events`の有限pollingで実現する。events queryに`after_sequence`と`limit`を用い、`limit`は1..256、既定64。応答は既存canonical `OperationEvent`の昇順batchであり、`next_sequence`と`has_more`を添える。即時応答を標準とし、無期限long-poll、SSE又はstreamを必須にしない。poll要求は各request deadline/body cap内で完了する。poll gap後は同一event sequenceから再開し、重複を`event_id`で除去する。event履歴を取得できない場合は既存object/checkpoint proofから再同期し、架空のeventを補わない。

frontend WebSocketのevent push、REST polling、CLI表示は同一`OperationEvent`列を提示するだけである。adapter固有context、実際の時刻測定及びtransport binding IDは異なり得るが、同一の正規操作と検証済み同等contextに対するcore受理、reject、状態遷移、object hash、external intent、idempotency及びfinality意味論は同じでなければならない。

gaia-networkからlocal RESTへの内部TCP hopは、認証済みpeer requestの転送である。このhopでpeerとのTimeHandshakeを再帰的に開始しない。直接local/remote CLIが別process daemonを呼ぶ場合のTimeHandshake要件とは区別する。

### 29.6 大きなobject、保存、広告配送

networkのrequest/response body既定64 MiB、hard maximum 1 GiB、absolute及びidle deadlineを守る。objectやbackup全体の大きさがこれを超えても、無制限buffer、任意TCP、WebSocket、raw QUIC public APIへ逃げない。

Gaiaの既存`EncryptedFileManifest`及びchunk/fragment/stripe構造に従い、有限のobject/chunk/range GET又はuploadを複数exchangeに分ける。実装は要求側/応答側のconfigured cap内に各exchangeを収める。offset/lengthをchecked整数で検証し、negative、overflow及びobject範囲外を拒否する。ciphertext hash、manifest hash、Merkle proof及び最終object hashを上位で検証する。64 MiB等のtransport capをmanifestの暗号chunkサイズ又はGaia object canonical形式に置き換えない。

HTTP成功、body transfer完了、QUIC ACK、relay転送、tag発見は`StorageReceipt`、`StorageAudit`成功、広告配達receipt又は購入履行ではない。durable write、fsync、metadata commit、ACL及び上位receiptの既存条件を保存する。途中uploadは副作用を生じ得るため、rollbackを輸送層に約束させない。

Gaia application mailbox及びforum inboxは上位の保存・認可サービスであり、Iroh relayはoffline配送を実装しない。広告対象の認可と受信opt-inはGaia上位が判定する。endpoint発見とonline表示だけで`DeliverableTargets`の完全性又は配送成功を主張しない。

### 29.7 Discoveryとインフラ

known DeviceIdの解決はPkarr、exact-tag候補発見はsigned peersを用いる。`AssetDiscoveryRecord`、`ForumDiscoveryRecord`、`DiscoveryIndexManifest`等の上位indexはGaiaの署名・checkpoint・proof規範を維持し、networkのtopic検索と区別する。秘密のSoul属性、非公開recipient、eKYC情報をDHTへ入れない。

bootstrap/relay system tagは稼働roleの自己記述であり、operatorの資格、料金、reliability又はeconomic eligibilityを証明しない。relay URLを自動採用しない。caller/operatorの明示的`RelayGrant`と必要な外部交渉で許可する。初期の許可済みrelay経路又はout-of-band provisionが必要であり、未許可relay自体を使ってその許可を取得する循環を作らない。

bootstrap server、relay/QAD server、Gaia Bank provider、application control endpointは別roleである。同一process配置は可能でも、責務・鍵・上限・health観測を区別する。control endpointがsystem tagを広告するのはrole稼働中だけとする。

`RelayAdmission`のopaque bearer tokenはGaia authorityの代替ではない。外部verifierへのnumeric loopback POST、deadline、call cap及びfail-closedは第28.28.4節に従う。このPOSTはoperator内の認可bridgeであり、通常のGaia operation sessionではない。そこでGaia署名objectを認可根拠にする場合、その検証はGaia規範を適用する外部verifierが担当する。

DHTのread-only device役割、独立bootstrap、signed-peer対応、mutable address retention、relay token API又はruntime relay更新が上流で実現できない場合はdependency incompatibilityとして扱う。勝手なpublic network fallback、server promotion又はtoken無視を認めない。

### 29.8 不確実な結果とエラー境界

`NetworkError`はtransport層の失敗、`ProtocolReject`はGaiaの拒否、HTTP statusはexchange応答である。三者を同一型又は同一成功条件として扱わない。network生成の400/413/431/502/503/504又はresetに、Gaiaが実行していない署名済みreceiptを偽造して付けない。

`NotSubmitted`はapplication request bytesをtransportへ渡していないと証明できる場合だけである。それ以外の不確実な失敗は`Unknown`。`Unknown`は未実行、失敗、cancel、rollback又はもう一度実行してよいという意味ではない。

gaia-networkはsubmitted requestを自動再試行しない。Gaia上位が再接続後に結果照会又は明示再試行する場合、新sessionで既存`operation_id`/`idempotency_key`を保持し、coreの重複判定とcommitment整合を検証する。`SessionBinding`が変わっただけでlogical operationを新規生成しない。accepted済みoperationはHTTP request deadline、response body drop又はnetwork shutdownで暗黙に取り消されない。

新sessionの現在の`session_binding_ref`及びtransport証拠は認可用execution contextであり、logical operationの業務payloadのidempotency commitmentとは区別する。同一`operation_id`の実質payload変更は既存idempotency衝突として拒否する。再送時に古いrequest署名のfieldをin-place変更せず、現sessionを参照した有効な新request署名を作り、同じlogical intentへcoreが正規化する。

logical intentの正規化を次に定める。session再確立でrequestのtransport証拠が変化するだけで、同一logical operationが別業務要求にならないようにする。

```text
LogicalOperationIntent = canonical projection of CoreOperationRequest:
  operation_id
  operation_kind
  protocol_version
  request_version
  requester_soul_id
  requester_incarnation_id
  requester_authority_pubkey
  authority_operation_header_ref
  idempotency_key
  submitted_at
  target_forum_id
  pre_state_checkpoint_ref
  payload_kind
  payload_ref
  inline_payload
  required_object_refs
  required_proof_refs
  external_session_refs
  requested_completion_mode
  expire

logical_intent_commitment =
  GaiaHash("gaia:logical-operation-intent:v1"
           || canonical_encode(LogicalOperationIntent))
```

`session_binding_ref`及びrequestの現在の`signature`のみをprojectionから除外する。他のfieldを勝手に更新可能にしない。再試行は同一のlogical intentを保持し、現`SessionBinding`を載せた新request全体に署名する。expired logical operationをsession更新だけで延命しない。

`request_commitment`は署名対象request全体のcommitmentとして保存し、各attemptで異なり得る。これと`logical_intent_commitment`を別名で扱う。`CoreOperationReceipt`又はoperationに付帯する既存metadataへlogical intent commitmentを明示し、idempotency判定は既存のidempotency scope、`operation_id`及びこのcommitmentに対して行う。新規receiptの追加fieldは`logical_intent_commitment: Hash`とし、そのreceipt署名対象に含める。保存済みreceiptのbytesを変更せず、旧receiptの検証をこのfieldの欠如だけでretroactiveに無効化しない。保存objectの現セッション受理には現在の認可を別途要求する。

`AuthorityOperationHeader`は同じ業務操作のものを保持し、新しいauthority operation sequenceを消費して二重の業務操作にしない。request署名の取り直しだけでoperation chainを進めない。bodyが現sessionに対して有効でも、payloadが変わればidempotency衝突で拒否する。

同一の完全request bytes・同一sessionでの再試行は、当然`request_commitment`も同じである。別sessionでも同一intentなら、最初にacceptされたoperationの正規receipt/event列を維持し、新attemptの認可証拠及びattempt commitmentを監査metadataへ記録するだけとする。accepted operationの元receiptを、新しいattemptの`request_commitment`で上書きしてはならない。

この明示化はsession接合に必要な範囲だけに限り、Stripe event id、provider idempotency、business payload hash、requester+asset nonce等の既存operation固有scopeを変更しない。`LogicalOperationIntent`は独立署名objectではなくcanonical projection型である。第22章の構造化field型一覧と`CoreOperationReceipt`定義を同時に一致させる。

### 29.9 不変条件と証拠status

- 認証済みDeviceIdはGaiaのSoul/authority認可を単独で含意しない。
- `SessionBinding`は現在のconnection binding、両endpoint、ML-DSA-65 transcript及び有効なleaseへ結び付く。
- QUIC connection交換では旧sessionを再利用できず、同一connectionのpath移動だけではsessionを移植又は交換しない。
- DHT tag/descriptor/relayによる自己記述は権限・容量・支払い・finalityの証拠ではない。
- Transport配送完了はdurable保存又は上位operation finalizationを含意しない。
- 有効な保存済みGaia objectのオフライン検証は通信経路の変更に依存しない。
- 全通常state mutationはgaia-core dispatcherを通る。
- networkの有界資源、deadline、no replay、秘密非記録の規範をGaia adapterもすり抜けない。

上流source監査及びローカル正確性試験は実装完了のゲートであり、実施していなければNOT_RUN/AUDIT_PENDINGとする。大規模試験と巨大ネットワークの成功保証は本仕様の実装完了条件ではない。第28.32節の式は容量計画モデル、第28.34節G2〜G4は参考基準であり、実証又はSLOではない。
