"""Exhaustive Negative & Bypass Tests for Database Target Safety Guard (Python)."""

import pytest

from api.db.database_guard import (
    ProductionDatabaseTargetError,
    UnsafeDatabaseTargetError,
    assert_safe_database_target,
    is_production_database_target,
)

PRODUCTION_TARGETS = [
    # Standard Neon pooled and direct endpoints
    "postgresql://neondb_owner:secret@ep-wispy-truth-b5kkygdq-pooler.c-2.us-east-1.aws.neon.tech/ai_calling_os?sslmode=require",
    "postgresql+asyncpg://ai_calling_owner:secret@ep-wispy-truth-b5kkygdq.c-7.us-east-2.aws.neon.tech/ai_calling_os?sslmode=require",
    "postgresql://business_app_user:secret@ep-wispy-truth-b5kkygdq.c-7.us-east-2.aws.neon.tech/ai_calling_os?sslmode=require",
    # Branch reference
    "postgresql://user:pass@ep-wispy-truth-b5kkygdq.aws.neon.tech/br-twilight-base-b51aowww",
    # Case evasion
    "POSTGRESQL://USER:PASS@EP-WISPY-TRUTH-B5KKYGDQ-POOLER.C-2.US-EAST-1.AWS.NEON.TECH/AI_CALLING_OS",
    # URL-encoded evasion
    "postgresql://user:pass@ep%2Dwispy%2Dtruth%2Db5kkygdq.aws.neon.tech/ai_calling_os",
    # Query parameter evasion
    "postgresql://user:pass@ep-wispy-truth-b5kkygdq.aws.neon.tech/ai_calling_os?dummy=test",
    "postgresql://test_user:pass@ep-wispy-truth-b5kkygdq.aws.neon.tech/ai_calling_os_test",
    # Bare hostnames
    "ep-wispy-truth-b5kkygdq.c-7.us-east-2.aws.neon.tech",
    "br-twilight-base-b51aowww",
]


@pytest.mark.parametrize("target", PRODUCTION_TARGETS)
def test_detects_all_production_variants(target):
    assert is_production_database_target(target) is True


@pytest.mark.parametrize("target", PRODUCTION_TARGETS)
def test_strictly_blocks_production_in_test(target):
    with pytest.raises(ProductionDatabaseTargetError):
        assert_safe_database_target(target, context="test")


def test_rejects_production_even_when_allow_isolated_set(monkeypatch):
    monkeypatch.setenv("ALLOW_ISOLATED_TEST_DB", "true")
    target = "postgresql://user:pass@ep-wispy-truth-b5kkygdq.aws.neon.tech/ai_calling_os?target=test"
    with pytest.raises(ProductionDatabaseTargetError):
        assert_safe_database_target(target, context="test")


def test_rejects_empty_target_in_test():
    with pytest.raises(UnsafeDatabaseTargetError):
        assert_safe_database_target("", context="test")


def test_rejects_unapproved_remote_host_in_test(monkeypatch):
    monkeypatch.delenv("ALLOW_ISOLATED_TEST_DB", raising=False)
    with pytest.raises(UnsafeDatabaseTargetError):
        assert_safe_database_target(
            "postgresql://user:pass@some-random-host.aws.neon.tech/test_db",
            context="test",
        )


def test_allows_localhost_target_in_test():
    # Should not raise
    assert_safe_database_target(
        "postgresql://business_app_user:pass@localhost:5432/acuity_test_isolated",
        context="test",
    )


def test_allows_ephemeral_branch_when_explicitly_authorized(monkeypatch):
    monkeypatch.setenv("ALLOW_ISOLATED_TEST_DB", "true")
    # Non-production test branch on Neon
    ephemeral = "postgresql://test_user:pass@ep-staging-test-4321.us-east-1.aws.neon.tech/ai_calling_os_test"
    assert_safe_database_target(ephemeral, context="test")
