import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  PhoneIncoming,
  PhoneOutgoing,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Calendar,
  AlertTriangle,
  Sparkles,
  Send,
  UserCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  Globe
} from 'lucide-react';
import {
  CustomerContact,
  CompanyRepresentative,
  ChatMessage,
  AgentResponsePayload,
  InteractionLog,
  ScheduledSession,
  ClientCompanyDomain
} from '../types';
import { formatCallDuration, getSentimentCategory } from '../utils/agent-logic';
import { getAuthHeaders } from '../utils/auth-client';

interface LiveCallStudioProps {
  contacts: CustomerContact[];
  representatives: CompanyRepresentative[];
  onLogInteraction: (log: InteractionLog) => void;
  onOpenBookingModal: (contactId?: string, repId?: string) => void;
  activeCall: boolean;
  setActiveCall: (active: boolean) => void;
  activeDomain?: ClientCompanyDomain;
  googleToken?: string | null;
}

export const LiveCallStudio: React.FC<LiveCallStudioProps> = ({
  contacts,
  representatives,
  onLogInteraction,
  onOpenBookingModal,
  activeCall,
  setActiveCall,
  activeDomain,
  googleToken,
}) => {
  // Call setup state
  const [callType, setCallType] = useState<'inbound' | 'outbound'>('inbound');
  const [selectedContactId, setSelectedContactId] = useState<string>(contacts[0]?.id || 'contact-1');
  const [callState, setCallState] = useState<'idle' | 'ringing' | 'connected' | 'hold' | 'ended'>('idle');
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioPlaybackEnabled, setAudioPlaybackEnabled] = useState(true);

  // Conversation & Agent state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [currentSentiment, setCurrentSentiment] = useState<number>(45);
  const [isEscalated, setIsEscalated] = useState(false);
  const [escalationReason, setEscalationReason] = useState<string | null>(null);
  const [bookingSuggested, setBookingSuggested] = useState(false);
  const [suggestedRep, setSuggestedRep] = useState<string>('Sarah Jenkins');
  const [isBookingConfirmed, setIsBookingConfirmed] = useState(false);

  // Speech Recognition
  const [isListeningMic, setIsListeningMic] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Audio Waveform Canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transcriptBottomRef = useRef<HTMLDivElement | null>(null);
  const timerIntervalRef = useRef<any>(null);

  const activeContact = contacts.find((c) => c.id === selectedContactId) || contacts[0];

  // Auto-scroll transcript
  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Duration Timer
  useEffect(() => {
    if (callState === 'connected') {
      timerIntervalRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [callState]);

  // Animated Waveform
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const isLive = callState === 'connected';
      const amplitude = isAgentSpeaking ? 24 : isLive ? 8 : 2;

      ctx.lineWidth = 2;
      ctx.strokeStyle = isAgentSpeaking
        ? '#6366f1' // indigo
        : isLive
        ? '#10b981' // emerald
        : '#cbd5e1'; // slate

      ctx.beginPath();
      for (let x = 0; x < canvas.width; x++) {
        const y =
          canvas.height / 2 +
          Math.sin(x * 0.05 + phase) * amplitude * Math.sin((x / canvas.width) * Math.PI);
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      phase += isAgentSpeaking ? 0.15 : 0.05;
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [callState, isAgentSpeaking]);

  // Web Speech Synthesis Playback
  const speakAgentResponse = (text: string) => {
    if (!audioPlaybackEnabled || typeof window === 'undefined') return;

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      // Select high-quality natural voice if available
      const voices = window.speechSynthesis.getVoices();
      const naturalVoice = voices.find(
        (v) => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha'))
      );
      if (naturalVoice) utterance.voice = naturalVoice;

      utterance.onstart = () => setIsAgentSpeaking(true);
      utterance.onend = () => setIsAgentSpeaking(false);
      utterance.onerror = () => setIsAgentSpeaking(false);

      window.speechSynthesis.speak(utterance);
    }
  };

  // Start Inbound Call Simulation
  const handleStartInbound = () => {
    setCallType('inbound');
    setCallState('ringing');
    setActiveCall(true);
    setCallDuration(0);
    setMessages([]);
    setCurrentSentiment(50);
    setIsEscalated(false);
    setEscalationReason(null);
    setBookingSuggested(false);
    setIsBookingConfirmed(false);
  };

  // Start Outbound Call
  const handleStartOutbound = () => {
    setCallType('outbound');
    setCallState('ringing');
    setActiveCall(true);
    setCallDuration(0);
    setMessages([]);
    setCurrentSentiment(50);
    setIsEscalated(false);
    setEscalationReason(null);
    setBookingSuggested(false);
    setIsBookingConfirmed(false);

    // Auto connect after 2 seconds ringing
    setTimeout(() => {
      setCallState('connected');
      const companyTitle = activeDomain?.name || 'Acuity Systems';
      const outboundGoalHint = activeDomain?.outboundGoal || "our platform solutions and CRM integrations";
      const introMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        speaker: 'agent',
        text: `Hello ${activeContact.name}! This is the AI outreach representative for ${companyTitle}. I'm following up regarding our enterprise solutions: ${outboundGoalHint}. Am I speaking with ${activeContact.name}?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        empathyPillar: 'Warm Introduction & Respectful Alignment',
        sentiment: 60,
      };
      setMessages([introMessage]);
      speakAgentResponse(introMessage.text);
    }, 2000);
  };

  // Answer incoming call
  const handleAnswerCall = () => {
    setCallState('connected');
    const companyTitle = activeDomain?.name || 'Acuity Systems';
    const initialGreeting: ChatMessage = {
      id: `msg-${Date.now()}`,
      speaker: 'agent',
      text: `Thank you for calling ${companyTitle}! My name is your AI support and solutions agent. How may I assist you with your customer operations or platform today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      empathyPillar: 'Empathetic Welcome & Active Readiness',
      sentiment: 70,
    };
    setMessages([initialGreeting]);
    speakAgentResponse(initialGreeting.text);
  };

  // End Call & Automatically Log to CRM
  const handleEndCall = async () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsAgentSpeaking(false);
    setCallState('ended');
    setActiveCall(false);

    // Save interaction log to backend
    if (messages.length > 0) {
      try {
        const sentimentCat = getSentimentCategory(currentSentiment);
        const res = await fetch('/api/crm/interactions', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            contactId: activeContact.id,
            contactName: activeContact.name,
            contactCompany: activeContact.company,
            contactAvatar: activeContact.avatar,
            channel: callType === 'inbound' ? 'call_inbound' : 'call_outbound',
            durationSeconds: callDuration,
            sentimentScore: currentSentiment,
            sentimentCategory: sentimentCat,
            wasEscalated: isEscalated,
            escalationReason: escalationReason || undefined,
            summary: `Live ${callType} call with ${activeContact.name}. Sentiment reached ${currentSentiment}. ${
              bookingSuggested ? '1-on-1 session proposed.' : ''
            } ${isEscalated ? 'Flagged for supervisor escalation.' : ''}`,
            transcript: messages,
          }),
        });

        if (res.ok) {
          const newLog = await res.json();
          onLogInteraction(newLog);
        }
      } catch (e) {
        console.error('Failed to log call to CRM:', e);
      }
    }
  };

  // Send message through AI Agent
  const handleSendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isProcessing) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      speaker: 'customer',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText('');
    setIsProcessing(true);

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: trimmed,
          channel: callType === 'inbound' ? 'call_inbound' : 'call_outbound',
          contactId: activeContact.id,
          callerName: activeContact.name,
          company: activeContact.company,
          domainId: activeDomain?.id,
          conversationHistory: newMessages,
        }),
      });

      if (response.ok) {
        const data: AgentResponsePayload = await response.json();

        // Update live sentiment
        if (typeof data.sentimentScore === 'number') {
          setCurrentSentiment(data.sentimentScore);
        }

        // Check escalation
        if (data.escalationRequired) {
          setIsEscalated(true);
          setEscalationReason(data.escalationReason || 'Automatic sentiment threshold trigger');
        }

        // Check booking
        if (data.bookingSuggested) {
          setBookingSuggested(true);
          if (data.bookingDetails?.recommendedRep) {
            setSuggestedRep(data.bookingDetails.recommendedRep);
          }
        }

        const agentMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          speaker: 'agent',
          text: data.agentResponse,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          sentiment: data.sentimentScore,
          empathyPillar: data.empathyTechniqueUsed || 'Active Empathy',
          bookingTriggered: data.bookingSuggested,
        };

        setMessages((prev) => [...prev, agentMsg]);
        speakAgentResponse(data.agentResponse);
      }
    } catch (err) {
      console.error('Error in agent response:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Speech Recognition for microphone
  const toggleMicrophone = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Web Speech Recognition is not supported by your browser. Please type your message or click a preset scenario.');
      return;
    }

    if (isListeningMic) {
      recognitionRef.current?.stop();
      setIsListeningMic(false);
    } else {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListeningMic(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          handleSendMessage(transcript);
        }
      };
      recognition.onerror = () => setIsListeningMic(false);
      recognition.onend = () => setIsListeningMic(false);

      recognitionRef.current = recognition;
      recognition.start();
    }
  };

  // Quick In-Call 1-on-1 Booking Confirmation
  const handleQuickBookInCall = async () => {
    try {
      const targetRep = representatives.find((r) => r.name.includes(suggestedRep)) || representatives[0];
      const res = await fetch('/api/crm/bookings', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          contactId: activeContact.id,
          contactName: activeContact.name,
          company: activeContact.company,
          contactEmail: activeContact.email,
          contactPhone: activeContact.phone,
          representativeId: targetRep.id,
          date: '2026-10-23',
          timeSlot: '02:00 PM EST',
          meetingType: '30-min Discovery',
          agendaNotes: `In-call booking during live ${callType} session with AI Agent. Focus on ${activeContact.company} requirements.`,
        }),
      });

      if (res.ok) {
        setIsBookingConfirmed(true);
        const confirmMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          speaker: 'system',
          text: `[CRM ACTION] 1-on-1 Session successfully booked with ${targetRep.name} for Friday at 02:00 PM EST. Calendar invitation sent to ${activeContact.email}.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        setMessages((prev) => [...prev, confirmMsg]);
      }
    } catch (e) {
      console.error('Failed to book session:', e);
    }
  };

  const sentimentCategory = getSentimentCategory(currentSentiment);

  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Switcher */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Live AI Voice Agent Studio
              </h2>
              <span className="text-[11px] font-medium text-slate-500">
                · Inbound Inquiries & Outbound Outreach
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Handles real-time phone calls with sub-second latency, automated tone & sentiment tracking, 
              instant CRM logging, and proactive 1-on-1 session booking for lead qualification.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {callState === 'idle' || callState === 'ended' ? (
              <>
                <button
                  onClick={handleStartInbound}
                  className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
                >
                  <PhoneIncoming className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Simulate Inbound Call</span>
                </button>
                <button
                  onClick={handleStartOutbound}
                  className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
                >
                  <PhoneOutgoing className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Start Outbound Call</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleEndCall}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>Disconnect Call & Log to CRM</span>
              </button>
            )}
          </div>
        </div>

        {/* Target Prospect Selector */}
        {callState === 'idle' && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs">
            <span className="font-medium text-slate-700">Target Contact / Lead:</span>
            <div className="flex flex-wrap gap-2">
              {contacts.map((c) => {
                const isSelected = selectedContactId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedContactId(c.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-semibold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <img
                      src={c.avatar}
                      alt={c.name}
                      referrerPolicy="no-referrer"
                      className="w-4 h-4 rounded-full object-cover"
                    />
                    <span>{c.name}</span>
                    <span className="text-slate-400">({c.company})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* CALL IN PROGRESS / ACTIVE HUD */}
      {callState !== 'idle' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Call State, Caller Info & Waveform */}
          <div className="space-y-6">
            {/* Caller Profile Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-start gap-3">
                <img
                  src={activeContact.avatar}
                  alt={activeContact.name}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-full object-cover border border-slate-200"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 truncate">{activeContact.name}</h3>
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                      Score: {activeContact.leadScore}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{activeContact.role} · {activeContact.company}</p>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">{activeContact.phone}</p>
                </div>
              </div>

              {/* Status pill & Timer */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      callState === 'connected'
                        ? 'bg-emerald-500 animate-pulse'
                        : callState === 'ringing'
                        ? 'bg-amber-500 animate-ping'
                        : 'bg-slate-400'
                    }`}
                  />
                  <span className="text-xs font-semibold text-slate-800 capitalize">
                    {callState === 'ringing'
                      ? callType === 'inbound'
                        ? 'Incoming Call...'
                        : 'Dialing Prospect...'
                      : callState === 'connected'
                      ? 'Call In Progress'
                      : 'Call Paused'}
                  </span>
                </div>
                <div className="text-xs font-mono font-bold text-slate-900 tabular-nums">
                  {formatCallDuration(callDuration)}
                </div>
              </div>

              {/* Ringing Controls */}
              {callState === 'ringing' && callType === 'inbound' && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={handleAnswerCall}
                    className="flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Answer Call</span>
                  </button>
                  <button
                    onClick={() => {
                      setCallState('ended');
                      setActiveCall(false);
                    }}
                    className="flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors"
                  >
                    <PhoneOff className="w-3.5 h-3.5" />
                    <span>Decline</span>
                  </button>
                </div>
              )}

              {/* Audio Waveform Canvas */}
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>Audio Waveform Activity</span>
                  <span>{isAgentSpeaking ? 'Agent Speaking' : 'Listening...'}</span>
                </div>
                <div className="h-16 w-full bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center p-2">
                  <canvas
                    ref={canvasRef}
                    width={320}
                    height={56}
                    className="w-full h-full"
                  />
                </div>
              </div>

              {/* Call Controls Toolbar */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={`p-2 rounded-lg border transition-colors ${
                      isMuted
                        ? 'bg-rose-50 text-rose-600 border-rose-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                    title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => setAudioPlaybackEnabled(!audioPlaybackEnabled)}
                    className={`p-2 rounded-lg border transition-colors ${
                      !audioPlaybackEnabled
                        ? 'bg-amber-50 text-amber-600 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                    title={audioPlaybackEnabled ? 'Mute AI Voice' : 'Enable AI Voice'}
                  >
                    {audioPlaybackEnabled ? (
                      <Volume2 className="w-4 h-4" />
                    ) : (
                      <VolumeX className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    onClick={() =>
                      setCallState(callState === 'connected' ? 'hold' : 'connected')
                    }
                    className={`p-2 rounded-lg border transition-colors ${
                      callState === 'hold'
                        ? 'bg-amber-50 text-amber-600 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                    title={callState === 'hold' ? 'Resume Call' : 'Hold Call'}
                  >
                    {callState === 'hold' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  onClick={handleEndCall}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                >
                  End Call
                </button>
              </div>
            </div>

            {/* Real-Time Sentiment & Urgency Telemetry */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Automated Sentiment Analysis
                </h4>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${
                    sentimentCategory === 'positive'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : sentimentCategory === 'neutral'
                      ? 'bg-slate-100 text-slate-700 border border-slate-200'
                      : sentimentCategory === 'frustrated'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {sentimentCategory}
                </span>
              </div>

              {/* Sentiment Gauge Bar */}
              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-500 mb-1">
                  <span>Distressed (-100)</span>
                  <span className="font-bold text-slate-900">{currentSentiment > 0 ? `+${currentSentiment}` : currentSentiment}</span>
                  <span>Delighted (+100)</span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      currentSentiment >= 35
                        ? 'bg-emerald-500'
                        : currentSentiment >= 0
                        ? 'bg-slate-400'
                        : currentSentiment >= -40
                        ? 'bg-amber-500'
                        : 'bg-rose-600'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(5, ((currentSentiment + 100) / 200) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Urgent Escalation Alert */}
              {isEscalated && (
                <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 text-xs space-y-2 animate-fade-in">
                  <div className="flex items-start gap-2 text-rose-800 font-semibold">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                    <span>Urgent Escalation Triggered!</span>
                  </div>
                  <p className="text-[11px] text-rose-700">
                    {escalationReason || 'Customer sentiment dipped below safety threshold.'}
                  </p>
                  <button
                    onClick={() =>
                      alert(
                        `Supervisor Alert Dispatched: On-call lead notified with complete caller context for ${activeContact.name} (${activeContact.company}).`
                      )
                    }
                    className="w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded text-[11px] transition-colors"
                  >
                    Dispatch Supervisor Direct Handoff
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Center & Right Column: Live Transcript & Interaction Feed */}
          <div className="lg:col-span-2 space-y-4 flex flex-col h-[650px] bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Transcript Header */}
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">
                  Real-Time Call Transcript & Empathy Tracking
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-xs text-slate-500">{messages.length} turns</span>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                <span>Autonomous AI Co-Pilot Active</span>
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-6">
                  <Phone className="w-10 h-10 text-slate-300 mb-2 stroke-[1.5]" />
                  <p className="text-xs font-medium text-slate-600">Call connected.</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
                    Speak using the microphone or select one of the test scenarios below to observe real-time AI empathy, tone analysis, and 1-on-1 lead booking.
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isAgent = msg.speaker === 'agent';
                  const isSystem = msg.speaker === 'system';

                  if (isSystem) {
                    return (
                      <div
                        key={msg.id}
                        className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-xs font-mono"
                      >
                        {msg.text}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}
                    >
                      <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-400">
                        <span className="font-semibold text-slate-700">
                          {isAgent ? 'AcuityVoice Agent' : activeContact.name}
                        </span>
                        <span>·</span>
                        <span className="font-mono">{msg.timestamp}</span>
                        {msg.empathyPillar && (
                          <span className="text-indigo-600 font-medium">
                            [{msg.empathyPillar}]
                          </span>
                        )}
                      </div>

                      <div
                        className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed ${
                          isAgent
                            ? 'bg-slate-100 text-slate-900 rounded-tl-xs border border-slate-200'
                            : 'bg-slate-900 text-white rounded-tr-xs'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={transcriptBottomRef} />
            </div>

            {/* In-Call 1-on-1 Session Booking Prompt */}
            {bookingSuggested && !isBookingConfirmed && (
              <div className="mx-5 p-3.5 bg-indigo-50/80 rounded-xl border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2 font-bold text-indigo-900">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>Lead Opportunity Detected: Book 1-on-1 Nurturing Session</span>
                  </div>
                  <p className="text-[11px] text-indigo-700 mt-0.5">
                    Recommended Representative: <span className="font-semibold">{suggestedRep}</span> (Available this week).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleQuickBookInCall}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors shadow-xs"
                  >
                    1-Click Fast Book (Friday 2 PM)
                  </button>
                  <button
                    onClick={() => onOpenBookingModal(activeContact.id)}
                    className="px-3 py-1.5 bg-white text-indigo-800 border border-indigo-300 hover:bg-indigo-50 font-medium rounded-lg transition-colors"
                  >
                    Custom Time
                  </button>
                </div>
              </div>
            )}

            {/* Test Presets Quick Trays */}
            <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-600">Simulate Customer Journey:</span>
              <button
                onClick={() =>
                  handleSendMessage(
                    'We are reviewing platforms to handle 250k monthly voice calls. What is your pricing and can we schedule a demo?'
                  )
                }
                className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 text-[11px] transition-colors"
              >
                1. Enterprise Inquiry (High BANT Lead)
              </button>

              <button
                onClick={() =>
                  handleSendMessage(
                    'I am extremely frustrated. Our invoice was double charged and if this is not fixed immediately I demand to speak to a supervisor!'
                  )
                }
                className="px-2.5 py-1 bg-white hover:bg-rose-50 border border-rose-200 rounded text-rose-700 text-[11px] transition-colors"
              >
                2. Billing Distress (Trigger Escalation)
              </button>

              <button
                onClick={() =>
                  handleSendMessage(
                    'Can you book a 1-on-1 architecture session with Marcus Chen for my engineering team?'
                  )
                }
                className="px-2.5 py-1 bg-white hover:bg-indigo-50 border border-indigo-200 rounded text-indigo-700 text-[11px] transition-colors"
              >
                3. Book 1-on-1 Session Direct
              </button>
            </div>

            {/* Input Bar */}
            <div className="p-4 border-t border-slate-200 bg-white flex items-center gap-2">
              <button
                onClick={toggleMicrophone}
                className={`p-2.5 rounded-lg border transition-colors ${
                  isListeningMic
                    ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
                title={isListeningMic ? 'Listening... click to stop' : 'Click to speak using your microphone'}
              >
                <Mic className="w-4 h-4" />
              </button>

              <input
                type="text"
                placeholder={
                  isListeningMic
                    ? 'Listening to your speech...'
                    : 'Type customer inquiry or choose a scenario above...'
                }
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendMessage(inputText);
                }}
                disabled={isProcessing}
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 bg-slate-50 text-slate-900"
              />

              <button
                onClick={() => handleSendMessage(inputText)}
                disabled={isProcessing || !inputText.trim()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <span>{isProcessing ? 'Processing...' : 'Send'}</span>
                <Send className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* IDLE STUDIO VIEW: Architecture & Quick Launch Grid */
        <div className="space-y-6">
          {/* Quick Launch Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              onClick={() => {
                setSelectedContactId('contact-1');
                handleStartInbound();
              }}
              className="p-5 bg-white rounded-xl border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <PhoneIncoming className="w-5 h-5" />
              </div>
              <h3 className="text-xs font-bold text-slate-900">
                1. High BANT Inbound Call (David Vance)
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                David calls regarding 250k monthly voice call volume. Tests AI accurate response and 1-on-1 session booking.
              </p>
              <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                <span>Launch Scenario</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <div
              onClick={() => {
                setSelectedContactId('contact-3');
                handleStartInbound();
              }}
              className="p-5 bg-white rounded-xl border border-slate-200 hover:border-rose-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-xs font-bold text-slate-900">
                2. Distressed Caller (Urgent Escalation)
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Jordan calls upset over vendor invoice charges. Tests real-time sentiment drop, empathetic de-escalation, and supervisor alert.
              </p>
              <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-rose-600 group-hover:translate-x-0.5 transition-transform">
                <span>Launch Scenario</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <div
              onClick={() => {
                setSelectedContactId('contact-2');
                handleStartOutbound();
              }}
              className="p-5 bg-white rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <PhoneOutgoing className="w-5 h-5" />
              </div>
              <h3 className="text-xs font-bold text-slate-900">
                3. Outbound Nurturing Call (Elena Rostova)
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Agent places proactive outbound follow-up call to Elena regarding wealth advisory compliance and 1-on-1 strategy session.
              </p>
              <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                <span>Launch Scenario</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Engine Architecture & Specification Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                1. Voice & Empathy Engine
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Powered by Gemini 3.8 Flash & Flash-Lite TTS for sub-second audio response. Real-time tone classification automatically validates customer distress and guarantees brand voice accuracy.
              </p>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                2. Automated Sentiment & SLA Triggers
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Continuously maps speech turns to -100 to +100 sentiment velocity. When negative sentiment breaches threshold, instant escalation tickets are routed to human supervisors with SLA countdowns.
              </p>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                3. Primary Goal: 1-on-1 Session Booking
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Proactively detects prospective interest, queries representative calendar slots, and books tailored 30-min discovery sessions directly into your CRM for personalized lead nurturing.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
