import * as profileRepo from '../repositories/business-profile.repository';
import * as dograhAdapter from '../adapters/dograh-api.adapter';
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

    // 2. If workflow ID is provided, verify it belongs to this Dograh organization
    if (dto.dograhWorkflowId !== null && dto.dograhWorkflowId !== undefined) {
      const isValidWorkflow = await dograhAdapter.verifyWorkflowOwnership(
        ctx.dograhOrganizationId,
        dto.dograhWorkflowId
      );
      if (!isValidWorkflow) {
        throw new Error(
          `Workflow ID ${dto.dograhWorkflowId} does not exist or does not belong to your organization`
        );
      }
    }

    // 3. Strip any empty string website URLs to null
    const cleanedDto: CreateBusinessProfileDTO = {
      ...dto,
      websiteUrl: dto.websiteUrl ? dto.websiteUrl.trim() : null,
      dograhWorkflowId: dto.dograhWorkflowId ?? null,
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
    if (dto.dograhWorkflowId !== undefined && dto.dograhWorkflowId !== null) {
      const isValid = await dograhAdapter.verifyWorkflowOwnership(
        ctx.dograhOrganizationId,
        dto.dograhWorkflowId
      );
      if (!isValid) {
        throw new Error(
          `Workflow ID ${dto.dograhWorkflowId} does not belong to your organization`
        );
      }
    }

    const updated = await profileRepo.updateProfile(ctx.businessTenantId, id, dto);
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
