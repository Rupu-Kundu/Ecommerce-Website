"""
AI auto-reply for live chat.

When a customer writes and no one from the team is there, the AI answers (Claude when
ANTHROPIC_API_KEY is set, otherwise the built-in bot). Rules:
  - Team away (no admin has had the Live chat / dashboard open in the last
    SUPPORT_AGENT_ONLINE_SECONDS): reply straight away.
  - Team online: give them SUPPORT_AUTO_REPLY_AFTER_SECONDS to answer first; if nobody
    has, the AI replies.
  - Never twice for the same message, never in a closed chat, and never when an admin
    switched it off for that chat.

There is no background worker: the check runs when the customer sends a message and on
each of their polls (every few seconds), which is enough to trigger the delayed reply.
"""

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from assistant.service import run_chat

from .models import Conversation, Message

logger = logging.getLogger(__name__)

AGENT_SEEN_KEY = "support:agent-seen"
DHAKA = ZoneInfo("Asia/Dhaka")
MAX_HISTORY = 20


def mark_agent_active():
    """Called on every admin live-chat request: the team is at the dashboard."""
    cache.set(AGENT_SEEN_KEY, timezone.now().isoformat(), timeout=settings.SUPPORT_AGENT_ONLINE_SECONDS)


def team_online():
    return cache.get(AGENT_SEEN_KEY) is not None


def within_office_hours(now=None):
    """Sat–Thu, 9 AM – 9 PM Bangladesh time (Friday is the weekend)."""
    local = (now or datetime.now(tz=DHAKA)).astimezone(DHAKA)
    return local.weekday() != 4 and 9 <= local.hour < 21


def _pending(conv):
    """Customer messages written after the last answer (from the team or the AI)."""
    last_answer = (
        conv.messages.filter(sender__in=[Message.Sender.AGENT, Message.Sender.ASSISTANT])
        .order_by("-id").values_list("id", flat=True).first() or 0
    )
    return list(conv.messages.filter(
        sender=Message.Sender.CUSTOMER, id__gt=max(last_answer, conv.auto_replied_upto)
    ).order_by("id"))


def _history(conv):
    """Plain user/assistant turns for the AI, ending with the customer's latest message(s)."""
    turns = []
    for m in conv.messages.exclude(sender=Message.Sender.SYSTEM).order_by("-id")[:MAX_HISTORY * 2]:
        role = "user" if m.sender == Message.Sender.CUSTOMER else "assistant"
        text = f"[Haatbox team] {m.text}" if m.sender == Message.Sender.AGENT else m.text
        turns.append({"role": role, "content": text})
    turns.reverse()
    merged = []
    for t in turns:  # join back-to-back messages from the same side
        if merged and merged[-1]["role"] == t["role"]:
            merged[-1]["content"] += "\n\n" + t["content"]
        else:
            merged.append(dict(t))
    while merged and merged[0]["role"] != "user":
        merged.pop(0)
    return merged[-MAX_HISTORY:]


def _away_notice(conv):
    """Tell the customer once per 'away' stretch that the AI is answering."""
    last_agent = conv.messages.filter(sender=Message.Sender.AGENT).order_by("-id").values_list("id", flat=True).first() or 0
    if conv.messages.filter(is_auto_reply=True, id__gt=last_agent).exists():
        return None
    if within_office_hours():
        return "Our team is busy right now, so the AI assistant is answering. A person will follow up here soon."
    return ("Our team is offline (Sat–Thu, 9 AM – 9 PM), so the AI assistant is answering. "
            "A person will follow up here when the team is back.")


def maybe_auto_reply(conv):
    """Send an AI answer if the customer is waiting and the team isn't answering. → Message | None"""
    if not settings.SUPPORT_AUTO_REPLY:
        return None
    conv = Conversation.objects.select_related("user").get(pk=conv.pk)
    if conv.status != Conversation.Status.OPEN or not conv.ai_auto_reply:
        return None
    pending = _pending(conv)
    if not pending:
        return None
    if team_online():
        waited = (timezone.now() - pending[0].created_at).total_seconds()
        if waited < settings.SUPPORT_AUTO_REPLY_AFTER_SECONDS:
            return None

    # Claim these messages first, so parallel requests (two polls) can't both reply.
    last_id = pending[-1].id
    claimed = Conversation.objects.filter(pk=conv.pk, auto_replied_upto__lt=last_id).update(auto_replied_upto=last_id)
    if not claimed:
        return None

    history = _history(conv)
    if not history or history[-1]["role"] != "user":
        return None
    user = conv.user if conv.user_id else None
    try:
        result = run_chat(history, user, live_chat=True)
    except Exception:  # never break the customer's request because of the bot
        logger.exception("Live chat auto-reply failed for conversation %s", conv.pk)
        Conversation.objects.filter(pk=conv.pk, auto_replied_upto=last_id).update(auto_replied_upto=pending[0].id - 1)
        return None

    notice = _away_notice(conv)
    now = timezone.now()
    if notice:
        Message.objects.create(conversation=conv, sender=Message.Sender.SYSTEM, text=notice)
    msg = Message.objects.create(
        conversation=conv, sender=Message.Sender.ASSISTANT, text=result["reply"][:2000], is_auto_reply=True
    )
    Conversation.objects.filter(pk=conv.pk).update(last_message_at=now)
    return msg
