---
ticket_id: 53
title: formulate-tickets系 — 発散→収束の2段階分解とグラフ参照統合
slug: formulate-tickets-2
status: made
created_at: 2026-07-06
updated_at: 2026-07-06
ticket_key: PX-18
---

# formulate-tickets系 — 発散→収束の2段階分解とグラフ参照統合

## Summary

`.claude/commands/formulate-tickets.md` と `.claude/commands/formulate-tickets-for-next.md` の2ファイルを改修し、graphify-rfc で生成されたグラフ構造（ノード・エッジ・kind）をチケット分解に具体的に活用する手順を追加する。分解を「発散（細かいチケットに分解）」→「収束（安全に統合して密度向上）」の2段階とし、グラフJSONが存在しない場合にも矛盾なく動作する分岐を実装する。

## Background

現在の formulate-tickets 系2ファイルは、Step 1（I/O境界参考情報）と Step 2（グラフ構造サマリー）で情報を「表示」するだけで、その後のチケット分解（Step 5〜Step 10）でこれらの情報を具体的に参照する手順が一切ない。また、graphify-rfc は formulate より前に実行されるとは限らず、グラフJSONが存在しない状態で formulate が実行されるケースが考慮されていない。

これにより以下の問題がある：
1. **情報と判断の分断**: 折角 graphify で発散させたグラフが formulate で活用されず、AI が毎回自力で RFC から依存関係を読み取っている
2. **発散の欠如**: 最初から統合された粒度でチケットを作るため、情報密度の低いチケットや粒度の粗いチケットが生成される
3. **収束の欠如**: 統合チェックが「質問（同じI/O境界か？）」のみで機械的根拠が弱い。グラフのノードIDを使って機械的に判定できるのに使っていない
4. **グラフ不在時の考慮不足**: `show-graph-summary-markdown.js` の呼び出しは `if [ -f "$GRAPH_PATH" ]` でガードされたが、グラフがない場合にチケット分解の粒度や品質がどう変わるかの指針がない

## Scope

### 対象ファイル
- `.claude/commands/formulate-tickets.md` の改修
- `.claude/commands/formulate-tickets-for-next.md` の改修
- 新規スクリプトなし（既存スクリプトの呼び出し手順のみ追加）

### 改修内容

#### 1. 発散→収束の2段階構造化

現状の Step 5（依存グラフ構築）〜Step 10（チケット追加）を以下の2フェーズに分割する。

**第1フェーズ: 発散（Expand）**
- Step 1（I/O境界）と Step 2（グラフ構造）の情報を元に、安全側に振って**細かいチケットに分解**する
- kind → Layer マッピングを機械的に行う（後述）
- グラフのエッジ（depends_on）をそのままチケットの依存関係として転用する
- このフェーズでは統合は一切行わない

**第2フェーズ: 収束（Merge）**
- 発散後のチケット群に対して、グラフのノードIDを参照した**機械的な統合判定**を行う
- 同一ノードIDを参照するチケット → 統合候補（同じ設計要素を分割しすぎ）
- 単一 kind にのみ依存するフェーズ → フェーズ内のチケットを統合検討
- エッジ（part_of / precedes）による時系列・包含関係 → 同一チケットにまとめてよい

#### 2. グラフ情報の具体的利用手順

| グラフ情報 | 利用先 | 具体的な使い方 |
|-----------|--------|--------------|
| kind 別ノード一覧 | 発散フェーズの Layer 割当 | requirement/data_model → Layer 0/1, api_contract → Layer 2, security/error_policy → Layer 2/3, build_ci/config → Layer 4 |
| エッジ depends_on | 発散フェーズの依存関係 | 「N0001 → N0003」なら「チケット(N0001)はチケット(N0003)に先行」とそのまま転用 |
| エッジ part_of | 発散フェーズの包含関係 | 親ノードと子ノードは同一フェーズに配置 |
| エッジ precedes | 発散フェーズの時系列 | 実装順序の決定に使用 |
| エッジ validates | 収束フェーズの統合判定 | validates で結ばれた2ノードは同じチケットに統合してよい（検証と実装は一体） |
| ノードIDの重複 | 収束フェーズの統合判定 | 複数チケットが同じノードIDを参照 → 1チケットに統合 |
| kind 分布の偏り | 収束フェーズの粒度調整 | 1フェーズ内の全チケットが同一 kind → 粒度が細かすぎるので統合 |

#### 3. グラフ不在時の分岐

グラフJSONが存在しない場合、以下の動作とする：

| 観点 | グラフあり | グラフなし |
|------|-----------|-----------|
| 発散の粒度 | グラフのノードを1チケットの最小単位として発散 | AI が自力で RFC から依存関係を読み取る（現状通り） |
| 収束（統合） | ノードID重複 + エッジタイプで機械的判定 | kind とフェーズの偏りのみで判定 |
| I/O境界情報 | グラフとクロスリファレンスして精度向上 | 参考情報としてのみ使用 |
| 依存関係の転用 | エッジ（depends_on）をそのまま転用 | AI が自力で抽出 |

グラフがない場合の動作は**現状と同じ**であり、グラフがある場合のみ発散→収束の品質が向上する。グラフがない場合でも矛盾は生じない。

#### 4. kind → Layer マッピング表

| kind | Layer | 理由 |
|------|-------|------|
| requirement | Layer 0/1 | 純粋要件、外部依存なし |
| data_model | Layer 0 | 型定義、外部依存なし |
| state_machine | Layer 0/1 | 純粋ロジック、外部依存なし |
| glossary | Layer 0 | 単なる用語定義 |
| rationale | Layer 0 | 設計判断根拠（実装不要） |
| api_contract | Layer 2 | 非同期I/O（HTTP等）を前提 |
| error_policy | Layer 2/3 | 非同期エラーハンドリング |
| security | Layer 2/3 | 暗号・認証（外部ライブラリ依存） |
| config | Layer 3/4 | 設定ファイル読込（外部I/O） |
| test_policy | Layer 4 | テストフレームワーク依存 |
| build_ci | Layer 4 | CI/CD ツール依存 |
| architecture | Layer 3/4 | システム全体の構成定義 |

#### 5. 改修後のフロー（グラフあり時）

```
Step 0: 初期化（変更なし）
Step 1: I/O境界参考情報（変更なし）
Step 2: グラフ構造サマリー（変更なし）

--- 発散フェーズ ---
Step 3: 設計書検証（変更なし）
Step 4: CLAUDE.md生成（変更なし）

Step 5（拡張）: 依存グラフ構築
  ← グラフの kind + エッジ（depends_on）を Layer 分類と依存関係の基準として使用
  ← グラフがない場合は従来通り AI が自力抽出

Step 6（拡張）: 発散的チケット分解（NEW）
  - グラフの全ノードを走査し、最少粒度のチケット候補を列挙
  - kind → Layer マッピングで各候補の Layer を確定
  - エッジ（depends_on）をチケット間依存関係として転用
  - エッジ（part_of）をフェーズ内包含関係として転用
  - エッジ（precedes）を実装順序として転用
  - グラフがない場合はこのStepをスキップ

--- 収束フェーズ ---
Step 7（拡張）: チケット統合チェック（旧Step 6）
  ← ノードID重複 + エッジタイプ（validates）を統合判定に使用
  ← グラフがない場合は質問ベースの判定のみ（従来通り）

Step 8: フェーズ設計（変更なし）
Step 9: Tickets.jsonスケルトン生成（変更なし）
Step 10: フェーズ追加（変更なし）
Step 11: チケット追加（変更なし）
Step 12: チェックリスト出力（変更なし）
```

### 非スコープ
- `show-graph-summary-markdown.js` の機能追加（--with-cli-examples は既に実装済み）
- `graphify-rfc.md` の改修
- 新規スクリプトの作成（すべて既存スクリプトの呼び出し手順で対応）
- `dump-ticket-graph-commands.js` の改修
- `make-ticket.md` / `plan-ticket.md` / `start-ticket.md` / `review-ticket.md` の改修

## Investigation

### 現状の formulate-tickets.md の Step 構成

```
Step 0: 初期化
Step 1: I/O境界参考情報 → 「参考として活用する」のみ、具体的指示なし
Step 2: グラフ構造サマリー → 「表示する」のみ、利用方法なし
Step 3: 設計書検証
Step 4: CLAUDE.md生成
Step 5: 依存グラフ構築（5層モデル）→ AI が自力で分類
Step 6: チケット統合チェック → 質問ベースの曖昧な判定
Step 7: フェーズ設計
Step 8: Tickets.jsonスケルトン生成
Step 9: フェーズ追加
Step 10: チケット追加
Step 11: チェックリスト出力
```

Step 1 と Step 2 の情報が Step 5 以降で一度も参照されていないことが確認された。

### グラフJSONがないケース

formulate-tickets は graphify-rfc の後でなくても実行される。例えば：
- RFCを書いた直後、graphify を実行する前に formulate-tickets でチケットを生成したい
- graphify-rfc が失敗してグラフJSONが生成されなかった
- formulate-tickets-for-next で追加チケットを生成する際、親RFCのグラフが存在しない

これらのケースでは `show-graph-summary-markdown.js --with-cli-examples` の呼び出しは `if [ -f "$GRAPH_PATH" ]` でガードされており、エラーにはならない。ただし、グラフがない場合とある場合でチケット分解の品質が変わらないようにするか、少なくともその差分を明示する必要がある。

## Test Plan

### ユニットテスト計画
- スクリプトの変更はないため、単体テストの追加は不要
- 改修後の動作確認は formulate-tickets.md / formulate-tickets-for-next.md の Markdown テンプレートに対して、graphify-cmd.test.cjs と同様の字句解析テストを追加する

### ユニットテスト不可能な項目（例外）
- formulate-tickets の実際の挙動（Claude Code による実行）はスクリプトレベルではテスト不可能。字句解析テストで代替する。

| テスト | 内容 |
|-------|------|
| Step 5 に `kind → Layer マッピング` の記述がある | grep で `kind` と `Layer` の共起を確認 |
| Step 6（発散的チケット分解）のセクションが存在する | `## Step 6` または `発散的チケット分解` の存在確認 |
| グラフあり/なしの分岐が記述されている | `グラフがない場合` または `グラフが存在しない` の記述確認 |
| エッジタイプの具体的な利用方法が書かれている | `depends_on` と `転用` の共起を確認 |
| 収束フェーズにノードID重複判定の記述がある | `ノードID` と `統合` の共起を確認 |

## Boy Scout Rule — 翻訳可能性計画

- 本チケットの変更は Markdown ファイルのみ（JavaScript コードの変更なし）
- 各Step の冒頭に「このStepは何をするか」「グラフあり/なしでどう変わるか」を1行で説明するコメントを追加する
- 発散と収束の2段階が明示的に分かる見出し構成にする

## Acceptance Criteria

- [ ] formulate-tickets.md に発散→収束の2段階が明示されている
- [ ] グラフの kind → Layer マッピング表が formulate-tickets.md に記載されている
- [ ] エッジ（depends_on）をチケット依存関係に転用する手順が記載されている
- [ ] エッジ（part_of / precedes / validates）の具体的な利用方法が記載されている
- [ ] グラフJSONが存在しない場合の分岐が明記され、矛盾がない
- [ ] グラフがない場合の動作が現状と同じであることが確認できる
- [ ] ノードID重複による統合判定の手順が収束フェーズに記載されている
- [ ] formulate-tickets-for-next.md も同様に改修されている（差分のみ）
- [ ] 既存の graphify-cmd テストが全て通過している
