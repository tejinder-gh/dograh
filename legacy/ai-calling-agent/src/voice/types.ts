/**
 * Native Speech-to-Speech (S2S) Architecture Type Definitions
 * Establishes provider adapter contracts, audio streams, and tool execution gates.
 */

export type VoiceModelProvider = 'gemini_live' | 'gpt_live_1' | 'gpt_realtime_2_1' | 'gpt_realtime_mini';
export type TelephonyProvider = 'webrtc' | 'twilio_media_stream' | 'telnyx_sip' | 'sip_trunk';
export type CallSessionState = 'initializing' | 'connected' | 'speaking' | 'listening' | 'interrupted' | 'escalating' | 'terminated';

export interface AudioStreamChunk {
  pcmData: Buffer | Uint8Array;
  sampleRate: 8000 | 16000 | 24000 | 48000;
  channels: 1 | 2;
  timestampMs: number;
}

export interface CallSession {
  sessionId: string;
  tenantId: string;
  contactId?: string;
  channel: 'call_inbound' | 'call_outbound' | 'webrtc';
  callerNumber?: string;
  state: CallSessionState;
  provider: VoiceModelProvider;
  telephony: TelephonyProvider;
  startedAt: string;
  endedAt?: string;
  durationSeconds: number;
  perceivedLatencyMs?: number;
  wasInterrupted: boolean;
  interruptionCount: number;
}

export interface VoiceSessionConfig {
  tenantId: string;
  agentId?: string;
  businessProfileId?: string;
  provider: VoiceModelProvider;
  voiceName: string;
  temperature?: number;
  resolvedSystemPrompt: string;
  verifiedRagSnippets: string[];
  calendarLink?: string;
  tools: VoiceAgentToolDefinition[];
}

export interface VoiceAgentToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCallRequest {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResponse {
  callId: string;
  result: Record<string, unknown>;
  error?: string;
}

/**
 * Contract for Native Voice Model Adapters (GPT-Live 1, GPT-Realtime 2.1, Gemini 3.8 Live)
 */
export interface NativeVoiceModelAdapter {
  provider: VoiceModelProvider;
  connect(config: VoiceSessionConfig): Promise<void>;
  sendUserAudio(chunk: AudioStreamChunk): Promise<void>;
  onModelAudio(callback: (chunk: AudioStreamChunk) => void): void;
  onInterruption(callback: () => Promise<void> | void): void;
  onToolCall(callback: (request: ToolCallRequest) => Promise<ToolCallResponse>): void;
  sendToolResponse(response: ToolCallResponse): Promise<void>;
  cancelAgentSpeech(): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Contract for Telephony & Media Adapters (WebRTC, Twilio, SIP)
 */
export interface TelephonyMediaBridge {
  provider: TelephonyProvider;
  initializeSession(session: CallSession): Promise<void>;
  onInboundAudio(callback: (chunk: AudioStreamChunk) => void): void;
  sendOutboundAudio(chunk: AudioStreamChunk): Promise<void>;
  cancelAudioBuffer(): Promise<void>; // Barge-in immediate cancellation
  terminateCall(reason?: string): Promise<void>;
}

/**
 * Contract for Trusted Orchestration Tool Gate
 */
export interface TrustedToolGate {
  executeTool(
    tenantId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
}
