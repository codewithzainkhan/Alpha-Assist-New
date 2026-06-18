"""GPT-4o vision wrapper for image analysis.

`analyze_image` returns the raw image bytes alongside the description so the
caller can upload them to Supabase Storage without re-reading the file — the
route layer holds both simultaneously in memory for a single request.
"""
import base64
import mimetypes
from openai import OpenAI
from ..config import OPENAI_API_KEY

client = OpenAI(api_key=OPENAI_API_KEY)

# GPT-4o only accepts these four MIME types for inline base64 images
SUPPORTED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp"
}


def analyze_image(image_path: str, user_prompt: str = None) -> dict:
    """Analyse an image with GPT-4o vision and return its description + raw bytes.

    Returns a dict with 'description', 'mime_type', 'image_bytes', 'base64_image',
    and 'user_prompt'. The route layer uses image_bytes for storage upload and
    base64_image is kept in case a second vision pass is needed.
    """
    mime_type, _ = mimetypes.guess_type(image_path)
    if not mime_type or mime_type not in SUPPORTED_MIME_TYPES:
        mime_type = "image/jpeg"  # fallback for unknown extensions

    with open(image_path, "rb") as img:
        image_bytes = img.read()
        base64_image = base64.b64encode(image_bytes).decode("utf-8")

    # Single vision call: describe everything so the LLM has full context in the follow-up
    vision_messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "Describe this image in thorough detail. "
                        "Note any text, people, objects, colors, layout, and context. "
                        "If it's a screenshot of a conversation or chat, transcribe the visible messages."
                    ),
                },
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{base64_image}"},
                },
            ],
        }
    ]

    vision_response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=vision_messages,
        max_tokens=1000,
    )

    description = vision_response.choices[0].message.content

    return {
        "description": description,
        "mime_type": mime_type,
        "image_bytes": image_bytes,
        "base64_image": base64_image,
        "user_prompt": user_prompt,
    }