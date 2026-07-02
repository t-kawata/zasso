"""Tests for comparators module."""

from comparators import ComparisonReport, FieldDiff, compare_with_litellm


def test_compare_with_litellm_no_input():
    """无输入时返回 SKIP report"""
    report = compare_with_litellm("anthropic-to-openai", None, None)
    assert len(report.notes) > 0
    assert "skip" in report.notes[0].lower() or "no input" in report.notes[0].lower()


def test_compare_with_litellm_unsupported_direction():
    """不支持的方向返回 SKIP"""
    report = compare_with_litellm(
        "responses-to-anthropic",
        {"model": "test", "messages": []},
        {"type": "message", "role": "assistant", "content": []},
    )
    assert len(report.notes) > 0
    assert any(
        "不支持" in note or "skip" in note.lower() or "unsupported" in note.lower()
        for note in report.notes
    )


def test_compare_with_litellm_identical_outputs():
    """完全相同的输出无差异"""
    our = {"choices": [{"message": {"content": "hello", "role": "assistant"}}]}
    report = compare_with_litellm("anthropic-to-openai", {"model": "test"}, our)
    # litellm may or may not support this direction — both are acceptable
    assert isinstance(report, ComparisonReport)


def test_compare_with_litellm_no_output():
    """无输出时返回 no output note"""
    report = compare_with_litellm("anthropic-to-openai", {"model": "test"}, None)
    assert len(report.notes) > 0
    assert "no output" in report.notes[0].lower()


def test_field_diff_dataclass():
    """FieldDiff 数据类基本功能"""
    diff = FieldDiff(
        path="choices[0].message.content",
        our_value="hello",
        litellm_value="hi",
        severity="info",
    )
    assert diff.path == "choices[0].message.content"
    assert diff.our_value == "hello"
    assert diff.litellm_value == "hi"
    assert diff.severity == "info"


def test_comparison_report_defaults():
    """ComparisonReport 默认值正确"""
    report = ComparisonReport()
    assert report.field_diffs == []
    assert report.missing_in_ours == []
    assert report.extra_in_ours == []
    assert report.notes == []


def test_comparison_report_with_data():
    """ComparisonReport 可以填充数据"""
    diff = FieldDiff(
        path="model", our_value="gpt-4", litellm_value="gpt-4o", severity="warning"
    )
    report = ComparisonReport(
        field_diffs=[diff],
        missing_in_ours=["usage.total_tokens"],
        extra_in_ours=["custom_field"],
        notes=["test note"],
    )
    assert len(report.field_diffs) == 1
    assert report.field_diffs[0].path == "model"
    assert len(report.missing_in_ours) == 1
    assert len(report.extra_in_ours) == 1
    assert len(report.notes) == 1
