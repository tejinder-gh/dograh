import { BaseToolConnector, ConnectionTestResult, ConnectorExecutionParams } from './connector.interface';
import { safeFetch, validateSafeOutboundUrl } from '../../utils/ssrf-guard';

/**
 * Sandboxed Model Context Protocol (MCP) Client Connector
 * Communicates with vetted external MCP servers over JSON-RPC.
 * Prevents arbitrary unvetted code execution inside the main server process.
 * Strictly protected against SSRF, loopback access, and cloud metadata exfiltration.
 */
export class McpConnector implements BaseToolConnector {
  readonly provider = 'anthropic_mcp';

  async testConnection(
    credentials?: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const start = Date.now();
    const endpointUrl = (credentials?.endpointUrl || metadata?.endpointUrl) as string | undefined;

    if (!endpointUrl || typeof endpointUrl !== 'string') {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: 'Missing MCP Server endpoint URL in connection configuration.',
      };
    }

    try {
      // Validate outbound URL safety against SSRF
      await validateSafeOutboundUrl(endpointUrl);

      const res = await safeFetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(credentials?.bearerToken ? { Authorization: `Bearer ${credentials.bearerToken}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'test-ping-' + Date.now(),
          method: 'tools/list',
          params: {},
        }),
      });

      if (!res.ok) {
        return {
          success: false,
          latencyMs: Date.now() - start,
          message: `MCP server responded with HTTP status ${res.status}.`,
        };
      }

      const rpcData = (await res.json().catch(() => ({}))) as { result?: { tools?: unknown[] } };
      return {
        success: true,
        latencyMs: Date.now() - start,
        message: 'MCP Server connection verified via JSON-RPC protocol.',
        details: {
          endpoint: endpointUrl,
          toolsDiscovered: Array.isArray(rpcData.result?.tools) ? rpcData.result?.tools.length : 0,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'Failed to reach external MCP server.',
      };
    }
  }

  async execute(params: ConnectorExecutionParams): Promise<Record<string, unknown>> {
    const { capabilityName, arguments: args, decryptedCredentials, customSettings, timeoutMs } = params;
    const endpointUrl = (decryptedCredentials?.endpointUrl || customSettings?.endpointUrl) as string | undefined;
    const bearerToken = decryptedCredentials?.bearerToken as string | undefined;

    if (!endpointUrl) {
      throw new Error(
        `[MCP BLOCKED] No verified MCP server endpoint URL is configured for tenant. ` +
        `Capability "${capabilityName}" requires an active, connected MCP provider endpoint.`
      );
    }

    // SSRF Pre-validation
    await validateSafeOutboundUrl(endpointUrl);

    const payload = {
      jsonrpc: '2.0',
      id: 'mcp-call-' + Date.now(),
      method: 'tools/call',
      params: {
        name: capabilityName,
        arguments: args,
      },
    };

    try {
      const res = await safeFetch(
        endpointUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
          },
          body: JSON.stringify(payload),
        },
        { timeoutMs: timeoutMs || 5000 }
      );

      if (!res.ok) {
        throw new Error(`MCP server HTTP error: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as { error?: { message: string }; result?: Record<string, unknown> };
      if (json.error) {
        throw new Error(`MCP protocol error: ${json.error.message}`);
      }

      let parsedContent: Record<string, unknown> = {};
      const contentList = (json.result as any)?.content;
      if (Array.isArray(contentList) && contentList[0]?.text) {
        try {
          parsedContent = JSON.parse(contentList[0].text);
        } catch {
          parsedContent = { rawText: contentList[0].text };
        }
      }

      return {
        success: true,
        ...(json.result || {}),
        ...parsedContent,
      };
    } catch (err: unknown) {
      throw new Error(
        `[MCP EXECUTION ERROR] Failed to execute "${capabilityName}" against MCP endpoint: ` +
        (err instanceof Error ? err.message : String(err))
      );
    }
  }
}
