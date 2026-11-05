# doors 完全設計書 — 単一正本

本書単体で設計契約を完結。別JSON/CSV/旧RFC/README/チケットの結合不要。型定義、既定値、処理手順、全操作、全protocol、状態遷移、失敗補償、試験oracleを本文収録。MUST=必須、R<T>=Result<T,DoorsError>、T?=optional、[T]=順序配列。専門語・型共有・固定写像で圧縮、契約を「後で定義」に置換しない。正本順序=確定判断表＞専用条項＞共通規則。本書の設計規定と実装VERIFIEDを区別。未列挙の引数組合せはInvalidArgument、状態組合せはInvalidState、副作用0。

## 01 スコープ・crate・型規則

名称doors、UA doors/<version>、binary doors、設定~/.doors/config.json、DB~/.doors/data.db、環境DOORS_。音声SIP UA、複数account/transport/call、PCMU/Opus、DTMF Inband/Info/Rfc4733送受、ICE/STUN/TURN/TLS/SRTP、任意音源mix/pair tap/WAV、Rust library＋単体ヘッドレスsoftphone。GUIなし、CLI/REST/WebSocket/gRPCクライアントとして外付け。非対象SIP server/PBX/video/独自RTP/課金。

workspace crates/{doors-core,doors-operation,doors-cli,doors-rest,doors-websocket,doors-grpc,doors-conformance,pjsip-prebuilt}。末尾は独立build支援package、実行7crateへ非依存。依存adapter→operation→core、conformance→全公開境界、core/operation→Axum/adapter禁止。core=model/config/error/id/state/runtime/backend/ffi/audio/device/auth/persistence、operation=全handler/context/sequence/job/stream/validation/authorization/補償、adapter=decode/認証context抽出/invoke/encode/transport。全sequence stepの実装をoperationへ集約；memcpy/lock等はcore primitive、業務操作とは区別。adapterからnative/core直呼出し禁止。

REST/WS=Axum0.8系列、Router/Handler/Middleware/SSE及びWebSocketUpgrade。patch Cargo.lock固定。同listener Router統合と個別起動双方、共通Runtime共有。gRPC=tonic/prost、CLI=clap、serde JSON、device=CPAL、resample=rubato、SQLite=SeaORM＋SQLx、FFI=bindgen。schema/protocolの型は本書完全protoとbusiness constraintsを正本、別レジストリ不要。

初期baseline Rust1.95/Tokio/PJSIP2.17.0、Windows x86_64 MSVC/macOS arm64/Ubuntu x86_64。想定30同時通話/max_calls32、100account/300call級は適用外。版の実在/build成立を捏造せずmanifest＋CIで検証、PJSIP patch互換試験後/minor設計変更。features serde/metrics/tls/srtp/cpal-input/pjsua-native/persistence/test-support。実行binary既定native+device+persistence+serde、libraryはserver/DB/device暗黙起動なし。native無しinitialize Unsupported、本番mock fallback禁止。TLS feature無しはRust TLS variant cfg非露出、wire TLS要求InvalidConfig、SRTP Optional/Mandatoryも整合検査。

型：primitive Bool/U8/U16/U32/U64/I8/I32/I64/F64/String/Bytes/Id/Secret/BearerToken。Rust bool/u8/u16/u32/u64/i8/i32/i64/f64/String/Vec<u8>/型別NonZeroU64/zeroizing secret/token。JSON U64/I64/Idは十進文字列、他整数number、F64 finite、Bytes padded Base64、enumは掲載名、union={kind:Variant,value:TypedRecord}、record snake_case。未知field/enum/variant拒否。Secret Debug/通常Serializeは常時***REDACTED***、その文字列自体は入力資格情報として拒否。BearerTokenは認証成功応答だけ実値、log/cache/Debug redacted。snapshot/exportの資格情報はredactedであり更新requestへ再投入不可。

proto field番号は本書固定、削除番号reserve/改番禁止。scalarをoptional宣言してpresence検査可能にし、各message末尾business_optionalに列挙したfield以外は必須（repeated省略は[]正規化）。enum0はUnspecifiedでrequired時拒否、narrow注記のId非ゼロ/U8/U16/I8範囲も検査。message未指定はbusiness_optionalでなければ拒否。JSONにも同一presence規則。設定だけ既定値補完後検査。

Doors::new(RuntimeConfig,ClientConfig)->Future<R<Doors>>、execute(&self,Context,OperationRequest)->Future<R<OperationResponse>>、open_stream同request→R<StreamHandle>、typed methodは全RPC相当名。全操作async R<T>、値accessorだけ例外。Doors/AccountHandle Clone+Send+Sync、native本体にunsafe Syncを付与しない。StreamHandle.recv→R<Option<ReceivedItem>>（None正常EOF/Err異常）、send→R<ack>、close→R<()>、単一reader lease、方向不適合InvalidState。library OwnedSource(Box<ErasedAudioSource>)はSourceSpec Uploaded相当のfeedへ接続、trait objectをserializeしない。

## 02 DEFAULT・validation・patch

Runtime default：UA doors/<version>,Log Info,max_calls32,control容量2048,raw4096,admission4096,native_event_queue8192,transports UDP0.0.0.0:5060＋TCP同5060,STUN/TURN空,ICE enabled/aggressive true/trickle/renomination false/host16。audio delivery16k/i16/StereoInOut/20ms,pair120ms,jitter60ms,mixer20ms,sources16,quality High,RTqueue64frame,tap_stall5000ms。raw enabled/include_bodies/redact_authorization true,body65536byte,message131072byte。timeouts command10000/shutdown15000/register15000/invite90000ms、DTMFestimate500/tone160/gap70ms、reconnect base1000/max60000ms/jitter0.2。

Client default：tenant_id必須、delivery/max_calls/default_accountなし（Runtime継承）。Server：127.0.0.1:3910、gRPC127.0.0.1:3911、DB~/.doors/data.db、config_fileなし、origins[]、auth LocalhostOnly/JWTexpiry3600sec/issuer doors/audience doors-api/keyなし、connections256/request/WSmessage各1048576byte、startup Strict、file_roots[~/.doors/media]。library db_path=None。初回local tenant=予約1、他tenantはadmin Client設定時のみ付与、token由来以外のtenantを信頼しない。

Account：username/domain/password必須、display/authname/registrar/max_calls/autorejectなし、proxy/contact/headers空、transport Any、register_on_start/allow_outbound_without_register true、expires300000ms、PCMU/Opus true、Opus24000bit/s,complexity5,CBRfalse,FECtrue,DTXfalse,ptime20ms、DTMF全送受/既定Rfc4733、media SRTPDisabled/ICEtrue/VADfalse/EC200ms/INOUTgain0dB、auto_answer_referfalse。registrar未指定sip:{domain}導出。call media earlytrue/srtp未指定/codecs[]/policyPreferOpusFallbackPcmu、source gain1/mutefalse/master1、tap Realtime/Pair。

設定merge default<file<DOORS_CONFIG_JSON<CLI明示option。DBは保存account復元元、起動明示値優先。DOORS_API_KEY/DOORS_JWT_SECRET/DOORS_DB_KEYはsecret fieldへ安全注入、password/token argv禁止。file JSON/YAML1.2→同schema、file最大1MiB。保存時secret平文export禁止。

VAL1 username/domain/password非空UTF-8、password<=4096byte、SIP/SIPS URI<=4096、header名token/値CRLF禁止/総65536byte、proxy/contact parse。STUN/TURN各<=16かつnative上限以下、非対応長さ黙って切詰め禁止。registration expires>0/1000ms倍数/u32秒以内。
VAL2 event>=16、raw有効時raw>=event、admission/native queue>=64、sources1..16、max_calls1..native compile limit、Client/account上限Runtime以下、tap capacity1..65536。Lossless推奨>=5秒（20msなら250frame）。buffer満杯・容量不足は明示error。
VAL3 rate8/16/24/48k、I16/F32、frame_ms10/20/40/60、rate*frame_ms/1000整数、pair>=frameかつmixer frame整数倍、jitter>=frame、RTqueue>=4、lineargain0..64有限、dB -96..36有限、EC0..500ms。PCM f32[-1,1]finite、integer overflow/NaN拒否。
VAL4 codec少なくとも1、Opus bitrate6000..510000/complexity0..10/ptime10,20,40,60、DTMF送受各>=1/default送信集合内、digits1..256・0-9A-D*#（a-d正規化）、tone/gap40..2000ms。TLS cert/key対、verify true、SRTP/feature整合。trickle/renomination非対応要求Unsupported、fullICE必須。
VAL5 SocketAddr parse、同transport同bind重複拒否（UDP/TCP同5060可）、LocalhostOnly外部bind拒否、API/JWT key32byte以上、JWTexpiry60..86400sec、DBkey32byte、secret file Unix0600相当/Windows所有者ACL、timeout>0。
VAL6 patchはentries[{path:JSON Pointer,action:Keep/Set/Clear,value_json?:単独field JSON UTF8 bytes}]、Keep value無し/Set型一致/Clear optionalだけ、重複path拒否。accountは全設定field（Id除外）、runtime mutableはlog/raw.enabled/DTMFtimer/reconnect/将来購読用bus容量、transport/max_calls/clock変更Conflict再起動要求。Client delivery/max_callsは更新可、既使用量未満Conflict。clone→patch→全validate→native→DB→snapshot、失敗補償§04。

## 03 Reactor・ID・state・queue

Runtime一個/process、専用OS thread内current-thread Tokio。PJSUA thread_cnt=0、Reactorがpjsua_handle_events(0)を1ms tickでpoll、native media clockは別thread。全native control APIをReactorに固定、user/task/workerから直接呼出禁止。native thread登録初期化時実施。User→unbounded MPSC RuntimeCommand＋oneshot、入口semaphore4096で未完了数制限、fullはdeadline待ち又はResourceExhausted。Reactor自身のcommand enqueue→同期wait禁止。

1巡=due timer最大64→command64→native capture64→state/publish→nativepoll→yield、job待機でpoll停止禁止。native event queue8192固定entry、signal snapshot pool8192、raw pool256×131072byte（32MiB）、PCM IN/OUT各64slot/call、最大48k60ms=2880i16sample/slotを事前確保。callback queuefullはatomiclost/resync flag、await/lock/alloc/log無し。Reactorがnative全snapshot再照会、喪失結果はUnknown/Gap、成功捏造なし。

state owner=Reactor直接mutable、snapshot Arc immutable watch。外部RwLock必要時read().awaitのみ、blocking_read禁止。RuntimeState={phase,epoch,config,clients,accounts,calls,transports,capabilities,revision,jobs,timerheap,bimap,tombstones,plans}、AccountEntry={id,native,config,registration,desired,expiry,last_result,db_id?}、CallEntry={id,native,generation,account_id,direction,invite,media,transfer,public_state,last_status,error,times,worker?,ports?,timers,terminal_emitted}。

全resource IdはRuntime内共通u64counter、0禁止/再利用なし/wrap ResourceExhausted。native Idは別型、0を無効扱い禁止、invalid値はnative header、未設定Option。CallToken={id,epoch,generation}をnative user_dataへstable参照、make_call前にpending tokenを登録し同期callbackを捕捉、native callslot再利用時generation増分。incomingはnative accountを解決してentryを先に作成→通知。遅着は世代tombstone照合、owner不明を全Clientへfallback禁止。callback pointerをscope外保持せずowned snapshot又はnative側参照寿命付きopaque handleだけ。

NativeEvent→EffectPlan{expected_revision,changes,events,native_effects,timers}、applyはrevision一致＋invariant→state/index→revision++、publishはcommit済token一回/event_sequence採番。async native effectはPendingJobでcontinuation、返却PJ_SUCCESSだけで完了扱いしない。snapshot/queryは同revision、terminal call60秒/max4096、job10分/max10000、resource tombstone60秒。上限超過は古い完了entryだけ退避、進行jobを黙って破棄禁止。

subscribeはReactor内receiver登録→snapshot/barrier→snapshot先送→revision>barrierだけ配送、<=barrier buffer重複除外。capabilityはinitialize応答/query/snapshotで取得、一回ClientInitialized待ち禁止。RuntimeConfig初回固定、不一致Client接続Conflict。Client別tenant/bus/resource index。client.shutdownは自区画、runtime.shutdownはadmin。last handle dropはbest-effort enqueueだけ、gracefulは明示shutdown。init失敗逆順rollback→thread回収→新epochで再試行。

## 04 共通実行・transaction・job・error

Invocation={wireContext,verifiedPrincipal,PeerInfo,systemLease?}はsealed、Contextにprincipal/leaseを入れさせない。順序decode/size→認証→scope/tenant→所有権→deadline/admission→型/状態→冪等照合→resource予約→実行→commit→publish→reply。context省略ならUUIDv7 request_id生成、指定時request_id必須ASCII32..128、idempotency/traceも同範囲。認可前副作用0、他tenant対象はNotFound、自己対象権限不足PermissionDenied。

全mutationのbefore/desired/EffectLogを保持。native失敗旧state維持、native成功DB失敗はbeforeへ逆順native補償、補償失敗OutOfSync+隔離+repair_job、partial detailsにcommitted IDs/before/current revision/repair ID、messageparse禁止。DB transaction中network待機禁止。DBとSIPの分散atomicityを保証しない。repairは元jobのrollback-to-before policyを第一選択、不能は隔離継続・明示管理再適用、勝手にdesired採用しない。

read自然冪等。create/send/transfer key=(principal,Client,OperationId,key)、canonical request hash一致は同job/結果、別payload Conflict、結果10分/max10000完了entry。再起動越exactly-onceなし。未着手deadline Timeout副作用0、native受理後caller取消は処理継続/照会可能、Pending job.cancelはCancelled、Running取消可能点へ要求、native不可逆Conflict＋継続、結果不明Unknown。accepted≠connected/completed≠remote received。

DoorsErrorはcode/domain/native_status/sip_status/対象ID/retryable/detailsを分離、secret-free。native!=SUCCESSはNativeFailure＋domain、SIP4/5/6xxはSIP値を保持、認証Unauthenticated。temporary network retryable true、validation/auth false、Retry-Afterはpolicy。正常stream閉鎖EOF、異常Unavailable/Channel。旧AlreadyInitialized→Conflict/NotInitialized→InvalidState/AccountNotFound・CallNotFound→NotFound/各TransportInit・Registration・Invite・MediaInit・ICE・TLS・SRTP・DTMF失敗→NativeFailure＋domain/AudioFormatUnsupported→Unsupported/AudioPipelineBroken→Unavailable/ShutdownInProgress→ShuttingDown。

FFI extern境界catch_unwind、Cへunwind禁止。callbackはfault tokenのみ、Reactor resource gate→Error→hangup/unregister/disconnect/remove、cleanup個別保護。global破損/隔離不能はRuntime Failed→停止。callback寿命不明poolはleak隔離、cleanup_leaks>0なら新call停止、native destroy/RTjoin後回収。他call無影響/完全回復の無条件保証なし。

## 05 登録・通話の全状態遷移

RegistrationState=Disabled/Idle/Registering/Registered/Unregistering/Failed/Expired、desired_enabled/last_result/online_statusは独立。register_on_startは追加/復元/更新で消費。登録200かつexpires>0だけRegistered、expires0成功は解除、401/407 challenge途中を失敗にしない。pjsua_acc_get_info照会はReactor、callbackで直接public state更新しない。native refresh第一主体、doorsは失敗後backoff補助だけ、二重refresh抑制。

|現在|register|unregister|enable(false)|成功callback|失敗/期限|
|---|---|---|---|---|---|
|Disabled|Registering|冪等|Disabled|開始jobに限りRegistered|開始job失敗Failed|
|Idle|Registering|冪等|Disabled|開始jobに限りRegistered|同上|
|Registering|同job join|後続FIFO|desired=false/後続解除|Registered→後続|Failed→後続|
|Registered|refresh,state維持|Unregistering|Unregistering|期限更新/Updated|refresh失敗は有効期限までRegistered、後Expired|
|Unregistering|後続FIFO|join|desired=false|Idle又はDisabled|Failed、旧binding情報保持|
|Failed|Registering|bindingあれば解除/なければIdle|解除後Disabled|開始jobのみRegistered|retry policy|
|Expired|Registering|Idle|Disabled|開始jobのみRegistered|backoff|

逆操作FIFO上限64/account、重複join。register()戻り値はnative受理、状態成功とは別。unregister()だけはdesired維持/Idle、enable(false)は解除後Disabled。Account削除はgate→関連call（forcefalseならConflict）→unregister待ち→native del→DB→index/tombstone→Removed。未登録発信はallow_outbound_without_register true時だけ、登録成否を発信認可と同一視しない。

CallState14=New/Calling/Trying/Ringing/EarlyMedia/Incoming/Connecting/Active/Held/Transferring/Disconnecting/Disconnected/Failed。内部invite/media/transfer別。導出優先=終端>Disconnecting>Transferring>Held>Active>Connecting>EarlyMedia>Ringing>Trying>Calling/Incoming>New。

|契機|許可前状態|確定更新/イベント|例外|
|---|---|---|---|
|make受理|New|Calling/OutgoingCallStarted|native拒否Failed、予約解放|
|100|Calling/Trying|Trying/Trying一回|遅い100で逆行しない|
|180|発信進行|Ringing/Ringing|media確立済ならEarlyMedia優先|
|183+media|発信進行|EarlyMedia/MediaActive|earlyfalseは再生せず観測|
|native着信|未知call|Incoming entry作成後IncomingCall|同世代再通知なし|
|answer180/183|incoming未最終|provisional、183SDP許可|outgoing/最終後InvalidState|
|answer200/受信2xx|接続前|Connecting|Connected発火禁止|
|CONFIRMED|非終端|Active/Connected一回|重複無event|
|media local/remote hold|confirmed|各flag/Held/CallHeld|命令受理だけでHeld禁止|
|hold→ACTIVE|Held|残hold又はActive、Resumed+MediaActive|初回ACTIVEはResumedなし|
|REFER開始|Active/Held|Transferring|並行転送Conflict|
|NOTIFY final|Transferring|成功/失敗通知→前Active/Held|failureで元call切断禁止|
|hangup/CANCEL/BYE|全非終端|Disconnecting→Disconnected|終端hangup冪等|
|486/603/最終4xx5xx6xx|接続前|Failed＋DisconnectInfo|CallRejected廃止|
|transport断/timeout|非終端|query→Failed又は切断|native状態捏造禁止|

100/180省略200等許可、単純直線遷移を強制しない。native symbol NULL/CALLING/INCOMING/EARLY/CONNECTING/CONFIRMED/DISCONNECTED、数値手書き禁止。EARLYはSIPcode/media併用。terminal event最大1、FailedもCallDisconnected{terminal_state=Failed}、CallCancelledは意図/結果で終了通知代替ではない。HangupReason/SIP code/initiator/duration保持、duration単調時計差。incoming auto reject timer設定時のみ、最終応答/切断でcancel、answerと競合は先commit勝ち。max_callsはnative/Runtime/Client/account全予約を一括実施。

Blind REFER送信pjsua_call_xfer、NOTIFY finalで完了、成功既定元call維持。manual受信は同期callbackをasync待機させない：REFER専用native moduleがdialog/transaction-owned requestを保持、pjsip_xfer_create_uas/accept/notify/send_requestで202＋NOTIFY100→ReferRequest→30s以内respond、trueでtarget発信＋NOTIFY180/200、false603、timeout408 terminated。通常native自動REFERと二重実行させずmodule消費。生rdataをRustへ保存禁止、C側clone/transaction参照lifetime管理。auto_answer_referも同URI/認可policy。attended/Replacesはcapability依存、未対応Unsupported。

## 06 SIP・codec・network・native設定

Account native configはpjsua_acc_config_default後、id=sip:username@domain、reg_uri=registrar、cred=(realm='*',scheme='digest',auth_username又はusername,plainpasswd定数,password)、proxy/contact/headersをnative pool複製。display name quote escape、expiresはms/1000の正確秒変換。call.auth_overrideはaccount全体credentialsを変更せず登録無効temporary native account cloneをcall lifetime保持、nativeacc→元論理account alias、終了後削除、容量事前予約。auth用一時accountはAuthJob専用・一般一覧非露出・着信486。

codec PCMU/Opusのみ、起動Opus255/PCMU254/他0。明示preferred_codecs非空はaccount許可集合との一致を検査、指定集合/順序だけ提示、空auto Opus→PCMU。call毎global priority変更禁止。同期on_call_sdp_createdは事前計算immutable policyで既存SDPのfmtとrtpmap/fmtp/rtcp-fbをin-place filter/reorder、telephone-event保持、video/text無効。新属性はcall準備時pool確保、hookでlock/await/Rust alloc禁止。offer/answer両方適用、合意なしCodec error。PCMU8kmono、Opus RTPclock48000/実合意channel、decoded bridge PCMとdelivery rate別。bitrate/complexity/CBR/FEC/DTX/ptimeは実codec paramへ反映、未対応field要求を黙殺禁止。

transport全件pjsua_transport_create、configdefault後bind/TLS代入、IDはbackend。Require/override一致なければ拒否、Prefer一致優先なければnative既定。UDP接続概念なしCreated、socket障害Error→bind retry。TCP/TLS callback状態通知。再接続min(60000,1000*2^attempt)ms×uniform(0.8,1.2)、成功reset/停止cancel、test RNG固定seed。複数IF/IPv4/IPv6、routing OS委譲。DNSはnative SRV/NAPTR、候補/TTL/result wrapper観測、別Rust DNS結果で捏造禁止。

TLS verifytrue、CA/hostname/server_name検証、client cert/key反映、fingerprint/subject/issuer/expiry/verified通知。証明書reloadは新transport→新登録→既存call drain→旧close、失敗旧維持。external APIもTLS又は明示trusted loopback proxy、非loopback平文既定禁止。signalling TLS≠media暗号化。SRTP Disabled/Optional/Mandatory、Optional clearfallback明示、Mandatory失敗拒否、SDES/DTLSは実build capabilityのみ。

STUN配列全件nativeへ、TURNは順位配列からnative active一件を選択、call確立時固定、失敗時次候補でmedia transport再作成、既存callへ無断設定変更禁止。native C shimでactual media/account fieldへICE/TURN反映、推測fieldを作らない。full ICE必須、trickle/renomination optional、未対応要求Unsupported、host16。selected candidates/relay/active-standbyを観測、STUN binding/TURN allocate成功だけでRTP疎通合格禁止。

## 07 callback・FFI・bridge・RT寿命

raw binding生成専用、safe wrapperが全status/enum/長さ/ownership検査。PjOwnedStrはbyte owner+pj_str_t、allocation安定、cloneでptr再構築、native保持期間poolcopy又はowner延命。native poolをRust-ownedとしてfree禁止。公開native pointer/Instant/conf_port IDなし。call ID→native IDはReactor、native→conf slotはbackend（get_conf_port又はcall_info.conf_slot）、invalidはInvalidState。

callbacks：incoming/reg_started/reg_state2/call_state/media_state/dtmf_digit2/tsx/redirect/transfer_status/replaced/nat_detect/transport/ice_error/conf_op_completed/sdp_created。通常owned固定snapshot/token enqueueのみ、lock/alloc/await/logformatなし。SDP同期変換とREFER C-shimだけ同期policy例外、pointerを後段へ渡さない。redirect既定STOP、targetイベントで観測、認可済policyの明示再発信以外自動追従禁止。

PJSUA sound autoopen無効、pjsua_set_null_snd_devでdevice無しでもconference clock駆動。bridge48000Hz mono20ms/conf thread1、maxconfports=1+3*max_calls+16（32→113）、CPAL deviceは独立。各call capture custom port(callslot→capture)/inject port(inject→callslot)、callslot含め3。Bothは2edge。add/remove/connect/disconnectは受理≠完了、on_conf_op_completed又は確認queryでjob完了まで追跡、PJ_SUCCESSだけでpool解放禁止。

ensure_ports keyed(call,media_generation)、Initialize時空mapを登録して完了扱い禁止、source/tap追加・media activeでensure、reINVITE slot変化で再接続、二重port0。RTslot={sample_index,mono_ns,n_samples,pcm:[i16;2880],flags}、free/filled index ring。get_frame=OUTslot→size/type検査→memcpy、emptyzero、freeindex返却。put_frame=free取得→INcopy→filled、fulldrop/counter。RT ingressは最新保持保証なし、tap Realtime ringだけoldest-drop保証。

RTでVec/Box確保/拡張/解放/最後Arcdrop/lock/await/syscall/log禁止、slotindexだけ受渡。callback ABIはpj_status_tとbindgen完全一致、正常zero/dropはPJ_SUCCESS、過大buffer安全無音化＋エラー。transmuteで型不一致を隠す禁止。close atomic→edge disconnect完了→portremove完了→inflight0→poolfree、timeout時leak隔離、早期解放禁止、RTjoin後回収。存在しないconf_set_callback/on_rx_msg/get_media_statusに依存禁止、media statusはcall_info。

raw module rx/tx request/responseは観測非消費（rx PJ_FALSE/tx PJ_SUCCESS）、REFER専用だけ消費。Raw SIP callback最大131072byte slot copy、parse/redact/public publishはworker。queuefullcounter＋resync、native状態イベント喪失時queryで回復、未知結果成功偽装禁止。native制御threadはReactor、callback再入はpending tokenへ保存、state二重borrowしない。

## 08 音声・source・mix・resample・pair・device・WAV・DTMF

AudioFrame.pcmは実interleaved format、Pair各chunk mono同sample長、stereo最終L=IN/R=OUT、Mono pairも方向を混ぜない。i16LE/f32LE、i16→float=x/32768、float→i16=round ties-even(x*32768) clamp、NaN/Inf拒否、clip統計。native codec PCM/bridge48000/delivery8/16/24/48kを分離。

source trait `fn next_chunk<'a>(&'a mut self,&'a mut[i16])->impl Future<Output=R<SourceRead>>+Send+'a`、SourceRead{samples:usize,eof:bool}、0/!eof一時欠損、EOF別。ErasedAudioSourceはPin<Box<dyn Future<Output=R<SourceRead>>+Send+'a>>のobject-safe wrapper＋blanket impl。SyncAudioSource同R<SourceRead>、SyncSourceAdapter blocking pool。source Box排他、一consumer、Arc並列pull禁止。sourceごとprefetch ring4frameとtask、slow sourceは期限無音で他sourceを待たせない。

call worker一個async、source table slab16、command次frame原子反映/applied_frame ack。IN=local受話mix、OUT=相手送話、BOTH一pull後fanout、RawInbound不変。gain適用i32 source→sum（16*64*32768<2^31）→master f64→clamp i16、normalizationなし。mute中timeline/EOF消費、replace新準備成功後sameID generation swap、remove待機task取消。logical mixer frame10/20/40/60ms、native20msはworkerchunkerで960sampleへ分割/結合、INもlogical窓へ再構成、RTcarry/resampleなし。

resample rubato SincFixedIn<f64>、High sinc_len256/oversampling128、Medium128/128、Low64/64、cutoff0.95/BlackmanHarris2/Linear interpolation、ratio=out/in、入力chunk20ms、端数carry/outputFIFO、指定frame再packet化。output_delay取得しtimeline補正、flushzeroでfiltertail後validsampleだけ出力。rate途中変更は新stream。CPAL drift補正occupancy target2frame/5秒時定数/±200ppm。clock anchor=Instant/SystemTime起動pair、1秒比較でwall差>100msならclock_epoch++、monotonic/sample順は不変、unixanchor更新をcontrol通知。

PairAligner：IN/OUT ordered sample-index queue、cursor k、窓[k,k+N)へcopy、重複既出切除/遅着drop、両側揃えばpair、片不足はfirst_arrival+pair_bufferまで待ち、timer期限でzero padding/GapInfo/stats、cursor+=N。片側永久欠落もtimerで進行、try_pair永久None禁止。連続欠損5秒MediaError、回復MediaActive。同timestampだけで異sample長をpair化禁止。

Realtime tap専用bounded ring、fullはpopoldest→pushlatest、drop範囲正確、overflowイベント1秒最大1/tap集約。LosslessはRT外best-effort、tap独立pending queueでcallworker停止禁止、stall5秒又は上限で当該tapだけOverflow errorclose、他tap/送受話継続、EOF偽装禁止。capacity録音推奨5秒以上、有限bufferで無限lossless保証なし。

CPAL device list/openとcall attachを分離、mic→OUT、rendered IN→speaker、library暗黙deviceなし、standalone設定で接続、TTS-only可。CPALcallbackもslotcopyのみ、hotplugerrorは該当source/sink隔離、無断default切替なし。AECは実speaker出力をreferenceにworker pjmedia_echo playback→capture、48k/960sample/tail設定、native null sound ECで代替禁止。VADはmic/送話encode前、DTMFtoneに適用しない。dBgain=10^(dB/20)。

WAVread RIFF/WAVE/fmt PCM1又はIEEE_FLOAT3/16又は32bit/mono-stereo、unknown chunk skip＋偶数pad、data/RIFF長検査、stereo file→0.5*(L+R)mono（pair方向再生はcaller direction指定）、read余剰保持/EOF/RT外I/O。WAVwrite i16PCM fmt16byte/f32fmt18+fact、L IN/R OUT interleave、samplecount/byteRate/blockAlign一致。finish data/RIFFsize patch→flush/fsync、4GiB前ResourceExhausted＋partialfinalize（RF64非対応）、diskfull部分byte数報告、next_sample_indexで重複write防止。録音失敗で通話自動切断禁止。

DTMF Inband=row697/770/852/941/col1209/1336/1477/1633Hz、表123A/456B/789C/*0#D。tone=0.25*(sin f1+sin f2)、5msraised-cosineedge、160ms/gap70ms、OUT source。Info=native SIP_INFO/Rfc4733=telephone-event、dial_dtmfをInbandに割当禁止。各桁scheduled、受理後500msはEstimated、source drain等観測源だけObserved、remote受信未保証。index/request対応、即失敗timer0、切断時残Cancelled/Unknown、terminal一回。

Inband検出はdoorsで実装、RawInbound8k/160sample20msHann/Goertzel8freq±1.5%検査、row/col最大binは2位の4倍以上、pairenergy/total>=0.7、RMS>-40dBFS、twist high/low -8..4dB、2frame一致開始/2frame無効終了、同digit release前再通知0。RTP duration更新/END再送はtimestamp+digit dedup、END無更新500msでdurationUnknown終了。同digit±80msはRfc4733>Info>Inband優先、secondary検出は統計保持。音声/雑音falsepositive oracle別記。

## 09 Event・Raw SIP・購読・clock

40payload型はproto全定義。eventはstatecommit後、metaにruntime/client/tenant、関係account/call必須。event_sequence runtime内1起算、revision commit番号、frame_sequence stream内0起算、sample_index通話timeline。event番号をsample範囲へ流用禁止、相関=Runtimeepoch/CallId/StreamId/monotonic clockanchor。Instant非公開、unixnsとmono分離、duration/deadlineはmono、JWTのみwall。

一元発行→Client別control/raw bus、account未解決で全Client配信禁止。global transport/lifecycleはadminだけ、Client関連transportは関係Clientへ同event_idでコピー。rawはSIPCall-ID/transaction/native索引で帰属、未解決はadminglobal。accountfilterはClient分離後、他tenant eventがfilter前に見える構成禁止。control/raw容量独立、rawdisabled queue作成なし/subscribeUnsupported。

broadcast lossy、capacity超GapInfo/count/seq/revision、再送なし、監査課金の真実源にしない。snapshot queryで復旧。購読者0正常、account削除はRemoved→EOF。Subscription openはsnapshotbarrier、closeべき等/dropbest-effort、single reader conflict。native全variantはqueue→reducer→commit→publish、None未実装禁止。

mapping：Incoming→entry/Incoming、RegStarted→Registration phaseBegin、RegState2→native snapshot/query/reducer、CallState→symbol+SIPcode、Media→hold/resume/ensurebridge、DTMF→method保持Received、Transport→stateevent、ICEerror→IceFailed＋MediaError、Tsx→transaction、Redirect→targetpolicy、Transfer→NOTIFY、Replaced→old/newID、NAT/TLS/DNS→metadata、ConfComplete→bridgejob、Fault→Error/隔離。refreshはStateChangedとは別Updated、RegistrationSucceeded等旧専用event廃止、拒否はDisconnectInfo。

RawSipMessage送受request/response全方向、再送もmessageとして観測、original_size/captured_size/truncated明示。Authorization/Proxy-Authorization case-insensitive/folded continuation単位削除、headers/text双方、SDP a=crypto keyも除去。include_bodiesfalseはtextbodyも除去、bodymax65536、全message131072、content_lengthはwire原値、保持長と別。parse不能で安全秘匿ができなければ破棄＋errorcounter、raw原文fallbacklog禁止。native msg_loggingfalse/console0、native level Error1/Warn2/Info3/Debug4/Trace5、どのlevelでもsecret scrub。

## 10 認証・認可・永続化

LocalhostOnlyは実loopback peer/bindのみ無認証、request mode文字列だけでadmin認定禁止。APIkey>=32byte random/hash保存/constanttime比較、rolemapping。JWT HS256 key>=32byte、iss doors/aud doors-api/sub/tenant/scopes/account_ids/exp/nbf/iat/jti/kid、expiry3600sec/skew30秒、alg/kid allowlist→signature→claims、token/secretlog禁止。親scope部分集合発行、無条件sip:allなし。Reader read、Operator自区画read/call/control/audio.read/audio.write、Administrator管理、raw_sip明示。shutdown/DB/device/globalmetrics admin、所有権は全operationで検査。

token発行credentialsは実検証、account存在だけで成功禁止。SIP認証は独立temporary native account(register60sec)→challenge→最終200+expires→unregister/delete、15s、同時auth8、一般account状態を改変しない。username/domain曖昧はaccount_id必須、認証サーバ無しoutbound-onlyはUnsupported/APIkey経路。authtemp着信486。bootstrapはloopback CLI/secretfile、external未認証account追加なし。

WSheader不可clientは一回ticket(random32byte/hash保存/30秒/Clientscopebind)、長期JWTquery禁止。streamにもtoken期限適用。CORS/Originallowlist、無指定crossorigin拒否、Localhostでも悪意Origin拒否。jti失効setは残寿命、logout操作未提供、管理keyrotation/restartで全失効。専用TokenResponseだけBearerToken値返却、通常Secretserializer redacted。externalTLS必須又は明示trustedlocalproxy。

SeaORM+SQLx SQLite、pool4/WAL/foreign_keysON/busy_timeout5000ms、migration checksum/version先検査、復元前migrate。rusqlite不使用。DB Id≠runtime Id、tenant/client_key/db_id mapping、秘密はXChaCha20-Poly1305 envelope(v1,key_id,nonce24,ciphertext,tag16)、AAD='doors/accounts/'+tenant+'/'+dbid+'/1'。先rowID確保→暗号化→commit、masterkey32byteOSstore又は0600file/env、DBと同backupに鍵混載禁止、rotation旧復号→新nonce/keyでtransaction、失敗rollback。config_jsonにcolumn重複key/secret平文禁止。

```sql
PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL);
CREATE TABLE accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT NOT NULL,client_key TEXT NOT NULL,display_name TEXT,username TEXT NOT NULL,auth_username TEXT,password BLOB NOT NULL,domain TEXT NOT NULL,registrar_uri TEXT,transport TEXT NOT NULL DEFAULT 'udp',register_on_start INTEGER NOT NULL DEFAULT 1 CHECK(register_on_start IN(0,1)),allow_outbound_without_register INTEGER NOT NULL DEFAULT 1 CHECK(allow_outbound_without_register IN(0,1)),config_json TEXT NOT NULL,revision INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')));
CREATE INDEX account_owner ON accounts(tenant_id,client_key);
CREATE TABLE tls_configs(id INTEGER PRIMARY KEY,verify_server INTEGER NOT NULL DEFAULT 1,ca_cert_path TEXT,client_cert_path TEXT,client_key_path TEXT,server_name TEXT,allow_insecure_cipher_legacy INTEGER NOT NULL DEFAULT 0);
CREATE TABLE transport_configs(id INTEGER PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN('udp','tcp','tls')),bind_addr TEXT NOT NULL,port INTEGER NOT NULL CHECK(port BETWEEN 0 AND 65535),tls_config_id INTEGER REFERENCES tls_configs(id));
CREATE TABLE client_settings(tenant_id TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(tenant_id,key));
CREATE TABLE operation_journal(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,operation_id TEXT NOT NULL,before_blob BLOB NOT NULL,desired_blob BLOB NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')));
CREATE TABLE key_versions(key_id TEXT PRIMARY KEY,created_at TEXT NOT NULL,retired INTEGER NOT NULL DEFAULT 0);
CREATE TABLE secret_blobs(tenant_id TEXT NOT NULL,ref_key TEXT NOT NULL,envelope BLOB NOT NULL,PRIMARY KEY(tenant_id,ref_key));
```

非columnAccountConfigはconfig_json(schema1)全保存、password/secretref別envelope。journalはbefore/desired暗号化、AAD='doors/journal/'+tenant+'/'+jobid+'/1'。native成功→DBcommit→snapshot、crashpendingはbefore採用/OutOfSync通知、strict復元全validate失敗全rollback、Partial明示時だけ失敗account隔離一覧。gen/fresh/refresh/entitiesも後述operationで4interfaceへ公開、管理CLI裏口禁止。schema1DDLは上記、freshはforce+全Client停止+backup、refresh=fresh→entity生成。migrationversion=max+1 u32、file名UTCtimestamp-counter別、timestampをu32へ詰込禁止。downはapply forceでも自動不可。

## 11 REST・WebSocket・gRPC・CLIの完全共通契約

全operationに具体入口を後述全票へ掲載。REST正本POST /api/v1/operations/<id>、body={context?:Context,request:TypedRequest}、返却{request_id,result:TypedResponse}又は{request_id,error:DoorsError}。generic dispatcherだけで型schema空欄は不可。Axum public Router(最小health/auth)とprotected Router分離後merge、middleware認証context抽出/対象認可operation。WSupgradeも同検査。

RESTalias：GET/health→runtime.health.get(detailfalse)、GET/capabilities、GET/POST/accounts、GET/PATCH/DELETE/accounts/{id}、POST/accounts/{id}/calls、GET/calls、GET/calls/{id}、POST/calls/{id}/{answer,hangup,hold,unhold,transfer,dtmf}、POST/auth/token、POST/shutdown、GET/jobs/{id}。prefix /api/v1、aliasは同operationだけ、他全操作も正本入口でtyped公開。成功200/create201/acceptedjob202+Location/deletealias204（正本typed200）。error400InvalidArgument/InvalidConfig、401Unauthenticated、403PermissionDenied、404NotFound、409InvalidState/Conflict/AlreadyExists、429ResourceExhausted、501Unsupported、504Timeout、408Cancelled、503Unavailable/ShuttingDown、502NativeFailure、500InternalInvariantBroken。

HTTPstream：open response StreamId/metadata→PUT /api/v1/streams/{id}/input、GET .../output、GET .../events(SSE)、DELETE ...取消。application/vnd.doors.frames、header/payload lengthで再組立、HTTPchunk境界非依存。SSE event snapshot/event/raw/gap/eof/error、data=ReceivedItemJSON、id=event/frame seq、Last-Event-ID再送保証なし→resync gap+freshsnapshot。unaryreceiveで一件取得も可、openで暗黙一件消費なし。断線は一時resource lease30秒でclose、call既定keep。

WS /api/v1/ws=全操作control+audio、/api/v1/ws/audio=audio/session専用（全操作の代替不可）。request={type:'request',request_id,operation_id,payload:TypedRequest,context?}、response={type:'response',request_id,result|error}、event={type:'event',subscription_id,item:ReceivedItem}、stream={type:'stream',stream:StreamMetadata}。並列request、同resource mutationはReactorFIFO、global順序保証なし。binaryはPCM/GAP/EOF、streammetadataをdata前通知。

wire64byte/networkorder：offset0 magic[4]='DORS';4 version:u8=1;5 kind:u8(1PCM/2GAP/3EOF);6 flags:u16;8 header_length:u16=64;10 reserved:u16=0;12 payload_length:u32;16 stream_id:u64;24 call_id:u64;32 sequence:u64;40 sample_index:u64;48 timestamp_ns:i64(unix);56 sample_rate:u32;60 frame_samples:u16;62 channels:u8;63 sample_format:u8(1S16LE/2F32LE)。PCMlen=sample*channels*2or4、GAPpayload3×u64BE(first_missing_sequence,lost_frames,lost_samples)=24byte/frame_samples0、EOFpayload0/frame_samples0。flagsbit0INpad/1OUTpad/2discontinuity/3estimatedts/4truncated/5clip、残0。unknownversion/flag/reserved/length不一致/所有call不一致拒否。nativeRuststruct直送禁止。HTTPframedも同wire、JSONPCMはBytesBase64、Floatfinite検査。

connectioncontrol queue512/audio64、control16件後audio1件の公平配送、slowtapはmode契約、controloverflow gap→snapshot又はclose1013、policy1008/size1009/internal1011。ping20秒/pong10秒、token期限/再認証/再接続snapshot、JWT直query禁止。disconnectでconnectionowned tap/source/subscription close、callkeep（明示hangup_on_disconnect時だけ当該call終了）。read/write task分離、最大connections256/request/WS1MiB、100op/s burst200/principal、auth10/min/peer。bucketmonotonicrefill、超過DoorsError/429、origin/sizeを認証前にも制限。

gRPCpackage doors.v1/service Doors、全RPC実宣言/型をproto収録。Uunary、Sserverstream、Cclientstream、Bbidi。S最初typedresponse metadata→ReceivedItem*→error又はEOF、C最初typedrequest（frame含めば一度処理）→packet*→typedack、B最初request→独立双方向packet、halfclose独立。metadata authorization/x-request-id/x-idempotency-key、deadline共通、maxmessage1MiB/keepalive20秒、flowcontrolHTTP2。error InvalidArgument/InvalidConfig→INVALID_ARGUMENT、InvalidState→FAILED_PRECONDITION、Conflict→ABORTED、NotFound/AlreadyExists/Unauthenticated/PermissionDenied/ResourceExhausted同名、Unsupported→UNIMPLEMENTED、Timeout→DEADLINE_EXCEEDED、Cancelled→CANCELLED、Unavailable/ShuttingDown→UNAVAILABLE、NativeFailure/InternalInvariantBroken→INTERNAL、richdetails DoorsError。

CLI全票具体command、scalarfield --snake-name→--kebab-name、Bool明示true/false、repeated複数回、nested --field-json又は全体--request-json @file/-、両方指定Conflict。共通--json/--timeout-ms/--idempotency-key/--endpoint/--protocol=local/rest/websocket/grpc。secretfile/stdin/TTY、password/token argv禁止。stdoutJSON/JSONL、progressstderr、--audio-stdout時text混在禁止、stdinPCMはframed又は--format明示してframe化。exit0成功/EOF、2引数設定、3認証認可、4対象状態競合、5native/network、6timeout取消、7内部、8容量非対応、130SIGINT。

doors run --config ... --softphone --rest --websocket --grpc は同operation sequence編成、別の業務実装なし。server無しlocal常駐consoleも同parser、別CLIはendpointへ接続、1CLIprocess終了で通話消失する設計禁止。CtrlC=streamcancel→Clientshutdown、Runtime全停止はadmin明示。GUIなしで発着信/answer/DTMF/hold/transfer/mic/speaker/tap/source可能。

## 12 shutdown・障害・観測

Running→Quiescing→Calls→Accounts→Audio→Native→Terminated/Failed。二重shutdownは同jobcompletionへjoin、開始だけでOk禁止。newmutation ShuttingDown、snapshotquery可、nativequeryは資源生存phaseのみ、内部cleanupはsystemleaseで一般gateと別、command無応答drop禁止。総15秒=call5/account5/audio2/native3、残余deadlineを超さない。

listener/admission停止→BYE/CANCEL＋nativepump/結果待ち→unregister待ち→source/tap/WAVdrain→workerjoin→confdisconnect/remove完了→transportclose→pjsua_destroy→native/RTthreadjoin→terminal snapshot/event→subscriptionEOF→全reply解決。phase失敗をerrors/remainingへ蓄積しsafecleanup続行、native未知資源再利用禁止。destroyOS内hangはthread強制killせずRuntimeFailed/新資源拒否、daemon supervisorへprocess終了要求、libraryはunload安全でない旨Error。native生存不明なのに再初期化禁止。

tracing IDs runtime/client/tenant/account/call/operation/request/trace、secret skip、callbackformat禁止。metrics active_calls/registered_accounts/audio_tap_overflows_total/dtmf_sent_total/dtmf_received_total/ice_failures_total/transport_reconnects_total/raw_sip_messages_total/native_queue_overflows/command_depth/rt_underruns/rt_drops/padding_samples/alignment_drift/cleanup_leaks、hist command_latency/frame_processing/jitter。metricsoff queryUnsupported。publichealth最小、ready/native/DB/device詳細admin。

## 13 build・配布・license・互換

native manifest={source_version/commit/SHA256/patches/headerhash/compiler/target/ABI/defines/features/libhashes/systemdeps}、header/lib同manifest一致。build.rs prebuilt vendor/prebuilt/<triple>→system(pkg-config/DOORS_PJSIP_ROOT)→vendored CMake→failstop、system版/feature検査、warningcontinue禁止。通常OUT_DIRだけ、DOORS_STAGE_PREBUILT=1だけvendorstage。旧env名使用はdiagnostic。CMakeLists/optionの実存在をprobe、stubで偽成功禁止。

bindgen wrapper pjsua/pjmedia-opus/module/xfer、必要function/type/var/enumallowlist、rawenum整数定数/safeenum変換、PJ_SUCCESS等enumがvarallowlistだけでemitと仮定禁止。PJSIP_CRED_DATA_PLAIN_PASSWD実symbol、独自PJSUA_CALL_NULL=0撤回、codec_info.codec_id解析（name/rate/channels、未知不正error）、不存在encoding_name/clock_rate参照禁止、生成物手編集禁止、ABI/callback/field/size compileprobe。

compile videoOFF/OpusON/TLS/SRTP一致、PJSUA_MAX_CALLS>=32/PJSUA_MAX_ACC>=128/confports>=113。temporaryauth最大8/overridecall分もaccount容量予約、Runtime値だけ32にしてnative実枠不足禁止。Linux compiler/cmake/pkgconfig/clang/ALSA/OpenSSL/UUID/Opus/SRTPを固定imageでprobe、存在しないpackage名を転載禁止。macOS XcodeCLI+framework/CoreAudio/CoreFoundation/Security、Windows MSVCSDK/clang/依存lib。source/native feature不一致拒否。

archiveはmanifest承認集合、統合pjproject優先又は必要pj/pjlib-util/pjnath/pjmedia/pjmedia-codec/pjsip/pjsip-ua/pjsip-simple/pjsua等列挙、pjsua2単独不可、余分な.a自動取り込み禁止。Linux循環group＋asound/ssl/crypto/uuid/pthread/m/dl/rt feature連動、macframework、Windowsws2_32/ole32/userenv/winmm/iphlpapi/crypt32等、実linkprobe。producer Rust pjsip-prebuilt build|stage|verify <triple>、consumer非依存、mac→host+DockerLinux/Linux→host/Windows→MSVC。verify machineformat/symbol pjsua_initとpj_init/最小Clink/manifesthash、OS別file/nm又はdumpbin相当。3OSmatrixartifact→単collector→直接commit、parallelpush禁止/concurrency/同hashnoop、producerverifyとconsumercompile独立DoD、clone後追加取得なしbuild。

GPL条件準拠又は取得済proprietarylicense構成、doors独自exceptionで依存制約解除を保証禁止。本体licenseとリンク成果物条件分離、依存license/sourceoffer/商用権利releasegate、未確認配布停止。0.x破壊可/CHANGELOG/migration/旧重複型撤去、1.0semver/cargo-semver-checks/最低1release deprecation、security例外記録。event nonexhaustive追加minor、publicstruct追加はconstruct互換を個別検査、wiretag削除reserve。

## 14 conformance・受入れoracle

全operation×core/operation/CLI/REST/WS/gRPC/conformance、正常/型境界/状態拒否/認可/取消/期限/冪等key/停止/nativefailure/streamEOFerrorを比較。system操作は外部拒否と正当lease内部実行両方。handler/fixture名があるだけで合格不可、実結果参照必要。featureoffはcapability一致Unsupported、baseline必須機能のUnsupportedは不合格。

L1 validation/ID/mix/clipping/format/resample/aligner/queue/filter/error/secret、L2 TestBackend全state×trigger/競合/timer、L3 Docker実SIP/RTP/TURN、L4 PBXinterop、L5 全adapterblackbox。TestBackendは明示test-support/take_native_events、本番default生成禁止、exampleが通常libraryのcfg(test)に依存禁止。

CF-AUTH：誤password401、usernameだけtoken0、tenant越境拒否、JWTalg/signature/exp/nbf/scope/Origin、stream期限、bootstrap外部拒否、DB/log平文secret0。
CF-REG：401challenge→200、403Failed、expires0解除、disable、refresh期限前維持/後Expired、逆操作FIFO、remove解除先行、復元自動登録、event/snapshot同revision。
CF-CALL：100/180/183/200/ACK/BYE、180省略、CANCEL/486/603/4/5/6xx/timeout、answer200後confirmed前Connected0、terminal1、incomingentry先、local/remotehold、REFERfinal、重複callback、max_calls+1拒否。
CF-AUDIO：1kHztone全rate変換、exactsample長/passbandRMS誤差1%以内/Highstopband60dB、IN440HzOUT880HzL/R漏洩-60dB以下、±40msずれ/欠損zero/遅着drop、±100ppm30分queue有界、Losslessstall5s当該tapのみerror、Realtimeoldestdrop。
CF-DTMF：16digits100ms/twist-8..4dB/SNR20dB全検出、speech10分falsepositive0、RMS閾値未満不検出、release前重複0、失敗timer0、Estimated≠Observed、3方式wire/PCM別証拠。
CF-RT：callbackalloc/free/lock/await0計測、underrunzero、dropcounter、confcomplete前free0、shutdownrace10000回UAF0。
CF-WIRE：64bytegolden/offset/ID>2^53/NaN/oversize/partialHTTPchunk/unknownversion/halfclose/WSmultiplex/slowreader/再接続snapshot、gRPCstatus+detail、CLItext/binary混在0。
CF-DB：migration/checksum/rollback/AEAD/keyrotation/busy/diskfull/repair/StrictPartial復元/runtimeID再採番、secret漏洩0。
CF-NATIVE：Asterisk REGISTER/発着信Originate/BYE/DTMF/hold/transfer/PCMU/Opus/SRTP、FreeSWITCHcodec/Info/ICE/TURN P0、OpenSIPSproxy/TLS/TCPfailover/KamailioContact/dialog/REFER/3CXSBC/SRTP/ICE P1、P0は1.0前。SIPp183/early/timeout（Echoで代替禁止）、coturn binding/allocate/relay選択/実RTP。native rawhook→購読、source→相手、confport→tap、fakeだけ不可。
CF-CI：composeup/readiness/test/finallydown、localDockerなしSKIPPED明示/CI必須jobskip失敗、Asteriskpjsip.conf/extensions.conf、RTP/TURN範囲固定、3OSfeaturematrix/prebuilt+source、fmt/clippy/schema/registrybreaking、placeholder/eprintlnskip/None変換/未drain検出。
CF-PERF：記録reference環境30call各1tap1source/PCMUOpus各30分、追加doors処理p99<20ms/RSSsteady/RTalloc0、CPU/drop/jitter測定、source16/slowreader/admission境界。未測定十分保証なし。

release gate=上記＋全binding/build/native/transport/security/account独立/未登録policy/40event/formatpair/複数source切替/4adapter/SendSync/library＋softphone/license/秘密保護、未対応0。I/O境界crate/FFI/Reactor-audio/API/event/DB/authは同operationの入力/出力/順序/error/testで分割、graphify/boundify/ticketは本契約から導出、旧phase18等を新仕様へ持込まない。

## 15 完全型定義・protobuf/service（抽出して利用可能）

このprotoをdoors.protoとして抽出可能。business_optional以外のscalar/messageはpresence必須、repeated欠落だけ[]正規化。enum0はrequired時拒否、narrowの数値幅/非ゼロ/秘密serializerを適用。optional keywordはprotobufのpresence確保のため、業務optionalとは別。JSONは同field名/型規則。unionはoneofをJSON kind/valueへ写像。Field番号/variant番号は本文固定、将来削除reserve、改番禁止。

```proto
syntax = "proto3";
package doors.v1;
enum ErrorCode { ERROR_CODE_UNSPECIFIED = 0; ERROR_CODE_INVALID_ARGUMENT = 1; ERROR_CODE_INVALID_CONFIG = 2; ERROR_CODE_INVALID_STATE = 3; ERROR_CODE_NOT_FOUND = 4; ERROR_CODE_ALREADY_EXISTS = 5; ERROR_CODE_CONFLICT = 6; ERROR_CODE_UNSUPPORTED = 7; ERROR_CODE_UNAUTHENTICATED = 8; ERROR_CODE_PERMISSION_DENIED = 9; ERROR_CODE_RESOURCE_EXHAUSTED = 10; ERROR_CODE_TIMEOUT = 11; ERROR_CODE_CANCELLED = 12; ERROR_CODE_UNAVAILABLE = 13; ERROR_CODE_NATIVE_FAILURE = 14; ERROR_CODE_INTERNAL_INVARIANT_BROKEN = 15; ERROR_CODE_SHUTTING_DOWN = 16; }
enum ErrorDomain { ERROR_DOMAIN_UNSPECIFIED = 0; ERROR_DOMAIN_RUNTIME = 1; ERROR_DOMAIN_ACCOUNT = 2; ERROR_DOMAIN_REGISTRATION = 3; ERROR_DOMAIN_AUTHENTICATION = 4; ERROR_DOMAIN_INVITE = 5; ERROR_DOMAIN_TRANSPORT = 6; ERROR_DOMAIN_MEDIA = 7; ERROR_DOMAIN_CODEC = 8; ERROR_DOMAIN_AUDIO_PIPELINE = 9; ERROR_DOMAIN_AUDIO_ALIGNMENT = 10; ERROR_DOMAIN_AUDIO_TAP = 11; ERROR_DOMAIN_ICE = 12; ERROR_DOMAIN_TLS = 13; ERROR_DOMAIN_SRTP = 14; ERROR_DOMAIN_DTMF = 15; ERROR_DOMAIN_CHANNEL = 16; ERROR_DOMAIN_PERSISTENCE = 17; ERROR_DOMAIN_PROTOCOL = 18; }
enum RuntimePhase { RUNTIME_PHASE_UNSPECIFIED = 0; RUNTIME_PHASE_NEW = 1; RUNTIME_PHASE_INITIALIZING = 2; RUNTIME_PHASE_RUNNING = 3; RUNTIME_PHASE_QUIESCING = 4; RUNTIME_PHASE_CALLS = 5; RUNTIME_PHASE_ACCOUNTS = 6; RUNTIME_PHASE_AUDIO = 7; RUNTIME_PHASE_NATIVE = 8; RUNTIME_PHASE_TERMINATED = 9; RUNTIME_PHASE_FAILED = 10; }
enum RegistrationState { REGISTRATION_STATE_UNSPECIFIED = 0; REGISTRATION_STATE_DISABLED = 1; REGISTRATION_STATE_IDLE = 2; REGISTRATION_STATE_REGISTERING = 3; REGISTRATION_STATE_REGISTERED = 4; REGISTRATION_STATE_UNREGISTERING = 5; REGISTRATION_STATE_FAILED = 6; REGISTRATION_STATE_EXPIRED = 7; }
enum CallState { CALL_STATE_UNSPECIFIED = 0; CALL_STATE_NEW = 1; CALL_STATE_CALLING = 2; CALL_STATE_TRYING = 3; CALL_STATE_RINGING = 4; CALL_STATE_EARLY_MEDIA = 5; CALL_STATE_INCOMING = 6; CALL_STATE_CONNECTING = 7; CALL_STATE_ACTIVE = 8; CALL_STATE_HELD = 9; CALL_STATE_TRANSFERRING = 10; CALL_STATE_DISCONNECTING = 11; CALL_STATE_DISCONNECTED = 12; CALL_STATE_FAILED = 13; }
enum InviteState { INVITE_STATE_UNSPECIFIED = 0; INVITE_STATE_NULL = 1; INVITE_STATE_CALLING = 2; INVITE_STATE_INCOMING = 3; INVITE_STATE_EARLY = 4; INVITE_STATE_CONNECTING = 5; INVITE_STATE_CONFIRMED = 6; INVITE_STATE_DISCONNECTED = 7; }
enum MediaState { MEDIA_STATE_UNSPECIFIED = 0; MEDIA_STATE_NONE = 1; MEDIA_STATE_ACTIVE = 2; MEDIA_STATE_LOCAL_HOLD = 3; MEDIA_STATE_REMOTE_HOLD = 4; MEDIA_STATE_BOTH_HOLD = 5; MEDIA_STATE_ERROR = 6; MEDIA_STATE_STOPPED = 7; }
enum TransferState { TRANSFER_STATE_UNSPECIFIED = 0; TRANSFER_STATE_NONE = 1; TRANSFER_STATE_REQUESTED = 2; TRANSFER_STATE_ACCEPTED = 3; TRANSFER_STATE_NOTIFYING = 4; TRANSFER_STATE_SUCCEEDED = 5; TRANSFER_STATE_FAILED = 6; }
enum Direction { DIRECTION_UNSPECIFIED = 0; DIRECTION_INBOUND = 1; DIRECTION_OUTBOUND = 2; }
enum ChannelSelector { CHANNEL_SELECTOR_UNSPECIFIED = 0; CHANNEL_SELECTOR_IN = 1; CHANNEL_SELECTOR_OUT = 2; CHANNEL_SELECTOR_BOTH = 3; }
enum MediaDirection { MEDIA_DIRECTION_UNSPECIFIED = 0; MEDIA_DIRECTION_INBOUND = 1; MEDIA_DIRECTION_OUTBOUND = 2; MEDIA_DIRECTION_BOTH = 3; }
enum TransportKind { TRANSPORT_KIND_UNSPECIFIED = 0; TRANSPORT_KIND_UDP = 1; TRANSPORT_KIND_TCP = 2; TRANSPORT_KIND_TLS = 3; }
enum TransportPolicyKind { TRANSPORT_POLICY_KIND_UNSPECIFIED = 0; TRANSPORT_POLICY_KIND_ANY = 1; TRANSPORT_POLICY_KIND_PREFER = 2; TRANSPORT_POLICY_KIND_REQUIRE = 3; }
enum TransportState { TRANSPORT_STATE_UNSPECIFIED = 0; TRANSPORT_STATE_CREATED = 1; TRANSPORT_STATE_CONNECTING = 2; TRANSPORT_STATE_CONNECTED = 3; TRANSPORT_STATE_DISCONNECTED = 4; TRANSPORT_STATE_FAILED = 5; TRANSPORT_STATE_CLOSED = 6; }
enum TurnTransport { TURN_TRANSPORT_UNSPECIFIED = 0; TURN_TRANSPORT_UDP = 1; TURN_TRANSPORT_TCP = 2; TURN_TRANSPORT_TLS = 3; }
enum Codec { CODEC_UNSPECIFIED = 0; CODEC_PCMU = 1; CODEC_OPUS = 2; }
enum CodecSelectionPolicy { CODEC_SELECTION_POLICY_UNSPECIFIED = 0; CODEC_SELECTION_POLICY_ORDERED = 1; CODEC_SELECTION_POLICY_PREFER_OPUS_FALLBACK_PCMU = 2; }
enum DtmfMethod { DTMF_METHOD_UNSPECIFIED = 0; DTMF_METHOD_INBAND = 1; DTMF_METHOD_INFO = 2; DTMF_METHOD_RFC4733 = 3; }
enum CompletionBasis { COMPLETION_BASIS_UNSPECIFIED = 0; COMPLETION_BASIS_OBSERVED = 1; COMPLETION_BASIS_ESTIMATED = 2; COMPLETION_BASIS_UNKNOWN = 3; }
enum JobState { JOB_STATE_UNSPECIFIED = 0; JOB_STATE_PENDING = 1; JOB_STATE_RUNNING = 2; JOB_STATE_SUCCEEDED = 3; JOB_STATE_FAILED = 4; JOB_STATE_CANCELLED = 5; JOB_STATE_UNKNOWN = 6; }
enum AudioTapMode { AUDIO_TAP_MODE_UNSPECIFIED = 0; AUDIO_TAP_MODE_REALTIME = 1; AUDIO_TAP_MODE_LOSSLESS = 2; }
enum TapPosition { TAP_POSITION_UNSPECIFIED = 0; TAP_POSITION_RAW_INBOUND = 1; TAP_POSITION_RENDERED_INBOUND = 2; TAP_POSITION_RENDERED_OUTBOUND = 3; TAP_POSITION_PAIR = 4; }
enum SampleRate { SAMPLE_RATE_UNSPECIFIED = 0; SAMPLE_RATE_HZ8000 = 1; SAMPLE_RATE_HZ16000 = 2; SAMPLE_RATE_HZ24000 = 3; SAMPLE_RATE_HZ48000 = 4; }
enum BitDepth { BIT_DEPTH_UNSPECIFIED = 0; BIT_DEPTH_I16 = 1; BIT_DEPTH_F32 = 2; }
enum ChannelLayout { CHANNEL_LAYOUT_UNSPECIFIED = 0; CHANNEL_LAYOUT_MONO = 1; CHANNEL_LAYOUT_STEREO_IN_OUT = 2; }
enum ResampleQuality { RESAMPLE_QUALITY_UNSPECIFIED = 0; RESAMPLE_QUALITY_LOW = 1; RESAMPLE_QUALITY_MEDIUM = 2; RESAMPLE_QUALITY_HIGH = 3; }
enum SrtpPolicy { SRTP_POLICY_UNSPECIFIED = 0; SRTP_POLICY_DISABLED = 1; SRTP_POLICY_OPTIONAL = 2; SRTP_POLICY_MANDATORY = 3; }
enum SrtpImplementation { SRTP_IMPLEMENTATION_UNSPECIFIED = 0; SRTP_IMPLEMENTATION_SDES_SRTP = 1; SRTP_IMPLEMENTATION_DTLS_SRTP = 2; }
enum LogLevel { LOG_LEVEL_UNSPECIFIED = 0; LOG_LEVEL_ERROR = 1; LOG_LEVEL_WARN = 2; LOG_LEVEL_INFO = 3; LOG_LEVEL_DEBUG = 4; LOG_LEVEL_TRACE = 5; }
enum AuthMode { AUTH_MODE_UNSPECIFIED = 0; AUTH_MODE_LOCALHOST_ONLY = 1; AUTH_MODE_API_KEY = 2; AUTH_MODE_JWT = 3; }
enum HangupKind { HANGUP_KIND_UNSPECIFIED = 0; HANGUP_KIND_NORMAL = 1; HANGUP_KIND_CANCELLED = 2; HANGUP_KIND_BUSY = 3; HANGUP_KIND_DECLINED = 4; HANGUP_KIND_TIMEOUT = 5; HANGUP_KIND_ERROR = 6; }
enum DisconnectInitiator { DISCONNECT_INITIATOR_UNSPECIFIED = 0; DISCONNECT_INITIATOR_LOCAL = 1; DISCONNECT_INITIATOR_REMOTE = 2; DISCONNECT_INITIATOR_NETWORK = 3; DISCONNECT_INITIATOR_RUNTIME = 4; }
enum SipMessageDirection { SIP_MESSAGE_DIRECTION_UNSPECIFIED = 0; SIP_MESSAGE_DIRECTION_SENT = 1; SIP_MESSAGE_DIRECTION_RECEIVED = 2; }
enum SubscriptionKind { SUBSCRIPTION_KIND_UNSPECIFIED = 0; SUBSCRIPTION_KIND_CONTROL = 1; SUBSCRIPTION_KIND_ACCOUNT = 2; SUBSCRIPTION_KIND_RAW_SIP = 3; }
enum StreamState { STREAM_STATE_UNSPECIFIED = 0; STREAM_STATE_OPEN = 1; STREAM_STATE_DRAINING = 2; STREAM_STATE_CLOSED = 3; STREAM_STATE_FAILED = 4; }
enum SourceKind { SOURCE_KIND_UNSPECIFIED = 0; SOURCE_KIND_UPLOADED = 1; SOURCE_KIND_FILE = 2; SOURCE_KIND_MICROPHONE = 3; SOURCE_KIND_SILENCE = 4; SOURCE_KIND_TONE = 5; }
enum Role { ROLE_UNSPECIFIED = 0; ROLE_READER = 1; ROLE_OPERATOR = 2; ROLE_ADMINISTRATOR = 3; }
enum GapReason { GAP_REASON_UNSPECIFIED = 0; GAP_REASON_OVERFLOW = 1; GAP_REASON_LATE = 2; GAP_REASON_MISSING = 3; GAP_REASON_RESYNC = 4; GAP_REASON_CLOCK_STEP = 5; }
enum PatchAction { PATCH_ACTION_UNSPECIFIED = 0; PATCH_ACTION_KEEP = 1; PATCH_ACTION_SET = 2; PATCH_ACTION_CLEAR = 3; }
enum FaultKind { FAULT_KIND_UNSPECIFIED = 0; FAULT_KIND_PANIC = 1; FAULT_KIND_NATIVE_INVARIANT = 2; FAULT_KIND_QUEUE_OVERFLOW = 3; FAULT_KIND_DEADLINE = 4; FAULT_KIND_DEVICE_LOST = 5; }
enum StartupPolicy { STARTUP_POLICY_UNSPECIFIED = 0; STARTUP_POLICY_STRICT = 1; STARTUP_POLICY_PARTIAL = 2; }
enum DtmfStage { DTMF_STAGE_UNSPECIFIED = 0; DTMF_STAGE_ACCEPTED = 1; DTMF_STAGE_STARTED = 2; DTMF_STAGE_COMPLETED = 3; }
enum RegistrationPhase { REGISTRATION_PHASE_UNSPECIFIED = 0; REGISTRATION_PHASE_BEGIN = 1; REGISTRATION_PHASE_RESULT = 2; REGISTRATION_PHASE_REFRESH = 3; REGISTRATION_PHASE_EXPIRED = 4; REGISTRATION_PHASE_DISABLED = 5; }
enum Outcome { OUTCOME_UNSPECIFIED = 0; OUTCOME_SUCCESS = 1; OUTCOME_FAILURE = 2; OUTCOME_PENDING = 3; OUTCOME_UNKNOWN = 4; }
message Empty {  } // business_optional=-; narrow=-
message KeyValue { optional string key = 1; optional string value = 2; } // business_optional=-; narrow=-
message EventTimestamp { optional uint64 monotonic_ns = 1; optional sint64 unix_ns = 2; optional uint64 clock_epoch = 3; } // business_optional=-; narrow=-
message ClockAnchor { optional uint64 monotonic_ns = 1; optional sint64 unix_ns = 2; optional uint64 clock_epoch = 3; optional uint64 sample_index = 4; optional uint32 sample_rate = 5; } // business_optional=-; narrow=-
message DoorsError { optional ErrorCode code = 1; optional ErrorDomain domain = 2; optional string message = 3; optional sint32 native_status = 4; optional uint32 sip_status = 5; optional uint64 runtime_id = 6; optional uint64 client_id = 7; optional uint64 account_id = 8; optional uint64 call_id = 9; optional string request_id = 10; optional bool retryable = 11; optional uint64 retry_after_ms = 12; repeated KeyValue details = 13; } // business_optional=native_status,sip_status,runtime_id,client_id,account_id,call_id,request_id,retry_after_ms; narrow=sip_status:U16,runtime_id:Id,client_id:Id,account_id:Id,call_id:Id
message ResultInfo { optional Outcome outcome = 1; optional CompletionBasis basis = 2; DoorsError error = 3; EventTimestamp at = 4; } // business_optional=error; narrow=-
message Context { optional string request_id = 1; optional sint64 deadline_unix_ns = 2; optional string idempotency_key = 3; optional string trace_id = 4; } // business_optional=deadline_unix_ns,idempotency_key,trace_id; narrow=-
message Principal { optional uint64 id = 1; optional uint64 tenant_id = 2; repeated Role roles = 3; repeated string scopes = 4; optional sint64 expires_unix_ns = 5; } // business_optional=expires_unix_ns; narrow=id:Id,tenant_id:Id
message AudioFormat { optional SampleRate sample_rate = 1; optional BitDepth bit_depth = 2; optional ChannelLayout channel_layout = 3; optional uint32 frame_ms = 4; } // business_optional=-; narrow=frame_ms:U16
message ClientAudioConfig { AudioFormat default_delivery_format = 1; optional uint32 pair_buffer_ms = 2; optional uint32 jitter_buffer_ms = 3; optional uint32 mixer_frame_ms = 4; optional uint32 max_sources_per_call = 5; optional ResampleQuality resampler_quality = 6; optional uint32 rt_queue_frames = 7; optional uint32 tap_failure_timeout_ms = 8; } // business_optional=-; narrow=mixer_frame_ms:U16
message TimeoutConfig { optional uint64 command_timeout_ms = 1; optional uint64 shutdown_timeout_ms = 2; optional uint64 register_timeout_ms = 3; optional uint64 invite_timeout_ms = 4; } // business_optional=-; narrow=-
message DtmfConfig { optional uint32 sent_estimate_ms = 1; optional uint32 tone_ms = 2; optional uint32 gap_ms = 3; } // business_optional=-; narrow=tone_ms:U16,gap_ms:U16
message ReconnectPolicy { optional uint64 base_delay_ms = 1; optional uint64 max_delay_ms = 2; optional double jitter_ratio = 3; } // business_optional=-; narrow=-
message RawSipEventConfig { optional bool enabled = 1; optional bool include_bodies = 2; optional uint32 max_body_bytes = 3; optional uint32 max_message_bytes = 4; optional bool redact_authorization = 5; } // business_optional=-; narrow=-
message TlsConfig { optional bool verify_server = 1; optional string ca_cert_path = 2; optional string client_cert_path = 3; optional string client_key_path = 4; optional string server_name = 5; optional bool allow_insecure_cipher_legacy = 6; } // business_optional=ca_cert_path,client_cert_path,client_key_path,server_name; narrow=-
message TransportConfig { optional TransportKind kind = 1; optional string bind_addr = 2; TlsConfig tls = 3; } // business_optional=tls; narrow=-
message IceConfig { optional bool enabled = 1; optional bool aggressive_nomination = 2; optional bool trickle_ice = 3; optional bool renomination = 4; optional uint32 max_host_candidates = 5; } // business_optional=-; narrow=-
message StunServerConfig { optional string uri = 1; } // business_optional=-; narrow=-
message TurnServerConfig { optional string uri = 1; optional string username = 2; optional string password = 3; optional TurnTransport transport = 4; } // business_optional=username,password; narrow=password:Secret
message RuntimeConfig { optional string user_agent = 1; optional LogLevel log_level = 2; optional uint32 max_calls = 3; optional uint32 event_bus_capacity = 4; optional uint32 raw_sip_event_capacity = 5; optional uint32 command_admission = 6; optional uint32 native_event_capacity = 7; ClientAudioConfig audio = 8; repeated TransportConfig transports = 9; repeated StunServerConfig stun_servers = 10; repeated TurnServerConfig turn_servers = 11; IceConfig ice = 12; RawSipEventConfig raw_sip_events = 13; TimeoutConfig timeouts = 14; DtmfConfig dtmf = 15; ReconnectPolicy reconnect = 16; } // business_optional=-; narrow=-
message ClientConfig { optional uint64 tenant_id = 1; AudioFormat default_delivery_format = 2; optional uint32 max_calls = 3; optional uint64 default_account = 4; } // business_optional=default_delivery_format,max_calls,default_account; narrow=tenant_id:Id,default_account:Id
message OpusConfig { optional uint32 bitrate = 1; optional uint32 complexity = 2; optional bool cbr = 3; optional bool inband_fec = 4; optional bool dtx = 5; optional uint32 ptime_ms = 6; } // business_optional=-; narrow=complexity:U8,ptime_ms:U16
message AccountCodecPolicy { optional bool enable_pcmu = 1; optional bool enable_opus = 2; OpusConfig opus = 3; } // business_optional=-; narrow=-
message DtmfPolicy { repeated DtmfMethod send_methods = 1; repeated DtmfMethod receive_methods = 2; optional DtmfMethod default_send_method = 3; } // business_optional=-; narrow=-
message AccountMediaConfig { optional SrtpPolicy srtp = 1; optional bool ice = 2; optional bool vad = 3; optional uint32 ec_tail_ms = 4; optional double input_gain_db = 5; optional double output_gain_db = 6; } // business_optional=-; narrow=ec_tail_ms:U16
message AccountTransportPolicy { optional TransportPolicyKind kind = 1; optional TransportKind transport = 2; } // business_optional=transport; narrow=-
message AccountConfig { optional string display_name = 1; optional string username = 2; optional string auth_username = 3; optional string password = 4; optional string domain = 5; optional string registrar_uri = 6; repeated string outbound_proxy = 7; repeated KeyValue contact_params = 8; AccountTransportPolicy transport = 9; optional bool register_on_start = 10; optional bool allow_outbound_without_register = 11; optional uint64 registration_expires_ms = 12; AccountCodecPolicy codecs = 13; DtmfPolicy dtmf = 14; AccountMediaConfig media = 15; repeated KeyValue headers = 16; optional uint32 max_calls = 17; optional uint32 incoming_auto_reject_ms = 18; optional bool auto_answer_refer = 19; } // business_optional=display_name,auth_username,registrar_uri,max_calls,incoming_auto_reject_ms; narrow=password:Secret
message AuthConfig { optional AuthMode mode = 1; optional string api_key = 2; optional string jwt_secret = 3; optional uint64 jwt_expiry_secs = 4; optional string issuer = 5; optional string audience = 6; } // business_optional=api_key,jwt_secret; narrow=api_key:Secret,jwt_secret:Secret
message ServerConfig { optional string bind_addr = 1; optional string grpc_bind_addr = 2; optional string db_path = 3; optional string config_file = 4; repeated string allowed_origins = 5; AuthConfig auth = 6; optional uint32 max_connections = 7; optional uint32 max_request_bytes = 8; optional uint32 max_ws_message_bytes = 9; optional StartupPolicy startup_policy = 10; repeated string file_roots = 11; } // business_optional=db_path,config_file; narrow=-
message Configuration { optional uint32 schema_version = 1; RuntimeConfig runtime = 2; ClientConfig client = 3; ServerConfig server = 4; } // business_optional=-; narrow=-
message PatchEntry { optional string path = 1; optional PatchAction action = 2; optional bytes value_json = 3; } // business_optional=value_json; narrow=-
message AccountConfigPatch { repeated PatchEntry entries = 1; } // business_optional=-; narrow=-
message ConfigPatch { repeated PatchEntry entries = 1; } // business_optional=-; narrow=-
message AuthOverride { optional string username = 1; optional string password = 2; optional string realm = 3; } // business_optional=realm; narrow=password:Secret
message CallMediaPreferences { optional bool enable_early_media = 1; optional bool enable_srtp = 2; repeated Codec preferred_codecs = 3; optional CodecSelectionPolicy selection_policy = 4; } // business_optional=enable_srtp; narrow=-
message OutgoingCallRequest { optional string target_uri = 1; repeated KeyValue headers = 2; AuthOverride auth_override = 3; optional TransportKind preferred_transport = 4; CallMediaPreferences media = 5; optional bool auto_answer_refer = 6; } // business_optional=auth_override,preferred_transport; narrow=-
message HangupReason { optional HangupKind kind = 1; optional uint32 sip_status = 2; optional string phrase = 3; } // business_optional=sip_status,phrase; narrow=sip_status:U16
message NegotiatedCodec { optional Codec codec = 1; optional uint32 clock_rate = 2; optional uint32 channels = 3; optional uint32 ptime_ms = 4; OpusConfig opus = 5; } // business_optional=opus; narrow=channels:U8,ptime_ms:U16
message DeviceInfo { optional string id = 1; optional string name = 2; repeated AudioFormat formats = 3; optional bool is_default = 4; optional bool input = 5; optional bool output = 6; } // business_optional=-; narrow=-
message AudioDeviceCaps { optional bool has_default_input = 1; optional bool has_default_output = 2; repeated DeviceInfo input_devices = 3; repeated DeviceInfo output_devices = 4; } // business_optional=-; narrow=-
message ClientCapabilities { optional uint32 max_calls = 1; optional uint32 max_accounts = 2; repeated TransportKind transport_types = 3; optional bool tls_available = 4; optional string tls_version = 5; optional bool srtp_available = 6; repeated SrtpImplementation srtp_types = 7; repeated Codec available_codecs = 8; optional bool opus_available = 9; AudioDeviceCaps audio_devices = 10; optional bool ice_supported = 11; optional bool trickle_ice_supported = 12; optional bool renomination_supported = 13; optional bool stun_supported = 14; optional bool turn_supported = 15; repeated DtmfMethod dtmf_methods = 16; optional bool supports_refer = 17; optional bool supports_attended_transfer = 18; optional bool supports_session_timers = 19; optional uint32 event_bus_capacity = 20; optional bool raw_sip_events_supported = 21; optional uint32 mixer_max_sources = 22; repeated string build_features = 23; repeated string protocol_versions = 24; } // business_optional=tls_version; narrow=-
message RegistrationSnapshot { optional RegistrationState state = 1; optional bool desired_enabled = 2; EventTimestamp expires_at = 3; ResultInfo last_result = 4; optional sint32 native_status = 5; optional uint32 sip_status = 6; optional bool online_status = 7; optional string uri = 8; optional uint64 revision = 9; } // business_optional=expires_at,last_result,native_status,sip_status,online_status; narrow=sip_status:U16
message AccountSnapshot { optional uint64 id = 1; optional uint64 client_id = 2; AccountConfig config = 3; RegistrationSnapshot registration = 4; optional uint64 revision = 5; } // business_optional=-; narrow=id:Id,client_id:Id
message Candidate { optional string kind = 1; optional string address = 2; optional string protocol = 3; optional uint32 priority = 4; optional string related_address = 5; } // business_optional=related_address; narrow=-
message IceInfo { optional string state = 1; Candidate local = 2; Candidate remote = 3; optional bool relay_used = 4; DoorsError error = 5; } // business_optional=local,remote,error; narrow=-
message SrtpInfo { optional SrtpPolicy policy = 1; optional bool active = 2; optional SrtpImplementation implementation = 3; optional string suite = 4; } // business_optional=implementation,suite; narrow=-
message CallSnapshot { optional uint64 id = 1; optional uint64 account_id = 2; optional Direction direction = 3; optional CallState state = 4; optional InviteState invite_state = 5; optional MediaState media_state = 6; optional TransferState transfer_state = 7; NegotiatedCodec codec = 8; SrtpInfo srtp = 9; IceInfo ice = 10; EventTimestamp created_at = 11; EventTimestamp connected_at = 12; EventTimestamp ended_at = 13; HangupReason terminal_reason = 14; optional uint64 revision = 15; } // business_optional=codec,srtp,ice,connected_at,ended_at,terminal_reason; narrow=id:Id,account_id:Id
message TransportSnapshot { optional uint64 id = 1; optional TransportKind kind = 2; optional TransportState state = 3; optional string local_addr = 4; optional string remote_addr = 5; ResultInfo last_result = 6; } // business_optional=remote_addr,last_result; narrow=id:Id
message ClientSnapshot { optional uint64 id = 1; optional uint64 tenant_id = 2; optional RuntimePhase phase = 3; ClientConfig config = 4; } // business_optional=-; narrow=id:Id,tenant_id:Id
message RuntimeSnapshot { optional uint64 id = 1; optional uint64 epoch = 2; optional RuntimePhase phase = 3; repeated TransportSnapshot transports = 4; optional uint64 revision = 5; } // business_optional=-; narrow=id:Id
message StateSnapshot { RuntimeSnapshot runtime = 1; repeated ClientSnapshot clients = 2; repeated AccountSnapshot accounts = 3; repeated CallSnapshot calls = 4; ClientCapabilities capabilities = 5; optional uint64 revision = 6; ClockAnchor clock_anchor = 7; } // business_optional=-; narrow=-
message GapInfo { optional GapReason reason = 1; optional uint64 count = 2; optional uint64 first_sequence = 3; optional uint64 last_sequence = 4; optional uint64 first_sample = 5; optional uint64 sample_count = 6; } // business_optional=first_sequence,last_sequence,first_sample,sample_count; narrow=-
message AudioFrame { optional uint64 stream_id = 1; optional uint64 call_id = 2; optional uint64 sequence = 3; optional uint64 sample_index = 4; EventTimestamp timestamp = 5; AudioFormat format = 6; optional uint32 frame_samples = 7; optional uint32 channels = 8; optional bytes pcm = 9; optional uint32 flags = 10; } // business_optional=-; narrow=stream_id:Id,call_id:Id,channels:U8,flags:U16
message AudioChunkPair { optional uint64 stream_id = 1; optional uint64 runtime_id = 2; optional uint64 client_id = 3; optional uint64 account_id = 4; optional uint64 call_id = 5; EventTimestamp timestamp = 6; optional uint64 frame_sequence = 7; optional uint64 sample_index = 8; optional uint32 frame_samples = 9; AudioFormat format = 10; optional bytes in_chunk = 11; optional bytes out_chunk = 12; optional TapPosition provenance = 13; repeated GapInfo gaps = 14; } // business_optional=-; narrow=stream_id:Id,runtime_id:Id,client_id:Id,account_id:Id,call_id:Id
message StreamMetadata { optional uint64 id = 1; optional uint64 owner_client_id = 2; optional uint64 call_id = 3; optional uint64 account_id = 4; AudioFormat format = 5; optional TapPosition position = 6; ClockAnchor clock_anchor = 7; optional uint64 next_sequence = 8; optional uint64 next_sample_index = 9; optional StreamState state = 10; } // business_optional=call_id,account_id; narrow=id:Id,owner_client_id:Id,call_id:Id,account_id:Id
message SourceSpec { optional SourceKind kind = 1; AudioFormat format = 2; optional uint32 capacity = 3; optional string path = 4; optional string device_id = 5; repeated double frequencies = 6; optional uint64 duration_ms = 7; } // business_optional=format,capacity,path,device_id,duration_ms; narrow=-
message TapSpec { AudioFormat format = 1; optional uint32 capacity = 2; optional AudioTapMode mode = 3; optional TapPosition position = 4; } // business_optional=-; narrow=-
message SubscriptionMetadata { optional uint64 id = 1; optional SubscriptionKind kind = 2; StateSnapshot snapshot = 3; optional uint64 barrier_revision = 4; optional uint64 last_event_sequence = 5; optional uint64 stream_id = 6; } // business_optional=last_event_sequence; narrow=id:Id,stream_id:Id
message JobSnapshot { optional uint64 id = 1; optional string operation_id = 2; optional string request_id = 3; optional JobState state = 4; optional bytes result_json = 5; DoorsError error = 6; EventTimestamp created_at = 7; EventTimestamp ended_at = 8; optional uint64 revision = 9; } // business_optional=result_json,error,ended_at; narrow=id:Id
message PhaseResult { optional RuntimePhase phase = 1; optional bool completed = 2; repeated DoorsError errors = 3; repeated uint64 remaining_resources = 4; optional bool timed_out = 5; } // business_optional=-; narrow=remaining_resources:Id
message Metric { optional string name = 1; repeated KeyValue labels = 2; optional double value = 3; repeated double bucket_bounds = 4; repeated uint64 bucket_counts = 5; } // business_optional=-; narrow=-
message MetricsSnapshot { repeated Metric metrics = 1; EventTimestamp timestamp = 2; } // business_optional=-; narrow=-
message RawSipMessage { optional uint64 message_id = 1; optional SipMessageDirection direction = 2; optional TransportKind transport = 3; optional string start_line = 4; repeated KeyValue headers = 5; optional bytes body = 6; optional string text = 7; optional uint64 content_length = 8; optional uint64 original_size = 9; optional uint64 captured_size = 10; optional bool truncated = 11; optional bool retransmission = 12; optional string remote_addr = 13; optional string local_addr = 14; EventTimestamp timestamp = 15; optional uint64 account_id = 16; optional uint64 call_id = 17; } // business_optional=body,retransmission,remote_addr,local_addr,account_id,call_id; narrow=account_id:Id,call_id:Id
message EventMeta { optional uint64 event_id = 1; EventTimestamp timestamp = 2; optional uint64 runtime_id = 3; optional uint64 client_id = 4; optional uint64 tenant_id = 5; optional uint64 account_id = 6; optional uint64 call_id = 7; optional string request_id = 8; optional Direction direction = 9; repeated KeyValue headers = 10; optional uint32 status_code = 11; optional string reason_phrase = 12; repeated KeyValue logical_context = 13; } // business_optional=client_id,tenant_id,account_id,call_id,request_id,direction,status_code,reason_phrase; narrow=runtime_id:Id,client_id:Id,tenant_id:Id,account_id:Id,call_id:Id,status_code:U16
message RegistrationEvent { optional RegistrationState previous = 1; optional RegistrationState current = 2; optional RegistrationPhase phase = 3; ResultInfo result = 4; EventTimestamp expires_at = 5; optional bool refresh = 6; } // business_optional=result,expires_at; narrow=-
message CallProgress { optional CallState state = 1; optional uint32 sip_status = 2; optional string reason = 3; optional string remote_uri = 4; repeated KeyValue headers = 5; NegotiatedCodec codec = 6; } // business_optional=sip_status,reason,remote_uri,codec; narrow=sip_status:U16
message IncomingCallInfo { optional string from_uri = 1; optional string to_uri = 2; optional string display_name = 3; repeated KeyValue headers = 4; repeated Codec offered_codecs = 5; optional bool has_early_media = 6; } // business_optional=display_name; narrow=-
message DisconnectInfo { optional CallState terminal_state = 1; HangupReason reason = 2; optional DisconnectInitiator initiator = 3; optional uint32 final_status = 4; optional uint64 duration_ms = 5; ResultInfo result = 6; } // business_optional=final_status; narrow=final_status:U16
message CallHeldInfo { optional bool local = 1; optional bool remote = 2; } // business_optional=-; narrow=-
message CallResumedInfo { optional uint64 call_id = 1; optional MediaState previous = 2; } // business_optional=-; narrow=call_id:Id
message ReferRequest { optional uint64 refer_id = 1; optional string refer_to = 2; optional string referred_by = 3; optional string replaces = 4; } // business_optional=referred_by,replaces; narrow=refer_id:Id
message TransferInfo { optional uint64 refer_id = 1; optional string target = 2; optional TransferState stage = 3; optional bool success = 4; optional uint32 sip_status = 5; DoorsError error = 6; } // business_optional=success,sip_status,error; narrow=refer_id:Id,sip_status:U16
message MediaStats { optional uint64 in_frames = 1; optional uint64 out_frames = 2; optional uint64 underruns = 3; optional uint64 overflows = 4; optional uint64 padding_samples = 5; optional uint64 dropped_samples = 6; optional sint64 alignment_drift_ns = 7; } // business_optional=-; narrow=-
message MediaInfo { AudioFormat format = 1; NegotiatedCodec codec = 2; IceInfo ice = 3; SrtpInfo srtp = 4; MediaStats stats = 5; DoorsError error = 6; } // business_optional=format,codec,ice,srtp,error; narrow=-
message DtmfSentInfo { optional string request_id = 1; optional uint32 digit_index = 2; optional string digit = 3; optional DtmfMethod method = 4; optional DtmfStage stage = 5; ResultInfo status = 6; optional CompletionBasis completion_basis = 7; optional sint32 native_status = 8; optional uint32 estimated_after_ms = 9; } // business_optional=native_status,estimated_after_ms; narrow=-
message DtmfReceivedInfo { optional string digit = 1; optional DtmfMethod method = 2; optional uint32 duration_ms = 3; optional sint32 volume_dbm0 = 4; EventTimestamp timestamp = 5; } // business_optional=duration_ms,volume_dbm0; narrow=duration_ms:U16,volume_dbm0:I8
message IceEvent { IceInfo info = 1; } // business_optional=-; narrow=-
message TransportEvent { TransportSnapshot transport = 1; ResultInfo result = 2; } // business_optional=result; narrow=-
message LifecycleEvent { optional uint64 id = 1; optional RuntimePhase phase = 2; ClientCapabilities capabilities = 3; StateSnapshot snapshot = 4; ResultInfo result = 5; } // business_optional=capabilities,snapshot,result; narrow=id:Id
message TsxEvent { optional string method = 1; optional string state = 2; optional uint32 sip_status = 3; } // business_optional=sip_status; narrow=sip_status:U16
message RedirectEvent { repeated string targets = 1; optional bool accepted = 2; optional string reason = 3; } // business_optional=reason; narrow=-
message CallReplacedInfo { optional uint64 old_call_id = 1; optional uint64 new_call_id = 2; } // business_optional=-; narrow=old_call_id:Id,new_call_id:Id
message NatInfo { optional string kind = 1; ResultInfo result = 2; } // business_optional=-; narrow=-
message TlsCertificateInfo { optional uint64 transport_id = 1; optional string server_name = 2; optional string fingerprint_sha256 = 3; optional string subject = 4; optional string issuer = 5; optional sint64 expiry_unix_ns = 6; optional bool verified = 7; } // business_optional=-; narrow=transport_id:Id
message SrvRecord { optional uint32 priority = 1; optional uint32 weight = 2; optional uint32 port = 3; optional string target = 4; } // business_optional=-; narrow=priority:U16,weight:U16,port:U16
message DnsResolutionResult { optional string hostname = 1; repeated string resolved_addresses = 2; repeated SrvRecord srv_records = 3; optional uint32 ttl_secs = 4; DoorsError error = 5; } // business_optional=error; narrow=-
message Credentials { optional AuthMode mode = 1; optional string api_key = 2; optional uint64 account_id = 3; optional string username = 4; optional string domain = 5; optional string password = 6; optional string bootstrap_proof = 7; } // business_optional=api_key,account_id,username,domain,password,bootstrap_proof; narrow=api_key:Secret,account_id:Id,password:Secret,bootstrap_proof:Secret
message TokenResponse { optional string token = 1; optional uint64 expires_in = 2; Principal principal = 3; } // business_optional=-; narrow=token:BearerToken
message PersistedAccount { optional sint64 db_id = 1; optional uint64 tenant_id = 2; optional string client_key = 3; AccountConfig config = 4; optional bool secret_present = 5; optional uint64 revision = 6; } // business_optional=-; narrow=tenant_id:Id
message DeviceSelection { optional string input_id = 1; optional string output_id = 2; } // business_optional=input_id,output_id; narrow=-
message EventPayload { oneof value { RegistrationEvent registration_state_changed = 1; RegistrationEvent registration_updated = 2; CallProgress outgoing_call_started = 3; CallProgress outgoing_call_trying = 4; CallProgress outgoing_call_ringing = 5; MediaInfo early_media_received = 6; CallProgress call_connected = 7; IncomingCallInfo incoming_call = 8; DisconnectInfo call_disconnected = 9; CallProgress call_cancelled = 10; CallHeldInfo call_held = 11; CallResumedInfo call_resumed = 12; ReferRequest refer_received = 13; TransferInfo transfer_completed = 14; MediaInfo media_active = 15; MediaInfo media_stopped = 16; MediaInfo media_error = 17; DtmfSentInfo dtmf_sent = 18; DtmfReceivedInfo dtmf_received = 19; IceEvent ice_negotiation_started = 20; IceEvent ice_negotiation_succeeded = 21; IceEvent ice_negotiation_failed = 22; TransportEvent transport_connected = 23; TransportEvent transport_disconnected = 24; TransportEvent transport_error = 25; AccountSnapshot account_added = 26; AccountSnapshot account_removed = 27; AccountSnapshot account_config_changed = 28; LifecycleEvent client_initialized = 29; LifecycleEvent client_shutdown = 30; LifecycleEvent runtime_initialized = 31; LifecycleEvent runtime_shutdown = 32; TsxEvent call_tsx_state_changed = 33; RedirectEvent call_redirected = 34; TransferInfo call_transfer_status = 35; CallReplacedInfo call_replaced = 36; NatInfo nat_detected = 37; TlsCertificateInfo tls_certificate_info = 38; DnsResolutionResult dns_resolution_result = 39; DoorsError error = 40; } }
message Event { EventMeta meta = 1; optional uint64 event_sequence = 2; optional uint64 revision = 3; EventPayload payload = 4; } // business_optional=-; narrow=-
message ReceivedItem { oneof value { Event event = 1; RawSipMessage raw_sip = 2; GapInfo gap = 3; StateSnapshot snapshot = 4; AudioChunkPair audio_pair = 5; AudioFrame audio_frame = 6; } }
message RuntimeInitializeRequest { RuntimeConfig runtime = 1; ClientConfig client = 2; } // business_optional=-; narrow=-
message RuntimeInitializeResponse { optional uint64 runtime_id = 1; optional uint64 client_id = 2; ClientCapabilities capabilities = 3; optional uint64 revision = 4; } // business_optional=-; narrow=runtime_id:Id,client_id:Id
message RuntimeCapabilitiesGetRequest { optional uint64 client_id = 1; } // business_optional=-; narrow=client_id:Id
message RuntimeCapabilitiesGetResponse { ClientCapabilities capabilities = 1; } // business_optional=-; narrow=-
message RuntimeHealthGetRequest { optional bool detail = 1; } // business_optional=-; narrow=-
message RuntimeHealthGetResponse { optional bool alive = 1; optional bool ready = 2; optional RuntimePhase phase = 3; optional uint64 revision = 4; } // business_optional=-; narrow=-
message RuntimeShutdownRequest { optional uint64 runtime_id = 1; } // business_optional=-; narrow=runtime_id:Id
message RuntimeShutdownResponse { optional uint64 job_id = 1; } // business_optional=-; narrow=job_id:Id
message ClientOpenRequest { ClientConfig config = 1; } // business_optional=-; narrow=-
message ClientOpenResponse { optional uint64 client_id = 1; optional uint64 revision = 2; } // business_optional=-; narrow=client_id:Id
message ClientShutdownRequest { optional uint64 client_id = 1; } // business_optional=-; narrow=client_id:Id
message ClientShutdownResponse { optional uint64 job_id = 1; } // business_optional=-; narrow=job_id:Id
message AccountAddRequest { optional uint64 client_id = 1; AccountConfig config = 2; } // business_optional=-; narrow=client_id:Id
message AccountAddResponse { optional uint64 account_id = 1; optional uint64 revision = 2; } // business_optional=-; narrow=account_id:Id
message AccountGetRequest { optional uint64 account_id = 1; } // business_optional=-; narrow=account_id:Id
message AccountGetResponse { AccountSnapshot snapshot = 1; } // business_optional=-; narrow=-
message AccountListRequest { optional uint64 client_id = 1; } // business_optional=-; narrow=client_id:Id
message AccountListResponse { repeated AccountSnapshot accounts = 1; optional uint64 revision = 2; } // business_optional=-; narrow=-
message AccountUpdateRequest { optional uint64 account_id = 1; AccountConfigPatch patch = 2; } // business_optional=-; narrow=account_id:Id
message AccountUpdateResponse { AccountSnapshot snapshot = 1; optional uint64 job_id = 2; } // business_optional=job_id; narrow=job_id:Id
message AccountRemoveRequest { optional uint64 account_id = 1; optional bool force = 2; } // business_optional=-; narrow=account_id:Id
message AccountRemoveResponse { optional uint64 job_id = 1; } // business_optional=-; narrow=job_id:Id
message AccountRegisterRequest { optional uint64 account_id = 1; } // business_optional=-; narrow=account_id:Id
message AccountRegisterResponse { optional uint64 job_id = 1; optional bool accepted = 2; } // business_optional=-; narrow=job_id:Id
message AccountUnregisterRequest { optional uint64 account_id = 1; } // business_optional=-; narrow=account_id:Id
message AccountUnregisterResponse { optional uint64 job_id = 1; optional bool accepted = 2; } // business_optional=-; narrow=job_id:Id
message AccountRegistrationEnableRequest { optional uint64 account_id = 1; optional bool enabled = 2; } // business_optional=-; narrow=account_id:Id
message AccountRegistrationEnableResponse { optional uint64 job_id = 1; } // business_optional=job_id; narrow=job_id:Id
message AccountRegistrationGetRequest { optional uint64 account_id = 1; } // business_optional=-; narrow=account_id:Id
message AccountRegistrationGetResponse { RegistrationSnapshot snapshot = 1; } // business_optional=-; narrow=-
message CallMakeRequest { optional uint64 account_id = 1; OutgoingCallRequest request = 2; } // business_optional=-; narrow=account_id:Id
message CallMakeResponse { optional uint64 call_id = 1; optional uint64 job_id = 2; } // business_optional=-; narrow=call_id:Id,job_id:Id
message CallListRequest { optional uint64 client_id = 1; } // business_optional=-; narrow=client_id:Id
message CallListResponse { repeated CallSnapshot calls = 1; optional uint64 revision = 2; } // business_optional=-; narrow=-
message CallGetRequest { optional uint64 call_id = 1; } // business_optional=-; narrow=call_id:Id
message CallGetResponse { CallSnapshot snapshot = 1; } // business_optional=-; narrow=-
message CallStateGetRequest { optional uint64 call_id = 1; } // business_optional=-; narrow=call_id:Id
message CallStateGetResponse { optional CallState state = 1; optional uint64 revision = 2; } // business_optional=-; narrow=-
message CallAnswerRequest { optional uint64 call_id = 1; optional uint32 code = 2; } // business_optional=-; narrow=call_id:Id,code:U16
message CallAnswerResponse { optional bool accepted = 1; optional uint64 job_id = 2; } // business_optional=-; narrow=job_id:Id
message CallHangupRequest { optional uint64 call_id = 1; HangupReason reason = 2; } // business_optional=-; narrow=call_id:Id
message CallHangupResponse { optional uint64 job_id = 1; } // business_optional=-; narrow=job_id:Id
message CallHoldRequest { optional uint64 call_id = 1; } // business_optional=-; narrow=call_id:Id
message CallHoldResponse { optional uint64 job_id = 1; } // business_optional=-; narrow=job_id:Id
message CallUnholdRequest { optional uint64 call_id = 1; } // business_optional=-; narrow=call_id:Id
message CallUnholdResponse { optional uint64 job_id = 1; } // business_optional=-; narrow=job_id:Id
message CallTransferRequest { optional uint64 call_id = 1; optional string target = 2; } // business_optional=-; narrow=call_id:Id
message CallTransferResponse { optional uint64 refer_id = 1; optional uint64 job_id = 2; } // business_optional=-; narrow=refer_id:Id,job_id:Id
message CallReferRespondRequest { optional uint64 call_id = 1; optional uint64 refer_id = 2; optional bool accept = 3; } // business_optional=-; narrow=call_id:Id,refer_id:Id
message CallReferRespondResponse { optional bool accepted = 1; } // business_optional=-; narrow=-
message CallDtmfSendRequest { optional uint64 call_id = 1; optional string digits = 2; optional DtmfMethod method = 3; } // business_optional=-; narrow=call_id:Id
message CallDtmfSendResponse { optional uint64 job_id = 1; EventTimestamp accepted_at = 2; } // business_optional=-; narrow=job_id:Id
message SubscriptionControlOpenRequest { optional uint64 client_id = 1; } // business_optional=-; narrow=client_id:Id
message SubscriptionControlOpenResponse { SubscriptionMetadata subscription = 1; } // business_optional=-; narrow=-
message SubscriptionAccountOpenRequest { optional uint64 account_id = 1; } // business_optional=-; narrow=account_id:Id
message SubscriptionAccountOpenResponse { SubscriptionMetadata subscription = 1; } // business_optional=-; narrow=-
message SubscriptionRaw_sipOpenRequest { optional uint64 client_id = 1; } // business_optional=-; narrow=client_id:Id
message SubscriptionRaw_sipOpenResponse { SubscriptionMetadata subscription = 1; } // business_optional=-; narrow=-
message SubscriptionReceiveRequest { optional uint64 subscription_id = 1; } // business_optional=-; narrow=subscription_id:Id
message SubscriptionReceiveResponse { ReceivedItem item = 1; optional bool eof = 2; } // business_optional=item; narrow=-
message SubscriptionCloseRequest { optional uint64 subscription_id = 1; } // business_optional=-; narrow=subscription_id:Id
message SubscriptionCloseResponse { optional bool closed = 1; } // business_optional=-; narrow=-
message MediaTapOpenRequest { optional uint64 call_id = 1; TapSpec spec = 2; } // business_optional=-; narrow=call_id:Id
message MediaTapOpenResponse { StreamMetadata stream = 1; } // business_optional=-; narrow=-
message MediaTapReceiveRequest { optional uint64 stream_id = 1; } // business_optional=-; narrow=stream_id:Id
message MediaTapReceiveResponse { AudioChunkPair item = 1; optional bool eof = 2; } // business_optional=item; narrow=-
message MediaTapCloseRequest { optional uint64 stream_id = 1; } // business_optional=-; narrow=stream_id:Id
message MediaTapCloseResponse { optional bool closed = 1; } // business_optional=-; narrow=-
message MediaSourceAddRequest { optional uint64 call_id = 1; SourceSpec spec = 2; optional ChannelSelector direction = 3; } // business_optional=-; narrow=call_id:Id
message MediaSourceAddResponse { optional uint64 source_id = 1; StreamMetadata stream = 2; } // business_optional=stream; narrow=source_id:Id
message MediaSourceWriteRequest { optional uint64 source_id = 1; AudioFrame frame = 2; } // business_optional=-; narrow=source_id:Id
message MediaSourceWriteResponse { optional uint64 accepted_samples = 1; } // business_optional=-; narrow=-
message MediaSourceFinishRequest { optional uint64 source_id = 1; } // business_optional=-; narrow=source_id:Id
message MediaSourceFinishResponse { optional bool eof = 1; } // business_optional=-; narrow=-
message MediaSourceRemoveRequest { optional uint64 source_id = 1; } // business_optional=-; narrow=source_id:Id
message MediaSourceRemoveResponse { optional bool removed = 1; } // business_optional=-; narrow=-
message MediaSourceGainSetRequest { optional uint64 source_id = 1; optional double gain = 2; } // business_optional=-; narrow=source_id:Id
message MediaSourceGainSetResponse { optional uint64 applied_frame = 1; } // business_optional=-; narrow=-
message MediaSourceMuteSetRequest { optional uint64 source_id = 1; optional bool muted = 2; } // business_optional=-; narrow=source_id:Id
message MediaSourceMuteSetResponse { optional uint64 applied_frame = 1; } // business_optional=-; narrow=-
message MediaSourceReplaceRequest { optional uint64 source_id = 1; SourceSpec spec = 2; } // business_optional=-; narrow=source_id:Id
message MediaSourceReplaceResponse { optional uint64 source_id = 1; optional uint64 applied_frame = 2; } // business_optional=-; narrow=source_id:Id
message MediaMixerGainSetRequest { optional uint64 call_id = 1; optional double gain = 2; } // business_optional=-; narrow=call_id:Id
message MediaMixerGainSetResponse { optional uint64 applied_frame = 1; } // business_optional=-; narrow=-
message MediaMicrophoneOpenRequest { optional uint64 client_id = 1; optional string device_id = 2; AudioFormat format = 3; } // business_optional=device_id; narrow=client_id:Id
message MediaMicrophoneOpenResponse { optional uint64 source_id = 1; } // business_optional=-; narrow=source_id:Id
message MediaDeviceListRequest { optional uint64 client_id = 1; } // business_optional=-; narrow=client_id:Id
message MediaDeviceListResponse { repeated DeviceInfo devices = 1; } // business_optional=-; narrow=-
message MediaDeviceSelectRequest { optional uint64 client_id = 1; optional string input_id = 2; optional string output_id = 3; } // business_optional=input_id,output_id; narrow=client_id:Id
message MediaDeviceSelectResponse { DeviceSelection selected = 1; } // business_optional=-; narrow=-
message MediaDeviceCloseRequest { optional uint64 resource_id = 1; } // business_optional=-; narrow=resource_id:Id
message MediaDeviceCloseResponse { optional bool closed = 1; } // business_optional=-; narrow=-
message MediaSpeakerAttachRequest { optional uint64 call_id = 1; optional string device_id = 2; optional TapPosition position = 3; } // business_optional=device_id; narrow=call_id:Id
message MediaSpeakerAttachResponse { optional uint64 sink_id = 1; } // business_optional=-; narrow=sink_id:Id
message MediaSourceAttachRequest { optional uint64 call_id = 1; optional uint64 source_id = 2; optional ChannelSelector direction = 3; } // business_optional=-; narrow=call_id:Id,source_id:Id
message MediaSourceAttachResponse { optional uint64 applied_frame = 1; } // business_optional=-; narrow=-
message MediaFile_sourceOpenRequest { optional uint64 client_id = 1; optional string path = 2; AudioFormat format = 3; } // business_optional=format; narrow=client_id:Id
message MediaFile_sourceOpenResponse { optional uint64 source_id = 1; AudioFormat format = 2; } // business_optional=-; narrow=source_id:Id
message MediaWav_sinkOpenRequest { optional uint64 call_id = 1; optional string path = 2; AudioFormat format = 3; } // business_optional=-; narrow=call_id:Id
message MediaWav_sinkOpenResponse { optional uint64 sink_id = 1; } // business_optional=-; narrow=sink_id:Id
message MediaWav_sinkWriteRequest { optional uint64 sink_id = 1; AudioChunkPair pair = 2; } // business_optional=-; narrow=sink_id:Id
message MediaWav_sinkWriteResponse { optional uint64 samples_written = 1; } // business_optional=-; narrow=-
message MediaWav_sinkFinishRequest { optional uint64 sink_id = 1; } // business_optional=-; narrow=sink_id:Id
message MediaWav_sinkFinishResponse { optional bool finalized = 1; optional bool partial = 2; } // business_optional=-; narrow=-
message MediaSessionOpenRequest { optional uint64 call_id = 1; SourceSpec input = 2; TapSpec output = 3; } // business_optional=input,output; narrow=call_id:Id
message MediaSessionOpenResponse { StreamMetadata stream = 1; } // business_optional=-; narrow=-
message ConfigValidateRequest { RuntimeConfig runtime = 1; AccountConfig account = 2; } // business_optional=runtime,account; narrow=-
message ConfigValidateResponse { optional bool valid = 1; } // business_optional=-; narrow=-
message ConfigLoadRequest { optional string path = 1; } // business_optional=-; narrow=-
message ConfigLoadResponse { Configuration config = 1; } // business_optional=-; narrow=-
message ConfigGetRequest { optional uint64 client_id = 1; } // business_optional=client_id; narrow=client_id:Id
message ConfigGetResponse { Configuration config = 1; } // business_optional=-; narrow=-
message ConfigPatchRequest { optional uint64 client_id = 1; ConfigPatch patch = 2; } // business_optional=client_id; narrow=client_id:Id
message ConfigPatchResponse { optional uint64 revision = 1; optional uint64 job_id = 2; } // business_optional=job_id; narrow=job_id:Id
message ConfigSaveRequest { optional string path = 1; } // business_optional=path; narrow=-
message ConfigSaveResponse { optional bool saved = 1; optional uint64 revision = 2; } // business_optional=-; narrow=-
message AuthTokenIssueRequest { Credentials credentials = 1; } // business_optional=-; narrow=-
message AuthTokenIssueResponse { TokenResponse token = 1; } // business_optional=-; narrow=-
message AuthCredentialsVerifyRequest { Credentials credentials = 1; } // business_optional=-; narrow=-
message AuthCredentialsVerifyResponse { Principal principal = 1; } // business_optional=-; narrow=-
message AuthRequestAuthorizeRequest { optional string operation_id = 1; optional uint64 target_id = 2; } // business_optional=target_id; narrow=target_id:Id
message AuthRequestAuthorizeResponse { optional bool allowed = 1; } // business_optional=-; narrow=-
message AuthSession_ticketIssueRequest { optional uint64 client_id = 1; repeated string scopes = 2; } // business_optional=-; narrow=client_id:Id
message AuthSession_ticketIssueResponse { optional string ticket = 1; optional uint64 expires_in = 2; } // business_optional=-; narrow=ticket:BearerToken
message PersistenceOpenRequest { optional string path = 1; } // business_optional=-; narrow=-
message PersistenceOpenResponse { optional bool opened = 1; optional uint32 schema_version = 2; } // business_optional=-; narrow=-
message PersistenceAccountsLoadRequest { optional uint64 client_id = 1; } // business_optional=-; narrow=client_id:Id
message PersistenceAccountsLoadResponse { repeated PersistedAccount accounts = 1; } // business_optional=-; narrow=-
message PersistenceAccountSaveRequest { optional uint64 account_id = 1; } // business_optional=-; narrow=account_id:Id
message PersistenceAccountSaveResponse { optional bool saved = 1; } // business_optional=-; narrow=-
message PersistenceAccountDeleteRequest { optional uint64 account_id = 1; } // business_optional=-; narrow=account_id:Id
message PersistenceAccountDeleteResponse { optional bool deleted = 1; } // business_optional=-; narrow=-
message PersistenceMigrationApplyRequest { optional uint32 target_version = 1; optional bool force = 2; } // business_optional=target_version; narrow=-
message PersistenceMigrationApplyResponse { optional uint32 schema_version = 1; } // business_optional=-; narrow=-
message PersistenceRepairRequest { optional uint64 job_id = 1; } // business_optional=-; narrow=job_id:Id
message PersistenceRepairResponse { JobSnapshot job = 1; } // business_optional=-; narrow=-
message TransportCreateRequest { TransportConfig config = 1; } // business_optional=-; narrow=-
message TransportCreateResponse { optional uint64 transport_id = 1; } // business_optional=-; narrow=transport_id:Id
message TransportCloseRequest { optional uint64 transport_id = 1; } // business_optional=-; narrow=transport_id:Id
message TransportCloseResponse { optional bool closed = 1; } // business_optional=-; narrow=-
message TransportReconnectRequest { optional uint64 transport_id = 1; } // business_optional=-; narrow=transport_id:Id
message TransportReconnectResponse { optional uint64 job_id = 1; } // business_optional=-; narrow=job_id:Id
message RegistrationNativeQueryRequest { optional uint64 account_id = 1; } // business_optional=-; narrow=account_id:Id
message RegistrationNativeQueryResponse { RegistrationSnapshot snapshot = 1; } // business_optional=-; narrow=-
message NativeEventsDrainRequest { optional uint64 runtime_id = 1; } // business_optional=-; narrow=runtime_id:Id
message NativeEventsDrainResponse { optional uint32 processed = 1; optional uint64 revision = 2; } // business_optional=-; narrow=-
message NativeEventProcessRequest { optional uint64 runtime_id = 1; optional uint64 event_token = 2; } // business_optional=-; narrow=runtime_id:Id,event_token:Id
message NativeEventProcessResponse { optional bool processed = 1; } // business_optional=-; narrow=-
message Raw_sipCaptureRequest { optional uint64 runtime_id = 1; } // business_optional=-; narrow=runtime_id:Id
message Raw_sipCaptureResponse { optional uint32 captured = 1; } // business_optional=-; narrow=-
message Raw_sipRedactRequest { RawSipMessage message = 1; } // business_optional=-; narrow=-
message Raw_sipRedactResponse { RawSipMessage message = 1; } // business_optional=-; narrow=-
message MediaBridgeRegisterRequest { optional uint64 call_id = 1; } // business_optional=-; narrow=call_id:Id
message MediaBridgeRegisterResponse { optional uint64 bridge_id = 1; } // business_optional=-; narrow=bridge_id:Id
message MediaBridgeConnectRequest { optional uint64 call_id = 1; optional MediaDirection direction = 2; } // business_optional=-; narrow=call_id:Id
message MediaBridgeConnectResponse { optional bool connected = 1; } // business_optional=-; narrow=-
message MediaBridgeDisconnectRequest { optional uint64 call_id = 1; optional MediaDirection direction = 2; } // business_optional=-; narrow=call_id:Id
message MediaBridgeDisconnectResponse { optional bool disconnected = 1; } // business_optional=-; narrow=-
message MediaBridgeRemoveRequest { optional uint64 call_id = 1; } // business_optional=-; narrow=call_id:Id
message MediaBridgeRemoveResponse { optional bool removed = 1; } // business_optional=-; narrow=-
message MediaFrameCaptureRequest { optional uint64 call_id = 1; } // business_optional=-; narrow=call_id:Id
message MediaFrameCaptureResponse { optional uint32 frames_processed = 1; } // business_optional=-; narrow=-
message MediaFrameRenderRequest { optional uint64 call_id = 1; } // business_optional=-; narrow=call_id:Id
message MediaFrameRenderResponse { optional uint32 frames_processed = 1; } // business_optional=-; narrow=-
message MediaWorkerStartRequest { optional uint64 call_id = 1; } // business_optional=-; narrow=call_id:Id
message MediaWorkerStartResponse { optional bool started = 1; } // business_optional=-; narrow=-
message MediaWorkerStopRequest { optional uint64 call_id = 1; } // business_optional=-; narrow=call_id:Id
message MediaWorkerStopResponse { optional bool stopped = 1; } // business_optional=-; narrow=-
message MediaMixFrameRequest { optional uint64 call_id = 1; } // business_optional=-; narrow=call_id:Id
message MediaMixFrameResponse { optional uint64 sample_index = 1; } // business_optional=-; narrow=-
message MediaPairAlignRequest { optional uint64 call_id = 1; } // business_optional=-; narrow=call_id:Id
message MediaPairAlignResponse { optional uint32 pairs_processed = 1; } // business_optional=-; narrow=-
message MediaFormatConvertRequest { AudioFrame frame = 1; AudioFormat format = 2; } // business_optional=-; narrow=-
message MediaFormatConvertResponse { AudioFrame frame = 1; } // business_optional=-; narrow=-
message MediaResampleRequest { optional uint64 stream_id = 1; AudioFrame frame = 2; AudioFormat format = 3; } // business_optional=-; narrow=stream_id:Id
message MediaResampleResponse { repeated AudioFrame frames = 1; } // business_optional=-; narrow=-
message StateSnapshotGetRequest { optional uint64 client_id = 1; } // business_optional=client_id; narrow=client_id:Id
message StateSnapshotGetResponse { StateSnapshot snapshot = 1; } // business_optional=-; narrow=-
message StateTransitionApplyRequest { optional uint64 runtime_id = 1; optional uint64 event_token = 2; } // business_optional=-; narrow=runtime_id:Id,event_token:Id
message StateTransitionApplyResponse { optional uint64 revision = 1; } // business_optional=-; narrow=-
message EventPublishRequest { optional uint64 runtime_id = 1; optional uint64 event_token = 2; } // business_optional=-; narrow=runtime_id:Id,event_token:Id
message EventPublishResponse { optional uint64 event_sequence = 1; } // business_optional=-; narrow=-
message ShutdownCallsTerminateRequest { optional uint64 client_id = 1; } // business_optional=client_id; narrow=client_id:Id
message ShutdownCallsTerminateResponse { PhaseResult phase = 1; } // business_optional=-; narrow=-
message ShutdownAccountsUnregisterRequest { optional uint64 client_id = 1; } // business_optional=client_id; narrow=client_id:Id
message ShutdownAccountsUnregisterResponse { PhaseResult phase = 1; } // business_optional=-; narrow=-
message ShutdownAudioDrainRequest { optional uint64 client_id = 1; } // business_optional=client_id; narrow=client_id:Id
message ShutdownAudioDrainResponse { PhaseResult phase = 1; } // business_optional=-; narrow=-
message ShutdownNativeDestroyRequest { optional uint64 runtime_id = 1; } // business_optional=-; narrow=runtime_id:Id
message ShutdownNativeDestroyResponse { PhaseResult phase = 1; } // business_optional=-; narrow=-
message FailureEntityIsolateRequest { optional uint64 resource_id = 1; optional string reason = 2; } // business_optional=-; narrow=resource_id:Id
message FailureEntityIsolateResponse { optional bool isolated = 1; } // business_optional=-; narrow=-
message FailureEntityCleanupRequest { optional uint64 resource_id = 1; } // business_optional=-; narrow=resource_id:Id
message FailureEntityCleanupResponse { PhaseResult phase = 1; } // business_optional=-; narrow=-
message ObservabilityMetricsGetRequest { optional uint64 client_id = 1; } // business_optional=client_id; narrow=client_id:Id
message ObservabilityMetricsGetResponse { MetricsSnapshot metrics = 1; } // business_optional=-; narrow=-
message ObservabilityLoggingConfigureRequest { optional LogLevel level = 1; } // business_optional=-; narrow=-
message ObservabilityLoggingConfigureResponse { optional bool configured = 1; } // business_optional=-; narrow=-
message JobGetRequest { optional uint64 job_id = 1; } // business_optional=-; narrow=job_id:Id
message JobGetResponse { JobSnapshot job = 1; } // business_optional=-; narrow=-
message JobCancelRequest { optional uint64 job_id = 1; } // business_optional=-; narrow=job_id:Id
message JobCancelResponse { optional bool accepted = 1; } // business_optional=-; narrow=-
message PersistenceMigrationGenerateRequest { optional string name = 1; optional string directory = 2; } // business_optional=-; narrow=-
message PersistenceMigrationGenerateResponse { optional string path = 1; optional uint32 version = 2; } // business_optional=-; narrow=-
message PersistenceMigrationFreshRequest { optional bool force = 1; } // business_optional=-; narrow=-
message PersistenceMigrationFreshResponse { optional uint32 schema_version = 1; } // business_optional=-; narrow=-
message PersistenceMigrationRefreshRequest { optional bool force = 1; optional string directory = 2; } // business_optional=-; narrow=-
message PersistenceMigrationRefreshResponse { optional uint32 schema_version = 1; optional string entities_path = 2; } // business_optional=-; narrow=-
message PersistenceEntitiesGenerateRequest { optional string directory = 1; } // business_optional=-; narrow=-
message PersistenceEntitiesGenerateResponse { repeated string paths = 1; } // business_optional=-; narrow=-
message OperationRequest { oneof value { RuntimeInitializeRequest runtime_initialize = 1; RuntimeCapabilitiesGetRequest runtime_capabilities_get = 2; RuntimeHealthGetRequest runtime_health_get = 3; RuntimeShutdownRequest runtime_shutdown = 4; ClientOpenRequest client_open = 5; ClientShutdownRequest client_shutdown = 6; AccountAddRequest account_add = 7; AccountGetRequest account_get = 8; AccountListRequest account_list = 9; AccountUpdateRequest account_update = 10; AccountRemoveRequest account_remove = 11; AccountRegisterRequest account_register = 12; AccountUnregisterRequest account_unregister = 13; AccountRegistrationEnableRequest account_registration_enable = 14; AccountRegistrationGetRequest account_registration_get = 15; CallMakeRequest call_make = 16; CallListRequest call_list = 17; CallGetRequest call_get = 18; CallStateGetRequest call_state_get = 19; CallAnswerRequest call_answer = 20; CallHangupRequest call_hangup = 21; CallHoldRequest call_hold = 22; CallUnholdRequest call_unhold = 23; CallTransferRequest call_transfer = 24; CallReferRespondRequest call_refer_respond = 25; CallDtmfSendRequest call_dtmf_send = 26; SubscriptionControlOpenRequest subscription_control_open = 27; SubscriptionAccountOpenRequest subscription_account_open = 28; SubscriptionRaw_sipOpenRequest subscription_raw_sip_open = 29; SubscriptionReceiveRequest subscription_receive = 30; SubscriptionCloseRequest subscription_close = 31; MediaTapOpenRequest media_tap_open = 32; MediaTapReceiveRequest media_tap_receive = 33; MediaTapCloseRequest media_tap_close = 34; MediaSourceAddRequest media_source_add = 35; MediaSourceWriteRequest media_source_write = 36; MediaSourceFinishRequest media_source_finish = 37; MediaSourceRemoveRequest media_source_remove = 38; MediaSourceGainSetRequest media_source_gain_set = 39; MediaSourceMuteSetRequest media_source_mute_set = 40; MediaSourceReplaceRequest media_source_replace = 41; MediaMixerGainSetRequest media_mixer_gain_set = 42; MediaMicrophoneOpenRequest media_microphone_open = 43; MediaDeviceListRequest media_device_list = 44; MediaDeviceSelectRequest media_device_select = 45; MediaDeviceCloseRequest media_device_close = 46; MediaSpeakerAttachRequest media_speaker_attach = 47; MediaSourceAttachRequest media_source_attach = 48; MediaFile_sourceOpenRequest media_file_source_open = 49; MediaWav_sinkOpenRequest media_wav_sink_open = 50; MediaWav_sinkWriteRequest media_wav_sink_write = 51; MediaWav_sinkFinishRequest media_wav_sink_finish = 52; MediaSessionOpenRequest media_session_open = 53; ConfigValidateRequest config_validate = 54; ConfigLoadRequest config_load = 55; ConfigGetRequest config_get = 56; ConfigPatchRequest config_patch = 57; ConfigSaveRequest config_save = 58; AuthTokenIssueRequest auth_token_issue = 59; AuthCredentialsVerifyRequest auth_credentials_verify = 60; AuthRequestAuthorizeRequest auth_request_authorize = 61; AuthSession_ticketIssueRequest auth_session_ticket_issue = 62; PersistenceOpenRequest persistence_open = 63; PersistenceAccountsLoadRequest persistence_accounts_load = 64; PersistenceAccountSaveRequest persistence_account_save = 65; PersistenceAccountDeleteRequest persistence_account_delete = 66; PersistenceMigrationApplyRequest persistence_migration_apply = 67; PersistenceRepairRequest persistence_repair = 68; TransportCreateRequest transport_create = 69; TransportCloseRequest transport_close = 70; TransportReconnectRequest transport_reconnect = 71; RegistrationNativeQueryRequest registration_native_query = 72; NativeEventsDrainRequest native_events_drain = 73; NativeEventProcessRequest native_event_process = 74; Raw_sipCaptureRequest raw_sip_capture = 75; Raw_sipRedactRequest raw_sip_redact = 76; MediaBridgeRegisterRequest media_bridge_register = 77; MediaBridgeConnectRequest media_bridge_connect = 78; MediaBridgeDisconnectRequest media_bridge_disconnect = 79; MediaBridgeRemoveRequest media_bridge_remove = 80; MediaFrameCaptureRequest media_frame_capture = 81; MediaFrameRenderRequest media_frame_render = 82; MediaWorkerStartRequest media_worker_start = 83; MediaWorkerStopRequest media_worker_stop = 84; MediaMixFrameRequest media_mix_frame = 85; MediaPairAlignRequest media_pair_align = 86; MediaFormatConvertRequest media_format_convert = 87; MediaResampleRequest media_resample = 88; StateSnapshotGetRequest state_snapshot_get = 89; StateTransitionApplyRequest state_transition_apply = 90; EventPublishRequest event_publish = 91; ShutdownCallsTerminateRequest shutdown_calls_terminate = 92; ShutdownAccountsUnregisterRequest shutdown_accounts_unregister = 93; ShutdownAudioDrainRequest shutdown_audio_drain = 94; ShutdownNativeDestroyRequest shutdown_native_destroy = 95; FailureEntityIsolateRequest failure_entity_isolate = 96; FailureEntityCleanupRequest failure_entity_cleanup = 97; ObservabilityMetricsGetRequest observability_metrics_get = 98; ObservabilityLoggingConfigureRequest observability_logging_configure = 99; JobGetRequest job_get = 100; JobCancelRequest job_cancel = 101; PersistenceMigrationGenerateRequest persistence_migration_generate = 102; PersistenceMigrationFreshRequest persistence_migration_fresh = 103; PersistenceMigrationRefreshRequest persistence_migration_refresh = 104; PersistenceEntitiesGenerateRequest persistence_entities_generate = 105; } }
message OperationResponse { oneof value { RuntimeInitializeResponse runtime_initialize = 1; RuntimeCapabilitiesGetResponse runtime_capabilities_get = 2; RuntimeHealthGetResponse runtime_health_get = 3; RuntimeShutdownResponse runtime_shutdown = 4; ClientOpenResponse client_open = 5; ClientShutdownResponse client_shutdown = 6; AccountAddResponse account_add = 7; AccountGetResponse account_get = 8; AccountListResponse account_list = 9; AccountUpdateResponse account_update = 10; AccountRemoveResponse account_remove = 11; AccountRegisterResponse account_register = 12; AccountUnregisterResponse account_unregister = 13; AccountRegistrationEnableResponse account_registration_enable = 14; AccountRegistrationGetResponse account_registration_get = 15; CallMakeResponse call_make = 16; CallListResponse call_list = 17; CallGetResponse call_get = 18; CallStateGetResponse call_state_get = 19; CallAnswerResponse call_answer = 20; CallHangupResponse call_hangup = 21; CallHoldResponse call_hold = 22; CallUnholdResponse call_unhold = 23; CallTransferResponse call_transfer = 24; CallReferRespondResponse call_refer_respond = 25; CallDtmfSendResponse call_dtmf_send = 26; SubscriptionControlOpenResponse subscription_control_open = 27; SubscriptionAccountOpenResponse subscription_account_open = 28; SubscriptionRaw_sipOpenResponse subscription_raw_sip_open = 29; SubscriptionReceiveResponse subscription_receive = 30; SubscriptionCloseResponse subscription_close = 31; MediaTapOpenResponse media_tap_open = 32; MediaTapReceiveResponse media_tap_receive = 33; MediaTapCloseResponse media_tap_close = 34; MediaSourceAddResponse media_source_add = 35; MediaSourceWriteResponse media_source_write = 36; MediaSourceFinishResponse media_source_finish = 37; MediaSourceRemoveResponse media_source_remove = 38; MediaSourceGainSetResponse media_source_gain_set = 39; MediaSourceMuteSetResponse media_source_mute_set = 40; MediaSourceReplaceResponse media_source_replace = 41; MediaMixerGainSetResponse media_mixer_gain_set = 42; MediaMicrophoneOpenResponse media_microphone_open = 43; MediaDeviceListResponse media_device_list = 44; MediaDeviceSelectResponse media_device_select = 45; MediaDeviceCloseResponse media_device_close = 46; MediaSpeakerAttachResponse media_speaker_attach = 47; MediaSourceAttachResponse media_source_attach = 48; MediaFile_sourceOpenResponse media_file_source_open = 49; MediaWav_sinkOpenResponse media_wav_sink_open = 50; MediaWav_sinkWriteResponse media_wav_sink_write = 51; MediaWav_sinkFinishResponse media_wav_sink_finish = 52; MediaSessionOpenResponse media_session_open = 53; ConfigValidateResponse config_validate = 54; ConfigLoadResponse config_load = 55; ConfigGetResponse config_get = 56; ConfigPatchResponse config_patch = 57; ConfigSaveResponse config_save = 58; AuthTokenIssueResponse auth_token_issue = 59; AuthCredentialsVerifyResponse auth_credentials_verify = 60; AuthRequestAuthorizeResponse auth_request_authorize = 61; AuthSession_ticketIssueResponse auth_session_ticket_issue = 62; PersistenceOpenResponse persistence_open = 63; PersistenceAccountsLoadResponse persistence_accounts_load = 64; PersistenceAccountSaveResponse persistence_account_save = 65; PersistenceAccountDeleteResponse persistence_account_delete = 66; PersistenceMigrationApplyResponse persistence_migration_apply = 67; PersistenceRepairResponse persistence_repair = 68; TransportCreateResponse transport_create = 69; TransportCloseResponse transport_close = 70; TransportReconnectResponse transport_reconnect = 71; RegistrationNativeQueryResponse registration_native_query = 72; NativeEventsDrainResponse native_events_drain = 73; NativeEventProcessResponse native_event_process = 74; Raw_sipCaptureResponse raw_sip_capture = 75; Raw_sipRedactResponse raw_sip_redact = 76; MediaBridgeRegisterResponse media_bridge_register = 77; MediaBridgeConnectResponse media_bridge_connect = 78; MediaBridgeDisconnectResponse media_bridge_disconnect = 79; MediaBridgeRemoveResponse media_bridge_remove = 80; MediaFrameCaptureResponse media_frame_capture = 81; MediaFrameRenderResponse media_frame_render = 82; MediaWorkerStartResponse media_worker_start = 83; MediaWorkerStopResponse media_worker_stop = 84; MediaMixFrameResponse media_mix_frame = 85; MediaPairAlignResponse media_pair_align = 86; MediaFormatConvertResponse media_format_convert = 87; MediaResampleResponse media_resample = 88; StateSnapshotGetResponse state_snapshot_get = 89; StateTransitionApplyResponse state_transition_apply = 90; EventPublishResponse event_publish = 91; ShutdownCallsTerminateResponse shutdown_calls_terminate = 92; ShutdownAccountsUnregisterResponse shutdown_accounts_unregister = 93; ShutdownAudioDrainResponse shutdown_audio_drain = 94; ShutdownNativeDestroyResponse shutdown_native_destroy = 95; FailureEntityIsolateResponse failure_entity_isolate = 96; FailureEntityCleanupResponse failure_entity_cleanup = 97; ObservabilityMetricsGetResponse observability_metrics_get = 98; ObservabilityLoggingConfigureResponse observability_logging_configure = 99; JobGetResponse job_get = 100; JobCancelResponse job_cancel = 101; PersistenceMigrationGenerateResponse persistence_migration_generate = 102; PersistenceMigrationFreshResponse persistence_migration_fresh = 103; PersistenceMigrationRefreshResponse persistence_migration_refresh = 104; PersistenceEntitiesGenerateResponse persistence_entities_generate = 105; } }
message StreamPacket { oneof value { AudioFrame frame = 1; GapInfo gap = 2; AudioChunkPair pair = 3; ReceivedItem item = 4; Empty eof = 5; } }
message SubscriptionControlOpenStreamResponse { SubscriptionControlOpenResponse response = 1; ReceivedItem item = 2; DoorsError error = 3; optional bool eof = 4; } // business_optional=response,item,error; narrow=-
message SubscriptionAccountOpenStreamResponse { SubscriptionAccountOpenResponse response = 1; ReceivedItem item = 2; DoorsError error = 3; optional bool eof = 4; } // business_optional=response,item,error; narrow=-
message SubscriptionRaw_sipOpenStreamResponse { SubscriptionRaw_sipOpenResponse response = 1; ReceivedItem item = 2; DoorsError error = 3; optional bool eof = 4; } // business_optional=response,item,error; narrow=-
message SubscriptionReceiveStreamResponse { SubscriptionReceiveResponse response = 1; ReceivedItem item = 2; DoorsError error = 3; optional bool eof = 4; } // business_optional=response,item,error; narrow=-
message MediaTapOpenStreamResponse { MediaTapOpenResponse response = 1; ReceivedItem item = 2; DoorsError error = 3; optional bool eof = 4; } // business_optional=response,item,error; narrow=-
message MediaTapReceiveStreamResponse { MediaTapReceiveResponse response = 1; ReceivedItem item = 2; DoorsError error = 3; optional bool eof = 4; } // business_optional=response,item,error; narrow=-
message MediaSourceWriteStreamRequest { MediaSourceWriteRequest request = 1; StreamPacket packet = 2; optional bool close = 3; } // business_optional=request,packet; narrow=-
message MediaWav_sinkWriteStreamRequest { MediaWav_sinkWriteRequest request = 1; StreamPacket packet = 2; optional bool close = 3; } // business_optional=request,packet; narrow=-
message MediaSessionOpenStreamRequest { MediaSessionOpenRequest request = 1; StreamPacket packet = 2; optional bool close = 3; } // business_optional=request,packet; narrow=-
message MediaSessionOpenStreamResponse { MediaSessionOpenResponse response = 1; ReceivedItem item = 2; DoorsError error = 3; optional bool eof = 4; } // business_optional=response,item,error; narrow=-
message MediaResampleStreamRequest { MediaResampleRequest request = 1; StreamPacket packet = 2; optional bool close = 3; } // business_optional=request,packet; narrow=-
message MediaResampleStreamResponse { MediaResampleResponse response = 1; ReceivedItem item = 2; DoorsError error = 3; optional bool eof = 4; } // business_optional=response,item,error; narrow=-
service Doors {
  rpc RuntimeInitialize(RuntimeInitializeRequest) returns (RuntimeInitializeResponse);
  rpc RuntimeCapabilitiesGet(RuntimeCapabilitiesGetRequest) returns (RuntimeCapabilitiesGetResponse);
  rpc RuntimeHealthGet(RuntimeHealthGetRequest) returns (RuntimeHealthGetResponse);
  rpc RuntimeShutdown(RuntimeShutdownRequest) returns (RuntimeShutdownResponse);
  rpc ClientOpen(ClientOpenRequest) returns (ClientOpenResponse);
  rpc ClientShutdown(ClientShutdownRequest) returns (ClientShutdownResponse);
  rpc AccountAdd(AccountAddRequest) returns (AccountAddResponse);
  rpc AccountGet(AccountGetRequest) returns (AccountGetResponse);
  rpc AccountList(AccountListRequest) returns (AccountListResponse);
  rpc AccountUpdate(AccountUpdateRequest) returns (AccountUpdateResponse);
  rpc AccountRemove(AccountRemoveRequest) returns (AccountRemoveResponse);
  rpc AccountRegister(AccountRegisterRequest) returns (AccountRegisterResponse);
  rpc AccountUnregister(AccountUnregisterRequest) returns (AccountUnregisterResponse);
  rpc AccountRegistrationEnable(AccountRegistrationEnableRequest) returns (AccountRegistrationEnableResponse);
  rpc AccountRegistrationGet(AccountRegistrationGetRequest) returns (AccountRegistrationGetResponse);
  rpc CallMake(CallMakeRequest) returns (CallMakeResponse);
  rpc CallList(CallListRequest) returns (CallListResponse);
  rpc CallGet(CallGetRequest) returns (CallGetResponse);
  rpc CallStateGet(CallStateGetRequest) returns (CallStateGetResponse);
  rpc CallAnswer(CallAnswerRequest) returns (CallAnswerResponse);
  rpc CallHangup(CallHangupRequest) returns (CallHangupResponse);
  rpc CallHold(CallHoldRequest) returns (CallHoldResponse);
  rpc CallUnhold(CallUnholdRequest) returns (CallUnholdResponse);
  rpc CallTransfer(CallTransferRequest) returns (CallTransferResponse);
  rpc CallReferRespond(CallReferRespondRequest) returns (CallReferRespondResponse);
  rpc CallDtmfSend(CallDtmfSendRequest) returns (CallDtmfSendResponse);
  rpc SubscriptionControlOpen(SubscriptionControlOpenRequest) returns (stream SubscriptionControlOpenStreamResponse);
  rpc SubscriptionAccountOpen(SubscriptionAccountOpenRequest) returns (stream SubscriptionAccountOpenStreamResponse);
  rpc SubscriptionRaw_sipOpen(SubscriptionRaw_sipOpenRequest) returns (stream SubscriptionRaw_sipOpenStreamResponse);
  rpc SubscriptionReceive(SubscriptionReceiveRequest) returns (stream SubscriptionReceiveStreamResponse);
  rpc SubscriptionClose(SubscriptionCloseRequest) returns (SubscriptionCloseResponse);
  rpc MediaTapOpen(MediaTapOpenRequest) returns (stream MediaTapOpenStreamResponse);
  rpc MediaTapReceive(MediaTapReceiveRequest) returns (stream MediaTapReceiveStreamResponse);
  rpc MediaTapClose(MediaTapCloseRequest) returns (MediaTapCloseResponse);
  rpc MediaSourceAdd(MediaSourceAddRequest) returns (MediaSourceAddResponse);
  rpc MediaSourceWrite(stream MediaSourceWriteStreamRequest) returns (MediaSourceWriteResponse);
  rpc MediaSourceFinish(MediaSourceFinishRequest) returns (MediaSourceFinishResponse);
  rpc MediaSourceRemove(MediaSourceRemoveRequest) returns (MediaSourceRemoveResponse);
  rpc MediaSourceGainSet(MediaSourceGainSetRequest) returns (MediaSourceGainSetResponse);
  rpc MediaSourceMuteSet(MediaSourceMuteSetRequest) returns (MediaSourceMuteSetResponse);
  rpc MediaSourceReplace(MediaSourceReplaceRequest) returns (MediaSourceReplaceResponse);
  rpc MediaMixerGainSet(MediaMixerGainSetRequest) returns (MediaMixerGainSetResponse);
  rpc MediaMicrophoneOpen(MediaMicrophoneOpenRequest) returns (MediaMicrophoneOpenResponse);
  rpc MediaDeviceList(MediaDeviceListRequest) returns (MediaDeviceListResponse);
  rpc MediaDeviceSelect(MediaDeviceSelectRequest) returns (MediaDeviceSelectResponse);
  rpc MediaDeviceClose(MediaDeviceCloseRequest) returns (MediaDeviceCloseResponse);
  rpc MediaSpeakerAttach(MediaSpeakerAttachRequest) returns (MediaSpeakerAttachResponse);
  rpc MediaSourceAttach(MediaSourceAttachRequest) returns (MediaSourceAttachResponse);
  rpc MediaFile_sourceOpen(MediaFile_sourceOpenRequest) returns (MediaFile_sourceOpenResponse);
  rpc MediaWav_sinkOpen(MediaWav_sinkOpenRequest) returns (MediaWav_sinkOpenResponse);
  rpc MediaWav_sinkWrite(stream MediaWav_sinkWriteStreamRequest) returns (MediaWav_sinkWriteResponse);
  rpc MediaWav_sinkFinish(MediaWav_sinkFinishRequest) returns (MediaWav_sinkFinishResponse);
  rpc MediaSessionOpen(stream MediaSessionOpenStreamRequest) returns (stream MediaSessionOpenStreamResponse);
  rpc ConfigValidate(ConfigValidateRequest) returns (ConfigValidateResponse);
  rpc ConfigLoad(ConfigLoadRequest) returns (ConfigLoadResponse);
  rpc ConfigGet(ConfigGetRequest) returns (ConfigGetResponse);
  rpc ConfigPatch(ConfigPatchRequest) returns (ConfigPatchResponse);
  rpc ConfigSave(ConfigSaveRequest) returns (ConfigSaveResponse);
  rpc AuthTokenIssue(AuthTokenIssueRequest) returns (AuthTokenIssueResponse);
  rpc AuthCredentialsVerify(AuthCredentialsVerifyRequest) returns (AuthCredentialsVerifyResponse);
  rpc AuthRequestAuthorize(AuthRequestAuthorizeRequest) returns (AuthRequestAuthorizeResponse);
  rpc AuthSession_ticketIssue(AuthSession_ticketIssueRequest) returns (AuthSession_ticketIssueResponse);
  rpc PersistenceOpen(PersistenceOpenRequest) returns (PersistenceOpenResponse);
  rpc PersistenceAccountsLoad(PersistenceAccountsLoadRequest) returns (PersistenceAccountsLoadResponse);
  rpc PersistenceAccountSave(PersistenceAccountSaveRequest) returns (PersistenceAccountSaveResponse);
  rpc PersistenceAccountDelete(PersistenceAccountDeleteRequest) returns (PersistenceAccountDeleteResponse);
  rpc PersistenceMigrationApply(PersistenceMigrationApplyRequest) returns (PersistenceMigrationApplyResponse);
  rpc PersistenceRepair(PersistenceRepairRequest) returns (PersistenceRepairResponse);
  rpc TransportCreate(TransportCreateRequest) returns (TransportCreateResponse);
  rpc TransportClose(TransportCloseRequest) returns (TransportCloseResponse);
  rpc TransportReconnect(TransportReconnectRequest) returns (TransportReconnectResponse);
  rpc RegistrationNativeQuery(RegistrationNativeQueryRequest) returns (RegistrationNativeQueryResponse);
  rpc NativeEventsDrain(NativeEventsDrainRequest) returns (NativeEventsDrainResponse);
  rpc NativeEventProcess(NativeEventProcessRequest) returns (NativeEventProcessResponse);
  rpc Raw_sipCapture(Raw_sipCaptureRequest) returns (Raw_sipCaptureResponse);
  rpc Raw_sipRedact(Raw_sipRedactRequest) returns (Raw_sipRedactResponse);
  rpc MediaBridgeRegister(MediaBridgeRegisterRequest) returns (MediaBridgeRegisterResponse);
  rpc MediaBridgeConnect(MediaBridgeConnectRequest) returns (MediaBridgeConnectResponse);
  rpc MediaBridgeDisconnect(MediaBridgeDisconnectRequest) returns (MediaBridgeDisconnectResponse);
  rpc MediaBridgeRemove(MediaBridgeRemoveRequest) returns (MediaBridgeRemoveResponse);
  rpc MediaFrameCapture(MediaFrameCaptureRequest) returns (MediaFrameCaptureResponse);
  rpc MediaFrameRender(MediaFrameRenderRequest) returns (MediaFrameRenderResponse);
  rpc MediaWorkerStart(MediaWorkerStartRequest) returns (MediaWorkerStartResponse);
  rpc MediaWorkerStop(MediaWorkerStopRequest) returns (MediaWorkerStopResponse);
  rpc MediaMixFrame(MediaMixFrameRequest) returns (MediaMixFrameResponse);
  rpc MediaPairAlign(MediaPairAlignRequest) returns (MediaPairAlignResponse);
  rpc MediaFormatConvert(MediaFormatConvertRequest) returns (MediaFormatConvertResponse);
  rpc MediaResample(stream MediaResampleStreamRequest) returns (stream MediaResampleStreamResponse);
  rpc StateSnapshotGet(StateSnapshotGetRequest) returns (StateSnapshotGetResponse);
  rpc StateTransitionApply(StateTransitionApplyRequest) returns (StateTransitionApplyResponse);
  rpc EventPublish(EventPublishRequest) returns (EventPublishResponse);
  rpc ShutdownCallsTerminate(ShutdownCallsTerminateRequest) returns (ShutdownCallsTerminateResponse);
  rpc ShutdownAccountsUnregister(ShutdownAccountsUnregisterRequest) returns (ShutdownAccountsUnregisterResponse);
  rpc ShutdownAudioDrain(ShutdownAudioDrainRequest) returns (ShutdownAudioDrainResponse);
  rpc ShutdownNativeDestroy(ShutdownNativeDestroyRequest) returns (ShutdownNativeDestroyResponse);
  rpc FailureEntityIsolate(FailureEntityIsolateRequest) returns (FailureEntityIsolateResponse);
  rpc FailureEntityCleanup(FailureEntityCleanupRequest) returns (FailureEntityCleanupResponse);
  rpc ObservabilityMetricsGet(ObservabilityMetricsGetRequest) returns (ObservabilityMetricsGetResponse);
  rpc ObservabilityLoggingConfigure(ObservabilityLoggingConfigureRequest) returns (ObservabilityLoggingConfigureResponse);
  rpc JobGet(JobGetRequest) returns (JobGetResponse);
  rpc JobCancel(JobCancelRequest) returns (JobCancelResponse);
  rpc PersistenceMigrationGenerate(PersistenceMigrationGenerateRequest) returns (PersistenceMigrationGenerateResponse);
  rpc PersistenceMigrationFresh(PersistenceMigrationFreshRequest) returns (PersistenceMigrationFreshResponse);
  rpc PersistenceMigrationRefresh(PersistenceMigrationRefreshRequest) returns (PersistenceMigrationRefreshResponse);
  rpc PersistenceEntitiesGenerate(PersistenceEntitiesGenerateRequest) returns (PersistenceEntitiesGenerateResponse);
}
```

## 16 全105操作・実処理・全インターフェース・適合仕様

各票の型は§15に全field定義。共通前処理/失敗集合は§04、個別前提/手順/補償/事後条件を以下に確定。operation handlerが全編成を所有、coreは各手順のnative/状態/queue/DB/音声safe primitive、adapter独自処理禁止。型付きwire入口とfixtureだけでなく本票の実処理を実装。U/S/C/Bは§11で定義したstream契約。

### OP001 runtime.initialize
型 `RuntimeInitializeRequest → RuntimeInitializeResponse`。scope=admin、mode=U。前提：未初期化又は互換Runtime。順序：validate→pjsua_create/init→transport→start/nullclock→Client生成/snapshot/event。失敗/補償：途中失敗全逆順回収、共有不一致Conflict。事後：Running、native初期化1回。
実装 `doors_operation::handlers::runtime::initialize`。CLI `doors runtime initialize`。REST `POST /api/v1/operations/runtime.initialize`（request同型）。WS `operation_id="runtime.initialize"`（payload同型）。gRPC `doors.v1.Doors/RuntimeInitialize`（§15に実method/stream宣言）。
適合 `CF_runtime_initialize`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP002 runtime.capabilities.get
型 `RuntimeCapabilitiesGetRequest → RuntimeCapabilitiesGetResponse`。scope=read、mode=U。前提：Client可視。順序：manifest/native/device snapshotを合成。失敗/補償：未検出を対応trueにしない。事後：state不変。
実装 `doors_operation::handlers::runtime::capabilities::get`。CLI `doors runtime capabilities get`。REST `POST /api/v1/operations/runtime.capabilities.get`（request同型）。WS `operation_id="runtime.capabilities.get"`（payload同型）。gRPC `doors.v1.Doors/RuntimeCapabilitiesGet`（§15に実method/stream宣言）。
適合 `CF_runtime_capabilities_get`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP003 runtime.health.get
型 `RuntimeHealthGetRequest → RuntimeHealthGetResponse`。scope=public、mode=U。前提：detailはadmin。順序：heartbeat/native/worker/DB確認、public詳細秘匿。失敗/補償：readyfalseとerrorを区別。事後：state不変。
実装 `doors_operation::handlers::runtime::health::get`。CLI `doors runtime health get`。REST `POST /api/v1/operations/runtime.health.get`（request同型）。WS `operation_id="runtime.health.get"`（payload同型）。gRPC `doors.v1.Doors/RuntimeHealthGet`（§15に実method/stream宣言）。
適合 `CF_runtime_health_get`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP004 runtime.shutdown
型 `RuntimeShutdownRequest → RuntimeShutdownResponse`。scope=admin、mode=U。前提：Running又は停止中。順序：同shutdownjobへjoin、§12全手順。失敗/補償：phaseerror蓄積/残存明示。事後：全caller同結果。
実装 `doors_operation::handlers::runtime::shutdown`。CLI `doors runtime shutdown`。REST `POST /api/v1/operations/runtime.shutdown`（request同型）。WS `operation_id="runtime.shutdown"`（payload同型）。gRPC `doors.v1.Doors/RuntimeShutdown`（§15に実method/stream宣言）。
適合 `CF_runtime_shutdown`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP005 client.open
型 `ClientOpenRequest → ClientOpenResponse`。scope=admin、mode=U。前提：Runtime Running。順序：tenant権限→ID/bus/index→Initialized。失敗/補償：途中全回収。事後：Client隔離。
実装 `doors_operation::handlers::client::open`。CLI `doors client open`。REST `POST /api/v1/operations/client.open`（request同型）。WS `operation_id="client.open"`（payload同型）。gRPC `doors.v1.Doors/ClientOpen`（§15に実method/stream宣言）。
適合 `CF_client_open`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP006 client.shutdown
型 `ClientShutdownRequest → ClientShutdownResponse`。scope=control、mode=U。前提：所有Client。順序：gate→自call/account/audio→EOF。失敗/補償：共有native/他Client破棄禁止。事後：Client終端Runtime維持。
実装 `doors_operation::handlers::client::shutdown`。CLI `doors client shutdown`。REST `POST /api/v1/operations/client.shutdown`（request同型）。WS `operation_id="client.shutdown"`（payload同型）。gRPC `doors.v1.Doors/ClientShutdown`（§15に実method/stream宣言）。
適合 `CF_client_shutdown`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP007 account.add
型 `AccountAddRequest → AccountAddResponse`。scope=control、mode=U。前提：Running/容量余裕。順序：configdefault→nativepool/cred→acc_add→index→Added→必要ならregister。失敗/補償：native失敗予約破棄、登録失敗はaccount残す。事後：account可視、登録結果別。
実装 `doors_operation::handlers::account::add`。CLI `doors account add`。REST `POST /api/v1/operations/account.add`（request同型）。WS `operation_id="account.add"`（payload同型）。gRPC `doors.v1.Doors/AccountAdd`（§15に実method/stream宣言）。
適合 `CF_account_add`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP008 account.get
型 `AccountGetRequest → AccountGetResponse`。scope=read、mode=U。前提：対象可視。順序：同revision snapshot/秘密redact。失敗/補償：NotFound。事後：不変。
実装 `doors_operation::handlers::account::get`。CLI `doors account get`。REST `POST /api/v1/operations/account.get`（request同型）。WS `operation_id="account.get"`（payload同型）。gRPC `doors.v1.Doors/AccountGet`（§15に実method/stream宣言）。
適合 `CF_account_get`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP009 account.list
型 `AccountListRequest → AccountListResponse`。scope=read、mode=U。前提：Client可視。順序：自Client全accountをID昇順snapshot。失敗/補償：越境0。事後：不変。
実装 `doors_operation::handlers::account::list`。CLI `doors account list`。REST `POST /api/v1/operations/account.list`（request同型）。WS `operation_id="account.list"`（payload同型）。gRPC `doors.v1.Doors/AccountList`（§15に実method/stream宣言）。
適合 `CF_account_list`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP010 account.update
型 `AccountUpdateRequest → AccountUpdateResponse`。scope=control、mode=U。前提：削除中でない。順序：beforeclone→patchvalidate→acc_modify→DB→snapshot→必要登録。失敗/補償：native拒否before、DB失敗native補償/repair。事後：Changed一回。
実装 `doors_operation::handlers::account::update`。CLI `doors account update`。REST `POST /api/v1/operations/account.update`（request同型）。WS `operation_id="account.update"`（payload同型）。gRPC `doors.v1.Doors/AccountUpdate`（§15に実method/stream宣言）。
適合 `CF_account_update`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP011 account.remove
型 `AccountRemoveRequest → AccountRemoveResponse`。scope=control、mode=U。前提：通話ありforcefalse拒否。順序：gate→call終了→unregister→acc_del→DB→tombstone→Removed。失敗/補償：解除timeout/DB失敗残存とrepair。事後：publicID再利用0。
実装 `doors_operation::handlers::account::remove`。CLI `doors account remove`。REST `POST /api/v1/operations/account.remove`（request同型）。WS `operation_id="account.remove"`（payload同型）。gRPC `doors.v1.Doors/AccountRemove`（§15に実method/stream宣言）。
適合 `CF_account_remove`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP012 account.register
型 `AccountRegisterRequest → AccountRegisterResponse`。scope=control、mode=U。前提：account生存。順序：desiredtrue、重複join/逆FIFO、acc_set_registration(true)→job。失敗/補償：native拒否Failed、challenge継続。事後：実200のみRegistered。
実装 `doors_operation::handlers::account::register`。CLI `doors account register`。REST `POST /api/v1/operations/account.register`（request同型）。WS `operation_id="account.register"`（payload同型）。gRPC `doors.v1.Doors/AccountRegister`（§15に実method/stream宣言）。
適合 `CF_account_register`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP013 account.unregister
型 `AccountUnregisterRequest → AccountUnregisterResponse`。scope=control、mode=U。前提：account生存。順序：Idle冪等、acc_set_registration(false)→Unregistering。失敗/補償：失敗旧binding情報保持。事後：expires0でIdle/Disabled。
実装 `doors_operation::handlers::account::unregister`。CLI `doors account unregister`。REST `POST /api/v1/operations/account.unregister`（request同型）。WS `operation_id="account.unregister"`（payload同型）。gRPC `doors.v1.Doors/AccountUnregister`（§15に実method/stream宣言）。
適合 `CF_account_unregister`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP014 account.registration.enable
型 `AccountRegistrationEnableRequest → AccountRegistrationEnableResponse`。scope=control、mode=U。前提：account生存。順序：desired更新→true登録/false解除後Disabled。失敗/補償：設定結果とwire結果別。事後：desired/state整合。
実装 `doors_operation::handlers::account::registration::enable`。CLI `doors account registration enable`。REST `POST /api/v1/operations/account.registration.enable`（request同型）。WS `operation_id="account.registration.enable"`（payload同型）。gRPC `doors.v1.Doors/AccountRegistrationEnable`（§15に実method/stream宣言）。
適合 `CF_account_registration_enable`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP015 account.registration.get
型 `AccountRegistrationGetRequest → AccountRegistrationGetResponse`。scope=read、mode=U。前提：可視。順序：snapshotと期限取得。失敗/補償：NotFound。事後：不変。
実装 `doors_operation::handlers::account::registration::get`。CLI `doors account registration get`。REST `POST /api/v1/operations/account.registration.get`（request同型）。WS `operation_id="account.registration.get"`（payload同型）。gRPC `doors.v1.Doors/AccountRegistrationGet`（§15に実method/stream宣言）。
適合 `CF_account_registration_get`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP016 call.make
型 `CallMakeRequest → CallMakeResponse`。scope=call、mode=U。前提：未登録policy/codec/全上限。順序：容量/ID/世代予約→pendingToken→make_call→bimap→Calling。失敗/補償：native失敗予約解放、同期callback捕捉。事後：接続確定別。
実装 `doors_operation::handlers::call::make`。CLI `doors call make`。REST `POST /api/v1/operations/call.make`（request同型）。WS `operation_id="call.make"`（payload同型）。gRPC `doors.v1.Doors/CallMake`（§15に実method/stream宣言）。
適合 `CF_call_make`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP017 call.list
型 `CallListRequest → CallListResponse`。scope=read、mode=U。前提：Client可視。順序：terminal保持内含めID昇順同snapshot。失敗/補償：越境0。事後：不変。
実装 `doors_operation::handlers::call::list`。CLI `doors call list`。REST `POST /api/v1/operations/call.list`（request同型）。WS `operation_id="call.list"`（payload同型）。gRPC `doors.v1.Doors/CallList`（§15に実method/stream宣言）。
適合 `CF_call_list`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP018 call.get
型 `CallGetRequest → CallGetResponse`。scope=read、mode=U。前提：可視。順序：snapshot複製。失敗/補償：期限後NotFound。事後：不変。
実装 `doors_operation::handlers::call::get`。CLI `doors call get`。REST `POST /api/v1/operations/call.get`（request同型）。WS `operation_id="call.get"`（payload同型）。gRPC `doors.v1.Doors/CallGet`（§15に実method/stream宣言）。
適合 `CF_call_get`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP019 call.state.get
型 `CallStateGetRequest → CallStateGetResponse`。scope=read、mode=U。前提：可視。順序：state/revision取得。失敗/補償：NotFound。事後：不変。
実装 `doors_operation::handlers::call::state::get`。CLI `doors call state get`。REST `POST /api/v1/operations/call.state.get`（request同型）。WS `operation_id="call.state.get"`（payload同型）。gRPC `doors.v1.Doors/CallStateGet`（§15に実method/stream宣言）。
適合 `CF_call_state_get`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP020 call.answer
型 `CallAnswerRequest → CallAnswerResponse`。scope=control、mode=U。前提：incoming未最終/code180183200486603。順序：call_answer→provisional/Connecting/拒否待ち、最終時timer取消。失敗/補償：native失敗state維持。事後：Connectedはconfirmedだけ。
実装 `doors_operation::handlers::call::answer`。CLI `doors call answer`。REST `POST /api/v1/operations/call.answer`（request同型）。WS `operation_id="call.answer"`（payload同型）。gRPC `doors.v1.Doors/CallAnswer`（§15に実method/stream宣言）。
適合 `CF_call_answer`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP021 call.hangup
型 `CallHangupRequest → CallHangupResponse`。scope=control、mode=U。前提：所有call/終端冪等。順序：call_hangup→CANCEL又はBYE→Disconnecting→callback終端。失敗/補償：失敗詳細/timeoutUnknown。事後：終端最大1/portcleanup。
実装 `doors_operation::handlers::call::hangup`。CLI `doors call hangup`。REST `POST /api/v1/operations/call.hangup`（request同型）。WS `operation_id="call.hangup"`（payload同型）。gRPC `doors.v1.Doors/CallHangup`（§15に実method/stream宣言）。
適合 `CF_call_hangup`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP022 call.hold
型 `CallHoldRequest → CallHoldResponse`。scope=control、mode=U。前提：Active/local未hold。順序：call_set_hold→reINVITE完了/media変化待ち。失敗/補償：拒否元state。事後：実flagでHeld。
実装 `doors_operation::handlers::call::hold`。CLI `doors call hold`。REST `POST /api/v1/operations/call.hold`（request同型）。WS `operation_id="call.hold"`（payload同型）。gRPC `doors.v1.Doors/CallHold`（§15に実method/stream宣言）。
適合 `CF_call_hold`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP023 call.unhold
型 `CallUnholdRequest → CallUnholdResponse`。scope=control、mode=U。前提：localhold中。順序：call_reinvite(unhold)→media変化待ち。失敗/補償：remoteholdは解除不能。事後：local解除/remote保持。
実装 `doors_operation::handlers::call::unhold`。CLI `doors call unhold`。REST `POST /api/v1/operations/call.unhold`（request同型）。WS `operation_id="call.unhold"`（payload同型）。gRPC `doors.v1.Doors/CallUnhold`（§15に実method/stream宣言）。
適合 `CF_call_unhold`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP024 call.transfer
型 `CallTransferRequest → CallTransferResponse`。scope=control、mode=U。前提：Active/Held/REFER能力。順序：target検証→call_xfer→NOTIFYfinal待ち。失敗/補償：failure元call維持/timeoutUnknown。事後：Completed/既定元call維持。
実装 `doors_operation::handlers::call::transfer`。CLI `doors call transfer`。REST `POST /api/v1/operations/call.transfer`（request同型）。WS `operation_id="call.transfer"`（payload同型）。gRPC `doors.v1.Doors/CallTransfer`（§15に実method/stream宣言）。
適合 `CF_call_transfer`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP025 call.refer.respond
型 `CallReferRespondRequest → CallReferRespondResponse`。scope=control、mode=U。前提：pendingREFER/30s内。順序：受信shim→accept新call又はrejectNOTIFY603。失敗/補償：重複Conflict/無認可target拒否。事後：決定一回。
実装 `doors_operation::handlers::call::refer::respond`。CLI `doors call refer respond`。REST `POST /api/v1/operations/call.refer.respond`（request同型）。WS `operation_id="call.refer.respond"`（payload同型）。gRPC `doors.v1.Doors/CallReferRespond`（§15に実method/stream宣言）。
適合 `CF_call_refer_respond`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP026 call.dtmf.send
型 `CallDtmfSendRequest → CallDtmfSendResponse`。scope=control、mode=U。前提：送信media/方式policy。順序：桁検査→native/tone→index/timer。失敗/補償：即失敗timer0/部分桁結果保持。事後：受理と推定/実完了別。
実装 `doors_operation::handlers::call::dtmf::send`。CLI `doors call dtmf send`。REST `POST /api/v1/operations/call.dtmf.send`（request同型）。WS `operation_id="call.dtmf.send"`（payload同型）。gRPC `doors.v1.Doors/CallDtmfSend`（§15に実method/stream宣言）。
適合 `CF_call_dtmf_send`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP027 subscription.control.open
型 `SubscriptionControlOpenRequest → SubscriptionControlOpenResponse`。scope=read、mode=S。前提：Client可視。順序：receiver先登録→snapshotbarrier→以後event。失敗/補償：容量失敗全部回収。事後：gap検知可。
実装 `doors_operation::handlers::subscription::control::open`。CLI `doors subscription control open`。REST `POST /api/v1/operations/subscription.control.open`（request同型）。WS `operation_id="subscription.control.open"`（payload同型）。gRPC `doors.v1.Doors/SubscriptionControlOpen`（§15に実method/stream宣言）。
適合 `CF_subscription_control_open`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP028 subscription.account.open
型 `SubscriptionAccountOpenRequest → SubscriptionAccountOpenResponse`。scope=read、mode=S。前提：account可視。順序：同barrier＋Client分離後accountfilter。失敗/補償：他account未配送。事後：Removed後EOF。
実装 `doors_operation::handlers::subscription::account::open`。CLI `doors subscription account open`。REST `POST /api/v1/operations/subscription.account.open`（request同型）。WS `operation_id="subscription.account.open"`（payload同型）。gRPC `doors.v1.Doors/SubscriptionAccountOpen`（§15に実method/stream宣言）。
適合 `CF_subscription_account_open`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP029 subscription.raw_sip.open
型 `SubscriptionRaw_sipOpenRequest → SubscriptionRaw_sipOpenResponse`。scope=raw_sip、mode=S。前提：enabled/権限。順序：raw専用receiver＋barrier。失敗/補償：disabledUnsupported。事後：raw/control独立。
実装 `doors_operation::handlers::subscription::raw_sip::open`。CLI `doors subscription raw_sip open`。REST `POST /api/v1/operations/subscription.raw_sip.open`（request同型）。WS `operation_id="subscription.raw_sip.open"`（payload同型）。gRPC `doors.v1.Doors/SubscriptionRaw_sipOpen`（§15に実method/stream宣言）。
適合 `CF_subscription_raw_sip_open`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP030 subscription.receive
型 `SubscriptionReceiveRequest → SubscriptionReceiveResponse`。scope=read、mode=S。前提：single-reader所有。順序：queuepop、Gap先送。失敗/補償：並行readerConflict/異常error。事後：正常EOF別。
実装 `doors_operation::handlers::subscription::receive`。CLI `doors subscription receive`。REST `POST /api/v1/operations/subscription.receive`（request同型）。WS `operation_id="subscription.receive"`（payload同型）。gRPC `doors.v1.Doors/SubscriptionReceive`（§15に実method/stream宣言）。
適合 `CF_subscription_receive`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP031 subscription.close
型 `SubscriptionCloseRequest → SubscriptionCloseResponse`。scope=read、mode=U。前提：所有又は自tombstone。順序：gate→receiver除去→waiterEOF→回収。失敗/補償：未知NotFound/既close冪等。事後：解除。
実装 `doors_operation::handlers::subscription::close`。CLI `doors subscription close`。REST `POST /api/v1/operations/subscription.close`（request同型）。WS `operation_id="subscription.close"`（payload同型）。gRPC `doors.v1.Doors/SubscriptionClose`（§15に実method/stream宣言）。
適合 `CF_subscription_close`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP032 media.tap.open
型 `MediaTapOpenRequest → MediaTapOpenResponse`。scope=audio.read、mode=S。前提：非終端/format容量。順序：ensureworker/ports→tapring/aligner/resample→次frame開始。失敗/補償：途中tapだけ回収、media未activeは待機。事後：重複port0。
実装 `doors_operation::handlers::media::tap::open`。CLI `doors media tap open`。REST `POST /api/v1/operations/media.tap.open`（request同型）。WS `operation_id="media.tap.open"`（payload同型）。gRPC `doors.v1.Doors/MediaTapOpen`（§15に実method/stream宣言）。
適合 `CF_media_tap_open`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP033 media.tap.receive
型 `MediaTapReceiveRequest → MediaTapReceiveResponse`。scope=audio.read、mode=S。前提：所有single-reader。順序：mode別ringpop→同formatpair。失敗/補償：stall異常error/終話EOF。事後：連番又はgap。
実装 `doors_operation::handlers::media::tap::receive`。CLI `doors media tap receive`。REST `POST /api/v1/operations/media.tap.receive`（request同型）。WS `operation_id="media.tap.receive"`（payload同型）。gRPC `doors.v1.Doors/MediaTapReceive`（§15に実method/stream宣言）。
適合 `CF_media_tap_receive`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP034 media.tap.close
型 `MediaTapCloseRequest → MediaTapCloseResponse`。scope=audio.read、mode=U。前提：所有tap。順序：停止→waiterEOF→ring回収。失敗/補償：他tap/通話停止禁止。事後：通話維持。
実装 `doors_operation::handlers::media::tap::close`。CLI `doors media tap close`。REST `POST /api/v1/operations/media.tap.close`（request同型）。WS `operation_id="media.tap.close"`（payload同型）。gRPC `doors.v1.Doors/MediaTapClose`（§15に実method/stream宣言）。
適合 `CF_media_tap_close`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP035 media.source.add
型 `MediaSourceAddRequest → MediaSourceAddResponse`。scope=audio.write、mode=U。前提：非終端/上限未満。順序：source先準備→frame境界table→ensureports。失敗/補償：準備/attach失敗全source回収。事後：以後mix対象。
実装 `doors_operation::handlers::media::source::add`。CLI `doors media source add`。REST `POST /api/v1/operations/media.source.add`（request同型）。WS `operation_id="media.source.add"`（payload同型）。gRPC `doors.v1.Doors/MediaSourceAdd`（§15に実method/stream宣言）。
適合 `CF_media_source_add`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP036 media.source.write
型 `MediaSourceWriteRequest → MediaSourceWriteResponse`。scope=audio.write、mode=C。前提：Uploaded/所有/format次番号。順序：inputringenqueue、余剰保持。失敗/補償：不正PCM/EOF後拒否、full期限又は容量error。事後：ackはfeed受理。
実装 `doors_operation::handlers::media::source::write`。CLI `doors media source write`。REST `POST /api/v1/operations/media.source.write`（request同型）。WS `operation_id="media.source.write"`（payload同型）。gRPC `doors.v1.Doors/MediaSourceWrite`（§15に実method/stream宣言）。
適合 `CF_media_source_write`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP037 media.source.finish
型 `MediaSourceFinishRequest → MediaSourceFinishResponse`。scope=audio.write、mode=U。前提：所有source。順序：EOFmarker→余剰drain→table除去。失敗/補償：既EOF冪等。事後：終端。
実装 `doors_operation::handlers::media::source::finish`。CLI `doors media source finish`。REST `POST /api/v1/operations/media.source.finish`（request同型）。WS `operation_id="media.source.finish"`（payload同型）。gRPC `doors.v1.Doors/MediaSourceFinish`（§15に実method/stream宣言）。
適合 `CF_media_source_finish`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP038 media.source.remove
型 `MediaSourceRemoveRequest → MediaSourceRemoveResponse`。scope=audio.write、mode=U。前提：所有source。順序：次framegate→table除去→task取消/lease回収。失敗/補償：他source停止禁止。事後：次frame以後mix0。
実装 `doors_operation::handlers::media::source::remove`。CLI `doors media source remove`。REST `POST /api/v1/operations/media.source.remove`（request同型）。WS `operation_id="media.source.remove"`（payload同型）。gRPC `doors.v1.Doors/MediaSourceRemove`（§15に実method/stream宣言）。
適合 `CF_media_source_remove`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP039 media.source.gain.set
型 `MediaSourceGainSetRequest → MediaSourceGainSetResponse`。scope=audio.write、mode=U。前提：finite0..64。順序：frame境界gain更新。失敗/補償：不正無変更。事後：原子反映。
実装 `doors_operation::handlers::media::source::gain::set`。CLI `doors media source gain set`。REST `POST /api/v1/operations/media.source.gain.set`（request同型）。WS `operation_id="media.source.gain.set"`（payload同型）。gRPC `doors.v1.Doors/MediaSourceGainSet`（§15に実method/stream宣言）。
適合 `CF_media_source_gain_set`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP040 media.source.mute.set
型 `MediaSourceMuteSetRequest → MediaSourceMuteSetResponse`。scope=audio.write、mode=U。前提：source生存。順序：frame境界mute、timeline消費継続。失敗/補償：不在NotFound。事後：EOF処理継続。
実装 `doors_operation::handlers::media::source::mute::set`。CLI `doors media source mute set`。REST `POST /api/v1/operations/media.source.mute.set`（request同型）。WS `operation_id="media.source.mute.set"`（payload同型）。gRPC `doors.v1.Doors/MediaSourceMuteSet`（§15に実method/stream宣言）。
適合 `CF_media_source_mute_set`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP041 media.source.replace
型 `MediaSourceReplaceRequest → MediaSourceReplaceResponse`。scope=audio.write、mode=U。前提：新source準備可。順序：先準備→同ID世代swap→旧取消。失敗/補償：準備失敗旧維持。事後：旧feed失効/原子切替。
実装 `doors_operation::handlers::media::source::replace`。CLI `doors media source replace`。REST `POST /api/v1/operations/media.source.replace`（request同型）。WS `operation_id="media.source.replace"`（payload同型）。gRPC `doors.v1.Doors/MediaSourceReplace`（§15に実method/stream宣言）。
適合 `CF_media_source_replace`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP042 media.mixer.gain.set
型 `MediaMixerGainSetRequest → MediaMixerGainSetResponse`。scope=audio.write、mode=U。前提：finite0..64。順序：次frame master更新。失敗/補償：不正無変更。事後：clamp前gain。
実装 `doors_operation::handlers::media::mixer::gain::set`。CLI `doors media mixer gain set`。REST `POST /api/v1/operations/media.mixer.gain.set`（request同型）。WS `operation_id="media.mixer.gain.set"`（payload同型）。gRPC `doors.v1.Doors/MediaMixerGainSet`（§15に実method/stream宣言）。
適合 `CF_media_mixer_gain_set`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP043 media.microphone.open
型 `MediaMicrophoneOpenRequest → MediaMicrophoneOpenResponse`。scope=audio.write、mode=U。前提：CPAL能力/権限。順序：deviceopen→capturering→未attachsource。失敗/補償：失敗device/ring回収。事後：勝手な通話接続0。
実装 `doors_operation::handlers::media::microphone::open`。CLI `doors media microphone open`。REST `POST /api/v1/operations/media.microphone.open`（request同型）。WS `operation_id="media.microphone.open"`（payload同型）。gRPC `doors.v1.Doors/MediaMicrophoneOpen`（§15に実method/stream宣言）。
適合 `CF_media_microphone_open`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP044 media.device.list
型 `MediaDeviceListRequest → MediaDeviceListResponse`。scope=read、mode=U。前提：可視。順序：CPAL列挙/formatprobe。失敗/補償：driver失敗Unavailable。事後：不変。
実装 `doors_operation::handlers::media::device::list`。CLI `doors media device list`。REST `POST /api/v1/operations/media.device.list`（request同型）。WS `operation_id="media.device.list"`（payload同型）。gRPC `doors.v1.Doors/MediaDeviceList`（§15に実method/stream宣言）。
適合 `CF_media_device_list`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP045 media.device.select
型 `MediaDeviceSelectRequest → MediaDeviceSelectResponse`。scope=admin、mode=U。前提：存在/format対応。順序：既定選択更新、既存stream変更しない。失敗/補償：不正無変更。事後：新openに適用。
実装 `doors_operation::handlers::media::device::select`。CLI `doors media device select`。REST `POST /api/v1/operations/media.device.select`（request同型）。WS `operation_id="media.device.select"`（payload同型）。gRPC `doors.v1.Doors/MediaDeviceSelect`（§15に実method/stream宣言）。
適合 `CF_media_device_select`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP046 media.device.close
型 `MediaDeviceCloseRequest → MediaDeviceCloseResponse`。scope=admin、mode=U。前提：device所有。順序：detach→drain→CPALdropRT外→回収。失敗/補償：timeout隔離/他device不変。事後：終了。
実装 `doors_operation::handlers::media::device::close`。CLI `doors media device close`。REST `POST /api/v1/operations/media.device.close`（request同型）。WS `operation_id="media.device.close"`（payload同型）。gRPC `doors.v1.Doors/MediaDeviceClose`（§15に実method/stream宣言）。
適合 `CF_media_device_close`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP047 media.speaker.attach
型 `MediaSpeakerAttachRequest → MediaSpeakerAttachResponse`。scope=audio.read、mode=U。前提：受話position/device対応。順序：tap→device resample→outputring/AECreference。失敗/補償：途中CPAL/tap回収。事後：OUT無断loopback0。
実装 `doors_operation::handlers::media::speaker::attach`。CLI `doors media speaker attach`。REST `POST /api/v1/operations/media.speaker.attach`（request同型）。WS `operation_id="media.speaker.attach"`（payload同型）。gRPC `doors.v1.Doors/MediaSpeakerAttach`（§15に実method/stream宣言）。
適合 `CF_media_speaker_attach`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP048 media.source.attach
型 `MediaSourceAttachRequest → MediaSourceAttachResponse`。scope=audio.write、mode=U。前提：未attach又は同call/所有一致。順序：table予約→frameattach/Both一pull。失敗/補償：別callConflict。事後：singleconsumer。
実装 `doors_operation::handlers::media::source::attach`。CLI `doors media source attach`。REST `POST /api/v1/operations/media.source.attach`（request同型）。WS `operation_id="media.source.attach"`（payload同型）。gRPC `doors.v1.Doors/MediaSourceAttach`（§15に実method/stream宣言）。
適合 `CF_media_source_attach`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP049 media.file_source.open
型 `MediaFile_sourceOpenRequest → MediaFile_sourceOpenResponse`。scope=audio.write、mode=U。前提：root許可/WAV対応。順序：nofollowopen→RIFFparse→reader/source。失敗/補償：malformed/unsupported拒否、fd回収。事後：EOF/余剰保持。
実装 `doors_operation::handlers::media::file_source::open`。CLI `doors media file_source open`。REST `POST /api/v1/operations/media.file_source.open`（request同型）。WS `operation_id="media.file_source.open"`（payload同型）。gRPC `doors.v1.Doors/MediaFile_sourceOpen`（§15に実method/stream宣言）。
適合 `CF_media_file_source_open`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP050 media.wav_sink.open
型 `MediaWav_sinkOpenRequest → MediaWav_sinkOpenResponse`。scope=audio.read、mode=U。前提：root許可/新file。順序：create_new→header→writerworker。失敗/補償：途中partial記録、無断overwrite禁止。事後：format確定。
実装 `doors_operation::handlers::media::wav_sink::open`。CLI `doors media wav_sink open`。REST `POST /api/v1/operations/media.wav_sink.open`（request同型）。WS `operation_id="media.wav_sink.open"`（payload同型）。gRPC `doors.v1.Doors/MediaWav_sinkOpen`（§15に実method/stream宣言）。
適合 `CF_media_wav_sink_open`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP051 media.wav_sink.write
型 `MediaWav_sinkWriteRequest → MediaWav_sinkWriteResponse`。scope=audio.read、mode=C。前提：所有/call/format/次sample。順序：L/Rinterleave→write_all。失敗/補償：diskfull部分量/再試行index重複拒否。事後：書込sample数。
実装 `doors_operation::handlers::media::wav_sink::write`。CLI `doors media wav_sink write`。REST `POST /api/v1/operations/media.wav_sink.write`（request同型）。WS `operation_id="media.wav_sink.write"`（payload同型）。gRPC `doors.v1.Doors/MediaWav_sinkWrite`（§15に実method/stream宣言）。
適合 `CF_media_wav_sink_write`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP052 media.wav_sink.finish
型 `MediaWav_sinkFinishRequest → MediaWav_sinkFinishResponse`。scope=audio.read、mode=U。前提：sink所有。順序：drain→RIFF/datapatch→fsyncclose。失敗/補償：失敗partialerror。事後：finalize一回。
実装 `doors_operation::handlers::media::wav_sink::finish`。CLI `doors media wav_sink finish`。REST `POST /api/v1/operations/media.wav_sink.finish`（request同型）。WS `operation_id="media.wav_sink.finish"`（payload同型）。gRPC `doors.v1.Doors/MediaWav_sinkFinish`（§15に実method/stream宣言）。
適合 `CF_media_wav_sink_finish`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP053 media.session.open
型 `MediaSessionOpenRequest → MediaSessionOpenResponse`。scope=audio.read+audio.write、mode=B。前提：少なくとも片方向/所有。順序：source/tap準備→共通sessionpump。失敗/補償：片側失敗両方回収。事後：halfclose独立。
実装 `doors_operation::handlers::media::session::open`。CLI `doors media session open`。REST `POST /api/v1/operations/media.session.open`（request同型）。WS `operation_id="media.session.open"`（payload同型）。gRPC `doors.v1.Doors/MediaSessionOpen`（§15に実method/stream宣言）。
適合 `CF_media_session_open`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP054 config.validate
型 `ConfigValidateRequest → ConfigValidateResponse`。scope=read、mode=U。前提：一方以上。順序：全VAL検査/fieldpath。失敗/補償：InvalidConfig。事後：副作用0。
実装 `doors_operation::handlers::config::validate`。CLI `doors config validate`。REST `POST /api/v1/operations/config.validate`（request同型）。WS `operation_id="config.validate"`（payload同型）。gRPC `doors.v1.Doors/ConfigValidate`（§15に実method/stream宣言）。
適合 `CF_config_validate`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP055 config.load
型 `ConfigLoadRequest → ConfigLoadResponse`。scope=admin、mode=U。前提：root許可。順序：read<=1MiB→parse/defaultmerge/validate。失敗/補償：不正無適用。事後：runtime不変/secretredact。
実装 `doors_operation::handlers::config::load`。CLI `doors config load`。REST `POST /api/v1/operations/config.load`（request同型）。WS `operation_id="config.load"`（payload同型）。gRPC `doors.v1.Doors/ConfigLoad`（§15に実method/stream宣言）。
適合 `CF_config_load`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP056 config.get
型 `ConfigGetRequest → ConfigGetResponse`。scope=read、mode=U。前提：可視/全体admin。順序：effectiveconfig複製/redact。失敗/補償：越境秘匿。事後：不変。
実装 `doors_operation::handlers::config::get`。CLI `doors config get`。REST `POST /api/v1/operations/config.get`（request同型）。WS `operation_id="config.get"`（payload同型）。gRPC `doors.v1.Doors/ConfigGet`（§15に実method/stream宣言）。
適合 `CF_config_get`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP057 config.patch
型 `ConfigPatchRequest → ConfigPatchResponse`。scope=admin、mode=U。前提：mutablefield限定。順序：before→patchvalidate→native→DB→commit。失敗/補償：逆補償/不能repair。事後：一貫snapshot。
実装 `doors_operation::handlers::config::patch`。CLI `doors config patch`。REST `POST /api/v1/operations/config.patch`（request同型）。WS `operation_id="config.patch"`（payload同型）。gRPC `doors.v1.Doors/ConfigPatch`（§15に実method/stream宣言）。
適合 `CF_config_patch`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP058 config.save
型 `ConfigSaveRequest → ConfigSaveResponse`。scope=admin、mode=U。前提：persistence/root許可。順序：redactedexport temp/fsync/rename又はDBtx。失敗/補償：失敗旧file維持。事後：secret平文0。
実装 `doors_operation::handlers::config::save`。CLI `doors config save`。REST `POST /api/v1/operations/config.save`（request同型）。WS `operation_id="config.save"`（payload同型）。gRPC `doors.v1.Doors/ConfigSave`（§15に実method/stream宣言）。
適合 `CF_config_save`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP059 auth.token.issue
型 `AuthTokenIssueRequest → AuthTokenIssueResponse`。scope=public、mode=U。前提：rate/credential有効。順序：実verifier/隔離SIPauth→claims→署名。失敗/補償：user存在だけ成功禁止。事後：最小scope token。
実装 `doors_operation::handlers::auth::token::issue`。CLI `doors auth token issue`。REST `POST /api/v1/operations/auth.token.issue`（request同型）。WS `operation_id="auth.token.issue"`（payload同型）。gRPC `doors.v1.Doors/AuthTokenIssue`（§15に実method/stream宣言）。
適合 `CF_auth_token_issue`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP060 auth.credentials.verify
型 `AuthCredentialsVerifyRequest → AuthCredentialsVerifyResponse`。scope=public、mode=U。前提：rate制限。順序：APIkeyconstanttime又は隔離REGISTER→cleanup。失敗/補償：曖昧Conflict/誤password統一error。事後：一般登録state不変。
実装 `doors_operation::handlers::auth::credentials::verify`。CLI `doors auth credentials verify`。REST `POST /api/v1/operations/auth.credentials.verify`（request同型）。WS `operation_id="auth.credentials.verify"`（payload同型）。gRPC `doors.v1.Doors/AuthCredentialsVerify`（§15に実method/stream宣言）。
適合 `CF_auth_credentials_verify`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP061 auth.request.authorize
型 `AuthRequestAuthorizeRequest → AuthRequestAuthorizeResponse`。scope=read、mode=U。前提：認証主体。順序：自scope/ownership評価。失敗/補償：他主体照会禁止。事後：不変。
実装 `doors_operation::handlers::auth::request::authorize`。CLI `doors auth request authorize`。REST `POST /api/v1/operations/auth.request.authorize`（request同型）。WS `operation_id="auth.request.authorize"`（payload同型）。gRPC `doors.v1.Doors/AuthRequestAuthorize`（§15に実method/stream宣言）。
適合 `CF_auth_request_authorize`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP062 auth.session_ticket.issue
型 `AuthSession_ticketIssueRequest → AuthSession_ticketIssueResponse`。scope=read、mode=U。前提：scope親部分集合。順序：randomticket/hash/30s/一回/clientbind。失敗/補償：容量error。事後：JWTquery代替。
実装 `doors_operation::handlers::auth::session_ticket::issue`。CLI `doors auth session_ticket issue`。REST `POST /api/v1/operations/auth.session_ticket.issue`（request同型）。WS `operation_id="auth.session_ticket.issue"`（payload同型）。gRPC `doors.v1.Doors/AuthSession_ticketIssue`（§15に実method/stream宣言）。
適合 `CF_auth_session_ticket_issue`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP063 persistence.open
型 `PersistenceOpenRequest → PersistenceOpenResponse`。scope=admin、mode=U。前提：root/key許可。順序：SQLxconnect→pragma→version検査。失敗/補償：失敗poolclose。事後：migration前準備。
実装 `doors_operation::handlers::persistence::open`。CLI `doors persistence open`。REST `POST /api/v1/operations/persistence.open`（request同型）。WS `operation_id="persistence.open"`（payload同型）。gRPC `doors.v1.Doors/PersistenceOpen`（§15に実method/stream宣言）。
適合 `CF_persistence_open`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP064 persistence.accounts.load
型 `PersistenceAccountsLoadRequest → PersistenceAccountsLoadResponse`。scope=admin、mode=U。前提：pool生存。順序：tenant/clientkeyでselect、外部redact/内部restoreだけ復号。失敗/補償：鍵不正起動失敗。事後：runtime不変。
実装 `doors_operation::handlers::persistence::accounts::load`。CLI `doors persistence accounts load`。REST `POST /api/v1/operations/persistence.accounts.load`（request同型）。WS `operation_id="persistence.accounts.load"`（payload同型）。gRPC `doors.v1.Doors/PersistenceAccountsLoad`（§15に実method/stream宣言）。
適合 `CF_persistence_accounts_load`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP065 persistence.account.save
型 `PersistenceAccountSaveRequest → PersistenceAccountSaveResponse`。scope=admin、mode=U。前提：account/pool。順序：DBID確保→AEADAAD→upserttx。失敗/補償：rollback/OutOfSync。事後：plaintext0。
実装 `doors_operation::handlers::persistence::account::save`。CLI `doors persistence account save`。REST `POST /api/v1/operations/persistence.account.save`（request同型）。WS `operation_id="persistence.account.save"`（payload同型）。gRPC `doors.v1.Doors/PersistenceAccountSave`（§15に実method/stream宣言）。
適合 `CF_persistence_account_save`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP066 persistence.account.delete
型 `PersistenceAccountDeleteRequest → PersistenceAccountDeleteResponse`。scope=admin、mode=U。前提：所有mapping/pool。順序：DBID解決→deletetx→mapping除去。失敗/補償：DB失敗repair。事後：冪等。
実装 `doors_operation::handlers::persistence::account::delete`。CLI `doors persistence account delete`。REST `POST /api/v1/operations/persistence.account.delete`（request同型）。WS `operation_id="persistence.account.delete"`（payload同型）。gRPC `doors.v1.Doors/PersistenceAccountDelete`（§15に実method/stream宣言）。
適合 `CF_persistence_account_delete`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP067 persistence.migration.apply
型 `PersistenceMigrationApplyRequest → PersistenceMigrationApplyResponse`。scope=admin、mode=U。前提：復元前/Client停止。順序：lock→checksum→orderedSQLtx→version。失敗/補償：rollback/起動停止、down拒否。事後：schema一意。
実装 `doors_operation::handlers::persistence::migration::apply`。CLI `doors persistence migration apply`。REST `POST /api/v1/operations/persistence.migration.apply`（request同型）。WS `operation_id="persistence.migration.apply"`（payload同型）。gRPC `doors.v1.Doors/PersistenceMigrationApply`（§15に実method/stream宣言）。
適合 `CF_persistence_migration_apply`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP068 persistence.repair
型 `PersistenceRepairRequest → PersistenceRepairResponse`。scope=admin、mode=U。前提：OutOfSyncjob。順序：before/desired/nativeDB比較→元rollbackpolicy実行。失敗/補償：不能隔離/明示Failed。事後：一致又は失敗明示。
実装 `doors_operation::handlers::persistence::repair`。CLI `doors persistence repair`。REST `POST /api/v1/operations/persistence.repair`（request同型）。WS `operation_id="persistence.repair"`（payload同型）。gRPC `doors.v1.Doors/PersistenceRepair`（§15に実method/stream宣言）。
適合 `CF_persistence_repair`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP069 transport.create
型 `TransportCreateRequest → TransportCreateResponse`。scope=admin、mode=U。前提：Running/init/bind未競合。順序：configdefault→bindTLS→transport_create→index。失敗/補償：失敗逆回収。事後：snapshot。
実装 `doors_operation::handlers::transport::create`。CLI `doors transport create`。REST `POST /api/v1/operations/transport.create`（request同型）。WS `operation_id="transport.create"`（payload同型）。gRPC `doors.v1.Doors/TransportCreate`（§15に実method/stream宣言）。
適合 `CF_transport_create`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP070 transport.close
型 `TransportCloseRequest → TransportCloseResponse`。scope=admin、mode=U。前提：依存callなし又は停止phase。順序：nativeclose→completion→tombstone。失敗/補償：依存RunningConflict。事後：解放。
実装 `doors_operation::handlers::transport::close`。CLI `doors transport close`。REST `POST /api/v1/operations/transport.close`（request同型）。WS `operation_id="transport.close"`（payload同型）。gRPC `doors.v1.Doors/TransportClose`（§15に実method/stream宣言）。
適合 `CF_transport_close`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP071 transport.reconnect
型 `TransportReconnectRequest → TransportReconnectResponse`。scope=admin、mode=U。前提：Disconnected/Failed/停止外。順序：backoff→native再接続/再作成→関係登録refresh。失敗/補償：deadline/retry/cancel。事後：Connected又はFailed。
実装 `doors_operation::handlers::transport::reconnect`。CLI `doors transport reconnect`。REST `POST /api/v1/operations/transport.reconnect`（request同型）。WS `operation_id="transport.reconnect"`（payload同型）。gRPC `doors.v1.Doors/TransportReconnect`（§15に実method/stream宣言）。
適合 `CF_transport_reconnect`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP072 registration.native.query
型 `RegistrationNativeQueryRequest → RegistrationNativeQueryResponse`。scope=admin、mode=U。前提：nativeacc生存。順序：Reactor acc_get_info→status/expiry/URI。失敗/補償：destroy後InvalidState/削除後NotFound。事後：commit手順で更新。
実装 `doors_operation::handlers::registration::native::query`。CLI `doors registration native query`。REST `POST /api/v1/operations/registration.native.query`（request同型）。WS `operation_id="registration.native.query"`（payload同型）。gRPC `doors.v1.Doors/RegistrationNativeQuery`（§15に実method/stream宣言）。
適合 `CF_registration_native_query`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP073 native.events.drain
型 `NativeEventsDrainRequest → NativeEventsDrainResponse`。scope=admin、mode=U。前提：Runtime生存。順序：本物queue64件→capturetoken→process/apply/publish。失敗/補償：overflowresync全query/Gap。事後：外部event注入0。
実装 `doors_operation::handlers::native::events::drain`。CLI `doors native events drain`。REST `POST /api/v1/operations/native.events.drain`（request同型）。WS `operation_id="native.events.drain"`（payload同型）。gRPC `doors.v1.Doors/NativeEventsDrain`（§15に実method/stream宣言）。
適合 `CF_native_events_drain`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP074 native.event.process
型 `NativeEventProcessRequest → NativeEventProcessResponse`。scope=system、mode=U。前提：真正未使用token/epoch。順序：NativeEvent→reducer→EffectPlan。失敗/補償：未知再使用拒否/世代不一致drop。事後：未commitplan。
実装 `doors_operation::handlers::native::event::process`。CLI `doors native event process`。REST `POST /api/v1/operations/native.event.process`（request同型）。WS `operation_id="native.event.process"`（payload同型）。gRPC `doors.v1.Doors/NativeEventProcess`（§15に実method/stream宣言）。
適合 `CF_native_event_process`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP075 raw_sip.capture
型 `Raw_sipCaptureRequest → Raw_sipCaptureResponse`。scope=admin、mode=U。前提：enabled。順序：rx/txslotdrain→parse→redact→rawpublish。失敗/補償：truncation/drop統計。事後：本物message配送。
実装 `doors_operation::handlers::raw_sip::capture`。CLI `doors raw_sip capture`。REST `POST /api/v1/operations/raw_sip.capture`（request同型）。WS `operation_id="raw_sip.capture"`（payload同型）。gRPC `doors.v1.Doors/Raw_sipCapture`（§15に実method/stream宣言）。
適合 `CF_raw_sip_capture`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP076 raw_sip.redact
型 `Raw_sipRedactRequest → Raw_sipRedactResponse`。scope=admin、mode=U。前提：型上限。順序：auth両表現除去→bodypolicy→長さ再計算。失敗/補償：不正parse安全破棄。事後：secret0。
実装 `doors_operation::handlers::raw_sip::redact`。CLI `doors raw_sip redact`。REST `POST /api/v1/operations/raw_sip.redact`（request同型）。WS `operation_id="raw_sip.redact"`（payload同型）。gRPC `doors.v1.Doors/Raw_sipRedact`（§15に実method/stream宣言）。
適合 `CF_raw_sip_redact`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP077 media.bridge.register
型 `MediaBridgeRegisterRequest → MediaBridgeRegisterResponse`。scope=admin、mode=U。前提：nativecall生存。順序：generationensure capture/inject→conf_add_port→完了待ち。失敗/補償：部分port逆remove。事後：二重port0。
実装 `doors_operation::handlers::media::bridge::register`。CLI `doors media bridge register`。REST `POST /api/v1/operations/media.bridge.register`（request同型）。WS `operation_id="media.bridge.register"`（payload同型）。gRPC `doors.v1.Doors/MediaBridgeRegister`（§15に実method/stream宣言）。
適合 `CF_media_bridge_register`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP078 media.bridge.connect
型 `MediaBridgeConnectRequest → MediaBridgeConnectResponse`。scope=admin、mode=U。前提：mediaACTIVE/slot。順序：INcall→capture/OUTinject→call/Both両方/完了待ち。失敗/補償：2本目失敗1本目rollback。事後：要求edgeだけ。
実装 `doors_operation::handlers::media::bridge::connect`。CLI `doors media bridge connect`。REST `POST /api/v1/operations/media.bridge.connect`（request同型）。WS `operation_id="media.bridge.connect"`（payload同型）。gRPC `doors.v1.Doors/MediaBridgeConnect`（§15に実method/stream宣言）。
適合 `CF_media_bridge_connect`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP079 media.bridge.disconnect
型 `MediaBridgeDisconnectRequest → MediaBridgeDisconnectResponse`。scope=admin、mode=U。前提：bridge又は自tombstone。順序：conf_disconnect edge→completion、既無し冪等。失敗/補償：public停止中拒否/内部cleanup許可。事後：edge除去。
実装 `doors_operation::handlers::media::bridge::disconnect`。CLI `doors media bridge disconnect`。REST `POST /api/v1/operations/media.bridge.disconnect`（request同型）。WS `operation_id="media.bridge.disconnect"`（payload同型）。gRPC `doors.v1.Doors/MediaBridgeDisconnect`（§15に実method/stream宣言）。
適合 `CF_media_bridge_disconnect`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP080 media.bridge.remove
型 `MediaBridgeRemoveRequest → MediaBridgeRemoveResponse`。scope=admin、mode=U。前提：disconnect完了。順序：closegate→conf_remove完了→inflight0→poolfree。失敗/補償：timeout隔離/早期free0。事後：UAF0。
実装 `doors_operation::handlers::media::bridge::remove`。CLI `doors media bridge remove`。REST `POST /api/v1/operations/media.bridge.remove`（request同型）。WS `operation_id="media.bridge.remove"`（payload同型）。gRPC `doors.v1.Doors/MediaBridgeRemove`（§15に実method/stream宣言）。
適合 `CF_media_bridge_remove`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP081 media.frame.capture
型 `MediaFrameCaptureRequest → MediaFrameCaptureResponse`。scope=system、mode=U。前提：workerlease。順序：INring→clock→detector/resample/align。失敗/補償：不足zero/drop統計。事後：RT外。
実装 `doors_operation::handlers::media::frame::capture`。CLI `doors media frame capture`。REST `POST /api/v1/operations/media.frame.capture`（request同型）。WS `operation_id="media.frame.capture"`（payload同型）。gRPC `doors.v1.Doors/MediaFrameCapture`（§15に実method/stream宣言）。
適合 `CF_media_frame_capture`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP082 media.frame.render
型 `MediaFrameRenderRequest → MediaFrameRenderResponse`。scope=system、mode=U。前提：workerlease。順序：mixframe→native960sample slots→OUTring。失敗/補償：過去frame破棄/統計。事後：getframecopyのみ。
実装 `doors_operation::handlers::media::frame::render`。CLI `doors media frame render`。REST `POST /api/v1/operations/media.frame.render`（request同型）。WS `operation_id="media.frame.render"`（payload同型）。gRPC `doors.v1.Doors/MediaFrameRender`（§15に実method/stream宣言）。
適合 `CF_media_frame_render`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP083 media.worker.start
型 `MediaWorkerStartRequest → MediaWorkerStartResponse`。scope=admin、mode=U。前提：call生存。順序：pool/ring/resampler→task→ensureports。失敗/補償：途中回収/既workerjoin。事後：callworker1。
実装 `doors_operation::handlers::media::worker::start`。CLI `doors media worker start`。REST `POST /api/v1/operations/media.worker.start`（request同型）。WS `operation_id="media.worker.start"`（payload同型）。gRPC `doors.v1.Doors/MediaWorkerStart`（§15に実method/stream宣言）。
適合 `CF_media_worker_start`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP084 media.worker.stop
型 `MediaWorkerStopRequest → MediaWorkerStopResponse`。scope=admin、mode=U。前提：所有worker。順序：sourcecancel→drain→tapEOF→join。失敗/補償：timeout隔離/port先free禁止。事後：残task明示。
実装 `doors_operation::handlers::media::worker::stop`。CLI `doors media worker stop`。REST `POST /api/v1/operations/media.worker.stop`（request同型）。WS `operation_id="media.worker.stop"`（payload同型）。gRPC `doors.v1.Doors/MediaWorkerStop`（§15に実method/stream宣言）。
適合 `CF_media_worker_stop`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP085 media.mix.frame
型 `MediaMixFrameRequest → MediaMixFrameResponse`。scope=system、mode=U。前提：workerlease/次clock。順序：readyframe選択→gain→sum→master→clamp。失敗/補償：遅source無音/他source継続。事後：exactN/timeline進行。
実装 `doors_operation::handlers::media::mix::frame`。CLI `doors media mix frame`。REST `POST /api/v1/operations/media.mix.frame`（request同型）。WS `operation_id="media.mix.frame"`（payload同型）。gRPC `doors.v1.Doors/MediaMixFrame`（§15に実method/stream宣言）。
適合 `CF_media_mix_frame`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP086 media.pair.align
型 `MediaPairAlignRequest → MediaPairAlignResponse`。scope=system、mode=U。前提：workerlease。順序：同sample窓align→期限zero→pair。失敗/補償：late/padding統計。事後：同長mono両側。
実装 `doors_operation::handlers::media::pair::align`。CLI `doors media pair align`。REST `POST /api/v1/operations/media.pair.align`（request同型）。WS `operation_id="media.pair.align"`（payload同型）。gRPC `doors.v1.Doors/MediaPairAlign`（§15に実method/stream宣言）。
適合 `CF_media_pair_align`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP087 media.format.convert
型 `MediaFormatConvertRequest → MediaFormatConvertResponse`。scope=audio.write、mode=U。前提：同rate/PCMfinite/channel規則。順序：S16LE/F32LE変換、rate別はresample。失敗/補償：不正拒否/方向無断mix0。事後：sample量保持。
実装 `doors_operation::handlers::media::format::convert`。CLI `doors media format convert`。REST `POST /api/v1/operations/media.format.convert`（request同型）。WS `operation_id="media.format.convert"`（payload同型）。gRPC `doors.v1.Doors/MediaFormatConvert`（§15に実method/stream宣言）。
適合 `CF_media_format_convert`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP088 media.resample
型 `MediaResampleRequest → MediaResampleResponse`。scope=audio.write、mode=B。前提：所有session/固定format。順序：初回transformstate→FIR/carry→frame再packet。失敗/補償：途中rate変更Conflict/flush明示。事後：連続位相。
実装 `doors_operation::handlers::media::resample`。CLI `doors media resample`。REST `POST /api/v1/operations/media.resample`（request同型）。WS `operation_id="media.resample"`（payload同型）。gRPC `doors.v1.Doors/MediaResample`（§15に実method/stream宣言）。
適合 `CF_media_resample`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP089 state.snapshot.get
型 `StateSnapshotGetRequest → StateSnapshotGetResponse`。scope=read、mode=U。前提：scope可視。順序：同revision全対象snapshot。失敗/補償：globaladmin/secretredact。事後：不変。
実装 `doors_operation::handlers::state::snapshot::get`。CLI `doors state snapshot get`。REST `POST /api/v1/operations/state.snapshot.get`（request同型）。WS `operation_id="state.snapshot.get"`（payload同型）。gRPC `doors.v1.Doors/StateSnapshotGet`（§15に実method/stream宣言）。
適合 `CF_state_snapshot_get`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP090 state.transition.apply
型 `StateTransitionApplyRequest → StateTransitionApplyResponse`。scope=system、mode=U。前提：未commitplan/epoch。順序：expectedrevision検査→stateindex→revision++。失敗/補償：不整合隔離/二重拒否。事後：publish前確定。
実装 `doors_operation::handlers::state::transition::apply`。CLI `doors state transition apply`。REST `POST /api/v1/operations/state.transition.apply`（request同型）。WS `operation_id="state.transition.apply"`（payload同型）。gRPC `doors.v1.Doors/StateTransitionApply`（§15に実method/stream宣言）。
適合 `CF_state_transition_apply`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP091 event.publish
型 `EventPublishRequest → EventPublishResponse`。scope=system、mode=U。前提：commit済未publish。順序：seq採番→tenant/clientroute→bus→token消費。失敗/補償：receiver0正常/lag契約。事後：一回。
実装 `doors_operation::handlers::event::publish`。CLI `doors event publish`。REST `POST /api/v1/operations/event.publish`（request同型）。WS `operation_id="event.publish"`（payload同型）。gRPC `doors.v1.Doors/EventPublish`（§15に実method/stream宣言）。
適合 `CF_event_publish`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP092 shutdown.calls.terminate
型 `ShutdownCallsTerminateRequest → ShutdownCallsTerminateResponse`。scope=admin、mode=U。前提：Callsphase。順序：全callhangup→nativepump→deadline待ち。失敗/補償：残存/timeout集計。事後：admission0。
実装 `doors_operation::handlers::shutdown::calls::terminate`。CLI `doors shutdown calls terminate`。REST `POST /api/v1/operations/shutdown.calls.terminate`（request同型）。WS `operation_id="shutdown.calls.terminate"`（payload同型）。gRPC `doors.v1.Doors/ShutdownCallsTerminate`（§15に実method/stream宣言）。
適合 `CF_shutdown_calls_terminate`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP093 shutdown.accounts.unregister
型 `ShutdownAccountsUnregisterRequest → ShutdownAccountsUnregisterResponse`。scope=admin、mode=U。前提：Accountsphase。順序：全registration解除→nativepump。失敗/補償：timeout残存/native削除へ。事後：desired保存。
実装 `doors_operation::handlers::shutdown::accounts::unregister`。CLI `doors shutdown accounts unregister`。REST `POST /api/v1/operations/shutdown.accounts.unregister`（request同型）。WS `operation_id="shutdown.accounts.unregister"`（payload同型）。gRPC `doors.v1.Doors/ShutdownAccountsUnregister`（§15に実method/stream宣言）。
適合 `CF_shutdown_accounts_unregister`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP094 shutdown.audio.drain
型 `ShutdownAudioDrainRequest → ShutdownAudioDrainResponse`。scope=admin、mode=U。前提：Audiophase。順序：sources/taps/WAVdrain→workerstop→port除去。失敗/補償：partial/未完了通知。事後：RT寿命保護。
実装 `doors_operation::handlers::shutdown::audio::drain`。CLI `doors shutdown audio drain`。REST `POST /api/v1/operations/shutdown.audio.drain`（request同型）。WS `operation_id="shutdown.audio.drain"`（payload同型）。gRPC `doors.v1.Doors/ShutdownAudioDrain`（§15に実method/stream宣言）。
適合 `CF_shutdown_audio_drain`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP095 shutdown.native.destroy
型 `ShutdownNativeDestroyRequest → ShutdownNativeDestroyResponse`。scope=admin、mode=U。前提：Nativephase/Client停止。順序：transportclose→destroy→threadjoin→terminal。失敗/補償：native不明Failed/再利用禁止。事後：再入0。
実装 `doors_operation::handlers::shutdown::native::destroy`。CLI `doors shutdown native destroy`。REST `POST /api/v1/operations/shutdown.native.destroy`（request同型）。WS `operation_id="shutdown.native.destroy"`（payload同型）。gRPC `doors.v1.Doors/ShutdownNativeDestroy`（§15に実method/stream宣言）。
適合 `CF_shutdown_native_destroy`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP096 failure.entity.isolate
型 `FailureEntityIsolateRequest → FailureEntityIsolateResponse`。scope=admin、mode=U。前提：対象生存。順序：gate→Error記録→依存操作停止。失敗/補償：global破損全体停止。事後：隔離。
実装 `doors_operation::handlers::failure::entity::isolate`。CLI `doors failure entity isolate`。REST `POST /api/v1/operations/failure.entity.isolate`（request同型）。WS `operation_id="failure.entity.isolate"`（payload同型）。gRPC `doors.v1.Doors/FailureEntityIsolate`（§15に実method/stream宣言）。
適合 `CF_failure_entity_isolate`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP097 failure.entity.cleanup
型 `FailureEntityCleanupRequest → FailureEntityCleanupResponse`。scope=admin、mode=U。前提：隔離済。順序：種別別hangup/unregister/disconnect/remove。失敗/補償：個別panic/timeout/leak集計。事後：不能隔離維持。
実装 `doors_operation::handlers::failure::entity::cleanup`。CLI `doors failure entity cleanup`。REST `POST /api/v1/operations/failure.entity.cleanup`（request同型）。WS `operation_id="failure.entity.cleanup"`（payload同型）。gRPC `doors.v1.Doors/FailureEntityCleanup`（§15に実method/stream宣言）。
適合 `CF_failure_entity_cleanup`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP098 observability.metrics.get
型 `ObservabilityMetricsGetRequest → ObservabilityMetricsGetResponse`。scope=admin、mode=U。前提：scope許可。順序：atomiccounter/hist snapshot→filter。失敗/補償：featureoffUnsupported。事後：不変。
実装 `doors_operation::handlers::observability::metrics::get`。CLI `doors observability metrics get`。REST `POST /api/v1/operations/observability.metrics.get`（request同型）。WS `operation_id="observability.metrics.get"`（payload同型）。gRPC `doors.v1.Doors/ObservabilityMetricsGet`（§15に実method/stream宣言）。
適合 `CF_observability_metrics_get`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP099 observability.logging.configure
型 `ObservabilityLoggingConfigureRequest → ObservabilityLoggingConfigureResponse`。scope=admin、mode=U。前提：Runtime生存。順序：subscriberfilter reload/nativelevelReactor。失敗/補償：不正拒否。事後：秘匿維持。
実装 `doors_operation::handlers::observability::logging::configure`。CLI `doors observability logging configure`。REST `POST /api/v1/operations/observability.logging.configure`（request同型）。WS `operation_id="observability.logging.configure"`（payload同型）。gRPC `doors.v1.Doors/ObservabilityLoggingConfigure`（§15に実method/stream宣言）。
適合 `CF_observability_logging_configure`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP100 job.get
型 `JobGetRequest → JobGetResponse`。scope=read、mode=U。前提：所有/admin。順序：retention内snapshot/結果元responseJSON。失敗/補償：期限後NotFound。事後：不変。
実装 `doors_operation::handlers::job::get`。CLI `doors job get`。REST `POST /api/v1/operations/job.get`（request同型）。WS `operation_id="job.get"`（payload同型）。gRPC `doors.v1.Doors/JobGet`（§15に実method/stream宣言）。
適合 `CF_job_get`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP101 job.cancel
型 `JobCancelRequest → JobCancelResponse`。scope=control、mode=U。前提：所有job。順序：Pending取消/Running取消点要求/終端冪等。失敗/補償：不可逆Conflict＋job継続。事後：要求と実取消別。
実装 `doors_operation::handlers::job::cancel`。CLI `doors job cancel`。REST `POST /api/v1/operations/job.cancel`（request同型）。WS `operation_id="job.cancel"`（payload同型）。gRPC `doors.v1.Doors/JobCancel`（§15に実method/stream宣言）。
適合 `CF_job_cancel`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP102 persistence.migration.generate
型 `PersistenceMigrationGenerateRequest → PersistenceMigrationGenerateResponse`。scope=admin、mode=U。前提：root/writerlock。順序：version=max+1/UTCcounterfilename/空updownSQL create_new。失敗/補償：競合再採番/部分file回収。事後：fileだけDB不変。
実装 `doors_operation::handlers::persistence::migration::generate`。CLI `doors persistence migration generate`。REST `POST /api/v1/operations/persistence.migration.generate`（request同型）。WS `operation_id="persistence.migration.generate"`（payload同型）。gRPC `doors.v1.Doors/PersistenceMigrationGenerate`（§15に実method/stream宣言）。
適合 `CF_persistence_migration_generate`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP103 persistence.migration.fresh
型 `PersistenceMigrationFreshRequest → PersistenceMigrationFreshResponse`。scope=admin、mode=U。前提：forcetrue/全Client停止/backup成功。順序：exclusive tx→逆依存DROP→§10DDL→version1checksum→commit。失敗/補償：失敗rollback/backup保持。事後：空schema1/mapping破棄。
実装 `doors_operation::handlers::persistence::migration::fresh`。CLI `doors persistence migration fresh`。REST `POST /api/v1/operations/persistence.migration.fresh`（request同型）。WS `operation_id="persistence.migration.fresh"`（payload同型）。gRPC `doors.v1.Doors/PersistenceMigrationFresh`（§15に実method/stream宣言）。
適合 `CF_persistence_migration_fresh`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP104 persistence.migration.refresh
型 `PersistenceMigrationRefreshRequest → PersistenceMigrationRefreshResponse`。scope=admin、mode=U。前提：fresh前提/root。順序：fresh→schemacheck→entities.generate。失敗/補償：DB成功file失敗はpartialerror。事後：schema1/entity一致。
実装 `doors_operation::handlers::persistence::migration::refresh`。CLI `doors persistence migration refresh`。REST `POST /api/v1/operations/persistence.migration.refresh`（request同型）。WS `operation_id="persistence.migration.refresh"`（payload同型）。gRPC `doors.v1.Doors/PersistenceMigrationRefresh`（§15に実method/stream宣言）。
適合 `CF_persistence_migration_refresh`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

### OP105 persistence.entities.generate
型 `PersistenceEntitiesGenerateRequest → PersistenceEntitiesGenerateResponse`。scope=admin、mode=U。前提：schema1/root。順序：PRAGMA schema→SeaORM entity型/PK/FK生成→tempfsyncrename。失敗/補償：schema違いConflict/生成file以外上書不可。事後：全table対応/DB不変。
実装 `doors_operation::handlers::persistence::entities::generate`。CLI `doors persistence entities generate`。REST `POST /api/v1/operations/persistence.entities.generate`（request同型）。WS `operation_id="persistence.entities.generate"`（payload同型）。gRPC `doors.v1.Doors/PersistenceEntitiesGenerate`（§15に実method/stream宣言）。
適合 `CF_persistence_entities_generate`：正常oracle=上記事後、失敗oracle=補償/状態不変/残存一致。型境界・前提不成立・越境・deadline前後・native失敗注入・同key同/異payload・shutdown競合をcoreと4adapter比較。system操作は外部拒否/真正lease実行双方。

## 17 全38シーケンス・分岐・期限

system process/apply/publishは一つのcaptured eventの段階、同event三重処理ではない。外部任意token注入禁止。共通の認証/認可/引数/状態/容量/deadline/取消/停止/冪等分岐は全操作票§04で閉じる。以下で固有分岐・観測・期限を確定。各CF_SEQnnはcore＋4adapter、正常/記載分岐/前提拒否/取消/期限/再接続の前後snapshot・event・音声を§14oracleと照合。

### SEQ01 起動・DB復元
順序：`config.load` → `persistence.open` → `persistence.migration.apply` → `runtime.initialize` → `persistence.accounts.load` → `account.add` → `account.register`。分岐/不変条件：Strict時最初の復元失敗で作成済資源逆順回収、Partial時失敗account隔離一覧、鍵不正は常に停止。期限：init10s/登録各15s。検証：CF_SEQ01、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ02 library最小起動停止
順序：`config.validate` → `runtime.initialize` → `runtime.capabilities.get` → `client.shutdown` → `runtime.shutdown`。分岐/不変条件：native無しUnsupported、失敗逆回収、過去event待ち禁止。期限：init10s/stop15s。検証：CF_SEQ02、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ03 複数Client
順序：`runtime.initialize` → `client.open` → `account.add` → `subscription.account.open`。分岐/不変条件：Runtime設定競合Conflict、Client閉鎖が他区画へ影響0。期限：open10s。検証：CF_SEQ03、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ04 account追加自動登録
順序：`account.add` → `account.register` → `native.events.drain` → `native.event.process` → `state.transition.apply` → `event.publish`。分岐/不変条件：追加成功と登録失敗は別、accountを消して失敗隠蔽しない。期限：register15s。検証：CF_SEQ04、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ05 登録認証失敗retry
順序：`account.register` → `native.events.drain` → `account.registration.get` → `account.register`。分岐/不変条件：401challenge継続、403最終Failed、credentials更新後retry。期限：15s/backoff1..60s。検証：CF_SEQ05、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ06 refresh期限切れ
順序：`registration.native.query` → `native.event.process` → `state.transition.apply` → `event.publish` → `account.register`。分岐/不変条件：期限前失敗Registered保持/後Expired、二重refresh0。期限：expiresmono。検証：CF_SEQ06、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ07 解除再登録
順序：`account.unregister` → `account.registration.get` → `account.register`。分岐/不変条件：解除失敗を隠して次成功にしない、逆操作FIFO。期限：各15s。検証：CF_SEQ07、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ08 設定更新再登録
順序：`account.update` → `account.unregister` → `account.register` → `persistence.account.save`。分岐/不変条件：modify失敗旧値、DB失敗native補償、不能repair隔離。期限：command10s/job15s。検証：CF_SEQ08、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ09 account削除
順序：`account.unregister` → `account.remove` → `persistence.account.delete` → `event.publish`。分岐/不変条件：activecallforcefalseConflict、forcecall終了、DB失敗repair。期限：phase5s。検証：CF_SEQ09、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ10 未登録発信
順序：`account.add` → `call.make`。分岐/不変条件：policytrueのみ許可、false副作用0InvalidState。期限：invite90s。検証：CF_SEQ10、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ11 発信接続
順序：`subscription.control.open` → `call.make` → `native.events.drain` → `native.event.process` → `state.transition.apply` → `media.bridge.register` → `media.bridge.connect` → `event.publish`。分岐/不変条件：100/180なし200可、183early、Connectedconfirmed、failure終端一回。期限：90s。検証：CF_SEQ11、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ12 着信受諾
順序：`native.event.process` → `state.transition.apply` → `event.publish` → `call.answer` → `media.bridge.register` → `media.bridge.connect`。分岐/不変条件：entry先作成、180/183/200、最終後provisional拒否。期限：auto設定/上流timeout。検証：CF_SEQ12、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ13 着信拒否
順序：`native.event.process` → `call.answer` → `native.event.process` → `state.transition.apply` → `event.publish`。分岐/不変条件：486/603、native拒否state保持、DisconnectInfo理由。期限：10s。検証：CF_SEQ13、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ14 無応答・autotimer
順序：`call.state.get` → `call.answer` → `call.hangup` → `state.transition.apply` → `event.publish`。分岐/不変条件：answerとtimer先最終commit勝ち、invite期限CANCEL。期限：invite90s/auto設定。検証：CF_SEQ14、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ15 CANCEL・remoteBYE
順序：`call.hangup` → `native.event.process` → `state.transition.apply` → `media.bridge.disconnect` → `event.publish`。分岐/不変条件：同期callback捕捉、terminal1、portcompletion前free0。期限：calls5s。検証：CF_SEQ15、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ16 保留解除
順序：`call.hold` → `native.event.process` → `state.transition.apply` → `call.unhold` → `event.publish`。分岐/不変条件：remotehold解除不能、両holdのlocal解除後remote維持。期限：command10s/reINVITE15s。検証：CF_SEQ16、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ17 REFER送受
順序：`call.transfer` → `call.refer.respond` → `native.event.process` → `state.transition.apply` → `event.publish`。分岐/不変条件：失敗元call維持、受信202pending、reject603/timeout408NOTIFY。期限：承認30s/転送invite90s。検証：CF_SEQ17、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ18 DTMF3方式
順序：`call.dtmf.send` → `native.event.process` → `event.publish`。分岐/不変条件：桁index/受理/開始/推定別、失敗timer0、Observed根拠必須。期限：各開始+500ms。検証：CF_SEQ18、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ19 control/account/raw購読
順序：`subscription.control.open` → `subscription.account.open` → `subscription.raw_sip.open` → `subscription.receive` → `subscription.close`。分岐/不変条件：snapshotbarrier、singleconsumer、Removed後EOF、rawdisabledUnsupported。期限：receive指定deadline。検証：CF_SEQ19、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ20 Raw SIP全方向
順序：`raw_sip.capture` → `raw_sip.redact` → `event.publish` → `subscription.receive`。分岐/不変条件：body/auth両表現秘匿、truncate明示、未帰属adminだけ。期限：callback即時/後段tick。検証：CF_SEQ20、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ21 Lagged復旧
順序：`subscription.receive` → `state.snapshot.get`。分岐/不変条件：Gap後現在revision再取得、過去event再送なし。期限：query10s。検証：CF_SEQ21、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ22 tap整列変換
順序：`media.tap.open` → `media.frame.capture` → `media.pair.align` → `media.resample` → `media.format.convert` → `media.tap.receive`。分岐/不変条件：未active準備待ち、終話EOF、tailvalidsampleだけ。期限：pair120ms。検証：CF_SEQ22、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ23 Realtimeoverflow
順序：`media.frame.capture` → `media.tap.receive` → `event.publish`。分岐/不変条件：最古破棄最新格納、drop正確、他pipeline停止0。期限：通知1/s。検証：CF_SEQ23、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ24 Losslessstall
順序：`media.frame.capture` → `media.tap.receive` → `media.tap.close`。分岐/不変条件：5s/容量上限で当該taperror、EOF偽装0。期限：5000ms。検証：CF_SEQ24、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ25 TTSfeed
順序：`media.source.add` → `media.source.write` → `media.mix.frame` → `media.frame.render` → `media.source.finish`。分岐/不変条件：余剰保持/0notEOF、断線はError又は明示finish、他source継続。期限：frame20ms。検証：CF_SEQ25、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ26 WAVsource
順序：`media.file_source.open` → `media.source.attach` → `media.mix.frame` → `media.frame.render`。分岐/不変条件：RIFF不正拒否、EOFdrain、RT外I/O、取消fd回収。期限：read10s。検証：CF_SEQ26、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ27 softphone機器
順序：`media.device.list` → `media.device.select` → `media.microphone.open` → `media.source.attach` → `media.speaker.attach` → `media.frame.capture` → `media.frame.render`。分岐/不変条件：hotplug隔離/EC実reference/無断default切替0。期限：open10s。検証：CF_SEQ27、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ28 source切替
順序：`media.source.add` → `media.source.gain.set` → `media.source.mute.set` → `media.source.replace` → `media.source.remove`。分岐/不変条件：prepare成功前swap0、BOTH一pull、frame原子ack、旧lease失効。期限：frameboundary。検証：CF_SEQ28、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ29 WAV録音
順序：`media.tap.open` → `media.wav_sink.open` → `media.tap.receive` → `media.wav_sink.write` → `media.wav_sink.finish`。分岐/不変条件：L IN/R OUT、diskfullpartial、4GiB前失敗、録音失敗で通話切断0。期限：flush10s/stopAudio2s。検証：CF_SEQ29、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ30 ICErelay
順序：`config.validate` → `transport.create` → `call.make` → `native.event.process` → `media.frame.capture` → `media.frame.render`。分岐/不変条件：TURNactive固定/failover、allocateだけ合格0、selectedcandidate実RTP。期限：ICE30s/invite90s。検証：CF_SEQ30、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ31 TLS/DNS
順序：`transport.create` → `native.event.process` → `event.publish`。分岐/不変条件：verify証明書不正拒否、DNS候補全滅Unavailable、metadata捏造0。期限：connect10s。検証：CF_SEQ31、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ32 transport復旧
順序：`native.event.process` → `transport.reconnect` → `account.register`。分岐/不変条件：backoffseed固定test/停止cancel/成功reset/refresh二重0。期限：1..60s。検証：CF_SEQ32、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ33 認証JWT
順序：`auth.credentials.verify` → `auth.token.issue` → `auth.request.authorize`。分岐/不変条件：隔離REGISTER実成功→解除削除、usernameだけ成功0、scope最小。期限：15s/rate10min。検証：CF_SEQ33、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ34 adapter断線期限取消
順序：`job.cancel` → `subscription.close` → `media.tap.close` → `media.source.remove`。分岐/不変条件：一時resource閉鎖/callkeep/halfclose/認証期限停止。期限：idlelease30s。検証：CF_SEQ34、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ35 並行容量
順序：`call.make` → `call.state.get` → `event.publish`。分岐/不変条件：全容量一括予約、世代競合0、超過ResourceExhausted。期限：10s。検証：CF_SEQ35、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ36 shutdown再入
順序：`runtime.shutdown` → `shutdown.calls.terminate` → `shutdown.accounts.unregister` → `shutdown.audio.drain` → `transport.close` → `shutdown.native.destroy` → `event.publish`。分岐/不変条件：同job、失敗蓄積、query生存範囲、無reply0。期限：総15s。検証：CF_SEQ36、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ37 paniccleanup
順序：`failure.entity.isolate` → `failure.entity.cleanup` → `event.publish`。分岐/不変条件：catchunwind/global破損停止/不明pool再利用0。期限：phase上限。検証：CF_SEQ37、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

### SEQ38 4adapter等価
順序：`runtime.initialize` → `account.add` → `account.register` → `call.make` → `call.answer` → `media.source.add` → `media.tap.open` → `call.hangup` → `client.shutdown` → `runtime.shutdown`。分岐/不変条件：同fixtureの結果/event/sample/error/revision比較、wire形だけ差。期限：同virtualclock。検証：CF_SEQ38、上記5境界・分岐ごとに操作応答/commit revision/event順序/資源残存/音声sampleを比較。

## 18 確定判断38件・Axum

全件DECIDED/SPECIFIED、実装VERIFIED別。次表を旧矛盾案より優先。本文との不整合を実装者へ選択させない。

GAP-001：指定7crate workspace、独立producer、adapter→operation→core、conformance全境界〔§01,16〕。

GAP-002：単一発行器＋Client別control/raw、globaladmin、fallback全配信禁止〔§09〕。

GAP-003：RuntimeConfig固定/不一致Conflict、Client終了とRuntime終了分離〔§03〕。

GAP-004：専用thread/current-threadTokio、state直接所有、I/Oworker隔離〔§03〕。

GAP-005：全業務操作R<Response>、受信R<Option<Item>>、値accessor例外〔§01,04〕。

GAP-006：DoorsError単一code/domain、native/SIP別、protocol写像〔§04,11〕。

GAP-007：CallState14、invite/media/transfer独立導出〔§05〕。

GAP-008：native enum symbol/header正本、数値手書き撤回、context併用〔§05,07〕。

GAP-009：answer200受理Connecting、confirmedのみConnected一回〔§05〕。

GAP-010：登録event統一、desired/state/result独立、refreshUpdated〔§05,09〕。

GAP-011：未登録発信policytrueのみ〔§05,16〕。

GAP-012：Inbandtone/detector、Info、telephoneevent分離〔§08〕。

GAP-013：500msEstimated、Observed/Unknown/remote別、桁別timer〔§08〕。

GAP-014：Boxsingleconsumer/FutureSend/erasedobjectsafe、Arc並行pull禁止〔§08〕。

GAP-015：INlocal受話/OUT送話/BOTH一pull、RawInbound不変〔§08〕。

GAP-016：RT固定slot/copy/queue、alloc/free/lock/await禁止〔§07〕。

GAP-017：LosslessはRT外best-effort、持続stall当該tap失敗〔§08〕。

GAP-018：Realtime専用ringoldestdrop、gap範囲明示〔§08〕。

GAP-019：sampletimeline期限整列/zero/遅着drop/drift〔§08〕。

GAP-020：micopen/OUTattach別、speakerIN、library暗黙device0〔§08〕。

GAP-021：WAVsource/sink正式対象、I/ORT外、partialfinalize〔§08〕。

GAP-022：WS64bytev1/ID64/明示encoding、struct直送禁止〔§11〕。

GAP-023：event/frame/sample別番号、ID＋clock相関〔§09〕。

GAP-024：RawSIPrx/tx全方向・再送/秘匿/切詰め〔§07,09〕。

GAP-025：初期応答/query/snapshotでcapability、一回event待ち禁止〔§03,09〕。

GAP-026：SeaORM+SQLxSQLite、rusqlite削除、optionalDB〔§10〕。

GAP-027：実資格情報/主体account分離/資源認可/localbootstrap〔§10〕。

GAP-028：public/protectedRouter分離、WS/gRPC同認証、外部強制〔§10,11〕。

GAP-029：独自例外でPJSIP制約解除保証撤回、GPL準拠又は取得済商用〔§13〕。

GAP-030：baseline継承/manifestlock/実buildgate、未確認option転記禁止〔§01,13〕。

GAP-031：独自0sentinel撤回、Option/nativeinvalid、native0保護〔§03,07〕。

GAP-032：raw生成/safefacade、整数enum/compileprobe/手編集禁止〔§07,13〕。

GAP-033：Mock本番fallback禁止、test-support明示、example実native〔§14〕。

GAP-034：全command返信/query生存phase/cleanup別lease/二重shutdownjoin〔§12〕。

GAP-035：producer3OSartifact→単collector→直接commit、OS別verify〔§13〕。

GAP-036：REST全操作typed入口、stream網羅、欠落CI失敗〔§11,16〕。

GAP-037：WS全操作requestresponse/双方向音声、primitive区別、全7境界〔§11,16〕。

GAP-038：本書自己完結、外部資料履歴、契約収録/検証条件明記〔§01,14〕。

AXUM-01：REST=AxumRouter/Handler/Middleware/SSE、WebSocket=AxumWebSocketUpgrade、共通operation呼出/業務重複0、認証contextadapter/対象認可operation、同listener統合と独立起動、core/operation Axum非依存。

## 19 構成型の閉包・競合・旧schema置換

SourceSpec.kind Uploadedはformat必須/capacity既定64/他path不可、Fileはpath必須/format任意、Microphoneformat必須/device任意、Silenceformat必須/duration省略無限、Toneformat必須/frequencies1..8・20Hz以上/Nyquist未満/duration必須。無関係fieldはInvalidArgument。addはkind別に同openprimitive、open→attachの二段利用可。SourceId単一call、BOTHだけ同call fanout、別callattachConflict、remove後再利用なし。

TransportConfig Tlsだけtls必須、他kindのtls拒否。Policy Anyはtransport無し、Prefer/Require必須。Credentials LocalhostOnlyは実loopback＋bootstrapproof、ApiKeyはapi_keyのみ、Jwt modeの発行credentialsはSIP username/domain/password又はaccount_id/password必須。API Bearer検証はmetadataであってCredentials.mode文字列ではない。Context指定時request_id必須、省略時生成、principal/tenant/lease注入拒否。

Streamwrapper最初request/response、以後packet/item、close/error/eof排他。Sreceive操作の初metadataはitem無し/eoffalse、その後itemstream。Cwriteの初requestに第一frame/pairを含め一回処理、次packetは次番号、最終ack累計。Bresampleも同、sessionopen初data無し。media.resampleは所有session初回にtransformstate確保/inputoutformat固定、変換だけでnative注入せずsource.write別操作。format.convert同rateのみ、StereoInOut→Monoはposition指定なし拒否（filedownmix専用規則と混同しない）。

同resource mutationはReactor受理順、reply順はjob待ちで異なる。revision=commit順。account removegate後新call/source拒否/queryはtombstoneまで。source replace/remove同frameはcommand順、後remove勝ち、旧source復活0、remove後gain/muteNotFound。tapclose競合は既dequeueitemだけ交付後EOF。WAVsinkはcall終了/CallSnapshot保持期限後も自leaseでfinish可。native poolはremovecomplete＋inflight0だけfree。

account codec/transport/header変更は新call/後続SIP処理へ、既存codec強制re-negotiate無し。gain/VADは既存call次frame、activeSRTP/ICE変更がtransport再作成を要すればConflict、暗黙downgrade無し。credentials更新REGISTER解除→再登録、calloverride clone不変、displayname変更は既存dialogidentity不変。

filesystem pathはserver側、設定root canonicalize/race-safe nofollowopen、root外adminでもserverpolicy明示なし拒否。remote一般fileはUploaded経由、sinkremote取得はtapstream→client側同WAVoperation。無断overwrite0。migrationgenerateは空up/downSQLtemplateとmetadata、schema変更SQLを推測生成しない。entitygenerateは本文DDL＋PRAGMAからINTEGERi64/TEXTString/BLOBVec<u8>/nullableOption/PK/FKを確定生成、生成file以外上書禁止。fresh/refreshも4adapter共通operation、開発toolの名を借りた裏口禁止。

旧型：SipClient→Doors、SipAccountHandle→AccountHandle、SipError/SipErrorKind→DoorsError/code+domain、SipEventPayload→EventPayload、AudioSourceId→source Id、AccountEventReceiver→Subscription/stream、AccountInfoSnapshot→RegistrationSnapshot、AudioTapHandle→StreamHandle、AudioFrameHeader→wire64byte、AudioMixer/MixerSourceEntry→worker table、AudioBridge→RTslots、ResamplePipeline/TimedFrame→resampler/sampletimeline、MockBackend→本番撤去/TestBackend明示、CallStateTransition→EffectPlan、SentDtmfError→DoorsError/Dtmf、ResolvedPjsip→build結果。

旧field対応：acc_id→account_id、registration_status→sip_status、online_statusはpresence独立、pjsip_status→native_status、timestamp_ms→unix_ns（ms×10^6）、bits_per_sample→BitDepth/sample_format、seq/sequence_number→event_sequence又はframe_sequence、first_seq/last_seqのsample混同廃止→sample_index＋frame_samples/clockanchor。Duration旧base_delay/max_delay/command_timeout/shutdown_timeout/register_timeout/invite_timeout/registration_expires→各_ms、default1000/60000/10000/15000/15000/90000/300000。native秒への切捨て禁止。

旧method add_account/account/accounts/remove_account/update_config→account.add/get/list/remove/update、register/unregister/set_registration_enabled/registration_state→account登録系、make_call/answer/hangup/hold/unhold/transfer/call_state/calls/send_dtmf→call系、subscribe/subscribe_control/subscribe_account/subscribe_raw_sip/unsubscribe/recv/recv_async→subscription系、subscribe_audio→tap.open、add_audio_source/remove_audio_source/set_audio_source_gain/mute_audio_source→source系、open_default_microphone_source→microphone.open、write_stereo_wav→WAVsequence、publish_raw_sip→rawpublish、register_callbacks→callbackregistry、transport_create→transport.create、build_router→AxumRouter、for_sip_uri→password必須validatedhelper、as_raw→FFI借用、with_status→errorconstructor、spawn→worker.start。

旧登録Started/Succeeded/Failed/UnregistrationSucceeded/Failed/Expired専用event→RegistrationStateChanged.phase/current/result、refresh→Updated。CallRejected→DisconnectInfo Busy/Declined＋SIPstatus。旧13状態記述撤回14、旧WS24byte宣言撤回64、旧DTMF推定成功の実送出保証撤回、旧raw/mediacallback不存在API撤回。旧M20/P0優先度は未実装を許す意味にしない。単一crate/privateworkspace/独自linkexception/旧phase番号は新正本の拘束条件ではない。

## 20 E1–E5・起動・復旧・精度境界

E1：defaultmerge→validate→runtime.initialize→返却capabilities→snapshot→clientshutdown→runtimeshutdown。testsはtransportport0、OS割当実portをSIPtargetへ。失敗途中資源逆順回収、過去Initialized待ち無し。
E2：account.add(username1001/domainpbx.example.com/password安全入力/register_on_startfalse/他default)→accountsubscription→register→Registered/Failedを15s以内観測、Gapはgetstate→unregister→Idle→register。401challengeだけでFailed禁止。
E3：controlsubscription→call.make(targetsip:1002@pbx.example.com,headers[],overrideなし,transportなし,mediaearlytrue/srtpなし/codecs[Opus,Pcmu]/Ordered,autoREFERfalse)→callId→Ringing/Early/Connected/Failed。着信Incoming→180→任意183→200又は486/603、接続後DTMF/hold/unhold/transfer→hangup。timeoutはjobquery後重複安全性確認、無条件再発信禁止。
E4：tap.open16k/I16/StereoInOut20ms/capacity512/Lossless/Pair→wav.opennewpath→receive/write繰返し→EOF→tapclose→wavfinish。diskfullpartial、録音失敗で通話切断0、lagや欠損を無音として隠さずflags。
E5：Uploadedsource16k/I16/Mono20ms/capacity64/Out→TTSframefeed（余剰保持）→gain0.6→mute/replace/finish→EOFdrain/remove。micopen→attachOut、WAVopen→attach、speakerRenderedInbound、Both一pull。各例library/4adapter同operation列、型値は§02/§15で一意。

run例 `doors run --config ~/.doors/config.json --softphone --rest --websocket --grpc`。flagsは同operationsequenceのcomposition、独自別実装なし。localconsoleも同105操作parser、server不要単体可能、別CLIはendpoint接続。typedoptionとrequest-json併用Conflict、暗黙merge無し。

crash復旧：DBkey/migration→pendingjournal before採用→新Runtimeepoch→新accountId→clientkey/dbmapping→register_on_start、旧Call/Stream/JobId復元禁止、dialog復元非対象、接続済偽表示0。network復旧backoff/refresh、call再INVITEはnative結果、勝手な別call旧ID化禁止。

数値range U8<=255/U16<=65535/Id1..2^64-1/I8-128..127、signed範囲、JSONinteger小数/指数/+符号/余分先頭0拒否。EventMeta logical_context<=32/keyASCII128/valueUTF84096、duplicatekey拒否。Opus RTPclock48000とbridge/deliveryrate区別、ptimepacketizationとmixerframe別。capability nativecompile値 maxcalls/maxaccounts、temporaryauth8＋overridecallも共通容量予約、超過ResourceExhausted。

AEC referenceは実render、clockdriftは固定ratio±200ppm、wall時刻step>100msでepoch変更、JWTskew30sec、timeoutmono固定。RT thread優先度の実OS保証を前提にしない。job結果JSONbytesはoperation_idから元Responseに型復元、untyped任意値ではない。取消=callerwait/jobcancel/callhangup/sourcefinish/sourceremove/tapclose/socket断それぞれ別契約。

## 21 不変条件・実装ゲート

I01 nativecontrol ownerthread1。I02 resourceowner tenant/Client一意。I03 statecommit→publish。I04 nativeID世代誤帰属0。I05 RTalloc/free/lock/await/syscall0。I06 sample数/wirelength整合。I07 slowreaderが通話RTを停止0。I08 terminalevent/cleanup一回。I09 operation×7境界未対応0。I10 snapshotbarrier以後欠落検知。I11 Estimated/Observed/remote受信別。I12 secret専用応答以外漏洩0。I13 認可前副作用0。I14 command無言drop0。I15 nativepool早期free0。I16 仕様記載≠実装verified。

実装順：型/registry/state→native consumer build A＋producer B並列→transport/account/event/raw/DTMF/ICE/media本番配線→4adapter→全conformance→負荷/配布。A=compile＋実integration、B=各OS成果物独立verify、全体は両方。機能定義を実装時の推測へ丸投げしない。nativeheader/ABI/実networkは受入れ検証対象であり文書内の宣言だけで検証済にしない。

## 22 内容照合で補完した実装拘束

永続Runtime/TURN/API設定secretはsecret_blobsへAEAD保存、ref_key=設定JSONPointer、AAD='doors/settings/'+tenant+'/'+ref_key+'/1'。config_json/client_settingsには内部形式{$secret:ref_key}、publicConfiguration型とは別のDBcodec、復元時DBcodecが復号して型validate、API出力はredacted。accounts.passwordは既定account用envelope、secret_blobsも同keyrotationtransaction、row/account削除時不要refを参照count照合後削除。秘密参照を外部config入力として受理禁止。nonceCSPRNG、再利用防止、noncecollision確率0と断言しない。

raw redact_authorization=falseはlocal explicit adminのRust/CLI購読だけ許可、externalREST/WS/gRPC配送と全logは常にauth/keyredact。captureは原byteをboundedpoolへ、通常変換時redact、local特権出力は専用permissionと設定両方必要。raw_sip.redact操作は設定値に関わらず常時秘匿。include_bodiesfalse/size制限は特権でも維持、外部からfalsepatchはPermissionDenied、secretserializer一般規則をrawdebug例外で広げない。

raw/application control callbackはReactor由来、pjmedia DSP workerがPJlib threadlocalを要する場合worker開始時pj_thread_register wrapperを実行、pjsua制御はReactor固定のまま。AEC/DSP wrapper status検査/失敗MediaError、音声pool所有はworker、CPALcallbackでnativeDSP呼出し禁止。

conf async jobは受理→completedを区別、user connect/disconnect戻り値はcompletionを待ってconnected/disconnected=true、job待機はReactorloopを止めない。register bridge_id返却時もport登録完了確認。job受付応答とnative完了応答が異なる操作はResponse型にjob_idあり、boolsuccessで先行偽装しない。CALLanswer/hold等はaccepted response、callstate確定event別。

phase getaccountqueryはshutdownnative削除直前まで可能、削除後snapshotだけ。Readをnative sourceoftruthへ直結して後段queryでpjsua_destroy後呼出する禁止。shutdown内部disconnect/removeは専用systeminvocation、外部adminがphasegateを迂回する手段にしない。

実環境制約としてCMake/nativeheader/systempackage/protoccompiler/codecparam実機適合は受入れgate、テキスト/ハッシュ検査をこれらの成功と表示しない。本書は具体的な動作・失敗契約を決定しており、未確認native field名を捏造する代わりにsafe C shimの同contract実装＋compileprobeで対応する。

## 23 提出前検査・内容照合・再実行

監査対象：本書本文と、旧RFC-ROOT.md及び会話内の新要件/38決着/Axum。AIによるテキスト内容照合を実施、独立した人間の目視監査を実施したとの表示はしない。原文の見出しが対応するだけ/識別子が存在するだけを設計移植の証明にしない。操作票のpre/手順/補償/post、型presence、stream、状態、RT寿命、DB、protocolを横断照合し、検出した秘密設定永続化・conf完了待ち・native DSP thread登録・raw秘匿policyを§22で具体化した。

|内容照合範囲|本文の実体|
|---|---|
|目的/構成/library/softphone/GUI境界|§01/20|
|全公開型/既定値/validation/patch|§01–02/15/19|
|Runtime/Client/所有権/並行性/ID|§03–04/12|
|登録/発着信/hold/transfer/状態|§05–06/16–17|
|codec/transport/DNS/ICE/TURN/TLS/SRTP|§06–07/13–14|
|DTMF/PCM/整列/resample/source/device/WAV|§08/16–17/20|
|イベント/RawSIP/購読/clock/lag|§09/15–17|
|認証/認可/秘密/DB/transaction|§04/10/19/22|
|CLI/REST/AxumWS/gRPC/全操作|§11/15–16|
|ビルド/prebuilt/配布/license/互換|§13|
|core/operation/4adapter/conformance/全sequence|§14–17/21|
|確定38判断/Axum/旧型API置換|§18–19|

自動検査実績：本書全362型/105RPC/105操作票/38sequence/38決着の参照・型・tag・mode・各操作9項目、SQL DDL実行（8業務table）、wire64byte連続offset/encode-decode/64bit精度、旧public field164名/method44名の保持又は改名対照、GUI固有製品名0。意図破壊10件（操作欠落/型未定義/RPC重複/mode不一致/未知step/決着欠落/wire破損/optional不正/SQL欠落/処理手順欠落）を各専用検出器で検出。ハッシュ不一致だけの検出を合格にしない。

検査scope：構造/型参照/実DDL/byte layout/仕様項目の存在と相互整合。native compile・protoc compiler・実SIP/RTP・OSdevice・負荷は本書で受入れoracleを定義した実装試験、今回実行済みと偽らない。意味的完全性の数学的証明でもない。残る検証限界を理由に文書提出を停止せず、具体的な設計と試験条件を本書へ収録した。

LEGACY_SHA256=677c8cfad37b4884580c2e47c50dfc617b1163c3742da34f67fedae0d8aa87b5
DESIGN_BODY_SHA256=4a38efce3420d1fef244f0c13d15073d5df4aeba92d3195cbbc94f96426b3b89

本書だけで再検査可能。以下のPythonを実行すれば、別registry/CSVなしに本文のproto/操作票/sequence/SQL/wireを検査。旧原文比較だけ任意--source、破壊検査--self-test。次のshell例は同じMarkdown内コードを読み実行する（ファイル結合不要）。

```sh
python - doors-complete-design.md --self-test <<'PY'
import re,sys
from pathlib import Path
text=Path(sys.argv[1]).read_text()
code=re.findall(r'```python
(.*?)
```',text,re.S)[-1]
exec(compile(code,'<embedded-audit>','exec'),{'__name__':'__main__'})
PY
```

## 24 同梱検査コード

```python
#!/usr/bin/env python3
import argparse,hashlib,json,re,sqlite3,struct
from pathlib import Path

def inspect(text,source=None):
 checks=[]
 def ck(name,condition):checks.append({'check':name,'pass':bool(condition)})
 proto=re.search(r'```proto\n(.*?)\n```',text,re.S).group(1)
 declarations=re.findall(r'^(message|enum) (\w+) \{',proto,re.M);names={n for _,n in declarations}
 ck('362 type definitions unique',len(declarations)==362==len(names))
 primitives={'bool','uint32','uint64','sint32','sint64','double','string','bytes'}
 references=set(re.findall(r'(?:(?:optional|repeated) )?(\w+) \w+ = \d+;',proto))
 ck('all field types resolve',not (references-primitives-names))
 tag_errors=[];optional_errors=[];enum_constants=[]
 for line in proto.splitlines():
  m=re.match(r'(message|enum) (\w+) \{(.*?)\}(.*)',line)
  if not m:continue
  kind,name,content,comment=m.groups()
  fields=re.findall(r'(?:optional |repeated )?(\w+) (\w+) = (\d+);',content)
  if kind=='message':
   tags=[int(tag) for _,_,tag in fields];fn=[n for _,n,_ in fields]
   if len(tags)!=len(set(tags)) or len(fn)!=len(set(fn)) or any(t<=0 or 19000<=t<=19999 for t in tags):tag_errors.append(name)
   opt=re.search(r'business_optional=([^;]+);',comment)
   if opt and opt.group(1)!='-' and not set(opt.group(1).split(','))<=set(fn):optional_errors.append(name)
  else:
   values=re.findall(r'(\w+) = (\d+);',content);enum_constants += [n for n,_ in values]
   if len(values)!=len({int(v) for _,v in values}):tag_errors.append(name)
 ck('message tags and names valid',not tag_errors)
 ck('business optional annotations resolve',not optional_errors)
 ck('enum constants globally unique',len(enum_constants)==len(set(enum_constants)))
 rpcs=re.findall(r'^\s*rpc (\w+)\((stream )?(\w+)\) returns \((stream )?(\w+)\);',proto,re.M)
 ck('105 RPC methods unique',len(rpcs)==105==len({r[0] for r in rpcs}))
 ck('all RPC types resolve',all(a in names and b in names for _,_,a,_,b in rpcs))
 op_sections=re.findall(r'^### (OP\d{3}) ([\w.]+)\n(.*?)(?=^### |^## |\Z)',text,re.M|re.S)
 ck('105 operation contracts unique',len(op_sections)==105==len({x[0] for x in op_sections})==len({x[1] for x in op_sections}))
 rpcmap={r[0]:r for r in rpcs}
 for label,pattern in [('precondition','前提：'),('procedure','順序：'),('failure compensation','失敗/補償：'),('postcondition','事後：'),('CLI','CLI `doors '),('REST','REST `POST /api/v1/operations/'),('WebSocket','WS `operation_id='),('gRPC','gRPC `doors.v1.Doors/'),('conformance','適合 `CF_')]:
  ck('every operation has '+label,all(pattern in b for _,_,b in op_sections))
 ck('every operation has full request response types',all((m:=re.search(r'型 `(\w+) → (\w+)`',b)) and m[1] in names and m[2] in names for _,_,b in op_sections))
 ck('operation RPC and stream mode agree',all((rn:=''.join(w[:1].upper()+w[1:] for w in key.split('.'))) in rpcmap and (mo:=re.search(r'mode=([USCB])',b)) and mo[1]==('B' if rpcmap[rn][1] and rpcmap[rn][3] else 'C' if rpcmap[rn][1] else 'S' if rpcmap[rn][3] else 'U') for _,key,b in op_sections))
 seq_sections=re.findall(r'^### (SEQ\d{2}) ([^\n]+)\n(.*?)(?=^### |^## |\Z)',text,re.M|re.S)
 keys={key for _,key,_ in op_sections}
 ck('38 sequences unique',len(seq_sections)==38==len({x[0] for x in seq_sections}))
 ck('all sequence steps resolve',all((ks:=re.findall(r'`([\w.]+)`',b)) and all(k in keys for k in ks) for _,_,b in seq_sections))
 ck('all sequences have branches deadlines oracles',all('分岐/不変条件：' in b and '期限：' in b and '検証：' in b for _,_,b in seq_sections))
 decisions=re.findall(r'^GAP-(\d{3})：',text,re.M)
 ck('38 decisions complete once',decisions==[f'{i:03}' for i in range(1,39)])
 ck('Axum explicit','AXUM-01：' in text and 'WebSocketUpgrade' in text and 'core/operation Axum非依存' in text)
 ck('required seven crates',all('doors-'+s in text for s in ['core','operation','cli','rest','websocket','grpc','conformance']))
 forbidden=''.join(map(chr,[116,97,117,114,105]))
 ck('GUI specific product references absent',forbidden not in text.lower())
 sql=re.search(r'```sql\n(.*?)\n```',text,re.S).group(1)
 db=sqlite3.connect(':memory:');db.executescript(sql);tables=[r[0] for r in db.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'")];db.close()
 ck('SQL DDL executes and eight tables exist',len(tables)==8)
 wire=re.search(r'offset0 magic\[4\].*?sample_format:u8',text).group(0)
 fields=[]
 for m in re.finditer(r'(?:offset|;)(\d+) ([a-z_]+)(?:\[(\d+)\]|:([ui]\d+))',wire):fields.append((int(m[1]),m[2],int(m[3]) if m[3] else int(m[4][1:])//8))
 ck('wire document contiguous 64 bytes',len(fields)==16 and fields[0][0]==0 and all(a[0]+a[2]==b[0] for a,b in zip(fields,fields[1:])) and fields[-1][0]+fields[-1][2]==64)
 fmt='!4sBBHHHIQQQQqIHBB';v=(b'DORS',1,1,0,64,0,640,2**64-1,2**53+1,3,4,-1,16000,160,2,1);buf=struct.pack(fmt,*v)
 ck('wire encode decode roundtrip',len(buf)==64 and struct.unpack(fmt,buf)==v)
 ck('64bit ID wire precision',int.from_bytes(buf[16:24],'big')==2**64-1 and int.from_bytes(buf[24:32],'big')==2**53+1)
 marker='## 23 提出前検査';prefix=text.split(marker,1)[0];declared=re.search(r'DESIGN_BODY_SHA256=([0-9a-f]{64})',text)
 if declared:ck('normative body hash',hashlib.sha256(prefix.encode()).hexdigest()==declared[1])
 if source:
  original=Path(source).read_text();sf=sorted(set(re.findall(r'\bpub\s+(\w+)\s*:',original)));sm=sorted(set(re.findall(r'\bpub\s+(?:async\s+)?fn\s+(\w+)',original)))
  found=lambda x:re.search(r'(?<![A-Za-z0-9_])'+re.escape(x)+r'(?![A-Za-z0-9_])',text) is not None
  ck('legacy public fields retained or explicitly renamed',all(found(f) for f in sf))
  ck('legacy public methods retained or explicitly mapped',all(found(f) for f in sm))
  d=re.search(r'LEGACY_SHA256=([0-9a-f]{64})',text)
  if d:ck('legacy source hash',hashlib.sha256(Path(source).read_bytes()).hexdigest()==d[1])
 return {'pass':all(x['pass'] for x in checks),'checks':checks,'counts':{'types':len(names),'operations':len(op_sections),'rpc':len(rpcs),'sequences':len(seq_sections),'decisions':len(decisions),'tables':len(tables)},'not_proven':['semantic mathematical completeness','native compile or interoperability','independent human review']}


def self_test(text):
 cases=[
 ('operation missing',re.sub(r'^### OP001 .*?(?=^### OP002 )','',text,flags=re.M|re.S),'105 operation contracts unique'),
 ('undefined type',text.replace('AudioFormat default_delivery_format','AbsentAudioFormat default_delivery_format',1),'all field types resolve'),
 ('duplicate RPC',text.replace('rpc ClientOpen(','rpc RuntimeInitialize(',1),'105 RPC methods unique'),
 ('wrong streaming mode',text.replace('scope=admin、mode=U','scope=admin、mode=B',1),'operation RPC and stream mode agree'),
 ('unknown sequence step',text.replace('順序：`config.load`','順序：`missing.step`',1),'all sequence steps resolve'),
 ('missing decision',re.sub(r'^GAP-038：.*\n','',text,flags=re.M),'38 decisions complete once'),
 ('bad wire offset',text.replace(';16 stream_id:u64',';17 stream_id:u64',1),'wire document contiguous 64 bytes'),
 ('bad optional metadata',text.replace('business_optional=-;','business_optional=absent_field;',1),'business optional annotations resolve'),
 ('missing SQL table',text.replace('CREATE TABLE secret_blobs(tenant_id TEXT NOT NULL,ref_key TEXT NOT NULL,envelope BLOB NOT NULL,PRIMARY KEY(tenant_id,ref_key));',''),'SQL DDL executes and eight tables exist'),
 ('procedure missing',text.replace('順序：','手順名だけ：',1),'every operation has procedure')]
 results=[]
 for name,changed,detector in cases:
  result=inspect(changed)
  detected=any(x['check']==detector and not x['pass'] for x in result['checks'])
  results.append({'fault':name,'detector':detector,'detected':detected})
 return {'pass':all(x['detected'] for x in results),'tests':results}

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('document');ap.add_argument('--source');ap.add_argument('--self-test',action='store_true');args=ap.parse_args();text=Path(args.document).read_text();result=inspect(text,args.source)
 if args.self_test:result['self_test']=self_test(text);result['pass']=result['pass'] and result['self_test']['pass']
 print(json.dumps(result,ensure_ascii=False,indent=2));raise SystemExit(0 if result['pass'] else 1)

```
