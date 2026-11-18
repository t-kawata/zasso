以下の指示で改定する。目的は、**適合条件を確定すること**であって、実装方法を一意にすることではない。Claude Codeには、既存の規範と不変条件の範囲内で判断し、設計・実装・検証まで自走させる。

## 1. Part II §0に「契約の閉鎖と実装裁量」を追加する

次の趣旨を規範として追加する。既存の `Fixed` / `Open` と優先順位の規定は置き換えず、その適用基準として置く。

> A contract MUST define the responsibilities, observable guarantees, and verification conditions at its shared boundary. It MUST NOT prescribe implementation choices that do not affect those guarantees.
>
> Implementers MUST resolve unspecified details, ambiguities, and local inconsistencies using the rule precedence, design intent, compatibility requirements, and safety invariants, and carry the work through implementation and verification. Prefer the resolution that changes the fewest shared guarantees and preserves legitimate extension points.
>
> Where a choice affects interoperability within a declared profile, the profile or binding MUST specify that choice. Otherwise, conforming implementations MAY differ.

「判断を記録する」「承認を待たない」「人間に確認する条件」といった手続きは追加しない。ここで定めるのは、何を規範で閉じ、何を実装判断に委ねるかだけである。

## 2. Part III.2 §5.5–5.7：replay認可を共有APIに通す

`ErasedAuthenticatedOperation` に `replay_authorize` を追加し、共有crateの型消去ラッパーから `Operation::replay_authorize` へ委譲する。シグネチャはtyped側に揃える。

```rust
fn replay_authorize<'a>(
    &'a self,
    ctx: &'a AuthenticatedContext,
    replay: &'a ReplayRecord,
) -> BoxFuture<'a, Result<(), OperationError>>;
```

- dispatcherは `ClaimOutcome::Replay` でこのメソッドを呼び、成功後に限り保存済み結果を返す。この分岐では `prepare_validated` と `execute` を呼ばない。
- 認可するのは元の実行者ではなく、現在の呼出し主体である。記録済みtargetは「何に対して認可するか」を示すものであり、過去に許可されたことを現在の許可の根拠にしない。
- `AnonymousOperation` に認証済みcontextを渡さない。既存の匿名冪等性のopt-inを維持し、そのreplayには匿名用の契約を設ける。匿名の結果を再提示できる条件をoperationごとに定め、認証済みreplayの暗黙の代替経路にしない。
- `CONF-25`・`CONF-47`・`CONF-65` を使い、許可されたreplay、再認可で拒否されるreplay、`prepare` / `execute` の再実行がないことを検証する。

型消去の内部表現、ラッパーの型名、保存形式は固定しない。

## 3. Part II `OPS-05` / `OPS-06`、Part III.2 §6：claimと認可対象の確定を分ける

`IdempotencyStore::claim` から `AuthorizationTargetSnapshot` 引数を外す。claimはnamespace・key・request hash・leaseで行い、新規claimには認可済みtargetが存在することを要求しない。

新規実行とreplayの順序を、次のように揃える。

| 分岐 | 必須順序 |
|---|---|
| 新規実行 | 入力検証 → claim → `prepare` で対象解決・認可 → 実行 → targetと結果を確定 |
| replay | 入力検証 → claimから確定済み記録を取得 → 現在の認可 → 保存済み結果を返す |
| `prepare` 失敗 | 業務変更を行わず、取得したclaimを失敗処理または解放する。認可失敗を成功結果として再提示できる状態にしない |

併せて次を明文化する。

- `InFlight` の記録はtarget未確定でよい。replay可能な結果には、再認可に必要なtarget情報が必ず付随する。未確定値やダミーの `Global` で埋めない。
- `OPS-06` と対応する不変条件では、認可前に許されるclaim等の実行制御メタデータと、認可前に禁止される業務状態変更・外部業務効果を区別する。claim自体は業務変更の許可にならない。
- `CONF-24`〜`CONF-26` を更新し、同時claim、異なるhashの衝突、未確定claimから結果を返さないことを検証する。

claimをどのDBに置くか、内部の列構成、ロック方式、失敗claimの保持期間は固定しない。

## 4. Part III.2 §6–7、Part III.4：`SameTransaction` の責務と原子性を閉じる

「dispatcherがtransaction-bound storeを渡す」という記述を、**業務変更をcommitするUnitOfWorkが、同じtransactionに冪等性完了とoutbox intentを含める**という契約に置き換える。dispatcherとUnitOfWorkの責務は次で揃える。

| 所有者 | 責務 |
|---|---|
| dispatcher | claimを取得し、実行に必要なclaim capabilityを渡す。`SameTransaction` の成功結果をtransaction外から後付けで確定しない |
| operation / UnitOfWork | 同一transaction内で、現在のclaim所有権を確認し、業務変更・認可済みtarget・結果・outbox intentを一緒に確定する |
| 永続化側 | 古いgeneration / fencing tokenによるcommitを拒否する。commit済みなら結果とoutbox intentを回復でき、rollbackなら業務変更・完了結果・outbox intentのいずれも確定しない |

具体的な改定指示：

- `ExecutionScope::complete/fail` の同期APIが非同期 `IdempotencyStore` を暗黙に呼ぶ形を解消する。`SameTransaction` ではUnitOfWork側に完了を組み込む責務を置き、`External` のstore操作と区別する。
- `is_completed()` の事後確認だけを原子性の保証にしない。必要な記録を含まないcommitを、共有契約上の正常経路にしない。
- `External` のlease更新・forward recoveryは別扱いのまま維持し、`SameTransaction` と同じ原子性を持つとは書かない。
- `CONF-46` と `CONF-48` で、古い実行者のcommit拒否、rollback、commit直後のクラッシュからの結果・outbox回復を検証する。

共有APIには、claim capabilityの受け渡しと原子的な完了を表現できる境界を置く。SQL、DB製品、トランザクションオブジェクトの内部表現、ロック方式までは定めない。

## 5. `OPS-02` と Part III.6–III.11：共通の意味とprotocol別の表現を分ける

`OPS-02` の「wire envelope」を「共通の呼出し・結果モデル」に改める。すべてのprotocolに同じJSON形状を要求する読み方を排除する。

- 共通契約で固定するのは、operation入力、呼出しcontext、相関ID、成功または失敗の意味である。
- 実際のwire形式・CLI形式は、各bindingが定める。RESTのJSON envelope、WebSocketのtagged message、CLIの引数・出力、gRPCのtyped protobuf、MCPのtool結果、A2Aのtask・eventの既存規定は維持する。
- operationの失敗と、operation呼出し前のprotocol rejectionを区別する。`IF-08` はoperation応答の相関保証として記述し、RESTの早期エラーなど、protocol別規則が相関IDを要求する経路はその規則で検証する。
- 各profileについて「その表現がprotocolに適合すること」と「共通モデルに正しく対応すること」を検証する。異なるprotocol間でwireバイト列の一致は要求しない。

## 6. Part III.10–III.11：MCP / A2Aは選択を固定せず、選択したbindingを確定させる

`MCP-19`・`A2A-23` のversion・transport・capabilitiesの記録要件に加え、選択したprofileで実装と検査が参照できるbindingを要求する。

| bindingで確定する事項 | 改定内容 |
|---|---|
| 呼出しの選択と入力 | MCP tool / A2A skill・messageが、どのoperationと入力に対応するか |
| 成功・失敗 | protocol自体の失敗と業務上の失敗をどのprotocol表現に載せるか |
| 相関 | `request_id` をクライアントとconformance driverが機械的に取得できる場所 |
| 生命周期 | 選択したprofileが対応するstream・task・取消について、operationの結果や終端をどう表すか |

値の正本はprofileまたはbinding宣言に置き、生成文書とconformanceはそれを参照する。`MCP-21`・`A2A-24` の配置は、profile間ではOpenのまま、個々のbinding内では確定させる。全プロジェクトに単一のSDK、protocol version、相関IDの位置を押し付けない。

## 7. 正本・移行手順・検査を同期する

- Part III.14 §8の「`project-operation` にDispatcherとRegistryを追加する」は、「`operation-contract` が提供する型を使用し、projectのoperationを登録してassemblyで配線する」に修正する。共有型の配置はPart III.2を正本とする。
- Part II §10・§13の `CONF-44` / `CONF-64` の手書き範囲は、Part III.12とPart III.15への参照に置き換える。索引に範囲を出す場合はregistryから生成する。
- `O/C` の複合classは解消する。例えば `SSO-08` の一意性制約は `C`、providerの追加方法は `O` とし、固定義務と拡張手順を区別する。既存IDを安易に振り直さない。
- 変更した規則は、本文・共有API・registry・適用profile・conformanceの期待値を同じ改定で揃える。新しい規則IDは、既存IDの具体化では表せない独立した義務にだけ付ける。

改定の完了条件は、同じ入力と同じ宣言済みprofileに対し、二つの適合実装が認可・再試行・commit・クライアントとの互換性で食い違わないこと。その条件を満たす限り、保存方式、内部構造、実行方式、最適化、profileで明示された選択は異なってよい。
