export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'nurturing'
  | 'booked'
  | 'closed';

export type LeadLifecycleStatus =
  | 'new'
  | 'queued_outbound'
  | 'calling'
  | 'connected'
  | 'qualified'
  | 'booked'
  | 'escalated'
  | 'failed_retry'
  | 'closed';

export interface TimelineEvent {
  id: string;
  tenantId: string;
  contactId: string;
  event: string;
  details: string;
  status: string;
  createdAt: string;
}

export interface Interaction {
  id: string;
  tenantId: string;
  contactId: string;
  acuityWorkflowId: number | null;
  acuityDefinitionId: number | null;
  acuityRunId: string | null;
  channel: string;
  direction: 'inbound' | 'outbound';
  durationSeconds: number;
  sentimentScore: number | null;
  sentimentLabel: string | null;
  summary: string;
  disposition: string;
  rawPayload: Record<string, unknown>;
  createdAt: string;
}

export interface Contact {
  id: string;
  tenantId: string;
  name: string;
  company?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar?: string | null;
  status: LeadStatus;
  lifecycleStatus: LeadLifecycleStatus;
  leadScore?: number | null;
  estimatedValue?: string | null;
  tags: string[];
  notes: string;
  customFields: Record<string, unknown>;
  callAttempts: number;
  lastCallResult?: string | null;
  lastContactedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  timeline?: TimelineEvent[];
}

export interface CreateContactInput {
  name: string;
  company?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: LeadStatus;
  lifecycleStatus?: LeadLifecycleStatus;
  estimatedValue?: string | null;
  tags?: string[];
  notes?: string;
}
