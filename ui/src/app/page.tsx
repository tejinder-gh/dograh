import { redirect } from 'next/navigation';
import { getServerAccessToken, getServerAuthProvider, getServerUser } from '@/lib/auth/server';
import { LandingPageView } from '@/components/landing/LandingPageView';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const authProvider = await getServerAuthProvider();

  // If authenticated via local OSS session token, route directly to the intelligence dashboard
  if (authProvider === 'local') {
    const accessToken = await getServerAccessToken();
    if (accessToken) {
      redirect('/dashboard');
    }
  }

  // If authenticated via Stack session, route directly to the intelligence dashboard
  if (authProvider === 'stack') {
    const user = await getServerUser();
    if (user) {
      redirect('/dashboard');
    }
  }

  // Otherwise, render the enterprise landing page for unauthenticated visitors
  return <LandingPageView />;
}
