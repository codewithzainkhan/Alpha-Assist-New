"""OpenAI TTS wrapper — standard (non-cloned) voice synthesis.

Used as the fallback when the user has no active voice profile or when XTTS
synthesis fails. `tts-1` is the low-latency model; `tts-1-hd` costs 2× and
the quality difference is unnoticeable over phone/app speakers.
The `alloy` voice is chosen for gender-neutral, clear articulation.
"""
from openai import OpenAI
from ..config import OPENAI_API_KEY

client = OpenAI(api_key=OPENAI_API_KEY)


def text_to_speech(text: str, filename: str) -> str:
    """Convert text to speech and write MP3 to *filename*. Returns the path."""
    response = client.audio.speech.create(
        model="tts-1",
        voice="alloy",
        input=text,
        response_format="mp3",
    )
    # stream_to_file is the canonical SDK method for openai >= 1.0 (avoids loading
    # the entire audio into memory before writing)
    response.stream_to_file(filename)
    return filename
