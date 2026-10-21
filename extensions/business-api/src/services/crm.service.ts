import * as contactRepo from '../repositories/contact.repository';
import * as interactionRepo from '../repositories/interaction.repository';
import { calculateLeadScore } from '../domain/scoring';
import type { TenantContext } from '../domain/tenant-mapping.types';
import type {
  Contact,
  CreateContactDTO,
  UpdateContactDTO,
  BatchCreateContactsDTO,
  LeadStatus,
  LeadLifecycleStatus,
  TimelineEvent,
} from '../domain/contact.types';
import type {
  Interaction,
  CreateInteractionDTO,
} from '../domain/interaction.types';

export class CrmService {
  async getContacts(
    ctx: TenantContext,
    options?: {
      search?: string;
      status?: LeadStatus;
      lifecycleStatus?: LeadLifecycleStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ contacts: Contact[]; total: number }> {
    return contactRepo.getContacts(ctx.businessTenantId, options);
  }

  async getContactById(ctx: TenantContext, id: string): Promise<Contact | null> {
    return contactRepo.getContactById(ctx.businessTenantId, id);
  }

  async createContact(
    ctx: TenantContext,
    dto: CreateContactDTO
  ): Promise<Contact> {
    // Check for duplicate in this tenant
    const duplicate = await contactRepo.findDuplicate(
      ctx.businessTenantId,
      dto.email,
      dto.phone
    );

    if (duplicate) {
      throw new Error(
        `A contact with this email (${dto.email || 'N/A'}) or phone (${dto.phone || 'N/A'}) already exists in your organization (ID: ${duplicate.id})`
      );
    }

    // Compute deterministic initial score
    const computed = calculateLeadScore({
      email: dto.email,
      phone: dto.phone,
      company: dto.company,
      role: dto.role,
      lifecycleStatus: dto.lifecycleStatus || 'new',
      callAttempts: 0,
    });

    const contactToCreate: CreateContactDTO = {
      ...dto,
      leadScore: dto.leadScore !== undefined && dto.leadScore !== null ? dto.leadScore : computed.score,
    };

    return contactRepo.createContact(ctx.businessTenantId, contactToCreate);
  }

  async updateContact(
    ctx: TenantContext,
    id: string,
    dto: UpdateContactDTO
  ): Promise<Contact> {
    const existing = await contactRepo.getContactById(ctx.businessTenantId, id);
    if (!existing) {
      throw new Error(`Contact not found or unauthorized`);
    }

    // Check duplicate if email/phone changing
    if (
      (dto.email && dto.email.toLowerCase().trim() !== (existing.email || '').toLowerCase()) ||
      (dto.phone && dto.phone.trim() !== (existing.phone || '').trim())
    ) {
      const dup = await contactRepo.findDuplicate(
        ctx.businessTenantId,
        dto.email ?? existing.email,
        dto.phone ?? existing.phone
      );
      if (dup && dup.id !== id) {
        throw new Error(`Another contact already exists with that email or phone`);
      }
    }

    // Fetch recent interactions to re-compute score if status changed
    const recentInteractions = await interactionRepo.getInteractions(ctx.businessTenantId, {
      contactId: id,
      limit: 10,
    });

    const scoreBreakdown = calculateLeadScore(
      {
        email: dto.email ?? existing.email,
        phone: dto.phone ?? existing.phone,
        company: dto.company ?? existing.company,
        role: dto.role ?? existing.role,
        lifecycleStatus: dto.lifecycleStatus ?? existing.lifecycleStatus,
        callAttempts: dto.callAttempts ?? existing.callAttempts,
      },
      recentInteractions
    );

    const updatePayload: UpdateContactDTO = {
      ...dto,
      leadScore: dto.leadScore !== undefined ? dto.leadScore : scoreBreakdown.score,
    };

    const updated = await contactRepo.updateContact(ctx.businessTenantId, id, updatePayload);
    if (!updated) {
      throw new Error('Failed to update contact');
    }
    return updated;
  }

  async deleteContact(ctx: TenantContext, id: string): Promise<boolean> {
    const existing = await contactRepo.getContactById(ctx.businessTenantId, id);
    if (!existing) return false;
    return contactRepo.deleteContact(ctx.businessTenantId, id);
  }

  async batchCreateContacts(
    ctx: TenantContext,
    dto: BatchCreateContactsDTO
  ): Promise<{ inserted: Contact[]; duplicatesSkipped: number; errors: string[] }> {
    const inserted: Contact[] = [];
    const errors: string[] = [];
    let duplicatesSkipped = 0;

    for (let i = 0; i < dto.contacts.length; i++) {
      const contactDto = dto.contacts[i];
      if (!contactDto) continue;

      try {
        if (dto.deduplicateBy !== 'none') {
          const checkEmail = dto.deduplicateBy === 'email' || dto.deduplicateBy === 'both';
          const checkPhone = dto.deduplicateBy === 'phone' || dto.deduplicateBy === 'both';
          const dup = await contactRepo.findDuplicate(
            ctx.businessTenantId,
            checkEmail ? contactDto.email : undefined,
            checkPhone ? contactDto.phone : undefined
          );
          if (dup) {
            duplicatesSkipped++;
            continue;
          }
        }

        const created = await this.createContact(ctx, contactDto);
        inserted.push(created);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Row ${i + 1} (${contactDto.name}): ${msg}`);
      }
    }

    return { inserted, duplicatesSkipped, errors };
  }

  async recordInteraction(
    ctx: TenantContext,
    dto: CreateInteractionDTO
  ): Promise<Interaction> {
    const interaction = await interactionRepo.createInteraction(ctx.businessTenantId, dto);

    // If contact is linked, update lead score and lifecycle status
    if (interaction.contactId) {
      const contact = await contactRepo.getContactById(ctx.businessTenantId, interaction.contactId);
      if (contact) {
        const recentInteractions = await interactionRepo.getInteractions(ctx.businessTenantId, {
          contactId: contact.id,
          limit: 10,
        });

        let nextLifecycleStatus: LeadLifecycleStatus = contact.lifecycleStatus;
        if (interaction.wasEscalated) {
          nextLifecycleStatus = 'escalated';
        } else if (contact.lifecycleStatus === 'new' || contact.lifecycleStatus === 'queued_outbound') {
          nextLifecycleStatus = 'connected';
        }

        const scoreBreakdown = calculateLeadScore(
          {
            email: contact.email,
            phone: contact.phone,
            company: contact.company,
            role: contact.role,
            lifecycleStatus: nextLifecycleStatus,
            callAttempts: contact.callAttempts,
          },
          recentInteractions
        );

        await contactRepo.updateContact(ctx.businessTenantId, contact.id, {
          lifecycleStatus: nextLifecycleStatus,
          leadScore: scoreBreakdown.score,
        });
      }
    }

    return interaction;
  }

  async getInteractions(
    ctx: TenantContext,
    options?: { contactId?: string; dograhRunId?: string; limit?: number; offset?: number }
  ): Promise<Interaction[]> {
    return interactionRepo.getInteractions(ctx.businessTenantId, options);
  }

  async getContactTimeline(ctx: TenantContext, contactId: string): Promise<TimelineEvent[]> {
    const contact = await contactRepo.getContactById(ctx.businessTenantId, contactId);
    if (!contact) {
      throw new Error('Contact not found or unauthorized');
    }
    return contact.timeline || [];
  }
}

export const crmService = new CrmService();
