import { Hono } from 'hono';
import { crmService } from '../services/crm.service';
import {
  createContactSchema,
  updateContactSchema,
  batchCreateContactsSchema,
  leadStatusSchema,
  leadLifecycleStatusSchema,
} from '../domain/contact.types';
import { createInteractionSchema } from '../domain/interaction.types';

export const crmRoutes = new Hono();

// List contacts with search and filtering
crmRoutes.get('/contacts', async (c) => {
  const ctx = c.get('tenantContext');
  const search = c.req.query('search');
  const statusParam = c.req.query('status');
  const lifecycleParam = c.req.query('lifecycleStatus');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
  const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : 0;

  const status = statusParam ? leadStatusSchema.optional().parse(statusParam) : undefined;
  const lifecycleStatus = lifecycleParam
    ? leadLifecycleStatusSchema.optional().parse(lifecycleParam)
    : undefined;

  const result = await crmService.getContacts(ctx, {
    search,
    status,
    lifecycleStatus,
    limit,
    offset,
  });

  return c.json({
    data: result.contacts,
    total: result.total,
    limit,
    offset,
  });
});

// Get contact by ID
crmRoutes.get('/contacts/:id', async (c) => {
  const ctx = c.get('tenantContext');
  const id = c.req.param('id');
  const contact = await crmService.getContactById(ctx, id);
  if (!contact) {
    return c.json({ error: `Contact "${id}" not found` }, 404);
  }
  return c.json({ data: contact });
});

// Create new contact
crmRoutes.post('/contacts', async (c) => {
  const ctx = c.get('tenantContext');
  const body: unknown = await c.req.json();
  const validated = createContactSchema.parse(body);
  const contact = await crmService.createContact(ctx, validated);
  return c.json({ data: contact }, 201);
});

// Update contact
crmRoutes.put('/contacts/:id', async (c) => {
  const ctx = c.get('tenantContext');
  const id = c.req.param('id');
  const body: unknown = await c.req.json();
  const validated = updateContactSchema.parse(body);
  const contact = await crmService.updateContact(ctx, id, validated);
  return c.json({ data: contact });
});

// Delete contact
crmRoutes.delete('/contacts/:id', async (c) => {
  const ctx = c.get('tenantContext');
  const id = c.req.param('id');
  const success = await crmService.deleteContact(ctx, id);
  if (!success) {
    return c.json({ error: `Contact "${id}" not found` }, 404);
  }
  return c.json({ success: true, id });
});

// Batch create contacts
crmRoutes.post('/contacts/batch', async (c) => {
  const ctx = c.get('tenantContext');
  const body: unknown = await c.req.json();
  const validated = batchCreateContactsSchema.parse(body);
  const result = await crmService.batchCreateContacts(ctx, validated);
  return c.json({
    inserted: result.inserted.length,
    duplicatesSkipped: result.duplicatesSkipped,
    errors: result.errors,
    data: result.inserted,
  }, 201);
});

// Get contact timeline
crmRoutes.get('/contacts/:id/timeline', async (c) => {
  const ctx = c.get('tenantContext');
  const id = c.req.param('id');
  const timeline = await crmService.getContactTimeline(ctx, id);
  return c.json({ data: timeline });
});

// List interactions
crmRoutes.get('/interactions', async (c) => {
  const ctx = c.get('tenantContext');
  const contactId = c.req.query('contactId');
  const dograhRunId = c.req.query('dograhRunId');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
  const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : 0;

  const interactions = await crmService.getInteractions(ctx, {
    contactId,
    dograhRunId,
    limit,
    offset,
  });

  return c.json({ data: interactions });
});

// Record interaction
crmRoutes.post('/interactions', async (c) => {
  const ctx = c.get('tenantContext');
  const body: unknown = await c.req.json();
  const validated = createInteractionSchema.parse(body);
  const interaction = await crmService.recordInteraction(ctx, validated);
  return c.json({ data: interaction }, 201);
});
