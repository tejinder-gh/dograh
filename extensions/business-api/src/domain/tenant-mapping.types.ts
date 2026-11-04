import { z } from 'zod';

export const organizationMappingSchema = z.object({
  id: z.string().uuid(),
  deploymentId: z.string().min(1),
  acuityOrganizationId: z.number().int().positive(),
  businessTenantId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type OrganizationMapping = z.infer<typeof organizationMappingSchema> & {
  // Backwards compatibility alias
  AcuityOrganizationId?: number;
};

export interface TenantContext {
  readonly deploymentId: string;
  readonly acuityOrganizationId: number;
  readonly businessTenantId: string;
  // Backwards compatibility alias
  readonly AcuityOrganizationId?: number;
  readonly isPlatformAdmin?: boolean;
}
