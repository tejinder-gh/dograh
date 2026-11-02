import pytest


@pytest.mark.asyncio
async def test_user_email_writes_lowercase_and_looks_up_case_insensitively(
    db_session,
):
    user = await db_session.create_user_with_email(
        email="User@Example.COM",
        password_hash="hashed-password",
    )

    assert user.email == "user@example.com"

    fetched = await db_session.get_user_by_email("USER@example.com")

    assert fetched is not None
    assert fetched.id == user.id
    assert fetched.email == "user@example.com"


@pytest.mark.asyncio
async def test_update_user_password_updates_hash(db_session):
    user = await db_session.create_user_with_email(
        email="password_test@example.com",
        password_hash="old-hash",
    )
    assert user.password_hash == "old-hash"

    await db_session.update_user_password(user.id, "new-hash")
    updated = await db_session.get_user_by_email("password_test@example.com")
    assert updated is not None
    assert updated.password_hash == "new-hash"
