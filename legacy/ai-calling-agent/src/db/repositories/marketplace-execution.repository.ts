import { query } from '../connection';
import {
  TenantProviderConnection,
  ConnectionAuthType,
  ToolApprovalRequest,
  ToolExecutionLog,
  ExecutionStatus,
} from '../../types/marketplace.types';
import { SecretVault } from '../../services/secret-vault.service';

export async function listTenantConnections(tenantId: string): Promise<TenantProviderConnection[]> {
  const sql = `
    SELECT 
      id, 
      tenant_id as "tenantId", 
      provider, 
      connection_name as "connectionName", 
      auth_type as "authType", 
      status, 
      encrypted_credentials as "encryptedCredentials", 
      secret_key_ref as "secretKeyRef", 
      metadata, 
      last_verified_at as "lastVerifiedAt", 
      error_message as "errorMessage", 
      created_at as "createdAt", 
      updated_at as "updatedAt"
    FROM tenant_provider_connections
    WHERE tenant_id = $1
    ORDER BY created_at DESC
  `;

  const res = await query<TenantProviderConnection>(sql, [tenantId]);
  // Mask credentials on read for client safety
  return res.rows.map((row) => ({
    ...row,
    encryptedCredentials: row.encryptedCredentials ? '••••••••' : undefined,
  }));
}

export async function getTenantConnectionById(
  tenantId: string,
  connectionId: string
): Promise<TenantProviderConnection | null> {
  const sql = `
    SELECT 
      id, 
      tenant_id as "tenantId", 
      provider, 
      connection_name as "connectionName", 
      auth_type as "authType", 
      status, 
      encrypted_credentials as "encryptedCredentials", 
      secret_key_ref as "secretKeyRef", 
      metadata, 
      last_verified_at as "lastVerifiedAt", 
      error_message as "errorMessage", 
      created_at as "createdAt", 
      updated_at as "updatedAt"
    FROM tenant_provider_connections
    WHERE tenant_id = $1 AND id = $2
  `;

  const res = await query<TenantProviderConnection>(sql, [tenantId, connectionId]);
  return res.rows[0] || null;
}

export async function createTenantConnection(params: {
  tenantId: string;
  provider: string;
  connectionName: string;
  authType: ConnectionAuthType;
  rawCredentials?: string;
  metadata?: Record<string, unknown>;
}): Promise<TenantProviderConnection> {
  let encryptedCredentials: string | null = null;
  let secretKeyRef: string | null = null;

  if (params.rawCredentials) {
    const encrypted = SecretVault.encrypt(params.rawCredentials);
    encryptedCredentials = encrypted.cipherText;
    secretKeyRef = encrypted.keyRef;
  }

  const sql = `
    INSERT INTO tenant_provider_connections (
      tenant_id, provider, connection_name, auth_type, encrypted_credentials, secret_key_ref, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (tenant_id, connection_name) DO UPDATE SET
      provider = EXCLUDED.provider,
      auth_type = EXCLUDED.auth_type,
      encrypted_credentials = EXCLUDED.encrypted_credentials,
      secret_key_ref = EXCLUDED.secret_key_ref,
      metadata = EXCLUDED.metadata,
      status = 'connected',
      updated_at = NOW()
    RETURNING 
      id, 
      tenant_id as "tenantId", 
      provider, 
      connection_name as "connectionName", 
      auth_type as "authType", 
      status, 
      secret_key_ref as "secretKeyRef", 
      metadata, 
      last_verified_at as "lastVerifiedAt", 
      created_at as "createdAt", 
      updated_at as "updatedAt"
  `;

  const res = await query<TenantProviderConnection>(sql, [
    params.tenantId,
    params.provider,
    params.connectionName,
    params.authType,
    encryptedCredentials,
    secretKeyRef,
    JSON.stringify(params.metadata || {}),
  ]);

  return res.rows[0]!;
}

export async function deleteTenantConnection(tenantId: string, connectionId: string): Promise<boolean> {
  const res = await query(
    'DELETE FROM tenant_provider_connections WHERE tenant_id = $1 AND id = $2',
    [tenantId, connectionId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function updateTenantConnectionStatus(
  tenantId: string,
  connectionId: string,
  status: 'connected' | 'disconnected' | 'error',
  error?: string
): Promise<void> {
  await query(
    `UPDATE tenant_provider_connections 
     SET status = $3, error_message = $4, last_verified_at = NOW(), updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, connectionId, status, error || null]
  );
}

export async function createApprovalRequest(params: {
  tenantId: string;
  sessionId: string;
  agentId?: string;
  toolName: string;
  capabilityName: string;
  sanitizedArguments: Record<string, unknown>;
  rawArguments?: Record<string, unknown>;
}): Promise<ToolApprovalRequest> {
  let encryptedPayload: string | null = null;
  if (params.rawArguments) {
    try {
      const encrypted = SecretVault.encrypt(JSON.stringify(params.rawArguments));
      encryptedPayload = encrypted.cipherText;
    } catch {
      // In non-fatal fallback scenarios, leave null
    }
  }

  const sql = `
    INSERT INTO tool_approval_requests (
      tenant_id, session_id, agent_id, tool_name, capability_name, sanitized_arguments, encrypted_payload
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING 
      id, 
      tenant_id as "tenantId", 
      session_id as "sessionId", 
      agent_id as "agentId", 
      tool_name as "toolName", 
      capability_name as "capabilityName", 
      sanitized_arguments as "sanitizedArguments", 
      encrypted_payload as "encryptedPayload",
      status, 
      requested_at as "requestedAt", 
      expires_at as "expiresAt"
  `;

  const res = await query<ToolApprovalRequest>(sql, [
    params.tenantId,
    params.sessionId,
    params.agentId || null,
    params.toolName,
    params.capabilityName,
    JSON.stringify(SecretVault.sanitizeForLogging(params.sanitizedArguments)),
    encryptedPayload,
  ]);

  return res.rows[0]!;
}

export async function listPendingApprovals(tenantId: string): Promise<ToolApprovalRequest[]> {
  const sql = `
    SELECT 
      id, 
      tenant_id as "tenantId", 
      session_id as "sessionId", 
      agent_id as "agentId", 
      tool_name as "toolName", 
      capability_name as "capabilityName", 
      sanitized_arguments as "sanitizedArguments", 
      status, 
      requested_at as "requestedAt", 
      expires_at as "expiresAt"
    FROM tool_approval_requests
    WHERE tenant_id = $1 AND status = 'pending' AND expires_at > NOW()
    ORDER BY requested_at DESC
  `;

  const res = await query<ToolApprovalRequest>(sql, [tenantId]);
  return res.rows;
}

export async function getApprovalRequestById(
  tenantId: string,
  approvalId: string
): Promise<ToolApprovalRequest | null> {
  const sql = `
    SELECT 
      id, 
      tenant_id as "tenantId", 
      session_id as "sessionId", 
      agent_id as "agentId", 
      tool_name as "toolName", 
      capability_name as "capabilityName", 
      sanitized_arguments as "sanitizedArguments", 
      encrypted_payload as "encryptedPayload",
      status, 
      requested_at as "requestedAt", 
      expires_at as "expiresAt",
      reviewed_by as "reviewedBy",
      reviewed_at as "reviewedAt",
      rejection_reason as "rejectionReason",
      execution_claimed_at as "executionClaimedAt",
      execution_claimed_by as "executionClaimedBy",
      executed_at as "executedAt",
      execution_result as "executionResult"
    FROM tool_approval_requests
    WHERE tenant_id = $1 AND id = $2
  `;

  const res = await query<ToolApprovalRequest>(sql, [tenantId, approvalId]);
  return res.rows[0] || null;
}

export async function reviewApprovalRequest(
  tenantId: string,
  approvalId: string,
  reviewerId: string,
  status: 'approved' | 'rejected',
  reason?: string
): Promise<ToolApprovalRequest | null> {
  const sql = `
    UPDATE tool_approval_requests
    SET status = $3, reviewed_by = $4, reviewed_at = NOW(), rejection_reason = $5
    WHERE tenant_id = $1 AND id = $2 AND status = 'pending' AND expires_at > NOW()
    RETURNING 
      id, 
      tenant_id as "tenantId", 
      session_id as "sessionId", 
      agent_id as "agentId", 
      tool_name as "toolName", 
      capability_name as "capabilityName", 
      sanitized_arguments as "sanitizedArguments", 
      encrypted_payload as "encryptedPayload",
      status, 
      requested_at as "requestedAt", 
      expires_at as "expiresAt",
      reviewed_by as "reviewedBy",
      reviewed_at as "reviewedAt",
      rejection_reason as "rejectionReason",
      execution_claimed_at as "executionClaimedAt",
      execution_claimed_by as "executionClaimedBy",
      executed_at as "executedAt",
      execution_result as "executionResult"
  `;

  const res = await query<ToolApprovalRequest>(sql, [
    tenantId,
    approvalId,
    status,
    reviewerId,
    reason || null,
  ]);

  return res.rows[0] || null;
}

export interface ClaimApprovalResult {
  success: boolean;
  approval?: ToolApprovalRequest;
  rawArguments?: Record<string, unknown>;
  alreadyExecuted?: boolean;
  conflictReason?: string;
}

export async function claimApprovalForExecution(
  tenantId: string,
  approvalId: string,
  claimedBy?: string
): Promise<ClaimApprovalResult> {
  // Atomic transition approved -> executing
  const updateSql = `
    UPDATE tool_approval_requests
    SET status = 'executing', execution_claimed_at = NOW(), execution_claimed_by = $3
    WHERE tenant_id = $1 AND id = $2 AND status = 'approved' AND expires_at > NOW()
    RETURNING 
      id, 
      tenant_id as "tenantId", 
      session_id as "sessionId", 
      agent_id as "agentId", 
      tool_name as "toolName", 
      capability_name as "capabilityName", 
      sanitized_arguments as "sanitizedArguments", 
      encrypted_payload as "encryptedPayload",
      status, 
      requested_at as "requestedAt", 
      expires_at as "expiresAt",
      reviewed_by as "reviewedBy",
      reviewed_at as "reviewedAt",
      rejection_reason as "rejectionReason",
      execution_claimed_at as "executionClaimedAt",
      execution_claimed_by as "executionClaimedBy",
      executed_at as "executedAt",
      execution_result as "executionResult"
  `;

  const res = await query<ToolApprovalRequest>(updateSql, [tenantId, approvalId, claimedBy || null]);
  if (res.rows[0]) {
    const row = res.rows[0];
    let rawArguments: Record<string, unknown>;

    if (row.encryptedPayload) {
      try {
        const decryptedJson = SecretVault.decrypt(row.encryptedPayload);
        rawArguments = JSON.parse(decryptedJson);
      } catch {
        // FAIL-CLOSED: Never execute masked/sanitized arguments (e.g. '••••••••')
        // Revert status back to 'approved' so approval is not permanently stuck in 'executing'
        await query(
          `UPDATE tool_approval_requests 
           SET status = 'approved', execution_claimed_at = NULL, execution_claimed_by = NULL
           WHERE tenant_id = $1 AND id = $2 AND status = 'executing'`,
          [tenantId, approvalId]
        );
        return {
          success: false,
          conflictReason: 'decryption_failed',
          approval: row,
        };
      }
    } else {
      rawArguments = (row.sanitizedArguments as Record<string, unknown>) || {};
    }

    return {
      success: true,
      approval: row,
      rawArguments,
    };
  }

  // Not updated — inspect current state for precise idempotency / conflict reporting
  const current = await getApprovalRequestById(tenantId, approvalId);
  if (!current) {
    return { success: false, conflictReason: 'not_found' };
  }
  if (current.status === 'executed') {
    return { success: false, alreadyExecuted: true, approval: current };
  }
  if (current.status === 'executing') {
    return { success: false, conflictReason: 'already_executing', approval: current };
  }
  if (current.status === 'pending') {
    return { success: false, conflictReason: 'not_approved', approval: current };
  }
  if (current.status === 'rejected') {
    return { success: false, conflictReason: 'rejected', approval: current };
  }
  if (new Date(current.expiresAt).getTime() <= Date.now()) {
    return { success: false, conflictReason: 'expired', approval: current };
  }

  return { success: false, conflictReason: current.status, approval: current };
}

/**
 * Reconciles approval requests that were claimed for execution but timed out
 * or crashed, returning them to 'approved' status for recovery.
 */
export async function reconcileStaleApprovalClaims(
  tenantId: string,
  staleThresholdMinutes = 5
): Promise<number> {
  const sql = `
    UPDATE tool_approval_requests
    SET status = 'approved', execution_claimed_at = NULL, execution_claimed_by = NULL
    WHERE tenant_id = $1 
      AND status = 'executing' 
      AND execution_claimed_at < NOW() - ($2 || ' minutes')::interval
      AND expires_at > NOW()
  `;
  const res = await query(sql, [tenantId, staleThresholdMinutes]);
  return res.rowCount ?? 0;
}

export async function finalizeApprovalExecution(
  tenantId: string,
  approvalId: string,
  outcome: {
    status: 'executed' | 'failed';
    executionResult?: Record<string, unknown>;
    errorMessage?: string;
  }
): Promise<ToolApprovalRequest | null> {
  const finalResult = outcome.status === 'executed'
    ? SecretVault.sanitizeForLogging(outcome.executionResult || {})
    : { error: outcome.errorMessage || 'Execution failed' };

  const sql = `
    UPDATE tool_approval_requests
    SET status = $3, executed_at = NOW(), execution_result = $4
    WHERE tenant_id = $1 AND id = $2 AND status = 'executing'
    RETURNING 
      id, 
      tenant_id as "tenantId", 
      session_id as "sessionId", 
      agent_id as "agentId", 
      tool_name as "toolName", 
      capability_name as "capabilityName", 
      sanitized_arguments as "sanitizedArguments", 
      status, 
      requested_at as "requestedAt", 
      expires_at as "expiresAt",
      reviewed_by as "reviewedBy",
      reviewed_at as "reviewedAt",
      rejection_reason as "rejectionReason",
      execution_claimed_at as "executionClaimedAt",
      execution_claimed_by as "executionClaimedBy",
      executed_at as "executedAt",
      execution_result as "executionResult"
  `;

  const res = await query<ToolApprovalRequest>(sql, [
    tenantId,
    approvalId,
    outcome.status,
    JSON.stringify(finalResult),
  ]);

  return res.rows[0] || null;
}

export async function markApprovalExecuted(
  tenantId: string,
  approvalId: string,
  executionResult: Record<string, unknown>
): Promise<ToolApprovalRequest | null> {
  return finalizeApprovalExecution(tenantId, approvalId, {
    status: 'executed',
    executionResult,
  });
}

export async function logToolExecution(params: {
  tenantId: string;
  sessionId: string;
  agentId?: string;
  toolName: string;
  capabilityName: string;
  executionSource: 'voice_agent' | 'test_runner' | 'workflow' | 'manual_trigger';
  status: ExecutionStatus;
  durationMs: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  idempotencyKey?: string;
}): Promise<void> {
  const sanitizedInput = SecretVault.sanitizeForLogging(params.input);
  const sanitizedOutput = params.output ? SecretVault.sanitizeForLogging(params.output) : null;

  const sql = `
    INSERT INTO tool_execution_logs (
      tenant_id, session_id, agent_id, tool_name, capability_name, execution_source,
      status, duration_ms, sanitized_input, sanitized_output, error_message, idempotency_key
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `;

  await query(sql, [
    params.tenantId,
    params.sessionId,
    params.agentId || null,
    params.toolName,
    params.capabilityName,
    params.executionSource,
    params.status,
    params.durationMs,
    JSON.stringify(sanitizedInput),
    sanitizedOutput ? JSON.stringify(sanitizedOutput) : null,
    params.error || null,
    params.idempotencyKey || null,
  ]);
}

export async function listExecutionLogs(
  tenantId: string,
  params?: { limit?: number; status?: string }
): Promise<ToolExecutionLog[]> {
  const limit = Math.min(100, Math.max(1, params?.limit || 50));
  const conditions = ['tenant_id = $1'];
  const values: unknown[] = [tenantId];

  if (params?.status) {
    values.push(params.status);
    conditions.push(`status = $${values.length}`);
  }

  values.push(limit);
  const sql = `
    SELECT 
      id, 
      tenant_id as "tenantId", 
      session_id as "sessionId", 
      agent_id as "agentId", 
      tool_name as "toolName", 
      capability_name as "capabilityName", 
      execution_source as "executionSource", 
      status, 
      duration_ms as "durationMs", 
      sanitized_input as "sanitizedInput", 
      sanitized_output as "sanitizedOutput", 
      error_message as "errorMessage", 
      idempotency_key as "idempotencyKey", 
      created_at as "createdAt"
    FROM tool_execution_logs
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${values.length}
  `;

  const res = await query<ToolExecutionLog>(sql, values);
  return res.rows;
}

export async function getTenantUsageSummary(
  tenantId: string,
  billingPeriod?: string
): Promise<{
  billingPeriod: string;
  totalExecutions: number;
  totalCostCents: number;
  breakdownByTool: Array<{ toolName: string; units: number; costCents: number }>;
}> {
  const period = billingPeriod || new Date().toISOString().substring(0, 7);

  const res = await query<{
    toolName: string;
    units: string;
    costCents: string;
  }>(
    `SELECT 
      t.name as "toolName", 
      SUM(u.units_consumed) as "units", 
      SUM(u.cost_cents) as "costCents"
    FROM tool_usage_records u
    JOIN tool_definitions t ON u.tool_id = t.id
    WHERE u.tenant_id = $1 AND u.billing_period = $2
    GROUP BY t.name
    ORDER BY SUM(u.units_consumed) DESC`,
    [tenantId, period]
  );

  let totalExecutions = 0;
  let totalCostCents = 0;
  const breakdownByTool = res.rows.map((r) => {
    const units = parseInt(r.units, 10) || 0;
    const cost = parseInt(r.costCents, 10) || 0;
    totalExecutions += units;
    totalCostCents += cost;
    return {
      toolName: r.toolName,
      units,
      costCents: cost,
    };
  });

  return {
    billingPeriod: period,
    totalExecutions,
    totalCostCents,
    breakdownByTool,
  };
}

export async function recoverStaleExecutingApprovals(staleThresholdMinutes = 5): Promise<number> {
  const sql = `
    UPDATE tool_approval_requests
    SET status = 'approved', execution_claimed_at = NULL, execution_claimed_by = NULL
    WHERE status = 'executing' 
      AND execution_claimed_at < NOW() - ($1 || ' minutes')::INTERVAL
      AND expires_at > NOW()
  `;
  const res = await query(sql, [staleThresholdMinutes.toString()]);
  return res.rowCount ?? 0;
}

export interface IdempotencyReservationResult {
  isNew: boolean;
  status?: string;
  existingOutput?: Record<string, unknown>;
  errorMessage?: string;
  logId?: string;
}

export async function reserveIdempotentExecution(params: {
  tenantId: string;
  sessionId: string;
  agentId?: string;
  toolName: string;
  capabilityName: string;
  executionSource: 'voice_agent' | 'test_runner' | 'workflow' | 'manual_trigger';
  input: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<IdempotencyReservationResult> {
  const sanitizedInput = SecretVault.sanitizeForLogging(params.input);

  // Atomic INSERT ON CONFLICT DO NOTHING using the unique index on (tenant_id, idempotency_key)
  const insertSql = `
    INSERT INTO tool_execution_logs (
      tenant_id, session_id, agent_id, tool_name, capability_name, execution_source,
      status, duration_ms, sanitized_input, idempotency_key
    ) VALUES ($1, $2, $3, $4, $5, $6, 'executing', 0, $7, $8)
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    RETURNING id
  `;

  const res = await query<{ id: string }>(insertSql, [
    params.tenantId,
    params.sessionId,
    params.agentId || null,
    params.toolName,
    params.capabilityName,
    params.executionSource,
    JSON.stringify(sanitizedInput),
    params.idempotencyKey,
  ]);

  if (res.rows[0]) {
    return { isNew: true, logId: res.rows[0].id };
  }

  // Idempotency conflict: Read existing execution log
  const checkSql = `
    SELECT id, status, sanitized_output as "sanitizedOutput", error_message as "errorMessage"
    FROM tool_execution_logs
    WHERE tenant_id = $1 AND idempotency_key = $2
    ORDER BY created_at DESC LIMIT 1
  `;
  const existing = await query<{
    id: string;
    status: string;
    sanitizedOutput?: Record<string, unknown>;
    errorMessage?: string;
  }>(checkSql, [params.tenantId, params.idempotencyKey]);

  const existingRow = existing.rows[0];
  return {
    isNew: false,
    status: existingRow?.status || 'executing',
    existingOutput: existingRow?.sanitizedOutput || undefined,
    errorMessage: existingRow?.errorMessage || undefined,
    logId: existingRow?.id,
  };
}

export async function completeIdempotentExecution(params: {
  tenantId: string;
  idempotencyKey: string;
  status: ExecutionStatus;
  durationMs: number;
  output?: Record<string, unknown>;
  error?: string;
}): Promise<void> {
  const sanitizedOutput = params.output ? SecretVault.sanitizeForLogging(params.output) : null;
  const sql = `
    UPDATE tool_execution_logs
    SET status = $3, duration_ms = $4, sanitized_output = $5, error_message = $6
    WHERE tenant_id = $1 AND idempotency_key = $2
  `;
  await query(sql, [
    params.tenantId,
    params.idempotencyKey,
    params.status,
    params.durationMs,
    sanitizedOutput ? JSON.stringify(sanitizedOutput) : null,
    params.error || null,
  ]);
}

