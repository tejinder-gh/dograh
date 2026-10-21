import { query } from '../db/connection';
import {
  ToolCapability,
  ToolDefinition,
  TenantToolInstallation,
  TenantProviderConnection,
  AgentToolAssignment,
} from '../types/marketplace.types';
import { SecretVault } from './secret-vault.service';
import { EntitlementService, EntitlementError } from './entitlement.service';
import { ConnectorRegistry } from './connectors';
import {
  createApprovalRequest,
  logToolExecution,
  reserveIdempotentExecution,
  completeIdempotentExecution,
} from '../db/repositories/marketplace-execution.repository';

export interface ToolExecutionRequest {
  tenantId: string;
  agentId?: string;
  sessionId: string;
  capabilityName: string;
  arguments: Record<string, unknown>;
  idempotencyKey?: string;
  userRole?: string;
  skipApprovalCheck?: boolean;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
  durationMs: number;
  pendingApproval?: boolean;
  approvalRequestId?: string;
}

export class ToolExecutionGatewayError extends Error {
  public code: string;
  constructor(message: string, code: string = 'GATEWAY_ERROR') {
    super(message);
    this.name = 'ToolExecutionGatewayError';
    this.code = code;
  }
}

interface RawAliasedGatewayRow {
  cap_id: string;
  cap_tool_version_id: string;
  cap_function_name: string;
  cap_display_name: string;
  cap_description: string;
  cap_risk_level: string;
  cap_requires_approval: boolean;
  cap_operation_type: string;
  cap_input_schema: Record<string, unknown>;
  cap_output_schema?: Record<string, unknown>;
  cap_default_timeout_ms?: number;

  tool_id: string;
  tool_slug: string;
  tool_name: string;
  tool_category: string;
  tool_provider: string;
  tool_is_verified: boolean;
  tool_is_active: boolean;
  tool_min_plan_tier: string;
  tool_cost_per_execution_cents: number;

  inst_id: string;
  inst_tenant_id: string;
  inst_tool_id: string;
  inst_tool_version_id: string;
  inst_provider_connection_id?: string;
  inst_status: string;
  inst_custom_settings?: Record<string, unknown>;
  inst_enabled_scopes?: string[];

  conn_id?: string;
  conn_tenant_id?: string;
  conn_provider?: string;
  conn_status?: string;
  conn_encrypted_credentials?: string;
  conn_key_ref_id?: string;

  assign_id?: string;
  assign_tenant_id?: string;
  assign_agent_id?: string;
  assign_tool_installation_id?: string;
  assign_is_enabled?: boolean;
  assign_allowed_capabilities?: string[];
  assign_override_parameters?: Record<string, unknown>;
  assign_max_calls_per_session?: number;
}

export class ToolExecutionGateway {
  /**
   * Resolves only authorized, assigned tools for a realtime AI session (Gemini Live / OpenAI Realtime).
   */
  static async resolveSessionTools(
    tenantId: string,
    agentId?: string
  ): Promise<Array<{ name: string; description: string; parameters: Record<string, unknown> }>> {
    if (!tenantId) return [];

    let sql = `
      SELECT 
        c.function_name as name,
        c.description,
        c.input_schema as parameters,
        c.requires_approval,
        i.id as installation_id,
        a.allowed_capabilities
      FROM tenant_tool_installations i
      JOIN tool_definitions t ON i.tool_id = t.id
      JOIN tool_versions v ON i.tool_version_id = v.id
      JOIN tool_capabilities c ON c.tool_version_id = v.id
      LEFT JOIN tenant_provider_connections conn ON i.provider_connection_id = conn.id AND conn.tenant_id = $1
      LEFT JOIN agent_tool_assignments a ON a.tool_installation_id = i.id AND a.agent_id = $2 AND a.tenant_id = $1
      LEFT JOIN subscription_entitlements sub ON sub.tenant_id = $1
      WHERE i.tenant_id = $1 
        AND i.status = 'active'
        AND t.is_active = true
        AND t.is_verified = true
        AND v.status = 'active'
        AND (i.provider_connection_id IS NULL OR conn.status = 'connected')
        AND (sub.id IS NULL OR (sub.is_suspended = false AND t.category = ANY(sub.allowed_categories)))
    `;

    const values: unknown[] = [tenantId, agentId || null];

    if (agentId) {
      sql += ` AND a.id IS NOT NULL AND a.is_enabled = true`;
    }

    const res = await query<{
      name: string;
      description: string;
      parameters: Record<string, unknown>;
      requires_approval: boolean;
      allowed_capabilities: string[] | null;
    }>(sql, values);

    const tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }> = [];

    for (const row of res.rows) {
      if (row.allowed_capabilities && row.allowed_capabilities.length > 0) {
        if (!row.allowed_capabilities.includes(row.name)) {
          continue;
        }
      }

      tools.push({
        name: row.name,
        description: row.description,
        parameters: row.parameters || { type: 'object', properties: {} },
      });
    }

    return tools;
  }

  /**
   * Secure execution entrypoint for all tool invocations across voice, chat, and workflows.
   */
  static async executeTool(params: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const { tenantId, agentId, sessionId, capabilityName, arguments: args, userRole, skipApprovalCheck } = params;

    if (!tenantId || tenantId.trim() === '') {
      throw new ToolExecutionGatewayError('Missing tenantId in execution request.', 'MISSING_TENANT');
    }

    try {
      // 1. Resolve capability, tool definition, installed version, installation, connection, and assignment
      // Strictly enforces i.tool_version_id = v.id to prevent cross-version dispatch
      const capRes = await query<RawAliasedGatewayRow>(
        `SELECT 
          c.id as cap_id,
          c.tool_version_id as cap_tool_version_id,
          c.function_name as cap_function_name,
          c.display_name as cap_display_name,
          c.description as cap_description,
          c.risk_level as cap_risk_level,
          c.requires_approval as cap_requires_approval,
          c.operation_type as cap_operation_type,
          c.input_schema as cap_input_schema,
          c.output_schema as cap_output_schema,
          c.default_timeout_ms as cap_default_timeout_ms,

          t.id as tool_id,
          t.slug as tool_slug,
          t.name as tool_name,
          t.category as tool_category,
          t.provider as tool_provider,
          t.is_verified as tool_is_verified,
          t.is_active as tool_is_active,
          t.min_plan_tier as tool_min_plan_tier,
          t.cost_per_execution_cents as tool_cost_per_execution_cents,

          i.id as inst_id,
          i.tenant_id as inst_tenant_id,
          i.tool_id as inst_tool_id,
          i.tool_version_id as inst_tool_version_id,
          i.provider_connection_id as inst_provider_connection_id,
          i.status as inst_status,
          i.custom_settings as inst_custom_settings,
          i.enabled_scopes as inst_enabled_scopes,

          conn.id as conn_id,
          conn.tenant_id as conn_tenant_id,
          conn.provider as conn_provider,
          conn.status as conn_status,
          conn.encrypted_credentials as conn_encrypted_credentials,
          conn.secret_key_ref as conn_key_ref_id,

          a.id as assign_id,
          a.tenant_id as assign_tenant_id,
          a.agent_id as assign_agent_id,
          a.tool_installation_id as assign_tool_installation_id,
          a.is_enabled as assign_is_enabled,
          a.allowed_capabilities as assign_allowed_capabilities,
          a.override_parameters as assign_override_parameters,
          a.max_calls_per_session as assign_max_calls_per_session
        FROM tool_capabilities c
        JOIN tool_versions v ON c.tool_version_id = v.id
        JOIN tool_definitions t ON v.tool_id = t.id
        JOIN tenant_tool_installations i ON i.tool_id = t.id AND i.tool_version_id = v.id AND i.tenant_id = $1
        LEFT JOIN tenant_provider_connections conn ON i.provider_connection_id = conn.id AND conn.tenant_id = $1
        LEFT JOIN agent_tool_assignments a ON a.tool_installation_id = i.id AND a.agent_id = $3 AND a.tenant_id = $1
        WHERE c.function_name = $2
          AND i.status = 'active'
          AND t.is_active = true
          AND v.status = 'active'
        LIMIT 1`,
        [tenantId, capabilityName, agentId || null]
      );

      const row = capRes.rows[0];
      if (!row) {
        throw new ToolExecutionGatewayError(
          `Capability "${capabilityName}" is not installed or not active for tenant "${tenantId}".`,
          'TOOL_NOT_FOUND'
        );
      }

      // Map typed domain entities
      const capability: ToolCapability = {
        id: row.cap_id,
        toolVersionId: row.cap_tool_version_id,
        functionName: row.cap_function_name,
        displayName: row.cap_display_name || row.cap_function_name,
        description: row.cap_description || '',
        riskLevel: (row.cap_risk_level || 'standard_write') as ToolCapability['riskLevel'],
        requiresApproval: Boolean(row.cap_requires_approval),
        operationType: (row.cap_operation_type || 'write') as ToolCapability['operationType'],
        inputSchema: row.cap_input_schema || { type: 'object', properties: {} },
        outputSchema: row.cap_output_schema || {},
        defaultTimeoutMs: Number(row.cap_default_timeout_ms || 5000),
        rateLimitPerMinute: 60,
        createdAt: new Date().toISOString(),
      };

      const tool: ToolDefinition = {
        id: row.tool_id,
        slug: row.tool_slug,
        name: row.tool_name,
        description: '',
        category: row.tool_category as ToolDefinition['category'],
        provider: row.tool_provider,
        toolType: 'provider_adapter',
        iconName: 'wrench',
        minPlanTier: (row.tool_min_plan_tier || 'starter') as ToolDefinition['minPlanTier'],
        pricingModel: 'included',
        costPerExecutionCents: Number(row.tool_cost_per_execution_cents || 0),
        isVerified: Boolean(row.tool_is_verified),
        isActive: Boolean(row.tool_is_active),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 1b. Atomic Database-Backed Idempotency Reservation
      if (params.idempotencyKey) {
        const idemp = await reserveIdempotentExecution({
          tenantId,
          sessionId,
          agentId,
          toolName: tool.name,
          capabilityName,
          executionSource: agentId ? 'voice_agent' : 'workflow',
          input: args,
          idempotencyKey: params.idempotencyKey,
        });

        if (!idemp.isNew) {
          if (idemp.status === 'success') {
            return {
              success: true,
              data: idemp.existingOutput || {},
              durationMs: Date.now() - startTime,
            };
          }
          if (idemp.status === 'executing') {
            throw new ToolExecutionGatewayError(
              `Concurrent execution in-flight for idempotency key "${params.idempotencyKey}".`,
              'CONCURRENT_EXECUTION_CONFLICT'
            );
          }
          if (idemp.status === 'failed' || idemp.status === 'timeout') {
            throw new ToolExecutionGatewayError(
              `Previous execution failed for idempotency key "${params.idempotencyKey}": ${idemp.errorMessage || 'Execution failed'}.`,
              'IDEMPOTENT_EXECUTION_FAILED'
            );
          }
        }
      }

      const installation: TenantToolInstallation = {
        id: row.inst_id,
        tenantId: row.inst_tenant_id,
        toolId: row.inst_tool_id,
        toolVersionId: row.inst_tool_version_id,
        providerConnectionId: row.inst_provider_connection_id,
        status: row.inst_status as TenantToolInstallation['status'],
        customSettings: row.inst_custom_settings || {},
        enabledScopes: row.inst_enabled_scopes || [],
        installedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const connection: TenantProviderConnection | undefined = row.conn_id
        ? {
            id: row.conn_id,
            tenantId: row.conn_tenant_id || tenantId,
            provider: row.conn_provider || tool.provider,
            connectionName: 'Provider Connection',
            authType: 'api_key',
            status: (row.conn_status || 'connected') as TenantProviderConnection['status'],
            encryptedCredentials: row.conn_encrypted_credentials,
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : undefined;

      if (connection && connection.status !== 'connected') {
        throw new ToolExecutionGatewayError(
          `Provider connection for "${tool.name}" is not active (status: ${connection.status}).`,
          'CONNECTION_NOT_ACTIVE'
        );
      }

      const assignment: AgentToolAssignment | undefined = row.assign_id
        ? {
            id: row.assign_id,
            tenantId: row.assign_tenant_id || tenantId,
            agentId: row.assign_agent_id || agentId || '',
            toolInstallationId: row.assign_tool_installation_id || installation.id,
            isEnabled: Boolean(row.assign_is_enabled),
            allowedCapabilities: row.assign_allowed_capabilities,
            overrideParameters: row.assign_override_parameters || {},
            maxCallsPerSession: Number(row.assign_max_calls_per_session || 10),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : undefined;

      // 2. Strict Schema Argument Validation
      this.validateArguments(args, capability.inputSchema);

      // 3. Validate agent permissions if execution originates from an agent
      if (agentId) {
        this.validateAgentPermissions(agentId, capabilityName, assignment);
      }

      // 3b. Strictly enforce caller user role against capability operation type,
      // EVEN WHEN agentId is supplied (defends against agent impersonation attacks)
      const isConsequential =
        row.cap_operation_type === 'consequential' ||
        capability.operationType === 'consequential' ||
        capability.riskLevel === 'consequential_action' ||
        capability.riskLevel === 'critical_financial';

      const isWrite =
        row.cap_operation_type === 'write' ||
        capability.operationType === 'write' ||
        capability.riskLevel === 'standard_write';

      const isSensitiveRead =
        (row.cap_operation_type === 'read' || capability.operationType === 'read') &&
        ['crm', 'financial', 'telephony'].includes(tool.category);

      if (userRole) {
        if (isConsequential && !['tenant_administrator', 'tenant_owner', 'system_admin', 'platform_super_admin'].includes(userRole)) {
          throw new ToolExecutionGatewayError(
            `Execution of consequential tool "${capabilityName}" requires administrator privileges (caller role: ${userRole}).`,
            'PERMISSION_DENIED'
          );
        }
        if (isWrite && !['tenant_agent_manager', 'tenant_manager', 'tenant_administrator', 'tenant_owner', 'system_admin', 'platform_super_admin'].includes(userRole)) {
          throw new ToolExecutionGatewayError(
            `Execution of state-modifying write tool "${capabilityName}" requires manager or administrator privileges (caller role: ${userRole}).`,
            'PERMISSION_DENIED'
          );
        }
        if (isSensitiveRead && !['tenant_agent_manager', 'tenant_manager', 'tenant_administrator', 'tenant_owner', 'system_admin', 'platform_super_admin'].includes(userRole)) {
          // Unprivileged staff or analyst cannot bypass RBAC via arbitrary agent execution
          if (!agentId || !assignment?.isEnabled) {
            throw new ToolExecutionGatewayError(
              `Execution of sensitive read tool "${capabilityName}" requires manager or administrator privileges (caller role: ${userRole}).`,
              'PERMISSION_DENIED'
            );
          }
        }
      } else if (!agentId) {
        // Direct execution without an agent or user role is strictly prohibited for write/consequential tools
        if (isWrite || isConsequential || isSensitiveRead) {
          throw new ToolExecutionGatewayError(
            `Direct execution of tool "${capabilityName}" without caller identity or agent context is forbidden.`,
            'PERMISSION_DENIED'
          );
        }
      }

      // 4. Consequential Action Human-in-the-Loop Check
      if (!skipApprovalCheck && this.checkConsequentialApprovalRequired(capability)) {
        const approvalReq = await createApprovalRequest({
          tenantId,
          sessionId,
          agentId,
          toolName: tool.name,
          capabilityName,
          sanitizedArguments: args,
          rawArguments: args,
        });

        await logToolExecution({
          tenantId,
          sessionId,
          agentId,
          toolName: tool.name,
          capabilityName,
          executionSource: agentId ? 'voice_agent' : 'workflow',
          status: 'rejected_approval',
          durationMs: Date.now() - startTime,
          input: args,
          error: 'Execution paused awaiting human supervisor sign-off.',
          idempotencyKey: params.idempotencyKey,
        });

        return {
          success: false,
          pendingApproval: true,
          approvalRequestId: approvalReq.id,
          error: 'Consequential action requires human supervisor approval.',
          errorCode: 'APPROVAL_REQUIRED',
          durationMs: Date.now() - startTime,
        };
      }

      // 5. Server-Side Entitlement & Atomic Quota Reservation
      try {
        await EntitlementService.reserveExecutionQuota(
          tenantId,
          tool.category,
          tool.minPlanTier
        );
      } catch (err: unknown) {
        if (err instanceof EntitlementError) {
          await logToolExecution({
            tenantId,
            sessionId,
            agentId,
            toolName: tool.name,
            capabilityName,
            executionSource: agentId ? 'voice_agent' : 'workflow',
            status: 'blocked_entitlement',
            durationMs: Date.now() - startTime,
            input: args,
            error: err.message,
            idempotencyKey: params.idempotencyKey,
          });

          return {
            success: false,
            error: err.message,
            errorCode: err.code,
            durationMs: Date.now() - startTime,
          };
        }
        throw err;
      }

      // 6. Decrypt credentials if connection is bound
      let decryptedCredentials: Record<string, unknown> | undefined;
      if (connection?.encryptedCredentials) {
        try {
          const plain = SecretVault.decrypt(connection.encryptedCredentials);
          decryptedCredentials = JSON.parse(plain);
        } catch {
          decryptedCredentials = { apiKey: SecretVault.decrypt(connection.encryptedCredentials) };
        }
      }

      // 7. Dispatch to Connector with Timeout & Failure Handling
      const connector = ConnectorRegistry.getConnector(tool.provider);
      if (!connector) {
        await EntitlementService.releaseExecutionReservation(tenantId);
        throw new ToolExecutionGatewayError(
          `No registered connector for provider "${tool.provider}".`,
          'CONNECTOR_NOT_FOUND'
        );
      }

      const timeoutMs = capability.defaultTimeoutMs || 5000;
      const durableIdempotencyKey =
        params.idempotencyKey ||
        `exec_${tenantId}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

      const executionPromise = connector.execute({
        tenantId,
        agentId,
        sessionId,
        capabilityName,
        arguments: args,
        decryptedCredentials,
        customSettings: installation.customSettings,
        overrideParameters: assignment?.overrideParameters,
        timeoutMs,
        idempotencyKey: durableIdempotencyKey,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new ToolExecutionGatewayError(`Operation timed out after ${timeoutMs}ms`, 'TIMEOUT')), timeoutMs)
      );

      let resultData: Record<string, unknown>;
      try {
        resultData = await Promise.race([executionPromise, timeoutPromise]);
      } catch (execErr: unknown) {
        const isTimeout =
          (execErr instanceof ToolExecutionGatewayError && execErr.code === 'TIMEOUT') ||
          (execErr instanceof Error && execErr.message.includes('timed out'));

        if (!isTimeout) {
          // Release reserved quota only on deterministic local / client-side failures;
          // on TIMEOUT, provider side-effect may still complete — quota reservation is retained
          await EntitlementService.releaseExecutionReservation(tenantId);
        }

        const durationMs = Date.now() - startTime;
        const errMessage = execErr instanceof Error ? execErr.message : 'Tool execution failed';
        const errCode = execErr instanceof ToolExecutionGatewayError ? execErr.code : (isTimeout ? 'TIMEOUT' : 'EXECUTION_FAILED');

        if (params.idempotencyKey) {
          await completeIdempotentExecution({
            tenantId,
            idempotencyKey: params.idempotencyKey,
            status: isTimeout ? 'timeout' : 'failed',
            durationMs,
            error: errMessage,
          }).catch(() => {});
        } else {
          await logToolExecution({
            tenantId,
            sessionId,
            agentId,
            toolName: tool.name,
            capabilityName,
            executionSource: agentId ? 'voice_agent' : 'workflow',
            status: isTimeout ? 'timeout' : 'failed',
            durationMs,
            input: args,
            error: errMessage,
            idempotencyKey: durableIdempotencyKey,
          });
        }

        return {
          success: false,
          error: errMessage,
          errorCode: errCode,
          durationMs,
        };
      }

      const durationMs = Date.now() - startTime;

      // 8. Record usage & Authoritative Audit Log
      await EntitlementService.recordExecutionUsage({
        tenantId,
        agentId,
        toolId: tool.id,
        costCents: tool.costPerExecutionCents || 0,
      });

      if (params.idempotencyKey) {
        await completeIdempotentExecution({
          tenantId,
          idempotencyKey: params.idempotencyKey,
          status: 'success',
          durationMs,
          output: resultData,
        }).catch(() => {});
      } else {
        await logToolExecution({
          tenantId,
          sessionId,
          agentId,
          toolName: tool.name,
          capabilityName,
          executionSource: agentId ? 'voice_agent' : 'workflow',
          status: 'success',
          durationMs,
          input: args,
          output: resultData,
          idempotencyKey: durableIdempotencyKey,
        });
      }

      return {
        success: true,
        data: resultData,
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorCode = err instanceof ToolExecutionGatewayError ? err.code : 'EXECUTION_FAILED';

      try {
        await logToolExecution({
          tenantId,
          sessionId,
          agentId,
          toolName: capabilityName,
          capabilityName,
          executionSource: agentId ? 'voice_agent' : 'workflow',
          status: errorCode === 'TIMEOUT' ? 'timeout' : 'failed',
          durationMs,
          input: args,
          error: errorMessage,
          idempotencyKey: params.idempotencyKey,
        });
      } catch {
        // Suppress audit log write error if DB is disconnected during offline test or fault
      }

      return {
        success: false,
        error: errorMessage,
        errorCode,
        durationMs,
      };
    }
  }

  static checkConsequentialApprovalRequired(capability: ToolCapability): boolean {
    return Boolean(
      capability.requiresApproval === true ||
      capability.riskLevel === 'consequential_action' ||
      capability.riskLevel === 'critical_financial'
    );
  }

  static validateAgentPermissions(
    agentId: string,
    capabilityName: string,
    assignment?: AgentToolAssignment
  ): void {
    if (!assignment || !assignment.isEnabled) {
      throw new ToolExecutionGatewayError(
        `Agent "${agentId}" is not assigned or authorized to invoke "${capabilityName}".`,
        'AGENT_UNAUTHORIZED'
      );
    }

    if (assignment.allowedCapabilities && assignment.allowedCapabilities.length > 0) {
      if (!assignment.allowedCapabilities.includes(capabilityName)) {
        throw new ToolExecutionGatewayError(
          `Agent "${agentId}" is restricted from invoking capability "${capabilityName}".`,
          'CAPABILITY_RESTRICTED'
        );
      }
    }
  }

  /**
   * Comprehensive JSON Schema Validation
   * Enforces types, required keys, enum restrictions, numeric bounds, string lengths, and forbids unexpected properties.
   */
  static validateArguments(args: Record<string, unknown>, schema: Record<string, unknown>): void {
    if (!schema || typeof schema !== 'object') return;

    if (typeof args !== 'object' || args === null) {
      throw new ToolExecutionGatewayError('Execution arguments must be a valid JSON object.', 'SCHEMA_VALIDATION_ERROR');
    }

    // 1. Required properties check
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const reqKey of required) {
      if (typeof reqKey === 'string') {
        const val = args[reqKey];
        if (val === undefined || val === null || val === '') {
          throw new ToolExecutionGatewayError(
            `Missing required parameter "${reqKey}" for capability execution.`,
            'SCHEMA_VALIDATION_ERROR'
          );
        }
      }
    }

    // 2. Disallow unexpected additional properties when additionalProperties === false
    const properties = (schema.properties && typeof schema.properties === 'object' ? schema.properties : {}) as Record<string, Record<string, unknown>>;
    if (schema.additionalProperties === false) {
      for (const argKey of Object.keys(args)) {
        if (!properties[argKey]) {
          throw new ToolExecutionGatewayError(
            `Unexpected parameter "${argKey}" is not permitted by capability schema.`,
            'SCHEMA_VALIDATION_ERROR'
          );
        }
      }
    }

    // 3. Property type and constraint checking
    for (const [propName, propDef] of Object.entries(properties)) {
      const val = args[propName];
      if (val === undefined || val === null) continue;

      const expectedType = propDef.type as string | undefined;

      if (expectedType === 'string') {
        if (typeof val !== 'string') {
          throw new ToolExecutionGatewayError(
            `Parameter "${propName}" must be a string, got ${typeof val}.`,
            'SCHEMA_VALIDATION_ERROR'
          );
        }
        if (typeof propDef.minLength === 'number' && val.length < propDef.minLength) {
          throw new ToolExecutionGatewayError(
            `Parameter "${propName}" length (${val.length}) is shorter than minimum required (${propDef.minLength}).`,
            'SCHEMA_VALIDATION_ERROR'
          );
        }
        if (typeof propDef.maxLength === 'number' && val.length > propDef.maxLength) {
          throw new ToolExecutionGatewayError(
            `Parameter "${propName}" length (${val.length}) exceeds maximum allowed (${propDef.maxLength}).`,
            'SCHEMA_VALIDATION_ERROR'
          );
        }
        if (Array.isArray(propDef.enum) && !propDef.enum.includes(val)) {
          throw new ToolExecutionGatewayError(
            `Parameter "${propName}" value "${val}" is not allowed. Must be one of: ${propDef.enum.join(', ')}.`,
            'SCHEMA_VALIDATION_ERROR'
          );
        }
      } else if (expectedType === 'number' || expectedType === 'integer') {
        if (typeof val !== 'number' || isNaN(val)) {
          throw new ToolExecutionGatewayError(
            `Parameter "${propName}" must be a number, got ${typeof val}.`,
            'SCHEMA_VALIDATION_ERROR'
          );
        }
        if (expectedType === 'integer' && !Number.isInteger(val)) {
          throw new ToolExecutionGatewayError(
            `Parameter "${propName}" must be an integer.`,
            'SCHEMA_VALIDATION_ERROR'
          );
        }
        if (typeof propDef.minimum === 'number' && val < propDef.minimum) {
          throw new ToolExecutionGatewayError(
            `Parameter "${propName}" (${val}) is less than minimum allowed (${propDef.minimum}).`,
            'SCHEMA_VALIDATION_ERROR'
          );
        }
        if (typeof propDef.maximum === 'number' && val > propDef.maximum) {
          throw new ToolExecutionGatewayError(
            `Parameter "${propName}" (${val}) exceeds maximum allowed (${propDef.maximum}).`,
            'SCHEMA_VALIDATION_ERROR'
          );
        }
      } else if (expectedType === 'boolean') {
        if (typeof val !== 'boolean') {
          throw new ToolExecutionGatewayError(
            `Parameter "${propName}" must be a boolean, got ${typeof val}.`,
            'SCHEMA_VALIDATION_ERROR'
          );
        }
      } else if (expectedType === 'array') {
        if (!Array.isArray(val)) {
          throw new ToolExecutionGatewayError(
            `Parameter "${propName}" must be an array, got ${typeof val}.`,
            'SCHEMA_VALIDATION_ERROR'
          );
        }
      } else if (expectedType === 'object') {
        if (typeof val !== 'object' || Array.isArray(val)) {
          throw new ToolExecutionGatewayError(
            `Parameter "${propName}" must be an object.`,
            'SCHEMA_VALIDATION_ERROR'
          );
        }
      }
    }
  }
}
