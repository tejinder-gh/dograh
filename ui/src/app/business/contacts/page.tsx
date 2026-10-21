import React from "react";

import { ContactsDirectoryView } from "@/components/business/crm/ContactsDirectoryView";
import { PageLayout } from "@/components/layout/PageLayout";

export default function ContactsPage() {
  return (
    <PageLayout
      title="CRM & Leads"
      description="Manage organization-scoped leads, interaction timelines, and verified customer history."
    >
      <ContactsDirectoryView />
    </PageLayout>
  );
}
