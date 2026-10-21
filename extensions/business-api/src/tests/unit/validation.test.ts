import { describe, it, expect } from 'bun:test';
import { createBusinessProfileSchema } from '../../domain/business-profile.types';
import { createContactSchema, batchCreateContactsSchema } from '../../domain/contact.types';
import { createInteractionSchema } from '../../domain/interaction.types';

describe('Domain Validation Schemas', () => {
  describe('Business Profile Schema', () => {
    it('validates a compliant business profile payload', () => {
      const input = {
        name: 'Acme Advisory',
        domain: 'acme-advisory.com',
        industry: 'Management Consulting',
        description: 'Elite enterprise turnaround consulting',
        brandTone: 'Crisp, strategic, authoritative',
        operatingHours: {
          timezone: 'America/New_York',
          schedule: {
            monday: {
              enabled: true,
              slots: [{ start: '09:00', end: '17:00' }],
            },
          },
        },
        acuityWorkflowId: 10,
        dograhWorkflowId: 10,
      };

      const result = createBusinessProfileSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Acme Advisory');
        expect(result.data.acuityWorkflowId).toBe(10);
        expect(result.data.dograhWorkflowId).toBe(10);
      }
    });

    it('rejects profile with empty name or domain', () => {
      const invalid = {
        name: '',
        domain: '',
        industry: 'Tech',
      };
      const result = createBusinessProfileSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects invalid operating hour slot format', () => {
      const invalidHours = {
        name: 'Valid Name',
        domain: 'valid.com',
        industry: 'Legal',
        operatingHours: {
          timezone: 'UTC',
          schedule: {
            monday: {
              enabled: true,
              slots: [{ start: '9am', end: '5pm' }], // Invalid HH:mm format
            },
          },
        },
      };
      const result = createBusinessProfileSchema.safeParse(invalidHours);
      expect(result.success).toBe(false);
    });
  });

  describe('Contact & Batch Schema', () => {
    it('validates clean contact payload', () => {
      const input = {
        name: 'Sarah Connor',
        email: 'sarah@cyberdyne.org',
        phone: '+14155551984',
        company: 'Cyberdyne Systems',
        role: 'Chief of Security',
        status: 'qualified',
        lifecycleStatus: 'qualified',
      };
      const result = createContactSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects invalid email address', () => {
      const input = {
        name: 'Invalid Email Person',
        email: 'not-an-email',
      };
      const result = createContactSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('validates batch contact import schema with deduplication option', () => {
      const batchInput = {
        contacts: [
          { name: 'Lead A', email: 'a@corp.com' },
          { name: 'Lead B', phone: '+1234567890' },
        ],
        deduplicateBy: 'both',
      };
      const result = batchCreateContactsSchema.safeParse(batchInput);
      expect(result.success).toBe(true);
    });
  });

  describe('Interaction Schema', () => {
    it('validates interaction with Acuity run references', () => {
      const input = {
        contactId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        acuityWorkflowId: 1,
        acuityDefinitionId: 2,
        acuityRunId: 'run-98234-xyz',
        dograhWorkflowId: 1,
        dograhDefinitionId: 2,
        dograhRunId: 'run-98234-xyz',
        channel: 'call_inbound',
        durationSeconds: 142,
        sentimentScore: 78,
        sentimentCategory: 'positive',
        wasEscalated: false,
        summary: 'Caller inquired about enterprise pricing and scheduled a demo.',
      };

      const result = createInteractionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.acuityWorkflowId).toBe(1);
        expect(result.data.dograhWorkflowId).toBe(1);
        expect(result.data.acuityRunId).toBe('run-98234-xyz');
      }
    });

    it('rejects sentiment score outside [-100, 100]', () => {
      const input = {
        sentimentScore: 150,
      };
      const result = createInteractionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
