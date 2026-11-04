import { Hono } from 'hono';
import { businessProfileService } from '../services/business-profile.service';
import {
  createBusinessProfileSchema,
  updateBusinessProfileSchema,
} from '../domain/business-profile.types';

export const businessProfileRoutes = new Hono();

// List all profiles for the authenticated organization
businessProfileRoutes.get('/', async (c) => {
  const ctx = c.get('tenantContext');
  const profiles = await businessProfileService.getProfiles(ctx);
  return c.json({ data: profiles });
});

// Get profile by ID
businessProfileRoutes.get('/:id', async (c) => {
  const ctx = c.get('tenantContext');
  const id = c.req.param('id');
  const profile = await businessProfileService.getProfileById(ctx, id);
  if (!profile) {
    return c.json({ error: `Business profile "${id}" not found` }, 404);
  }
  return c.json({ data: profile });
});

// Create new business profile
businessProfileRoutes.post('/', async (c) => {
  const ctx = c.get('tenantContext');
  const body: unknown = await c.req.json();
  const validated = createBusinessProfileSchema.parse(body);
  const profile = await businessProfileService.createProfile(ctx, validated);
  return c.json({ data: profile }, 201);
});

// Update profile (supports both PUT and PATCH)
const handleUpdateProfile = async (c: import('hono').Context) => {
  const ctx = c.get('tenantContext');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Missing ID' }, 400);
  const body: unknown = await c.req.json();
  const validated = updateBusinessProfileSchema.parse(body);
  const profile = await businessProfileService.updateProfile(ctx, id, validated);
  return c.json({ data: profile });
};
businessProfileRoutes.put('/:id', handleUpdateProfile);
businessProfileRoutes.patch('/:id', handleUpdateProfile);

// Delete profile
businessProfileRoutes.delete('/:id', async (c) => {
  const ctx = c.get('tenantContext');
  const id = c.req.param('id');
  const success = await businessProfileService.deleteProfile(ctx, id);
  if (!success) {
    return c.json({ error: `Business profile "${id}" not found` }, 404);
  }
  return c.json({ success: true, id });
});
