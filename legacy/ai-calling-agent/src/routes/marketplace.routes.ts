import { Router, Request, Response } from 'express';
import { requireTenantContext, requireRole } from '../middleware/tenant-auth';
import { query } from '../db/connection';
import {
  listCatalogTools,
  getCatalogToolBySlug,
  listTenantConnections,
  getTenantConnectionById,
  createTenantConnection,
  deleteTenantConnection,
  updateTenantConnectionStatus,
  listTenantInstallations,
  installToolForTenant,
  uninstallToolForTenant,
  listAgentToolAssignments,
  assignToolToAgent,
  removeAgentToolAssignment,
  listPendingApprovals,
  getApprovalRequestById,
  reviewApprovalRequest,
  claimApprovalForExecution,
  finalizeApprovalExecution,
  markApprovalExecuted,
  listExecutionLogs,
  getTenantUsageSummary,
} from '../db/repositories/marketplace.repository';
import { ToolExecutionGateway, ToolExecutionGatewayError } from '../services/tool-execution-gateway.service';
import { EntitlementService } from '../services/entitlement.service';
import { ConnectorRegistry } from '../services/connectors/index';
import { SecretVault } from '../services/secret-vault.service';

export const marketplaceRouter = Router();

// 1. Discover Catalog Tools (All authenticated tenant users)
marketplaceRouter.get('/catalog', requireTenantContext, async (req: Request, res: Response): Promise<void> => {
  try {
    const category = req.query.category as any;
    const search = req.query.search as string | undefined;
    const tools = await listCatalogTools({ category, search });
    res.json({ success: true, count: tools.length, tools });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch catalog.' });
  }
});

// 2. Tool Details & Schema
marketplaceRouter.get('/catalog/:slug', requireTenantContext, async (req: Request, res: Response): Promise<void> => {
  try {
    const tool = await getCatalogToolBySlug(req.params.slug);
    if (!tool) {
      res.status(404).json({ error: `Tool "${req.params.slug}" not found in catalog.` });
      return;
    }
    res.json({ success: true, tool });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch tool details.' });
  }
});

// 3. Provider Connections (Requires tenant_administrator or higher)
marketplaceRouter.get('/connections', requireTenantContext, async (req: Request, res: Response): Promise<void> => {
  try {
    const connections = await listTenantConnections(req.tenantId!);
    res.json({ success: true, connections });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch connections.' });
  }
});

marketplaceRouter.post(
  '/connections',
  requireTenantContext,
  requireRole(['tenant_administrator', 'tenant_owner']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { provider, connectionName, authType, rawCredentials, metadata } = req.body;
      if (!provider || !connectionName || !authType) {
        res.status(400).json({ error: 'provider, connectionName, and authType are required.' });
        return;
      }

      const connection = await createTenantConnection({
        tenantId: req.tenantId!,
        provider,
        connectionName,
        authType,
        rawCredentials,
        metadata,
      });

      res.status(201).json({ success: true, connection });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create connection.' });
    }
  }
);

marketplaceRouter.delete(
  '/connections/:id',
  requireTenantContext,
  requireRole(['tenant_administrator', 'tenant_owner']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const deleted = await deleteTenantConnection(req.tenantId!, req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Connection not found.' });
        return;
      }
      res.json({ success: true, message: 'Provider connection removed.' });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete connection.' });
    }
  }
);

// 4. Test Provider Connection (Requires administrator permissions)
marketplaceRouter.post(
  '/connections/:id/test',
  requireTenantContext,
  requireRole(['tenant_administrator', 'tenant_owner']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const connection = await getTenantConnectionById(req.tenantId!, req.params.id);
      if (!connection) {
        res.status(404).json({ error: 'Connection not found.' });
        return;
      }

      const connector = ConnectorRegistry.getConnector(connection.provider);
      if (!connector) {
        res.status(400).json({ error: `No active connector for provider "${connection.provider}".` });
        return;
      }

      let credentials: Record<string, unknown> | undefined;
      if (connection.encryptedCredentials) {
        try {
          const plain = SecretVault.decrypt(connection.encryptedCredentials);
          credentials = JSON.parse(plain);
        } catch {
          credentials = { apiKey: SecretVault.decrypt(connection.encryptedCredentials) };
        }
      }

      const testResult = await connector.testConnection(credentials, connection.metadata);
      await updateTenantConnectionStatus(
        req.tenantId!,
        connection.id,
        testResult.success ? 'connected' : 'error',
        testResult.success ? undefined : testResult.message
      );

      res.json({ success: testResult.success, result: testResult });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Connection test failed.' });
    }
  }
);

// 5. Tenant Installations
marketplaceRouter.get('/installations', requireTenantContext, async (req: Request, res: Response): Promise<void> => {
  try {
    const installations = await listTenantInstallations(req.tenantId!);
    res.json({ success: true, installations });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch installations.' });
  }
});

marketplaceRouter.post(
  '/installations',
  requireTenantContext,
  requireRole(['tenant_agent_manager', 'tenant_administrator', 'tenant_owner']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { toolId, toolVersionId, providerConnectionId, customSettings } = req.body;
      if (!toolId) {
        res.status(400).json({ error: 'toolId is required.' });
        return;
      }

      const installation = await installToolForTenant({
        tenantId: req.tenantId!,
        toolId,
        toolVersionId,
        providerConnectionId,
        customSettings,
        installedBy: req.userId,
      });

      res.status(201).json({ success: true, installation });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to install tool.' });
    }
  }
);

marketplaceRouter.delete(
  '/installations/:id',
  requireTenantContext,
  requireRole(['tenant_agent_manager', 'tenant_administrator', 'tenant_owner']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const deleted = await uninstallToolForTenant(req.tenantId!, req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Installation not found.' });
        return;
      }
      res.json({ success: true, message: 'Tool uninstalled.' });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to uninstall tool.' });
    }
  }
);

// 6. Agent Tool Assignments
marketplaceRouter.get(
  '/agents/:agentId/tools',
  requireTenantContext,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const assignments = await listAgentToolAssignments(req.tenantId!, req.params.agentId);
      res.json({ success: true, assignments });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch agent tool assignments.' });
    }
  }
);

marketplaceRouter.post(
  '/agents/:agentId/tools',
  requireTenantContext,
  requireRole(['tenant_agent_manager', 'tenant_administrator', 'tenant_owner']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { toolInstallationId, allowedCapabilities, overrideParameters, maxCallsPerSession } = req.body;
      if (!toolInstallationId) {
        res.status(400).json({ error: 'toolInstallationId is required.' });
        return;
      }

      const assignment = await assignToolToAgent({
        tenantId: req.tenantId!,
        agentId: req.params.agentId,
        toolInstallationId,
        allowedCapabilities,
        overrideParameters,
        maxCallsPerSession,
      });

      res.status(201).json({ success: true, assignment });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to assign tool to agent.' });
    }
  }
);

marketplaceRouter.delete(
  '/agents/:agentId/tools/:assignmentId',
  requireTenantContext,
  requireRole(['tenant_agent_manager', 'tenant_administrator', 'tenant_owner']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const deleted = await removeAgentToolAssignment(req.tenantId!, req.params.assignmentId);
      if (!deleted) {
        res.status(404).json({ error: 'Assignment not found.' });
        return;
      }
      res.json({ success: true, message: 'Tool assignment revoked from agent.' });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to remove assignment.' });
    }
  }
);

// 7. Gateway Execution Endpoint (Enforces Operation-Scoped RBAC & Agent-Tenant Binding)
marketplaceRouter.post('/execute', requireTenantContext, async (req: Request, res: Response): Promise<void> => {
  try {
    const { capabilityName, arguments: args, agentId, sessionId, idempotencyKey } = req.body;
    if (!capabilityName || !args) {
      res.status(400).json({ error: 'capabilityName and arguments are required.' });
      return;
    }

    // Direct invocation without agent binding strictly requires tenant manager or administrator role
    const isElevatedRole =
      req.userRole === 'platform_super_admin' ||
      req.userRole === 'tenant_owner' ||
      req.userRole === 'tenant_administrator' ||
      req.userRole === 'tenant_agent_manager';

    if (!agentId && !isElevatedRole) {
      res.status(403).json({
        error: 'Direct manual tool execution requires tenant_agent_manager or higher permissions.',
        code: 'INSUFFICIENT_ROLE_PERMISSIONS',
      });
      return;
    }

    // Verify agent belongs to this tenant organization
    if (agentId) {
      const agentCheck = await query(
        'SELECT id FROM agents WHERE tenant_id = $1 AND id = $2',
        [req.tenantId!, agentId]
      );
      if (agentCheck.rows.length === 0) {
        res.status(403).json({
          error: `Agent "${agentId}" is not authorized or not found in this tenant organization.`,
          code: 'AGENT_UNAUTHORIZED',
        });
        return;
      }
    }

    const result = await ToolExecutionGateway.executeTool({
      tenantId: req.tenantId!,
      agentId,
      sessionId: sessionId || 'api-session-' + Date.now(),
      capabilityName,
      arguments: args,
      idempotencyKey,
      userRole: req.userRole,
    });

    if (!result.success && result.errorCode === 'PERMISSION_DENIED') {
      res.status(403).json({ error: result.error, code: result.errorCode });
      return;
    }

    res.json(result);
  } catch (err: unknown) {
    if (err instanceof ToolExecutionGatewayError && err.code === 'PERMISSION_DENIED') {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'Tool execution failed.' });
  }
});

// 8. Human Consequential Action Approvals
marketplaceRouter.get('/approvals', requireTenantContext, async (req: Request, res: Response): Promise<void> => {
  try {
    const approvals = await listPendingApprovals(req.tenantId!);
    res.json({ success: true, count: approvals.length, approvals });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list approvals.' });
  }
});

marketplaceRouter.post(
  '/approvals/:id/review',
  requireTenantContext,
  requireRole(['tenant_administrator', 'tenant_owner']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, reason } = req.body;
      if (status !== 'approved' && status !== 'rejected') {
        res.status(400).json({ error: 'Status must be "approved" or "rejected".' });
        return;
      }

      const updated = await reviewApprovalRequest(
        req.tenantId!,
        req.params.id,
        req.userId!,
        status,
        reason
      );

      if (!updated) {
        res.status(404).json({ error: 'Pending approval request not found or expired.' });
        return;
      }

      res.json({ success: true, approval: updated });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to review approval.' });
    }
  }
);

marketplaceRouter.post(
  '/approvals/:id/execute',
  requireTenantContext,
  requireRole(['tenant_administrator', 'tenant_owner']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // 1. Atomically claim approval in DB: transition approved -> executing
      const claimResult = await claimApprovalForExecution(req.tenantId!, req.params.id, req.userId);

      if (claimResult.alreadyExecuted) {
        // Idempotent: already executed, return cached terminal result
        res.json({
          success: true,
          message: 'Approval request was already executed.',
          approval: claimResult.approval,
          result: claimResult.approval?.executionResult,
        });
        return;
      }

      if (!claimResult.success || !claimResult.approval) {
        if (claimResult.conflictReason === 'not_found') {
          res.status(404).json({ error: 'Approval request not found.' });
          return;
        }
        if (claimResult.conflictReason === 'already_executing') {
          res.status(409).json({
            error: 'Approval request is currently being executed by another process.',
            code: 'ALREADY_EXECUTING',
          });
          return;
        }
        if (claimResult.conflictReason === 'not_approved') {
          res.status(400).json({
            error: `Cannot execute approval request with status "${claimResult.approval?.status}". Request must be in "approved" state.`,
            code: 'NOT_APPROVED',
          });
          return;
        }
        if (claimResult.conflictReason === 'expired') {
          res.status(400).json({ error: 'Approval request has expired.', code: 'EXPIRED' });
          return;
        }
        if (claimResult.conflictReason === 'decryption_failed') {
          res.status(500).json({
            error: 'Approval request payload decryption failed. Execution aborted for security.',
            code: 'DECRYPTION_FAILED',
          });
          return;
        }
        res.status(409).json({
          error: `Approval request cannot be claimed (state: ${claimResult.conflictReason}).`,
          code: 'STATE_CONFLICT',
        });
        return;
      }

      const approval = claimResult.approval;
      const executionArgs = claimResult.rawArguments || approval.sanitizedArguments;
      const durableIdempotencyKey = `approval_exec_${req.tenantId}_${approval.id}`;

      // 2. Execute via gateway with durable idempotency key and decrypted arguments
      const execResult = await ToolExecutionGateway.executeTool({
        tenantId: req.tenantId!,
        agentId: approval.agentId,
        sessionId: approval.sessionId,
        capabilityName: approval.capabilityName,
        arguments: executionArgs,
        userRole: req.userRole,
        skipApprovalCheck: true,
        idempotencyKey: durableIdempotencyKey,
      });

      // 3. Finalize approval status atomically: executed on success, failed on error
      const outcomeStatus = execResult.success ? 'executed' : 'failed';
      const updated = await finalizeApprovalExecution(req.tenantId!, req.params.id, {
        status: outcomeStatus,
        executionResult: execResult.data,
        errorMessage: execResult.error,
      });

      if (!execResult.success) {
        res.status(400).json({
          success: false,
          approval: updated,
          error: execResult.error,
          errorCode: execResult.errorCode,
        });
        return;
      }

      res.json({
        success: true,
        approval: updated,
        result: execResult.data,
      });
    } catch (err: unknown) {
      // In unexpected error, attempt to mark failed to prevent hanging in executing
      await finalizeApprovalExecution(req.tenantId!, req.params.id, {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Execution failed unexpectedly',
      }).catch(() => {});

      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to execute approved request.' });
    }
  }
);

// 9. Usage, Billing & Entitlements
marketplaceRouter.get('/usage', requireTenantContext, async (req: Request, res: Response): Promise<void> => {
  try {
    const entitlement = await EntitlementService.getEntitlement(req.tenantId!);
    const summary = await getTenantUsageSummary(req.tenantId!);
    res.json({ success: true, entitlement, summary });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch usage.' });
  }
});

// 10. Execution Audit Logs
marketplaceRouter.get('/logs', requireTenantContext, async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const status = req.query.status as string | undefined;
    const logs = await listExecutionLogs(req.tenantId!, { limit, status });
    res.json({ success: true, count: logs.length, logs });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch execution logs.' });
  }
});
