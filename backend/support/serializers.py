from rest_framework import serializers

from .models import MAX_MESSAGE_CHARS, Conversation, Message

MAX_TRANSCRIPT = 20


class MessageSerializer(serializers.ModelSerializer):
    """What the customer sees. Agents are shown as "Haatbox team" (with their first name if set)."""

    sender_label = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ("id", "sender", "sender_label", "is_auto_reply", "text", "created_at")
        read_only_fields = fields

    def get_sender_label(self, obj):
        if obj.sender == Message.Sender.AGENT:
            name = obj.author.first_name if obj.author else ""
            return f"{name} · Haatbox team" if name else "Haatbox team"
        if obj.is_auto_reply:
            return "AI assistant (auto-reply)"
        return obj.get_sender_display()


class AdminMessageSerializer(MessageSerializer):
    author = serializers.CharField(source="author.username", default=None, read_only=True)

    class Meta(MessageSerializer.Meta):
        fields = (*MessageSerializer.Meta.fields, "author")
        read_only_fields = fields


class ConversationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conversation
        fields = ("id", "status", "from_assistant", "ai_auto_reply", "created_at", "last_message_at")
        read_only_fields = fields


class AdminConversationSerializer(serializers.ModelSerializer):
    customer = serializers.SerializerMethodField()
    unread = serializers.IntegerField(read_only=True, default=0)
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = (
            "id", "status", "from_assistant", "ai_auto_reply", "customer", "unread", "last_message",
            "created_at", "last_message_at",
        )
        read_only_fields = fields

    def get_customer(self, obj):
        if obj.user_id:
            return {"label": obj.user.username, "email": obj.user.email, "guest": False}
        return {"label": obj.guest_name or "Guest", "email": None, "guest": True}

    def get_last_message(self, obj):
        last = obj.messages.order_by("-id").first()
        return {"sender": last.sender, "text": last.text[:120]} if last else None


class TextSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=MAX_MESSAGE_CHARS, trim_whitespace=True)


class TranscriptTurnSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant"])
    content = serializers.CharField(max_length=MAX_MESSAGE_CHARS, trim_whitespace=True)


class StartConversationSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=MAX_MESSAGE_CHARS, trim_whitespace=True)
    name = serializers.CharField(max_length=80, required=False, allow_blank=True, trim_whitespace=True)
    # Recent AI-assistant chat, so the team can see what was already discussed.
    transcript = TranscriptTurnSerializer(many=True, required=False)

    def validate_transcript(self, value):
        return value[-MAX_TRANSCRIPT:]


class AdminConversationUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Conversation.Status.choices, required=False)
    ai_auto_reply = serializers.BooleanField(required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Send status and/or ai_auto_reply.")
        return attrs
