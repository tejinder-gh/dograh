"""Unit tests for Python Database Target Safety Guard."""

import os
import pytest
from api.db.database_guard import (
    assert_safe_database_target,
    is_production_database_target,
    is_local_safe_target,
    extract_database_host,
    ProductionDatabaseTargetError,
    UnsafeDatabaseTargetError,
)


def test_extract_database_host():
    assert extract_database_host("postgresql+asyncpg://user:pass@localhost:5432/test_db") == "localhost"
    assert extract_database_host("postgresql://postgres:secret@127.0.0.1:5432/mydb") == "127.0.0.1"
    assert extract_database_host("postgresql://user:pass@ep-remote.neon.tech/test_db") == "ep-remote.neon.tech"
    assert extract_database_host("localhost") == "localhost"


def test_is_production_database_target():
    prod_url = "postgresql+asyncpg://ai_calling_owner:secret@ep-wispy-truth-b5kkygdq.c-7.us-east-2.aws.neon.tech/ai_calling_os?sslmode=require"
    assert is_production_database_target(prod_url) is True

    branch_url = "postgresql://user:pass@some-host/db?branch=br-twilight-base-b51aowww"
    assert is_production_database_target(branch_url) is True

    user_url = "postgresql://ai_calling_owner:pass@remote-host/db"
    assert is_production_database_target(user_url) is True

    local_url = "postgresql+asyncpg://postgres:postgres@localhost:5432/test_db"
    assert is_production_database_target(local_url) is False


def test_is_local_safe_target():
    assert is_local_safe_target("postgresql+asyncpg://postgres:postgres@localhost:5432/test_db") is True
    assert is_local_safe_target("postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/test_db") is True
    assert is_local_safe_target("postgresql://user:pass@remote-cloud.com/test_db") is False


def test_assert_safe_database_target_rejects_production_in_test(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "test")
    prod_url = "postgresql+asyncpg://ai_calling_owner:secret@ep-wispy-truth-b5kkygdq.c-7.us-east-2.aws.neon.tech/ai_calling_os"
    with pytest.raises(ProductionDatabaseTargetError) as exc_info:
        assert_safe_database_target(prod_url, context="test")
    assert "strictly blocked" in str(exc_info.value)


def test_assert_safe_database_target_rejects_unapproved_remote(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.delenv("ALLOW_ISOLATED_TEST_DB", raising=False)
    remote_url = "postgresql://test_user:pass@ep-unknown.neon.tech/test_db"
    with pytest.raises(UnsafeDatabaseTargetError) as exc_info:
        assert_safe_database_target(remote_url, context="test")
    assert "Unsafe database target rejected" in str(exc_info.value)


def test_assert_safe_database_target_allows_localhost_in_test(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "test")
    local_url = "postgresql+asyncpg://postgres:postgres@localhost:5432/test_db"
    # Should not raise
    assert_safe_database_target(local_url, context="test")


def test_assert_safe_database_target_allows_explicit_isolated_branch(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("ALLOW_ISOLATED_TEST_DB", "true")
    isolated_branch_url = "postgresql://test_user:pass@ep-isolated-test.neon.tech/test_db"
    # Should not raise when explicitly authorized with test in branch/host
    assert_safe_database_target(isolated_branch_url, context="test")
