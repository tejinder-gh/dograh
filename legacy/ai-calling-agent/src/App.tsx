import React, { useState, useEffect } from 'react';
import { Header, ActiveTab } from './components/Header';
import { LiveCallStudio } from './components/LiveCallStudio';
import { MultichannelInbox } from './components/MultichannelInbox';
import { CrmDirectory } from './components/CrmDirectory';
import { BookingsView } from './components/BookingsView';
import { EscalationsQueue } from './components/EscalationsQueue';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { BookingModal } from './components/BookingModal';
import { ClientDomainsHub } from './components/ClientDomainsHub';
import { LeadUploadManager } from './components/LeadUploadManager';
import {
  CustomerContact,
  CompanyRepresentative,
  InteractionLog,
  ScheduledSession,
  EscalationTicket,
  ClientCompanyDomain
} from './types';
import { googleSignIn, logout, initAuth } from './lib/firebase';
import {
  getAuthHeaders,
  getAuthToken,
  setAuthSession,
  clearAuthSession,
  ensureAuthSession,
  getTenantId,
} from './utils/auth-client';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('call-studio');
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [representatives, setRepresentatives] = useState<CompanyRepresentative[]>([]);
  const [interactions, setInteractions] = useState<InteractionLog[]>([]);
  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [escalations, setEscalations] = useState<EscalationTicket[]>([]);
  const [domains, setDomains] = useState<ClientCompanyDomain[]>([]);
  const [activeDomainId, setActiveDomainId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Google Calendar Auth & Backend Session State
  const [googleUser, setGoogleUser] = useState<any | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authStatus, setAuthStatus] = useState<'authenticated' | 'unauthenticated' | 'forbidden' | 'loading'>('loading');
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);

  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [bookingDefaultContactId, setBookingDefaultContactId] = useState<string | undefined>();
  const [bookingDefaultRepId, setBookingDefaultRepId] = useState<string | undefined>();
  const [activeCall, setActiveCall] = useState(false);

  // Exchange credentials for backend signed session token
  const exchangeSessionToken = async (email?: string, idToken?: string) => {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email || 'operator@acme.corp',
          idToken: idToken || null,
          tenantId: getTenantId(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAuthSession(data.token, data.tenant?.id);
        setAuthStatus('authenticated');
        setAuthErrorMessage(null);
        return true;
      } else {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setAuthStatus('forbidden');
          setAuthErrorMessage(errData.error || 'Access to this tenant organization is forbidden.');
        } else {
          setAuthStatus('unauthenticated');
          setAuthErrorMessage(errData.error || 'Session authentication failed. Please sign in.');
        }
        return false;
      }
    } catch {
      setAuthStatus('unauthenticated');
      return false;
    }
  };

  const handleQuickOperatorLogin = async () => {
    setIsLoggingIn(true);
    try {
      const ok = await exchangeSessionToken('operator@acme.corp');
      if (ok) {
        await fetchData();
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Initialize Firebase auth observer and synchronize backend session token
  useEffect(() => {
    // If no token exists on mount, bootstrap initial operator session
    if (!getAuthToken()) {
      ensureAuthSession().then((token) => {
        if (token) {
          setAuthStatus('authenticated');
          fetchData();
        }
      });
    }

    const unsubscribe = initAuth(
      async (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
        if (user && user.email) {
          await exchangeSessionToken(user.email, token || undefined);
          await fetchData();
        }
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Fetch initial data from server with tenant authorization headers
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const headers = getAuthHeaders();
      const [cRes, rRes, iRes, bRes, eRes, dRes] = await Promise.all([
        fetch('/api/crm/contacts', { headers }),
        fetch('/api/crm/representatives', { headers }),
        fetch('/api/crm/interactions', { headers }),
        fetch('/api/crm/bookings', { headers }),
        fetch('/api/crm/escalations', { headers }),
        fetch('/api/domains', { headers }),
      ]);

      if (cRes.status === 401 || bRes.status === 401) {
        setAuthStatus('unauthenticated');
        setAuthErrorMessage('Authentication required. Please sign in with your organization account.');
        return;
      }
      if (cRes.status === 403 || bRes.status === 403) {
        setAuthStatus('forbidden');
        setAuthErrorMessage('Access denied for the selected tenant organization.');
        return;
      }

      setAuthStatus('authenticated');
      if (cRes.ok) setContacts(await cRes.json());
      if (rRes.ok) setRepresentatives(await rRes.json());
      if (iRes.ok) setInteractions(await iRes.json());
      if (bRes.ok) setSessions(await bRes.json());
      if (eRes.ok) setEscalations(await eRes.json());
      if (dRes.ok) {
        const doms = await dRes.json();
        if (Array.isArray(doms) && doms.length > 0) {
          setDomains(doms);
          if (!activeDomainId || !doms.some((d: any) => d.id === activeDomainId)) {
            setActiveDomainId(doms[0].id);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch CRM data from server:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenQuickBooking = (contactId?: string, repId?: string) => {
    setBookingDefaultContactId(contactId);
    setBookingDefaultRepId(repId);
    setIsBookingModalOpen(true);
  };

  const handleBookingCreated = (newSession: ScheduledSession) => {
    setSessions((prev) => [newSession, ...prev]);

    // Update corresponding contact status: only 'booked' if confirmed
    if (newSession.status === 'confirmed') {
      setContacts((prev) =>
        prev.map((c) =>
          c.id === newSession.contactId
            ? {
                ...c,
                status: 'booked' as const,
                leadLifecycleStatus: 'booked' as const,
                leadScore: Math.min(100, c.leadScore + 15),
              }
            : c
        )
      );
    }
  };

  const handleLogInteraction = (newLog: InteractionLog) => {
    setInteractions((prev) => [newLog, ...prev]);

    // Update contact lastContactedAt
    setContacts((prev) =>
      prev.map((c) =>
        c.id === newLog.contactId ? { ...c, lastContactedAt: newLog.timestamp } : c
      )
    );
  };

  const handleInitiateCall = (contactId: string) => {
    setActiveTab('call-studio');
  };

  const handleResolveEscalation = async (id: string, notes: string) => {
    try {
      await fetch(`/api/crm/escalations/${id}/resolve`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ notes }),
      });
    } catch (e) {
      console.warn('Resolve error:', e);
    }

    setEscalations((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: 'resolved', supervisorNotes: notes } : e))
    );
  };

  const handleUpdateContactNotes = (contactId: string, notes: string) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, notes } : c))
    );
  };

  const handleUpdateSessionStatus = (
    sessionId: string,
    status: 'confirmed' | 'rescheduled' | 'completed' | 'cancelled'
  ) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, status } : s))
    );
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoggingIn(true);
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setGoogleToken(res.accessToken);
      }
    } catch (e) {
      console.error('Google sign-in failed:', e);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await logout();
      clearAuthSession();
      setGoogleUser(null);
      setGoogleToken(null);
      setAuthStatus('unauthenticated');
    } catch (e) {
      console.error('Sign-out error:', e);
    }
  };

  const handleSaveDomain = async (domainToSave: ClientCompanyDomain) => {
    try {
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(domainToSave),
      });
      if (res.ok) {
        const saved = await res.json();
        setDomains((prev) => {
          const idx = prev.findIndex((d) => d.id === saved.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = saved;
            return updated;
          }
          return [saved, ...prev];
        });
        setActiveDomainId(saved.id);
      }
    } catch (e) {
      console.error('Save domain error:', e);
    }
  };

  const handleDeleteDomain = async (domainId: string) => {
    try {
      const res = await fetch(`/api/domains/${domainId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setDomains((prev) => prev.filter((d) => d.id !== domainId));
        if (activeDomainId === domainId && domains.length > 1) {
          const remaining = domains.filter((d) => d.id !== domainId);
          setActiveDomainId(remaining[0].id);
        }
      }
    } catch (e) {
      console.error('Delete domain error:', e);
    }
  };

  const handleBatchLeadsImported = (newContacts: CustomerContact[]) => {
    setContacts((prev) => [...newContacts, ...prev]);
  };

  const activeDomain = domains.find((d) => d.id === activeDomainId) || domains[0];
  const pendingEscalationsCount = escalations.filter((e) => e.status !== 'resolved').length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenQuickBooking={() => handleOpenQuickBooking()}
        pendingEscalationsCount={pendingEscalationsCount}
        activeCall={activeCall}
        domains={domains}
        activeDomainId={activeDomainId}
        onSelectActiveDomain={(id) => setActiveDomainId(id)}
        googleUser={googleUser}
        isLoggingIn={isLoggingIn}
        onGoogleSignIn={handleGoogleSignIn}
        onGoogleSignOut={handleGoogleSignOut}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {authStatus === 'unauthenticated' && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-3">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <div>
                <h4 className="text-sm font-semibold text-amber-900">Unauthenticated Session</h4>
                <p className="text-xs text-amber-700">{authErrorMessage || 'Please sign in with Google or your organization account to unlock verified tenant operations.'}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleQuickOperatorLogin}
                disabled={isLoggingIn}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                Sign In as Operator
              </button>
              <button
                onClick={handleGoogleSignIn}
                disabled={isLoggingIn}
                className="px-3.5 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                {isLoggingIn ? 'Connecting...' : 'Google Sign In'}
              </button>
            </div>
          </div>
        )}

        {authStatus === 'forbidden' && (
          <div className="mb-6 bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-3">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
              <div>
                <h4 className="text-sm font-semibold text-rose-900">Tenant Access Forbidden (403)</h4>
                <p className="text-xs text-rose-700">{authErrorMessage || 'Your account does not have active membership in the selected tenant organization.'}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'call-studio' && (
          <LiveCallStudio
            contacts={contacts}
            representatives={representatives}
            onLogInteraction={handleLogInteraction}
            onOpenBookingModal={handleOpenQuickBooking}
            activeCall={activeCall}
            setActiveCall={setActiveCall}
            activeDomain={activeDomain}
            googleToken={googleToken}
          />
        )}

        {activeTab === 'multichannel' && (
          <MultichannelInbox
            contacts={contacts}
            representatives={representatives}
            onOpenBookingModal={handleOpenQuickBooking}
            onLogInteraction={handleLogInteraction}
          />
        )}

        {activeTab === 'domains' && (
          <ClientDomainsHub
            domains={domains}
            activeDomainId={activeDomainId}
            onSelectActiveDomain={(id) => setActiveDomainId(id)}
            onSaveDomain={handleSaveDomain}
            onDeleteDomain={handleDeleteDomain}
            representatives={representatives}
            onLaunchCallForDomain={(dom, _callType) => {
              setActiveDomainId(dom.id);
              setActiveTab('call-studio');
            }}
          />
        )}

        {activeTab === 'lead-import' && activeDomain && (
          <LeadUploadManager
            activeDomain={activeDomain}
            contacts={contacts}
            onBatchLeadsImported={handleBatchLeadsImported}
            onInitiateOutboundCall={(contactId) => {
              handleInitiateCall(contactId);
            }}
          />
        )}

        {activeTab === 'crm' && (
          <CrmDirectory
            contacts={contacts}
            interactions={interactions}
            representatives={representatives}
            onOpenBookingModal={handleOpenQuickBooking}
            onInitiateCall={handleInitiateCall}
            onUpdateContactNotes={handleUpdateContactNotes}
          />
        )}

        {activeTab === 'bookings' && (
          <BookingsView
            sessions={sessions}
            representatives={representatives}
            contacts={contacts}
            onOpenBookingModal={() => handleOpenQuickBooking()}
            onUpdateSessionStatus={handleUpdateSessionStatus}
          />
        )}

        {activeTab === 'escalations' && (
          <EscalationsQueue
            escalations={escalations}
            contacts={contacts}
            onResolveEscalation={handleResolveEscalation}
            onInitiateCall={handleInitiateCall}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsDashboard
            contacts={contacts}
            interactions={interactions}
            sessions={sessions}
            escalations={escalations}
          />
        )}
      </main>

      {/* Global Booking Modal */}
      <BookingModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        contacts={contacts}
        representatives={representatives}
        defaultContactId={bookingDefaultContactId}
        defaultRepId={bookingDefaultRepId}
        onBookingCreated={handleBookingCreated}
      />
    </div>
  );
}
