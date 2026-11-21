"""Runs one chat turn with Claude (Messages API tool runner, hosted in Django)."""

import logging

import anthropic
from django.conf import settings

from .prompts import SYSTEM_PROMPT
from .tools import build_tools

logger = logging.getLogger(__name__)


class AssistantUnavailable(Exception):
    """The assistant can't answer right now; the message is safe to show."""

    def __init__(self, message, status=503):
        super().__init__(message)
        self.status = status


def assistant_enabled():
    key = settings.ANTHROPIC_API_KEY or ""
    return key.startswith("sk-ant-") and "your" not in key


def _client():
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=60.0, max_retries=2)


def run_chat(history, user):
    """
    history: [{"role": "user"|"assistant", "content": str}, ...] ending with a user message.
    Only plain text is replayed between turns (no thinking blocks), so the history stays
    valid for preserved thinking; inside one turn the tool runner replays everything verbatim.
    Returns {"reply": str, "cart_updated": bool}.
    """
    if not assistant_enabled():
        raise AssistantUnavailable("The AI assistant is not set up yet.")

    tools, state = build_tools(user)
    who = (
        f"The customer is logged in as {user.username}."
        if user and user.is_authenticated
        else "The customer is not logged in (a guest)."
    )
    messages = [*history, {"role": "system", "content": who}]

    try:
        runner = _client().beta.messages.tool_runner(
            model=settings.ASSISTANT_MODEL,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            tools=tools,
            messages=messages,
            output_config={"effort": "low"},       # chat: fast, short answers
            cache_control={"type": "ephemeral"},   # system prompt + tools are identical every turn
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",                   # if a safety classifier declines, retry on a fallback model
            max_iterations=8,
        )
        final = runner.until_done()
    except anthropic.AuthenticationError:
        logger.error("Anthropic API key was rejected.")
        raise AssistantUnavailable("The AI assistant is not configured correctly.")
    except anthropic.RateLimitError:
        raise AssistantUnavailable("The assistant is busy right now. Please try again in a minute.", status=429)
    except (anthropic.APIConnectionError, anthropic.APIStatusError):
        logger.exception("Claude API request failed")
        raise AssistantUnavailable("The assistant is unavailable right now. Please try again.", status=502)

    if final.stop_reason == "refusal":
        reply = "Sorry, I can't help with that. I can help you find products, check your orders, or answer store questions."
    else:
        reply = "\n\n".join(b.text for b in final.content if b.type == "text").strip()
        if not reply:
            reply = "Sorry, I couldn't come up with an answer. Could you rephrase?"
    return {"reply": reply, "cart_updated": state["cart_updated"]}
