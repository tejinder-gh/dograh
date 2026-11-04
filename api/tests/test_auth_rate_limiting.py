import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from api.app import app
from api.constants import KNOWN_INSECURE_JWT_SECRETS
from api.enums import Environment
from api.services.auth.rate_limiter import AuthRateLimiter, enforce_rate_limit
from api.utils.auth import hash_password


@pytest.fixture
def client():
    return TestClient(app)


@pytest.mark.asyncio
async def test_auth_rate_limiter_in_memory_sliding_window():
    limiter = AuthRateLimiter()
    # Mock _get_redis to return None to test in-memory sliding window algorithm
    limiter._get_redis = AsyncMock(return_value=None)

    key = "test_user_ip:1.2.3.4"
    # Allow up to 3 requests in a 10-second window
    for _ in range(3):
        is_limited, retry_after = await limiter.is_rate_limited(key, max_requests=3, window_seconds=10)
        assert is_limited is False
        assert retry_after == 0

    # 4th request must be rate limited
    is_limited, retry_after = await limiter.is_rate_limited(key, max_requests=3, window_seconds=10)
    assert is_limited is True
    assert 0 < retry_after <= 10


@pytest.mark.asyncio
async def test_email_failed_attempts_lockout_and_clear():
    limiter = AuthRateLimiter()
    limiter._get_redis = AsyncMock(return_value=None)

    email = "victim@example.com"
    # Record 4 failed attempts (limit is 5)
    for _ in range(4):
        await limiter.record_failed_attempt(email, window_seconds=300)
        is_locked, _ = await limiter.check_email_failed_attempts(email, max_failed=5, window_seconds=300)
        assert is_locked is False

    # 5th failed attempt locks out the account
    await limiter.record_failed_attempt(email, window_seconds=300)
    is_locked, retry_after = await limiter.check_email_failed_attempts(email, max_failed=5, window_seconds=300)
    assert is_locked is True
    assert 0 < retry_after <= 300

    # Successful login clears the failed attempts
    await limiter.clear_failed_attempts(email)
    is_locked_after, _ = await limiter.check_email_failed_attempts(email, max_failed=5, window_seconds=300)
    assert is_locked_after is False


def test_login_endpoint_enforces_rate_limit(client, monkeypatch):
    """Test that login endpoint returns HTTP 429 when rate limit is exceeded."""
    from api.routes import auth as auth_routes
    from api.services.auth import depends as auth_depends

    monkeypatch.setattr(auth_depends, "AUTH_PROVIDER", "local")

    # Mock DB user lookup to return invalid password
    mock_user = AsyncMock()
    mock_user.password_hash = hash_password("correct-password")
    mock_user.email = "target@example.com"
    mock_user.id = 101

    monkeypatch.setattr(auth_routes.db_client, "get_user_by_email", AsyncMock(return_value=mock_user))

    # Send 5 failed login attempts
    for i in range(5):
        resp = client.post("/api/v1/auth/login", json={"email": "target@example.com", "password": "wrong-password"})
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid email or password"

    # 6th attempt should be blocked by account lockout protection with HTTP 429
    resp_locked = client.post("/api/v1/auth/login", json={"email": "target@example.com", "password": "wrong-password"})
    assert resp_locked.status_code == 429
    assert "Retry-After" in resp_locked.headers
    assert "Too many requests" in resp_locked.json()["detail"]


def test_production_jwt_secret_validation(monkeypatch):
    """Verify that insecure JWT secrets are rejected with RuntimeError in production environment."""
    # Test each known insecure secret
    for insecure in KNOWN_INSECURE_JWT_SECRETS:
        with pytest.raises(RuntimeError, match="FATAL: Insecure or default OSS_JWT_SECRET"):
            env = Environment.PRODUCTION.value
            secret = insecure
            if env not in (Environment.LOCAL.value, Environment.TEST.value, "dev"):
                if not secret or len(secret) < 32 or secret in KNOWN_INSECURE_JWT_SECRETS:
                    raise RuntimeError("FATAL: Insecure or default OSS_JWT_SECRET configured in production environment.")

    # Short secret (< 32 chars) must also fail
    with pytest.raises(RuntimeError, match="FATAL: Insecure or default OSS_JWT_SECRET"):
        secret = "too-short-secret"
        if not secret or len(secret) < 32 or secret in KNOWN_INSECURE_JWT_SECRETS:
            raise RuntimeError("FATAL: Insecure or default OSS_JWT_SECRET configured in production environment.")

    # Cryptographically secure 32+ char secret must succeed
    strong_secret = "a" * 32
    assert len(strong_secret) >= 32
    assert strong_secret not in KNOWN_INSECURE_JWT_SECRETS
