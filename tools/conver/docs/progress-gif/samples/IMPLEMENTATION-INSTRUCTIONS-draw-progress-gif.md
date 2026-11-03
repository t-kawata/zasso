# draw-progress-gif 実装指示書（conver 開発担当AI宛）

## 0. 目的と成果物

`node draw-progress-gif.js -t <workspace>` で、conver ワークスペースの進捗を「パッケージごとの実装空間の密度が上がっていく GIF アニメーション」として出力する。

提出済みの一式（すべて依存ゼロ、Node >= 20.16）:

| ファイル | 役割 |
|---|---|
| `draw-progress-gif.js` | 本体。受理検査・探索・イベント抽出・描画エンジン・GIF エンコーダ・HTML 出力・ブラウザ起動 |
| `make-sample-workspace.js` | 合成ワークスペース生成（14 パッケージ、各工程が混在）。テスト fixture 兼用 |
| `sample-progress.gif` / `sample-progress.html` | 合成ワークスペースでの出力例 |

あなたの仕事は、**この試作を実ワークスペース（`~/shyme/gaia` など）に対して検証し、仕様どおりに仕上げて conver に統合すること**。試作は合成データでしか動かしていない。

## 1. 確定済みの設計判断（変更する場合は理由を報告）

1. 出力は `<target>/progress-gif/YYYYMMDDhhmmss.html` と、同名の `.gif`。**GIF が主、HTML は再生・ダウンロード用ビューア**。MP4 は未実装（任意）。
2. 描画エンジン（`makeEngine()`）は純粋関数で構成し、Node とブラウザの双方で同一コードを動かす。ソフトウェアラスタライザ、5x7 ビットマップフォント、GIF89a エンコーダを内蔵し、canvas 系・GIF 系の外部ライブラリは使わない。理由は、環境依存と新規依存（Plan Gate）の回避、バイト単位の再現性である。
3. `require` / `import` を使わず `process.getBuiltinModule` を使う。`.claude/`（CommonJS）でも `tools/conver/`（ESM）でも同一ファイルが動く。この性質を壊さないこと。
4. **表示日時は固定しない**。各イベントを成果物内の日時で並べ、アニメーションの進行に従って日時表示が変わる。フレームは「イベント順位」に比例して進めるため、時間の空白は圧縮される。
5. 日付しか取れない成果物（ticket の `created_at` など）は `MM/DD --:--` と表示する。架空の時刻は作らない。
6. 同一パッケージ内の graphify→boundify→split などは、時刻の逆転を補正する（`buildFrames` 内）。smooth はルート成果物なので補正に含めない。
7. 文字は、日時、現在の段階名、全体密度（%）、右側の16段階ラダーに限る。パッケージ名・件数・凡例は出さない。
8. 左は、パッケージごとの円形セル（ビルド順に格子配置）。セルの内側は、中心から外へ段階順に並ぶ点で、その段階の進捗率に応じて点灯する。密度が上がるとセルが収縮し、発光が強まる。

## 2. 進捗の計算

- 各セルの密度は、段階重み × 段階進捗率 π の加重平均。重みは `WEIGHT = [3,3,6,3,6,6,6,6,6,14,8,6,3,6,6,4]`（educe…drill 順）。**これは設計提案であり conver のソース由来ではない**。変更したい場合は 1 か所（`WEIGHT`）だけ直す。
- π は各イベントの加算量 `inc` の合計（上限 1）。イベントは `Node 側の build()` が作る。

| 段階 | イベント（時刻の出所） | inc |
|---|---|---|
| educe | 開始 `generationStartedAt`、完了は成果物 mtime（ルート、全セルに加算） | done phases/18 |
| explain | INFO / EXPLAIN の mtime | 0.35 / 0.35 + 0.3×facts節数/7 |
| grill | 解決済みノードの `questions[].resolvedAt`、DONE は `completedAt` | 0.9/ノード数、DONE で 0.1 |
| smooth | `measuredAt`（ルート）。`verdictIsPass` を満たさない場合は上限 0.9 | closed/total |
| graphify / boundify | `runId`、Dirs-Tree は `generatedAt` | 完了 step 数/総数（最小 0.25） |
| split | `runId` | step `6` が done なら 1 |
| make / plan / start / review | ticket の日付（`created_at`、`updated_at`、`startedAt`、`completedAt`） | 1/チケット数 |
| resolve | Malfeasance の `resolved_at`（未解決スタブは厳密文法で計数） | 1/(記録数+未解決数) |
| consolidate | manifest のファイル名時刻。OMISSIONS が存在すれば実行済みとみなす | 0.5 / 残り |
| find | OMISSIONS のファイル名時刻 | 未解決があれば 0.5、なければ 1 |
| crystalize | status の mtime | 0.5×steps/4 + 0.3×TOC確定率 + 0.2×節の確定率 |
| drill | 解決済みノードの `resolvedAt`、DONE または `1-N`/12 | 進捗率を等分 |

**判定できないものは描かない**（0 のまま）。例えば resolve は、記録もスタブも無ければ描かない。

## 3. 作業手順

1. 提出物を所定の場所に配置する。配置先は、conver の既存スクリプト置き場（例: `.claude/scripts/progress-gif/`）と、要求された呼び出し名 `draw-progress-gif.js` の両立を確認して決める。
2. 合成ワークスペースで再現する。
   ```bash
   TZ=Asia/Tokyo node make-sample-workspace.js /tmp/sw
   TZ=Asia/Tokyo node draw-progress-gif.js -t /tmp/sw --no-open --no-source-scan
   ```
   期待値: 14 パッケージ、501 イベント、120 フレーム、GIF は約 2.5 MB、終了コード 0。
3. **実ワークスペースで実行して差分を報告する**。最初は `~/shyme/gaia` と、可能なら root パッケージ（`.`）を持つワークスペースで行う。
   - 期待される測定値（補足資料の gaia）: 29 パッケージ、全 29 に graph と Dirs-Tree、5 パッケージに Tickets（計 66、すべて todo）、smooth は pass（6,660/6,660）。
   - 出力された警告をすべて分類して報告する。
4. 下記「5. 検証してほしい前提」を実データで確認し、誤りがあれば修正する。
5. TDD で単体テストを追加する（fixture はそのまま使える）。
6. ブラウザ検証を行う（未実施。§6）。
7. conver の通常パイプライン（チケット化、レビュー）に載せる。依存追加が無いため、依存追加由来の Plan Gate は発生しない。

## 4. テスト（最低限）

- 受理検査: 正常、各マニフェスト欠落、`artifact_kind` 不一致、`status` 不一致、ハッシュ連鎖不一致、パッケージ 0 件。いずれも終了コード 2 とメッセージを確認。
- 探索: `.delta.json` / `.bak` / `archive/` を採用しない。曖昧な候補は警告して無視する。
- 時刻: `runId`（ナノ秒 19 桁、ミリ秒 13 桁、不正値）、日付のみは `--:--`、同一パッケージ内の時刻逆転補正、全体の時刻単調性。
- 再現性: 同じ入力・同じ `TZ` で GIF のバイト列が一致する。
- GIF の妥当性: PIL などで全フレームを復号でき、サイズ、フレーム数、ループ（無限）が正しい。
- 読み取り専用: 実行前後で `progress-gif/` 以外のファイルが変化しない。
- 出力衝突: 同一秒の二重実行で別名になる。

## 5. 検証してほしい前提（私が資料から仮定したもの）

1. `allocate.implementation_order.serial` の要素がパッケージ id 文字列か（オブジェクトなら `package` / `id` を読む）。
2. `allocate.semantic_review.status` の合格値が `APPROVED` か。
3. `tree.input.source_hash` と `allocate.input_tree_manifest.spec.sha256` が同じ値を指すか。
4. `DesignTree.nodes[]` の再帰構造と、`questions[].resolvedAt` の位置。
5. facts ブロックのパターン `<!-- explain-seed:facts … -->`。
6. plan 時刻の近似（ticket が `planned` なら `updated_at`、それ以降なら `startedAt` または `created_at`）。実データで不自然なら別案を出す。
7. Malfeasance のフィールド名（`resolved_at`、`detected_at`、`status`）。
8. 実データでのスタブ走査時間（`--no-source-scan` で切れる。gaia の追跡ファイル約 7,000）。
9. root パッケージ `.` の扱い。親ディレクトリが子パッケージを重複して走査しないこと。
10. 最終フレーム保持（末尾 12 フレーム）と、冒頭保持（4 フレーム）の長さ。

## 6. 未検証・既知の限界（隠さず報告すること）

- **ブラウザ上の動作は未検証**。HTML 内のスクリプトは `node --check` と、エンジンのフレーム時刻の単調性確認までで、実際の再生、`putImageData` 描画、ダウンロードボタン、`#auto` は未確認。Chrome と Safari で確認すること。
- 描画の見た目は、数値確認のみで人の目による確認をしていない。ラダー文字の重なり、セルの視認性、フレーム間のちらつきを実機で確認し、必要なら調整する。
- フォントは大文字のみ。小文字の段階名も大文字で描かれる。
- 段階名のハイライトは、フレーム内のイベントに追従するため、複数パッケージが別々の段階にいる間は切り替わりが速い。実データで読みにくければ、平滑化（直近 N イベントの最頻段階など）を検討する。
- explain / consolidate / resolve の完了は、成果物から確定できない。試作は証拠のある範囲だけを描く（補足資料の `[UNKNOWN]` に従う）。
- Slack 上の GIF の容量・再生条件は未確認。実データで容量が大きすぎる場合は、`--frames` や `--fps` の既定値を調整する。MP4 は任意とされたが未実装。
- 色数は 256 色固定。暗部の階調は粗い。

## 7. 受け入れ条件

1. `node draw-progress-gif.js -t ~/shyme/gaia` が終了コード 0 で `.html` と `.gif` を作る。
2. 受理条件を満たさないディレクトリでは、終了コード 2 とともに原因と修正コマンドを表示する。
3. 表示日時が、成果物由来の日時の変化に従って進む。日付のみの場合は `--:--`。
4. 密度の上昇が、セルの収縮、点灯の増加、発光で見える。
5. 実行がワークスペースを変更しない。
6. 同じ入力で同じ GIF が得られる。
7. 実ワークスペースでの警告と、§5 の各項目の確認結果を、提出報告に含める。
