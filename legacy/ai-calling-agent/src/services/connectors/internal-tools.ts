import { BaseToolConnector, ConnectionTestResult, ConnectorExecutionParams } from './connector.interface';
import { createEscalationTicket } from '../../db';

export class InternalToolsConnector implements BaseToolConnector {
  readonly provider = 'internal';

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      success: true,
      latencyMs: 1,
      message: 'Internal platform function gateway operational.',
      details: {
        runtime: 'in-process secure gateway',
        escalationQueue: 'active',
      },
    };
  }

  async execute(params: ConnectorExecutionParams): Promise<Record<string, unknown>> {
    const { tenantId, capabilityName, arguments: args } = params;

    switch (capabilityName) {
      case 'escalate_to_supervisor': {
        const triggerReason = String(args.reason || 'Caller requested live supervisor transfer.');
        const urgencyLevel: 'high' | 'critical' = args.urgency === 'critical' ? 'critical' : 'high';
        const contactId = typeof args.contactId === 'string' ? args.contactId : undefined;

        const ticket = await createEscalationTicket(tenantId, {
          contactId,
          channel: 'call_inbound',
          urgencyLevel,
          triggerReason,
          sentimentScore: typeof args.sentimentScore === 'number' ? args.sentimentScore : -60,
          supervisorNotes: `Immediate voice escalation via Marketplace Gateway: "${triggerReason}"`,
        });

        return {
          success: true,
          escalated: true,
          ticketId: ticket.id,
          slaMinutesRemaining: ticket.slaMinutesRemaining,
          confirmationMessage: 'Live supervisor transfer queued. On-call lead notified.',
        };
      }

      default:
        throw new Error(`Unsupported capability "${capabilityName}" on InternalToolsConnector.`);
    }
  }
}
