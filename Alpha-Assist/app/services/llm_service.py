"""LLM interface — gpt-4o-mini for regular calls; OpenAI Responses API for web-search calls.

Regular chat uses the Chat Completions API (client.chat.completions).
Web-search calls use the Responses API (client.responses) because the
`web_search_preview` tool is only available there, not in Chat Completions.
"""
import logging
from openai import OpenAI
from ..config import OPENAI_API_KEY

logger = logging.getLogger(__name__)
client = OpenAI(api_key=OPENAI_API_KEY)

# gpt-4o-mini pricing per 1M tokens (USD) — used for cost logging only
_INPUT_COST_PER_M  = 0.15
_OUTPUT_COST_PER_M = 0.60


def _log_usage(usage, label: str = "") -> None:
    if not usage:
        return
    inp  = usage.prompt_tokens
    out  = usage.completion_tokens
    cost = (inp * _INPUT_COST_PER_M + out * _OUTPUT_COST_PER_M) / 1_000_000
    logger.info(
        "[llm] %stokens in=%d out=%d total=%d cost=$%.6f",
        f"{label} " if label else "",
        inp, out, inp + out, cost,
    )


def generate_response(messages, label: str = "") -> str:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
    )
    _log_usage(response.usage, label)
    return response.choices[0].message.content


_SEARCH_SYSTEM = (
    "IMPORTANT: For this response you have access to real-time web search. "
    "You MUST use the web_search tool to look up current information. "
    "Always prefer the web search results over your training data — your training data "
    "may be outdated. Cite the source when relevant."
)


def _inject_search_instruction(messages: list) -> list:
    """Insert the web-search instruction right after the first system message.

    Inserting at position 1 (not 0) keeps the main system prompt first so the
    model's persona and action-format rules aren't displaced by the search hint.
    """
    out = list(messages)
    search_msg = {"role": "system", "content": _SEARCH_SYSTEM}
    insert_at = 1 if out and out[0].get("role") == "system" else 0
    out.insert(insert_at, search_msg)
    return out


def generate_response_with_search(messages, label: str = "search") -> str:
    """generate_response with OpenAI web_search_preview forced on."""
    augmented = _inject_search_instruction(messages)
    response = client.responses.create(
        model="gpt-4o-mini",
        tools=[{"type": "web_search_preview"}],
        tool_choice={"type": "web_search_preview"},
        input=augmented,
    )
    if hasattr(response, "usage") and response.usage:
        try:
            inp  = response.usage.input_tokens
            out  = response.usage.output_tokens
            cost = (inp * _INPUT_COST_PER_M + out * _OUTPUT_COST_PER_M) / 1_000_000
            logger.info("[llm] %s tokens in=%d out=%d total=%d cost=$%.6f",
                        label, inp, out, inp + out, cost)
        except Exception:
            pass
    logger.info("[llm] web search used for query")
    return response.output_text


def generate_response_stream(messages):
    """Yields string tokens as OpenAI produces them. Usage logged at end of stream."""
    stream = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        stream=True,
        stream_options={"include_usage": True},
    )
    for chunk in stream:
        if chunk.usage:
            _log_usage(chunk.usage, "stream")
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield delta


def generate_response_stream_with_search(messages):
    """Streams tokens using the Responses API with web search forced on."""
    augmented = _inject_search_instruction(messages)
    stream = client.responses.create(
        model="gpt-4o-mini",
        tools=[{"type": "web_search_preview"}],
        tool_choice={"type": "web_search_preview"},
        input=augmented,
        stream=True,
    )
    for event in stream:
        if event.type == "response.output_text.delta":
            yield event.delta
        elif event.type == "response.completed":
            try:
                usage = event.response.usage
                inp   = usage.input_tokens
                out   = usage.output_tokens
                cost  = (inp * _INPUT_COST_PER_M + out * _OUTPUT_COST_PER_M) / 1_000_000
                logger.info("[llm] search-stream tokens in=%d out=%d cost=$%.6f", inp, out, cost)
            except Exception:
                pass
