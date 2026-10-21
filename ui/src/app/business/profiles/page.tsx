import React from "react";

import { BusinessProfilesView } from "@/components/business/profiles/BusinessProfilesView";
import { PageLayout } from "@/components/layout/PageLayout";

export default function BusinessProfilesPage() {
  return (
    <PageLayout
      title="Business Profiles"
      description="Manage business domains, brand tone, operating hours, and associated Dograh voice workflows."
    >
      <BusinessProfilesView />
    </PageLayout>
  );
}
