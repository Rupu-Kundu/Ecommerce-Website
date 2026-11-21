"""Live chat (customer ↔ Haatbox team) tests."""

from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from products.models import Category, Product

from .auto_reply import _history
from .models import Conversation, Message

User = get_user_model()
PASSWORD = "StrongPass!2024"
START = "/api/support/conversations/"


def msgs_url(pk):
    return f"/api/support/conversations/{pk}/messages/"


def admin_msgs_url(pk):
    return f"/api/support/admin/conversations/{pk}/messages/"


class Base(APITestCase):
    def setUp(self):
        cache.clear()  # "team online" lives in the cache
        self.rupa = User.objects.create_user("rupa", "rupa@example.com", PASSWORD)
        self.bob = User.objects.create_user("bob", "bob@example.com", PASSWORD)
        self.agent = User.objects.create_user("agent", "agent@example.com", PASSWORD, is_staff=True, first_name="Nila")

    def login(self, username):
        token = self.client.post("/api/auth/login/", {"username": username, "password": PASSWORD}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def logout(self):
        self.client.credentials()

    def guest_start(self, **extra):
        res = self.client.post(START, {"message": "Hello, is anyone there?", "name": "Mina", **extra}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data


@override_settings(SUPPORT_AUTO_REPLY=False)
class CustomerTests(Base):
    def test_guest_start_and_token_access(self):
        data = self.guest_start()
        pk, token = data["conversation"]["id"], data["token"]
        self.assertEqual([m["sender"] for m in data["messages"]], ["customer"])
        conv = Conversation.objects.get(pk=pk)
        self.assertIsNone(conv.user)
        self.assertEqual(conv.guest_name, "Mina")
        self.assertNotEqual(conv.guest_token_hash, token)  # only the hash is stored
        self.assertNotIn(token, str(Conversation.objects.values_list()))

        self.assertEqual(self.client.get(msgs_url(pk)).status_code, 404)  # no token
        self.assertEqual(self.client.get(msgs_url(pk), HTTP_X_SUPPORT_TOKEN="wrong").status_code, 404)
        res = self.client.get(msgs_url(pk), HTTP_X_SUPPORT_TOKEN=token)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data["messages"]), 1)
        sent = self.client.post(msgs_url(pk), {"text": "My order is late"}, HTTP_X_SUPPORT_TOKEN=token, format="json")
        self.assertEqual(sent.status_code, 201)
        # `after` only returns newer messages
        newer = self.client.get(msgs_url(pk), {"after": res.data["messages"][0]["id"]}, HTTP_X_SUPPORT_TOKEN=token)
        self.assertEqual([m["text"] for m in newer.data["messages"]], ["My order is late"])

    def test_handoff_transcript_is_shared(self):
        data = self.guest_start(transcript=[
            {"role": "user", "content": "my mat arrived torn"},
            {"role": "assistant", "content": "Sorry! Tap Chat with our team."},
        ])
        self.assertEqual([m["sender"] for m in data["messages"]], ["customer", "assistant", "system", "customer"])
        self.assertTrue(Conversation.objects.get(pk=data["conversation"]["id"]).from_assistant)

    def test_logged_in_customer_keeps_one_open_chat(self):
        self.login("rupa")
        first = self.client.post(START, {"message": "hi"}, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertNotIn("token", first.data)
        again = self.client.post(START, {"message": "still there?"}, format="json")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(first.data["conversation"]["id"], again.data["conversation"]["id"])
        self.assertEqual(Conversation.objects.count(), 1)
        mine = self.client.get("/api/support/conversations/mine/")
        self.assertEqual(mine.data["conversation"]["id"], first.data["conversation"]["id"])
        pk = first.data["conversation"]["id"]
        self.assertEqual(self.client.get(msgs_url(pk)).status_code, 200)
        # someone else can't read it
        self.login("bob")
        self.assertEqual(self.client.get(msgs_url(pk)).status_code, 404)
        self.assertEqual(self.client.get("/api/support/conversations/mine/").status_code, 404)
        self.logout()
        self.assertEqual(self.client.get(msgs_url(pk)).status_code, 404)

    def test_validation(self):
        self.assertEqual(self.client.post(START, {"message": "   "}, format="json").status_code, 400)
        self.assertEqual(self.client.post(START, {"message": "x" * 2001}, format="json").status_code, 400)
        bad_turn = self.client.post(START, {"message": "hi", "transcript": [{"role": "system", "content": "x"}]}, format="json")
        self.assertEqual(bad_turn.status_code, 400)
        data = self.guest_start()
        res = self.client.post(msgs_url(data["conversation"]["id"]), {"text": ""}, HTTP_X_SUPPORT_TOKEN=data["token"], format="json")
        self.assertEqual(res.status_code, 400)

    def test_long_transcript_is_trimmed(self):
        turns = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"t{i}"} for i in range(30)]
        data = self.guest_start(transcript=turns)
        texts = [m["text"] for m in data["messages"] if m["sender"] in ("customer", "assistant")]
        self.assertEqual(texts[0], "t10")  # last 20 turns + the new message
        self.assertEqual(len(texts), 21)

    def test_customer_can_end_and_reopen(self):
        data = self.guest_start()
        pk, token = data["conversation"]["id"], data["token"]
        res = self.client.post(f"/api/support/conversations/{pk}/close/", HTTP_X_SUPPORT_TOKEN=token)
        self.assertEqual(res.data["status"], "closed")
        self.client.post(msgs_url(pk), {"text": "one more thing"}, HTTP_X_SUPPORT_TOKEN=token, format="json")
        self.assertEqual(Conversation.objects.get(pk=pk).status, "open")

    def test_cors_allows_token_header(self):
        self.assertIn("x-support-token", settings.CORS_ALLOW_HEADERS)


@override_settings(SUPPORT_AUTO_REPLY=False)
class AgentTests(Base):
    def test_admin_only(self):
        url = "/api/support/admin/conversations/"
        self.assertEqual(self.client.get(url).status_code, 401)
        self.login("rupa")
        self.assertEqual(self.client.get(url).status_code, 403)
        self.assertEqual(self.client.get("/api/support/admin/summary/").status_code, 403)
        data = self.client.post(START, {"message": "hi"}, format="json").data
        self.assertEqual(self.client.post(admin_msgs_url(data["conversation"]["id"]), {"text": "fake agent"}, format="json").status_code, 403)

    def test_full_conversation_with_unread_counts(self):
        data = self.guest_start()
        pk, token = data["conversation"]["id"], data["token"]
        self.client.post(msgs_url(pk), {"text": "Order #12 is late"}, HTTP_X_SUPPORT_TOKEN=token, format="json")

        self.login("agent")
        listing = self.client.get("/api/support/admin/conversations/").data
        self.assertEqual(len(listing), 1)
        self.assertEqual((listing[0]["unread"], listing[0]["customer"]["label"], listing[0]["customer"]["guest"]), (2, "Mina", True))
        self.assertEqual(listing[0]["last_message"]["text"], "Order #12 is late")
        self.assertEqual(self.client.get("/api/support/admin/summary/").data, {"open": 1, "unread": 2})

        thread = self.client.get(admin_msgs_url(pk)).data  # opening the chat marks it read
        self.assertEqual(len(thread["messages"]), 2)
        self.assertEqual(self.client.get("/api/support/admin/summary/").data["unread"], 0)

        reply = self.client.post(admin_msgs_url(pk), {"text": "Hi Mina, checking now!"}, format="json")
        self.assertEqual(reply.status_code, 201)
        self.assertEqual(reply.data["author"], "agent")

        # The customer sees the reply, labelled with the agent's first name, as unread until seen.
        self.logout()
        res = self.client.get(msgs_url(pk), {"after": thread["messages"][-1]["id"]}, HTTP_X_SUPPORT_TOKEN=token)
        self.assertEqual(res.data["messages"][0]["sender_label"], "Nila · Haatbox team")
        self.assertNotIn("author", res.data["messages"][0])  # agent usernames stay private
        self.assertEqual(res.data["unread"], 1)
        # Opening the chat later marks it read even when nothing new is fetched (already loaded).
        seen = self.client.get(msgs_url(pk), {"seen": "1", "after": reply.data["id"]}, HTTP_X_SUPPORT_TOKEN=token)
        self.assertEqual(seen.data["messages"], [])
        self.assertEqual(seen.data["unread"], 0)

    def test_close_and_filter(self):
        data = self.guest_start()
        pk = data["conversation"]["id"]
        self.login("agent")
        res = self.client.patch(f"/api/support/admin/conversations/{pk}/", {"status": "closed"}, format="json")
        self.assertEqual(res.data["status"], "closed")
        self.assertEqual(Message.objects.filter(conversation_id=pk, sender="system").count(), 1)
        self.assertEqual(self.client.get("/api/support/admin/conversations/").data, [])
        self.assertEqual(len(self.client.get("/api/support/admin/conversations/", {"status": "closed"}).data), 1)
        self.assertEqual(len(self.client.get("/api/support/admin/conversations/", {"status": "all"}).data), 1)
        bad = self.client.patch(f"/api/support/admin/conversations/{pk}/", {"status": "deleted"}, format="json")
        self.assertEqual(bad.status_code, 400)
        # replying reopens it
        self.client.post(admin_msgs_url(pk), {"text": "Following up"}, format="json")
        self.assertEqual(Conversation.objects.get(pk=pk).status, "open")


@override_settings(SUPPORT_AUTO_REPLY=True, SUPPORT_AUTO_REPLY_AFTER_SECONDS=120, ANTHROPIC_API_KEY="")
class AutoReplyTests(Base):
    def setUp(self):
        super().setUp()
        cat = Category.objects.create(name="Sports & Outdoors", slug="sports-outdoors")
        self.mat = Product.objects.create(name="Yoga Mat 6mm", category=cat, price=Decimal("1850"), stock_quantity=5)

    def poll(self, pk, token):
        return self.client.get(msgs_url(pk), HTTP_X_SUPPORT_TOKEN=token).data

    def say(self, pk, token, text):
        return self.client.post(msgs_url(pk), {"text": text}, HTTP_X_SUPPORT_TOKEN=token, format="json")

    def test_team_away_ai_answers_at_once(self):
        res = self.client.post(START, {"message": "do you have a yoga mat?"}, format="json")
        senders = [m["sender"] for m in res.data["messages"]]
        self.assertEqual(senders, ["customer", "system", "assistant"])
        self.assertFalse(res.data["team_online"])
        self.assertTrue(res.data["auto_reply"])
        bot = res.data["messages"][-1]
        self.assertTrue(bot["is_auto_reply"])
        self.assertEqual(bot["sender_label"], "AI assistant (auto-reply)")
        self.assertIn(f"/products/{self.mat.pk}", bot["text"])  # built-in bot (no API key)
        self.assertIn("AI assistant is answering", res.data["messages"][1]["text"])

        pk, token = res.data["conversation"]["id"], res.data["token"]
        self.poll(pk, token)
        self.poll(pk, token)
        self.assertEqual(Message.objects.filter(is_auto_reply=True).count(), 1)  # never twice
        self.say(pk, token, "how much is delivery?")
        self.assertEqual(Message.objects.filter(is_auto_reply=True).count(), 2)
        self.assertIn("৳120", Message.objects.filter(is_auto_reply=True).last().text)
        self.assertEqual(Message.objects.filter(sender="system").count(), 1)  # notice only once

    def test_team_online_gets_time_to_answer_first(self):
        self.assertEqual(self.client.get("/api/support/status/").data, {"team_online": False, "auto_reply": True})
        self.login("agent")
        self.client.get("/api/support/admin/summary/")  # admin at the dashboard
        self.logout()
        self.assertTrue(self.client.get("/api/support/status/").data["team_online"])
        res = self.client.post(START, {"message": "hello?"}, format="json")
        pk, token = res.data["conversation"]["id"], res.data["token"]
        self.assertTrue(res.data["team_online"])
        self.assertEqual([m["sender"] for m in res.data["messages"]], ["customer"])
        self.poll(pk, token)
        self.assertFalse(Message.objects.filter(is_auto_reply=True).exists())
        # 2+ minutes pass without a human answer → the next poll triggers the AI
        Message.objects.filter(conversation_id=pk).update(created_at=timezone.now() - timedelta(seconds=130))
        self.poll(pk, token)
        self.assertEqual(Message.objects.filter(is_auto_reply=True).count(), 1)
        notice = Message.objects.filter(conversation_id=pk, sender="system").last().text
        self.assertTrue("busy" in notice or "offline" in notice)  # wording depends on the clock

    def test_agent_answer_cancels_auto_reply(self):
        self.login("agent")
        self.client.get("/api/support/admin/summary/")
        self.logout()
        res = self.client.post(START, {"message": "hello?"}, format="json")
        pk, token = res.data["conversation"]["id"], res.data["token"]
        self.login("agent")
        self.client.post(admin_msgs_url(pk), {"text": "Hi! How can I help?"}, format="json")
        self.logout()
        Message.objects.filter(conversation_id=pk).update(created_at=timezone.now() - timedelta(seconds=300))
        self.poll(pk, token)
        self.assertFalse(Message.objects.filter(is_auto_reply=True).exists())

    def test_switched_off_per_chat_closed_or_globally(self):
        res = self.client.post(START, {"message": "first"}, format="json")
        pk, token = res.data["conversation"]["id"], res.data["token"]
        self.login("agent")
        off = self.client.patch(f"/api/support/admin/conversations/{pk}/", {"ai_auto_reply": False}, format="json")
        self.assertFalse(off.data["ai_auto_reply"])
        self.assertEqual(self.client.patch(f"/api/support/admin/conversations/{pk}/", {}, format="json").status_code, 400)
        self.logout()
        cache.clear()  # team away again
        before = Message.objects.filter(is_auto_reply=True).count()
        self.say(pk, token, "anyone?")
        self.assertEqual(Message.objects.filter(is_auto_reply=True).count(), before)
        self.assertFalse(self.poll(pk, token)["auto_reply"])
        with override_settings(SUPPORT_AUTO_REPLY=False):
            other = self.client.post(START, {"message": "hi"}, format="json")
            self.assertEqual([m["sender"] for m in other.data["messages"]], ["customer"])

    def test_history_for_the_ai(self):
        res = self.client.post(START, {"message": "hi", "transcript": [
            {"role": "user", "content": "mat torn"}, {"role": "assistant", "content": "Sorry!"},
        ]}, format="json")
        conv = Conversation.objects.get(pk=res.data["conversation"]["id"])
        Message.objects.create(conversation=conv, sender="agent", author=self.agent, text="Checking")
        Message.objects.create(conversation=conv, sender="customer", text="ok")
        Message.objects.create(conversation=conv, sender="customer", text="thanks")
        turns = _history(conv)
        roles = [t["role"] for t in turns]
        self.assertEqual(roles[0], "user")
        self.assertTrue(all(a != b for a, b in zip(roles, roles[1:])))  # alternating
        self.assertEqual(turns[-1], {"role": "user", "content": "ok\n\nthanks"})
        self.assertIn("[Haatbox team] Checking", turns[-2]["content"])

    def test_bot_failure_does_not_break_the_chat(self):
        with mock.patch("support.auto_reply.run_chat", side_effect=RuntimeError("boom")), \
                self.assertLogs("support.auto_reply", level="ERROR"):
            res = self.client.post(START, {"message": "hi"}, format="json")
        self.assertEqual(res.status_code, 201)
        pk, token = res.data["conversation"]["id"], res.data["token"]
        self.poll(pk, token)  # tried again on the next poll
        self.assertEqual(Message.objects.filter(is_auto_reply=True).count(), 1)
