# uv完全版 MTPLX Qwen3.6 27B env on M2 Mac for Claude Code

## 構成

この構成では、Python 系を **全面的に uv で管理** します。

1. **推論本体**: `MTPLX` で `Qwen3.6-27B-MTPLX-Optimized-Quality` または `Qwen3.6-27B-MTPLX-Optimized-Speed` を Apple Silicon 向けに実行する。[web:235][web:236]
2. **API 変換**: Claude Code proxy で OpenAI 互換を Anthropic 互換に変換する。[web:258][file:241]
3. **クライアント**: Claude Code を `ANTHROPIC_BASE_URL` で localhost に向ける。[file:241]
4. **環境管理**: Python の依存解決、仮想環境、実行を `uv` に統一する。[web:256][web:263]

***

## この版の狙い

この手順は、以前の `pip + venv` ベースや `mlx-optiq` ベースの手順を、**MTPLX + uv 完全版** に整理し直したものです。`uv` は Python プロジェクト管理、依存解決、仮想環境作成、ツール実行を一体化でき、`claude-code-proxy` 側も `uv sync` ベースで扱えます。[web:256][web:258][web:260]

方針としては、**MTPLX 本体用の uv プロジェクト**と、**proxy 用の uv プロジェクト**を分けます。これは upstream の proxy 構成に近く、安全で更新追従もしやすい形です。[web:258][web:267]

***

## 事前条件

以下を前提にします。

- macOS on Apple Silicon, **M2 Mac Studio 32GB**
- Homebrew 導入済み
- Node.js と npm 利用可
- `uv` 利用可
- Claude Code を CLI で使う

必要パッケージは `python@3.12`, `git`, `uv`, `node` です。[file:241][web:256]

```bash
brew install python@3.12 git uv node
```

Claude Code 自体をまだ入れていなければ、先に入れます。[file:241]

```bash
npm install -g @anthropic-ai/claude-code
```

確認:

```bash
claude --version
node -v
python3.12 --version
uv --version
```

***

## ディレクトリ構成

最終的な構成はこうします。

```text
~/local-ai/qwen36-mtplx-claude-code/
  pyproject.toml
  uv.lock
  .python-version
  .venv/
  .env.mtplx
  models/
  scripts/
  claude-code-proxy/
```

ルートは MTPLX 用の uv プロジェクトです。`claude-code-proxy/` は別の uv プロジェクトとして扱います。[web:258][web:267]

***

## Step 1: ルートの uv プロジェクトを作る

まず MTPLX 本体用のプロジェクトを作ります。

```bash
mkdir -p ~/local-ai/qwen36-mtplx-claude-code
cd ~/local-ai/qwen36-mtplx-claude-code

uv init --app --python 3.12
```

もし `uv init --app --python 3.12` が使えないバージョンなら、次でも構いません。

```bash
uv init --app
uv python pin 3.12
```

これで `pyproject.toml` と `.python-version` を持つ uv プロジェクトができます。[web:256][web:263]

***

## Step 2: 依存を uv で追加する

MTPLX 実行とモデル取得に必要な依存を追加します。

```bash
cd ~/local-ai/qwen36-mtplx-claude-code
uv add mtplx huggingface_hub hf_transfer
uv sync
```

これで `.venv` は uv が自動で作り、ロックファイルも管理します。[web:256][web:263]

確認:

```bash
uv run python -c "import mtplx; print('MTPLX OK')"
```

もし import 名が環境によって異なる場合は、次で確認してください。

```bash
uv run python -c "import importlib.metadata as m; print(m.version('mtplx'))"
```

***

## Step 3: MTPLX 向け Qwen3.6-27B モデルを取得する

Qwen3.6-27B 向けには少なくとも次の系統が確認できます。

- **品質寄り**: `Youssofal/Qwen3.6-27B-MTPLX-Optimized-Quality`[web:235]
- **速度寄り**: `Youssofal/Qwen3.6-27B-MTPLX-Optimized-Speed`[web:236]
- **汎用最適化系**: `Youssofal/Qwen3.6-27B-MTPLX-Optimized`[web:196]

Claude Code のコード編集用途では、まず **Quality 版** から入るのが無難です。[web:235]

```bash
cd ~/local-ai/qwen36-mtplx-claude-code
mkdir -p models

export HF_HUB_ENABLE_HF_TRANSFER=1
huggingface-cli download \
  Youssofal/Qwen3.6-27B-MTPLX-Optimized-Quality \
  --local-dir ./models/Qwen3.6-27B-MTPLX-Optimized-Quality
```

速度最優先ならこちらです。

```bash
huggingface-cli download \
  Youssofal/Qwen3.6-27B-MTPLX-Optimized-Speed \
  --local-dir ./models/Qwen3.6-27B-MTPLX-Optimized-Speed
```

モデル格納確認:

```bash
ls -lah ./models/Qwen3.6-27B-MTPLX-Optimized-Quality | head
```

***

## Step 4: モデル互換性を確認する

`mtplx` は、対象モデルが verified か、architecture-compatible かを確認する仕組みを持つと案内されています。[web:199]

利用可能なら、まず inspect を実行します。

```bash
cd ~/local-ai/qwen36-mtplx-claude-code
uv run mtplx inspect ./models/Qwen3.6-27B-MTPLX-Optimized-Quality
```

期待するのは、`verified` もしくは `architecture-compatible` といった判定です。[web:199]

もし `inspect` サブコマンドが無い場合は、バージョン差です。その場合は次で確認してください。

```bash
uv run mtplx --help
```

必要ならモデルカードの起動例や README を優先してください。[web:206][web:236]

***

## Step 5: MTPLX サーバを uv run で起動する

ここが中心です。`pip` や `source .venv/bin/activate` は不要で、**常に `uv run` で実行**します。[web:256][web:260]

まずはベースライン起動:

```bash
cd ~/local-ai/qwen36-mtplx-claude-code
uv run mtplx serve \
  --model ./models/Qwen3.6-27B-MTPLX-Optimized-Quality \
  --port 8080
```

別ターミナルで疎通確認:

```bash
curl http://127.0.0.1:8080/v1/models
```

環境や配布形態によっては、実際のサーバコマンドが `mtplx serve` ではなく `lightning-mlx serve` のことがあります。その場合も、**uv の中から起動する** という原則は同じです。[web:183][web:236]

例:

```bash
uv run lightning-mlx serve \
  ./models/Qwen3.6-27B-MTPLX-Optimized-Quality \
  --port 8080
```

### 最初に試す推奨設定

Claude Code 用途なら、まずは次の設定から始めます。

```bash
cd ~/local-ai/qwen36-mtplx-claude-code
uv run mtplx serve \
  --model ./models/Qwen3.6-27B-MTPLX-Optimized-Quality \
  --port 8080 \
  --max-tokens 32768 \
  --temp 0.6 \
  --top-p 0.95
```

Speed 版を試すなら、モデルパスだけ差し替えます。[web:236]

```bash
uv run mtplx serve \
  --model ./models/Qwen3.6-27B-MTPLX-Optimized-Speed \
  --port 8080 \
  --max-tokens 32768 \
  --temp 0.6 \
  --top-p 0.95
```

***

## Step 6: OpenAI 互換で単体テストする

Claude Code を載せる前に、推論本体が正常動作するか確認します。[file:241]

```bash
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-mtplx-local" \
  -d '{
    "model": "Qwen3.6-27B-MTPLX-Optimized-Quality",
    "messages": [
      {"role": "system", "content": "You are a senior Rust coding assistant."},
      {"role": "user", "content": "Write a Rust function that parses JSON into a struct using serde."}
    ],
    "max_tokens": 256,
    "temperature": 0.6
  }'
```

返答が返れば、推論レイヤは完成です。

***

## Step 7: MTPLX 用の .env を用意する

毎回コマンドを長く書きたくないなら、ルートに環境変数ファイルを置きます。

```bash
cd ~/local-ai/qwen36-mtplx-claude-code
cat > .env.mtplx <<'EOF'
MODEL_DIR=./models/Qwen3.6-27B-MTPLX-Optimized-Quality
MODEL_NAME=Qwen3.6-27B-MTPLX-Optimized-Quality
OPENAI_BASE_URL=http://127.0.0.1:8080/v1
OPENAI_API_KEY=sk-mtplx-local
MTPLX_PORT=8080
CLAUDE_PROXY_PORT=8082
EOF
```

読み込むときは:

```bash
set -a
source ./.env.mtplx
set +a
```

***

## Step 8: Claude Code proxy を clone する

proxy は upstream をそのまま使い、別 uv プロジェクトとして扱います。[web:258]

```bash
cd ~/local-ai/qwen36-mtplx-claude-code
git clone https://github.com/dbirks/claude-code-proxy.git
cd claude-code-proxy
```

***

## Step 9: proxy 側も uv でセットアップする

`claude-code-proxy` は `uv sync` ベースで扱えます。[web:258]

```bash
cd ~/local-ai/qwen36-mtplx-claude-code/claude-code-proxy
uv sync
```

必要なら Python バージョンも確認します。

```bash
uv python pin 3.12
uv sync
```

***

## Step 10: proxy の .env を作る

proxy 側の `.env` を作ります。考え方は以前と同じで、**Anthropic 互換の入口を受け、内部で OpenAI 互換の `http://127.0.0.1:8080/v1` に転送**します。[file:241][web:258]

```bash
cd ~/local-ai/qwen36-mtplx-claude-code/claude-code-proxy
cp .env.example .env
```

`.env` の例:

```dotenv
OPENAI_API_KEY=sk-mtplx-local
OPENAI_BASE_URL=http://127.0.0.1:8080/v1
MODEL=Qwen3.6-27B-MTPLX-Optimized-Quality
PROXY_PORT=8082
HOST=127.0.0.1
```

Speed 版なら `MODEL=Qwen3.6-27B-MTPLX-Optimized-Speed` に変えます。[web:236]

もし upstream 側が `OPENAI_MODEL` や `DEFAULT_MODEL` など別名を使うなら、その README を優先してください。[web:258]

***

## Step 11: proxy を uv run で起動する

ここも activate せず、`uv run` を使います。[web:258][web:260]

```bash
cd ~/local-ai/qwen36-mtplx-claude-code/claude-code-proxy
uv run uvicorn server:app --host 127.0.0.1 --port 8082 --reload
```

起動確認:

```bash
curl http://127.0.0.1:8082
```

***

## Step 12: Claude Code の環境変数を設定する

Claude Code をローカルの Anthropic 互換プロキシへ向けます。[file:241]

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8082
export ANTHROPIC_API_KEY=local-test-key
```

確認:

```bash
echo $ANTHROPIC_BASE_URL
echo $ANTHROPIC_API_KEY
```

永続化したければ `~/.zshrc` に追加します。[file:241]

```bash
cat >> ~/.zshrc <<'EOF'
export ANTHROPIC_BASE_URL=http://127.0.0.1:8082
export ANTHROPIC_API_KEY=local-test-key
EOF

source ~/.zshrc
```

***

## Step 13: Claude Code を起動して確認する

```bash
claude
```

あるいはワンショットで:

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:8082 \
ANTHROPIC_API_KEY=local-test-key \
claude
```

確認プロンプト例:

- “Summarize the files in this repository.”
- “Write a Rust function that parses a TOML config.”
- “Refactor this TypeScript function for readability.”

proxy 側ログと MTPLX 側ログの両方にリクエストが流れていれば成功です。[file:241]

***

## 常用のための起動順

毎回の起動はこの順です。

### ターミナル 1: MTPLX 推論サーバ

```bash
cd ~/local-ai/qwen36-mtplx-claude-code
uv run mtplx serve \
  --model ./models/Qwen3.6-27B-MTPLX-Optimized-Quality \
  --port 8080 \
  --max-tokens 32768 \
  --temp 0.6 \
  --top-p 0.95
```

### ターミナル 2: Claude Code proxy

```bash
cd ~/local-ai/qwen36-mtplx-claude-code/claude-code-proxy
uv run uvicorn server:app --host 127.0.0.1 --port 8082
```

### ターミナル 3: Claude Code

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8082
export ANTHROPIC_API_KEY=local-test-key
claude
```

***

## さらに uv らしくするための scripts 例

ルートの `pyproject.toml` にスクリプトを足すと、起動が短くなります。[web:257][web:260]

例えば `pyproject.toml` に次を追加します。

```toml
[project]
name = "qwen36-mtplx-claude-code"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "mtplx",
  "huggingface_hub",
  "hf_transfer",
]

[tool.uv]
package = false

[tool.uv.scripts]
serve-quality = "mtplx serve --model ./models/Qwen3.6-27B-MTPLX-Optimized-Quality --port 8080 --max-tokens 32768 --temp 0.6 --top-p 0.95"
serve-speed = "mtplx serve --model ./models/Qwen3.6-27B-MTPLX-Optimized-Speed --port 8080 --max-tokens 32768 --temp 0.6 --top-p 0.95"
inspect-quality = "mtplx inspect ./models/Qwen3.6-27B-MTPLX-Optimized-Quality"
```

その場合は:

```bash
uv run serve-quality
```

のように起動できます。使っている uv のバージョンで scripts の扱いが異なる場合は、`uv run <command>` をそのまま使う方が安全です。[web:260][web:263]

***

## 自動化

毎回 3 ターミナル開くのが面倒なら、スクリプト化できます。中で使うコマンドも **全部 uv run** にそろえます。[web:256][file:241]

```bash
mkdir -p ~/local-ai/bin
cat > ~/local-ai/bin/start-qwen-mtplx-uv.sh <<'EOS'
#!/usr/bin/env bash
set -euo pipefail

ROOT="$HOME/local-ai/qwen36-mtplx-claude-code"

osascript <<APPLESCRIPT
tell application "Terminal"
  do script "cd $ROOT && uv run mtplx serve --model ./models/Qwen3.6-27B-MTPLX-Optimized-Quality --port 8080 --max-tokens 32768 --temp 0.6 --top-p 0.95"
  do script "cd $ROOT/claude-code-proxy && uv run uvicorn server:app --host 127.0.0.1 --port 8082"
  do script "export ANTHROPIC_BASE_URL=http://127.0.0.1:8082; export ANTHROPIC_API_KEY=local-test-key; claude"
end tell
APPLESCRIPT
EOS

chmod +x ~/local-ai/bin/start-qwen-mtplx-uv.sh
```

実行:

```bash
~/local-ai/bin/start-qwen-mtplx-uv.sh
```

***

## 推奨チューニング

Claude Code で使う場合、次の方針が実用的です。

- **最初のモデル**: `Youssofal/Qwen3.6-27B-MTPLX-Optimized-Quality`[web:235]
- **速度比較候補**: `Youssofal/Qwen3.6-27B-MTPLX-Optimized-Speed`[web:236]
- **ランナー**: `uv run mtplx serve` もしくはモデルカード記載のサーバコマンド[web:199][web:236]
- **コンテキスト上限**: 32K までに抑える
- **温度**: 0.6 前後
- **用途**: Rust/TS/Python のコード生成、編集、要約、差分提案

最初は Quality 版、次に Speed 版で比較、という順が安全です。[web:235][web:236]

***

## 問題が起きやすい点

### 1. `uv run mtplx serve` が動かない

`mtplx` の配布形態や CLI 名が変わっている可能性があります。まず次を確認してください。

```bash
cd ~/local-ai/qwen36-mtplx-claude-code
uv run mtplx --help
```

それでもだめなら、モデルカードや README の起動例を確認してください。[web:206][web:236]

### 2. `huggingface-cli` が非推奨と表示される

最近は `hf download ...` が推奨されることがあります。環境に合わせて次のように読み替えて構いません。

```bash
hf download Youssofal/Qwen3.6-27B-MTPLX-Optimized-Quality \
  --local-dir ./models/Qwen3.6-27B-MTPLX-Optimized-Quality
```

### 3. Claude Code がつながらない

`ANTHROPIC_BASE_URL` の先が正しいか確認してください。[file:241]

```bash
echo $ANTHROPIC_BASE_URL
curl http://127.0.0.1:8082
```

### 4. proxy は起動しているが応答しない

proxy が `OPENAI_BASE_URL=http://127.0.0.1:8080/v1` を見ているか、またモデル名が合っているか確認します。[file:241][web:258]

### 5. M2 32GB で重い

MTPLX でも 27B は重いので、まずは次を試してください。

- 他の重いアプリを閉じる
- `--max-tokens 16384` に下げる
- Quality 版で安定性を見る
- Speed 版は Quality 版より後に試す

### 6. 期待したほど速くない

MTPLX の公開ベンチには M5 Max での値が含まれますが、M2 32GB ではそれより低くなるのが普通です。`mlx-optiq --mtp` 比でどれだけ改善するかを、同一プロンプトで比較してください。[web:173][web:209]

***

## 代替運用

実運用では、**本命を MTPLX Quality 版にし、バックアップとして元の `mlx-optiq` 環境も残す** のが堅実です。もし MTPLX 側で特定タスクだけ不安定なら、すぐ戻せます。[file:241][web:201]

***

## 最終的な最短コマンド一覧

```bash
brew install python@3.12 git uv node
npm install -g @anthropic-ai/claude-code

mkdir -p ~/local-ai/qwen36-mtplx-claude-code
cd ~/local-ai/qwen36-mtplx-claude-code
uv init --app --python 3.12
uv add mtplx huggingface_hub hf_transfer
uv sync

export HF_HUB_ENABLE_HF_TRANSFER=1
huggingface-cli download \
  Youssofal/Qwen3.6-27B-MTPLX-Optimized-Quality \
  --local-dir ./models/Qwen3.6-27B-MTPLX-Optimized-Quality
```

```bash
cd ~/local-ai/qwen36-mtplx-claude-code
uv run mtplx serve \
  --model ./models/Qwen3.6-27B-MTPLX-Optimized-Quality \
  --port 8080 \
  --max-tokens 32768 \
  --temp 0.6 \
  --top-p 0.95
```

```bash
cd ~/local-ai/qwen36-mtplx-claude-code
git clone https://github.com/dbirks/claude-code-proxy.git
cd claude-code-proxy
uv sync
cp .env.example .env
```

`.env`:

```dotenv
OPENAI_API_KEY=sk-mtplx-local
OPENAI_BASE_URL=http://127.0.0.1:8080/v1
MODEL=Qwen3.6-27B-MTPLX-Optimized-Quality
PROXY_PORT=8082
HOST=127.0.0.1
```

```bash
cd ~/local-ai/qwen36-mtplx-claude-code/claude-code-proxy
uv run uvicorn server:app --host 127.0.0.1 --port 8082
```

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8082
export ANTHROPIC_API_KEY=local-test-key
claude
```
