---
ticket_id: 30
title: formulate-tickets CLAUDE.md テンプレートへの設計原則追記（I/O境界・不変条件）
slug: formulate-tickets-claudemd
status: draft
created_at: 2026-07-01
updated_at: 2026-07-01
---

# formulate-tickets CLAUDE.md テンプレートへの設計原則追記（I/O境界・不変条件）

## Summary

`/formulate-tickets` および `/formulate-tickets-for-next` が生成する `CLAUDE.md`（設計全体マップ）のテンプレートに、PX-15 で明確化された「不変条件 = I/O境界の契約」「I/O 境界マッピング」「結合テスト計画」の設計原則を追記する。これにより、個別チケットの作業中に設計全体の I/O 境界の契約を常に俯瞰できるようにする。

## Background

PX-15 で `.claude/commands/formulate-tickets.md` および `formulate-tickets-for-next.md` に以下の改修が加えられた：

1. 「不変条件 = I/O境界における契約の正しさ」の定義
2. I/O 境界マッピング表（Rust/Go/TypeScript）
3. I/O 境界によるチケット分解基準
4. チケット雛形の全フィールド化（`relatedTicketIds`, `testExceptions`, `notes` 含む）

しかし、これらのコマンドが生成する `CLAUDE.md`（設計全体マップ）のテンプレートには、これらの設計原則が一切反映されていない。CLAUDE.md は「個別チケットの作業中に設計全体を俯瞰するためのマップ」として機能するものであり、核心的な設計原則の欠落は、作業者が「木（個別チケット）」に集中するあまり「森（I/O境界の契約）」を見失うリスクを生む。

## Scope

### 改修対象

| # | ファイル | 改修内容 |
|---|----------|----------|
| 1 | `.claude/commands/formulate-tickets.md` | Step 2 の CLAUDE.md テンプレート（cat << 'CLAUDE_EOF' ブロック内）に設計原則セクションを追記 |
| 2 | `.claude/commands/formulate-tickets-for-next.md` | 同上 |

### 追記内容

CLAUDE.md テンプレートの既存末尾（`## スタブ一覧と解決計画` セクションの後）に、以下のセクションを追加：

```markdown
## チケット分解の設計原則

この設計書に基づく全チケットは、以下の原則に従って分解されている：

- **不変条件 = I/O境界の契約**: 各チケットの完了は、公開I/O（引数→戻り値、トレイトメソッド、APIエンドポイント等）に対する契約がテストによって検証されたことをもって判断する。内部実装の詳細は完了判定に影響しない。
- **I/O 境界の言語マッピング**: Layer 0（型定義）は struct/interface/type、Layer 1（純粋関数）は pub fn/func/export function 等、各層の I/O 境界は Rust/Go/TypeScript の具象言語要素に対応づけられる。
- **結合テスト計画**: 各チケットは出力先チケットとの I/O 結合テストを `[::STUB::]` マーカー付きで `notes` フィールドに計画として含める。

詳細はこのディレクトリの `CLAUDE.md` 上部の「I/O 境界マッピング」および「チケット分解の基準」を参照。
```

## Non-scope

- formulate-tickets コマンドの実行フロー（bash スクリプト部分）は変更しない
- CLAUDE.md の既存セクション（目的/アーキテクチャ/型定義/依存関係/スタブ一覧）は変更しない
- 他のスラッシュコマンド（plan-ticket, start-ticket, review-ticket 等）は一切変更しない
- Tickets.json のスキーマは変更しない

## Investigation

### 証拠1: formulate-tickets.md の CLAUDE.md テンプレート位置

`formulate-tickets.md` 96〜146行目（Step 2）:
```bash
cat <<'CLAUDE_EOF' > "$CLAUDE_MD"
# <設計書タイトル> — 設計全体マップ
...
## スタブ一覧と解決計画
...
CLAUDE_EOF
```

既存の最終セクションは `## スタブ一覧と解決計画`。この直後に設計原則セクションを追記する。

### 証拠2: formulate-tickets-for-next.md の CLAUDE.md テンプレート位置

`formulate-tickets-for-next.md` 124〜166行目（Step 2）:
同様の構造。既存の最終セクションは `## スタブ一覧と解決計画`。

### 証拠3: PX-15 との関係

PX-15（完了済み）で formulate-tickets コマンド群に加えられた改修（不変条件定義・言語マッピング・分解基準）が、生成物である CLAUDE.md に反映されていない。これは PX-15 のスコープに含まれていなかった追加タスクである。

## Test Plan

### 検証方針

文書改修のみのため、ユニットテストは存在しない。以下で検証する：

| # | 検証項目 | 確認方法 |
|---|----------|----------|
| 1 | 既存内容の完全保存 | diff で CLAUDE_EOF ブロック内の既存行が削除・改変されていないことを確認 |
| 2 | 追記の正確性 | PX-15 で追記した不変条件/I/O境界の定義と矛盾しないことを確認 |
| 3 | 両ファイルの一貫性 | formulate-tickets.md と formulate-tickets-for-next.md のテンプレートが同一内容であることを確認 |
| 4 | コマンド動作確認 | 実際に両スラッシュコマンドが起動することを確認 |

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| CLAUDE.md の「読みやすさ」の評価 | 主観。レビューによる確認のみ |

## Boy Scout Rule — 翻訳可能性計画

Markdown 文書のみの改修のため、コードの翻訳可能性に関する改修は発生しない。追記する文章は「翻訳可能な散文」であること（読み手が迷わない明確さ）。

## Acceptance Criteria

- [ ] formulate-tickets.md の CLAUDE.md テンプレートに設計原則セクションが追記されている
- [ ] formulate-tickets-for-next.md の CLAUDE.md テンプレートに設計原則セクションが追記されている
- [ ] 両ファイルの追記内容が同一である
- [ ] 既存 CLAUDE.md テンプレートの内容が完全に保持されている
- [ ] 追記内容が PX-15 の不変条件/I/O境界の定義と矛盾しない
- [ ] 両スラッシュコマンドが正常に起動する
- [ ] 犯罪スキャンで新たな犯罪が発生していない

## Notes

### 依存関係

- **PX-15 (先行完了必須)**: この改修の前提。PX-15 で明確化された設計原則を CLAUDE.md に反映する。
- PX-16 単独では意味をなさないため、PX-15 の完了後に実装すること。

### 補足

CLAUDE.md の役割は「個別チケットの作業中に設計全体を俯瞰するためのマップ」である。設計原則が CLAUDE.md に書かれていることで、以下の恩恵がある：

- `/start-ticket` 実行時に Claude Code が自動的に CLAUDE.md を読み込み、設計全体の文脈を理解する
- 作業者が「不変条件 = I/O境界の契約」を意識しながら実装を進められる
- 後続チケットの計画時に、先のチケットの I/O 境界が確認できる

### 成果物の保存先

| 成果物 | 保存先 |
|--------|--------|
| 改修後 formulate-tickets.md | `.claude/commands/formulate-tickets.md` |
| 改修後 formulate-tickets-for-next.md | `.claude/commands/formulate-tickets-for-next.md` |
