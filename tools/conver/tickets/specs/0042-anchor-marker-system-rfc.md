---
ticket_id: 42
title: Anchor Marker System — RFC分割パイプライン改修
slug: anchor-marker-system-rfc
status: draft
created_at: 2026-07-03
updated_at: 2026-07-03
---
# Anchor Marker System — RFC分割パイプライン改修

## Summary

RFC分割パイプライン（`/split-rfc-to-children`）に Anchor Marker System を導入する。
正典RFCに `<!-- [::REF-POINTER-BEGIN-{childId}-{seq}::] -->` マーカーを埋め込み、
RFC-TREE.json のノードからマーカーID を参照することで、機械的なコードブロック転記と
リンク整合性検証を可能にする。マーカー挿入位置の行範囲は AI が専用スクリプト経由で
RFC-TREE.json に記録し、generate-child-rfcs.js がそれを読み取って初回のみマーカーを
自動挿入する。挿入後はマーカーID が恒久的なリンクとして機能し、行番号には依存しない。
以下の改修を行う：

1. **RFC-TREE.json スキーマ拡張** — childNode/grandchildNode に `refPointers` フィールド追加（オブジェクト形式で行範囲を保持可能）
2. **add-ref-pointer.js 新設** — AI がコマンドライン引数で行範囲を記録するためのスクリプト
3. **generate-child-rfcs.js 改修** — 2フェーズ構成（マーカー自動挿入 + 機械転記）、注釈挿入、ガイダンスコメント
4. **validate-ref-pointer.js 新設** — リンク整合性検証スクリプト
5. **split-rfc-to-children skill 更新** — ワークフローに検証ステップ追加（スコープ例外事項）

## Background

現状のRFC分割パイプラインには以下の問題がある：

**問題1: `<!-- ??? -->` テンプレートの無指針性**
`generate-child-rfcs.js`（`tools/conver/.claude/scripts/tickets/generate-child-rfcs.js:22`）の
`md()` 関数は子RFCの各セクションを `<!-- ??? -->` で生成する。AIは何を・どの程度の詳細さで
記述すべきかの指針がなく、結果として子RFCが簡素になる。

**問題2: 子RFCがスタンドアロンで読めない**
現状の子RFCは32行前後と極めて簡素であり、親RFCへのセクション番号参照（例: `§1-51`）のみで
具体的な設計情報を欠く。`/drill-rfc-down` や `/formulate-tickets` で実装解像度を
高めることができない。

**問題3: 機械的転記の仕組みがない**
RFC-TREE.json の `ioSchema` フィールドは型定義の文字列を持つが、親RFCのどの行範囲から
取得したかが記録されていない。行番号ベースのポインタは親RFC更新時にずれるため信頼できない。

**問題4: リンク整合性検証がない**
親RFCに埋め込んだマーカーとRFC-TREE.jsonの参照の間に乖離が生じた場合の検出手段がない。

**問題5: `/drill-rfc-down` や `/formulate-tickets` が子RFCを掘り下げられない**
子RFCが親RFCへの参照のみで自己完結した型定義やAPI情報を持たないため、ドリルダウン先の
情報が存在せず、チケットも粗い粒度にしかならない。Anchor Marker による機械転記で
この問題を解決する。

## Scope

改修対象は原則として `~/shyme/zasso/tools/conver/.claude` 配下のみ。ただし
`split-rfc-to-children` skill ファイル（`~/.claude/skills/split-rfc-to-children.md`）は
本スコープ制約の**唯一の例外**として、ワークフロー記述の更新に限り編集を許容する。

以下を実施する：

### 1. RFC-TREE.json スキーマ拡張（`rfc-tree-schema.json`）

- `childNode.properties` に `refPointers`（`RefPointer[]`, optional）を追加
- `grandchildNode.properties` に `refPointers`（`RefPointer[]`, optional）を追加
- `RefPointer` 型: `{ "id": string(パターン^\d{2}-\d{3}$), "lineStart": number(optional), "lineEnd": number(optional) }`
  - `lineStart`/`lineEnd` は初回マーカー挿入時の位置特定にのみ使用。挿入後は保持しても削除してもよい

### 2. add-ref-pointer.js 新設

AI がコマンドライン引数で1件ずつ refPointer（ID + 行範囲）を RFC-TREE.json に記録するスクリプト。
RFC-TREE.json を直接編集させないための窓口。

### 3. generate-child-rfcs.js 改修

- **フェーズ1: マーカー自動挿入**: refPointers の lineStart/lineEnd を読み取り、正典RFCに Anchor Marker を挿入
- **フェーズ2: 機械転記**: 既存マーカーの内容を子RFC該当セクションに抽出・転記
- **注釈挿入**: 正典RFC・子RFC・孫RFCの先頭にマーカー説明注釈を挿入
- **テンプレート改善**: `<!-- ??? -->` を詳細なガイダンスコメントに置き換え
- **バックアップ**: 正典RFC編集前に自動バックアップ作成
- **冪等性**: 既存マーカー検出時は二重挿入しない。行範囲からの挿入は初回のみ

### 4. validate-ref-pointer.js 新設

- 孤児マーカー検出、未参照マーカー検出、ペア整合性検証、重複ID検出
- エラー時はファイルパス・マーカーID・問題の説明・修正方法を標準出力

### 5. split-rfc-to-children skill 更新

- Step 6（generate-child-rfcs.js 実行）の前に add-ref-pointer.js の実行ステップを追加
- Step 6 と Step 8 の間に validate-ref-pointer.js 実行ステップを追加

## Non-scope

- 既存の `validate-rfc-tree.js` / `verify-rfc-coverage.js` の改修は含まない
- 既存の各 `add-rfc-tree-*.js` スクリプトの改修は含まない
- `/split-rfc-to-children` 以外のスキルファイルの改修は含まない
- すでに生成済みの子RFCファイルへの追記処理は含まない（次回の generate-child-rfcs.js 実行時から有効）
- `/drill-rfc-down` や `/formulate-tickets` 自体の改修は含まない（子RFCがリッチになることで間接的に改善される）
- 既存の `patch-rfc-tree-child.js` の改修は含まない（`refPointers` のランダムアクセス更新は add-ref-pointer.js が担う）

## Investigation

### 証拠1: `md()` テンプレートの `<!-- ??? -->` 問題

ファイル: `tools/conver/.claude/scripts/tickets/generate-child-rfcs.js:22`

```javascript
function md(node,level,cPath,ev,pe){
  return fm(node,level,cPath,ev,pe)+'\n\n# RFC: '+(node.name||"")+'\n\n## 責務\n\n<!-- ??? -->\n\n## I/O境界\n\n<!-- ??? -->\n\n## 親との関係\n\n根拠: '+(ev||"(TBD)")+'\n\n<!-- ??? -->\n\n## 依存関係\n\n<!-- ??? -->\n';
}
```

### 証拠2: RFC-TREE.json スキーマに `refPointers` が未定義

ファイル: `tools/conver/.claude/scripts/tickets/rfc-tree-schema.json`

### 証拠3: 子RFCファイルの簡素さ

- `RFC-ROOT-01-siprs-core.md` — 32行、実質5行の内容
- `RFC-ROOT-02-siprs-server.md` — 32行、実質5行の内容

### 証拠4: リンク整合性検証スクリプトの不在

### 証拠5: generate-child-rfcs.js が tickets/ ディレクトリを作成していた（本チケットで除去済み）

## Implementation Specifications

### S1. Anchor Marker 書式定義

```
基本書式（HTML コメントでラップ）:
  <!-- [::REF-POINTER-BEGIN-{childId}-{seq}::] -->
  <!-- [::REF-POINTER-END-{childId}-{seq}::] -->

フィールド定義:
  {childId} : string, 2桁0埋め ("01"〜"99"), childNode.childId と一致
  {seq}     : string, 3桁0埋め ("001"〜"099"), 子ID内で一意な連番

例:
  <!-- [::REF-POINTER-BEGIN-01-001::] -->
  pub struct SipClient { ... }
  <!-- [::REF-POINTER-END-01-001::] -->

制約:
  1. マーカーは単独行に配置され、行内に他の内容を含まない
  2. BEGIN と END は同一の {childId}-{seq} を持ち、正しく対になる
  3. マーカーのネストは禁止（BEGIN-A → BEGIN-B → END-A はエラー）
  4. seq は親子ID {childId} のスコープ内で一意。全体ユニークではなくてよい
  5. 1 childId あたりの最大 seq 数: 99（001〜099、将来拡張時のみ 999 まで）

設計判断:
  ・HTML コメントでラップする理由: マーカーが Markdown レンダリングに
    影響しない。AI のコード理解にもノイズとならないことが確認済み。
  ・seq を childId スコープにする理由: 複数子RFC間でマーカーIDの競合を
    防ぎつつ、各子の担当者が自分の範囲だけでIDを管理できる。
```

### S2. refPointer → 子RFCセクション マッピング規則

```
【childNode（子）のマッピング】
generate-child-rfcs.js は、親RFCのマーカー範囲から抽出した内容を
子RFCの以下のセクションに配置する。

  seq 001: 「## 責務」セクションに転記
    └─ 公開API・主要型定義のコードブロック（SipClient API, Event 定義等）
  
  seq 002: 「## I/O境界」セクションに転記
    └─ この子のIOスキーマ・デカップリング方法の定義（ioSchema フィールドの展開）
  
  seq 003: 「## 親との関係」セクションに転記
    └─ 親RFCの根拠セクション参照（rfcEvidence の展開）
  
  seq 004: 「## 依存関係」セクションに転記
    └─ dependencyOn 構造の説明と外部依存一覧

  seq 005-099: 該当セクションがない場合、「## 責務」に追記
    └─ サブヘッダ「### マーカー {childId}-{seq}: {マーカー範囲の先頭見出し}」を付加

【grandchildNode（孫）のマッピング】
grandchildNode の場合、配置先は子RFCの「## 責務」セクションのみ。
マーカーの内容は「### {grandchild名}」サブセクションとして追記される。

  seq 001: 「## 責務」→「### {grandchild名}」に転記
    └─ この孫の型定義・IOスキーマ
  
  seq 002-099: 「### {grandchild名}」に追記
    └─ サブヘッダなしで連続配置

【配置ルール共通】
  ・マーカー範囲内の内容は BEGIN の次の行から END の前の行までを抽出。
    BEGIN/END 行自体は含まない。前後の空行1行ずつをトリムする。
  ・挿入位置はガイダンスコメント・ブロックの直後（空行1行あけて配置）。
  ・同名セクションが既存の場合は追記ではなく置換（冪等性）。
```

### S3. ガイダンスコメント設計（旧 `<!-- ??? -->` の置き換え）

各セクションのプレースホルダーは以下の指針コメントに置き換える：

```
## 責務

<!--
【記述指針】
このセクションには、この名前空間（crate/module/package）が提供する
公開API・主要型定義・ライフサイクルを記述すること。

最低限含めるべき情報:
1. 公開構造体・enum・trait のシグネチャ一覧
2. 主要な公開 async fn のシグネチャと簡潔な意味論
3. この名前空間の初期化・終了ライフサイクル

目安: 50〜200行程度。APIリファレンスとして機能する十分な具体性。
-->

<!-- 機械転記ブロック（generate-child-rfcs.js が更新） -->
{seq 001 から機械転記されたコードブロックがあればここに展開される。}
<!-- /機械転記ブロック -->

<!--
【AI記述部】
上記の機械転記ブロックで不足する設計判断・補足説明をここに記述する。
機械転記ブロックは自動更新されるが、この AI 記述部は維持される。
-->
```

```
## I/O境界

<!--
【記述指針】
このセクションには、この名前空間が外部に公開するI/O境界のスキーマ定義と
デカップリング方法を記述すること。具体的には：

1. 公開API境界（pub struct / pub trait / pub fn のシグネチャ）
2. FFI境界（unsafe コードの隔離範囲と安全抽象化の設計）
3. 非同期/同期境界（async fn と blocking の混在ルール）
4. ネットワーク/ファイルIO境界（HTTP、DB、ファイルシステム）
-->

<!-- 機械転記ブロック（generate-child-rfcs.js が更新） -->
{seq 002 から機械転記された内容があればここに展開される。}
<!-- /機械転記ブロック -->
```

```
## 親との関係

<!--
【記述指針】
この子RFCが正典RFCのどの範囲から派生したかを記述する。
根拠セクション番号は自動生成される。
-->

根拠: {rfcEvidence}

<!-- 機械転記ブロック（generate-child-rfcs.js が更新） -->
{seq 003 から機械転記された内容があればここに展開される。}
<!-- /機械転記ブロック -->
```

```
## 依存関係

<!--
【記述指針】
この名前空間の依存関係を記述する。以下を含めること：
1. 兄弟子RFCとの依存関係とその理由（dependencyOn の展開）
2. 外部クレート/ライブラリ依存とそのバージョン
3. ビルド時の依存（build.rs, bindgen, システムパッケージ等）
4. optional feature とその影響範囲
-->

<!-- 機械転記ブロック（generate-child-rfcs.js が更新） -->
{seq 004 から機械転記された内容があればここに展開される。}
<!-- /機械転記ブロック -->
```

### S4. 機械転記の2フェーズ実装詳細

```
generate-child-rfcs.js は2フェーズで動作する。
--phase フラグでフェーズを指定する（デフォルトは両方実行）。

===== フェーズ1: マーカー自動挿入（--phase=insert） =====

前提: RFC-TREE.json の refPointers に lineStart/lineEnd が記録済み（add-ref-pointer.js 経由）

処理:
1. 正典RFCのバックアップを作成（RFC-ROOT.md.bak.{YYYYMMDDHHMMSS}）
2. RFC-TREE.json の finalTree を走査
3. 各 childNode/grandchildNode の refPointers を取得
4. 各 refPointer について:
   a. lineStart/lineEnd が存在しない場合はスキップ（既にマーカー挿入済みと判断）
   b. lineStart/lineEnd が存在する場合:
      - 正典RFCの lineStart 行に `<!-- [::REF-POINTER-BEGIN-{childId}-{seq}::] -->` を挿入
      - 正典RFCの lineEnd 行に `<!-- [::REF-POINTER-END-{childId}-{seq}::] -->` を挿入
      - 挿入後、RFC-TREE.json の該当 refPointer から lineStart/lineEnd を除去（ID のみ残す）
      - 変更を RFC-TREE.json に保存
5. 正典RFC先頭に注釈ブロックを挿入（初回のみ、既存ならスキップ）

注: lineStart/lineEnd はマーカーで置き換わる行の行番号（1-indexed）。
    BEGIN は lineStart 行の内容をマーカー行で置き換え、その直後に元の内容を配置する。
    END は lineEnd 行の内容をマーカー行で置き換える。
    
    つまり、以下の変換が行われる:
    変換前:
      lineStart: pub struct SipClient { ... }
      ...
      lineEnd: impl SipClient { ... }
    
    変換後:
      <!-- [::REF-POINTER-BEGIN-01-001::] -->
      pub struct SipClient { ... }
      ...
      impl SipClient { ... }
      <!-- [::REF-POINTER-END-01-001::] -->

===== フェーズ2: 機械転記（--phase=transfer） =====

前提: 正典RFCにマーカーが挿入済み

処理:
1. RFC-TREE.json の finalTree を走査
2. 各 childNode について:
   a. 子RFCファイルが存在しなければテンプレートから新規生成
   b. 既存なら読み込み
   c. refPointers の各 ID について:
      - 正典RFCからマーカー範囲の内容を抽出
      - seq → セクションのマッピング（S2）に従って子RFCの該当箇所に配置
      - 配置は `<!-- 機械転記ブロック -->` と `<!-- /機械転記ブロック -->` で囲まれた領域を置換
      - 該当マーカーがなければエラー出力（validate-ref-pointer.js を先に実行すべき）
3. 子RFC先頭に注釈ブロックを挿入（初回のみ）
4. 孫RFCについて同様の処理

注釈ブロック:

【正典RFC用】（ファイル先頭、frontmatter の直後に挿入）
<!--
===== Anchor Marker System =====
このファイルには `[::REF-POINTER-BEGIN/END-*::]` マーカーが埋め込まれている。
これらのマーカーは機械的に子RFCへコードブロックを転記するためのものであり、
手動で編集・削除しないこと。マーカー範囲内の内容を変更した場合は、
generate-child-rfcs.js を再実行して子RFCの転記内容を更新すること。

マーカーID の解釈:
  <!-- [::REF-POINTER-BEGIN-{childId}-{seq}::] -->
  {childId} = 子RFCのID（01, 02, ...）
  {seq}     = その子ID内での連番（001, 002, ...）
===============================
-->

【子RFC用】（ファイル先頭、frontmatter の直後に挿入）
<!--
===== Anchor Marker System =====
このファイルの一部のセクションには「機械転記ブロック」として、
親RFC（{canonical_filename}）から機械的に転記された内容が含まれている。
機械転記ブロックは `<!-- 機械転記ブロック -->` と `<!-- /機械転記ブロック -->`
で囲まれており、generate-child-rfcs.js の再実行で自動更新される。

機械転記ブロック以外の記述（AI記述部）は維持される。機械転記ブロックの
内容を変更する場合は、必ず親RFCの該当マーカー範囲を編集した上で
generate-child-rfcs.js を再実行すること。
===============================
-->

【孫RFC用】（ファイル先頭、frontmatter の直後に挿入）
<!--
===== Anchor Marker System =====
このファイルは子RFC（{parent_child_name}）の傘下として機械生成された。
機械転記ブロックは子RFCから転記された内容を含む。
===============================
-->
```

### S5. 冪等性設計

```
generate-child-rfcs.js は以下の条件下で冪等に動作しなければならない：

【フェーズ1（マーカー挿入）】
ケースA: 初回実行（lineStart/lineEnd あり、マーカーなし）
  → マーカーを挿入。lineStart/lineEnd を RFC-TREE.json から除去。

ケースB: 再実行（lineStart/lineEnd なし、マーカーあり）
  → スキップ（何もしない）。正常終了。

ケースC: 一部の refPointer のみ lineStart/lineEnd あり
  → lineStart/lineEnd があるものだけ処理。既存マーカーはスキップ。

【フェーズ2（機械転記）】
ケースD: 初回転記（子RFCなし or 空の機械転記ブロック）
  → マーカー内容を抽出して転記。

ケースE: 再実行（子RFCに既存の転記内容あり）
  → `<!-- 機械転記ブロック -->` と `<!-- /機械転記ブロック -->` で
     囲まれた領域を新しい内容で置換。AI記述部は維持。

ケースF: RFC-TREE.json から childNode 削除
  → 該当 childNode の全マーカーを正典RFCから除去。子RFCファイルは削除しない（手動で削除）。

ケースG: refPointers 配列が更新（seq 追加/削除）
  → 新しい seq: フェーズ1でマーカー挿入（lineStart/lineEnd 必須）、フェーズ2で転記
  → 削除された seq: 該当マーカーを正典RFCから除去、子RFCの機械転記ブロックを空に

検出方法:
  フェーズ1: refPointer に lineStart プロパティが存在するか
  フェーズ2: 正典RFCの全行から `/<!-- \[::REF-POINTER-(BEGIN|END)-(\d{2})-(\d{3})::\] -->/g`
             でマーカーを一覧取得し、RFC-TREE.json の期待マーカーセットと比較
```

### S6. バックアップ・ロールバック設計

```
generate-child-rfcs.js は正典RFCを編集する前に自動バックアップを作成する：

バックアップファイル:
  {CANONICAL_RFC}.bak.{YYYYMMDDHHMMSS}
  例: RFC-ROOT.md.bak.20260703120000

バックアップタイミング:
  1. フェーズ1開始時（正典RFC編集前）
  2. フェーズ2開始時（子RFCファイル書込前）

ロールバック条件:
  以下のいずれかが発生した場合、バックアップから正典RFCを復元し、
  スクリプトは非零で終了する：
  - マーカー挿入処理で書き込みエラー
  - マーカー範囲抽出でパースエラー（BEGIN に対応する END がない等）
  - 子RFCファイルの書き込みエラー

バックアップのクリーンアップ:
  - 正常終了時: 今回作成したバックアップ1件を保持し、同一接尾辞パターン
    （*.bak.*）のファイルのうち24時間以上経過したものを削除
  - 異常終了時: 全バックアップを保持。エラーメッセージに
    「バックアップファイル: {path}」を含めて通知
  - 異常終了が連続してもバックアップが無限に累積しないよう、
    保持上限は直近5件とする。6件目以降は古いものから削除
```

### S7. validate-ref-pointer.js 詳細設計

```
エラー種別と出力フォーマット:

【孤児マーカー】RFC-TREE.json のノードが参照しているマーカーが親RFCに存在しない
  [ERROR] childId: {childId}
          マーカーID: {id}
          問題: RFC-TREE.json はこのマーカーを参照しているが、親RFCに
                `<!-- [::REF-POINTER-BEGIN/END-{id}::] -->` が
                見つかりません
          修正: 親RFCの該当箇所にマーカーを挿入するか、RFC-TREE.json の
                このノードの refPointers から "{id}" を削除してください
          ファイル: {RFC-TREE.json のパス}

【未参照マーカー】親RFCにマーカーが存在するが、RFC-TREE.json のどのノードも参照していない
  [WARN]  ファイル: {親RFCのパス}
          line: {行番号}
          マーカーID: {id}
          問題: このマーカーは親RFCに存在しますが、RFC-TREE.json の
                どのノードの refPointers からも参照されていません
          修正: 不要であればマーカー行を削除してください。必要であれば
                RFC-TREE.json の該当ノードの refPointers に "{id}" を追加してください

【ペア不整合（BEGIN のみ）】END がない BEGIN
  [ERROR] ファイル: {親RFCのパス}
          line: {行番号}
          マーカーID: {id}
          問題: `<!-- [::REF-POINTER-BEGIN-{id}::] -->` に
                対応する END マーカーが見つかりません
          修正: BEGIN マーカーの直後に
                `<!-- [::REF-POINTER-END-{id}::] -->` を追加してください

【ペア不整合（END のみ）】BEGIN がない END — 上記と同形式

【重複ID】同一IDの BEGIN が複数存在する
  [ERROR] ファイル: {親RFCのパス}
          line: {行番号1} および {行番号2}
          マーカーID: {id}
          問題: `<!-- [::REF-POINTER-BEGIN-{id}::] -->` が
                2箇所に存在します（ID重複）
          修正: 一方の ID を未使用の seq に変更してください（例: "{newId}"）

【ネスト検出】BEGIN の中で別の BEGIN が開始されている
  [ERROR] same format with nesting description

終了コード:
  0: エラーなし（警告のみは許容）
  1: 1件以上のエラーを検出

検出手順:
  1. 親RFCを読み込み、全マーカーを正規表現で一覧取得
  2. RFC-TREE.json から全ノードの refPointers を収集
  3. 孤児マーカー検出: refPointers の各IDについて親RFCに存在確認
  4. 未参照マーカー検出: 親RFCの全マーカーについて refPointers に存在確認
  5. ペア整合性: スタックマシンで BEGIN/END の対応を検証
  6. 重複ID: BEGIN の ID をキーにした Map で重複確認
```

### S8. テストフィクスチャ設計

```
フィクスチャディレクトリ: tests/fixtures/ref-pointer/

fixture-1: 正常系（全てのマーカーが整合している）
  canon.md:
    # RFC: Test
    ## 1. Purpose
    <!-- [::REF-POINTER-BEGIN-01-001::] -->
    pub struct SipClient;
    <!-- [::REF-POINTER-END-01-001::] -->
  tree.json:
    { "finalTree": [{ "childId": "01", "refPointers": [{"id": "01-001"}] }] }

fixture-2: 孤児マーカー
  canon.md:
    <!-- [::REF-POINTER-BEGIN-01-001::] -->
    pub struct SipClient;
    <!-- [::REF-POINTER-END-01-001::] -->
  tree.json:
    { "finalTree": [{ "childId": "01", "refPointers": [{"id": "01-002"}] }] }

fixture-3: 未参照マーカー
  canon.md:
    <!-- [::REF-POINTER-BEGIN-01-001::] -->
    pub struct SipClient;
    <!-- [::REF-POINTER-END-01-001::] -->
  tree.json:
    { "finalTree": [{ "childId": "01", "refPointers": [] }] }

fixture-4: ペア不整合（BEGIN のみ）
  canon.md:
    <!-- [::REF-POINTER-BEGIN-01-001::] -->
    pub struct SipClient;
    <!-- 対応する END なし -->
  tree.json:
    { "finalTree": [{ "childId": "01", "refPointers": [{"id": "01-001"}] }] }
  ※ tree.json は孤児マーカーエラーを区別するために必須

fixture-5: 重複ID
  canon.md:
    <!-- [::REF-POINTER-BEGIN-01-001::] --> ... <!-- [::REF-POINTER-END-01-001::] -->
    <!-- [::REF-POINTER-BEGIN-01-001::] --> ... <!-- [::REF-POINTER-END-01-001::] -->
  tree.json:
    { "finalTree": [{ "childId": "01", "refPointers": [{"id": "01-001"}] }] }

fixture-6: フェーズ1 マーカー自動挿入（初回）
  canon.md (セクション構造あり):
    # RFC: Test
    ## 1. Purpose
    pub struct SipClient;
    ## 2. Config
    pub struct ClientConfig;
  tree.json:
    {
      "canonicalRfcPath": "canon.md",
      "finalTree": [{
        "childId": "01",
        "slug": "test-child",
        "name": "Test Child",
        "namespaceUnit": "crate",
        "ioSchema": "pub struct SipClient",
        "decouplingMethod": "pub",
        "rfcEvidence": "§1",
        "refPointers": [{"id": "01-001", "lineStart": 3, "lineEnd": 3}]
      }]
    }
  → canon.md の 3行目がマーカーで囲まれる:
    <!-- [::REF-POINTER-BEGIN-01-001::] -->
    pub struct SipClient;
    <!-- [::REF-POINTER-END-01-001::] -->

fixture-7: 冪等性（再実行、変更なし）
  fixture-6 の実行後の状態で同一 tree.json を再実行
  → 正典RFCに変更なし

fixture-8: フェーズ2 機械転記
  fixture-6 実行後の canon.md（マーカーあり）+ 空の子RFCテンプレート
  → 子RFCの「## 責務」に「pub struct SipClient;」が転記される
```

### S9. `/drill-rfc-down`・`/formulate-tickets` 連携設計

```
本改修の目的は子RFCをリッチにすることで、下流コマンドが高解像度で動作する
基盤を整えることにある。具体的な連携は以下の通り：

  ┌─ generate-child-rfcs.js（フェーズ1: マーカー挿入）
  │     ↓
  │   AI が各子RFCのガイダンスコメントに従って設計記述を追記
  │     ↓
  ├─ generate-child-rfcs.js（フェーズ2: 機械転記）
  │     ↓ （子RFCに親のコードブロックが転記され、AI記述と結合される）
  │   子RFC（自己完結した設計情報を持つ）
  │     ↓
  ├─ /drill-rfc-down
  │     ↓ （子RFC内に型定義・APIシグネチャ・エラー型・依存関係が存在する）
  │   詳細な設計判断と実装計画が可能に
  │     ↓
  └─ /formulate-tickets
        ↓ （各型・API・モジュールごとにチケット化可能な粒度）
      具体的な実装チケット

この連鎖が機能するためには、子RFCが最低限以下の情報を機械転記＋AI記述に
よって保持していなければならない：
  1. 公開APIの完全なシグネチャ一覧（seq 001）
  2. 主要な型定義（struct, enum, trait）（seq 001）
  3. I/O境界のスキーマ定義（seq 002）
  4. 依存関係（seq 004）
  5. 非機能要件（AI記述部）
```

### S10. add-ref-pointer.js 詳細設計

```
AI がコマンドライン引数で refPointer を RFC-TREE.json に記録するためのスクリプト。
RFC-TREE.json を直接編集させないための排他的な窓口。

使用例:
  # 1件追加
  node add-ref-pointer.js <RFC-TREE.json> <childId> add \
    --id "01-001" --lineStart 292 --lineEnd 306

  # 複数件を一括追加（JSON文字列）
  node add-ref-pointer.js <RFC-TREE.json> <childId> batch \
    '[{"id":"01-001","lineStart":292,"lineEnd":306},{"id":"01-002","lineStart":350,"lineEnd":370}]'

  # 1件削除
  node add-ref-pointer.js <RFC-TREE.json> <childId> remove "01-001"

  # 一覧表示
  node add-ref-pointer.js <RFC-TREE.json> <childId> list

引数:
  RFC-TREE.json  : RFC-TREE.json のパス（必須）
  childId         : 子ノードのID（必須）
  サブコマンド    : add / batch / remove / list

add フラグ:
  --id        : マーカーID（"{childId}-{seq}"、必須）
  --lineStart : 開始行番号（1-indexed、必須）
  --lineEnd   : 終了行番号（1-indexed、必須）

バリデーション:
  - childId が RFC-TREE.json の finalTree に存在すること
  - id が パターン ^\d{2}-\d{3}$ に一致すること
  - lineStart >= 1 かつ lineEnd >= lineStart
  - 同一 childId 内で id が重複しないこと
  - 引数エラー時は使用方法を標準出力に表示し、編集は行わない

出力:
  {"success": true, "childId": "01", "refPointers": [...]}
  or
  {"success": false, "error": "説明"}

設計判断:
  ・引数ベースにした理由: AI が構造化 JSON を直接生成するより、
    確定したパラメータを1つずつ渡す方が安全。
  ・batch モード: /split-rfc-to-children のワークフローで複数マーカーを
    一括登録するため。AI が JSON 配列を生成してスクリプトに渡す。
```

### SX. スコープ制約の例外処理

```
split-rfc-to-children skill のワークフロー更新は、`~/.claude/skills/`
配下のファイルを編集する必要がある。これは「改修対象は conver/.claude 配下のみ」
という制約の例外である。

処理方針:
  - conver/.claude 内のスクリプト改修のみを本チケットの実装範囲とする
  - skill ファイルの更新は /plan-ticket 時に「外部依存作業」として明示し、
    実装担当者またはユーザーが別途適用するものとする

影響評価:
  skill ファイルが未更新でもスクリプト自体は独立して実行可能。
  検証ステップが自動実行されなくなるだけで、機能的な欠損は生じない。

split-rfc-to-children ワークフローへの追加ステップ（参考用）:
  Step 6 と Step 7 の間に以下を挿入:
  ```
  ### Step 6a: Anchor Marker 登録
  
  AI は `/split-rfc-to-children` の Step 4 で作成した RFC-TREE.json を基に、
  各 childNode の refPointers に行範囲を記録する。記録は専用スクリプト
  `add-ref-pointer.js` を介して行い、RFC-TREE.json を直接編集しない。
  
  ```bash
  # 子01（siprs-core）の責務セクション行範囲を記録
  node .claude/scripts/tickets/add-ref-pointer.js \
    RFC-TREE.json "01" add --id "01-001" --lineStart 292 --lineEnd 306
  ```
  
  ### Step 6b: Anchor Marker 自動挿入 + 機械転記
  
  ```bash
  node .claude/scripts/tickets/generate-child-rfcs.js RFC-TREE.json
  ```
  このスクリプトは lineStart/lineEnd からマーカーを自動挿入し（初回のみ）、
  その後マーカー範囲の内容を子RFCの該当セクションに機械転記する。
  
  ### Step 6c: リンク整合性検証
  
  ```bash
  node .claude/scripts/tickets/validate-ref-pointer.js RFC-TREE.json
  ```
  エラーがゼロになるまで修正を繰り返す。
  ```
```

## Test Plan

### ユニットテスト計画

#### validate-ref-pointer.js のテスト

| テストケース | フィクスチャ | 期待結果 |
|------------|------------|---------|
| 孤児マーカー検出 | fixture-2 | エラー出力、終了コード1 |
| 孤児マーカーなし | fixture-1 | エラーなし、終了コード0 |
| 未参照マーカー検出 | fixture-3 | 警告出力、終了コード0 |
| ペア不整合（BEGINのみ） | fixture-4 | エラー出力、終了コード1 |
| ペア整合性（正常） | fixture-1 | エラーなし、終了コード0 |
| 重複ID検出 | fixture-5 | エラー出力、終了コード1 |
| refPointers 空 | fixture-3 の tree | スキップ、終了コード0 |

#### add-ref-pointer.js のテスト

| テストケース | 期待結果 |
|------------|---------|
| add: 新規 refPointer 追加（id + lineStart/lineEnd 指定） | tree.json に refPointers が追加される |
| add: 同一 childId に重複 id 指定 | エラー出力、変更なし |
| add: 存在しない childId 指定 | エラー出力 |
| remove: 既存 refPointer 削除 | tree.json から該当エントリが削除される |
| remove: 存在しない id 指定 | エラー出力 |
| list: 一覧表示 | 標準出力にフォーマットされた一覧 |
| batch: 複数一括追加 | 全件が正しく追加される |

#### generate-child-rfcs.js のテスト（Anchor Marker 関連）

| テストケース | フィクスチャ | 期待結果 |
|------------|------------|---------|
| フェーズ1: マーカー初回挿入 | fixture-6 | 正典RFCにマーカーが挿入される |
| フェーズ1: 再実行（マーカーあり） | fixture-6 実行後 | 正典RFCに変更なし |
| フェーズ1: lineStart/lineEnd 除去確認 | fixture-6 実行後 | RFC-TREE.json から lineStart/lineEnd が除去されている |
| フェーズ2: 機械転記（責務セクション） | fixture-8 | 子RFCの「## 責務」にコードブロックが転記される |
| フェーズ2: AI記述部維持 | fixture-8 + AI編集後 | 再実行で AI 記述部が消えない |
| 注釈挿入（親） | fixture-6 | 正典RFC先頭に注釈ブロックが挿入される |
| 注釈挿入（子） | fixture-6 | 子RFC先頭に注釈ブロックが挿入される |
| 注釈挿入（孫） | fixture-6（grandchild あり） | 孫RFC先頭に注釈ブロックが挿入される |
| バックアップ作成 | fixture-6 | 正典RFCと同じディレクトリに .bak ファイルが作成される |
| バックアップ上限（5件） | 6回連続実行 | 古いバックアップが削除される |

### ユニットテスト不可能な項目（例外）

- 該当なし。全テストケースはテンポラリファイルを用いて分離実行可能。

## Boy Scout Rule — 翻訳可能性計画

- **generate-child-rfcs.js**: 現在1行で全テンプレートを生成している `md()` 関数を
  責務ごとに分割（`buildResponsibilitiesSection()`, `buildIoBoundarySection()`,
  `insertAnchorAnnotation()`, `extractMarkerRange()`, `backupCanonRfc()` 等）。
  各関数名が動詞句として読めるようにする。
- **validate-ref-pointer.js**: エラー種別ごとに関数を分割
  （`detectOrphanMarkers()`, `detectUnreferencedMarkers()`, `validatePairs()`,
  `detectDuplicateIds()`）。エラーメッセージは統一フォーマット関数で生成。
- **add-ref-pointer.js**: サブコマンド（add/batch/remove/list）ごとに関数を分割。
  引数パースとバリデーションは独立した関数に分離。
- **マーカー文字列定数化**: `REF_POINTER_BEGIN = "REF-POINTER-BEGIN"` などを
  各スクリプト冒頭の定数として定義。ハードコードを禁止する。
- **正規表現パターン**: マーカー検出の正規表現も定数化し、変更箇所を1箇所に集約する。
- **エラー出力の統一**: S7 で定義した出力フォーマットを厳守する関数を実装する。

## Acceptance Criteria

- [ ] `rfc-tree-schema.json` に `refPointers`（オブジェクト配列、id + lineStart/lineEnd optional）が childNode/grandchildNode に追加されている
- [ ] `add-ref-pointer.js` が add/batch/remove/list の4サブコマンドで動作する
- [ ] 行範囲記録時に id の重複・childId 存在確認・lineStart/lineEnd の大小チェックが行われる
- [ ] `generate-child-rfcs.js --phase=insert` が lineStart/lineEnd から Anchor Marker を自動挿入する
- [ ] マーカー自動挿入前にバックアップ（`.bak.{timestamp}`）が作成される
- [ ] マーカー自動挿入後、RFC-TREE.json から lineStart/lineEnd が除去される
- [ ] 冪等性が保証されている（再実行時に二重挿入・転内容重複が発生しない）
- [ ] `generate-child-rfcs.js --phase=transfer` がマーカー内容を子RFCの該当セクションに機械転記する
- [ ] 機械転記ブロック（`<!-- 機械転記ブロック -->` ... `<!-- /機械転記ブロック -->`）が正しく配置される
- [ ] AI記述部が再実行時も維持される
- [ ] 全RFC（親・子・孫）の先頭に適切な注釈ブロックが挿入される
- [ ] `<!-- ??? -->` が S3 で定義したガイダンスコメント（機械転記ブロック + AI記述部の区分あり）に置き換わっている
- [ ] `validate-ref-pointer.js` が孤児マーカー・未参照マーカー・ペア不整合・重複IDを検出する
- [ ] エラーメッセージが「どのファイルのどこがなぜ問題で、どう修正すべきか」を具体的に示す
- [ ] 全テストケース（fixture-1〜8）が通過する
- [ ] バックアップの保持上限（直近5件）が正しく機能する
- [ ] `/split-rfc-to-children` のワークフローに add-ref-pointer.js + validate-ref-pointer.js の実行ステップが追加されている（スコープ例外適用）

## Notes

- `/plan-ticket PX-3` で計画を策定
- 改修対象ディレクトリ: `~/shyme/zasso/tools/conver/.claude` が原則。skill 更新は例外として許容
- 本チケットは PX-2（I/O境界情報抽出スクリプト）の完了後に実装される想定
- implementer は generate-child-rfcs.js の既存機能（マーカー関係以外のテンプレート生成、Cargo.toml生成等）を壊さないよう注意すること

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testUnit[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
