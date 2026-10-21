/**
 * Connector Interface for Tool Execution Gateway
 * Guarantees provider separation, safe argument handling, timeout bounds, and test diagnostics.
 */

export interface ConnectorExecutionParams {
  tenantId: string;
  agentId?: string;
  sessionId: string;
  capabilityName: string;
  arguments: Record<string, unknown>;
  decryptedCredentials?: Record<string, unknown>;
  customSettings?: Record<string, unknown>;
  overrideParameters?: Record<string, unknown>;
  timeoutMs?: number;
  idempotencyKey?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface BaseToolConnector {
  readonly provider: string;

  /**
   * Performs real-time health and authentication validation against the provider.
   */
  testConnection(
    credentials?: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<ConnectionTestResult>;

  /**
   * Executes a specific capability on the connector.
   */
  execute(params: ConnectorExecutionParams): Promise<Record<string, unknown>>;
}
