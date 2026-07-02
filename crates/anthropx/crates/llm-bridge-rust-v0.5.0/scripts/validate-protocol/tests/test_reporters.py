"""Tests for reporters module."""

from __future__ import annotations

import json
from pathlib import Path

from reporters import FixtureResult, generate_report, write_json_report
from validators import FieldError, ValidationResult


# ---------------------------------------------------------------------------
# generate_report tests
# ---------------------------------------------------------------------------


def test_generate_report_all_pass() -> None:
    """全部通过的 fixture 生成正确报告"""
    results = [
        FixtureResult(
            fixture_name="test-basic",
            direction="anthropic-to-openai",
            transform_ok=True,
            structure_result=ValidationResult(passed=True),
            semantic_notes=["litellm comparison skipped"],
        ),
        FixtureResult(
            fixture_name="test-tool-use",
            direction="anthropic-to-openai",
            transform_ok=True,
            structure_result=ValidationResult(passed=True),
            semantic_notes=[],
        ),
    ]
    report = generate_report(results)
    assert "test-basic" in report
    assert "test-tool-use" in report
    assert "PASS" in report or "通过" in report


def test_generate_report_with_failure() -> None:
    """包含失败 fixture 的报告"""
    results = [
        FixtureResult(
            fixture_name="bad-fixture",
            direction="openai-to-anthropic",
            transform_ok=False,
            transform_error="exit code 1",
            structure_result=None,
            semantic_notes=None,
        ),
    ]
    report = generate_report(results)
    assert "bad-fixture" in report
    assert "FAIL" in report or "失败" in report


def test_generate_report_shows_summary_counts() -> None:
    """报告摘要包含通过/失败/跳过计数"""
    results = [
        FixtureResult(
            fixture_name="pass-case",
            direction="anthropic-to-openai",
            transform_ok=True,
            structure_result=ValidationResult(passed=True),
        ),
        FixtureResult(
            fixture_name="fail-case",
            direction="openai-to-anthropic",
            transform_ok=False,
            transform_error="timeout",
            structure_result=None,
        ),
        FixtureResult(
            fixture_name="skip-case",
            direction="anthropic-to-openai",
            transform_ok=True,
            structure_result=None,
            skipped=True,
            skip_reason="no expected output",
        ),
    ]
    report = generate_report(results)
    assert "1 passed" in report
    assert "1 failed" in report
    assert "1 skipped" in report


def test_generate_report_with_structure_errors() -> None:
    """结构验证错误在报告中显示详情"""
    results = [
        FixtureResult(
            fixture_name="bad-structure",
            direction="anthropic-to-openai",
            transform_ok=True,
            structure_result=ValidationResult(
                passed=False,
                errors=[
                    FieldError(
                        path="messages[0].content",
                        error_type="type_error",
                        expected="array",
                    ),
                ],
            ),
        ),
    ]
    report = generate_report(results)
    assert "bad-structure" in report
    assert "messages[0].content" in report
    assert "type_error" in report


def test_generate_report_with_warnings() -> None:
    """结构验证警告在报告中显示"""
    results = [
        FixtureResult(
            fixture_name="with-warnings",
            direction="anthropic-to-openai",
            transform_ok=True,
            structure_result=ValidationResult(
                passed=True,
                warnings=["openai SDK not available"],
            ),
        ),
    ]
    report = generate_report(results)
    assert "WARNING" in report
    assert "openai SDK not available" in report


# ---------------------------------------------------------------------------
# write_json_report tests
# ---------------------------------------------------------------------------


def test_write_json_report(tmp_path: Path) -> None:
    """JSON 报告正确写入"""
    results = [
        FixtureResult(
            fixture_name="test-basic",
            direction="anthropic-to-openai",
            transform_ok=True,
            structure_result=ValidationResult(passed=True),
            semantic_notes=["no comparison"],
        ),
    ]
    path = tmp_path / "report.json"
    write_json_report(results, path)
    assert path.exists()
    data = json.loads(path.read_text())
    assert len(data) == 1
    assert data[0]["fixture_name"] == "test-basic"


def test_write_json_report_creates_parent_dirs(tmp_path: Path) -> None:
    """JSON 报告自动创建父目录"""
    results = [
        FixtureResult(
            fixture_name="test-basic",
            direction="anthropic-to-openai",
            transform_ok=True,
            structure_result=ValidationResult(passed=True),
        ),
    ]
    path = tmp_path / "subdir" / "nested" / "report.json"
    write_json_report(results, path)
    assert path.exists()


def test_write_json_report_with_errors(tmp_path: Path) -> None:
    """JSON 报告包含结构验证错误详情"""
    results = [
        FixtureResult(
            fixture_name="bad-structure",
            direction="anthropic-to-openai",
            transform_ok=True,
            structure_result=ValidationResult(
                passed=False,
                errors=[
                    FieldError(
                        path="messages[0].content",
                        error_type="type_error",
                        expected="array",
                    ),
                ],
                warnings=["SDK unavailable"],
            ),
        ),
    ]
    path = tmp_path / "report.json"
    write_json_report(results, path)
    data = json.loads(path.read_text())
    assert len(data) == 1
    assert data[0]["structure_passed"] is False
    assert len(data[0]["structure_errors"]) == 1
    assert data[0]["structure_errors"][0]["path"] == "messages[0].content"
    assert data[0]["structure_warnings"] == ["SDK unavailable"]


def test_write_json_report_skipped(tmp_path: Path) -> None:
    """JSON 报告包含跳过信息"""
    results = [
        FixtureResult(
            fixture_name="skipped-case",
            direction="anthropic-to-openai",
            transform_ok=True,
            skipped=True,
            skip_reason="no expected output",
        ),
    ]
    path = tmp_path / "report.json"
    write_json_report(results, path)
    data = json.loads(path.read_text())
    assert data[0]["skipped"] is True
    assert data[0]["skip_reason"] == "no expected output"
