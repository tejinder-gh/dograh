import {
  CallSession,
  AudioStreamChunk,
  NativeVoiceModelAdapter,
  TelephonyMediaBridge,
  VoiceSessionConfig,
  TrustedToolGate
} from './types';
import { VoiceToolGate } from './tool-gate';

export class VoiceSessionOrchestrator {
  private session: CallSession;
  private voiceAdapter: NativeVoiceModelAdapter;
  private mediaBridge: TelephonyMediaBridge;
  private toolGate: TrustedToolGate;
  private isTerminated: boolean = false;

  constructor(params: {
    session: CallSession;
    voiceAdapter: NativeVoiceModelAdapter;
    mediaBridge: TelephonyMediaBridge;
    toolGate?: TrustedToolGate;
  }) {
    this.session = params.session;
    this.voiceAdapter = params.voiceAdapter;
    this.mediaBridge = params.mediaBridge;
    this.toolGate = params.toolGate || new VoiceToolGate();
  }

  async start(config: VoiceSessionConfig): Promise<void> {
    console.log(`[VOICE ORCHESTRATOR] Starting S2S session: ${this.session.sessionId} (tenant="${this.session.tenantId}", provider="${this.voiceAdapter.provider}")`);

    // 1. Initialize Telephony Media Bridge
    await this.mediaBridge.initializeSession(this.session);

    // 2. Connect Native Voice Model Adapter
    await this.voiceAdapter.connect(config);
    this.session.state = 'connected';

    // 3. Pipe user audio from media bridge into native voice model
    this.mediaBridge.onInboundAudio(async (chunk: AudioStreamChunk) => {
      if (this.isTerminated) return;
      this.session.state = 'listening';
      await this.voiceAdapter.sendUserAudio(chunk);
    });

    // 4. Pipe synthesized model audio back to media bridge
    this.voiceAdapter.onModelAudio(async (chunk: AudioStreamChunk) => {
      if (this.isTerminated) return;
      this.session.state = 'speaking';
      await this.mediaBridge.sendOutboundAudio(chunk);
    });

    // 5. Handle Real-Time Caller Interruption (Barge-in)
    this.voiceAdapter.onInterruption(async () => {
      if (this.isTerminated) return;
      console.log(`[VOICE ORCHESTRATOR] Barge-in detected on session: ${this.session.sessionId}. Cancelling agent audio buffer.`);
      this.session.wasInterrupted = true;
      this.session.interruptionCount++;
      this.session.state = 'interrupted';

      // Immediately flush pending audio buffer to stop agent from talking over the caller
      await this.mediaBridge.cancelAudioBuffer();
      await this.voiceAdapter.cancelAgentSpeech();
    });

    // 6. Handle Voice Model Tool Invocations through Trusted Gate
    this.voiceAdapter.onToolCall(async (request) => {
      console.log(`[VOICE ORCHESTRATOR] Intercepted tool call: "${request.name}" on session ${this.session.sessionId}`);
      try {
        const result = await this.toolGate.executeTool(
          this.session.tenantId,
          request.name,
          request.arguments
        );
        return {
          callId: request.callId,
          result,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          callId: request.callId,
          result: { success: false },
          error: msg,
        };
      }
    });
  }

  async terminate(reason: string = 'normal_hangup'): Promise<CallSession> {
    if (this.isTerminated) return this.session;
    this.isTerminated = true;

    console.log(`[VOICE ORCHESTRATOR] Terminating session: ${this.session.sessionId} (reason="${reason}")`);

    await this.mediaBridge.terminateCall(reason);
    await this.voiceAdapter.disconnect();

    this.session.state = 'terminated';
    this.session.endedAt = new Date().toISOString();
    this.session.durationSeconds = Math.max(
      1,
      Math.floor((Date.now() - new Date(this.session.startedAt).getTime()) / 1000)
    );

    return this.session;
  }

  getSession(): CallSession {
    return { ...this.session };
  }
}
