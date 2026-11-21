"""
Live chat with the Haatbox team.

Customers (logged in or guests) open a conversation — usually handed off from the
AI assistant — and both sides poll for new messages every few seconds. Polling keeps
the setup simple (no WebSocket server); the poll endpoints have their own, higher
rate limit so they don't use up the normal API quota.
"""

from django.conf import settings
from django.db import transaction
from django.db.models import Count, F, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .auto_reply import mark_agent_active, maybe_auto_reply, team_online
from .models import Conversation, Message
from .serializers import (
    AdminConversationSerializer,
    AdminConversationUpdateSerializer,
    AdminMessageSerializer,
    ConversationSerializer,
    MessageSerializer,
    StartConversationSerializer,
    TextSerializer,
)

TOKEN_HEADER = "X-Support-Token"
MAX_PAGE = 200


class SupportThrottleMixin:
    """Reading (polling) and sending have separate per-user/IP limits."""

    def get_throttles(self):
        self.throttle_scope = "support_poll" if self.request.method == "GET" else "support_send"
        return [ScopedRateThrottle()]


class AgentPresenceMixin:
    """Admin live-chat requests mean the team is at the dashboard (AI waits before auto-replying)."""

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)  # authentication + IsAdmin first
        mark_agent_active()


def _customer_state(conv):
    return {
        "team_online": team_online(),
        "auto_reply": conv.ai_auto_reply and settings.SUPPORT_AUTO_REPLY,
    }


def _after(request):
    try:
        return max(0, int(request.query_params.get("after", 0)))
    except ValueError:
        return 0


def _add(conversation, sender, text, author=None):
    msg = Message.objects.create(conversation=conversation, sender=sender, text=text, author=author)
    Conversation.objects.filter(pk=conversation.pk).update(last_message_at=timezone.now())
    return msg


def customer_conversation(request, pk):
    """The conversation if this visitor owns it (their account or their guest token); else 404."""
    conv = Conversation.objects.filter(pk=pk).first()
    if conv is None:
        raise NotFound("Conversation not found.")
    owner = conv.user_id and request.user.is_authenticated and conv.user_id == request.user.id
    if not (owner or conv.guest_token_matches(request.headers.get(TOKEN_HEADER, ""))):
        raise NotFound("Conversation not found.")
    return conv


def _unread_for_customer(conv):
    return conv.messages.filter(sender=Message.Sender.AGENT, id__gt=conv.customer_last_read).count()


# ---------------- Customer ----------------


class SupportStatusView(SupportThrottleMixin, APIView):
    """GET /api/support/status/ → {team_online, auto_reply} (shown before a chat starts)."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"team_online": team_online(), "auto_reply": settings.SUPPORT_AUTO_REPLY})


class StartConversationView(SupportThrottleMixin, APIView):
    """
    POST /api/support/conversations/ {message, name?, transcript?}
    A logged-in customer keeps one open conversation (a new start adds to it).
    Guests get a `token` back that they must send as the X-Support-Token header.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        s = StartConversationSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        user = request.user if request.user.is_authenticated else None
        token = None

        with transaction.atomic():
            conv = None
            if user:
                conv = Conversation.objects.filter(user=user, status=Conversation.Status.OPEN).first()
            created = conv is None
            if created:
                conv = Conversation(user=user, guest_name="" if user else data.get("name", ""))
                conv.from_assistant = bool(data.get("transcript"))
                if not user:
                    token = conv.issue_guest_token()
                conv.save()
            transcript = data.get("transcript") or []
            if transcript:
                for turn in transcript:
                    sender = Message.Sender.CUSTOMER if turn["role"] == "user" else Message.Sender.ASSISTANT
                    _add(conv, sender, turn["content"])
                _add(conv, Message.Sender.SYSTEM, "Connected to the Haatbox team. The chat with the AI assistant above is shared with them.")
            _add(conv, Message.Sender.CUSTOMER, data["message"], author=user)

        maybe_auto_reply(conv)  # team away → the AI answers right away
        conv.refresh_from_db()
        body = {
            "conversation": ConversationSerializer(conv).data,
            "messages": MessageSerializer(conv.messages.select_related("author"), many=True).data,
        }
        body.update(_customer_state(conv))
        if token:
            body["token"] = token
        return Response(body, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class MyConversationView(APIView):
    """GET /api/support/conversations/mine/ — the logged-in customer's open conversation (or 404)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        conv = Conversation.objects.filter(user=request.user, status=Conversation.Status.OPEN).first()
        if conv is None:
            raise NotFound("No open conversation.")
        return Response({"conversation": ConversationSerializer(conv).data, "unread": _unread_for_customer(conv)})


class CustomerMessagesView(SupportThrottleMixin, APIView):
    """
    GET  /api/support/conversations/<id>/messages/?after=<id>&seen=1 — new messages
         (seen=1 marks the team's replies as read; the widget sends it while open)
    POST /api/support/conversations/<id>/messages/ {text} — send a message (reopens a closed chat)
    """

    permission_classes = [AllowAny]

    def get(self, request, pk):
        conv = customer_conversation(request, pk)
        maybe_auto_reply(conv)  # e.g. the team was online but hasn't answered in time
        messages = list(conv.messages.select_related("author").filter(id__gt=_after(request))[:MAX_PAGE])
        if request.query_params.get("seen") == "1":
            # The chat is on screen: everything up to the newest message has been seen
            # (even messages fetched earlier by a background poll).
            newest = conv.messages.order_by("-id").values_list("id", flat=True).first() or 0
            Conversation.objects.filter(pk=conv.pk, customer_last_read__lt=newest).update(customer_last_read=newest)
            conv.refresh_from_db()
        return Response({
            "conversation": ConversationSerializer(conv).data,
            "messages": MessageSerializer(messages, many=True).data,
            "unread": _unread_for_customer(conv),
            **_customer_state(conv),
        })

    def post(self, request, pk):
        conv = customer_conversation(request, pk)
        s = TextSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            if conv.status == Conversation.Status.CLOSED:
                conv.status = Conversation.Status.OPEN
                conv.save(update_fields=["status"])
            msg = _add(conv, Message.Sender.CUSTOMER, s.validated_data["text"],
                       author=request.user if request.user.is_authenticated else None)
        maybe_auto_reply(conv)  # the reply is picked up by the next poll
        return Response(MessageSerializer(msg).data, status=status.HTTP_201_CREATED)


class CustomerCloseView(SupportThrottleMixin, APIView):
    """POST /api/support/conversations/<id>/close/ — the customer ends the chat."""

    permission_classes = [AllowAny]

    def post(self, request, pk):
        conv = customer_conversation(request, pk)
        if conv.status == Conversation.Status.OPEN:
            conv.status = Conversation.Status.CLOSED
            conv.save(update_fields=["status"])
            _add(conv, Message.Sender.SYSTEM, "The customer ended the chat.")
        return Response(ConversationSerializer(conv).data)


# ---------------- Admin (Haatbox team) ----------------


def _with_unread(qs):
    return qs.annotate(unread=Count(
        "messages",
        filter=Q(messages__sender=Message.Sender.CUSTOMER, messages__id__gt=F("agent_last_read")),
    ))


class AdminConversationListView(AgentPresenceMixin, SupportThrottleMixin, APIView):
    """GET /api/support/admin/conversations/?status=open|closed|all — newest activity first."""

    permission_classes = [IsAdmin]

    def get(self, request):
        qs = Conversation.objects.select_related("user")
        wanted = request.query_params.get("status", "open")
        if wanted in Conversation.Status.values:
            qs = qs.filter(status=wanted)
        qs = _with_unread(qs)[:100]
        return Response(AdminConversationSerializer(qs, many=True).data)


class AdminSummaryView(AgentPresenceMixin, SupportThrottleMixin, APIView):
    """GET /api/support/admin/summary/ → {open, unread} for the admin menu badge."""

    permission_classes = [IsAdmin]

    def get(self, request):
        open_qs = _with_unread(Conversation.objects.filter(status=Conversation.Status.OPEN))
        return Response({
            "open": open_qs.count(),
            "unread": sum(c.unread for c in open_qs),
        })


class AdminConversationView(AgentPresenceMixin, SupportThrottleMixin, APIView):
    """PATCH /api/support/admin/conversations/<id>/ {status?, ai_auto_reply?} — close/reopen, AI on/off."""

    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        conv = get_object_or_404(Conversation, pk=pk)
        s = AdminConversationUpdateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if "ai_auto_reply" in s.validated_data and s.validated_data["ai_auto_reply"] != conv.ai_auto_reply:
            conv.ai_auto_reply = s.validated_data["ai_auto_reply"]
            conv.save(update_fields=["ai_auto_reply"])
        new = s.validated_data.get("status", conv.status)
        if new != conv.status:
            conv.status = new
            conv.save(update_fields=["status"])
            _add(conv, Message.Sender.SYSTEM,
                 "The Haatbox team closed this chat." if new == Conversation.Status.CLOSED else "The chat was reopened.")
        conv = _with_unread(Conversation.objects.select_related("user").filter(pk=pk)).get()
        return Response(AdminConversationSerializer(conv).data)


class AdminMessagesView(AgentPresenceMixin, SupportThrottleMixin, APIView):
    """
    GET  /api/support/admin/conversations/<id>/messages/?after=<id> — marks the customer's messages read
    POST /api/support/admin/conversations/<id>/messages/ {text} — reply (reopens a closed chat)
    """

    permission_classes = [IsAdmin]

    def get(self, request, pk):
        conv = get_object_or_404(Conversation.objects.select_related("user"), pk=pk)
        messages = list(conv.messages.select_related("author").filter(id__gt=_after(request))[:MAX_PAGE])
        if messages:
            Conversation.objects.filter(pk=conv.pk, agent_last_read__lt=messages[-1].id).update(
                agent_last_read=messages[-1].id
            )
        conv = _with_unread(Conversation.objects.select_related("user").filter(pk=pk)).get()
        return Response({
            "conversation": AdminConversationSerializer(conv).data,
            "messages": AdminMessageSerializer(messages, many=True).data,
        })

    def post(self, request, pk):
        conv = get_object_or_404(Conversation, pk=pk)
        s = TextSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            if conv.status == Conversation.Status.CLOSED:
                conv.status = Conversation.Status.OPEN
                conv.save(update_fields=["status"])
            msg = _add(conv, Message.Sender.AGENT, s.validated_data["text"], author=request.user)
            # Replying means the agent has read everything up to now.
            Conversation.objects.filter(pk=conv.pk).update(agent_last_read=msg.id)
        return Response(AdminMessageSerializer(msg).data, status=status.HTTP_201_CREATED)
