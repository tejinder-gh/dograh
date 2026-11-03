'use client';

import React, { useEffect, useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import type { LocalUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [isSuperuser, setIsSuperuser] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/auth/login');
      return;
    }

    const localUser = user as LocalUser | undefined;
    if (localUser?.is_superuser !== undefined) {
      setIsSuperuser(Boolean(localUser.is_superuser));
      setChecking(false);
      return;
    }

    // Authoritative check via backend
    fetch('/api/v1/user/auth/user')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setIsSuperuser(Boolean(data?.is_superuser));
        setChecking(false);
      })
      .catch(() => {
        setIsSuperuser(false);
        setChecking(false);
      });
  }, [user, authLoading, router]);

  if (authLoading || checking) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Verifying platform administrator credentials...</p>
      </div>
    );
  }

  if (!isSuperuser) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center max-w-md mx-auto space-y-4">
          <div className="inline-flex rounded-full bg-destructive/10 p-3 text-destructive">
            <Lock className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Access Restricted</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This console is strictly restricted to verified platform administrators. Standard organization permissions do not grant platform-wide access.
          </p>
          <div className="pt-2">
            <Button asChild variant="outline">
              <Link href="/dashboard">Return to Client Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
