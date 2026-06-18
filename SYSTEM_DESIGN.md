# Alpha Assist — System Design

---

## 1. Overview

Alpha Assist is a mobile-first AI life assistant that helps users manage tasks, goals, and daily life through natural language. Users interact via text chat, voice messages, image analysis, or phone calls. The AI understands intent, takes actions (create/update/delete tasks and goals), searches the web for real-time knowledge, and personalises its communication style based on the user's own writing patterns and cloned voice.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Mobile App (React Native / Expo)            │
│                                                                 │
│   Auth  │  Dashboard  │  AI Chat  │  Analytics  │  Profile      │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS / REST + SSE
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Python 3.11)                 │
│                                                                 │
│  /api/chat    /api/tasks    /api/goals    /api/voice            │
│  /api/tone    /api/calls    /api/account  /api/voice-clone      │
│  /api/image                                                     │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ LLM Service  │  │ RAG Service  │  │ Task/Goal Service     │  │
│  │ gpt-4o-mini  │  │ (pgvector)   │  │ (action executor)    │  │
│  │ + web search │  │              │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Voice Service│  │ TTS / Clone  │  │ Subscription Service  │  │
│  │ (Whisper STT)│  │ OpenAI TTS   │  │ (tier enforcement)   │  │
│  │              │  │ + XTTS-v2    │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │Context Service│ │ Intent/Search│  │ Twilio Service        │  │
│  │ (sys prompt) │  │ (routing)    │  │ (calls + WhatsApp)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└──────────┬───────────────┬──────────────────┬───────────────────┘
           │               │                  │
           ▼               ▼                  ▼
    ┌────────────┐  ┌─────────────┐   ┌──────────────┐
    │  Supabase  │  │    Redis    │   │    Twilio    │
    │            │  │             │   │              │
    │  Postgres  │  │  Chat Cache │   │ Voice Calls  │
    │  Auth      │  │  Rate Limit │   │ WhatsApp     │
    │  Storage   │  │  Usage Ctrs │   │ TwiML Hooks  │
    │  pgvector  │  │  Job IDs    │   │ Recordings   │
    │  Realtime  │  │  Call State │   └──────────────┘
    └────────────┘  └─────────────┘
           │
    ┌──────────────┐
    │    OpenAI    │
    │              │
    │ gpt-4o-mini  │
    │ Responses API│
    │  web search  │
    │ tts-1        │
    │ embeddings   │
    │ Whisper STT  │
    └──────────────┘
```

---

## 3. Frontend

**Framework:** React Native + Expo
**Language:** TypeScript
**Navigation:** React Navigation (Stack + Tab)

### Screens

| Screen | Purpose |
|---|---|
| LoginOptionsScreen | Entry point — Continue with Email or Google |
| LoginScreen | Email/password login |
| SignupScreen | Registration |
| ForgotPassword / OTP / ResetPassword | Password recovery flow |
| DashboardScreen | Active tasks, upcoming goals, stats, quick chips |
| AiChatScreen | Main AI chat — text, voice, image modes + conversation sidebar |
| AnalyticsScreen | Full task/goal list with filters |
| ChatEnhancementScreen | Upload chat screenshots to teach AI your writing style |
| VoiceCloningScreen | Upload voice sample for cloned TTS |
| ReportScreen | Usage and productivity reports |
| PersonalizationScreen | Personalization options |
| ProfileScreen | Avatar, personal info, appearance, subscription, account |

### Key Frontend Patterns

- **Auth state** managed via `AuthProvider` context — Supabase session restored from AsyncStorage on cold start
- **Chat state** cached in module-level variables (`_cachedMessages`, `_cachedConversations`) so messages survive screen unmounts without re-fetching
- **Real-time updates** via Supabase Realtime channels on `tasks` and `goals` tables — Dashboard refreshes automatically when backend mutates data
- **Streaming chat** via XHR polling on `responseText` every 50ms — simulates real-time token rendering in React Native (fetch streaming not supported natively)
- **Subscription gating** — Basic tier sees lock UI on tone/voice clone features; Standard/Premium unlock all

---

## 4. Backend

**Framework:** FastAPI (Python 3.11)
**Deployment:** Docker + Docker Compose
**Entry point:** `app.main:app`

### Route Groups

| Prefix | File | Responsibility |
|---|---|---|
| `/api/chat` | `routes/chat.py` | Text chat, streaming, history, conversations |
| `/api/tasks` | `routes/tasks.py` | CRUD for tasks |
| `/api/goals` | `routes/goals.py` | CRUD for goals + progress logging |
| `/api/voice` | `routes/voice.py` | Voice chat (upload → transcribe → respond → TTS) |
| `/api/image` | `routes/image.py` | Image chat (upload → vision → respond) |
| `/api/tone` | `routes/tone.py` | Tone profile from chat screenshots |
| `/api/voice-clone` | `routes/voice_clone.py` | Voice sample upload and XTTS synthesis |
| `/api/calls` | `routes/calls.py` | Twilio call/WhatsApp scheduling + webhooks |
| `/api/account` | `routes/account.py` | User profile, subscription tier, usage summary |

### Auth

Every protected route uses `get_current_user_id()` as a FastAPI dependency:
1. Extracts `Authorization: Bearer <token>` from the request header
2. Verifies JWT using `SUPABASE_JWT_SECRET` (HS256, audience=`authenticated`)
3. Returns `user_id` (UUID string) from the `sub` claim
4. Returns **401** on missing, expired, or invalid tokens

Twilio webhook routes are intentionally unauthenticated — Twilio POSTs to them directly. Signature verification via `twilio.request_validator` can be added if required.

---

## 5. AI Request Pipelines

### 5.1 Text Chat Pipeline

```
User message
     │
     ▼
Rate limit check (Redis — 30 msg/min per user)
     │
     ▼
Usage limit check (subscription tier — daily text quota)
     │
     ▼
Intent detection  →  task_create / goal_view / casual_chat / etc.
     │
     ▼
RAG retrieval (pgvector cosine similarity, min 0.5, top 3 docs)
     │
     ▼
Build messages array:
  [system prompt]  ← tasks + goals + tone + date/time (Redis 60s cache)
  [RAG context]    ← injected as system message if docs found
  [history]        ← last 40 messages (Redis 1h cache)
  [user message]
     │
     ▼
needs_web_search(message, intent)?
     ├── YES → generate_response_with_search()
     │          OpenAI Responses API + web_search_preview tool (forced)
     │          Returns real-time grounded answer
     │
     └── NO  → generate_response()
                OpenAI chat.completions (gpt-4o-mini)
     │
     ▼
Parse <<<ACTION>>> block from response
     │
     ├── No action → return / stream tokens to client
     │               save messages to DB
     │               index exchange in pgvector (RAG)
     │
     └── Has action → execute_action(action, user_id)
              │
              ├── create_task / update_task / delete_task  → Supabase DB
              ├── create_goal / update_goal / delete_goal  → Supabase DB
              └── goal_progress → update current_amount + savings_history
              │
              ▼
         Emit confirm event to client → "✅ Task created!"
         Invalidate system prompt cache (Redis)
         Index exchange in pgvector (RAG)
```

**Web search routing** (`intent_service.py`):
- Task/goal CRUD intents (`task_create`, `goal_view`, etc.) never trigger search — they operate on internal data only.
- All other intents are pattern-matched against 18 regex groups (news, weather, prices, sports scores, who/what/when/where questions, recipes, movies, health, etc.).
- If matched, the Responses API is called with `tool_choice={"type": "web_search_preview"}` to force search use.

### 5.2 Voice Chat Pipeline

```
Audio upload (m4a / webm / mp3 / wav)
     │
     ▼
Whisper transcription (lazy-loaded; ~140 MB base model)
     │
     ▼
Text → same pipeline as 5.1 (RAG + intent + web search + LLM)
     │
     ▼
Response text → TTS synthesis
     ├── voice_profile.is_active  → XTTS-v2 (user's cloned voice)
     │    Download sample from voice-samples bucket
     │    synthesise_to_file() → .wav or .mp3
     └── no profile / XTTS fails → OpenAI tts-1 ("alloy" voice, mp3)
     │
     ▼
Upload: user audio → chat-audio bucket
Upload: TTS reply  → chat-audio bucket
     │
     ▼
Return: transcript + response text + signed audio URL + base64 audio + voice_cloned flag
        Index exchange in pgvector (RAG)
```

### 5.3 Image Chat Pipeline

```
Image upload (jpeg / png / gif / webp)
     │
     ▼
GPT-4o vision analysis  → description string
     │
     ▼
Upload image → chat-images bucket (signed URL generated)
     │
     ▼
RAG retrieval on description
     │
     ▼
needs_web_search(prompt or description)?
     ├── YES → generate_response_with_search()
     └── NO  → generate_response()
     │
     ▼
Return: image_id + description + image_url + AI response
        Index exchange in pgvector (RAG)
```

---

## 6. Twilio Call Pipelines

### 6.1 Scheduled Reminder Call

The two-step webhook pattern prevents Twilio's 15-second timeout from being hit during LLM processing.

```
POST /api/calls/schedule
     │   APScheduler job created; call_user:{task_id} & call_job:{task_id} stored in Redis
     ▼
[at scheduled time]
_fire_call() → Twilio outbound call
     │
     ▼  [user answers]
Twilio fetches TwiML from GET /api/calls/twiml
  → <Gather> with action=/api/calls/voice-turn
  → greeting played: "AlphaAssist calling with a reminder for: {task_name}..."
     │
     ▼  [user speaks — loop]
POST /api/calls/voice-turn             (Step 1 — must respond in <1s)
  ← SpeechResult from Twilio
  → store speech + context in Redis (call_ctx:{call_sid}, 2-min TTL)
  → <Say>"Got it, one moment."
  → <Redirect> to /api/calls/voice-process
     │
     ▼
POST /api/calls/voice-process          (Step 2 — has full 15s window)
  ← reads Redis call_ctx:{call_sid}
  ← reads user_id from Redis call_user:{task_id}
  → _run_llm_turn(): load history → LLM → parse action → execute → save DB → index RAG
  → _clean_for_speech(): strip markdown / ACTION blocks / emoji
  → _is_farewell()? → <Hangup>
               else → <Gather> action=voice-turn (continue loop)
     │
     ▼  [call ends]
POST /api/calls/status  → log CallStatus + Duration
POST /api/calls/recording-status → store recording URL in Redis (call_recording:{call_sid}, 24h TTL)
```

### 6.2 On-Demand Assistant Call

```
POST /api/calls/assistant  (authenticated)
     │   call_assistant:{call_sid} → user_id stored in Redis (1h TTL)
     ▼
Twilio fetches TwiML from POST /api/calls/assistant-twiml
  → <Gather> action=/api/calls/assistant-turn
  → greeting: "Hello! AlphaAssist here, your personal assistant..."
     │
     ▼  [conversation loop — same two-step pattern]
POST /api/calls/assistant-turn    (Step 1 — acknowledge + stash)
  → store speech in Redis call_speech:{call_sid} (2-min TTL)
  → <Redirect> to /api/calls/assistant-process
     │
     ▼
POST /api/calls/assistant-process (Step 2 — LLM + actions)
  ← reads call_speech:{call_sid}
  ← reads user_id from call_assistant:{call_sid}
  → _run_llm_turn() → LLM + action execution
  → farewell detected? → delete call_assistant key → <Hangup>
                  else → <Gather> action=assistant-turn (continue loop)
     │
     ▼  [end call]
DELETE /api/calls/assistant/{sid}  → cancel_call() + clean Redis keys
```

### 6.3 Call Recording

- All calls are recorded (`record=True` in Twilio call params).
- When recording is ready, Twilio POSTs to `/api/calls/recording-status`.
- The recording URL is stored in Redis (`call_recording:{call_sid}`, 24h TTL).
- Retrieved by `GET /api/calls/recordings/{call_sid}` (authenticated).

---

## 7. Data Layer

### Supabase (PostgreSQL)

| Table | Key Columns | Notes |
|---|---|---|
| `profiles` | id, full_name, phone, avatar_url, subscription_tier, push_token, timezone | 1:1 with auth.users; subscription_tier: basic/standard/premium |
| `tasks` | user_id, task_name, task_type, scheduled_date, scheduled_time, status, priority, recurrence, call_reminder, whatsapp_reminder, reminder_time | Realtime enabled |
| `goals` | user_id, goal_name, goal_type, target_amount, current_amount, deadline, status, savings_history (JSONB) | savings_history: `[{id, amount, date, note}]` |
| `conversations` | user_id, title | Groups messages into named sessions; title auto-set from first user message |
| `messages` | user_id, conversation_id, role, content, message_type, metadata (JSONB) | message_type: text/voice/image; metadata holds audio_storage_path |
| `image_messages` | user_id, message_id, storage_path, mime_type, description, user_prompt, response | Linked to messages table |
| `user_tone_profiles` | user_id, tone_summary, style_prompt, chat_content | Upserted; chat_content accumulates uploaded chat history |
| `user_voice_profiles` | user_id, storage_path, original_filename, is_active | Voice clone sample reference |
| `documents` | user_id, content, embedding (vector 1536), source, created_at | pgvector RAG store; source: text_chat/voice_chat/image_chat/call_chat/completed_task/completed_goal |
| `reports` | user_id, period, period_start, report_data (JSONB) | Analytics snapshots |

**RLS:** All tables enforce Row-Level Security. The backend uses the service role key (bypasses RLS). The frontend Supabase client uses the user JWT.

### Supabase Storage Buckets

| Bucket | Access | Path Pattern | Content |
|---|---|---|---|
| `avatars` | Public | `{user_id}/{filename}` | Profile photos |
| `chat-images` | Private | `{user_id}/{uuid}.jpg` | Images from image-chat |
| `chat-audio` | Private | `{user_id}/user_voice_{uuid}.webm` / `reply_{uuid}.mp3` | Voice messages + TTS replies |
| `voice-samples` | Private | `{user_id}/sample.wav` | Voice clone reference samples (mono 22 050 Hz WAV) |

All private buckets use signed URLs (1-hour expiry) generated server-side.

### Redis Key Reference

| Key Pattern | TTL | Purpose |
|---|---|---|
| `rate:{user_id}` | 60 s | Rate limit counter (30 req/min) |
| `chat:{user_id}` | 1 h | Conversation history (last 40 messages as JSON) |
| `sys_prompt:{user_id}` | 60 s | Assembled system prompt cache |
| `sub_usage:{user_id}:{mode}:{date}` | 24 h | Daily usage counters (text/voice/image) |
| `call_user:{task_id}` | 2 h | user_id for an active reminder call |
| `call_job:{task_id}` | 2 h | APScheduler job_id (survives server restarts) |
| `wa_job:{task_id}` | 2 h | APScheduler job_id for a WhatsApp reminder |
| `call_ctx:{call_sid}` | 2 min | Speech + context stash between voice-turn and voice-process |
| `call_speech:{call_sid}` | 2 min | Speech stash between assistant-turn and assistant-process |
| `call_assistant:{call_sid}` | 1 h | user_id for an active assistant call session |
| `call_recording:{call_sid}` | 24 h | Recording SID + URL after call ends |

**Resilience:** `_ResilientRedis` wraps the real client. If Redis is unreachable, all calls silently no-op via `_NullRedis`. Caching and rate limiting degrade gracefully; the app continues to function.

---

## 8. RAG (Retrieval-Augmented Generation)

**Vector store:** Supabase pgvector (1536 dimensions)
**Embedding model:** OpenAI `text-embedding-3-small`
**Search:** Cosine similarity via `match_documents` PostgreSQL RPC function
**Index:** IVFFlat (lists=100) for fast approximate nearest-neighbour search

```
Query text
    │
    ▼
Check Redis cache (10-min TTL on query hash)
    │ cache miss
    ▼
Check documents table count (skip embedding call if empty)
    │
    ▼
Embed query → 1536-dim vector
    │
    ▼
match_documents(embedding, k=3, min_similarity=0.5, user_id)
    │
    ▼
Return top-3 matching document snippets
    │
    ▼
Inject into messages as a system message before user turn
```

**Indexed sources** (every successful exchange is indexed):

| Source label | Triggered by |
|---|---|
| `text_chat` | Every text chat turn |
| `voice_chat` | Every voice chat turn |
| `image_chat` | Every image chat turn |
| `call_chat` | Every Twilio call turn |
| `completed_task` | When a task is marked complete |
| `completed_goal` | When a goal reaches its target |

---

## 9. Voice Cloning

**Model:** Coqui XTTS-v2 (self-hosted, ~1.8 GB)
**Fallback:** OpenAI tts-1 (`alloy` voice, mp3)

```
User uploads voice sample
     │
     ▼
to_clean_wav_bytes() — convert any format → mono 22 050 Hz WAV
     │
     ▼
Upload to voice-samples bucket (path: {user_id}/sample.wav)
     │
     ▼
upsert_voice_profile(user_id, storage_path)

[on every voice reply]
     │
     ▼
get_voice_profile(user_id) → is_active?
     │
     ▼
Download sample from Supabase Storage → temp WAV file
     │
     ▼
synthesise(text, sample_path, language="en") → WAV bytes
     ├── XTTS model loaded? → tts_to_file() → WAV/MP3
     └── XTTS unavailable  → _openai_tts_fallback() → MP3
```

**Dependency constraint:** Coqui TTS 0.22.0 requires `transformers < 4.45`. The `BeamSearchScorer` class was removed from the transformers public API in 4.45. `requirements.txt` pins `transformers==4.44.2` and `tokenizers==0.19.1`.

**GPU:** XTTS uses CUDA if `torch.cuda.is_available()`, otherwise CPU (synthesis ~5-15s on CPU vs ~1-2s on GPU).

---

## 10. Subscription Tiers

| Feature | Basic | Standard | Premium |
|---|---|---|---|
| Text messages/day | 60 | 100 | Unlimited |
| Voice messages/day | 10 | 50 | Unlimited |
| Image analyses/day | 10 | 10 | Unlimited |
| Max active tasks | 10 | 50 | Unlimited |
| Max active goals | 5 | 20 | Unlimited |
| Chat Enhancement (tone) | ✗ | ✓ | ✓ |
| Voice Cloning | ✗ | ✓ | ✓ |

Enforcement happens at two points:
1. **Usage limits** — checked on every chat/voice/image request via Redis INCR counters (rolling 24-hour window)
2. **Resource limits** — checked before inserting a new task or goal (counts existing active rows)

Tier stored in `profiles.subscription_tier`. Updated via `PATCH /api/account/tier` or directly in Supabase.

---

## 11. External Services

| Service | Used For | API / Model |
|---|---|---|
| **OpenAI Chat** | Text/voice/image responses | `gpt-4o-mini` via `chat.completions` |
| **OpenAI Responses API** | Real-time web search | `gpt-4o-mini` + `web_search_preview` tool |
| **OpenAI TTS** | Standard voice synthesis | `tts-1`, voice `alloy`, mp3 |
| **OpenAI Embeddings** | RAG document indexing + retrieval | `text-embedding-3-small` (1536 dims) |
| **OpenAI Whisper** | Speech-to-text (API fallback) | `whisper-1` |
| **Supabase** | Auth, PostgreSQL, Storage, Realtime | Free / Pro tier |
| **Redis** | Cache, rate limiting, call state | Redis 7 |
| **Twilio** | Outbound voice calls, WhatsApp messages, call recordings | Voice + Messaging API |
| **Stripe** | Payments / subscriptions | Frontend only (publishable key) |

### Local ML Models (self-hosted)

| Model | Library | Used For | Size |
|---|---|---|---|
| **Whisper base** | `openai-whisper` | Speech-to-text transcription | ~140 MB |
| **XTTS-v2** | `TTS==0.22.0` (Coqui) | Voice cloning synthesis | ~1.8 GB |
| **faster-whisper** | `faster-whisper` | Alternative Whisper backend | ~140 MB |

Models are lazy-loaded on first use and kept in process memory for the lifetime of the server.

---

## 12. Infrastructure

```
┌─────────────────────────────────────────┐
│            Docker Compose               │
│                                         │
│  ┌────────────────────────────────────┐ │
│  │  backend (python:3.11-slim)        │ │
│  │  Port: 8000                        │ │
│  │  CMD: uvicorn app.main:app         │ │
│  │  Healthcheck: GET /                │ │
│  │  env_file: .env                    │ │
│  │  depends_on: redis (healthy)       │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌────────────────────────────────────┐ │
│  │  redis (redis:7-alpine)            │ │
│  │  Internal port: 6379               │ │
│  │  Volume: redis_data (persistent)   │ │
│  │  Healthcheck: redis-cli ping       │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**System packages in Docker image:**

| Package | Required by |
|---|---|
| `ffmpeg` | pydub, whisper, torchaudio, librosa |
| `libsndfile1` | soundfile, pyannote, Coqui TTS |
| `libgomp1` | PyTorch, umap-learn, numba (OpenMP) |
| `libglib2.0-0` | torchvision, chromadb |
| `libgl1` | torchvision headless |
| `libsqlite3-0` | chromadb vector store |
| `build-essential` | numpy, tokenizers, Cython compilation |
| `git` | pip packages with git references |

**Key environment variables:**

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | All OpenAI API calls |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend DB access (bypasses RLS) |
| `SUPABASE_ANON_KEY` | Supabase public key |
| `SUPABASE_JWT_SECRET` | JWT verification (HS256) |
| `REDIS_HOST` / `REDIS_PORT` | Redis connection (use `redis` host in Docker Compose) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | Twilio credentials |
| `BACKEND_PUBLIC_URL` | Public HTTPS URL Twilio uses for webhooks |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins |
| `WHISPER_MODEL` | Whisper model size: tiny/base/small/medium/large (default: base) |
| `LOG_LEVEL` | Logging verbosity (default: INFO) |

---

## 13. Security

| Concern | Approach |
|---|---|
| API auth | JWT verified on every protected route (Supabase HS256, audience=`authenticated`) |
| DB access | Service role key is server-side only; never sent to or from the client |
| User data isolation | All queries scoped by `user_id` extracted from verified JWT; RLS provides a second enforcement layer |
| Storage access | Private buckets only; all URLs are signed with 1-hour expiry |
| Rate limiting | 30 requests/minute per user enforced via Redis INCR; degrades gracefully if Redis is down |
| Daily quotas | Per-tier daily limits on text/voice/image usage tracked in Redis |
| Secrets | `.env` excluded from Docker image via `.dockerignore`; never committed to git |
| Twilio webhooks | Currently open (no signature verification) — add `twilio.request_validator` for production hardening |
| Call recordings | Stored in Twilio's infrastructure; only the URL is cached in Redis (24h); retrieved via authenticated endpoint |
