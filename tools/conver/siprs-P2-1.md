> [!IMPORTANT]
> The following content is an initial ticket-level draft and shall not be treated as a complete specification. As part of the /make-ticket workflow, it must be reviewed against the actual design, related nodes, related tickets, and the implementation state of the source code, and then expanded into a detailed and accurate specification.
>
> The specification must fully reflect all information contained in the ticket. The existence of ticket information that is not captured in the specification is prohibited and shall be treated as a defect in the specification.

# P2-1: NativeEvent→SipEventPayload変換マッピング

## Background

M20追補のNativeEvent変換基本方針（P0/P1/P2重要度分類）・完全マッピングテーブル・CallStateChanged pjsip_inv_state→CallState・CallMediaStateChanged media_status判定・RegistrationStateChanged RuntimeCommandパターン。

## Scope

- src/event_model_overview/api/native_event_mapping.rs — 全NativeEvent→SipEventPayload変換
- src/event_model_overview/state/callstate_mapping.rs — CallStateChanged変換
- src/event_model_overview/state/media_state_mapping.rs — CallMediaStateChanged変換

## Implementation Target Files

- `src/event_model_overview/api/native_event_mapping.rs`
- `src/event_model_overview/state/callstate_mapping.rs`
- `src/event_model_overview/state/media_state_mapping.rs`

## To show related RFC graph details

### Usage of query.js

```
node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (NODE-ID, e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
```

### Related RFC graph NODE-IDs to check

`N0039` `N0040` `N0041` `N0042` `N0043`

## Test Plan

### Unit Tests

- UT: 各pjsip_inv_state値(0-4)に対するCallState変換
- UT: media_status値ごとのMediaActive/Held/Error変換
- UT: P0/P1/P2重要度別フィルタリング動作

### Integration Tests

- IT: RegistrationStateChanged→RuntimeCommand::GetAccountInfo→イベント発火

### Exceptions

- NativeEventの実際の発火はPJSIP callback結合後に確認

## Related Tickets

| Ticket | Relation | Description |
|--------|----------|-------------|
| P1-3 | part_of | 部分（親）: イベントモデル基盤：SipEvent/EventMeta/EventBus設計 |
| P5-6 | refines | 詳細化先: コアデータ型：RuntimeCommand・SipEventPayload・RawSIP・用語 |
| P0-2 | references | 被依存元（依存元）: M20優先度・設計判断・バージョニングポリシー |

## Pipeline Context

| Resource | Path | Exist |
|----------|------|-------|
| RFC | `RFC-ROOT.md` | true |
| Graph | `RFC-ROOT-GRAPH.json` | true |
| Dirs-Tree | `RFC-ROOT-Dirs-Tree.json` | true |
| Pipeline Available | **true** | - |

