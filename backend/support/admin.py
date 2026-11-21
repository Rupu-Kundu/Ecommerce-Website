from django.contrib import admin

from .models import Conversation, Message


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    fields = ("sender", "author", "text", "created_at")
    readonly_fields = ("created_at",)


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "customer_label", "status", "from_assistant", "last_message_at")
    list_filter = ("status", "from_assistant")
    search_fields = ("user__username", "guest_name")
    readonly_fields = ("guest_token_hash", "created_at", "last_message_at")
    inlines = [MessageInline]
