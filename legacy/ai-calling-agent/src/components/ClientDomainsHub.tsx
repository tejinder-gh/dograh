import React, { useState } from 'react';
import {
  Globe,
  Plus,
  Sparkles,
  CheckCircle2,
  PhoneIncoming,
  PhoneOutgoing,
  Calendar,
  Trash2,
  Edit3,
  ExternalLink,
  Shield,
  Layers,
  HelpCircle
} from 'lucide-react';
import { ClientCompanyDomain, CompanyRepresentative } from '../types';
import { getAuthHeaders } from '../utils/auth-client';

interface ClientDomainsHubProps {
  domains: ClientCompanyDomain[];
  activeDomainId: string;
  onSelectActiveDomain: (domainId: string) => void;
  onSaveDomain: (domain: ClientCompanyDomain) => Promise<void>;
  onDeleteDomain: (domainId: string) => Promise<void>;
  representatives: CompanyRepresentative[];
  onLaunchCallForDomain: (domain: ClientCompanyDomain, callType: 'inbound' | 'outbound') => void;
}

export const ClientDomainsHub: React.FC<ClientDomainsHubProps> = ({
  domains,
  activeDomainId,
  onSelectActiveDomain,
  onSaveDomain,
  onDeleteDomain,
  representatives,
  onLaunchCallForDomain,
}) => {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichInput, setEnrichInput] = useState('');

  // Form State
  const [formData, setFormData] = useState<Partial<ClientCompanyDomain>>({
    name: '',
    domain: '',
    industry: '',
    description: '',
    brandTone: '',
    knowledgeBaseSnippets: [],
    inboundGoal: '',
    inboundCalendarLink: '',
    inboundRepId: representatives[0]?.id || 'rep-1',
    outboundGoal: '',
    outboundCalendarLink: '',
    outboundRepId: representatives[1]?.id || representatives[0]?.id || 'rep-2',
  });

  const [rawSnippets, setRawSnippets] = useState('');

  const activeDomain = domains.find((d) => d.id === activeDomainId) || domains[0];

  const handleStartAdd = () => {
    setIsAddingNew(true);
    setEditingDomainId(null);
    setEnrichInput('');
    setFormData({
      name: '',
      domain: '',
      industry: 'Enterprise Software & Cloud Tech',
      description: '',
      brandTone: 'Crisp, consultative, empathetic, and authoritative',
      knowledgeBaseSnippets: [
        'Under 120ms latency voice response',
        'Bidirectional CRM synchronization with automated notes',
        '24/7 proactive escalation monitoring'
      ],
      inboundGoal: 'Triage customer inquiries, answer questions empathetically, and book a 30-min Inbound Architecture Consultation.',
      inboundCalendarLink: 'https://calendar.google.com/calendar/u/0/r/eventedit?text=Inbound+Architecture+Consultation',
      inboundRepId: representatives[0]?.id || 'rep-1',
      outboundGoal: 'Outreach to qualified decision makers, assess BANT budget, and schedule a 45-min Technical Discovery session.',
      outboundCalendarLink: 'https://calendar.google.com/calendar/u/0/r/eventedit?text=Outbound+Technical+Discovery',
      outboundRepId: representatives[1]?.id || representatives[0]?.id || 'rep-2',
    });
    setRawSnippets(
      'Under 120ms latency voice response\nBidirectional CRM synchronization with automated notes\n24/7 proactive escalation monitoring'
    );
  };

  const handleStartEdit = (domain: ClientCompanyDomain) => {
    setIsAddingNew(false);
    setEditingDomainId(domain.id);
    setFormData({ ...domain });
    setRawSnippets((domain.knowledgeBaseSnippets || []).join('\n'));
  };

  const handleCancelForm = () => {
    setIsAddingNew(false);
    setEditingDomainId(null);
  };

  const handleAiEnrich = async () => {
    const query = enrichInput.trim() || formData.domain || formData.name;
    if (!query) return;

    setIsEnriching(true);
    try {
      const res = await fetch('/api/domains/ai-enrich', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ domain: query, companyName: formData.name }),
      });

      if (res.ok) {
        const data = await res.json();
        setFormData((prev) => ({
          ...prev,
          name: data.name || prev.name,
          domain: data.domain || prev.domain,
          industry: data.industry || prev.industry,
          description: data.description || prev.description,
          brandTone: data.brandTone || prev.brandTone,
          knowledgeBaseSnippets: data.knowledgeBaseSnippets || prev.knowledgeBaseSnippets,
          inboundGoal: data.inboundGoal || prev.inboundGoal,
          inboundCalendarLink: data.inboundCalendarLink || prev.inboundCalendarLink,
          outboundGoal: data.outboundGoal || prev.outboundGoal,
          outboundCalendarLink: data.outboundCalendarLink || prev.outboundCalendarLink,
        }));
        setRawSnippets((data.knowledgeBaseSnippets || []).join('\n'));
      }
    } catch (err) {
      console.error('Failed to auto-enrich domain:', err);
    } finally {
      setIsEnriching(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.domain) return;

    const snippets = rawSnippets
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const domainToSave: ClientCompanyDomain = {
      id: editingDomainId || `domain-${Date.now()}`,
      name: formData.name || 'Enterprise Client',
      domain: formData.domain || 'enterprise.com',
      industry: formData.industry || 'Technology',
      description: formData.description || 'Enterprise customer solution.',
      brandTone: formData.brandTone || 'Professional and empathetic',
      knowledgeBaseSnippets: snippets,
      inboundGoal: formData.inboundGoal || 'Resolve customer inquiries and book a 1-on-1 discovery session.',
      inboundCalendarLink: formData.inboundCalendarLink || 'https://calendar.google.com/calendar',
      inboundRepId: formData.inboundRepId || representatives[0].id,
      outboundGoal: formData.outboundGoal || 'Qualify leads and schedule a technical walkthrough.',
      outboundCalendarLink: formData.outboundCalendarLink || 'https://calendar.google.com/calendar',
      outboundRepId: formData.outboundRepId || representatives[1]?.id || representatives[0].id,
      createdAt: new Date().toISOString(),
    };

    await onSaveDomain(domainToSave);
    setIsAddingNew(false);
    setEditingDomainId(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Client & Company Domain Hub
            </h2>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
              Multi-Domain AI Engine
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Configure tailored intelligence for each company: auto-enrich industry details, define separate 
            <strong> Inbound & Outbound Goals</strong>, assign dedicated calendar booking links, and switch active context dynamically.
          </p>
        </div>

        <button
          onClick={handleStartAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add & AI-Enrich Domain</span>
        </button>
      </div>

      {/* Active Domain Highlight Banner */}
      {activeDomain && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl p-5 shadow-sm border border-slate-800">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
                <Globe className="w-4 h-4" />
                <span>CURRENTLY ACTIVE DOMAIN CONTEXT:</span>
                <span className="font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                  {activeDomain.domain}
                </span>
              </div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {activeDomain.name}
                <span className="text-xs font-normal text-slate-300 bg-white/10 px-2 py-0.5 rounded">
                  {activeDomain.industry}
                </span>
              </h3>
              <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                {activeDomain.description}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
              <div className="p-3 bg-white/5 rounded-lg border border-white/10 text-xs">
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold mb-1">
                  <PhoneIncoming className="w-3.5 h-3.5" />
                  <span>Inbound Goal</span>
                </div>
                <p className="text-[11px] text-slate-300 line-clamp-2">
                  {activeDomain.inboundGoal}
                </p>
                <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
                  <a
                    href={activeDomain.inboundCalendarLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-indigo-300 hover:text-indigo-200 flex items-center gap-1"
                  >
                    <Calendar className="w-3 h-3" />
                    <span>Inbound Link</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  <button
                    onClick={() => onLaunchCallForDomain(activeDomain, 'inbound')}
                    className="text-[10px] font-semibold text-emerald-300 hover:text-emerald-200"
                  >
                    Simulate Inbound →
                  </button>
                </div>
              </div>

              <div className="p-3 bg-white/5 rounded-lg border border-white/10 text-xs">
                <div className="flex items-center gap-1.5 text-indigo-400 font-semibold mb-1">
                  <PhoneOutgoing className="w-3.5 h-3.5" />
                  <span>Outbound Goal</span>
                </div>
                <p className="text-[11px] text-slate-300 line-clamp-2">
                  {activeDomain.outboundGoal}
                </p>
                <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
                  <a
                    href={activeDomain.outboundCalendarLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-indigo-300 hover:text-indigo-200 flex items-center gap-1"
                  >
                    <Calendar className="w-3 h-3" />
                    <span>Outbound Link</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  <button
                    onClick={() => onLaunchCallForDomain(activeDomain, 'outbound')}
                    className="text-[10px] font-semibold text-indigo-300 hover:text-indigo-200"
                  >
                    Simulate Outbound →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Domain Drawer Modal / Card */}
      {(isAddingNew || editingDomainId) && (
        <div className="bg-white rounded-xl border-2 border-indigo-200 p-6 shadow-sm transition-all">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {isAddingNew ? 'Register New Client Domain with AI' : `Edit Domain: ${formData.name}`}
              </h3>
              <p className="text-xs text-slate-500">
                Type the domain or company name and let Gemini AI automatically discover its industry, value proposition, and tailored Inbound/Outbound goals.
              </p>
            </div>
            <button
              onClick={handleCancelForm}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>

          {/* AI Auto-Enrich Quick Bar */}
          <div className="bg-indigo-50/70 border border-indigo-100 rounded-lg p-4 mb-5">
            <label className="block text-xs font-bold text-indigo-950 mb-1.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>AI Company Intelligence Retrieval</span>
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Enter domain or brand (e.g., finflow-cloud.io, HealthBridge AI, Acme Global)"
                value={enrichInput}
                onChange={(e) => setEnrichInput(e.target.value)}
                className="flex-1 text-xs px-3 py-2 bg-white rounded-md border border-indigo-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={handleAiEnrich}
                disabled={isEnriching || (!enrichInput.trim() && !formData.domain)}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-md text-xs font-semibold transition-colors shrink-0"
              >
                {isEnriching ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Analyzing Domain...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto-Enrich via AI</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-indigo-700 mt-2">
              Gemini will research the company, generate industry background, draft tailored voice agent knowledge points, and configure separate incoming/outgoing campaign goals!
            </p>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Company / Brand Name</label>
                <input
                  type="text"
                  required
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Apex Health Logistics"
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Domain URL</label>
                <input
                  type="text"
                  required
                  value={formData.domain || ''}
                  onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  placeholder="e.g. apexhealth.io"
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Industry Vertical</label>
                <input
                  type="text"
                  value={formData.industry || ''}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  placeholder="e.g. Telehealth & EHR Compliance"
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Company Description & Value Proposition</label>
                <textarea
                  rows={2}
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief summary of what this company does..."
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Brand Voice & Persona Tone</label>
                <textarea
                  rows={2}
                  value={formData.brandTone || ''}
                  onChange={(e) => setFormData({ ...formData, brandTone: e.target.value })}
                  placeholder="e.g. Empathetic, fiduciary, reassuring, and consultative"
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Knowledge Base Snippets */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Verified Knowledge Base Facts & Capabilities (1 per line)
              </label>
              <textarea
                rows={3}
                value={rawSnippets}
                onChange={(e) => setRawSnippets(e.target.value)}
                placeholder="Sub-120ms response time&#10;SOC-2 Type II Certified&#10;Direct CRM bidirectional integration"
                className="w-full font-mono text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Inbound & Outbound Goals & Links Split Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-slate-100">
              {/* Inbound Goal Box */}
              <div className="p-4 bg-emerald-50/50 rounded-lg border border-emerald-200/80 space-y-3">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
                  <PhoneIncoming className="w-4 h-4 text-emerald-600" />
                  <span>INCOMING CALLS GOAL & CALENDAR LINK</span>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-emerald-950 mb-1">Inbound Primary Goal</label>
                  <textarea
                    rows={2}
                    value={formData.inboundGoal || ''}
                    onChange={(e) => setFormData({ ...formData, inboundGoal: e.target.value })}
                    placeholder="e.g., Triage technical doubts and book an Inbound 30-min VIP Architecture Session."
                    className="w-full text-xs px-3 py-2 bg-white border border-emerald-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-emerald-950 mb-1">Inbound Dedicated Calendar Link</label>
                  <input
                    type="url"
                    value={formData.inboundCalendarLink || ''}
                    onChange={(e) => setFormData({ ...formData, inboundCalendarLink: e.target.value })}
                    placeholder="https://calendar.google.com/calendar/u/0/r/eventedit?text=Inbound+Session"
                    className="w-full text-xs px-3 py-1.5 bg-white border border-emerald-300 rounded-md focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-emerald-950 mb-1">Default Assigned Rep for Inbound</label>
                  <select
                    value={formData.inboundRepId}
                    onChange={(e) => setFormData({ ...formData, inboundRepId: e.target.value })}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-emerald-300 rounded-md"
                  >
                    {representatives.map((rep) => (
                      <option key={rep.id} value={rep.id}>
                        {rep.name} — {rep.role}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Outbound Goal Box */}
              <div className="p-4 bg-indigo-50/50 rounded-lg border border-indigo-200/80 space-y-3">
                <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
                  <PhoneOutgoing className="w-4 h-4 text-indigo-600" />
                  <span>OUTGOING CALLS GOAL & CALENDAR LINK</span>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-indigo-950 mb-1">Outbound Primary Goal</label>
                  <textarea
                    rows={2}
                    value={formData.outboundGoal || ''}
                    onChange={(e) => setFormData({ ...formData, outboundGoal: e.target.value })}
                    placeholder="e.g., Cold-warm outreach to qualified leads, verify BANT budget, and book a 45-min Deep Dive."
                    className="w-full text-xs px-3 py-2 bg-white border border-indigo-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-indigo-950 mb-1">Outbound Dedicated Calendar Link</label>
                  <input
                    type="url"
                    value={formData.outboundCalendarLink || ''}
                    onChange={(e) => setFormData({ ...formData, outboundCalendarLink: e.target.value })}
                    placeholder="https://calendar.google.com/calendar/u/0/r/eventedit?text=Outbound+Deep+Dive"
                    className="w-full text-xs px-3 py-1.5 bg-white border border-indigo-300 rounded-md focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-indigo-950 mb-1">Default Assigned Rep for Outbound</label>
                  <select
                    value={formData.outboundRepId}
                    onChange={(e) => setFormData({ ...formData, outboundRepId: e.target.value })}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-indigo-300 rounded-md"
                  >
                    {representatives.map((rep) => (
                      <option key={rep.id} value={rep.id}>
                        {rep.name} — {rep.role}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={handleCancelForm}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
              >
                {isAddingNew ? 'Create Client Domain Profile' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grid of All Configured Domains */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {domains.map((dom) => {
          const isActive = dom.id === activeDomainId;
          const inboundRep = representatives.find((r) => r.id === dom.inboundRepId) || representatives[0];
          const outboundRep = representatives.find((r) => r.id === dom.outboundRepId) || representatives[1] || representatives[0];

          return (
            <div
              key={dom.id}
              className={`bg-white rounded-xl border transition-all shadow-xs flex flex-col justify-between ${
                isActive
                  ? 'border-indigo-600 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="p-5">
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-slate-900 text-sm truncate">{dom.name}</h4>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <Globe className="w-3 h-3 text-slate-400" />
                      {dom.domain}
                    </span>
                  </div>

                  {isActive ? (
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      ACTIVE
                    </span>
                  ) : (
                    <button
                      onClick={() => onSelectActiveDomain(dom.id)}
                      className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      Set Active
                    </button>
                  )}
                </div>

                <div className="mt-3">
                  <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {dom.industry}
                  </span>
                </div>

                <p className="text-xs text-slate-600 mt-2.5 line-clamp-2 leading-relaxed">
                  {dom.description}
                </p>

                {/* Goals Summary Boxes */}
                <div className="mt-4 space-y-2.5 pt-3 border-t border-slate-100">
                  <div className="p-2.5 bg-emerald-50/60 rounded-lg border border-emerald-100">
                    <div className="flex items-center justify-between text-[11px] font-bold text-emerald-900">
                      <span className="flex items-center gap-1">
                        <PhoneIncoming className="w-3 h-3 text-emerald-600" />
                        Inbound Goal
                      </span>
                      <span className="text-[10px] text-emerald-700 font-normal">Rep: {inboundRep.name.split(' ')[0]}</span>
                    </div>
                    <p className="text-[11px] text-slate-700 mt-1 line-clamp-2">
                      {dom.inboundGoal}
                    </p>
                  </div>

                  <div className="p-2.5 bg-indigo-50/60 rounded-lg border border-indigo-100">
                    <div className="flex items-center justify-between text-[11px] font-bold text-indigo-900">
                      <span className="flex items-center gap-1">
                        <PhoneOutgoing className="w-3 h-3 text-indigo-600" />
                        Outbound Goal
                      </span>
                      <span className="text-[10px] text-indigo-700 font-normal">Rep: {outboundRep.name.split(' ')[0]}</span>
                    </div>
                    <p className="text-[11px] text-slate-700 mt-1 line-clamp-2">
                      {dom.outboundGoal}
                    </p>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 rounded-b-xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onLaunchCallForDomain(dom, 'inbound')}
                    title="Simulate Inbound Call for this company"
                    className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors text-xs flex items-center gap-1 font-medium"
                  >
                    <PhoneIncoming className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="hidden sm:inline text-[10px]">Inbound</span>
                  </button>
                  <button
                    onClick={() => onLaunchCallForDomain(dom, 'outbound')}
                    title="Start Outbound Outreach for this company"
                    className="p-1.5 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors text-xs flex items-center gap-1 font-medium"
                  >
                    <PhoneOutgoing className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="hidden sm:inline text-[10px]">Outbound</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleStartEdit(dom)}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded transition-colors"
                    title="Edit Domain Profile"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  {domains.length > 1 && (
                    <button
                      onClick={() => onDeleteDomain(dom.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                      title="Delete Domain"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
