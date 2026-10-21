import React, { useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  PhoneOutgoing,
  ArrowRight,
  Database,
  Building,
  RefreshCw,
  FileText,
  User,
  Mail,
  Phone,
  Tag
} from 'lucide-react';
import {
  ClientCompanyDomain,
  CustomerContact,
  LeadUploadFieldMapping,
  PlatformLeadField
} from '../types';
import { parseCsvContent } from '../utils/agent-logic';
import { getAuthHeaders } from '../utils/auth-client';

interface LeadUploadManagerProps {
  activeDomain: ClientCompanyDomain;
  contacts: CustomerContact[];
  onBatchLeadsImported: (newContacts: CustomerContact[]) => void;
  onInitiateOutboundCall: (contactId: string) => void;
}

const SAMPLE_MESSY_CSV = `full_lead_name,customer female,direct_cell,firm_name,exec_role,deal_budget_arr,timeframe_urgency,special_notes
Jessica Tan,jessica.tan@fintechcore.io,+1 (415) 345-9876,Fintech Core Global,VP of Infrastructure,$65,000 / yr,Within 30 days,Interested in voice latency benchmarks
Marcus Brody,m.brody@apexlogistics.com,+1 (212) 876-5432,Apex Logistics Partners,Director of Support,$45,000 / yr,Immediate Q4 rollout,Needs SMS + WhatsApp fallback
Claire DeWitt,claire@dewittanalytics.com,+1 (312) 555-4321,DeWitt Analytics Group,Chief Operating Officer,$90,000 / yr,2 weeks evaluation,Looking for automated supervisor escalation triggers
Rajesh Patel,rajesh@healthflow.net,+1 (650) 890-1122,HealthFlow Systems,Lead Systems Architect,$75,000 / yr,60 days,Wants Google Calendar integration for doctor consultations`;

export const LeadUploadManager: React.FC<LeadUploadManagerProps> = ({
  activeDomain,
  contacts,
  onBatchLeadsImported,
  onInitiateOutboundCall,
}) => {
  const [csvRawText, setCsvRawText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('sample_leads.csv');
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [mappings, setMappings] = useState<LeadUploadFieldMapping[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  // Load sample messy CSV
  const handleLoadSample = () => {
    setCsvRawText(SAMPLE_MESSY_CSV);
    setFileName('sample_unstructured_leads.csv');
    const parsed = parseCsvContent(SAMPLE_MESSY_CSV);
    setParsedHeaders(parsed.headers);
    setParsedRows(parsed.rows);
    setMappings([]);
    setImportSuccessMessage(null);
  };

  // Handle file input
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setImportSuccessMessage(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvRawText(text);
      const parsed = parseCsvContent(text);
      setParsedHeaders(parsed.headers);
      setParsedRows(parsed.rows);
      setMappings([]);
    };
    reader.readAsText(file);
  };

  // Run AI Column Matching Engine
  const handleAnalyzeWithAI = async () => {
    if (parsedHeaders.length === 0) return;

    setIsAnalyzing(true);
    setImportSuccessMessage(null);

    try {
      const res = await fetch('/api/leads/ai-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers: parsedHeaders,
          sampleRows: parsedRows.slice(0, 5),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMappings(data.mappings || []);
      }
    } catch (err) {
      console.error('Failed to analyze CSV headers:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Allow manual override of mapped field
  const handleUpdateMapping = (header: string, newField: PlatformLeadField) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.originalHeader === header
          ? {
              ...m,
              mappedField: newField,
              explanation: `User manually assigned to ${newField}`,
            }
          : m
      )
    );
  };

  // Confirm import as Outbound Calling Leads
  const handleImportLeads = async () => {
    if (parsedRows.length === 0 || mappings.length === 0) return;

    setIsImporting(true);

    // Build header-to-field lookup
    const fieldByHeader: Record<string, PlatformLeadField> = {};
    for (const m of mappings) {
      fieldByHeader[m.originalHeader] = m.mappedField;
    }

    const transformedLeads = parsedRows.map((row) => {
      const lead: Record<string, any> = {};
      for (const [header, val] of Object.entries(row)) {
        const field = fieldByHeader[header];
        if (field && field !== 'ignore') {
          lead[field] = val;
        }
      }
      return lead;
    });

    try {
      const res = await fetch('/api/leads/batch-upload', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          leads: transformedLeads,
          domainId: activeDomain.id,
          domainName: activeDomain.name,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onBatchLeadsImported(data.contacts || []);
        setImportSuccessMessage(
          `Successfully mapped and imported ${data.importedCount} outbound calling leads for ${activeDomain.name}!`
        );
      }
    } catch (err) {
      console.error('Failed to import leads:', err);
    } finally {
      setIsImporting(false);
    }
  };

  // Filter outbound campaign leads
  const outboundLeads = contacts.filter((c) =>
    c.tags.some((t) => t.toLowerCase().includes('outbound'))
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Lead Upload & AI Column Decision Engine
            </h2>
            <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
              Intelligent CSV Ingestion
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Upload any arbitrary or non-standard CSV/TSV of sales leads. Even if columns have unexpected names or typos 
            (e.g., <code>customer female</code> instead of <code>email</code>), our AI analyzes the schema and row data to 
            correctly map every field to your platform.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleLoadSample}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors border border-slate-200"
          >
            <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
            <span>Load Sample Messy CSV</span>
          </button>
        </div>
      </div>

      {/* Target Domain Outbound Campaign Target Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 rounded-xl p-4 text-white shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <div className="text-[11px] text-indigo-300 font-medium">TARGET OUTBOUND CLIENT DOMAIN:</div>
            <div className="text-sm font-bold text-white flex items-center gap-2 mt-0.5">
              <span>{activeDomain.name}</span>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/70 px-2 py-0.2 rounded border border-emerald-800">
                {activeDomain.domain}
              </span>
            </div>
            <div className="text-[11px] text-slate-300 mt-1">
              <strong>Assigned Outbound Goal:</strong> {activeDomain.outboundGoal}
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[11px] text-indigo-200 block">Outbound Queue</span>
            <span className="text-lg font-bold text-white">{outboundLeads.length} Leads</span>
          </div>
        </div>
      </div>

      {/* Upload Dropzone & Action Box */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-indigo-600" />
            <span>Upload Leads File</span>
          </h3>

          <div className="border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-lg p-6 text-center transition-colors">
            <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-700">
              Drag & drop CSV file or click to browse
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Supports .csv, .tsv, with any arbitrary headers
            </p>
            <label className="mt-3 inline-block px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-semibold cursor-pointer">
              Choose File
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {fileName && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <div className="flex items-center justify-between text-slate-700 font-medium">
                <span className="truncate max-w-[180px]">{fileName}</span>
                <span className="font-mono text-[10px] text-indigo-600 font-bold">
                  {parsedRows.length} rows detected
                </span>
              </div>
            </div>
          )}

          <button
            onClick={handleAnalyzeWithAI}
            disabled={isAnalyzing || parsedHeaders.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
          >
            {isAnalyzing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>AI Analyzing Schema...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Analyze with AI Column Mapper</span>
              </>
            )}
          </button>
        </div>

        {/* AI Column Mapping Panel */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>AI Schema Matching & Column Alignment</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  AI reads row semantics to identify correct destination attributes even when headers have unusual nomenclature.
                </p>
              </div>

              {mappings.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {mappings.length} Fields Mapped
                </span>
              )}
            </div>

            {mappings.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <Database className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs">No active column mappings yet.</p>
                <p className="text-[11px] text-slate-400">
                  Click "Load Sample Messy CSV" or upload your file, then click "Analyze with AI Column Mapper".
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] text-slate-600 font-semibold">
                      <th className="py-2 px-3">CSV Column Name</th>
                      <th className="py-2 px-3">Sample Value</th>
                      <th className="py-2 px-3">AI Mapped Field</th>
                      <th className="py-2 px-3">AI Confidence & Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mappings.map((m) => {
                      const sampleVal = parsedRows[0]?.[m.originalHeader] || '—';
                      const isHighConf = m.confidence >= 0.85;

                      return (
                        <tr key={m.originalHeader} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                            {m.originalHeader}
                            {m.originalHeader.toLowerCase().includes('female') && (
                              <span className="ml-1 text-[9px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-sans">
                                typo matched
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 max-w-[140px] truncate">
                            {sampleVal}
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              value={m.mappedField}
                              onChange={(e) =>
                                handleUpdateMapping(
                                  m.originalHeader,
                                  e.target.value as PlatformLeadField
                                )
                              }
                              className={`text-xs px-2 py-1 rounded border font-medium ${
                                m.mappedField === 'email'
                                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                  : m.mappedField === 'ignore'
                                  ? 'bg-slate-100 border-slate-200 text-slate-400'
                                  : 'bg-white border-slate-300 text-slate-700'
                              }`}
                            >
                              <option value="name">name (Full Name)</option>
                              <option value="email">email (Email Address)</option>
                              <option value="phone">phone (Direct Telephone)</option>
                              <option value="company">company (Organization)</option>
                              <option value="role">role (Job Title)</option>
                              <option value="estimatedValue">estimatedValue (Deal Budget)</option>
                              <option value="timeline">timeline (Urgency/Time)</option>
                              <option value="notes">notes (Notes & Details)</option>
                              <option value="ignore">ignore (Skip Column)</option>
                            </select>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.2 rounded w-fit ${
                                  isHighConf
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                              >
                                {Math.round(m.confidence * 100)}% Confidence
                              </span>
                              <span className="text-[10px] text-slate-500 line-clamp-1" title={m.explanation}>
                                {m.explanation}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Import Bottom Button */}
          {mappings.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Ready to import <strong>{parsedRows.length}</strong> leads for <strong>{activeDomain.name}</strong>
              </span>
              <button
                onClick={handleImportLeads}
                disabled={isImporting}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
              >
                {isImporting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-3.5 h-3.5" />
                    <span>Import as Outbound Calling Leads</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Success Notification */}
      {importSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{importSuccessMessage}</span>
          </div>
        </div>
      )}

      {/* Outbound Leads Queue Showcase */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <PhoneOutgoing className="w-4 h-4 text-indigo-600" />
              <span>Outbound Dialing Leads Queue</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              These imported leads are prepped for autonomous AI outbound outreach using <strong>{activeDomain.name}</strong>'s Outbound Goal.
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded">
            {outboundLeads.length} Available in Dial Queue
          </span>
        </div>

        {outboundLeads.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">
            No outbound leads loaded yet. Upload a CSV above or click "Load Sample Messy CSV" to test!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Lead / Contact</th>
                  <th className="py-2.5 px-3">Company & Role</th>
                  <th className="py-2.5 px-3">Estimated Budget</th>
                  <th className="py-2.5 px-3">Campaign Tag</th>
                  <th className="py-2.5 px-3">Notes & Need</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {outboundLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={lead.avatar}
                          alt={lead.name}
                          className="w-7 h-7 rounded-full object-cover border border-slate-200"
                        />
                        <div>
                          <span className="font-bold text-slate-900 block">{lead.name}</span>
                          <span className="text-[11px] text-slate-400 block font-mono">{lead.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-medium text-slate-800 block">{lead.company}</span>
                      <span className="text-[11px] text-slate-500 block">{lead.role}</span>
                    </td>
                    <td className="py-3 px-3 font-mono font-semibold text-emerald-700">
                      {lead.estimatedValue}
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {lead.tags[1] || lead.tags[0]}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-500 max-w-[220px] truncate text-[11px]">
                      {lead.notes}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => onInitiateOutboundCall(lead.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-semibold transition-colors shadow-xs"
                      >
                        <PhoneOutgoing className="w-3 h-3" />
                        <span>Launch AI Call</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
