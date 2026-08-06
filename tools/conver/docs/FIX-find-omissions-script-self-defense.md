# FIX: /find-omissions パイプラインのスクリプト自己防衛改修（4 欠陥）

> 本ドキュメントは、/find-omissions コマンド実行中に実際に発生した 4 つの問題を、
> 「スクリプト自体が内部で安全に防ぐ」ように改修するための完全な引き継ぎ文書である。
> 実装担当の AI は、この文書だけで**前提知識ゼロ**から迷いなく実装できる。

---

## 0. ⚠️ 最重要 — 実装対象ディレクトリ（場所を間違えないこと）

| | パス | 役割 |
|---|---|---|
| **実装対象（編集する場所）** | **`~/shyme/zasso/tools/conver/.claude`** | ここにあるスクリプトを編集する |
| 調査元（編集しない） | `~/shyme/zasso/crates/siprs/.claude` | 問題の調査・証拠収集のみ行った場所 |

- **`~/shyme/zasso/crates/siprs/.claude` 内のファイルは一切編集しないこと。**
- 両者の該当ファイルは現在 **IDENTICAL**（`diff` で確認済み）。したがって本ドキュメントが引用するファイル名・行番号は tools/conver 側でも有効。
- 行番号は将来の編集でずれる可能性があるため、**関数名で位置を特定**することを推奨する。
- 以降、パスは `.claude` ディレクトリからの相対パスで表記する。絶対パスは `~/shyme/zasso/tools/conver/.claude/<相対パス>`。

---

## 1. タスク概要

`/find-omissions` は、RFC グラフ由来のチケット群に対し、契約（Precondition / Postcondition / Invariant）がテストコードへ完全に翻訳されているかを ABC 基準で検査し、欠落（omission）をチケット化するパイプラインである。その実行中に以下の **4 欠陥** が判明し、いずれも「実行者の手動介入で突破した」状態だった。

| # | 欠陥 | 発生した症状 | 手動突破の内容 |
|---|---|---|---|
| 1 | リゾルビングチケットがソースの検査残骸を継承 | P8-7 が `foundOmissions` を継承し誤分類 | `foundOmissions` を手動クリア、status 復元 |
| 2 | phasify がディスク上のマーカーを書き換えられない | 45 個のマーカーが旧キーのまま残存 | 45 個を手動書き換え |
| 3 | tmp-omissions ファイルが実行中に 2 つ生成 | findings が 2 ファイルに分断 | 手動統合 |
| 4 | add-omission-ticket が同一キーで重複クローン生成 | サブエージェントが手動統合 | 1 コールに集約する運用で回避 |

**方針**: これらを「ドキュメントの注意書きで守らせる」のではなく、**スクリプト自体が内部で不正状態を作らない / 検出したら明示的に失敗する** ように改修する。成功時の意図した動作は変えない。

---

## 2. 背景: /find-omissions パイプラインの全体像

パイプラインは以下のステップで構成される（実装に必要な文脈のみ）。

```
Step 1   /consolidate-stubs の成果物（CONSOLIDATED-MANIFEST）から
         batch-create-resolving-tickets.js がスタブ解決チケットを一括作成
         └ create-resolving-ticket.js → createTicketFromSource (lib) が深層クローンで新チケット生成
Step 2   get-next-check-target-ticket.js が検査キューを作成し、
         _tmp-omissions-*.json と _tmp-check-target-tickets-cmds-*.json を生成
         └ このとき create-tmp-omissions.js を内部呼び出し
Step 2-7 検査ループ: 各チケットを ABC 検査し、欠落を
         add-omission-ticket.js --ticket-key=<KEY> で _tmp-omissions に記録
Step 8   get-next-check-target-ticket.js --with-clean-trash が
         _tmp-omissions を OMISSIONS-<ts>.json に昇格し、tmp を削除
Step 9   phasify-omissions.js が OMISSIONS + RFC-ROOT-GRAPH + Tickets.json から
         新フェーズを計算してマージ。旧チケットは R<round> でアーカイブされ、
         新フェーズに複製が作られる。
         └ このとき PX-120 の仕組みでスタブのキーを新キーに書き換える
Step 10  rename-phases.js でフェーズ名を設定
Step 11  clean-consolidation-artifacts.js で一時成果物を削除
```

**キーとなるデータ構造**:

- **Tickets.json** — `{ phases: [{ id, name, tickets: [ { id, phaseId, status, title, ..., foundOmissions, originalTicketKey, stubs } ] }] }`
- **`_tmp-omissions-*.json`** — 検査中の omission クローンを蓄積する作業ファイル（`OMISSIONS-*.json` の前段）。`add-omission-ticket.js` が `findLatestTmpOmissions()` で最新ファイルを選ぶ。
- **stubs 配列** — 各チケットが解決すべき `[::STUB::]` マーカーの一覧。`{ file, line, content }` を標準形とする。

**status の意味**:
- `todo` / `in_progress` / `planned` / `remanded` — アクティブ
- `reviewed` — 検査済み（合格）
- `R1` / `R2` / … — ラウンド完了（アーカイブ、再キュー対象外）

**originalTicketKey** — 「このチケットはどのチケットの omission クローンか」を示す。`add-omission-ticket.js` が**自分で設定**する。リゾルビングチケットには不要。

**foundOmissions** — 「このチケットが ABC 検査で不合格になった根拠」の配列。新規チケットには不要。

---

## 3. 欠陥 1: リゾルビングチケットがソースの検査残骸を継承

### 3.1 症状

Step 1 で作成したリゾルビングチケット（例: P8-7 = cpal 実装）が、深層クローン元のソースチケット（P8-4）から **`foundOmissions`（4 件）と `originalTicketKey`（P5-2）** を引き継いだ。

この結果:
1. `create-tmp-omissions.js` が P8-7 を「pending チケット」（検査残骸あり）と誤分類 → 誤ラベルクローン（`originalTicketKey=P5-2` なのにタイトルは cpal）を生成。
2. 統合作業者がこの誤ラベルクローンを除去 → P8-7 が OMISSIONS から脱落 → phasify で新フェーズへ再キー化されず、手動で `status=todo` に復元する必要が生じた。

### 3.2 物的証拠

```js
// scripts/lib/create-ticket-from-source.js:36 — ストリップ対象が完了残骸のみ
const STRIP_ON_CLONE = ['completedAt', 'startedAt'];
```

```js
// scripts/tickets/create-resolving-ticket.js:47,52 — クローン生成後、stubs を差し替えるだけで検査残骸はクリアしない
const res = createTicketFromSource({ ticketsData, sourceKey, seed });
res.ticket.stubs = stubs.map(s => ({ ...s, content: ... }));
```

実実行時の Tickets.json 上の状態（検証済み）:
```
P8-7: orig=P5-2 foundOmissions=4   ← ソース P8-4 から継承
```

### 3.3 根本原因

`createTicketFromSource` はソースを深層クローンするが、除去するのは `completedAt`/`startedAt` と status のみ。**新規チケットがソースの「検査不合格の根拠（foundOmissions）」と「omission クローンである印（originalTicketKey）」を引き継ぐことは原理的に誤り**であり、パイプラインの誤分類を誘発する。

### 3.4 改修内容

**編集ファイル**: `scripts/lib/create-ticket-from-source.js`

(1) `STRIP_ON_CLONE` に 2 フィールドを追加:

```js
// Before
const STRIP_ON_CLONE = ['completedAt', 'startedAt'];
// After
const STRIP_ON_CLONE = [
  'completedAt',
  'startedAt',
  'foundOmissions',      // 追加: 新規チケットは検査残骸を持たない
  'originalTicketKey'    // 追加: omission クローンとして誤分類させない
];
```

(2) `stripCompletedResidue` 内で background の先頭 `[::INSPECTION_FLAGGED::]` ブロックを除去:

```js
// Before
function stripCompletedResidue(ticket) {
  const next = { ...ticket };
  next.status = 'todo';
  for (const field of STRIP_ON_CLONE) {
    delete next[field];
  }
  return next;
}

// After
function stripCompletedResidue(ticket) {
  const next = { ...ticket };
  next.status = 'todo';
  for (const field of STRIP_ON_CLONE) {
    delete next[field];
  }
  // 新規チケットは検査不合格の烙印（[::INSPECTION_FLAGGED::]）を引き継がない。
  // センチネルは add-omission-ticket.js が background の先頭に付与する形式。
  // 先頭のセンチネルブロック（〜最初の空行まで）のみを除去する。
  if (typeof next.background === 'string') {
    next.background = next.background.replace(
      /^\[::INSPECTION_FLAGGED::\][\s\S]*?\n\n/,
      ''
    );
  }
  return next;
}
```

**安全性の確認済み根拠**:
- `scripts/tickets/create-deferral-ticket.js` は `originalTicketKey` / `foundOmissions` を**一切参照しない**（grep 確認済み）→ 共通ストリップしても deferral パスは壊れない。
- `scripts/tickets/add-omission-ticket.js` はクローン生成時に `originalTicketKey` を**自分で設定**する（`lookupTicket` + 明示代入）。`createTicketFromSource` のストリップとは独立 → omission クローン生成に影響しない。
- `scripts/lib/validate-tickets.js` は stubs やこれらのフィールドの形状を検証しない（grep 確認済み）。
- センチネル除去 regex は「先頭のセンチネルブロックのみ」を対象とし、センチネルを持たない background には無害（no-op）。

### 3.5 回帰テスト

**編集ファイル**: `tests/tickets/create-resolving-ticket.test.js`

- ソースチケットとして `foundOmissions` 配列・`originalTicketKey`・センチネル付き background を持つチケットを用意。
- `createResolvingTicket`（または `createTicketFromSource`）で新チケットを生成。
- 以下を検証:
  - 新チケットの `foundOmissions` が空（またはフィールド不在）
  - 新チケットに `originalTicketKey` が存在しない
  - 新チケットの background に `[::INSPECTION_FLAGGED::]` が含まれない
  - `status === 'todo'`

---

## 4. 欠陥 2: phasify がディスク上のマーカーを書き換えられない

### 4.1 症状

phasify（Step 9）は旧チケットを `R2`（アーカイブ）にし、新フェーズ（P9〜P12）へ複製を作成するが、**ディスク上の `[::STUB::]` マーカーは旧キー（P8-X）のまま**残った。その結果、`validate-no-external-excuses --fail-on-excuse` が **46 件すべて**失敗した（完了済みキー参照のため）。

### 4.2 物的証拠

```js
// scripts/tickets/create-tmp-omissions.js:392-396 — stubsMap 構築で line を DROP している
stubsMap[key].push({
  file: stub.file,
  content: stub.content,
  codes: extractCodes(stub.file, stub.line + 1)   // ← line が無い
});
```

```js
// scripts/rfc-graph/phasify-omissions.js:783 — line が無い stub はすべてスキップ
if (!stub.file || !stub.line) continue;
```

実実行時の OMISSIONS 成果物の参照プレースホルダ（検証済み）:
```
stubs[0] keys: ['file', 'content', 'codes']   ← line が存在しない
```

つまり phasify は stub `content` 内のキーは書き換えた（`helpers.rewriteStubKeys`）が、**ソースマーカー行の書き換え（`rewriteSourceMarkerLines`）は line 欠落により全スキップ**された。

### 4.3 根本原因

tmp-omissions ファイルを構築する `create-tmp-omissions.js` が、マーカー行を特定する唯一の鍵である **`line` を stubs から落としている**。phasify の書き換え関数は `line` 必須のため、黙って全スキップ → 静かな破損。

### 4.4 改修内容

**(1) 根本修正** — 編集ファイル: `scripts/tickets/create-tmp-omissions.js`（392-396 行）

```js
// Before
stubsMap[key].push({
  file: stub.file,
  content: stub.content,
  codes: extractCodes(stub.file, stub.line + 1)
});

// After
stubsMap[key].push({
  file: stub.file,
  line: stub.line,             // 追加: phasify のマーカー書き換えが行を特定するために必須
  content: stub.content,
  codes: extractCodes(stub.file, stub.line + 1)
});
```

**(2) 防御的フォールバック** — 編集ファイル: `scripts/rfc-graph/phasify-omissions.js`（`rewriteSourceMarkerLines`）

line 欠落時（既存の壊れた tmp ファイル由来など）も、stub `content` のプランテキスト（` -- ` 以降）でファイル内のマーカー行を特定して書き換える:

```js
// Before (783 行付近の該当部分)
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const line = lines[stub.line - 1];
    if (!line || !line.includes('[::STUB::]')) continue;

// After
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    let idx = -1;
    if (stub.line) {
      idx = stub.line - 1;
    } else {
      // フォールバック: プランテキスト（content の ' -- ' 以降）でマーカー行を特定
      const plan = stub.content.split(' -- ').slice(1).join(' -- ').trim();
      if (plan) idx = lines.findIndex(l => l.includes('[::STUB::]') && l.includes(plan));
    }
    if (idx < 0 || idx >= lines.length) continue;
    const line = lines[idx];
    if (!line || !line.includes('[::STUB::]')) continue;
```

**(3) 書き換え後の自己検証（推奨・任意）** — 編集ファイル: `scripts/rfc-graph/phasify-omissions.js`

`rewriteOutputStubKeys` の実行後、新フェーズの各 stub について「ディスク上の実マーカー行のキーが新キーと一致するか」を検証し、不一致があれば **exit non-zero でマージを拒否**する。これにより「静かな放置」を「明示的な失敗」に変える。

実装例（`rewriteOutputStubKeys` 末尾に追加）:
```js
// 自己検証: 新フェーズの各 stub のディスク上のマーカーが新キーへ書き換わったか
const fs = require('fs');
const failures = [];
for (const phase of output.phases) {
  for (const ticket of phase.tickets || []) {
    if (!Array.isArray(ticket.stubs) || ticket.stubs.length === 0) continue;
    const newKey = formatTicketKey(ticket.phaseId, ticket.id);
    for (const stub of ticket.stubs) {
      if (!stub.file) continue;
      const filePath = path.isAbsolute(stub.file) ? stub.file : path.resolve(process.cwd(), stub.file);
      if (!fs.existsSync(filePath)) continue;
      const lines = fs.readFileSync(filePath, 'utf8').split('\n');
      const targetIdx = stub.line ? stub.line - 1 : -1;
      const lineText = targetIdx >= 0 && targetIdx < lines.length ? lines[targetIdx] : null;
      if (lineText && lineText.includes('[::STUB::]') && !lineText.includes(newKey)) {
        failures.push(stub.file + (stub.line ? ':' + stub.line : '') + ' still references an old key');
      }
    }
  }
}
if (failures.length > 0) {
  console.error('[phasify-omissions] Marker rewrite verification FAILED:');
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
```

### 4.5 回帰テスト

**編集ファイル**: `tests/tickets/phasify-srcdir.test.js`

- ケース 1（line 保持）: `line` を持つ stubs を tmp-omissions に持ち、phasify を実行し、ディスク上のマーカーが新キーに書き換わっていることを検証。
- ケース 2（line 欠落フォールバック）: `line` を持たない stubs（旧形式）で phasify を実行し、プランテキスト・フォールバックで書き換えられること（または自己検証が明示的エラーで失敗すること）を検証。

---

## 5. 欠陥 3: tmp-omissions ファイルが実行中に 2 つ生成される

### 5.1 症状

実行中に `_tmp-omissions-<ts1>.json` と `_tmp-omissions-<ts2>.json` が併存し、**findings が 2 ファイルに分断**された。`add-omission-ticket.js` は最新タイムスタンプを選ぶため、2 つ目以降の findings が別ファイルに蓄積される。統合作業者が手動で 1 ファイルに統合する必要が生じた。

### 5.2 物的証拠

```js
// scripts/tickets/create-tmp-omissions.js — 毎回 formatTimestamp() で新しいファイル名を生成
const timestamp = formatTimestamp();
const outputFileName = '_tmp-omissions-' + timestamp + '.json';
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
```

```js
// scripts/tickets/add-omission-ticket.js — 最新タイムスタンプを選択するため、分断されると追従
const found = findLatestTmpOmissions();   // sort().reverse() で最新を採用
```

実実行時の併存（検証済み）:
```
_tmp-omissions-20260805182618.json  (18:26 生成, P6-1/2/3, P7-1 の findings)
_tmp-omissions-20260805185804.json  (18:58 生成, P7-2/3, P8-1/2/4 の findings)
```

### 5.3 根本原因

`create-tmp-omissions.js` が「既存ファイルの有無に関係なく常に新しいタイムスタンプファイルを生成する」ため、実行中に再起動されると 2 つ目が生まれる。

### 5.4 改修内容

**編集ファイル**: `scripts/tickets/create-tmp-omissions.js`（main() 冒頭）

既存の `_tmp-omissions-*.json` がある場合は新規作成を拒否（`--force` でのみ再作成可能）:

```js
// main() の冒頭に追加
const force = process.argv.includes('--force');
const existing = findLatestTmpOmissions();
if (existing && !force) {
  console.error('[create-tmp-omissions] Error: tmp-omissions already exists: ' + existing);
  console.error('[create-tmp-omissions] A run is pinned to ONE _tmp-omissions-*.json file.');
  console.error('[create-tmp-omissions] Delete it, or use --force only to start a truly fresh run.');
  process.exit(2);
}
```

**補足**: `scripts/tickets/get-next-check-target-ticket.js` の `ensureTmpOmissions` は既に「`findLatestTmpOmissions()` が null のときだけ create-tmp-omissions を呼ぶ」。よって通常フローは変わらず、このガードは直接呼び出し（＝今回問題になった経路）を防ぐ。

### 5.5 回帰テスト

**編集ファイル**: `tests/tickets/scripts.test.js`（または既存の tmp-omissions テスト）

- 既存の `_tmp-omissions-*.json` が存在する状態で `create-tmp-omissions.js`（`--force` なし）を実行し、**exit code 2** とエラーメッセージを検証。
- `--force` 付きで実行し、新しいファイルが生成されることを検証。

---

## 6. 欠陥 4: add-omission-ticket が同一キーで重複クローンを生成

### 6.1 症状

`add-omission-ticket.js --ticket-key=<KEY>` を同じキーで複数回呼ぶと、**重複クローン**が生成された。実際の検査で P6-1 のサブエージェントが「repeated --ticket-key invocations create duplicate clones」と報告し、手動統合が必要だった。

### 6.2 物的証拠

```js
// scripts/tickets/add-omission-ticket.js:228 — findCloneByOriginalKey は PX フェーズ(phase.id===-1)のみ検索
if (phase.id !== -1) continue;
```

```js
// scripts/tickets/add-omission-ticket.js:110-114 — appendTicket は最大実フェーズ（例: phase 8）に配置
const nonPxPhases = result.phases.filter(p => p.id !== PX_PHASE_ID);
const maxPhaseId = Math.max(...nonPxPhases.map(p => p.id));
targetPhase = nonPxPhases.find(p => p.id === maxPhaseId);
```

**検索は PX フェーズ / 配置は実フェーズ** で不一致。1 回目のクローンが実フェーズに置かれると、2 回目は検索にヒットせず重複する。

### 6.3 根本原因

既存クローンの**検索範囲（PX フェーズのみ）** と新規クローンの**配置先（最大実フェーズ）** が一致していない。

### 6.4 改修内容

**編集ファイル**: `scripts/tickets/add-omission-ticket.js`（`findCloneByOriginalKey`）

```js
// Before
function findCloneByOriginalKey(data, originalKey) {
  if (!data || !Array.isArray(data.phases)) return null;
  for (const phase of data.phases) {
    if (phase.id !== -1) continue;          // ← この行を削除
    for (const ticket of (phase.tickets || [])) {
      if (ticket.originalTicketKey === originalKey) {
        return ticket;
      }
    }
  }
  return null;
}

// After
function findCloneByOriginalKey(data, originalKey) {
  if (!data || !Array.isArray(data.phases)) return null;
  for (const phase of data.phases) {
    for (const ticket of (phase.tickets || [])) {
      if (ticket.originalTicketKey === originalKey) {
        return ticket;
      }
    }
  }
  return null;
}
```

**安全性**: `originalTicketKey` を持つのは omission クローン（`add-omission-ticket.js` が設定）だけ。参照プレースホルダは持たないため、全フェーズ検索で誤一致しない。

### 6.5 回帰テスト

**編集ファイル**: `tests/tickets/` 内の add-omission-ticket 対応テスト（`scripts.test.js` など）

- 同一 `--ticket-key` で `add-omission-ticket.js` を 2 回呼び、tmp-omissions 内にそのキーのクローンが **ちょうど 1 つ**で、`foundOmissions` が 2 回分の合計になっていることを検証。

---

## 7. 実装チェックリスト（TDD 順）

各欠陥について **Red → Green → Refactor** を守る。1 欠陥ずつ、テストを先に書いて失敗を確認してからスクリプトを修正する。

実装順（独立性が高く影響の小さいものから）:

| 順 | 欠陥 | 編集するスクリプト | テストファイル |
|---|---|---|---|
| 1 | 欠陥 4（重複クローン） | `scripts/tickets/add-omission-ticket.js` | `tests/tickets/scripts.test.js` |
| 2 | 欠陥 1（検査残骸の継承） | `scripts/lib/create-ticket-from-source.js` | `tests/tickets/create-resolving-ticket.test.js` |
| 3 | 欠陥 3（tmp 分断） | `scripts/tickets/create-tmp-omissions.js` | `tests/tickets/scripts.test.js` |
| 4 | 欠陥 2（line 欠落 → マーカー書き換え不能） | `scripts/tickets/create-tmp-omissions.js` + `scripts/rfc-graph/phasify-omissions.js` | `tests/tickets/phasify-srcdir.test.js` |

各ステップの流れ:
1. 失敗テストを書く（RED）→ 実行して失敗を確認
2. 上記の改修内容を適用（GREEN）→ テストが通ることを確認
3. 必要ならリファクタリング（グリーンのみ許可）

---

## 8. 検証コマンド

作業ディレクトリ: `~/shyme/zasso/tools/conver/.claude`

```bash
# 全スクリプトテスト
cd ~/shyme/zasso/tools/conver/.claude && node tests/run-all.js

# 個別テスト（該当分だけ回す場合）
node tests/tickets/create-resolving-ticket.test.js
node tests/tickets/scripts.test.js
node tests/tickets/phasify-srcdir.test.js

# 構文チェック（編集したスクリプトすべて）
node --check scripts/lib/create-ticket-from-source.js
node --check scripts/tickets/create-tmp-omissions.js
node --check scripts/tickets/add-omission-ticket.js
node --check scripts/rfc-graph/phasify-omissions.js
```

**欠陥 2 の実動作確認（任意だが推奨）**:
1. `get-next-check-target-ticket.js` 相当のフローで tmp-omissions を生成し、stubs に `line` が含まれることを確認。
2. phasify を実行し、ディスク上のマーカーが新キーに書き換わっていること、`validate-no-external-excuses --fail-on-excuse` が 0 件であることを確認。

---

## 9. 安全分析（実装前に読むこと）

改修は「純粋に予防的」であり、**成功時の意図した動作を変えない**。ただし実装時に留意すべき点:

| 箇所 | 新たに導入される挙動 | 種別 |
|---|---|---|
| 欠陥 3 の拒否 | 既存 tmp があると `create-tmp-omissions.js` が exit 2（`--force` で回避） | **意図的な安全な失敗**（分断の黙認を排除） |
| 欠陥 2 の自己検証 | マーカー書き換え漏れがあると phasify が exit non-zero | **意図的な安全な失敗**（静かな破損を排除） |
| 欠陥 1 のセンチネル除去 regex | `^\[::INSPECTION_FLAGGED::\][\s\S]*?\n\n` で先頭ブロックを除去 | 注意: センチネル形式が変わると過剰/過小除去の可能性 → 回帰テストで固定 |
| 欠陥 2 のフォールバック | プランテキストで行を特定 | 注意: 同一プラン文字列が複数行にあると誤行の可能性 → line 保持後はほぼ発動しない + 自己検証が検出 |

**確認済みの安全事項**:
- `validate-tickets.js` は stubs の形状を検証しない → `line` 追加で壊れない
- `create-deferral-ticket.js` は `originalTicketKey`/`foundOmissions` を参照しない → 共通ストリップは安全
- `add-omission-ticket.js` は `originalTicketKey` を自分で設定 → ストリップと独立
- 全フェーズ検索で `originalTicketKey` が誤一致することはない（参照プレースホルダは持たない）

---

## 10. 完了条件（Definition of Done）

- [ ] 4 欠陥すべての回帰テストが存在し、Red→Green を経験している
- [ ] `node tests/run-all.js` がグリーン
- [ ] 編集したスクリプト 4 本すべて `node --check` が通る
- [ ] 実装対象は **`~/shyme/zasso/tools/conver/.claude`** のみ（`crates/siprs/.claude` は未変更）
- [ ] 本ドキュメントの「実装順」と「検証コマンド」のとおりに完了している
