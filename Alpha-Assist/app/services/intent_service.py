"""Intent detection and web-search routing for incoming messages.

`detect_intent` uses a priority-ordered regex list — the first matching pattern
wins. More specific patterns (e.g. delete) must appear before general ones
(e.g. view) to avoid false positives.

`needs_web_search` short-circuits for task/goal intents because those operate
entirely on the user's own data in Supabase — a web search would add noise.
"""
import re

TASK_INTENTS = {"task_create", "task_view", "task_update", "task_delete"}
GOAL_INTENTS = {"goal_create", "goal_view", "goal_update", "goal_delete", "goal_progress"}
VALID_INTENTS = {"casual_chat", "question_answer"} | TASK_INTENTS | GOAL_INTENTS

# Ordered by specificity — first match wins; do NOT reorder without testing
_PATTERNS = [
    (r"\b(add|create|make|schedule|set up|remind me|new task|new reminder)\b", "task_create"),
    (r"\b(delete|remove|cancel)\b.{0,20}\btask\b",                             "task_delete"),
    (r"\b(update|edit|change|reschedule|mark|complete|finish)\b.{0,20}\btask\b","task_update"),
    (r"\b(my tasks?|show tasks?|list tasks?|pending|due|overdue)\b",            "task_view"),
    (r"\b(create|set|add|new)\b.{0,20}\bgoal\b",                               "goal_create"),
    (r"\b(delete|remove)\b.{0,20}\bgoal\b",                                    "goal_delete"),
    (r"\b(update|edit|change)\b.{0,20}\bgoal\b",                               "goal_update"),
    (r"\b(progress|saving|saved|add money|log)\b.{0,20}\bgoal\b",              "goal_progress"),
    (r"\b(my goals?|show goals?|list goals?)\b",                                "goal_view"),
]

# Patterns that signal the user wants real-time or general world knowledge
_SEARCH_PATTERNS = [
    r"\b(news|headline|breaking|latest|recent|update|happening)\b",
    r"\b(weather|temperature|forecast|rain|sunny|humidity)\b",
    r"\b(price|cost|rate|exchange rate|stock|crypto|bitcoin|market|nse|psx)\b",
    r"\b(score|match|game|result|winner|championship|tournament|league|ucl|nba|nfl|ipl|psl|premier league|la liga|serie a|bundesliga)\b",
    r"\b(how many times|how often|how many (goals?|wins?|titles?|trophies|cups?))\b",
    r"\b(who is|who was|who are|what is|what are|what was|what were)\b",
    r"\b(when (is|was|did|will)|where (is|was|are))\b",
    r"\b(how (does|do|did|to|many|much|long|far|old))\b",
    r"\b(tell me about|explain|define|meaning of|history of|facts about)\b",
    r"\b(today|tonight|this week|this month|right now|currently|live)\b",
    r"\b(recipe|ingredients|how to make|how to cook)\b",
    r"\b(movie|film|show|series|episode|season|actor|director)\b",
    r"\b(song|album|artist|band|singer|lyrics|music)\b",
    r"\b(country|capital|population|currency|language|president|prime minister)\b",
    r"\b(health|symptom|disease|medicine|treatment|doctor)\b",
    r"\b(law|legal|regulation|rule|policy|government)\b",
    r"\b(company|startup|ceo|founded|headquarters|product)\b",
    r"\b(science|research|study|discovery|invention|technology)\b",
    r"\b(meaning|definition|synonym|antonym|translate|language)\b",
]

# These intents never need a web search — purely internal data operations
_NO_SEARCH_INTENTS = TASK_INTENTS | GOAL_INTENTS | {"task_view", "goal_view"}


def detect_intent(message: str) -> str:
    m = message.lower()
    for pattern, intent in _PATTERNS:
        if re.search(pattern, m):
            return intent
    return "casual_chat"


def needs_web_search(message: str, intent: str) -> bool:
    """Return True if this message would benefit from a real-time web search."""
    if intent in _NO_SEARCH_INTENTS:
        return False
    m = message.lower()
    return any(re.search(p, m) for p in _SEARCH_PATTERNS)
