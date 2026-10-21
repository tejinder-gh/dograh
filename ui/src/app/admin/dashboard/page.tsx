import React from 'react';

import { AdminDashboardView } from '@/components/analytics/admin/AdminDashboardView';
import { PageLayout } from '@/components/layout/PageLayout';

export const metadata = {
  title: 'Platform Command Center | Platform Administration',
  description: 'Executive cross-tenant intelligence, unit economics, platform reliability, and client portfolio.',
};

export default function AdminDashboardPage() {
  return (
    <PageLayout
      title="Platform Command Center"
      description="Cross-tenant executive intelligence, macro fleet usage, direct provider economics, and client portfolio."
    >
      <AdminDashboardView />
    </PageLayout>
  );
}
