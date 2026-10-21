# ADR 001: Native Real-Time Speech-to-Speech (S2S) Calling Architecture

## Status
**Accepted / Directive** (20 October 2026)

## Context & Problem Statement
The inherited codebase implemented conversational calling via a cascaded, discrete pipeline:
1. Browser SpeechRecognition (STT) or external transcription
2. Text-based LLM completion (`/api/agent/chat` via Gemini Flash)
3. Text-to-Speech synthesis (`/api/agent/tts` via Gemini Flash-Lite-TTS)

This cascaded architecture suffers from fundamental commercial and user-experience limitations for production voice agents:
- **Excessive Latency:** Serializing STT -> Text Reasoning -> TTS synthesis incurs cascading delays (frequently >1,200ms round-trip latency), creating unnatural pauses and awkward speaker collisions.
- **Inability to Handle Barge-In:** When a caller interrupts the agent, discrete HTTP request/response pipelines cannot immediately cancel outbound audio packet buffers in real time.
- **Loss of Paralinguistic Nuance:** Text intermediate representations strip pitch, emotional inflection, hesitancy, and tone from customer audio, reducing empathy de-escalation efficacy.
- **Session Fragility:** Lacking bidirectional full-duplex streaming WebSockets, concurrent call sessions cannot maintain low-overhead stateful tool execution contexts.

## Decision: Native Speech-to-Speech (S2S) Architecture
We establish **Native Speech-to-Speech (S2S/STS)** streaming as the core calling architecture for AI Calling Agent OS. Isolated TTS endpoints are relegated strictly to non-conversational announcements or explicit offline fallbacks.

The system is decomposed into three decoupled adapter families:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CALLER / TELEPHONY LAYER                        │
│   (SIP Trunks, Twilio/Telnyx Media Streams, WebRTC Browser Gateway)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Bidirectional PCM/Opus Audio Stream
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    TELEPHONY & MEDIA BRIDGE ADAPTERS                   │
│   • Audio Codec Transcoding (G.711u / G.711a <-> PCM16 / Opus)         │
│   • Jitter Buffer & Real-time VAD / Interruption Signaling             │
│   • Session Multiplexing & Tenant Ingress Authentication              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Authenticated Audio Chunks & Events
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               TRUSTED BACKEND ORCHESTRATION & TOOL GATE               │
│   • Layered DB Prompt Resolution (Safety -> Master -> Tenant -> Persona)│
│   • Strict Sourced RAG Grounding (Verified Knowledge Base Chunks)      │
│   • Authenticated CRM Tool Dispatcher (Conflict-checked Bookings)      │
│   • Real-Time Supervisor Escalation & Barge-In Cancellation            │
│   • Token & Audio Per-Minute Usage Metering                            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Low-latency Full-Duplex S2S Stream
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     NATIVE VOICE MODEL ADAPTERS                        │
│   ┌────────────────────┬────────────────────┬─────────────────────┐    │
│   │    GPT-Live 1      │  GPT-Realtime 2.1  │   Gemini 3.8 Live   │    │
│   │ (Full-duplex S2S,  │  (Single-session   │ (Bi-directional WS, │    │
│   │  delegated tools)  │  reasoning/tools)  │ native multimodal)  │    │
│   └────────────────────┴────────────────────┴─────────────────────┘    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Evaluation of Native Voice Providers

| Dimension | Option A: OpenAI GPT-Live 1 | Option B: OpenAI GPT-Realtime 2.1 | Option C: Google Gemini 3.8 Live | Option D: GPT-Realtime 2.1 Mini (Economic) |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Architecture** | Native S2S streaming engine designed for live telephony | Real-time multi-modal audio/text WebSocket session | Bidirectional Bidi-WebSocket audio streaming | Distilled low-cost real-time audio WebSocket |
| **Round-Trip Perceived Latency (Median)** | ~220ms – 320ms (empirically benchmarked) | ~280ms – 380ms | ~250ms – 360ms | ~240ms – 350ms |
| **Barge-in / Interruption Handling** | Native server-side audio buffer cancellation | Client/server event: `conversation.item.truncate` | Client interruption signal (`clientContent`) | Event: `conversation.item.truncate` |
| **Tool Execution Gate** | Delegated asynchronous server-side tool execution | Client-routed function calling event cycle | Bidirectional tool call `toolCall` / `toolResponse` | Client-routed function calling |
| **Audio Codecs Supported** | PCM16 (24kHz), G.711u / G.711a (8kHz native) | PCM16 (24kHz), G.711u / G.711a (8kHz) | PCM16 (16kHz / 24kHz), Opus | PCM16 (24kHz), G.711 (8kHz) |
| **Multilingual & Accents** | High fidelity across 50+ languages; accent robust | Strong English & European languages; good nuance | Exceptional natural cadence and global multilingual | Good for standard phrasing; lower inflection depth |
| **Cost Profile** | Premium per-minute audio pricing ($0.06 – $0.12/min) | Balanced audio/token blend ($0.05 – $0.10/min) | Competitive Gemini cloud pricing ($0.03 – $0.07/min) | Economic high-volume outbound ($0.02 – $0.04/min) |
| **Best Production Fit** | High-touch VIP inbound calls & enterprise consultations | Complex multi-turn consultative sales with CRM tools | Scalable multi-tenant omnichannel calling & Google Calendar | High-volume outbound qualification & triage |

---

## Architectural Principles & Constraints

### 1. Zero Model Text Hallucination for Critical Mutations
The voice model is **never trusted** as authoritative proof of an action. When the model invokes a function (e.g. `schedule_calendar_session`):
1. The tool call payload is intercepted by the **Trusted Orchestration Layer**.
2. Tenant scope (`req.tenantId`) is cryptographically verified from the session context.
3. Database conflict checks (`WHERE date = $1 AND time_slot = $2 AND status IN ('confirmed', 'pending_confirmation')`) run with row-level locks.
4. Only upon successful database persistence and calendar provider response is the authoritative confirmation returned to the model context.

### 2. Real-Time Barge-In & Audio Cancellation
When the caller speaks while the agent is streaming synthesized audio:
1. The media adapter detects user speech via server-side Voice Activity Detection (VAD) or model interruption event.
2. The orchestrator immediately emits a buffer cancellation signal to the media bridge.
3. Outbound audio packets currently buffered in the media bridge or WebRTC socket are flushed instantly, preventing the caller from hearing the agent "talk over" them.
4. The conversational history is authoritatively truncated to the exact timestamp where the caller interrupted.

### 3. Tenant Isolation & Key Security
- No single hardcoded voice model or telephony provider is used globally.
- Each tenant's voice configuration (telephony credentials, voice model selection, custom voice IDs, rate limits) is stored encrypted in `tenants.telephony_config`.
- Third-party API keys (OpenAI, Gemini, Twilio) are never exposed to the frontend browser client. WebRTC and media bridge connections authenticate through signed, short-lived backend session tokens.

### 4. Empirical Benchmarking (No Invented Metrics)
Latency and accuracy must be continuously measured against live call telemetry:
- Median (p50) and 95th percentile (p95) perceived audio round-trip latency.
- Interruption latency (time between customer speech onset and agent audio silence).
- RAG grounding fidelity (% of responses backed by verified knowledge chunks).
- Booking reconciliation accuracy (0 double-booking rate).
- Exact per-connected-minute operational cost.

---

## Consequences & Implementation Plan
- **Phase 1 Remediation:** Complete all P0 security and data isolation requirements, migrate to PostgreSQL RLS, and restore missing calendar/tenant routes.
- **Phase 2 Implementation:** Deploy the modular `src/voice/` adapter interfaces:
  - Telephony media bridge: WebRTC browser gateway and SIP/Twilio adapter.
  - Native voice model adapters: Gemini 3.8 Live and GPT-Realtime 2.1 adapters.
  - Trusted orchestration engine with barge-in cancellation and RAG grounding.
