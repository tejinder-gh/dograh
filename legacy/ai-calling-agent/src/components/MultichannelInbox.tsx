import React, { useState } from 'react';
import {
  MessageSquare,
  Smartphone,
  Globe,
  Send,
  Sparkles,
  AlertTriangle,
  Calendar,
  Check,
  Bot
} from 'lucide-react';
import { CustomerContact, CompanyRepresentative, InteractionLog, ChatMessage } from '../types';
import { getSentimentCategory } from '../utils/agent-logic';

interface MultichannelInboxProps {
  contacts: CustomerContact[];
  representatives: CompanyRepresentative[];
  onOpenBookingModal: (contactId?: string) => void;
  onLogInteraction: (log: InteractionLog) => void;
}

interface ThreadItem {
  id: string;
  contactId: string;
  channel: 'sms' | 'whatsapp' | 'webchat';
  unread: boolean;
  messages: ChatMessage[];
  sentiment: number;
}

export const MultichannelInbox: React.FC<MultichannelInboxProps> = ({
  contacts,
  representatives,
  onOpenBookingModal,
  onLogInteraction,
}) => {
  const [activeChannelFilter, setActiveChannelFilter] = useState<'all' | 'sms' | 'whatsapp' | 'webchat'>('all');
  const [selectedThreadId, setSelectedThreadId] = useState<string>('thread-1');
  const [isAutonomous, setIsAutonomous] = useState<boolean>(true);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Initial threads
  const [threads, setThreads] = useState<ThreadItem[]>([
    {
      id: 'thread-1',
      contactId: 'contact-2', // Elena Rostova
      channel: 'whatsapp',
      unread: false,
      sentiment: 72,
      messages: [
        {
          id: 't1-m1',
          speaker: 'customer',
          text: 'Hi! We are evaluating omnichannel AI support for our wealth advisory team. Can your agent route inquiries to specific advisors based on portfolio size?',
          timestamp: '09:20 AM',
          sentiment: 50,
        },
        {
          id: 't1-m2',
          speaker: 'agent',
          text: 'Hello Elena! Absolutely. AcuityVoice dynamically checks client AUM in your CRM and can route to dedicated Senior Advisors or instantly book a 1-on-1 strategy session with Sarah Jenkins or Marcus Chen. Would you like to review a live sandbox walkthrough?',
          timestamp: '09:21 AM',
          empathyPillar: 'Clear Domain Alignment & Value Offer',
          sentiment: 78,
          bookingTriggered: true,
        },
        {
          id: 't1-m3',
          speaker: 'customer',
          text: 'Yes, that sounds very interesting. Does it support WhatsApp voice notes as well?',
          timestamp: '09:24 AM',
          sentiment: 65,
        },
      ],
    },
    {
      id: 'thread-2',
      contactId: 'contact-3', // Jordan Bell
      channel: 'sms',
      unread: true,
      sentiment: -35,
      messages: [
        {
          id: 't2-m1',
          speaker: 'customer',
          text: 'We are seeing delays on our return authorization texts. Our retail customers are getting agitated. Why did the SMS queue stall?',
          timestamp: '10:05 AM',
          sentiment: -40,
        },
        {
          id: 't2-m2',
          speaker: 'agent',
          text: 'Jordan, I completely understand the urgency here—customer delivery friction during peak shopping hours is critical to prevent. Our engineers have auto-routed SMS traffic through our secondary redundant carrier. All pending notifications are delivering now.',
          timestamp: '10:06 AM',
          empathyPillar: 'Urgent De-escalation & Resolution Roadmap',
          sentiment: -20,
        },
      ],
    },
    {
      id: 'thread-3',
      contactId: 'contact-1', // David Vance
      channel: 'webchat',
      unread: false,
      sentiment: 85,
      messages: [
        {
          id: 't3-m1',
          speaker: 'customer',
          text: 'Marcus, could we confirm the API webhook payloads for the call transcript events before our session?',
          timestamp: '08:14 AM',
          sentiment: 80,
        },
        {
          id: 't3-m2',
          speaker: 'agent',
          text: 'Good morning David! Here is the JSON schema payload for all realtime voice and text events. Every turn includes speaker, sub-second timestamp, audio byte length, and normalized sentiment score.',
          timestamp: '08:15 AM',
          empathyPillar: 'Immediate Technical Delivery',
          sentiment: 90,
        },
      ],
    },
  ]);

  const filteredThreads = threads.filter((t) =>
    activeChannelFilter === 'all' ? true : t.channel === activeChannelFilter
  );

  const currentThread = threads.find((t) => t.id === selectedThreadId) || threads[0];
  const currentContact = contacts.find((c) => c.id === currentThread?.contactId) || contacts[0];

  const handleSendMessage = async () => {
    if (!inputText.trim() || isSending) return;
    const text = inputText.trim();
    setInputText('');
    setIsSending(true);

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      speaker: 'customer',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedMessages = [...currentThread.messages, userMessage];

    // Update state with customer message
    setThreads((prev) =>
      prev.map((t) => (t.id === currentThread.id ? { ...t, messages: updatedMessages } : t))
    );

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          channel: currentThread.channel,
          contactId: currentContact.id,
          callerName: currentContact.name,
          company: currentContact.company,
          conversationHistory: updatedMessages,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const agentMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          speaker: 'agent',
          text: data.agentResponse,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          sentiment: data.sentimentScore,
          empathyPillar: data.empathyTechniqueUsed || 'Active Empathy & Clarification',
          bookingTriggered: data.bookingSuggested,
        };

        setThreads((prev) =>
          prev.map((t) =>
            t.id === currentThread.id
              ? {
                  ...t,
                  sentiment: data.sentimentScore ?? t.sentiment,
                  messages: [...updatedMessages, agentMsg],
                }
              : t
          )
        );
      }
    } catch (e) {
      console.error('Error sending message:', e);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[740px]">
      {/* Top Banner / Channel Tabs */}
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Multichannel Text Inbox & Support Copilot
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Consistent, accurate, and empathetic customer communication across SMS, WhatsApp, and Web Chat.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Autonomous / Copilot toggle */}
          <div className="flex items-center gap-2 p-1 bg-slate-200/70 rounded-lg text-xs">
            <button
              onClick={() => setIsAutonomous(true)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all ${
                isAutonomous ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-indigo-600" />
              <span>Autonomous AI</span>
            </button>
            <button
              onClick={() => setIsAutonomous(false)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all ${
                !isAutonomous ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Human Co-Pilot</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Thread List + Active Conversation */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 min-h-0">
        {/* Left Column: Thread List */}
        <div className="flex flex-col h-full bg-slate-50/30">
          {/* Channel Filters */}
          <div className="p-3 border-b border-slate-200 flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveChannelFilter('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeChannelFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              All Threads
            </button>
            <button
              onClick={() => setActiveChannelFilter('whatsapp')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeChannelFilter === 'whatsapp'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              WhatsApp
            </button>
            <button
              onClick={() => setActiveChannelFilter('sms')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeChannelFilter === 'sms'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              SMS
            </button>
            <button
              onClick={() => setActiveChannelFilter('webchat')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeChannelFilter === 'webchat'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Web Chat
            </button>
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredThreads.map((thread) => {
              const contact = contacts.find((c) => c.id === thread.contactId);
              const isSelected = thread.id === selectedThreadId;
              const lastMessage = thread.messages[thread.messages.length - 1];
              const sentimentCat = getSentimentCategory(thread.sentiment);

              return (
                <button
                  key={thread.id}
                  onClick={() => setSelectedThreadId(thread.id)}
                  className={`w-full p-4 text-left transition-colors flex items-start gap-3 ${
                    isSelected ? 'bg-indigo-50/50 border-l-2 border-indigo-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <img
                    src={contact?.avatar}
                    alt={contact?.name}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {contact?.name}
                      </h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {lastMessage?.timestamp}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                      <span className="capitalize font-medium text-slate-700">{thread.channel}</span>
                      <span>·</span>
                      <span className="truncate">{contact?.company}</span>
                    </div>

                    <p className="text-xs text-slate-600 truncate mt-1">
                      {lastMessage?.text}
                    </p>

                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize ${
                          sentimentCat === 'positive'
                            ? 'bg-emerald-50 text-emerald-700'
                            : sentimentCat === 'neutral'
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {sentimentCat} ({thread.sentiment > 0 ? `+${thread.sentiment}` : thread.sentiment})
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right 2 Columns: Active Conversation */}
        <div className="md:col-span-2 flex flex-col h-full bg-white">
          {/* Thread header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/40">
            <div className="flex items-center gap-3">
              <img
                src={currentContact.avatar}
                alt={currentContact.name}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-cover border border-slate-200"
              />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-slate-900">{currentContact.name}</h3>
                  <span className="text-[11px] text-slate-500">· {currentContact.company}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="capitalize">{currentThread.channel} Channel</span>
                  <span>·</span>
                  <span>Lead Score: {currentContact.leadScore}/100</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenBookingModal(currentContact.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors shadow-xs"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Book 1-on-1 Session</span>
              </button>
            </div>
          </div>

          {/* Conversation Stream */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4">
            {currentThread.messages.map((msg) => {
              const isAgent = msg.speaker === 'agent';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}
                >
                  <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-700">
                      {isAgent ? 'AcuityVoice Omnichannel' : currentContact.name}
                    </span>
                    <span>·</span>
                    <span className="font-mono">{msg.timestamp}</span>
                    {msg.empathyPillar && (
                      <span className="text-indigo-600 font-medium">[{msg.empathyPillar}]</span>
                    )}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-xl px-4 py-3 text-xs leading-relaxed ${
                      isAgent
                        ? 'bg-slate-100 text-slate-900 border border-slate-200 rounded-tl-xs'
                        : 'bg-slate-900 text-white rounded-tr-xs'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input Box */}
          <div className="p-4 border-t border-slate-200 bg-white">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder={`Type a ${currentThread.channel.toUpperCase()} message as the customer...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendMessage();
                }}
                disabled={isSending}
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
              />
              <button
                onClick={handleSendMessage}
                disabled={isSending || !inputText.trim()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <span>{isSending ? 'Sending...' : 'Send'}</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
