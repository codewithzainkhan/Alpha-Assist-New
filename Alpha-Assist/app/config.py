"""Runtime configuration loaded from environment variables."""
import os
from dotenv import load_dotenv

load_dotenv()


# ── OpenAI ─────────────────────────────────────────────────────────────────
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


# ── Supabase (single source of truth — DB, auth, storage) ──────────────────
SUPABASE_URL              = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY         = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_JWT_SECRET       = os.getenv("SUPABASE_JWT_SECRET", "")


# ── Redis (cache + rate limiting only) ─────────────────────────────────────
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))


# ── App settings ───────────────────────────────────────────────────────────
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "*").split(",")
    if origin.strip()
] or ["*"]

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()


# ── Twilio (call reminders + WhatsApp) ─────────────────────────────────────
TWILIO_ACCOUNT_SID  = os.getenv("TWILIO_ACCOUNT_SID",  "")
TWILIO_AUTH_TOKEN   = os.getenv("TWILIO_AUTH_TOKEN",   "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")  # E.164 e.g. +12025551234

# Public URL Twilio uses to reach your backend webhooks.
# Dev: use ngrok — `ngrok http 8000` then set this to the https URL.
# Prod: set to your actual domain e.g. https://api.yourdomain.com
BACKEND_PUBLIC_URL = os.getenv("BACKEND_PUBLIC_URL", "http://localhost:8000")


# ── Web search (optional — for real-time knowledge) ────────────────────────
# Brave Search: https://api.search.brave.com  (free tier: 2000 queries/month)
# Serper:       https://serper.dev             (free tier: 2500 total queries)
BRAVE_SEARCH_API_KEY = os.getenv("BRAVE_SEARCH_API_KEY", "")
SERPER_API_KEY       = os.getenv("SERPER_API_KEY",       "")


# ── Storage bucket names (match supabase_migration.sql) ────────────────────
BUCKET_AVATARS       = "avatars"
BUCKET_CHAT_IMAGES   = "chat-images"
BUCKET_CHAT_AUDIO    = "chat-audio"
BUCKET_VOICE_SAMPLES = "voice-samples"


def assert_required_env() -> None:
    """Raise a clear error at startup if critical env vars are missing."""
    missing = [
        name for name, value in {
            "OPENAI_API_KEY":            OPENAI_API_KEY,
            "SUPABASE_URL":              SUPABASE_URL,
            "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_SERVICE_ROLE_KEY,
            "SUPABASE_JWT_SECRET":       SUPABASE_JWT_SECRET,
        }.items() if not value
    ]
    if missing:
        raise RuntimeError(
            f"Missing required env vars: {', '.join(missing)}. "
            f"See .env.example for the full list."
        )
