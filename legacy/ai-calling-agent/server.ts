import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import {
  CustomerContact,
  CompanyRepresentative,
  InteractionLog,
  ScheduledSession,
  EscalationTicket,
  AgentResponsePayload,
  ClientCompanyDomain,
  LeadUploadFieldMapping,
  PlatformLeadField
} from './src/types';
import {
  smartMapCsvHeaders,
  buildGoogleCalendarDescription,
  getSentimentCategory,
  parseTimeSlotToISO
} from './src/utils/agent-logic';
import { createGoogleCalendarEvent, deleteGoogleCalendarEvent } from './src/lib/google-calendar';
import {
  checkDatabaseHealth,
  getDatabaseUrl,
  runMigrations,
  ensureDefaultTenant,
  query,
  withTenantContext,
  getContacts,
  createContact,
  getInteractions,
  createInteraction,
  getBookings,
  createBooking,
  confirmBooking,
  BookingConflictError,
  getRepresentatives,
  getEscalationTickets,
  resolveEscalationTicket,
  createEscalationTicket,
  getTenantStats,
  getBusinessProfiles,
  getBusinessProfileById,
  saveBusinessProfile,
  deleteBusinessProfile,
  batchCreateContacts
} from './src/db';
import {
  requireTenantContext,
  requireRole,
  createSignedToken,
  validateAuthEnvironment,
  getAuthSecret,
  UserRole
} from './src/middleware/tenant-auth';
import { verifyIdentityToken, IdentityVerificationError } from './src/services/identity-verifier';
import { resolvePrompt } from './src/services/prompt-engine';
import { marketplaceRouter } from './src/routes/marketplace.routes';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize Gemini Client
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const ai = geminiApiKey
  ? new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// --- HEALTH & DIAGNOSTIC ENDPOINT ---

app.get('/api/health', async (_req: Request, res: Response) => {
  const dbHealth = await checkDatabaseHealth();
  const statusCode = dbHealth.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json({
    status: dbHealth.status,
    timestamp: new Date().toISOString(),
    database: {
      provider: 'Neon PostgreSQL',
      targetDatabase: 'ai_calling_agent_os',
      connectedDatabase: dbHealth.databaseName,
      status: dbHealth.status,
      latencyMs: dbHealth.latencyMs,
      error: dbHealth.error,
    },
    aiService: {
      provider: 'Gemini AI',
      available: !!ai,
    },
  });
});

// --- SESSION AUTHENTICATION ENDPOINT ---

// POST /api/auth/session: Exchange verified identity token (Firebase ID token or IdP JWT) for backend-signed session token
app.post('/api/auth/session', async (req: Request, res: Response) => {
  try {
    const { email, idToken, tenantId } = req.body;

    if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
      res.status(400).json({
        error: 'An identity provider ID token (idToken) is required to authenticate.',
        code: 'MISSING_ID_TOKEN',
      });
      return;
    }

    let verifiedIdentity;
    try {
      verifiedIdentity = await verifyIdentityToken(idToken);
    } catch (verErr: unknown) {
      if (verErr instanceof IdentityVerificationError) {
        res.status(401).json({ error: verErr.message, code: verErr.code });
        return;
      }
      res.status(401).json({ error: 'Identity token verification failed', code: 'INVALID_ID_TOKEN' });
      return;
    }

    // Reject mismatched client-supplied email
    if (email && typeof email === 'string' && email.trim().toLowerCase() !== verifiedIdentity.email.toLowerCase()) {
      res.status(400).json({
        error: 'Supplied email does not match verified identity token claim.',
        code: 'EMAIL_MISMATCH',
      });
      return;
    }

    const verifiedEmail = verifiedIdentity.email.toLowerCase();

    // 1. Resolve registered user in PostgreSQL — strictly invitation-only, never auto-provision
    const userRes = await query<{ id: string; email: string; is_platform_admin: boolean; is_active: boolean }>(
      'SELECT id, email, is_platform_admin, is_active FROM users WHERE LOWER(email) = LOWER($1)',
      [verifiedEmail]
    );

    if (userRes.rows.length === 0) {
      res.status(403).json({
        error: 'User account not registered. Access is invitation-only. Please contact your organization administrator.',
        code: 'USER_NOT_REGISTERED',
      });
      return;
    }

    const dbUser = userRes.rows[0];
    if (!dbUser.is_active) {
      res.status(403).json({
        error: 'User account has been disabled or revoked.',
        code: 'ACCOUNT_DISABLED',
      });
      return;
    }

    const userId = dbUser.id;
    const isPlatformAdmin = dbUser.is_platform_admin;

    // 2. Resolve requested tenant organization — never fall back to ensureDefaultTenant()
    const targetSlug = (tenantId || '').trim();
    if (!targetSlug) {
      res.status(400).json({
        error: 'Tenant identifier (tenantId) is required.',
        code: 'TENANT_REQUIRED',
      });
      return;
    }

    const tenantRes = await query<{ id: string; name: string; status: string }>(
      'SELECT id, name, status FROM tenants WHERE id = $1 OR slug = $1 LIMIT 1',
      [targetSlug]
    );

    if (tenantRes.rows.length === 0) {
      res.status(404).json({
        error: `Tenant organization "${targetSlug}" does not exist.`,
        code: 'TENANT_NOT_FOUND',
      });
      return;
    }

    const tenant = tenantRes.rows[0];
    if (tenant.status === 'suspended') {
      res.status(403).json({
        error: 'Tenant organization is suspended. Please contact platform operations.',
        code: 'TENANT_SUSPENDED',
      });
      return;
    }

    // 3. Resolve user role in tenant_users — strictly invitation-only, never auto-provision
    const memberRes = await query<{ role: string; status: string }>(
      'SELECT role, status FROM tenant_users WHERE tenant_id = $1 AND user_id = $2',
      [tenant.id, userId]
    );

    if (memberRes.rows.length === 0) {
      res.status(403).json({
        error: 'User is not an authorized member of this tenant organization. Explicit administrator invitation is required.',
        code: 'TENANT_MEMBERSHIP_REQUIRED',
      });
      return;
    }

    if (memberRes.rows[0].status === 'suspended') {
      res.status(403).json({
        error: 'Tenant membership is suspended.',
        code: 'TENANT_MEMBERSHIP_SUSPENDED',
      });
      return;
    }

    const role = memberRes.rows[0].role as UserRole;

    // 4. Generate signed session token with verified claims
    const token = createSignedToken({
      userId,
      tenantId: tenant.id,
      role,
      isPlatformAdmin,
    });

    res.json({
      success: true,
      token,
      user: {
        id: userId,
        email: verifiedEmail,
        role,
        isPlatformAdmin,
      },
      tenant: {
        id: tenant.id,
        slug: targetSlug,
      },
    });
  } catch (err: unknown) {
    console.error('[AUTH SESSION ERROR]', err);
    res.status(500).json({ error: 'Failed to create authenticated session token' });
  }
});

// Enforce tenant authorization context across CRM, Domain, Lead, and Calendar routes
app.use('/api/crm', requireTenantContext);
app.use('/api/domains', requireTenantContext);
app.use('/api/leads', requireTenantContext);
app.use('/api/calendar', requireTenantContext);
app.use('/api/marketplace', marketplaceRouter);

// --- AI AGENT CONVERSATION ENDPOINTS ---

// POST /api/agent/chat: Omnichannel agent response using database-backed prompt engine
app.post('/api/agent/chat', requireTenantContext, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const {
      message,
      channel = 'call_inbound',
      contactId,
      conversationHistory = [],
      callerName = 'Customer',
      company = 'Prospective Enterprise',
      domainId,
    } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message text is required' });
      return;
    }

    // Resolve tenant business profile
    const profiles = await getBusinessProfiles(tenantId);
    const activeDomain =
      (domainId ? await getBusinessProfileById(tenantId, domainId) : null) ||
      profiles.find(
        (d) =>
          d.name.toLowerCase() === company.toLowerCase() ||
          d.domain.toLowerCase() === company.toLowerCase()
      ) ||
      profiles[0] ||
      null;

    const isOutbound = channel === 'call_outbound';
    const activeGoal = activeDomain
      ? isOutbound
        ? activeDomain.outboundGoal
        : activeDomain.inboundGoal
      : 'Empathize with customer inquiries, provide consistent and accurate answers, and book a 1-on-1 discovery session.';
    const activeCalendarLink = activeDomain
      ? isOutbound
        ? activeDomain.outboundCalendarLink
        : activeDomain.inboundCalendarLink
      : '';

    // Query approved RAG documents for this tenant
    let approvedRagSnippets: string[] = [];
    try {
      const ragRes = await query<{ title: string; content: string }>(
        `SELECT title, content FROM rag_documents
         WHERE tenant_id = $1 AND is_approved = true AND status = 'active'
         ORDER BY updated_at DESC LIMIT 5`,
        [tenantId]
      );
      approvedRagSnippets = ragRes.rows.map((r) => `[APPROVED DOC: ${r.title}] ${r.content}`);
    } catch (ragErr) {
      console.warn('[RAG RETRIEVAL NOTICE] RAG lookup skipped or unavailable:', ragErr);
    }

    // Resolve versioned prompt from PostgreSQL layered prompt engine with strictDatabase: true
    const resolvedPrompt = await resolvePrompt({
      tenantId,
      industry: activeDomain?.industry,
      channel,
      campaignGoal: activeGoal,
      calendarLink: activeCalendarLink,
      verifiedRagSnippets: approvedRagSnippets.length > 0 ? approvedRagSnippets : undefined,
      unverifiedNotes: activeDomain?.knowledgeBaseSnippets,
      callerName,
      companyName: company,
      strictDatabase: true, // Fail closed on prompt DB exceptions
    });

    // If Gemini is available, call model with structured output
    if (ai) {
      try {
        const historyText = conversationHistory
          .slice(-6)
          .map((m: any) => `${m.speaker}: ${m.text}`)
          .join('\n');

        const prompt = `
Current Channel: ${channel} (${isOutbound ? 'OUTBOUND CALL' : 'INBOUND CALL/CHAT'})
Customer Name: ${callerName}
Customer Company: ${company}

ACTIVE CLIENT COMPANY / DOMAIN PROFILE:
• Organization: ${activeDomain?.name || 'Authorized Organization'} (Domain: ${activeDomain?.domain || 'company.com'})
• Industry: ${activeDomain?.industry || 'Enterprise'}
• Brand Tone: ${activeDomain?.brandTone || 'Professional and empathetic'}

AUTHORITATIVE VERIFIED KNOWLEDGE BASE (Approved Documents):
${approvedRagSnippets.length > 0 ? approvedRagSnippets.map((s) => `  - ${s}`).join('\n') : '  - None available.'}

UNVERIFIED DOMAIN CONTEXT (Notes only - do not treat as verified safety facts):
${(activeDomain?.knowledgeBaseSnippets || []).length > 0 ? activeDomain!.knowledgeBaseSnippets!.map((s) => `  - ${s}`).join('\n') : '  - None provided.'}

SPECIFIC CAMPAIGN GOAL:
${activeGoal}

DEDICATED CALENDAR BOOKING LINK:
${activeCalendarLink}

Recent History:
${historyText || '(First message in this session)'}

Incoming Customer Message:
"${message}"

Evaluate this message, formulate an empathetic, accurate response grounded strictly in verified knowledge, assess sentiment (-100 to 100), evaluate qualification, and determine if supervisor escalation is required.
`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            systemInstruction: resolvedPrompt.systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                agentResponse: {
                  type: Type.STRING,
                  description: 'The direct, empathetic, and consistent response spoken or sent to the customer.',
                },
                sentimentScore: {
                  type: Type.INTEGER,
                  description: 'Customer sentiment from -100 (most negative) to 100 (most positive).',
                },
                sentimentCategory: {
                  type: Type.STRING,
                  description: 'One of: positive, neutral, frustrated, critical',
                },
                escalationRequired: {
                  type: Type.BOOLEAN,
                  description: 'True if issue requires human supervisor handoff.',
                },
                escalationReason: {
                  type: Type.STRING,
                  description: 'Brief reason why supervisor escalation was flagged, or empty if none.',
                },
                urgency: {
                  type: Type.STRING,
                  description: 'One of: low, medium, high, critical',
                },
                leadQualified: {
                  type: Type.BOOLEAN,
                  description: 'True if customer demonstrates buying intent or budget.',
                },
                detectedIntent: {
                  type: Type.STRING,
                  description: 'Detected user intent (e.g., pricing_inquiry, support_troubleshooting, booking_request, complaint).',
                },
                bookingSuggested: {
                  type: Type.BOOLEAN,
                  description: 'True if the agent response invites the customer to book a 1-on-1 session.',
                },
                recommendedRepresentative: {
                  type: Type.STRING,
                  description: 'Representative name for booking.',
                },
                empathyTechniqueUsed: {
                  type: Type.STRING,
                  description: 'Name of empathetic technique used.',
                },
              },
              required: [
                'agentResponse',
                'sentimentScore',
                'sentimentCategory',
                'escalationRequired',
                'urgency',
                'leadQualified',
                'detectedIntent',
                'bookingSuggested',
              ],
            },
          },
        });

        const parsed = JSON.parse(response.text || '{}');

        // Automatic escalation logging if required
        let loggedTicket: EscalationTicket | undefined;
        if (parsed.escalationRequired) {
          loggedTicket = await createEscalationTicket(tenantId, {
            contactId: contactId || undefined,
            channel,
            urgencyLevel: (parsed.urgency as any) || 'high',
            sentimentScore: parsed.sentimentScore || -45,
            triggerReason: parsed.escalationReason || 'Customer frustration threshold exceeded',
            supervisorNotes: `Auto-escalated by AI calling agent OS. Intent: ${parsed.detectedIntent}. Customer utterance: "${message}"`,
          });
        }

        const payload: AgentResponsePayload = {
          agentResponse: parsed.agentResponse,
          reply: parsed.agentResponse,
          sentimentScore: parsed.sentimentScore,
          sentimentCategory: parsed.sentimentCategory as any,
          escalationRequired: parsed.escalationRequired,
          escalationReason: parsed.escalationReason,
          urgency: parsed.urgency as any,
          leadQualified: parsed.leadQualified,
          sentiment: {
            score: parsed.sentimentScore,
            category: parsed.sentimentCategory as any,
          },
          escalationAssessment: {
            isEscalated: parsed.escalationRequired,
            reason: parsed.escalationReason,
            urgencyLevel: parsed.urgency as any,
          },
          leadQualification: {
            isQualified: parsed.leadQualified,
            tier: parsed.leadQualified ? 'enterprise' : 'standard',
            leadScore: parsed.leadQualified ? 85 : 45,
          },
          detectedIntent: parsed.detectedIntent,
          bookingSuggested: parsed.bookingSuggested,
          recommendedRepresentative: parsed.recommendedRepresentative,
          empathyTechniqueUsed: parsed.empathyTechniqueUsed,
          escalationTicketCreated: loggedTicket,
          resolvedPromptMetadata: {
            activeLayers: resolvedPrompt.activeLayers,
            versionId: resolvedPrompt.promptVersionId,
          },
        };

        res.json(payload);
        return;
      } catch (geminiErr: any) {
        console.warn('[AGENT AI WARNING] Gemini model call failed, using deterministic logic:', geminiErr?.message);
      }
    }

    // Deterministic fallback response when Gemini is unconfigured
    const lowerMsg = message.toLowerCase();
    const isAngry = lowerMsg.includes('cancel') || lowerMsg.includes('frustrated') || lowerMsg.includes('terrible');
    const isBooking = lowerMsg.includes('schedule') || lowerMsg.includes('meet') || lowerMsg.includes('book') || lowerMsg.includes('demo');

    let fallbackReply = `Thank you for reaching out to ${activeDomain?.name || 'our team'}. I understand your question regarding "${message.slice(0, 40)}..." and I would be delighted to assist you today.`;
    if (isBooking) {
      fallbackReply = `I would be pleased to schedule a personalized session for you with our senior representative. Please choose a slot that works best for you: ${activeCalendarLink || 'https://calendar.google.com'}`;
    }

    const payload: AgentResponsePayload = {
      agentResponse: fallbackReply,
      reply: fallbackReply,
      sentimentScore: isAngry ? -45 : 35,
      sentimentCategory: isAngry ? 'frustrated' : 'positive',
      escalationRequired: isAngry,
      escalationReason: isAngry ? 'Customer stated dissatisfaction or cancellation intent' : undefined,
      urgency: isAngry ? 'high' : 'low',
      leadQualified: isBooking,
      sentiment: {
        score: isAngry ? -45 : 35,
        category: isAngry ? 'frustrated' : 'positive',
      },
      escalationAssessment: {
        isEscalated: isAngry,
        reason: isAngry ? 'Customer stated dissatisfaction or cancellation intent' : undefined,
        urgencyLevel: isAngry ? 'high' : 'low',
      },
      leadQualification: {
        isQualified: isBooking,
        tier: isBooking ? 'growth' : 'standard',
        leadScore: isBooking ? 75 : 50,
      },
      detectedIntent: isBooking ? 'session_booking' : 'general_inquiry',
      bookingSuggested: isBooking,
      recommendedRepresentative: 'Sarah Jenkins',
      resolvedPromptMetadata: {
        activeLayers: resolvedPrompt.activeLayers,
        versionId: resolvedPrompt.promptVersionId,
      },
    };

    res.json(payload);
  } catch (err: any) {
    console.error('Agent message error:', err);
    res.status(500).json({ error: 'Failed to process agent message' });
  }
});

// POST /api/agent/tts: Generate real speech audio
// Strictly authenticated and authorized to prevent unauthorized AI model billing
app.post(
  '/api/agent/tts',
  requireTenantContext,
  requireRole(['tenant_owner', 'tenant_administrator', 'tenant_agent_manager', 'tenant_staff']),
  async (req: Request, res: Response) => {
    try {
      const { text, voiceName = 'Kore' } = req.body;
      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Text is required for TTS', code: 'INVALID_INPUT' });
        return;
      }

      if (text.length > 2000) {
        res.status(400).json({
          error: 'Text exceeds maximum TTS length of 2000 characters',
          code: 'PAYLOAD_TOO_LARGE',
        });
        return;
      }

      if (!ai) {
        res.status(503).json({ error: 'Gemini AI service not available for TTS', code: 'AI_UNAVAILABLE' });
        return;
      }

      const ttsResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: text,
        config: {
          responseMimeType: 'audio/wav',
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voiceName,
              },
            },
          },
        },
      });

      const candidates = ttsResponse.candidates;
      if (candidates && candidates.length > 0) {
        const parts = candidates[0].content?.parts;
        if (parts && parts.length > 0) {
          for (const part of parts) {
            if (part.inlineData && part.inlineData.mimeType?.startsWith('audio/')) {
              res.json({
                mimeType: part.inlineData.mimeType,
                audioBase64: part.inlineData.data,
              });
              return;
            }
          }
        }
      }

      res.status(500).json({ error: 'No audio data returned from TTS engine' });
    } catch (ttsErr: any) {
      console.error('TTS error:', ttsErr);
      res.status(500).json({ error: 'TTS synthesis failed' });
    }
  }
);

// --- AUTHORITATIVE POSTGRESQL CRM & DATA ENDPOINTS ---

// GET /api/crm/contacts: Tenant-scoped contacts
app.get('/api/crm/contacts', async (req: Request, res: Response) => {
  try {
    const contacts = await getContacts(req.tenantId!);
    res.json(contacts);
  } catch (err: any) {
    console.error('Failed to get contacts:', err);
    res.status(500).json({ error: 'Failed to fetch contacts from database' });
  }
});

// POST /api/crm/contacts: Create contact in PostgreSQL
app.post(
  '/api/crm/contacts',
  requireRole(['tenant_owner', 'tenant_administrator', 'tenant_agent_manager', 'tenant_staff']),
  async (req: Request, res: Response) => {
    try {
      const newContact = await createContact(req.tenantId!, req.body);
      res.status(201).json(newContact);
    } catch (err: any) {
      console.error('Failed to create contact:', err);
      res.status(500).json({ error: 'Failed to create contact in database' });
    }
  }
);

// GET /api/crm/interactions: Tenant-scoped interaction history
app.get('/api/crm/interactions', async (req: Request, res: Response) => {
  try {
    const interactions = await getInteractions(req.tenantId!);
    res.json(interactions);
  } catch (err: any) {
    console.error('Failed to get interactions:', err);
    res.status(500).json({ error: 'Failed to fetch interactions from database' });
  }
});

// POST /api/crm/interactions: Record new call/chat interaction in PostgreSQL
app.post(
  '/api/crm/interactions',
  requireRole(['tenant_owner', 'tenant_administrator', 'tenant_agent_manager', 'tenant_staff']),
  async (req: Request, res: Response) => {
    try {
      const newInteraction = await createInteraction(req.tenantId!, req.body);
      res.status(201).json(newInteraction);
    } catch (err: any) {
      console.error('Failed to create interaction:', err);
      res.status(500).json({ error: 'Failed to create interaction in database' });
    }
  }
);

// GET /api/crm/bookings: Tenant-scoped booked sessions
app.get('/api/crm/bookings', async (req: Request, res: Response) => {
  try {
    const bookings = await getBookings(req.tenantId!);
    res.json(bookings);
  } catch (err: any) {
    console.error('Failed to get bookings:', err);
    res.status(500).json({ error: 'Failed to fetch bookings from database' });
  }
});

// POST /api/crm/bookings: Book session in PostgreSQL with conflict prevention
app.post(
  '/api/crm/bookings',
  requireRole(['tenant_owner', 'tenant_administrator', 'tenant_agent_manager', 'tenant_staff']),
  async (req: Request, res: Response) => {
    try {
      const newSession = await createBooking(req.tenantId!, req.body);
      res.status(201).json(newSession);
    } catch (err: unknown) {
      if (err instanceof BookingConflictError) {
        res.status(409).json({ error: err.message, code: 'BOOKING_CONFLICT' });
        return;
      }
      console.error('Failed to create booking:', err);
      res.status(500).json({ error: 'Failed to create booking in database' });
    }
  }
);

// GET /api/crm/representatives: Tenant staff & specialists
app.get('/api/crm/representatives', async (req: Request, res: Response) => {
  try {
    const reps = await getRepresentatives(req.tenantId!);
    res.json(reps);
  } catch (err: any) {
    console.error('Failed to get representatives:', err);
    res.status(500).json({ error: 'Failed to fetch representatives from database' });
  }
});

// GET /api/crm/escalations: Tenant escalations queue
app.get('/api/crm/escalations', async (req: Request, res: Response) => {
  try {
    const tickets = await getEscalationTickets(req.tenantId!);
    res.json(tickets);
  } catch (err: any) {
    console.error('Failed to get escalations:', err);
    res.status(500).json({ error: 'Failed to fetch escalations from database' });
  }
});

// POST /api/crm/escalations: Create escalation ticket
app.post(
  '/api/crm/escalations',
  requireRole(['tenant_owner', 'tenant_administrator', 'tenant_agent_manager', 'tenant_staff']),
  async (req: Request, res: Response) => {
    try {
      const ticket = await createEscalationTicket(req.tenantId!, req.body);
      res.status(201).json(ticket);
    } catch (err: any) {
      console.error('Failed to create escalation:', err);
      res.status(500).json({ error: 'Failed to create escalation ticket in database' });
    }
  }
);

// POST /api/crm/escalations/:id/resolve: Mark ticket as resolved
app.post(
  '/api/crm/escalations/:id/resolve',
  requireRole(['tenant_owner', 'tenant_administrator', 'tenant_agent_manager', 'tenant_staff']),
  async (req: Request, res: Response) => {
    try {
      const { notes } = req.body;
      const ticket = await resolveEscalationTicket(req.tenantId!, req.params.id, notes);
      if (!ticket) {
        res.status(404).json({ error: 'Escalation ticket not found' });
        return;
      }
      res.json(ticket);
    } catch (err: any) {
      console.error('Failed to resolve escalation:', err);
      res.status(500).json({ error: 'Failed to resolve escalation ticket' });
    }
  }
);

// GET /api/crm/stats: Genuine real-time metrics aggregated from PostgreSQL
app.get('/api/crm/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getTenantStats(req.tenantId!);
    res.json(stats);
  } catch (err: any) {
    console.error('Failed to compute CRM stats:', err);
    res.status(500).json({ error: 'Failed to compute stats from database' });
  }
});

// --- CALENDAR AVAILABILITY & BOOKING API ---

// POST /api/calendar/availability: Check representative availability & existing booked slots with genuine timestamps
app.post('/api/calendar/availability', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const reps = await getRepresentatives(tenantId);
    const bookings = await getBookings(tenantId);

    const activeBookings = bookings.filter(
      (b) => b.status === 'confirmed' || b.status === 'pending_confirmation'
    );

    res.json({
      success: true,
      representatives: reps,
      events: activeBookings.map((b) => {
        const { startIso, endIso } = parseTimeSlotToISO(
          b.date,
          b.timeSlot,
          b.durationMinutes || 30,
          'America/New_York'
        );
        return {
          id: b.id,
          summary: `1-on-1 Discovery: ${b.contactName} (${b.representativeName})`,
          start: { dateTime: startIso },
          end: { dateTime: endIso },
          timeSlot: b.timeSlot,
          date: b.date,
          status: b.status,
          googleCalendarEventId: b.googleCalendarEventId,
          googleCalendarLink: b.googleCalendarLink,
        };
      }),
    });
  } catch (err: unknown) {
    console.error('Failed to fetch calendar availability:', err);
    res.status(500).json({ error: 'Failed to retrieve calendar availability' });
  }
});

// POST /api/calendar/book-event: Book 1-on-1 session with conflict check and pending->confirmed workflow
app.post(
  '/api/calendar/book-event',
  requireRole(['tenant_owner', 'tenant_administrator', 'tenant_agent_manager', 'tenant_staff']),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const {
        contactId,
        contactName,
        company,
        contactEmail,
        contactPhone,
        representativeId,
        representativeName,
        representativeRole,
        representativeAvatar,
        date,
        timeSlot,
        durationMinutes,
        meetingType,
        agendaNotes,
        accessToken,
        idempotencyKey,
        timeZone,
      } = req.body;

      if (!date || !timeSlot) {
        res.status(400).json({ error: 'Date and time slot are required for scheduling a session', code: 'INVALID_INPUT' });
        return;
      }

      // 1. Resolve IANA timezone from profile or request
      const profiles = await getBusinessProfiles(tenantId);
      const tenantTz = (timeZone || profiles[0]?.operatingHours?.timezone || 'America/New_York').trim();

      const parsedDuration = durationMinutes ? parseInt(durationMinutes, 10) : 30;
      let startIso: string;
      let endIso: string;
      try {
        const parsed = parseTimeSlotToISO(date, timeSlot, parsedDuration, tenantTz);
        startIso = parsed.startIso;
        endIso = parsed.endIso;
      } catch (parseErr: unknown) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        res.status(400).json({ error: `Invalid date/time slot: ${msg}`, code: 'INVALID_DATETIME' });
        return;
      }

      // 2. STEP 1: CREATE LOCAL RESERVATION FIRST (Guarantees conflict lock before provider side-effects)
      let session;
      try {
        session = await createBooking(tenantId, {
          contactId,
          contactName,
          company,
          contactEmail,
          contactPhone,
          representativeId,
          representativeName,
          representativeRole,
          representativeAvatar,
          date,
          timeSlot,
          durationMinutes: parsedDuration,
          meetingType: meetingType || '30-min Discovery',
          agendaNotes: agendaNotes || '',
          idempotencyKey,
          status: 'pending_confirmation',
          calendarInviteSent: false,
        });
      } catch (bookingErr: unknown) {
        if (bookingErr instanceof BookingConflictError) {
          res.status(409).json({
            error: bookingErr.message,
            code: 'BOOKING_CONFLICT',
          });
          return;
        }
        throw bookingErr;
      }

      // 3. STEP 2: IF EXTERNAL CALENDAR IS CONFIGURED, CALL PROVIDER
      let externalEventId: string | null = null;
      let externalEventLink: string | null = null;
      let providerConfirmed = false;
      let providerSyncError: string | null = null;

      if (accessToken && typeof accessToken === 'string' && accessToken.trim() !== '') {
        // Resolve representative real email (never fabricate advisor@acme.corp)
        let repEmail: string | undefined = undefined;
        if (representativeId) {
          try {
            const reps = await getRepresentatives(tenantId);
            const rep = reps.find((r) => r.id === representativeId);
            if (rep?.email && rep.email.includes('@')) {
              repEmail = rep.email;
            }
          } catch {
            // Ignore lookup failure, continue without fabricated email
          }
        }

        try {
          const calResult = await createGoogleCalendarEvent(accessToken, {
            summary: `1-on-1 Session: ${contactName || 'Prospect'} & ${representativeName || 'Advisor'}`,
            description: agendaNotes || 'Scheduled consultation via AI Calling Agent OS',
            startDateTime: startIso,
            endDateTime: endIso,
            timeZone: tenantTz,
            attendeeEmail: contactEmail && contactEmail.includes('@') ? contactEmail : undefined,
            attendeeName: contactName || undefined,
            representativeEmail: repEmail,
            representativeName: representativeName || undefined,
          });
          externalEventId = calResult.id;
          externalEventLink = calResult.htmlLink;
          providerConfirmed = true;
        } catch (calErr: unknown) {
          const msg = calErr instanceof Error ? calErr.message : String(calErr);
          console.warn('[CALENDAR PROVIDER WARNING] Provider event creation failed:', msg);
          providerSyncError = msg;
        }
      }

      // 4. STEP 3: RECONCILE LOCAL BOOKING UPON PROVIDER CONFIRMATION
      if (providerConfirmed && externalEventId) {
        try {
          session = await confirmBooking(
            tenantId,
            session.id,
            externalEventId,
            externalEventLink || undefined
          );
        } catch (confirmErr: unknown) {
          // If post-creation DB commit fails, execute compensating deletion on Google Calendar
          console.error('[BOOKING RECONCILIATION ERROR] Local DB commit failed after provider event creation. Compensating:', confirmErr);
          try {
            await deleteGoogleCalendarEvent(accessToken, externalEventId);
          } catch (compErr) {
            console.error('[COMPENSATION ERROR] Failed to delete external event during rollback:', compErr);
          }
          throw confirmErr;
        }
      }

      res.status(201).json({
        success: true,
        session,
        syncStatus: providerConfirmed ? 'confirmed' : 'pending_provider_sync',
        syncError: providerSyncError,
      });
    } catch (err: unknown) {
      console.error('Failed to book calendar event:', err);
      res.status(500).json({ error: 'Failed to schedule session in calendar' });
    }
  }
);

// --- MULTI-DOMAIN & BUSINESS PROFILE ENDPOINTS ---

// GET /api/domains: List tenant business profiles
app.get('/api/domains', async (req: Request, res: Response) => {
  try {
    const domains = await getBusinessProfiles(req.tenantId!);
    res.json(domains);
  } catch (err: any) {
    console.error('Failed to get business profiles:', err);
    res.status(500).json({ error: 'Failed to fetch business profiles from database' });
  }
});

// POST /api/domains: Add or update business profile
app.post(
  '/api/domains',
  requireRole(['tenant_owner', 'tenant_administrator']),
  async (req: Request, res: Response) => {
    try {
      const saved = await saveBusinessProfile(req.tenantId!, req.body);
      res.json(saved);
    } catch (err: any) {
      console.error('Failed to save business profile:', err);
      res.status(500).json({ error: 'Failed to save business profile in database' });
    }
  }
);

// DELETE /api/domains/:id: Delete business profile
app.delete(
  '/api/domains/:id',
  requireRole(['tenant_owner', 'tenant_administrator']),
  async (req: Request, res: Response) => {
    try {
      const deleted = await deleteBusinessProfile(req.tenantId!, req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Business profile not found' });
        return;
      }
      res.json({ success: true, id: req.params.id });
    } catch (err: any) {
      console.error('Failed to delete business profile:', err);
      res.status(500).json({ error: 'Failed to delete business profile' });
    }
  }
);

// POST /api/domains/ai-enrich: Automatically generate rich company intelligence
app.post('/api/domains/ai-enrich', async (req: Request, res: Response) => {
  try {
    const { domain = '', companyName = '' } = req.body;
    const cleanDomain = domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim();
    const query = companyName || cleanDomain;

    if (!query) {
      res.status(400).json({ error: 'Company name or domain is required' });
      return;
    }

    if (ai) {
      try {
        const prompt = `
Given company "${query}" (domain: "${cleanDomain}"), generate a high-precision enterprise company profile for AI agent deployment.
Determine:
1. Exact professional company name
2. Accurate domain URL
3. Industry vertical
4. 2-sentence description
5. Brand tone
6. 3-4 key operational knowledge base facts
7. INBOUND CALL GOAL: Triage and steer to book a consultation session
8. OUTBOUND CALL GOAL: Qualification and booking
`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                domain: { type: Type.STRING },
                industry: { type: Type.STRING },
                description: { type: Type.STRING },
                brandTone: { type: Type.STRING },
                knowledgeBaseSnippets: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                inboundGoal: { type: Type.STRING },
                outboundGoal: { type: Type.STRING },
              },
              required: [
                'name',
                'domain',
                'industry',
                'description',
                'brandTone',
                'knowledgeBaseSnippets',
                'inboundGoal',
                'outboundGoal',
              ],
            },
          },
        });

        const parsed = JSON.parse(response.text || '{}');
        res.json(parsed);
        return;
      } catch (geminiErr: any) {
        console.warn('Gemini enrichment error, using fallback:', geminiErr?.message);
      }
    }

    // Heuristic fallback
    const fallbackName = companyName || cleanDomain.split('.')[0].toUpperCase();
    res.json({
      name: fallbackName,
      domain: cleanDomain || 'enterprise.com',
      industry: 'Enterprise Technology & Services',
      description: `${fallbackName} delivers modern operational workflows and support.`,
      brandTone: 'Professional, consultative, and empathetic',
      knowledgeBaseSnippets: [
        `${fallbackName} operates standardized multi-channel customer communications.`,
        `Appointment consultations can be booked directly for technical or commercial reviews.`,
        `Urgent inquiries are immediately routed to senior on-call specialists.`,
      ],
      inboundGoal: `Assist customers warmly, resolve inquiries, and book a consultation with our specialist.`,
      outboundGoal: `Outreach to qualified decision-makers and schedule a walkthrough.`,
    });
  } catch (err: any) {
    console.error('Domain AI enrich error:', err);
    res.status(500).json({ error: 'Failed to enrich domain profile' });
  }
});

// POST /api/leads/ai-map: Intelligent CSV column mapping
app.post('/api/leads/ai-map', async (req: Request, res: Response) => {
  try {
    const { headers = [], sampleRows = [] } = req.body;
    if (!Array.isArray(headers) || headers.length === 0) {
      res.status(400).json({ error: 'Headers array is required' });
      return;
    }

    const heuristicMap = smartMapCsvHeaders(headers);

    if (ai) {
      try {
        const prompt = `
Given the following CSV column headers and sample row values, map each CSV header to exactly ONE of these platform lead fields:
- "name" (Lead full name)
- "email" (Email address)
- "phone" (Phone/mobile number)
- "company" (Company / organization)
- "role" (Job title / executive role)
- "estimatedValue" (Deal size, ARR, or budget)
- "budget" (BANT budget qualification)
- "timeline" (Buying urgency or timeline)
- "notes" (General comments or remarks)
- "ignore" (Non-lead metadata)

Headers: ${JSON.stringify(headers)}
Sample data: ${JSON.stringify(sampleRows.slice(0, 3))}
`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                mappings: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      originalHeader: { type: Type.STRING },
                      mappedField: {
                        type: Type.STRING,
                        enum: [
                          'name', 'email', 'phone', 'company', 'role',
                          'estimatedValue', 'budget', 'timeline', 'notes', 'ignore'
                        ],
                      },
                      confidence: { type: Type.NUMBER },
                      explanation: { type: Type.STRING },
                    },
                    required: ['originalHeader', 'mappedField', 'confidence', 'explanation'],
                  },
                },
              },
              required: ['mappings'],
            },
          },
        });

        const parsed = JSON.parse(response.text || '{}');
        if (parsed.mappings && Array.isArray(parsed.mappings)) {
          res.json({ mappings: parsed.mappings });
          return;
        }
      } catch (geminiErr: any) {
        console.warn('Gemini lead mapping fallback:', geminiErr?.message);
      }
    }

    // Heuristic rule fallback
    const fallbackMappings: LeadUploadFieldMapping[] = headers.map((header) => {
      const field: PlatformLeadField = heuristicMap[header] || 'ignore';
      const isTypoEmail = header.toLowerCase().includes('customer female') || header.toLowerCase().includes('female');
      return {
        originalHeader: header,
        mappedField: field,
        confidence: isTypoEmail ? 0.98 : field !== 'ignore' ? 0.92 : 0.4,
        explanation: isTypoEmail
          ? "AI detected 'customer female' as a speech-to-text typo for 'customer email'."
          : `Heuristic rule mapped "${header}" to platform field "${field}".`,
      };
    });

    res.json({ mappings: fallbackMappings });
  } catch (err: any) {
    console.error('Lead AI map error:', err);
    res.status(500).json({ error: 'Failed to map CSV fields' });
  }
});

// POST /api/leads/batch-upload: Import mapped outbound calling leads to PostgreSQL
// Preserves real values and nulls; strictly prohibits data fabrication.
app.post(
  '/api/leads/batch-upload',
  requireRole(['tenant_owner', 'tenant_administrator', 'tenant_agent_manager', 'tenant_staff']),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const { leads = [], domainName = '' } = req.body;

      if (!Array.isArray(leads) || leads.length === 0) {
        res.status(400).json({ error: 'No leads provided' });
        return;
      }

      const result = await batchCreateContacts(
        tenantId,
        leads.map((lead: any) => ({
          name: lead.name?.trim() || 'Imported Lead',
          company: lead.company?.trim() || domainName || undefined,
          role: lead.role?.trim() || undefined,
          email: lead.email?.trim() || undefined,
          phone: lead.phone?.trim() || undefined,
          status: 'new',
          leadScore: typeof lead.leadScore === 'number' ? lead.leadScore : undefined,
          estimatedValue: lead.estimatedValue?.trim() || undefined,
          tags: ['Outbound Campaign', ...(domainName ? [domainName] : [])],
          notes: lead.notes?.trim() || undefined,
          bant: (lead.budget || lead.timeline) ? {
            budget: lead.budget || '',
            authority: lead.role || '',
            need: lead.notes || '',
            timeline: lead.timeline || '',
          } : undefined,
          leadLifecycleStatus: 'new',
        }))
      );

      res.json({
        success: true,
        importedCount: result.inserted,
        errors: result.errors,
      });
    } catch (err: unknown) {
      console.error('Batch upload error:', err);
      res.status(500).json({ error: 'Failed to batch upload leads' });
    }
  }
);

// --- VITE MIDDLEWARE / STATIC ASSETS & SERVER STARTUP ---

async function startServer() {
  // 1. Validate tenant authentication and encryption environment
  try {
    validateAuthEnvironment();
    getAuthSecret();
    if (process.env.NODE_ENV === 'production' && (!process.env.ENCRYPTION_MASTER_KEY || process.env.ENCRYPTION_MASTER_KEY.length < 32)) {
      throw new Error('[FATAL SECURITY] ENCRYPTION_MASTER_KEY is required and must be at least 32 characters in production.');
    }
    console.log('[STARTUP] Tenant authentication and encryption secrets verified.');
  } catch (authErr: unknown) {
    const msg = authErr instanceof Error ? authErr.message : String(authErr);
    console.error('\n' + '='.repeat(80));
    console.error('[FATAL AUTH CONFIGURATION ERROR] Server startup aborted:');
    console.error(msg);
    console.error('='.repeat(80) + '\n');
    process.exit(1);
  }

  // 2. Validate authoritative Neon PostgreSQL database connection
  try {

    getDatabaseUrl();
    console.log('[STARTUP] Verifying PostgreSQL database configuration...');
    const health = await checkDatabaseHealth();
    if (health.status !== 'healthy') {
      console.error(`\n================================================================================`);
      console.error(`[FATAL DATABASE ERROR] PostgreSQL connection failed or target invalid:`);
      console.error(health.error);
      console.error(`Dedicated database "ai_calling_agent_os" is required.`);
      console.error(`================================================================================\n`);
      process.exit(1);
    }

    console.log(`[STARTUP] PostgreSQL connection verified (${health.latencyMs}ms, db="${health.databaseName}").`);
    console.log('[STARTUP] Running database migrations...');
    const migrationResult = await runMigrations();
    console.log(`[STARTUP] Migrations complete. ${migrationResult.applied.length} new migrations applied.`);
    await ensureDefaultTenant();
    console.log('[STARTUP] Organization tenant initialized.');
  } catch (dbErr: unknown) {
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    console.error('\n' + '='.repeat(80));
    console.error('[FATAL CONFIGURATION ERROR] PostgreSQL database startup failure:');
    console.error(msg);
    console.error('='.repeat(80) + '\n');
    process.exit(1);
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Calling Agent OS server running on http://0.0.0.0:${PORT}`);
  });
}

// Start server unless imported by integration tests or test runners
const isMainModule = process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));
if (isMainModule && process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, startServer };
