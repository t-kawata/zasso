# 実装計画: NativeEvent → SipEventPayload 変換完全化（P0-P1）

## 要件
reactor.rs:433-460 の仮実装を RFC02 マッピングテーブルに従った正規実装に置き換える。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---|---|---|
| src/event.rs | 修正 | 全 Info 構造体フィールド追加 + SentDtmfError enum |
| src/runtime/state.rs | 修正 | CallEntry に previous_state 追加 |
| src/runtime/reactor.rs | 修正 | NativeEvent match 本実装 + 変換補助関数 + SendDtmf タイマー + テスト27件 |

## 実装手順
1. event.rs: Info 構造体フィールド + SentDtmfError
2. state.rs: CallEntry previous_state
3. reactor.rs: 定数・ヘルパー・NativeEvent 本実装・SendDtmf タイマー
4. reactor.rs: テスト 27 ケース
5. 検証（コンパイル・テスト・品質チェック）

## 物理的レビュー方法
- cargo test --lib 全パス確認
- run-quality-checks.js
- 翻訳可能性 grep

## リスク
- Info 構造体フィールド追加の他モジュール影響（低）
- CallEntry previous_state のテスト影響（低）
- DtmfSent タイマー cancel safety（中 → tokio::spawn + select! で対応）
