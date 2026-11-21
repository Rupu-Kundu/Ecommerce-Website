import hashlib
import secrets

from django.conf import settings
from django.db import models

MAX_MESSAGE_CHARS = 2000


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


class Conversation(models.Model):
    """
    A live chat between a customer (logged in or guest) and the Haatbox team.
    Guests prove ownership with a random token (only its hash is stored).
    """

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True,
        related_name="support_conversations",
    )
    guest_name = models.CharField(max_length=80, blank=True)
    guest_token_hash = models.CharField(max_length=64, blank=True, db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    # Did the chat start as a hand-off from the AI assistant?
    from_assistant = models.BooleanField(default=False)
    # The AI answers automatically while the team is away (admins can switch it off per chat).
    ai_auto_reply = models.BooleanField(default=True)
    # Newest customer message the AI has already auto-replied to (prevents double replies).
    auto_replied_upto = models.PositiveBigIntegerField(default=0)
    # Last message id each side has seen (for unread counts).
    customer_last_read = models.PositiveBigIntegerField(default=0)
    agent_last_read = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    last_message_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-last_message_at"]

    def __str__(self):
        return f"Chat #{self.pk} with {self.customer_label}"

    @property
    def customer_label(self):
        if self.user_id:
            return self.user.username
        return f"{self.guest_name or 'Guest'} (guest)"

    def issue_guest_token(self):
        token = secrets.token_urlsafe(32)
        self.guest_token_hash = hash_token(token)
        return token

    def guest_token_matches(self, token):
        return bool(token and self.guest_token_hash) and secrets.compare_digest(
            self.guest_token_hash, hash_token(token)
        )


class Message(models.Model):
    class Sender(models.TextChoices):
        CUSTOMER = "customer", "Customer"
        AGENT = "agent", "Haatbox team"
        ASSISTANT = "assistant", "AI assistant"  # copied from the AI chat at hand-off
        SYSTEM = "system", "System"

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.CharField(max_length=10, choices=Sender.choices)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    text = models.TextField(max_length=MAX_MESSAGE_CHARS)
    # True for answers the AI sent by itself while the team was away.
    is_auto_reply = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.sender}: {self.text[:40]}"
