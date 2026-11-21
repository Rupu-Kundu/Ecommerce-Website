from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .service import AssistantUnavailable, assistant_mode, run_chat

MAX_TURNS = 20
MAX_CHARS = 2000


class ChatMessageSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant"])
    content = serializers.CharField(max_length=MAX_CHARS, trim_whitespace=True)


class ChatRequestSerializer(serializers.Serializer):
    messages = ChatMessageSerializer(many=True, allow_empty=False)

    def validate_messages(self, value):
        value = value[-MAX_TURNS:]  # keep the most recent turns only
        while value and value[0]["role"] != "user":
            value = value[1:]  # the conversation must start with the customer
        if not value or value[-1]["role"] != "user":
            raise serializers.ValidationError("The last message must be from the customer.")
        return value


class ChatConfigView(APIView):
    """
    GET /api/chat/config/ → {enabled, mode}. The chat always answers: mode "ai" (Claude,
    ANTHROPIC_API_KEY set) or "basic" (built-in auto-reply bot).
    """

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"enabled": True, "mode": assistant_mode()})


class ChatView(APIView):
    """
    POST /api/chat/ {messages: [{role, content}, ...]} → {reply, cart_updated, handoff, mode}
    Open to guests (product questions); order and cart tools work only for the
    logged-in customer's own data. Rate-limited per user / IP (scope "chat").
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "chat"

    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        history = [dict(m) for m in serializer.validated_data["messages"]]
        try:
            result = run_chat(history, request.user)
        except AssistantUnavailable as exc:
            return Response({"detail": str(exc), "enabled": exc.status != 503}, status=exc.status)
        return Response(result)
