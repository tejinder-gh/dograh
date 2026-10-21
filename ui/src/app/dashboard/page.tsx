import React from 'react';

import { ClientDashboardView } from '@/components/analytics/client/ClientDashboardView';
import { PageLayout } from '@/components/layout/PageLayout';

export const metadata = {
  title: 'Client Intelligence Dashboard | AI Calling Agent OS',
  description: 'Enterprise voice analytics, lead conversion funnel, and operational performance.',
};

export default function DashboardPage() {
  return (
    <PageLayout
      title="Client Intelligence"
      description="Holistic operational telemetry, lead qualification, and customer experience across your conversational agents."
    >
      <ClientDashboardView />
    </PageLayout>
  );
}
