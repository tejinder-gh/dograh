export type ChannelType = 'call_inbound' | 'call_outbound' | 'sms' | 'whatsapp' | 'webchat';

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'nurturing' | 'booked' | 'closed';

export interface BANTInfo {
  budget: string;
  authority: 'decision_maker' | 'influencer' | 'individual';
  need: string;
  timeline: string;
}

export interface CustomerContact {
  id: string;
  name: string;
  company?: string;
  role?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  status: LeadStatus;
  leadScore: number; // 0-100
  estimatedValue?: string;
  tags: string[];
  notes: string;
  bant?: BANTInfo;
  leadLifecycleStatus?: 'new' | 'queued_outbound' | 'calling' | 'connected' | 'qualified' | 'booked' | 'escalated' | 'failed_retry' | 'closed';
  callAttempts?: number;
  lastCallResult?: 'connected' | 'busy' | 'no_answer' | 'voicemail' | 'booked_session' | 'escalated';
  leadAuditTimeline?: LeadTimelineEvent[];
  createdAt: string;
  lastContactedAt?: string;
}

export interface ChatMessage {
  id: string;
  speaker: 'agent' | 'customer' | 'system';
  text: string;
  timestamp: string;
  sentiment?: number; // -100 to 100
  empathyPillar?: string; // e.g. "Active Validation", "Solution Offer", "Empathy De-escalation"
  bookingTriggered?: boolean;
}

export interface InteractionLog {
  id: string;
  contactId: string;
  contactName: string;
  contactCompany: string;
  contactAvatar: string;
  channel: ChannelType;
  timestamp: string;
  durationSeconds: number;
  sentimentScore: number;
  sentimentCategory: 'positive' | 'neutral' | 'frustrated' | 'critical';
  wasEscalated: boolean;
  escalationReason?: string;
  summary: string;
  transcript: ChatMessage[];
  bookedSessionId?: string;
}

export interface CompanyRepresentative {
  id: string;
  name: string;
  role: string;
  specialization: string;
  email: string;
  avatar: string;
  availableDays: string[];
  availableSlots: string[];
}

export interface ScheduledSession {
  id: string;
  contactId: string;
  contactName: string;
  company: string;
  contactEmail: string;
  contactPhone: string;
  representativeId: string;
  representativeName: string;
  representativeRole: string;
  representativeAvatar: string;
  date: string;
  timeSlot: string;
  durationMinutes: number;
  meetingType: '30-min Discovery' | '45-min Technical Deep Dive' | 'VIP Executive Consultation' | string;
  status: 'pending_confirmation' | 'confirmed' | 'rescheduled' | 'completed' | 'cancelled';
  agendaNotes: string;
  calendarInviteSent: boolean;
  googleCalendarEventId?: string;
  googleCalendarLink?: string;
  domainId?: string;
  createdAt: string;
}

export interface EscalationTicket {
  id: string;
  contactId: string;
  contactName: string;
  customerCompany: string;
  channel: ChannelType;
  triggeredAt: string;
  urgencyLevel: 'high' | 'critical';
  status: 'pending' | 'in_review' | 'resolved';
  sentimentScore: number;
  triggerReason: string;
  supervisorNotes?: string;
  slaMinutesRemaining: number;
}

export interface AgentResponsePayload {
  agentResponse: string;
  reply?: string;
  sentiment?: {
    score: number;
    category: 'positive' | 'neutral' | 'frustrated' | 'critical';
  };
  sentimentScore: number; // -100 to 100
  sentimentCategory: 'positive' | 'neutral' | 'frustrated' | 'critical';
  escalationRequired: boolean;
  escalationReason?: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  escalationAssessment?: {
    isEscalated: boolean;
    reason?: string;
    urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  leadQualified: boolean;
  leadQualification?: {
    isQualified: boolean;
    tier: 'enterprise' | 'growth' | 'standard';
    leadScore: number;
  };
  detectedIntent: string;
  bookingSuggested: boolean;
  bookingDetails?: {
    recommendedRep?: string;
    suggestedDate?: string;
    meetingType?: string;
  };
  recommendedRepresentative?: string;
  empathyTechniqueUsed?: string;
  audioBase64?: string;
  ragCitations?: string[];
  matchedRagChunks?: { title: string; section?: string; text: string }[];
  escalationTicketCreated?: EscalationTicket;
  resolvedPromptMetadata?: {
    activeLayers: string[];
    versionId?: string;
  };
}

export interface EscalationPerson {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  tier: 'Tier 1 Support Lead' | 'Tier 2 Technical Architect' | 'Tier 3 Executive On-Call';
  channels: ('sms' | 'call' | 'whatsapp' | 'email')[];
  activeOnCall: boolean;
}

export interface RagChunk {
  id: string;
  title: string;
  text: string;
  section?: string;
}

export interface RagDocument {
  id: string;
  clientId: string;
  fileName: string;
  fileSize: string;
  uploadedAt: string;
  chunkCount: number;
  extractedContent: string;
  chunks: RagChunk[];
  policyRules: string[];
}

export interface ParallelCallJob {
  id: string;
  clientId: string;
  leadId: string;
  leadName: string;
  leadCompany: string;
  phoneNumber: string;
  lineIndex: number;
  status: 'idle' | 'dialing' | 'connected' | 'speaking' | 'completed' | 'failed' | 'booked';
  durationSeconds: number;
  sentimentScore?: number;
  failureReason?: string;
  transcriptSummary?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface LeadTimelineEvent {
  timestamp: string;
  event: string;
  details: string;
  status: string;
}

export interface ClientCompanyDomain {
  id: string;
  name: string;
  domain: string;
  industry: string;
  description: string;
  brandTone: string;
  knowledgeBaseSnippets: string[];
  inboundGoal: string;
  inboundCalendarLink: string;
  inboundRepId: string;
  outboundGoal: string;
  outboundCalendarLink: string;
  outboundRepId: string;
  ragDocuments?: RagDocument[];
  escalationTeam?: EscalationPerson[];
  strictRagPolicy?: 'strict_zero_hallucination' | 'balanced' | 'creative_advisory';
  operatingHours?: {
    timezone?: string;
    days?: string[];
    slots?: string[];
  };
  parallelCallingConfig?: {
    maxConcurrentLines: number;
    ringTimeoutSeconds: number;
    retryFailedCalls: boolean;
    callDelayMs: number;
  };
  voipSettings?: {
    provider: 'webrtc' | 'twilio_sip' | 'telnyx' | 'websocket_stream' | 'livekit' | 'vonage';
    sipEndpoint?: string;
    sipAuthUsername?: string;
    sipAuthPassword?: string;
    websocketUrl?: string;
    callerIdNumber: string;
    codecs: string[];
    iceServers?: { urls: string; username?: string; credential?: string }[];
    callRecordingEnabled?: boolean;
    webhookCallbackUrl?: string;
    messagingSettings?: {
      whatsappPhoneNumberId?: string;
      whatsappWebhookToken?: string;
      smsProviderSid?: string;
      emailSenderDomain?: string;
    };
  };
  createdAt: string;
}

export type PlatformLeadField =
  | 'name'
  | 'email'
  | 'phone'
  | 'company'
  | 'role'
  | 'estimatedValue'
  | 'budget'
  | 'timeline'
  | 'notes'
  | 'ignore';

export interface LeadUploadFieldMapping {
  originalHeader: string;
  mappedField: PlatformLeadField;
  confidence: number;
  explanation: string;
}

export interface UploadedLead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  estimatedValue?: string;
  budget?: string;
  timeline?: string;
  notes?: string;
  status: 'pending_call' | 'called' | 'booked' | 'declined';
  uploadedAt: string;
  sourceFileName: string;
}


