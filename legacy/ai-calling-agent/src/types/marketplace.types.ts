/**
 * Multi-Tenant Tool & Plugin Marketplace Types
 */

export type ToolCategory =
  | 'scheduling'
  | 'crm'
  | 'communication'
  | 'payment'
  | 'verification'
  | 'knowledge_mcp'
  | 'operations';

export type ToolType = 'internal_function' | 'provider_adapter' | 'mcp_server';

export type ToolStatus = 'draft' | 'review_pending' | 'active' | 'deprecated' | 'revoked';

export type RiskLevel = 'safe_read' | 'standard_write' | 'consequential_action' | 'critical_financial';

export type OperationType = 'read' | 'write' | 'consequential';

export type PricingModel = 'included' | 'usage_based' | 'add_on';

export type PlanTier = 'starter' | 'standard' | 'growth' | 'enterprise';

export interface ToolDefinition {
  id: string;
  slug: string;
  name: string;
  category: ToolCategory;
  provider: string;
  toolType: ToolType;
  description: string;
  iconName: string;
  documentationUrl?: string;
  isVerified: boolean;
  isActive: boolean;
  minPlanTier: PlanTier;
  pricingModel: PricingModel;
  costPerExecutionCents: number;
  createdAt: string;
  updatedAt: string;
  versions?: ToolVersion[];
}

export interface ToolVersion {
  id: string;
  toolId: string;
  versionString: string;
  status: ToolStatus;
  changelog?: string;
  manifest: Record<string, unknown>;
  createdAt: string;
  capabilities?: ToolCapability[];
}

export interface ToolCapability {
  id: string;
  toolVersionId: string;
  functionName: string;
  displayName: string;
  description: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  operationType: OperationType;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  defaultTimeoutMs: number;
  rateLimitPerMinute: number;
  createdAt: string;
}

export interface SubscriptionEntitlement {
  id: string;
  tenantId: string;
  planTier: PlanTier;
  allowedCategories: ToolCategory[];
  maxActiveTools: number;
  maxExecutionsPerMonth: number;
  currentCycleExecutions: number;
  billingCycleStart: string;
  billingCycleEnd: string;
  isSuspended: boolean;
  overageAllowed: boolean;
  overageRateCents: number;
  createdAt: string;
  updatedAt: string;
}

export type ConnectionAuthType = 'oauth2' | 'api_key' | 'mcp_endpoint' | 'internal';

export type ConnectionStatus = 'connected' | 'disconnected' | 'expired' | 'error' | 'pending_auth';

export interface TenantProviderConnection {
  id: string;
  tenantId: string;
  provider: string;
  connectionName: string;
  authType: ConnectionAuthType;
  status: ConnectionStatus;
  encryptedCredentials?: string;
  secretKeyRef?: string;
  metadata: Record<string, unknown>;
  lastVerifiedAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export type InstallationStatus = 'active' | 'disabled' | 'revoked' | 'pending_configuration';

export interface TenantToolInstallation {
  id: string;
  tenantId: string;
  toolId: string;
  toolVersionId: string;
  providerConnectionId?: string;
  status: InstallationStatus;
  customSettings: Record<string, unknown>;
  enabledScopes: string[];
  installedBy?: string;
  installedAt: string;
  updatedAt: string;
  tool?: ToolDefinition;
  connection?: TenantProviderConnection;
}

export interface AgentToolAssignment {
  id: string;
  tenantId: string;
  agentId: string;
  toolInstallationId: string;
  isEnabled: boolean;
  allowedCapabilities?: string[];
  overrideParameters: Record<string, unknown>;
  maxCallsPerSession: number;
  createdAt: string;
  updatedAt: string;
  toolInstallation?: TenantToolInstallation;
}

export interface ToolExecutionPolicy {
  id: string;
  tenantId: string;
  toolId?: string;
  capabilityName?: string;
  requireHumanApproval: boolean;
  approvalTimeoutSeconds: number;
  allowedCallDirections: string[];
  rateLimitPerMinute: number;
  isBlocked: boolean;
  blockedReason?: string;
  createdAt: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'executing' | 'executed' | 'failed' | 'rejected' | 'expired';

export interface ToolApprovalRequest {
  id: string;
  tenantId: string;
  sessionId: string;
  agentId?: string;
  toolName: string;
  capabilityName: string;
  sanitizedArguments: Record<string, unknown>;
  encryptedPayload?: string;
  status: ApprovalStatus;
  requestedAt: string;
  expiresAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  executionClaimedAt?: string;
  executionClaimedBy?: string;
  executedAt?: string;
  executionResult?: Record<string, unknown>;
}

export type ExecutionStatus =
  | 'executing'
  | 'success'
  | 'failed'
  | 'blocked_entitlement'
  | 'blocked_policy'
  | 'timeout'
  | 'rejected_approval'
  | 'circuit_broken';

export interface ToolExecutionLog {
  id: string;
  tenantId: string;
  sessionId: string;
  agentId?: string;
  toolName: string;
  capabilityName: string;
  executionSource: 'voice_agent' | 'test_runner' | 'workflow' | 'manual_trigger';
  status: ExecutionStatus;
  durationMs: number;
  sanitizedInput: Record<string, unknown>;
  sanitizedOutput?: Record<string, unknown>;
  errorMessage?: string;
  idempotencyKey?: string;
  createdAt: string;
}

export interface ToolUsageRecord {
  id: string;
  tenantId: string;
  agentId?: string;
  toolId: string;
  billingPeriod: string;
  unitsConsumed: number;
  costCents: number;
  createdAt: string;
}

export interface ToolExecutionRequest {
  tenantId: string;
  agentId?: string;
  sessionId: string;
  capabilityName: string;
  arguments: Record<string, unknown>;
  callDirection?: 'inbound' | 'outbound';
  idempotencyKey?: string;
  userRole?: string;
  userId?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
  pendingApproval?: boolean;
  approvalRequestId?: string;
  durationMs: number;
}
