import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CallSession,
  AudioStreamChunk,
  NativeVoiceModelAdapter,
  TelephonyMediaBridge,
  VoiceSessionConfig,
  ToolCallRequest,
  ToolCallResponse
} from '../types';
import { VoiceSessionOrchestrator } from '../orchestrator';
import { VoiceToolGate, VoiceToolGateError } from '../tool-gate';

// Mock Media Bridge
class MockTelephonyBridge implements TelephonyMediaBridge {
  provider = 'webrtc' as const;
  bufferCancelled = false;
  terminated = false;
  outboundChunks: AudioStreamChunk[] = [];
  inboundCallback?: (chunk: AudioStreamChunk) => void;

  async initializeSession(_session: CallSession): Promise<void> {}

  onInboundAudio(callback: (chunk: AudioStreamChunk) => void): void {
    this.inboundCallback = callback;
  }

  async sendOutboundAudio(chunk: AudioStreamChunk): Promise<void> {
    this.outboundChunks.push(chunk);
  }

  async cancelAudioBuffer(): Promise<void> {
    this.bufferCancelled = true;
    this.outboundChunks = [];
  }

  async terminateCall(): Promise<void> {
    this.terminated = true;
  }

  simulateInbound(chunk: AudioStreamChunk): void {
    this.inboundCallback?.(chunk);
  }
}

// Mock Voice Model Adapter
class MockVoiceModelAdapter implements NativeVoiceModelAdapter {
  provider = 'gemini_live' as const;
  connected = false;
  cancelled = false;
  userChunksReceived: AudioStreamChunk[] = [];
  modelAudioCallback?: (chunk: AudioStreamChunk) => void;
  interruptionCallback?: () => void;
  toolCallCallback?: (req: ToolCallRequest) => Promise<ToolCallResponse>;

  async connect(_config: VoiceSessionConfig): Promise<void> {
    this.connected = true;
  }

  async sendUserAudio(chunk: AudioStreamChunk): Promise<void> {
    this.userChunksReceived.push(chunk);
  }

  onModelAudio(callback: (chunk: AudioStreamChunk) => void): void {
    this.modelAudioCallback = callback;
  }

  onInterruption(callback: () => Promise<void> | void): void {
    this.interruptionCallback = callback;
  }

  onToolCall(callback: (req: ToolCallRequest) => Promise<ToolCallResponse>): void {
    this.toolCallCallback = callback;
  }

  async sendToolResponse(_res: ToolCallResponse): Promise<void> {}

  async cancelAgentSpeech(): Promise<void> {
    this.cancelled = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async simulateInterruption(): Promise<void> {
    if (this.interruptionCallback) {
      await this.interruptionCallback();
    }
  }

  async simulateToolCall(req: ToolCallRequest): Promise<ToolCallResponse | undefined> {
    return this.toolCallCallback?.(req);
  }
}

test('VoiceSessionOrchestrator connects media bridge and voice model streaming', async () => {
  const session: CallSession = {
    sessionId: 'session-live-001',
    tenantId: 'tenant-acme-corp',
    channel: 'call_inbound',
    state: 'initializing',
    provider: 'gemini_live',
    telephony: 'webrtc',
    startedAt: new Date().toISOString(),
    durationSeconds: 0,
    wasInterrupted: false,
    interruptionCount: 0,
  };

  const bridge = new MockTelephonyBridge();
  const adapter = new MockVoiceModelAdapter();

  const orchestrator = new VoiceSessionOrchestrator({
    session,
    voiceAdapter: adapter,
    mediaBridge: bridge,
  });

  await orchestrator.start({
    tenantId: 'tenant-acme-corp',
    provider: 'gemini_live',
    voiceName: 'Kore',
    resolvedSystemPrompt: 'You are an AI assistant.',
    verifiedRagSnippets: ['Pricing is $10/mo'],
    tools: [],
  });

  assert.equal(session.state, 'connected');
  assert.equal(adapter.connected, true);

  // Pipe audio
  const testChunk: AudioStreamChunk = {
    pcmData: Buffer.from([1, 2, 3, 4]),
    sampleRate: 16000,
    channels: 1,
    timestampMs: 100,
  };

  bridge.simulateInbound(testChunk);
  assert.equal(adapter.userChunksReceived.length, 1);
  assert.equal(session.state, 'listening');

  // Terminate
  const terminated = await orchestrator.terminate('customer_hangup');
  assert.equal(terminated.state, 'terminated');
  assert.equal(bridge.terminated, true);
  assert.equal(adapter.connected, false);
});

test('VoiceSessionOrchestrator flushes audio buffer immediately upon barge-in', async () => {
  const session: CallSession = {
    sessionId: 'session-live-002',
    tenantId: 'tenant-acme-corp',
    channel: 'call_inbound',
    state: 'initializing',
    provider: 'gemini_live',
    telephony: 'webrtc',
    startedAt: new Date().toISOString(),
    durationSeconds: 0,
    wasInterrupted: false,
    interruptionCount: 0,
  };

  const bridge = new MockTelephonyBridge();
  const adapter = new MockVoiceModelAdapter();

  const orchestrator = new VoiceSessionOrchestrator({
    session,
    voiceAdapter: adapter,
    mediaBridge: bridge,
  });

  await orchestrator.start({
    tenantId: 'tenant-acme-corp',
    provider: 'gemini_live',
    voiceName: 'Kore',
    resolvedSystemPrompt: 'You are an AI assistant.',
    verifiedRagSnippets: [],
    tools: [],
  });

  // Simulate agent speaking
  adapter.modelAudioCallback?.({
    pcmData: Buffer.from([10, 20]),
    sampleRate: 24000,
    channels: 1,
    timestampMs: 500,
  });
  assert.equal(bridge.outboundChunks.length, 1);

  // Customer interrupts (barge-in)
  await adapter.simulateInterruption();

  assert.equal(bridge.bufferCancelled, true, 'Telephony buffer must be cancelled on barge-in');
  assert.equal(adapter.cancelled, true, 'Voice model synthesis must be cancelled on barge-in');
  assert.equal(session.wasInterrupted, true);
  assert.equal(session.interruptionCount, 1);
});

test('VoiceToolGate rejects tool execution when tenant context is missing', async () => {
  const gate = new VoiceToolGate();

  await assert.rejects(
    () => gate.executeTool('', 'schedule_calendar_session', {}),
    (err: unknown) => {
      return err instanceof VoiceToolGateError && err.message.includes('Missing verified tenant context');
    }
  );
});

test('VoiceToolGate validates required parameters for calendar booking', async () => {
  const { setTestQueryHandler } = await import('../../db/connection');
  setTestQueryHandler((text: string) => {
    if (text.includes('FROM tool_capabilities')) {
      return {
        rows: [
          {
            cap_id: 'cap-cal-001',
            cap_tool_version_id: 'ver-cal-001',
            cap_function_name: 'schedule_calendar_session',
            cap_display_name: 'Schedule Calendar Session',
            cap_description: 'Schedules calendar session',
            cap_risk_level: 'standard_write',
            cap_requires_approval: false,
            cap_operation_type: 'write',
            cap_input_schema: {
              type: 'object',
              required: ['date', 'timeSlot'],
              properties: {
                date: { type: 'string' },
                timeSlot: { type: 'string' },
              },
            },
            tool_id: 'tool-cal-001',
            tool_slug: 'google-calendar-scheduling',
            tool_name: 'Google Calendar Scheduling',
            tool_category: 'scheduling',
            tool_provider: 'google_workspace',
            tool_is_verified: true,
            tool_is_active: true,
            tool_min_plan_tier: 'starter',
            tool_cost_per_execution_cents: 0,
            inst_id: 'inst-cal-001',
            inst_tenant_id: 'tenant-test-123',
            inst_tool_id: 'tool-cal-001',
            inst_tool_version_id: 'ver-cal-001',
            inst_status: 'active',
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    return null;
  });

  try {
    const gate = new VoiceToolGate();

    const result = await gate.executeTool('tenant-test-123', 'schedule_calendar_session', {
      contactName: 'Inbound Caller',
      // Missing date and timeSlot
    });

    assert.equal(result.success, false);
    assert.match(String(result.error), /Missing required parameter/);
  } finally {
    setTestQueryHandler(null);
  }
});
