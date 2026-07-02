"""End-to-end smoke test for the full validation pipeline.

Exercises the entire pipeline: fixture loading, Rust core transform,
structure validation, and report generation.
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path


def test_e2e_smoke_with_temp_fixture():
    """端到端测试：构造临时 fixture，完整跑一遍验证流程"""
    # 1. 创建临时 fixture 目录
    tmp_root = Path(tempfile.mkdtemp())
    sub = tmp_root / "anthropic-to-openai"
    sub.mkdir(parents=True)

    fixture = {
        "name": "smoke-test-basic",
        "mode": "non_stream",
        "notes": "e2e smoke test",
        "input": {
            "headers": {"x-api-key": "test-key-12345"},
            "path": "/v1/messages",
            "body": {
                "model": "claude-3-opus",
                "max_tokens": 100,
                "system": "You are a helpful assistant.",
                "messages": [
                    {"role": "user", "content": [{"type": "text", "text": "hi"}]}
                ],
            },
        },
        "expected": {
            "path": "/v1/chat/completions",
            "body": {"model": "claude-3-opus"},
        },
    }
    (sub / "smoke-test.json").write_text(json.dumps(fixture), encoding="utf-8")

    # 2. 运行验证（需要 Rust CLI 已编译）
    #    使用 python cli.py 而非 python -m validate_protocol,
    #    因为目录名含连字符，不是合法的 Python 模块名。
    cwd = str(Path(__file__).resolve().parent.parent)
    result = subprocess.run(
        [
            sys.executable,
            "cli.py",
            "--fixture-root",
            str(tmp_root),
            "--output-dir",
            str(tmp_root / "output"),
        ],
        capture_output=True,
        text=True,
        cwd=cwd,
        timeout=120,
    )

    # 3. 验证
    stdout = result.stdout
    stderr_str = result.stderr
    print("STDOUT:", stdout)
    print("STDERR:", stderr_str)

    assert "smoke-test-basic" in stdout, (
        f"Expected 'smoke-test-basic' in stdout\n"
        f"stdout: {stdout}\nstderr: {stderr_str}"
    )
    # exit code 0 = all passed
    assert result.returncode == 0, (
        f"Expected exit 0, got {result.returncode}\n"
        f"stdout: {stdout}\nstderr: {stderr_str}"
    )
