"""Database Target Safety Guard.

Strict enforcement to prevent integration tests, pytest test runners, or unapproved
operations from connecting to or mutating production database infrastructure
(specifically Neon branch br-twilight-base-b51aowww / ep-wispy-truth-b5kkygdq).
"""

import os
import re
from typing import Optional
from urllib.parse import urlparse


class ProductionDatabaseTargetError(Exception):
    """Raised when an operation attempts to connect to the production Neon database."""
    pass


class UnsafeDatabaseTargetError(Exception):
    """Raised when tests attempt to run against an unverified remote database."""
    pass


PRODUCTION_HOST_PATTERNS = [
    "ep-wispy-truth-b5kkygdq",
    "br-twilight-base-b51aowww",
    "ai_calling_owner",
]

LOCAL_SAFE_HOSTS = {"localhost", "127.0.0.1", "postgres", "::1"}


def mask_connection_string(conn_str: str) -> str:
    """Mask password credentials in connection strings."""
    return re.sub(r":([^@]+)@", ":***@", conn_str)


def extract_database_host(target: Optional[str]) -> str:
    """Extract hostname from database connection string or host."""
    if not target:
        return ""
    trimmed = target.strip()
    if "://" in trimmed:
        try:
            # Strip dialect like postgresql+asyncpg:// to postgresql:// for standard urllib parsing
            normalized = re.sub(r"^[a-zA-Z0-9_+]+://", "postgresql://", trimmed)
            parsed = urlparse(normalized)
            return (parsed.hostname or "").lower()
        except Exception:
            match = re.search(r"@([^/:?]+)", trimmed)
            return match.group(1).lower() if match else ""
    return trimmed.split(":")[0].lower()


def is_production_database_target(target: Optional[str]) -> bool:
    """Check if the connection string or host targets production infrastructure."""
    if not target:
        return False
    lower = target.lower()
    return any(pattern in lower for pattern in PRODUCTION_HOST_PATTERNS)


def is_local_safe_target(target: Optional[str]) -> bool:
    """Check if the connection string targets local development/test containers."""
    if not target:
        return False
    host = extract_database_host(target)
    return host in LOCAL_SAFE_HOSTS


def assert_safe_database_target(
    target: Optional[str] = None,
    context: str = "runtime",
) -> None:
    """Authoritative validation of database targets.
    
    Raises ProductionDatabaseTargetError or UnsafeDatabaseTargetError if an
    unsafe target is detected during test execution.
    """
    is_test_env = (
        context == "test"
        or os.getenv("ENVIRONMENT") == "test"
        or "pytest" in os.getenv("_", "")
        or "PYTEST_CURRENT_TEST" in os.environ
    )

    db_target = target or os.getenv("DATABASE_URL", "")

    # 1. Deny tests against production database
    if is_production_database_target(db_target):
        if is_test_env:
            masked = mask_connection_string(db_target)
            raise ProductionDatabaseTargetError(
                f"[DATABASE SAFETY VIOLATION] Refusing connection to production database: {masked}. "
                "Automated test execution against the production Neon database branch is strictly blocked."
            )

    # 2. In test mode, only permit verified local or explicitly authorized test branches
    if is_test_env:
        allow_isolated = (
            os.getenv("ALLOW_ISOLATED_TEST_DB") == "true"
            and "test" in db_target.lower()
        )
        if not is_local_safe_target(db_target) and not allow_isolated:
            masked = mask_connection_string(db_target)
            raise UnsafeDatabaseTargetError(
                f"[DATABASE SAFETY VIOLATION] Unsafe database target rejected: {masked}. "
                "Integration tests must run against an authorized isolated test database "
                "(e.g. localhost/test_db or an ephemeral test branch with ALLOW_ISOLATED_TEST_DB=true)."
            )
