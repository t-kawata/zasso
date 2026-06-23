ACPを使う方が安全でシンプルになると考えることは合理的ではないですか？

---

非常に合理的な提案です。むしろ **ACP を使う方が `conver` の設計目標に対して明らかに優位**です。以下に整理します。

## ACP とは何か

**Agent Client Protocol（ACP）** は、エディタと AI エージェント間の通信を標準化するオープンプロトコルです。  LSP（Language Server Protocol）がエディタと言語サーバーを抽象化したのと同じ発想で、エディタと AI エージェントを標準的なインターフェースで繋ぎます。  ローカル環境では **JSON-RPC over stdio**（サブプロセス通信）で動作するため、まさに `conver` が Claude Code をサブプロセスとして操作するモデルに直接対応します。 [agentclientprotocol](https://agentclientprotocol.com/get-started/introduction)

## ACP の通信フロー

```
[conver (client)] ←→ [claude-code-acp (agent)]
       JSON-RPC over stdio
```

```jsonc
// 1. セッション確立
{"method": "initialize", "params": {"protocolVersion": 1}}

// 2. セッション開始（もしくは session/load でチェックポイント再開）
{"method": "session/new", "params": {"cwd": "."}}
// → {"result": {"sessionId": "xxx", ...}}

// 3. マルチターン: 各ターンを送信
{"method": "session/prompt", "params": {"sessionId": "xxx", "prompt": [...]}}
// → ストリームで agent_message_chunk が返る

// 4. 次ターンも同一 sessionId で継続
{"method": "session/prompt", "params": {"sessionId": "xxx", "prompt": [...]}}
```

`session/load` により既存セッションの **resume** も標準でサポートされています。 

## なぜ ACP が `conver` にとって優位か

| 観点 | 素の subprocess + stdin/stdout | ACP |
|------|-------------------------------|-----|
| マルチターン | 自前実装が必要（RFC の未設計ギャップ） | `session/prompt` で標準サポート  |
| セッション再開 | checkpoint から自前で replay | `session/load` で標準サポート  |
| ストリーミング | `RuntimeEvent` を自前パース | `agent_message_chunk` として標準化  |
| バックエンド差し替え | `ClaudeCodeBackend` 固有実装 | ACP 対応なら Gemini CLI 等も同一 trait で動作  [ai-sdk](https://ai-sdk.dev/providers/community-providers/acp) |
| 実装コスト | `MultiTurnSession` trait を全部自前設計 | プロトコル仕様に従うだけ |
| 保守リスク | Claude Code の内部 I/F 変更に追従が必要 | ACP 仕様変更のみ追従 |

## conver の設計変更点

RFC_003（conver-runtime）の `RuntimeBackend` を、素の subprocess モデルから **ACP クライアント**として再定義するのがシンプルです。

```rust
// conver-runtime/src/acp.rs
pub struct AcpClient {
    process: tokio::process::Child,
    stdin: tokio::io::BufWriter<tokio::process::ChildStdin>,
    stdout: tokio::io::BufReader<tokio::process::ChildStdout>,
}

impl AcpClient {
    pub async fn initialize(&mut self) -> Result<AgentInfo, AcpError> { ... }

    pub async fn session_new(&mut self, cwd: &Path) -> Result<SessionId, AcpError> { ... }

    // session/load でチェックポイントからの resume に直結
    pub async fn session_load(&mut self, session_id: &SessionId) -> Result<(), AcpError> { ... }

    // grill の各ターン = session/prompt の繰り返し
    pub async fn session_prompt(
        &mut self,
        session_id: &SessionId,
        message: &str,
    ) -> Result<impl Stream<Item = AcpUpdate>, AcpError> { ... }
}
```

`RunRecord` の `checkpoint_state` に `sessionId` を保存するだけで grill の中断/再開が実現します。現在の設計で想定していた「会話履歴の全スナップショット保存」が不要になります。

## 唯一の注意点

`claude-code-acp`（Zed Industries 製の ACP アダプター）は Claude Code の**公式** ACP 実装ではなく、Claude Code SDK を ACP 形式に変換する**非公式アダプター**です。  Claude Code 側が ACP を公式サポートするまでは、このアダプターへの依存が中間レイヤーとして残ります。ただし、Apache License 2.0 のオープンソースであり、Zed がユーザーとのインテグレーションで実際に使用しているため実績は十分です。 [blog.smartbank.co](https://blog.smartbank.co.jp/entry/2026/01/22/110000)

***

**結論として、ACP を採用する方が合理的です。** `MultiTurnSession` を自前設計するのは ACP が解決している問題を再発明することになります。RFC_003 の DesignTree に「ACP クライアントとして実装する」という設計決定を追加し、残りの子 RFC はその前提で設計するのがよいと思います。
