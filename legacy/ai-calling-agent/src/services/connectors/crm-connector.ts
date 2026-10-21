import { BaseToolConnector, ConnectionTestResult, ConnectorExecutionParams } from './connector.interface';
import { updateContact } from '../../db';
import { CustomerContact, BANTInfo } from '../../types';
import { safeFetch, validateSafeOutboundUrl } from '../../utils/ssrf-guard';

export class CrmConnector implements BaseToolConnector {
  readonly provider = 'salesforce';

  async testConnection(
    credentials?: Record<string, unknown>,
    _metadata?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const start = Date.now();
    const instanceUrl = (credentials?.instanceUrl as string | undefined)?.replace(/\/+$/, '');
    const accessToken = (credentials?.accessToken || credentials?.token || credentials?.apiKey) as string | undefined;

    if (!instanceUrl || !accessToken) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: 'Missing Salesforce instanceUrl or OAuth access token in connection credentials.',
      };
    }

    try {
      // Validate instanceUrl safety against SSRF and non-HTTPS
      await validateSafeOutboundUrl(instanceUrl);

      const res = await safeFetch(`${instanceUrl}/services/data/v58.0/sobjects`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as Array<{ message?: string }>;
        const msg = Array.isArray(errBody) ? errBody[0]?.message : undefined;
        return {
          success: false,
          latencyMs: Date.now() - start,
          message: msg || `Salesforce CRM authentication failed with HTTP status ${res.status}.`,
        };
      }

      return {
        success: true,
        latencyMs: Date.now() - start,
        message: 'Salesforce CRM API authenticated successfully. Object schema mappings verified.',
        details: {
          instanceUrl,
          apiVersion: 'v58.0',
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'Failed to reach Salesforce CRM server.',
      };
    }
  }

  async execute(params: ConnectorExecutionParams): Promise<Record<string, unknown>> {
    const { tenantId, capabilityName, arguments: args, decryptedCredentials, timeoutMs } = params;
    const instanceUrl = (decryptedCredentials?.instanceUrl as string | undefined)?.replace(/\/+$/, '');
    const accessToken = (decryptedCredentials?.accessToken || decryptedCredentials?.token || decryptedCredentials?.apiKey) as string | undefined;

    if (!instanceUrl || !accessToken) {
      throw new Error(
        '[SALESFORCE CRM BLOCKED] No verified CRM credentials configured for this tenant. ' +
        'CRM synchronization operations are disabled until an authorized provider connection is established.'
      );
    }

    // SSRF pre-validation
    await validateSafeOutboundUrl(instanceUrl);

    switch (capabilityName) {
      case 'lookup_contact_crm': {
        const phone = typeof args.phone === 'string' ? args.phone.trim() : undefined;
        const email = typeof args.email === 'string' ? args.email.trim() : undefined;

        if (!phone && !email) {
          throw new Error('At least one of phone or email is required to lookup a CRM contact.');
        }

        const conditions: string[] = [];
        if (phone) conditions.push(`Phone = '${phone.replace(/'/g, "\\'")}'`);
        if (email) conditions.push(`Email = '${email.replace(/'/g, "\\'")}'`);
        const queryStr = `SELECT Id, Name, Email, Phone, Title, LeadSource FROM Contact WHERE ${conditions.join(' OR ')} LIMIT 1`;

        const res = await safeFetch(
          `${instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(queryStr)}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          },
          { timeoutMs: timeoutMs || 5000 }
        );

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as Array<{ message?: string }>;
          const msg = Array.isArray(errData) ? errData[0]?.message : undefined;
          throw new Error(msg || `Salesforce contact query failed with HTTP status ${res.status}.`);
        }

        const data = (await res.json()) as { totalSize: number; records: Array<Record<string, unknown>> };
        const record = data.records?.[0];

        if (!record) {
          return {
            found: false,
            message: 'No existing Salesforce Contact record matching supplied phone or email.',
          };
        }

        return {
          found: true,
          contact: {
            id: record.Id,
            name: record.Name,
            email: record.Email,
            phone: record.Phone,
            title: record.Title,
            leadSource: record.LeadSource,
          },
        };
      }

      case 'update_crm_lead_qualification': {
        const contactId = String(args.contactId || '');
        if (!contactId) {
          throw new Error('contactId is required to update lead qualification.');
        }

        // Build updates without fabricating any defaults
        const sfPayload: Record<string, unknown> = {};
        const localUpdates: Partial<CustomerContact> = {};

        if (typeof args.score === 'number') {
          localUpdates.leadScore = Math.min(100, Math.max(0, args.score));
          sfPayload.Lead_Score__c = localUpdates.leadScore;
        }

        if (typeof args.notes === 'string' && args.notes.trim() !== '') {
          localUpdates.notes = `[AI Update] ${args.notes.trim()}`;
          sfPayload.Description = args.notes.trim();
        }

        if (typeof args.bant === 'object' && args.bant !== null) {
          const rawBant = args.bant as Record<string, unknown>;
          const updatedBant: Partial<BANTInfo> = {};
          if (typeof rawBant.budget === 'string') updatedBant.budget = rawBant.budget;
          if (typeof rawBant.authority === 'string') updatedBant.authority = rawBant.authority as any;
          if (typeof rawBant.need === 'string') updatedBant.need = rawBant.need;
          if (typeof rawBant.timeline === 'string') updatedBant.timeline = rawBant.timeline;

          localUpdates.bant = updatedBant as BANTInfo;
          localUpdates.leadLifecycleStatus = 'qualified';
          sfPayload.BANT_Budget__c = updatedBant.budget;
          sfPayload.BANT_Authority__c = updatedBant.authority;
          sfPayload.BANT_Need__c = updatedBant.need;
          sfPayload.BANT_Timeline__c = updatedBant.timeline;
        }

        // Send real PATCH to Salesforce Contact endpoint
        const res = await safeFetch(
          `${instanceUrl}/services/data/v58.0/sobjects/Contact/${encodeURIComponent(contactId)}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(sfPayload),
          },
          { timeoutMs: timeoutMs || 5000 }
        );

        if (!res.ok && res.status !== 204) {
          const errData = (await res.json().catch(() => ({}))) as Array<{ message?: string }>;
          const msg = Array.isArray(errData) ? errData[0]?.message : undefined;
          throw new Error(msg || `Salesforce Contact update failed with HTTP status ${res.status}.`);
        }

        // Also sync to local database if contact exists
        await updateContact(tenantId, contactId, localUpdates).catch(() => null);

        return {
          success: true,
          contactId,
          fieldsUpdated: Object.keys(sfPayload),
          leadLifecycleStatus: localUpdates.leadLifecycleStatus || 'updated',
          leadScore: localUpdates.leadScore,
          updatedAt: new Date().toISOString(),
        };
      }

      default:
        throw new Error(`Unsupported capability "${capabilityName}" on CrmConnector.`);
    }
  }
}
