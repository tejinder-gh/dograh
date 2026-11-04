from fastapi import APIRouter, Depends, HTTPException, Request

from api.constants import ENABLE_SIGNUP
from api.db import db_client
from api.db.models import UserModel
from api.enums import PostHogEvent
from api.schemas.auth import AuthResponse, LoginRequest, SignupRequest, UserResponse
from api.services.auth.depends import get_user, require_local_auth
from api.services.auth.rate_limiter import auth_rate_limiter, enforce_rate_limit
from api.services.organization_bootstrap import ensure_organization_bootstrapped
from api.services.posthog_client import capture_event
from api.utils.auth import create_jwt_token, hash_password, verify_password

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)


@router.post(
    "/signup",
    response_model=AuthResponse,
    dependencies=[Depends(require_local_auth)],
)
async def signup(request: SignupRequest, raw_request: Request):
    if not ENABLE_SIGNUP:
        raise HTTPException(status_code=403, detail="Signup is disabled")

    # Enforce IP-based rate limiting on signup (max 5 per 5 minutes per IP)
    client_ip = auth_rate_limiter.get_client_ip(raw_request)
    is_limited, retry_after = await auth_rate_limiter.is_rate_limited(
        key=f"signup_ip:{client_ip}",
        max_requests=5,
        window_seconds=300,
    )
    enforce_rate_limit(is_limited, retry_after)

    # Check if email is already taken
    existing_user = await db_client.get_user_by_email(request.email)
    if existing_user:
        raise HTTPException(status_code=409, detail="Email already registered")

    # Hash password and create user
    hashed = hash_password(request.password)
    user = await db_client.create_user_with_email(
        email=request.email,
        password_hash=hashed,
        name=request.name,
    )

    # Create organization for the user
    org_provider_id = f"org_{user.provider_id}"
    organization, _ = await db_client.get_or_create_organization_by_provider_id(
        org_provider_id=org_provider_id, user_id=user.id
    )

    # Link user to organization
    await db_client.add_user_to_organization(user.id, organization.id)
    await db_client.update_user_selected_organization(user.id, organization.id)

    # Create default service configuration. This never raises, so signup still
    # succeeds if MPS is down; `_handle_oss_auth` re-enters bootstrap on the
    # user's subsequent authenticated requests, so a failure here is recovered
    # rather than permanent. Doing it here anyway means the common case has a
    # model configuration and SIP connectivity by the time the UI first loads.
    await ensure_organization_bootstrapped(
        organization.id,
        created_by=user.provider_id,
    )

    # Create JWT token
    token = create_jwt_token(user.id, request.email)

    capture_event(
        distinct_id=str(user.provider_id),
        event=PostHogEvent.SIGNED_UP,
        properties={
            "organization_id": organization.id,
            "auth_provider": "local",
        },
    )

    return AuthResponse(
        token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=request.name,
            organization_id=organization.id,
            provider_id=user.provider_id,
        ),
    )


@router.post(
    "/login",
    response_model=AuthResponse,
    dependencies=[Depends(require_local_auth)],
)
async def login(request: LoginRequest, raw_request: Request):
    client_ip = auth_rate_limiter.get_client_ip(raw_request)

    # 1. Enforce IP rate limiting on login (max 15 attempts per minute per IP)
    is_ip_limited, ip_retry_after = await auth_rate_limiter.is_rate_limited(
        key=f"login_ip:{client_ip}",
        max_requests=15,
        window_seconds=60,
    )
    enforce_rate_limit(is_ip_limited, ip_retry_after)

    # 2. Enforce targeted email lockout protection (max 5 failed attempts per 5 minutes per email)
    is_email_locked, email_retry_after = await auth_rate_limiter.check_email_failed_attempts(
        email=request.email,
        max_failed=5,
        window_seconds=300,
    )
    enforce_rate_limit(is_email_locked, email_retry_after)

    # Look up user by email
    user = await db_client.get_user_by_email(request.email)
    if not user or not user.password_hash:
        await auth_rate_limiter.record_failed_attempt(request.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Verify password
    if not verify_password(request.password, user.password_hash):
        await auth_rate_limiter.record_failed_attempt(request.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Authentication succeeded: clear failed attempts for this email
    await auth_rate_limiter.clear_failed_attempts(request.email)

    # Create JWT token
    token = create_jwt_token(user.id, user.email)

    capture_event(
        distinct_id=str(user.provider_id),
        event=PostHogEvent.SIGNED_IN,
        properties={
            "organization_id": user.selected_organization_id,
            "auth_provider": "local",
        },
    )

    return AuthResponse(
        token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            organization_id=user.selected_organization_id,
            provider_id=user.provider_id,
            is_superuser=bool(getattr(user, "is_superuser", False)),
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user(user: UserModel = Depends(get_user)):
    return UserResponse(
        id=user.id,
        email=user.email,
        organization_id=user.selected_organization_id,
        provider_id=user.provider_id,
        is_superuser=bool(getattr(user, "is_superuser", False)),
    )
