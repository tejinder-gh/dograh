import { withTenantContext } from '../connection';

export interface CrmStats {
  hasData: boolean;
  totalInteractions: number;
  avgSentiment: number | null;
  totalBookings: number;
  activeEscalations: number;
  totalLeads: number;
  qualifiedLeads: number;
  fcrRate: string | null;
  inboundCount: number;
  outboundCount: number;
}

export async function getTenantStats(tenantId: string): Promise<CrmStats> {
  return withTenantContext(tenantId, undefined, async (client) => {
    // 1. Interactions aggregation
    const interactionAgg = await client.query(
      `SELECT 
         COUNT(*) as total_count,
         AVG(sentiment_score) as avg_sentiment,
         COUNT(*) FILTER (WHERE was_escalated = false) as resolved_first_contact,
         COUNT(*) FILTER (WHERE channel = 'call_inbound') as inbound_count,
         COUNT(*) FILTER (WHERE channel = 'call_outbound') as outbound_count
       FROM interactions
       WHERE tenant_id = $1`,
      [tenantId]
    );

    // 2. Bookings count
    const bookingsAgg = await client.query(
      `SELECT COUNT(*) as total_bookings FROM scheduled_sessions WHERE tenant_id = $1`,
      [tenantId]
    );

    // 3. Escalations count
    const escalationsAgg = await client.query(
      `SELECT COUNT(*) as active_escalations FROM escalation_tickets WHERE tenant_id = $1 AND status != 'resolved'`,
      [tenantId]
    );

    // 4. Contacts count
    const contactsAgg = await client.query(
      `SELECT 
         COUNT(*) as total_leads,
         COUNT(*) FILTER (WHERE lead_score >= 60) as qualified_leads
       FROM contacts
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const iRow = interactionAgg.rows[0];
    const totalInteractions = parseInt(iRow.total_count, 10) || 0;
    const totalBookings = parseInt(bookingsAgg.rows[0].total_bookings, 10) || 0;
    const activeEscalations = parseInt(escalationsAgg.rows[0].active_escalations, 10) || 0;
    const cRow = contactsAgg.rows[0];
    const totalLeads = parseInt(cRow.total_leads, 10) || 0;
    const qualifiedLeads = parseInt(cRow.qualified_leads, 10) || 0;

    const hasData = totalInteractions > 0 || totalLeads > 0 || totalBookings > 0;

    const avgSentiment = totalInteractions > 0 && iRow.avg_sentiment !== null
      ? Math.round(parseFloat(iRow.avg_sentiment))
      : null;

    const resolvedFcr = parseInt(iRow.resolved_first_contact, 10) || 0;
    const fcrRate = totalInteractions > 0
      ? `${Math.round((resolvedFcr / totalInteractions) * 100)}%`
      : null;

    return {
      hasData,
      totalInteractions,
      avgSentiment,
      totalBookings,
      activeEscalations,
      totalLeads,
      qualifiedLeads,
      fcrRate,
      inboundCount: parseInt(iRow.inbound_count, 10) || 0,
      outboundCount: parseInt(iRow.outbound_count, 10) || 0,
    };
  });
}
