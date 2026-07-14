> [!IMPORTANT]
> The following content is an initial ticket-level draft and shall not be treated as a complete specification. As part of the /make-ticket workflow, it must be reviewed against the actual design, related nodes, related tickets, and the implementation state of the source code, and then expanded into a detailed and accurate specification.
>
> The specification must fully reflect all information contained in the ticket. The existence of ticket information that is not captured in the specification is prohibited and shall be treated as a defect in the specification.

# P0-1: Crate目的・範囲・要件定義 [todo]

## RFC Reference

/Users/kawata/shyme/zasso/crates/siprs/RFC-ROOT (§1, §2, §4, §5)

## Background

P0の中核となるcrateの存在意義と範囲を定義する。N0001は本crateがPJSUAを安全にラップしSIP音声通話を提供する目的を規定。N0004はSIPサーバ実装・映像処理等の非目的を明確化。N0007はMSRV/PJSIPバージョン/tokioランタイムの準拠要件。N0009は15項目の機能要求リスト。これらはコード実装には直接現れないが、lib.rsのcrate-level docコメントおよびREADME.mdの根拠となる。

## Scope

- Crateの目的文書と非目的リストを lib.rs 冒頭のdoc commentとして記述
- 準拠要件（MSRV/PJSIP/tokio）をREADME.mdおよびCI設定に反映
- 15項目の機能要求をCHANGELOG.mdおよび受け入れ基準として管理
- crate-doc に #[doc(alias)] を付与して検索性を確保

## To show related RFC graph details

### Usage of query.js

```
node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (NODE-ID, e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
```

### Related RFC graph NODE-IDs to check

`N0001` `N0004` `N0007` `N0009`

## Test Plan

### Unit Tests

- UT: 該当なし — 本チケットは文書定義のみ

### Integration Tests

- IT: 該当なし

### Exceptions

- コード実装を含まないためユニットテスト対象外。lib.rs doc commentのビルドはcargo docで確認する。

## Related Tickets

| Ticket | Relation | Description |
|--------|----------|-------------|
| P0-2 | part_of | 被依存元（依存元）: M20優先度・設計判断・バージョニングポリシー |
| P5-10 | part_of | 被依存元（依存元）: Tauri境界・backpressure・Platform・受信call・REFER・Layer2テスト・ServerMode |
| P0-3 | references | 参照先: ClientConfig データ型定義とDefault実装 |
| P0-6 | references | 参照先: ID設計・AccountConfig・TransportConfig型定義 |
| P5-3 | references | 被依存元（依存元）: CI/CD・既知の難所・panic policy・受け入れ基準 |
| P0-3 | depends_on | 被依存元（依存元）: ClientConfig データ型定義とDefault実装 |
| P0-3 | precedes | 先行: ClientConfig データ型定義とDefault実装 |
| P0-4 | precedes | 先行: アーキテクチャ基盤と並行性モデル |
| P5-7 | part_of | 被依存元（依存元）: lib.rs・HTTP/WS層概要・I/O境界参考 |
| P5-4 | references | 被依存元（依存元）: siprs-server設計：起動モード・設定・REST/WSエンドポイント |
| P5-6 | depends_on | 被依存元（依存元）: コアデータ型：RuntimeCommand・SipEventPayload・RawSIP・用語 |

## Pipeline Context

| Resource | Path | Exist |
|----------|------|-------|
| RFC | `RFC-ROOT.md` | true |
| Graph | `RFC-ROOT-GRAPH.json` | true |
| Dirs-Tree | `RFC-ROOT-Dirs-Tree.json` | true |
| Pipeline Available | **true** | - |

