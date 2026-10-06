# RFC-SEED の解説: gaia-network（pkg-0020）

これから grill を始める人が、この seed が全体のどこで何を担っているかを先に掴むための文書です。
事実そのものは同じディレクトリの `INFO-RFC-SEED.md` にあり、この文書はそれを説明したものです。
`[::MUST-FILL::]` はAIが説明を書く箇所、`<!-- 人間の判断 -->` は人間が判断を書き込む箇所です。

- 対象の seed: `~/shyme/gaia/crates/network/gaia-network/RFC-SEED.md`


## 30秒でわかるこのディレクトリ

- このディレクトリ: `crates/network/gaia-network`（層 protocol / 種別 production-library）
- 全体の中での位置: wave 0 / 実装レベル 1 / 通し番号 1

このディレクトリは、インターネット越しに「あの端末」を名指しで見つけ出し、暗号化された一本の通り道を作り、その通り道の上で普通のHTTPのやりとりを相手の端末の中のサーバーまで届ける部品です。相手が家庭や会社のネットワークの内側にいて外から直接つなげない場合でも、外から入れる場所に置かれた中継役を経由して通り道を作ります。届いたのか、届かなかったのか、届いたかどうか分からないのかを、はっきり区別して呼び出し元に返すところまでが仕事です。

- 相手は住所（IPアドレス）では指定できず、端末ごとの識別子でしか指定できない。識別子が一致しなければ、同じ住所にいても別の相手として拒否する。
- この部品が言えるのは「届いたかどうか」だけである。届いた中身が正しいか、誰の権利か、支払われたかは一切判断しない。それを決めるのは上位の層である。
- 内側にある端末同士でも通り道は作れるが、それは「今この瞬間に相手が応答した」以上のことを約束しない。回線が切れている、中継を断られた、相手のアプリが落ちている場合は届かない。

人間が決めること: 2 件

## 全体の中での位置

- 全体は 29 パッケージ・7 層・84 境界。
- この位置: レベル 0（0始まり）・2番目
- 直列で待つ相手（宣言された辺のみ）: 0 件 / 並列で進めてよい相手（同じ段）: 1 件 / この完了を待つ相手: 1 件
- 全体は 11 段。この鎖は短縮できないので、段の下限は 11。

直列で待つ相手は 1 件もありません。先に完成していなければならない相手が、記録された辺としてはひとつも無いという意味です。段の番号が違う相手がいることは直列の理由にはなりません。並列で進めてよい相手は `crates/foundation/gaia-foundation` の 1 件で、同じ段に置くという規則そのものが「互いに依存しない」ことを保証しています。このパッケージの完成を待つ相手は `crates/adapters/gaia-transport-adapter` の 1 件で、こちらが先に固まらないと相手は組み立てに入れません。

## このディレクトリが担うもの

- owns the P2P transport of 28: exact DeviceId resolution, authenticated encrypted QUIC connection, bounded HTTP exchange and loopback REST delivery
- owns the two DHT actors, the signed-peer tag actor, address publication and freshness, and routing-contact persistence
- owns the connection pool, peer policy, reserved slots, deadlines and the transport error vocabulary
- owns the relay seed, relay grant and opaque relay-admission bridge, and the public server roles of 28.28
- owns the transport-private header and AuthenticatedTransportContext that name which authenticated connection a request arrived on
- owns the transport invariants of 28.5 and the capacity model of 28.32
- owns no Gaia semantics: it never decides identity, authority, validity, finality, payment or storage acceptance

引き受けるのは、相手の端末までの通り道を作り、その上でやりとりを運ぶことだけです。端末の識別子から今の連絡先を探すこと、本人確認つきで暗号化された通り道を張ること、その上で大きさの上限が決まった HTTP のやりとりを一往復させること、そのやりとりが「どの通り道で届いたか」を後から辿れる印として残すこと、外から入れる案内役と中継役のサーバーとして振る舞うことが中身です。通り道そのものの在庫（同時に何本まで張れるか、どの相手を断るか、いつまで待つか）もここが持ちます。

届いた中身が誰のものか、権利として有効か、支払われたか、確定したかは判断しません。本人性と権限は `crates/protocol/gaia-soul`、数え方と上限の決まりは `crates/protocol/gaia-invariants`、外の世界に触るための窓口の定義は `crates/ports/gaia-ports` が持ちます。このパッケージの鍵は通り道を作るための鍵で、Gaia の身分証ではありません。Gaia の言葉への翻訳は `crates/adapters/gaia-transport-adapter` が行います。

## 他のディレクトリとの約束ごと

- boundary-083: pkg-0029 と結合（理由: composition）
- contract-boundary-083: 提供する側 — 相手 pkg-0029（value_only）

相手は `crates/adapters/gaia-transport-adapter` の 1 つだけで、こちらが渡す側です。渡すのは、(1) 起動して動き続ける本体、(2) 指定した識別子の相手に固定された一本の通り道を表す取っ手、(3) その取っ手で HTTP のやりとりを一回ぶん行い結果と失敗の種類を受け取る窓口、(4) そのやりとりが実際にどの通り道で届いたかを示す印、(5) 相手の連絡先を探す問い合わせ、の 5 つです。(3) の失敗の種類の意味が変わると、相手は「どの失敗を送り直してよく、どれを利用者に見せるか」を決められなくなります。(4) の印の意味が変わると、相手は「同じやりとりの続きか、別のやりとりか」を取り違えます。

## 人間が決めること（ここだけ）

このパッケージが所有する未解決の論点は登録されていません。ただし、この seed を読んだ人間が持ち込んだ論点が 5 つあり、下の質問はそれをまとめて決めるためのものです。

<!-- explain-seed:added-point id="added-001" -->
- 出どころ: 「Docker等を利用したパケットレベルでのP2P通信のテストはテストコードで機械的に保証されていなければならない」
- 論点: 家庭や会社のネットワークの内側にある複数の端末の間で到達が成り立つことを、コンテナで組んだ網の上でパケットのやりとりまで含めて再現し、テストコードが自動で判定する。
<!-- /explain-seed:added-point -->

<!-- explain-seed:added-point id="added-002" -->
- 出どころ: 「人間が手と目で通信の成功を詳細に点検できる方法が用意されていなければならないのである」
- 論点: 人が手と目で、相手を見つける・つながる・本人確認する・要求を送る・応答を受け取るのどの段で何が起き、どこで止まったかを追えるようにする。
<!-- /explain-seed:added-point -->

<!-- explain-seed:added-point id="added-003" -->
- 出どころ: 「gaia-network は、crate でありながら単なるライブラリであってはならない。単独でビルドし、必要なサーバーをグローバルに配置し」
- 論点: ライブラリの中身だけでなく、単独でビルドでき、公の案内役・中継役のサーバーを実際に置いて多数の端末の到達を試せる一式を、成果物に含める。
<!-- /explain-seed:added-point -->

<!-- explain-seed:added-point id="added-004" -->
- 出どころ: 「人間が手と目で通信の成功を詳細に点検できる方法が用意されていなければならないのである」（「詳細に」がどこまでを指すかが未定）
- 論点: 点検で見える範囲。到達できたかどうかだけで足りるのか、直接つながったのか中継を経たのか、どの段でどれだけ時間がかかったかまで見える必要があるのか。
<!-- /explain-seed:added-point -->

<!-- explain-seed:added-point id="added-005" -->
- 出どころ: 「到達を保証できない（あるいは到達できないことを正確に検知できない）場合は、Gaia という全体が完全に崩壊する」
- 論点: 到達できなかったことと、届いたかどうか分からないことを区別して返し、不確かな結果を成功として扱わない。
<!-- /explain-seed:added-point -->


<!-- explain-seed:round 1 -->

### 判断 Q1

- 判断の前提:
  Gaia は、端末どうしが直接やりとりできることを前提にした仕組みです。家庭や会社のネットワークは、外から中へ入ってくる通信を普通は遮ります。それでも相手を見つけて通り道を作れるのかを、どう確かめたら「できた」と言えるかが、ここで決めることです。
- この判断は、実装も設計も知らない人がこの節だけで決められるように書いています。ここから下は記録の言葉のままの写しで、読まなくても判断できます。
- 束ねた論点: added-001, added-003
- 決められなかった理由: contract-boundary-083 の clauses.tests と WORKSPACIFY-ALLOCATE-MANIFEST を調べたが、完成の条件に何を含めるか（自動の到達試験と、単独で置ける一式）は記録が定めていない。added-001 と added-003 は人間が持ち込んだ論点であり、決め手になる記録が無いため質問とした。
- この質問で決まること: パケットのやりとりまで再現する自動の到達試験と、単独でビルドして公のサーバーを置ける一式を、どちらも完成の条件に含めるかどうかが決まります。
- 記録の写し: 登録された未解決の論点はなく、束ねた論点は人間が持ち込んだものなので記録の写しはありません。参考: contract-boundary-083 の clauses.tests は「Joint Gaia-to-gaia-network tests (section 25.2, I01 to I30), executed in isolated local fixtures and reported as NOT_RUN when not executed」と定め、実行できる設備の有無には触れていません。

この部品が本当に相手の端末まで届くのかを、どう確かめたら「できた」と言えるかを決めます。複数の端末とサーバーを用意して通してみるのか、小さな自動テストが通れば十分とするのかで、完成までの道のりと「届く」という主張の重さが変わります。

- 選択肢:
  A: 複数台の端末と、外から入れる案内役・中継役のサーバーを丸ごと用意し、通して確かめていない限り「できた」と呼ばない。作る側の手間と待ち時間は増えるが、「届く」という主張には、誰でも同じ手順で繰り返せる事実が付く。
  B: 一式は用意するが、完成の条件にはせず、小さな自動テストが通れば完成とする。作る側は早く先へ進めるが、遮られた網の下での到達は、実際には誰も通していないまま「用意はしてある」とだけ言える状態で出る。
  C: 機械が確かめる分だけを完成の条件にし、人が手で点検する分は手順として残す。自動で通っていれば完成と言えるが、人が見るための道筋が使えなくなっても誰も気づかない。
- 推奨: A
- 推奨の理由: 記録では、この部品が扱う「到達」は、相手の端末まで実際に届いて応答か分類された失敗が返ることを指し、回線が切れている・中継を断られた・相手のアプリが落ちている場合は届かないと `docs/gaia-network-detailed-design-v3.md` の §3 に書かれています。届かないことを見落とすとその上に載る全部が誤った前提で積み上がるので、実際に通した事実を完成の条件に置くほうが安全です。
- 推奨が覆る条件: 案内役と中継役のサーバーを Gaia の別の担当が常時運用することになり、この部品の側で立てて通す必要がなくなったとき。

- 誰の体験が変わるか:
  後続のエンジニア。「到達できる」と言う前に一度は実際に通す手間が増える代わりに、公開前に届かない不具合を見つけられる。運用する人。同じ一式と同じ手順で自分でも到達を確かめられる。
- 決めないと何が困るか:
  完成の条件が「小さなテストが通ったこと」のまま進むと、遮られた網の下で本当に届くのかを誰も確かめないまま上に設計が積み上がる。後から届かないと分かったときには、この部品の中では済まず上まで戻ることになる。

<!-- 人間の判断 -->
Q1: A

### 判断 Q2

- 判断の前提:
  この部品でうまくいかないとき、原因は「相手が見つからなかった」「つながったが断られた」「送ったが返事が来なかった」など、いくつもの段のどれかです。ふだん残るのは、呼び出した側のプログラムが受け取る短い符号だけです。人が手と目で確かめるときに、どこまで見えるようにするかを決めます。
- この判断は、実装も設計も知らない人がこの節だけで決められるように書いています。ここから下は記録の言葉のままの写しで、読まなくても判断できます。
- 束ねた論点: added-002, added-004
- 決められなかった理由: contract-boundary-083 の clauses.postconditions（NotSubmitted と Unknown の切り分け）を調べたが、人が失敗の段をどこまで見えるようにするかは記録が定めていない。added-002 と added-004 は人間が持ち込んだ論点であり、決め手になる記録が無いため質問とした。
- この質問で決まること: 人が失敗の段を追えるようにするかどうかと、成否だけでなく経路や段ごとの時間まで見せるかどうかが決まります。
- 記録の写し: 登録された未解決の論点はなく、束ねた論点は人間が持ち込んだものなので記録の写しはありません。参考: contract-boundary-083 の clauses.postconditions は「A failure whose application bytes demonstrably never entered the transport is NotSubmitted; every other uncertain failure is Unknown」と切り分けを定めています。

うまくいかなかったときに、人がどこまで原因を自分で見つけられるようにするかを決めます。段ごとに見えるようにするか、成否と短い符号だけに留めるかで、作る側の手間と、調べる側が原因にたどり着くまでの時間が変わります。

- 選択肢:
  A: 段ごとに見える一式を作り、相手を見つける・つながる・本人確認する・要求を送る・応答を受け取るの各段で、何が起きてどこで止まったかが人が読める形で残る。作る側の手間は増えるが、うまくいかないときに調べる人が原因の段を自分で特定できる。
  B: 成否と短い符号だけに留め、新しく作るものは増やさず、ふだんの記録と手順書で足りる。作る側は楽だが、うまくいかないときに調べる人は「届かなかった」より先のことが分からず、毎回、通信そのものを疑って最初から調べ直すことになる。
- 推奨: A
- 推奨の理由: この部品の失敗は種類が多く、「届かなかった」と「届いたか分からない」を取り違えると、その上に載る側が誤った前提で動きます。記録でも、不確かな失敗はすべて Unknown として扱い、成功として扱ってはいけないと決まっています（contract-boundary-083 の clauses.postconditions、`INFO-RFC-SEED.md` の「Contracts」）。段ごとに見える形にしておけば、その区別が人の目で確かめられます。
- 推奨が覆る条件: ふだんの記録だけで失敗の段を特定できるようになり、段ごとに見える一式が要らなくなったとき。

- 誰の体験が変わるか:
  後続のエンジニア。どの段で止まったかを自分で見つけられる。AI。利用者からの報告と突き合わせて原因の候補を絞れる。利用者。切り分けが早く終わり、待たされる時間が短くなる。
- 決めないと何が困るか:
  成否だけに留めたまま進むと、報告が来るたびに調べる人は通信そのものを最初から疑い直すことになる。原因が分からないまま「たまたま直った」で閉じられ、同じ不具合が繰り返し起きる。

<!-- 人間の判断 -->
Q2: A

## 先に決めておいたこと

この節は、事実と慣習で決まるものを人間の代わりに決めたものです。使い心地の観点で納得できないものがあれば、そのままにせず grill で覆してください。

### 先に決めた A1 — contract-boundary-083 の clauses.errors

- 決定: Busy capacity refusal is immediate, and the network never reinterprets an application failure as advice to replay the transport exchange.,The loopback hop answe…（以下 1057 文字省略）
- 根拠: contract_registry の contract-boundary-083 の clauses.errors
- 覆す条件: 上位のアダプタが「送信前に落ちた」と「送ったか分からない」を区別せず同じ扱いにする設計へ変わり、失敗の種類を分けて返す必要がなくなったとき。

### 先に決めた A2 — contract-boundary-083 の clauses.input

- 決定: The outbound surface the adapter drives: Network::start with the transport seed, the NodeConfig surface (bootstrap and extra_bootstrap, relay, state_dir), tag p…（以下 352 文字省略）
- 根拠: contract_registry の contract-boundary-083 の clauses.input
- 覆す条件: 上位が、固定した一本の通り道ではなく宛先を毎回指定する単発の呼び出しだけで足りる設計へ変わり、取っ手を session に固定する前提が崩れたとき。

### 先に決めた A3 — contract-boundary-083 の clauses.invariants

- 決定: A single-connection session stays coherent: direct/relay switching, relay failover, NAT rebinding and path migration inside one Iroh connection keep the binding…（以下 1628 文字省略）
- 根拠: contract_registry の contract-boundary-083 の clauses.invariants
- 覆す条件: 土台にしている Iroh が接続の張り替えを許さなくなり、経路の切り替えやネットワークの付け替えが一本の接続の中で起きなくなったとき。

### 先に決めた A4 — contract-boundary-083 の clauses.ordering

- 決定: The local REST rewrite order is fixed: parse and validate framing, method, URI and limits; remove both caller-supplied reserved headers case-insensitively and i…（以下 900 文字省略）
- 根拠: contract_registry の contract-boundary-083 の clauses.ordering
- 覆す条件: 通り道の先にあるアプリのルーターが、予約ヘッダの除去と Host の書き換えを自分で行うようになり、通り道側で書き換える必要がなくなったとき。

### 先に決めた A5 — contract-boundary-083 の clauses.output

- 決定: A DeviceHandle pinned to a single authenticated QUIC connection; an AuthenticatedTransportContext {local_device_id, peer_device_id, binding_id} delivered as Res…（以下 283 文字省略）
- 根拠: contract_registry の contract-boundary-083 の clauses.output
- 覆す条件: 「どの通り道で届いたか」の印を、このパッケージ以外の場所からも得られるようになり、到達の証拠としてこの印が要らなくなったとき。

### 先に決めた A6 — contract-boundary-083 の clauses.postconditions

- 決定: A closed handle returns TransportClosed and never redials to another connection, and a context mismatch returns TransportBindingChanged.,A failure whose applica…（以下 555 文字省略）
- 根拠: contract_registry の contract-boundary-083 の clauses.postconditions
- 覆す条件: 閉じた取っ手が黙って別の通り道へ張り直す挙動を上位が求めるようになったとき（閉じたことを知らせずに繋ぎ直す設計へ変えたとき）。

### 先に決めた A7 — contract-boundary-083 の clauses.preconditions

- 決定: A general REST or WebSocket frontend never trusts the reserved headers and uses its own interface authentication context instead.,The adapter asks gaia-network …（以下 560 文字省略）
- 根拠: contract_registry の contract-boundary-083 の clauses.preconditions
- 覆す条件: 一般の REST/WebSocket の入口から来た要求でも、予約ヘッダの申告を権威として扱ってよいと決まったとき。

### 先に決めた A8 — contract-boundary-083 の clauses.tests

- 決定: Joint Gaia-to-gaia-network tests (section 25.2, I01 to I30), executed in isolated local fixtures and reported as NOT_RUN when not executed: I02 a correct Device…（以下 2746 文字省略）
- 根拠: contract_registry の contract-boundary-083 の clauses.tests
- 覆す条件: 結合試験 I01〜I30 が、隔離されたローカルの設備では実行できない形（外部の実機や公のネットワークを必須とする形）へ変わったとき。

### 先に決めた A9 — added-005 到達不能と不明の区別

- 決定: 到達できなかったことと、届いたかどうか分からないことを区別して返し、不確かな結果を成功として扱わない。
- 根拠: contract-boundary-083 の clauses.postconditions（obj-000960 NotSubmitted は application のバイト列が通り道に渡っていないと言える場合だけで、それ以外の不確かな失敗は obj-000946 DeliveryState の Unknown）。
- 覆す条件: 上位が「送ったか分からない」を成功と同じ扱いにできると決めたとき（再送しても安全だと上位が保証する形へ変えたとき）。

### 先に決めた A10 — added-001 / added-003 到達の証拠を完成の条件に置く

- 決定: 家庭や会社のネットワークを越えた複数の端末の間で到達が成り立つことを、コンテナで組んだ網の上でパケットのやりとりまで再現する自動試験で確かめる。その試験と、単独でビルドして公の案内役・中継役のサーバーを置ける一式の両方を完成の条件に置き、通して確かめていない限り完成と呼ばない。
- 根拠: Q1 A（人間の回答）。contract-boundary-083 の clauses.tests が定める「isolated local fixtures で実行し、未実行は NOT_RUN として報告する」の範囲を、複数端末・NAT 越えの設備まで広げるもの。
- 覆す条件: 案内役と中継役のサーバーを Gaia の別の担当が常時運用することになり、この部品の側で立てて通す必要がなくなったとき。または、隔離ローカルの小さな設備では再現できないと分かり、より大きな設備を別の担当が用意する形に変わったとき。

### 先に決めた A11 — added-002 / added-004 人の点検は段ごとに見える形で作る

- 決定: 人が手と目で点検するための一式を用意し、相手を見つける・つながる・本人確認する・要求を送る・応答を受け取るの各段で、何が起きてどこで止まったかが人の読める形で残るようにする。成否と短い符号だけに留めない。
- 根拠: Q2 A（人間の回答）。contract-boundary-083 の clauses.postconditions が定める NotSubmitted と Unknown の切り分け。
- 覆す条件: ふだんの記録だけで失敗の段を特定できるようになり、段ごとに見える一式が要らなくなったとき。または、段ごとの情報が相手の経路や住所を必要以上に晒すと分かり、見せる範囲を狭める形に変わったとき。

## 踏むと壊れる線と用語ミニ辞典

### 踏むと壊れる線

- 該当する記録はありません。

### 用語ミニ辞典

- `不変条件`（invariant）（仕様 13410 行目）
  > gaia-networkは輸送層であり、Soul、forum、権利、決済、finalityの実装を吸収しない。この節は、第29章の統合契約がGaiaの数理的・経済的不変条件へ干渉しないことを列挙する。第24.1節〜第24.19節の数理的`AssetScore`・Civic不変条件を変更しない。
  どの時点で誰が何をしても崩れてはいけない約束のことです。この語が要るのは「そうするのが望ましい」と「破ったら設計そのものが間違い」を読み分けるためで、この語が付いた文は実装の都合で緩めてよい候補にはなりません。

- `状態機械`（state-machine）（仕様 13937 行目）
  > 12. 第23章の旧Civic object（`CivicVoteCommitment`、`CivicVoteNullifier`、`CivicVoteTally`）は本版で廃止する。旧形式の当該objectは、Civic tallyのfinality根拠としても、`CivicBallot`及び分散Civic状態機械の…（以下 268 文字省略）
  「今どの状態にあるか」と「どの合図で次へ移るか」を全部書き出した表です。この語が要るのは、途中の状態を勝手に増やしたり飛ばしたりできないことを示すためです。

- `禁止`（prohibited）（仕様 14117 行目）
  > 1. Initiatorは、期待するSoul/Bodyに対応するDeviceIdを到達ヒントから選び、`find_device`で正確なDeviceIdへ認証接続し、取得した`DeviceHandle`をsessionに固定する。別DeviceIdへのfallbackを禁止する。transport保護はSoul aut…（以下 14 文字省略）
  やってはいけない、と仕様がはっきり言っていることです。この語が要るのは「やらない方がよい」との区別で、避けるための抜け道を作ると、動いていても設計として誤りになります。

- `必須`（required）（仕様 14163 行目）
  > **node間の利用領域**: Gaia node間通信及びCLI remoteの標準経路は、第28章のgaia-network上のRESTである。REST pathは上記のCore Operation mappingを使い、Host又はURLのauthorityでpeerを選ばず、宛先は`DeviceId`で選ぶ（第…（以下 448 文字省略）
  無くてはならない、と仕様がはっきり言っていることです。この語が要るのは、あると嬉しい追加機能と、無いと要件を満たさないものとを分けるためです。

- `しなければならない`（must）（仕様 14964 行目）
  > feature-gatedな`announce_signed_peer`を使う。controlled DHT serverはdraft signed-peer operationをsupportしなければならない。public Mainline nodeは一般にそれをsupportすると仮定できない。
  その役目のものが必ず備えていなければならない性質のことです。この語が要るのは、相手や環境によって備わっているかどうかが変わるものを区別するためで、ここに書かれた機能は「たぶんある」で済ませられません。

<!-- explain-seed:facts
{"schema":"explain-seed-facts-v1","sections":{"E1":{"digest":"2f97bba063e931b26f3c88ba0e8a66d6fb696e0640e6c49661c41039c91522f4","facts":[{"id":"I2","digest":"7b1ac1d32c7fca1d7a5367b8436d75baefb30e30c0bfa1eb454f3525b0b37e07"},{"id":"I3","digest":"fc586be1f206fe073ff209c5d344293908069bd6c2dd8460daca9c3b43cbcb35"},{"id":"I10","digest":"f76172938b86da3d538b3764105fa260e5a4b6839870c15227397d8bd08cc977"}]},"E2":{"digest":"7b1ac1d32c7fca1d7a5367b8436d75baefb30e30c0bfa1eb454f3525b0b37e07","facts":[{"id":"I2","digest":"7b1ac1d32c7fca1d7a5367b8436d75baefb30e30c0bfa1eb454f3525b0b37e07"}]},"E3":{"digest":"3b5fd4cff06642c96c9d5ab24f8ebfa04142012729195b6a8e225e382947c0bf","facts":[{"id":"I3","digest":"fc586be1f206fe073ff209c5d344293908069bd6c2dd8460daca9c3b43cbcb35"},{"id":"I6","digest":"360129981663eee6efa3c119a230193ea965d0c865d33719d20340e45b9a5b39"}]},"E4":{"digest":"5ec3a51730d85ae8d3027b53d2d321e8983dc5648e0cf9faecd6d079c7da74be","facts":[{"id":"I4","digest":"436671a9f7e64f77fd641c56cc5804087a85c0a5b584ee768469228afad14507"},{"id":"I5","digest":"3b3f74b3050bacc2fc91d385b99171c7a3a98527ab71cc276096e0da279eb189"}]},"E5":{"digest":"68c4d9381eb9b28da244f9ffe73dc8e55962a77ce085548274a01577cd6c355e","facts":[{"id":"I9","digest":"36654739002e5b1de4e1e92c3d5ac08579d82123cd016cb62d67a3803404b9e7"},{"id":"I10","digest":"f76172938b86da3d538b3764105fa260e5a4b6839870c15227397d8bd08cc977"}]},"E6":{"digest":"bdbcb81c4a59a1b1d78ccca60a0ee96198d18ef6a5225cb3a5f4040cc694bade","facts":[{"id":"I5","digest":"3b3f74b3050bacc2fc91d385b99171c7a3a98527ab71cc276096e0da279eb189"},{"id":"I7","digest":"83d0272a25a7acb59d0e1b331fd54de7639031892a9a0a1dcadaae8313c166ca"},{"id":"I8","digest":"0bf7ed823555e07c59d4d1970d9c82ad17f3b47790b840a574aeb96726161e16"},{"id":"I10","digest":"f76172938b86da3d538b3764105fa260e5a4b6839870c15227397d8bd08cc977"}]},"E7":{"digest":"0e359f24cad740628ec3836df3d8be7d9795686842e57711a32fc459ddd5b3b5","facts":[{"id":"I7","digest":"83d0272a25a7acb59d0e1b331fd54de7639031892a9a0a1dcadaae8313c166ca"},{"id":"I6","digest":"360129981663eee6efa3c119a230193ea965d0c865d33719d20340e45b9a5b39"}]}}}
-->