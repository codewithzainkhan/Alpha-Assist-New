# Alpha Assist — Backend

FastAPI backend for an AI-powered life assistant. Handles chat, voice, image analysis, task/goal management, voice cloning, and Twilio call reminders.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Prerequisites](#prerequisites)
3. [Supabase Setup](#supabase-setup)
4. [Environment Variables](#environment-variables)
5. [Running Locally](#running-locally)
6. [Running with Docker](#running-with-docker)
7. [Twilio Setup](#twilio-setup)
8. [XTTS Voice Cloning](#xtts-voice-cloning)
9. [API Reference](#api-reference)
10. [Project Structure](#project-structure)

---

## Tech Stack

| Layer | Technology |
|---|---|
| API | FastAPI + Uvicorn |
| Database | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth (JWT) |
| Storage | Supabase Storage |
| Cache / Rate limiting | Redis 7 |
| LLM | OpenAI GPT-4o-mini |
| Speech-to-text | OpenAI Whisper |
| Text-to-speech | OpenAI TTS + Coqui XTTS-v2 (voice cloning) |
| Web search | OpenAI Responses API (`web_search_preview`) |
| RAG | pgvector (Supabase) + ChromaDB |
| Calls / WhatsApp | Twilio |
| Scheduling | APScheduler |

---

## Prerequisites

Install these before anything else.

- **Python 3.11** — `python --version` must show `3.11.x`
- **Redis** — local install or Docker (`docker run -d -p 6379:6379 redis:7-alpine`)
- **FFmpeg** — required for audio processing
  - Windows: download from https://ffmpeg.org/download.html and add to PATH
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`
- **Git**
- A **Supabase** project (free tier works)
- An **OpenAI** API key with access to `gpt-4o-mini` and `tts-1`
- A **Twilio** account (only needed for call/WhatsApp reminders)

---

## Supabase Setup

### 1. Create a project

Go to https://supabase.com, create a new project and note down:
- Project URL → `SUPABASE_URL`
- `anon` public key → `SUPABASE_ANON_KEY`
- `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`
- JWT secret (Project Settings → API → JWT Settings) → `SUPABASE_JWT_SECRET`

### 2. Enable pgvector

In the Supabase dashboard, go to **Database → Extensions** and enable **vector**.

Or run in the SQL Editor:

```sql
create extension if not exists vector;
```

### 3. Run the migrations

Open the **SQL Editor** in your Supabase dashboard and run these files in order:

**Step 1** — main schema (tables, RLS, storage buckets, triggers):
```
supabase_migration.sql
```

**Step 2** — conversations table + Realtime support:
```
migrations/002_realtime_conversations.sql
```

**Step 3** — pgvector RAG documents table:
```
migrations/pgvector_rag.sql
```

Each file is idempotent — safe to re-run if something goes wrong.

### 4. Verify storage buckets

After running the migration, check **Storage** in the Supabase dashboard. You should see four buckets:

| Bucket | Access |
|---|---|
| `avatars` | Public |
| `chat-images` | Private |
| `chat-audio` | Private |
| `voice-samples` | Private |

If they are missing, create them manually with those exact names.

---

## Environment Variables

Copy the template below into a file named `.env` in the project root.

```env
# ── OpenAI ──────────────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-...

# ── Supabase ─────────────────────────────────────────────────────────────────
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret

# ── Redis ────────────────────────────────────────────────────────────────────
REDIS_HOST=localhost      # use "redis" when running via docker-compose
REDIS_PORT=6379

# ── Twilio (optional — only needed for call/WhatsApp reminders) ──────────────
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# Public URL Twilio uses to reach your webhooks.
# Local dev: run `ngrok http 8000` and paste the https URL here.
# Production: your actual domain e.g. https://api.yourdomain.com
BACKEND_PUBLIC_URL=https://xxxx-xx-xx-xx-xx.ngrok-free.app

# ── App ──────────────────────────────────────────────────────────────────────
# Comma-separated list of allowed frontend origins, or * for all.
CORS_ORIGINS=*
LOG_LEVEL=INFO

# ── Whisper model size ───────────────────────────────────────────────────────
# Options: tiny | base | small | medium | large  (default: base)
# Larger = more accurate but slower and more RAM.
WHISPER_MODEL=base
```

**Required** at startup: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`.
Everything else is optional or has a sensible default.

---

## Running Locally

### 1. Clone and create a virtual environment

```bash
git clone <repo-url>
cd Alpha-Assist

python -m venv myenv

# Windows
myenv\Scripts\activate

# macOS / Linux
source myenv/bin/activate
```

### 2. Install dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

> **Note:** The first install takes a while — PyTorch and audio libraries are large.
> If you are on a machine without a GPU, PyTorch will still work on CPU (slower voice cloning).

### 3. Configure environment

Create `.env` as shown in the [Environment Variables](#environment-variables) section.

### 4. Start Redis

If Redis is not already running:

```bash
# Docker (easiest)
docker run -d --name alpha-redis -p 6379:6379 redis:7-alpine

# Or install and run natively
redis-server
```

### 5. Start the backend

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API is now live at `http://localhost:8000`.
Health check: `GET http://localhost:8000/` should return `{"status":"ok"}`.

---

## Running with Docker

Docker Compose starts the backend and Redis together with one command.

### 1. Build and start

```bash
docker-compose up --build
```

The backend will be available at `http://localhost:8000`.

### 2. Stop

```bash
docker-compose down
```

### 3. Notes

- The `.env` file is loaded automatically by `env_file: .env` in `docker-compose.yml`.
- Set `REDIS_HOST=redis` (not `localhost`) in `.env` when using Docker Compose — `redis` is the internal service hostname.
- Redis data persists in a named Docker volume (`redis_data`) across restarts.
- The first startup is slow because PyTorch and ML model weights are downloaded. Subsequent starts are fast.

---

## Twilio Setup

Twilio is only needed for **call reminders** and **WhatsApp** reminders. The rest of the app works without it.

### 1. Get credentials

Sign up at https://twilio.com, go to **Console → Account Info** and copy:
- `Account SID` → `TWILIO_ACCOUNT_SID`
- `Auth Token` → `TWILIO_AUTH_TOKEN`

### 2. Get a phone number

Go to **Phone Numbers → Manage → Buy a Number**. Choose a number with Voice capability.
Note it down as `TWILIO_PHONE_NUMBER` (E.164 format, e.g. `+12025551234`).

### 3. Expose your local server to the internet

Twilio needs a public HTTPS URL to send webhooks to. Use **ngrok** during development:

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 8000
```

Copy the `https://xxxx-xx-xx-xx.ngrok-free.app` URL and set it as `BACKEND_PUBLIC_URL` in your `.env`.

> In production, set `BACKEND_PUBLIC_URL` to your deployed domain (e.g. `https://api.yourdomain.com`).

### 4. Verified numbers (trial accounts)

On a Twilio trial account you can only call verified numbers. Go to **Phone Numbers → Verified Caller IDs** and add your personal number. On a paid account this restriction is lifted.

---

## XTTS Voice Cloning

Voice cloning uses **Coqui XTTS-v2** and is only activated when a user uploads a voice sample.

### How it works

1. User uploads a `.wav`/`.mp3` voice sample via the app.
2. The sample is stored in Supabase Storage (`voice-samples` bucket).
3. On every voice reply, the sample is downloaded and XTTS synthesises speech in the user's voice.
4. If XTTS fails for any reason, it falls back silently to OpenAI TTS.

### First run

On first use, XTTS downloads ~1.8 GB of model weights from Hugging Face. This is a one-time download cached at `~/.local/share/tts/` (Linux/Mac) or `%APPDATA%\tts\` (Windows).

### Dependency note

XTTS-v2 (Coqui TTS 0.22.0) requires `transformers < 4.45`. This is already pinned in `requirements.txt`. **Do not upgrade `transformers` past 4.44.x** or voice cloning will break with a `BeamSearchScorer` import error.

### GPU acceleration

If a CUDA GPU is available, XTTS uses it automatically (detected via `torch.cuda.is_available()`). CPU synthesis works but is slower (~5-15 seconds per reply vs ~1-2 seconds on GPU).

---

## API Reference

All endpoints are prefixed with `/api`. Authentication uses a Supabase JWT passed as `Authorization: Bearer <token>`.

### Chat

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/chat` | Send a message, get a response |
| `POST` | `/api/chat/stream` | Same but streams tokens via SSE |
| `GET` | `/api/chat-history` | Fetch message history |
| `DELETE` | `/api/chat-history` | Clear message history |
| `POST` | `/api/chat/refresh-context` | Force rebuild of system prompt cache |
| `GET` | `/api/conversations` | List all conversations |
| `POST` | `/api/conversations` | Create a new conversation |
| `DELETE` | `/api/conversations/{id}` | Delete a conversation |

### Voice

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/voice-chat` | Upload audio, get transcription + AI response audio |
| `GET` | `/api/voice-history` | Fetch voice message history |

### Image

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/image-chat` | Upload an image + optional prompt, get AI analysis |
| `GET` | `/api/image-history` | Fetch image message history |

### Tasks

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tasks` | List tasks |
| `POST` | `/api/tasks` | Create a task |
| `PATCH` | `/api/tasks/{id}` | Update a task |
| `DELETE` | `/api/tasks/{id}` | Delete a task |

### Goals

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/goals` | List goals |
| `POST` | `/api/goals` | Create a goal |
| `PATCH` | `/api/goals/{id}` | Update a goal |
| `DELETE` | `/api/goals/{id}` | Delete a goal |
| `POST` | `/api/goals/{id}/progress` | Log progress towards a goal |

### Voice Clone

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/voice-clone/upload` | Upload a voice sample |
| `GET` | `/api/voice-clone/profile` | Get current voice profile |
| `DELETE` | `/api/voice-clone/profile` | Delete voice profile |
| `POST` | `/api/voice-clone/toggle` | Enable / disable cloned voice |

### Calls (Twilio)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/calls/schedule` | Schedule a reminder call for a task |
| `POST` | `/api/calls/cancel` | Cancel a scheduled call |
| `POST` | `/api/calls/assistant` | Start an on-demand AI assistant call |
| `DELETE` | `/api/calls/assistant/{sid}` | End an active assistant call |
| `POST` | `/api/calls/whatsapp/schedule` | Schedule a WhatsApp reminder |
| `POST` | `/api/calls/whatsapp/cancel` | Cancel a WhatsApp reminder |
| `GET` | `/api/calls/recordings/{call_sid}` | Get recording URL for a completed call |

### Account

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/account/profile` | Get user profile + subscription tier |
| `PATCH` | `/api/account/tier` | Update subscription tier |
| `GET` | `/api/subscription/usage` | Get today's usage vs limits |

### Tone

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tone/analyse` | Analyse chat/text and set tone profile |
| `GET` | `/api/tone/profile` | Get current tone profile |
| `DELETE` | `/api/tone/profile` | Delete tone profile |

---

## Project Structure

```
Alpha-Assist/
├── .env                          # Secrets — never commit this
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── supabase_migration.sql        # Run first in Supabase SQL Editor
│
├── migrations/
│   ├── 002_realtime_conversations.sql   # Run second
│   └── pgvector_rag.sql                 # Run third
│
└── app/
    ├── main.py                   # FastAPI app, router registration, APScheduler startup
    ├── config.py                 # All env vars loaded here
    ├── auth.py                   # JWT verification (Supabase HS256)
    ├── db.py                     # All Supabase DB calls (plain dicts, no ORM)
    ├── redis_client.py           # Resilient Redis wrapper (no-ops if Redis is down)
    ├── supabase_client.py        # Supabase client singleton
    │
    ├── routes/
    │   ├── chat.py               # /chat, /chat/stream, /conversations
    │   ├── voice.py              # /voice-chat, /voice-history
    │   ├── image.py              # /image-chat, /image-history
    │   ├── tasks.py              # /tasks CRUD
    │   ├── goals.py              # /goals CRUD + progress
    │   ├── voice_clone.py        # /voice-clone upload/profile/toggle
    │   ├── calls.py              # /calls schedule/cancel + Twilio webhooks
    │   ├── tone.py               # /tone analyse/profile
    │   └── account.py            # /account profile/tier/usage
    │
    └── services/
        ├── llm_service.py        # OpenAI chat + web_search_preview
        ├── voice_service.py      # Whisper transcription
        ├── voice_clone_service.py# Coqui XTTS-v2 synthesis + OpenAI TTS fallback
        ├── tts_service.py        # OpenAI TTS (standard voice)
        ├── image_service.py      # GPT-4o vision analysis
        ├── rag_service.py        # pgvector similarity search + document indexing
        ├── context_service.py    # System prompt builder (tasks, goals, tone, date)
        ├── intent_service.py     # Intent detection + web search routing
        ├── task_goal_service.py  # Action executor for LLM <<<ACTION>>> blocks
        ├── tone_service.py       # Tone analysis via LLM
        ├── twilio_service.py     # make_call, make_assistant_call, send_whatsapp
        ├── storage_service.py    # Supabase Storage upload/download/signed URLs
        └── subscription_service.py # Daily usage limits per tier
```

---

## Subscription Tiers

| Tier | Daily text messages | Daily voice messages | Daily image analyses | Tasks | Goals |
|---|---|---|---|---|---|
| Basic | 60 | 10 | 10 | 10 | 5 |
| Standard | 100 | 50 | 10 | 50 | 20 |
| Premium | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |

Update a user's tier via `PATCH /api/account/tier` or directly in the Supabase `profiles` table (`subscription_tier` column).
