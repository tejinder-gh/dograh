import { TrustedToolGate } from './types';
import { ToolExecutionGateway } from '../services/tool-execution-gateway.service';

export class VoiceToolGateError extends Error {
  public code: string;
  constructor(message: string, code: string = 'VOICE_GATE_ERROR') {
    super(message);
    this.name = 'VoiceToolGateError';
    this.code = code;
  }
}

/**
 * Trusted Tool Execution Gate for Voice S2S Sessions
 * Intercepts all voice-model function calls and routes through the secure ToolExecutionGateway.
 * Strictly verifies tenant authorization, quotas, arguments, and isolates execution.
 * A denial remains a denial — never bypasses marketplace security policy with unauthenticated fallbacks.
 */
export class VoiceToolGate implements TrustedToolGate {
  private agentId?: string;
  private sessionId: string;

  constructor(options?: { agentId?: string; sessionId?: string }) {
    this.agentId = options?.agentId;
    this.sessionId = options?.sessionId || 'voice-s2s-' + Date.now();
  }

  async executeTool(
    tenantId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!tenantId || tenantId.trim() === '') {
      throw new VoiceToolGateError('Tool execution blocked: Missing verified tenant context.', 'MISSING_TENANT');
    }

    // 1. Dispatch through authoritative ToolExecutionGateway
    const res = await ToolExecutionGateway.executeTool({
      tenantId,
      agentId: this.agentId,
      sessionId: this.sessionId,
      capabilityName: toolName,
      arguments: args,
    });

    // 2. Success handling
    if (res.success) {
      return res.data || { success: true };
    }

    // 3. Consequential approval pending handling
    if (res.pendingApproval) {
      return {
        success: false,
        pendingApproval: true,
        approvalRequestId: res.approvalRequestId,
        message: 'Action paused. Human supervisor approval required before completing.',
      };
    }

    // 4. Strict Denial Handling: A denial MUST remain a denial.
    // Under no circumstances do we fall through to unverified native handlers that bypass policy.
    return {
      success: false,
      error: res.error || `Execution of "${toolName}" was denied by security policy.`,
      errorCode: res.errorCode || 'EXECUTION_DENIED',
    };
  }
}

/**
 * Resolves only authorized tools for the current voice session based on tenant and agent assignments.
 */
export async function discoverVoiceSessionTools(tenantId: string, agentId?: string) {
  return ToolExecutionGateway.resolveSessionTools(tenantId, agentId);
}
