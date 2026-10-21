import * as profileRepo from '../repositories/business-profile.repository';
import * as acuityAdapter from '../adapters/acuity-api.adapter';
import type { TenantContext } from '../domain/tenant-mapping.types';
import type {
  BusinessProfile,
  CreateBusinessProfileDTO,
  UpdateBusinessProfileDTO,
} from '../domain/business-profile.types';

export class BusinessProfileService {
  async getProfiles(ctx: TenantContext): Promise<BusinessProfile[]> {
    return profileRepo.getProfiles(ctx.businessTenantId);
  }

  async getProfileById(ctx: TenantContext, id: string): Promise<BusinessProfile | null> {
    return profileRepo.getProfileById(ctx.businessTenantId, id);
  }

  async createProfile(
    ctx: TenantContext,
    dto: CreateBusinessProfileDTO
  ): Promise<BusinessProfile> {
    // 1. Check for domain collision within this tenant
    const existing = await profileRepo.getProfileByDomain(
      ctx.businessTenantId,
      dto.domain
    );
    if (existing) {
      throw new Error(`A profile with domain "${dto.domain}" already exists in your organization`);
    }

    // 2. If workflow ID is provided, verify it belongs to this organization
    const workflowId = dto.acuityWorkflowId ?? dto.acuityWorkflowId ?? null;
    const orgId = ctx.acuityOrganizationId ?? ctx.acuityOrganizationId!;
    if (workflowId !== null && workflowId !== undefined) {
      const isValidWorkflow = await acuityAdapter.verifyWorkflowOwnership(
        orgId,
        workflowId
      );
      if (!isValidWorkflow) {
        throw new Error(
          `Forbidden: Workflow ID ${workflowId} does not exist or does not belong to your organization`
        );
      }
    }

    // 3. Strip any empty string website URLs to null
    const cleanedDto: CreateBusinessProfileDTO = {
      ...dto,
      websiteUrl: dto.websiteUrl ? dto.websiteUrl.trim() : null,
      acuityWorkflowId: workflowId ?? null,
      dograhWorkflowId: workflowId ?? null,
    };

    return profileRepo.createProfile(ctx.businessTenantId, cleanedDto);
  }

  async updateProfile(
    ctx: TenantContext,
    id: string,
    dto: UpdateBusinessProfileDTO
  ): Promise<BusinessProfile> {
    const existing = await profileRepo.getProfileById(ctx.businessTenantId, id);
    if (!existing) {
      throw new Error(`Business profile not found or unauthorized`);
    }

    // Check domain uniqueness if domain is changing
    if (dto.domain && dto.domain.toLowerCase().trim() !== existing.domain) {
      const domainCheck = await profileRepo.getProfileByDomain(
        ctx.businessTenantId,
        dto.domain
      );
      if (domainCheck && domainCheck.id !== id) {
        throw new Error(`Domain "${dto.domain}" is already registered by another profile in your organization`);
      }
    }

    // Verify workflow ownership if workflow ID is changing
    const orgId = ctx.acuityOrganizationId ?? ctx.acuityOrganizationId!;
    const workflowId = dto.acuityWorkflowId ?? dto.acuityWorkflowId;
    if (workflowId !== undefined && workflowId !== null) {
      const isValid = await acuityAdapter.verifyWorkflowOwnership(
        orgId,
        workflowId
      );
      if (!isValid) {
        throw new Error(
          `Forbidden: Workflow ID ${workflowId} does not belong to your organization`
        );
      }
    }

    const updated = await profileRepo.updateProfile(ctx.businessTenantId, id, {
      ...dto,
      acuityWorkflowId: workflowId,
      dograhWorkflowId: workflowId,
    });
    if (!updated) {
      throw new Error('Failed to update business profile');
    }
    return updated;
  }

  async deleteProfile(ctx: TenantContext, id: string): Promise<boolean> {
    const existing = await profileRepo.getProfileById(ctx.businessTenantId, id);
    if (!existing) return false;
    return profileRepo.deleteProfile(ctx.businessTenantId, id);
  }
}

export const businessProfileService = new BusinessProfileService();
