import { z } from 'zod';

export const organizationMappingSchema = z.object({
  id: z.string().uuid(),
  deploymentId: z.string().min(1),
  dograhOrganizationId: z.number().int().positive(),
  businessTenantId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type OrganizationMapping = z.infer<typeof organizationMappingSchema>;

export interface TenantContext {
  readonly deploymentId: string;
  readonly dograhOrganizationId: number;
  readonly businessTenantId: string;
}
