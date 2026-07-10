---
ticket_id: 76
title: phasify修正 — depends_on方向・検証・未テスト経路の包括的修正
slug: phasify-depends-on
status: draft
created_at: 2026-07-10
updated_at: 2026-07-10
---
# phasify修正 — depends_on方向・検証・未テスト経路の包括的修正

## Summary

PX-37/38 の phasify 実装において発見された3つの問題を修正する：
(1) Kahn ソートの depends_on 方向が逆（依存元を先に配置してしまう）、
(2) 検証ロジックの不等号が逆、
(3) enforceHardConstraints も同方向に一致しているが根本原因である(1)を直せば(2)(3)も同時に解決する。
加えて PX-38 レビューで発見された applyDirectoryConstraints / runPhasify のユニットテスト未カバー経路も合わせて解決する。

## Background

PX-38 の実データ（176ノード）検証で `--dry-run` を実行した際、以下の出力が得られた：

```
ハード制約調整: 16 → 31 フェーズ
検証: 不合格
  検証3 不合格: 3 件のHard制約違反
  検証4 不合格: 19 個のフェーズが下限(10)未満
```

このうち「3件のHard制約違反」は enforceHardConstraints が分割できないケース（edge.to がフェーズ先頭にある）。「19個のフェーズが下限未満」は enforceHardConstraints の分割によって10ノード未満のフェーズが多数発生したため。

調査の結果、**Kahn ソートの depends_on 方向が逆** であることが判明した。

### 発見した不具合

| # | 問題 | ファイル | 行 |
|---|------|---------|----|
| 1 | Kahn ソートが depends_on の方向を逆に解釈。`u→v`（uはvに依存）において、v（依存先）を先に配置すべきだが、u（依存元）を先に配置している | `phasify-helpers.js` | `kahnTopologicalSort` 内の adjacency 構築 |
| 2 | 検証関数 checkHardConstraints の比較方向が逆。`phase(from) >= phase(to)` は依存の意味的に正しい違反検出ではない | `validate-phasify.js` | `checkHardConstraints` |
| 3 | enforceHardConstraints も同じ逆方向の比較を使用 | `phasify-helpers.js` | `enforceHardConstraints` |

### 具体例

実データの depends_on エッジ:
```
N0015(§7.2 command serialization) → N0012(§7 並行性モデル)
```

意味: 「直列化は並行性に依存する」→ 並行性(§7)を先に実装 → N0012 が先

現在: Kahn ソートが「from→to」の方向で制約をかけ、N0015 を N0012 より前に配置。
正しくは「to→from」の方向で制約をかけ、N0012 を N0015 より前に配置すべき。

## Scope

1. **kahnTopologicalSort 修正**: depends_on の制約方向を反転（`adjacency[to].push(from)` + `inDegree[from]++`）
2. **checkHardConstraints 修正**: 比較方向を反転
3. **enforceHardConstraints 修正**: 比較方向を反転（ただし根本原因(1)の修正により、多くの違反がそもそも発生しなくなる）
4. **mergePhases のルックアヘッドロジック**: 方向反転に合わせて調整
5. **既存テストのアサーション更新**: 方向反転に伴い期待値を修正
6. **テスト追加**: 方向反転を確認するテストケースを既存テストスイートに追加
7. **統合テストの修正**: 176ノード実データの hard constraint 検証が正しく PASS することを確認

## Non-scope

- 新機能の追加
- アーキテクチャ変更
- split-to-tickets.md の編集

## Investigation

### 証拠1: depends_on エッジの方向と意味の乖離

実データから抽出した depends_on エッジ:

```
N0015(§7.2 command serialization) → N0012(§7 並行性モデル)
N0017(§8.2 SipClient構造体) → N0022(§10 ClientConfig完全仕様)
N0035(§15.4 EventBus) → N0032(§15.1 SipEventPayload enum)
N0036(§15.5 AccountEventReceiver) → N0035(§15.4 EventBus)
```

全て「from は to に依存する」という意味。依存先（to）を先に実装すべき。

### 証拠2: 現在の Kahn ソートの方向

`phasify-helpers.js` kahnTopologicalSort (L190-200):
```js
for (const edge of edges) {
    if (wFn(edge.type) === Infinity) {
      adjacency[edge.from].push(edge.to);
      inDegree[edge.to] = (inDegree[edge.to] || 0) + 1;
    }
}
```
`adjacency[edge.from].push(edge.to)` = from→to の方向で制約 → 依存元fromを先に配置。

修正後:
```js
for (const edge of edges) {
    if (wFn(edge.type) === Infinity) {
      adjacency[edge.to].push(edge.from);
      inDegree[edge.from] = (inDegree[edge.from] || 0) + 1;
    }
}
```
`adjacency[edge.to].push(edge.from)` = to→from の方向で制約 → 依存先toを先に配置。

### 証拠3: 検証ロジックの方向

`validate-phasify.js` checkHardConstraints (L90):
```js
if (phaseU >= phaseV) { violations.push(...) }
```
`phaseU = phase(from)`, `phaseV = phase(to)`。

depends_on(u→v) の正しい違反条件: `phase(v) >= phase(u)` = 依存先vが依存元uより後。

### 証拠4: フェーズ数が31に増加した副作用

方向修正により `enforceHardConstraints` での不必要な分割がなくなり、フェーズ数は31から大幅に減少する（推定17〜20程度）。下限10未満のフェーズも減少または解消される。

### 証拠5: 修正前後の影響範囲

| 関数 | ファイル | 修正内容 | テストへの影響 |
|------|---------|---------|--------------|
| kahnTopologicalSort | phasify-helpers.js | adjacency方向反転 | 循環検出テストは不変。DAGテストの期待順序が変わる |
| mergePhases | phasify-helpers.js | lookaheadのincomingHard方向反転 | 内部ロジックのみ。外部IF不変 |
| enforceHardConstraints | phasify-helpers.js | nodePhase比較方向反転 | テストケースの期待値修正 |
| checkHardConstraints | validate-phasify.js | phaseU/phaseV比較反転 | テストケースの期待値修正 |
| phasify-integration.test.cjs | テスト | posU/posVアサーション反転 | 期待値修正 |
| phasify-helpers.test.cjs | テスト | kahn/constraints期待値修正 | 期待値修正 |

## Test Plan

### ユニットテスト計画

1. **kahnTopologicalSort 方向テスト**:
   - depends_on(u→v) で v が u より前に配置されることを確認
   - depends_on 以外のハードエッジ（implements, constrains）も同様に確認
   - 循環検出は修正前後で不変

2. **checkHardConstraints 方向テスト**:
   - depends_on(u→v) で phase(v) < phase(u) を違反としないことを確認
   - 逆転（phase(v) >= phase(u)）のみ違反とみなすことを確認

3. **enforceHardConstraints テスト**:
   - 方向反転後も正常動作することを確認
   - 同一フェース内の depends_on 両端点を正しく分割することを確認

4. **統合テスト（実データ176ノード）**:
   - 修正後、hard constraints 違反が0件になることを確認
   - フェーズ数が過剰に増えないことを確認（20前後）
   - 全ノードカバレッジ 176/176 維持
   - 決定論性維持

5. **回帰テスト**:
   - 既存128テスト全PASSを確認（アサーション修正後）

### ユニットテスト不可能な項目（例外）

- なし。全修正箇所は純粋関数である。

## Boy Scout Rule — 翻訳可能性計画

- `kahnTopologicalSort` 内の変数名改善（方向反転時に合わせて命名を確認）
- `enforceHardConstraints` の比較ロジックにコメント追加（なぜこの方向が正しいかの根拠）
- 修正箇所のコメントが「何を」ではなく「なぜその方向が正しいか」を説明することを確認

## Acceptance Criteria

- [ ] `kahnTopologicalSort` の depends_on 方向が修正され、依存先(to)が依存元(from)より前に配置される
- [ ] `checkHardConstraints` の比較方向が修正され、依存意味論と一致する
- [ ] 実データ（176ノード）で hard constraints 違反が0件になる
- [ ] フェーズ数が20前後（過剰分割なし）に収まる
- [ ] 全128テストが PASS する（修正後の期待値で）
- [ ] 決定論性が維持される（同一入力→同一出力）
