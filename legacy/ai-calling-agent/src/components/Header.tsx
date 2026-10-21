import React from 'react';
import {
  PhoneCall,
  MessageSquare,
  Users,
  Calendar,
  AlertTriangle,
  BarChart3,
  Plus,
  Globe,
  FileSpreadsheet,
  CheckCircle2,
  ChevronDown,
  LogOut,
  ShoppingBag
} from 'lucide-react';
import { ClientCompanyDomain } from '../types';

export type ActiveTab =
  | 'call-studio'
  | 'multichannel'
  | 'domains'
  | 'lead-import'
  | 'crm'
  | 'bookings'
  | 'escalations'
  | 'analytics'
  | 'marketplace';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenQuickBooking: () => void;
  pendingEscalationsCount: number;
  activeCall: boolean;
  domains: ClientCompanyDomain[];
  activeDomainId: string;
  onSelectActiveDomain: (domainId: string) => void;
  googleUser: any | null;
  isLoggingIn: boolean;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenQuickBooking,
  pendingEscalationsCount,
  activeCall,
  domains,
  activeDomainId,
  onSelectActiveDomain,
  googleUser,
  isLoggingIn,
  onGoogleSignIn,
  onGoogleSignOut,
}) => {
  const activeDomain = domains.find((d) => d.id === activeDomainId) || domains[0];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-16">
          {/* Zone 1: Brand Wordmark & Active Domain Badge */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-xs tracking-tighter">
                AV
              </div>
              <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
                AcuityVoice
              </span>
            </div>

            {/* Active Company Selector Pill */}
            {domains.length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 pl-2.5 border-l border-slate-200">
                <Globe className="w-3.5 h-3.5 text-indigo-600" />
                <select
                  value={activeDomainId}
                  onChange={(e) => onSelectActiveDomain(e.target.value)}
                  className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  title="Switch Active Client Company Context"
                >
                  {domains.map((dom) => (
                    <option key={dom.id} value={dom.id}>
                      {dom.name} ({dom.domain})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 overflow-x-auto shrink-0">
            <button
              onClick={() => setActiveTab('call-studio')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'call-studio'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Call Studio</span>
              {activeCall && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('multichannel')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'multichannel'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Text Channels</span>
            </button>

            <button
              onClick={() => setActiveTab('domains')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'domains'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Domains & Goals</span>
            </button>

            <button
              onClick={() => setActiveTab('lead-import')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'lead-import'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Lead Ingestion</span>
            </button>

            <button
              onClick={() => setActiveTab('crm')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'crm'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>CRM</span>
            </button>

            <button
              onClick={() => setActiveTab('bookings')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'bookings'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>1-on-1 Sessions</span>
            </button>

            <button
              onClick={() => setActiveTab('escalations')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'escalations'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Escalations</span>
              {pendingEscalationsCount > 0 && (
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded-full bg-rose-600 text-white">
                  {pendingEscalationsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'analytics'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Insights</span>
            </button>

            <button
              onClick={() => setActiveTab('marketplace')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'marketplace'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 text-indigo-500" />
              <span>Marketplace</span>
            </button>
          </nav>

          {/* Zone 3: Google Workspace Auth & Book Action */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Google Sign-in / Calendar Connection Status */}
            {googleUser ? (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs">
                {googleUser.photoURL ? (
                  <img
                    src={googleUser.photoURL}
                    alt={googleUser.displayName || 'Google Account'}
                    referrerPolicy="no-referrer"
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-[10px]">
                    G
                  </div>
                )}
                <div className="hidden sm:flex flex-col text-left">
                  <span className="font-semibold text-slate-800 text-[11px] truncate max-w-[100px]">
                    {googleUser.displayName || googleUser.email}
                  </span>
                  <span className="text-[9px] text-emerald-600 font-medium flex items-center gap-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Calendar Sync On
                  </span>
                </div>
                <button
                  onClick={onGoogleSignOut}
                  title="Disconnect Google Calendar"
                  className="text-slate-400 hover:text-slate-600 ml-1 p-0.5"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={onGoogleSignIn}
                disabled={isLoggingIn}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md transition-colors shadow-2xs whitespace-nowrap"
                title="Connect Google Calendar to sync availability and booked sessions"
              >
                {/* Official Google Icon SVG */}
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{isLoggingIn ? 'Connecting...' : 'Google Calendar'}</span>
              </button>
            )}

            <button
              onClick={onOpenQuickBooking}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors whitespace-nowrap shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Book 1-on-1 Session</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="lg:hidden flex items-center justify-between border-t border-slate-100 py-2 overflow-x-auto gap-1 text-[11px]">
          <button
            onClick={() => setActiveTab('call-studio')}
            className={`px-2 py-1 font-medium rounded whitespace-nowrap ${
              activeTab === 'call-studio' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Calls
          </button>
          <button
            onClick={() => setActiveTab('multichannel')}
            className={`px-2 py-1 font-medium rounded whitespace-nowrap ${
              activeTab === 'multichannel' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Text
          </button>
          <button
            onClick={() => setActiveTab('domains')}
            className={`px-2 py-1 font-medium rounded whitespace-nowrap ${
              activeTab === 'domains' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Domains
          </button>
          <button
            onClick={() => setActiveTab('lead-import')}
            className={`px-2 py-1 font-medium rounded whitespace-nowrap ${
              activeTab === 'lead-import' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Lead Upload
          </button>
          <button
            onClick={() => setActiveTab('crm')}
            className={`px-2 py-1 font-medium rounded whitespace-nowrap ${
              activeTab === 'crm' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            CRM
          </button>
          <button
            onClick={() => setActiveTab('bookings')}
            className={`px-2 py-1 font-medium rounded whitespace-nowrap ${
              activeTab === 'bookings' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Sessions
          </button>
          <button
            onClick={() => setActiveTab('escalations')}
            className={`px-2 py-1 font-medium rounded whitespace-nowrap ${
              activeTab === 'escalations' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Alerts ({pendingEscalationsCount})
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-2 py-1 font-medium rounded whitespace-nowrap ${
              activeTab === 'analytics' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Insights
          </button>
        </div>
      </div>
    </header>
  );
};
