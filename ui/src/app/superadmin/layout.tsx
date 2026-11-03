import React from 'react';
import { AdminGuard } from '@/components/auth/AdminGuard';

export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
