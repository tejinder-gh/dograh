import pytest
from unittest.mock import AsyncMock, MagicMock
from api.tasks.run_integrations import sync_call_to_crm


@pytest.mark.asyncio
async def test_sync_call_to_crm_creates_interaction_and_updates_contact(monkeypatch):
    """Verify that completed call runs are recorded in CRM with contact linkage."""
    from api.tasks import run_integrations

    mock_run = MagicMock()
    mock_run.id = 1001
    mock_run.workflow_id = 42
    mock_run.definition_id = 99
    mock_run.status = "completed"
    mock_run.campaign_id = None
    mock_run.usage_info = {"call_duration_seconds": 125}
    mock_run.gathered_context = {
        "phone_number": "+14155551234",
        "call_summary": "Prospect requested product demo.",
        "transcript": [{"role": "agent", "content": "Hello"}],
    }
    mock_run.annotations = {
        "sentiment_score": 75,
        "sentiment_category": "positive",
    }
    mock_run.extra = {}

    queries_executed = []

    async def mock_execute(sql, params=None):
        queries_executed.append((sql.strip(), params or {}))
        if "FROM business_ext.organization_mappings" in sql:
            return [{"business_tenant_id": "11111111-1111-1111-1111-111111111111"}]
        if "FROM business_ext.interactions" in sql:
            return []  # Not previously recorded
        if "FROM business_ext.contacts" in sql:
            return [{"id": "c1111111-1111-1111-1111-111111111111", "lifecycle_status": "calling"}]
        return []

    monkeypatch.setattr(run_integrations.db_client, "execute_raw_query", mock_execute)

    await sync_call_to_crm(mock_run, organization_id=7)

    # Verify interaction was inserted
    insert_queries = [q for q in queries_executed if "INSERT INTO business_ext.interactions" in q[0]]
    assert len(insert_queries) == 1
    params = insert_queries[0][1]
    assert params["tenant_id"] == "11111111-1111-1111-1111-111111111111"
    assert params["contact_id"] == "c1111111-1111-1111-1111-111111111111"
    assert params["duration"] == 125
    assert params["sentiment_category"] == "positive"
    assert params["summary"] == "Prospect requested product demo."

    # Verify contact was updated
    contact_updates = [q for q in queries_executed if "UPDATE business_ext.contacts" in q[0]]
    assert len(contact_updates) == 1
    assert contact_updates[0][1]["call_result"] == "completed"

    # Verify timeline event was added
    timeline_inserts = [q for q in queries_executed if "INSERT INTO business_ext.contact_timeline_events" in q[0]]
    assert len(timeline_inserts) == 1


@pytest.mark.asyncio
async def test_sync_call_to_crm_is_idempotent(monkeypatch):
    """Verify that duplicate runs are not re-recorded in CRM interactions."""
    from api.tasks import run_integrations

    mock_run = MagicMock()
    mock_run.id = 1002
    mock_run.status = "completed"
    mock_run.usage_info = {}
    mock_run.gathered_context = {}
    mock_run.annotations = {}
    mock_run.extra = {}

    queries_executed = []

    async def mock_execute(sql, params=None):
        queries_executed.append(sql.strip())
        if "FROM business_ext.organization_mappings" in sql:
            return [{"business_tenant_id": "11111111-1111-1111-1111-111111111111"}]
        if "FROM business_ext.interactions" in sql:
            return [{"id": "existing-interaction-id"}]  # Already exists!
        return []

    monkeypatch.setattr(run_integrations.db_client, "execute_raw_query", mock_execute)

    await sync_call_to_crm(mock_run, organization_id=7)

    # Should have checked and stopped without inserting
    inserts = [q for q in queries_executed if "INSERT INTO business_ext.interactions" in q]
    assert len(inserts) == 0
