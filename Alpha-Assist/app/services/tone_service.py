"""Tone analysis + persistence (Supabase-backed)."""
import base64
import logging
import mimetypes

from openai import OpenAI

from ..config import OPENAI_API_KEY
from .. import db as store
from ..redis_client import redis_client

logger = logging.getLogger(__name__)
client = OpenAI(api_key=OPENAI_API_KEY)

TONE_CACHE_PREFIX = "tone:"
CHAT_CONTENT_CACHE_PREFIX = "chat_content:"
CACHE_TTL = 3600


# ───────────────────────────────────────────────────────────────────────────
# Vision helpers
# ───────────────────────────────────────────────────────────────────────────
def _encode_images(image_paths: list[str]) -> list[dict]:
    blocks = []
    for path in image_paths:
        mime_type, _ = mimetypes.guess_type(path)
        if not mime_type or not mime_type.startswith("image/"):
            mime_type = "image/jpeg"
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")
        blocks.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime_type};base64,{b64}"},
        })
    return blocks


def _extract_chat_content(image_paths: list[str]) -> str:
    image_blocks = _encode_images(image_paths)
    messages = [{
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": (
                    "These are screenshots of chat conversations. "
                    "Transcribe ALL visible messages verbatim in the format:\n"
                    "[Person A]: message text\n"
                    "[Person B]: message text\n"
                    "Include timestamps if visible. "
                    "If you can identify who owns the phone, label them [User] and the "
                    "other party by name or [Contact]. Do not summarise."
                ),
            },
            *image_blocks,
        ],
    }]
    response = client.chat.completions.create(
        model="gpt-4o-mini", messages=messages, max_tokens=2000,
    )
    return response.choices[0].message.content.strip()


def _analyze_tone(chat_transcript: str, image_paths: list[str]) -> dict:
    image_blocks = _encode_images(image_paths)
    messages = [{
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": (
                    f"Here is a transcript of chat conversations:\n\n{chat_transcript}\n\n"
                    "Based on the transcript and the screenshots, analyse the USER's communication style.\n\n"
                    "Extract:\n"
                    "1. Tone (casual/formal/sarcastic/warm/blunt/playful, etc.)\n"
                    "2. Vocabulary (slang, abbreviations, emojis, punctuation habits)\n"
                    "3. Message length and structure\n"
                    "4. Characteristic phrases or expressions\n"
                    "5. How they ask questions or make requests\n\n"
                    "Then write a SYSTEM PROMPT (2–4 sentences) for an AI assistant to reply in this exact style.\n"
                    "Format:\n"
                    "TONE_SUMMARY: <analysis>\n"
                    "STYLE_PROMPT: <system prompt>"
                ),
            },
            *image_blocks,
        ],
    }]
    response = client.chat.completions.create(
        model="gpt-4o-mini", messages=messages, max_tokens=800,
    )
    raw = response.choices[0].message.content.strip()

    if "TONE_SUMMARY:" in raw and "STYLE_PROMPT:" in raw:
        parts = raw.split("STYLE_PROMPT:", 1)
        tone_summary = parts[0].replace("TONE_SUMMARY:", "").strip()
        style_prompt = parts[1].strip()
    elif "STYLE_PROMPT:" in raw:
        parts = raw.split("STYLE_PROMPT:", 1)
        tone_summary = parts[0].strip()
        style_prompt = parts[1].strip()
    else:
        tone_summary = raw
        style_prompt = f"Adapt your replies to match this communication style: {raw[:400]}"

    return {"tone_summary": tone_summary, "style_prompt": style_prompt}


def analyze_tone_from_screenshots(image_paths: list[str]) -> dict:
    """Two-pass analysis: transcribe first, then analyse tone from the transcript.

    Separating transcription from analysis gives the tone model a normalised
    text input instead of relying on OCR accuracy inside a single large prompt.
    The raw transcript is also stored so the assistant can answer questions
    about the chat content later.
    """
    logger.info("[tone] analysing %d screenshot(s)", len(image_paths))
    chat_content = _extract_chat_content(image_paths)
    tone_data = _analyze_tone(chat_content, image_paths)
    tone_data["chat_content"] = chat_content
    return tone_data


# ───────────────────────────────────────────────────────────────────────────
# Persistence via supabase-py
# ───────────────────────────────────────────────────────────────────────────
def save_tone_profile(user_id: str, tone_data: dict) -> dict:
    profile = store.upsert_tone_profile(
        user_id=user_id,
        tone_summary=tone_data["tone_summary"],
        style_prompt=tone_data["style_prompt"],
        chat_content=tone_data.get("chat_content"),
    )
    for key in (f"{TONE_CACHE_PREFIX}{user_id}",
                f"{CHAT_CONTENT_CACHE_PREFIX}{user_id}"):
        redis_client.delete(key)
    return profile


def get_style_prompt(user_id: str) -> str | None:
    key = f"{TONE_CACHE_PREFIX}{user_id}"
    cached = redis_client.get(key)
    if cached:
        return cached
    profile = store.get_tone_profile(user_id)
    if profile and profile.get("style_prompt"):
        redis_client.setex(key, CACHE_TTL, profile["style_prompt"])
        return profile["style_prompt"]
    return None


def get_chat_context(user_id: str) -> str | None:
    key = f"{CHAT_CONTENT_CACHE_PREFIX}{user_id}"
    cached = redis_client.get(key)
    if cached:
        return cached
    profile = store.get_tone_profile(user_id)
    if profile and profile.get("chat_content"):
        redis_client.setex(key, CACHE_TTL, profile["chat_content"])
        return profile["chat_content"]
    return None
