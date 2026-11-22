"""
Built-in auto-reply bot: answers without any API key (and when the Claude API is down).

It understands simple English, Bangla and Banglish questions with keyword rules and
answers from the real database through the SAME tools the AI uses (so availability,
stock, ownership and cart rules are identical). It is deliberately simple: anything
it doesn't understand is passed to the team ("Chat with our team").
"""

import json
import re

from django.conf import settings

from .tools import STORE_LOCATION, build_tools

# Bangla letters (not ৳ or Bangla digits, which also appear in English messages)
BANGLA = re.compile(r"[\u0980-\u09E5]")
BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
MAX_SHOWN = 5

# Word (or word start, for Bangla endings like জুতার) → English search word.
SEARCH_WORDS = {
    "স্নিকার": "sneakers", "বই": "book",
    "মোবাইল": "smartphone", "ফোন": "smartphone", "ল্যাপটপ": "laptop", "ইয়ারফোন": "earbuds",
    "ইয়ারবাড": "earbuds", "স্পিকার": "speaker", "চার্জার": "charger", "কেটলি": "kettle", "মগ": "mug", "প্যান": "pan",
    "ল্যাম্প": "lamp", "বাতি": "lamp", "বোতল": "bottle", "ফুটবল": "football", "বল": "football", "ডাম্বেল": "dumbbell",
    "ম্যাট": "mat", "যোগ": "yoga", "জ্যাকেট": "jacket", "হুডি": "hoodie", "জিন্স": "jeans", "টিশার্ট": "t-shirt",
    "টি-শার্ট": "t-shirt", "শার্ট": "shirt", "বেল্ট": "belt",
    "সানস্ক্রিন": "sunscreen", "সিরাম": "serum", "ড্রায়ার": "dryer", "কাটিং": "cutting",
    "phone": "smartphone",
    "mobile": "smartphone", "earphone": "earbuds",
    "earphones": "earbuds", "tshirt": "t-shirt", "tee": "t-shirt", "mugs": "mug",
    "boi": "book", "books": "book",
}
CATEGORY_WORDS = {
    "জুতা": "shoes", "জুতো": "shoes", "স্যান্ডেল": "shoes", "shoe": "shoes", "shoes": "shoes", "footwear": "shoes",
    "joota": "shoes", "juta": "shoes", "sandal": "shoes", "sandals": "shoes", "loafers": "shoes",
    "ঘড়ি": "watches", "watch": "watches", "watches": "watches", "ghori": "watches",
    "হেডফোন": "earbuds-audio", "headphone": "earbuds-audio", "headphones": "earbuds-audio", "audio": "earbuds-audio",
    "airbuds": "earbuds-audio", "airpods": "earbuds-audio",
    "পারফিউম": "perfumes", "সুগন্ধি": "perfumes", "আতর": "perfumes", "perfume": "perfumes", "perfumes": "perfumes",
    "attar": "perfumes", "fragrance": "perfumes", "itor": "perfumes",
    "বিড়াল": "cat-supplies", "বিড়ালের": "cat-supplies", "cat": "cat-supplies", "cats": "cat-supplies", "kitten": "cat-supplies", "biral": "cat-supplies",
    "শিশু": "baby-products", "বাচ্চা": "baby-products", "বেবি": "baby-products", "baby": "baby-products", "babies": "baby-products",
    "ওষুধ": "medical-health", "মেডিকেল": "medical-health", "স্বাস্থ্য": "medical-health", "medical": "medical-health",
    "health": "medical-health",
    "সাজসজ্জা": "home-decor", "ডেকোর": "home-decor", "decor": "home-decor", "decoration": "home-decor",
    "খেলা": "sports-outdoors", "স্পোর্টস": "sports-outdoors", "ব্যায়াম": "sports-outdoors", "sports": "sports-outdoors",
    "sport": "sports-outdoors", "fitness": "sports-outdoors", "gym": "sports-outdoors", "khela": "sports-outdoors",
    "কাপড়": "clothing", "পোশাক": "clothing", "জামা": "clothing", "clothes": "clothing", "clothing": "clothing",
    "fashion": "clothing", "kapor": "clothing",
    "রান্না": "home-kitchen", "কিচেন": "home-kitchen", "kitchen": "home-kitchen", "home": "home-kitchen",
    "ইলেকট্রনিক্স": "electronics", "গ্যাজেট": "electronics", "electronics": "electronics", "gadget": "electronics",
    "gadgets": "electronics",
    "বিউটি": "beauty-personal-care", "প্রসাধনী": "beauty-personal-care", "সৌন্দর্য": "beauty-personal-care",
    "beauty": "beauty-personal-care", "skincare": "beauty-personal-care", "cosmetics": "beauty-personal-care",
}
STOPWORDS = set("""
show me find i want need a an the some any do you have is are there for of to please buy looking look under below
less than within max upto up price prices cheap cheapest best good what which with my in on and or how much does
cost tk taka bdt ideas idea gift gifts recommend suggest products product item items available stock sell sale get
can could would like hi hello hey also more other something anything thing things new latest show
দেখাও দেখান আছে কি কী চাই আমার আমি একটা একটি কিছু জন্য দাম কত টাকা টাকার মধ্যে নিচে কম ভালো সস্তা দিন দাও
খুঁজে প্রোডাক্ট পণ্য জিনিস এর র এ আর কেমন উপহার গিফট
""".split())

INTENTS = [
    ("human", r"\b(human|person|agent|representative|staff|someone real|real person|talk to (a|someone))\b|মানুষ|এজেন্ট|প্রতিনিধি|কারো সাথে কথা|লাইভ চ্যাট"),
    ("cancel", r"\b(cancel\w*)\b|ক্যানসেল|বাতিল|cancel kor"),
    ("add_cart", r"\badd\b.*\bcart\b|\bcart\b.*\badd\b|কার্টে|কার্ট এ|cart e"),
    ("orders", r"\b(my orders?|order status|track|where is my|order kothay|amar order)\b|অর্ডার|ট্র্যাক"),
    ("returns", r"\b(return|refund|exchange|replace|damaged|broken|torn|defective|wrong item)\b|ফেরত|রিটার্ন|রিফান্ড|বদল|ভাঙা|ছেঁড়া|নষ্ট"),
    ("cod", r"\b(cash on delivery|cod|pay (on|after) delivery|cash)\b|ক্যাশ অন ডেলিভারি|হাতে হাতে|ডেলিভারির (সময়|পর) (টাকা|পেমেন্ট)|নগদ টাকা"),
    ("shipping", r"\b(deliver|delivery|shipping|ship|courier|how long|arrive)\w*|ডেলিভারি|শিপিং|পৌঁছা|কতদিন|কত দিন"),
    ("payment", r"\b(pay|payment|bkash|nagad|card|visa|mastercard|cod|cash on delivery)\b|পেমেন্ট|বিকাশ|নগদ|কার্ড|ক্যাশ অন"),
    ("store", r"\b(address|location|showroom|visit|where are you|your (store|shop)|physical (store|shop))\b|ঠিকানা|দোকান|শোরুম|কোথায় অবস্থিত|অফিস"),
    ("categories", r"\b(categor\w*|what do you sell|what can i buy)\b|ক্যাটাগরি|কি কি পাওয়া|কী কী পাওয়া|কি কি আছে"),
    ("thanks", r"\b(thanks|thank you|thx)\b|ধন্যবাদ|থ্যাংক"),
    ("greeting", r"^\W*(hi|hello|hey|salam|assalamu ?alaikum|good (morning|evening|afternoon)|হাই|হ্যালো|সালাম|আসসালামু)\b"),
]


def _tk(value):
    return f"৳{int(float(value)):,}"


class _Reply:
    def __init__(self, text, user, live_chat):
        self.bn = bool(BANGLA.search(text))
        self.user = user
        self.logged_in = bool(user and user.is_authenticated)
        self.live_chat = live_chat
        self.tools, self.state = build_tools(user)
        self.tools = {t.name: t for t in self.tools}

    def t(self, bn, en):
        return bn if self.bn else en

    def call(self, name, **args):
        return json.loads(self.tools[name].call(args))

    def team_line(self):
        if self.live_chat:
            return self.t("আমাদের টিমের একজন মানুষ ফিরে এসেই এখানে উত্তর দেবেন।",
                          "A person from our team will reply here as soon as they're back.")
        self.state["handoff"] = True
        return self.t("মানুষের সাথে কথা বলতে নিচের **Chat with our team** বাটনে চাপ দিন।",
                      "To talk to a person, tap **Chat with our team** below.")

    def login_line(self):
        return self.t("আগে [লগ ইন](/login) করুন, তারপর আবার জিজ্ঞেস করুন।", "Please [log in](/login) first, then ask me again.")

    def product_lines(self, products):
        return "\n".join(
            f"- [{p['name']}]({p['link']}) — **{_tk(p['price_bdt'])}**"
            + ("" if p["in_stock"] else self.t(" (স্টক নেই)", " (out of stock)"))
            for p in products[:MAX_SHOWN]
        )


def _words(text):
    return [w for w in re.split(r"[\s,.;:!?।()\"'৳/]+", text.lower()) if w]


def _max_price(text):
    t = text.translate(BN_DIGITS).lower()
    if not re.search(r"under|below|less than|within|max|upto|up to|budget|মধ্যে|নিচে|কমে|এর কম|ভিতরে|ভেতরে|এর ভেতর", t):
        return 0
    numbers = [int(n.replace(",", "")) for n in re.findall(r"\d[\d,]*", t)]
    numbers = [n for n in numbers if n >= 50]
    return max(numbers) if numbers else 0


def _search_terms(text):
    """→ (search words, category slug or '')."""
    words, category = [], ""
    for w in _words(text.translate(BN_DIGITS)):
        if w.isdigit() or w in STOPWORDS:
            continue
        if w in CATEGORY_WORDS:
            category = CATEGORY_WORDS[w]
            continue
        bn_cat = next((slug for key, slug in CATEGORY_WORDS.items() if BANGLA.match(key) and w.startswith(key)), None)
        if bn_cat:
            category = bn_cat
            continue
        if w in SEARCH_WORDS:
            words.append(SEARCH_WORDS[w])
            continue
        bn_word = next((eng for key, eng in sorted(SEARCH_WORDS.items(), key=lambda kv: -len(kv[0]))
                        if BANGLA.match(key) and w.startswith(key)), None)
        if bn_word:
            words.append(bn_word)
        elif not BANGLA.search(w) and len(w) > 2:
            words.append(w.rstrip("s") if len(w) > 4 and w.endswith("s") else w)
    return list(dict.fromkeys(words)), category


def _find_products(r, text):
    words, category = _search_terms(text)
    max_price = _max_price(text)
    cheap = bool(re.search(r"cheap|lowest|সস্তা|কম দাম", text.lower()))
    sort = "price_low" if (cheap or max_price) else "relevance"
    found = r.call("search_products", query=" ".join(words), category=category, max_price_bdt=max_price, sort=sort)
    if not found["products"] and len(words) > 1:  # try each word on its own
        for w in sorted(words, key=len, reverse=True):
            found = r.call("search_products", query=w, category=category, max_price_bdt=max_price, sort=sort)
            if found["products"]:
                break
    return found["products"], words, category, max_price


# ---------------- intent handlers ----------------

def _greeting(r, text):
    extra = r.t("নিজের অর্ডার দেখা আর কার্টে যোগ করাও পারি।", "I can also check your orders and add items to your cart.") if r.logged_in else ""
    return r.t(
        f"হ্যালো! 👋 আমি Haatbox-এর অটো-রিপ্লাই সহকারী। পণ্য খুঁজতে, দাম জানাতে আর ডেলিভারি ও পেমেন্টের প্রশ্নের উত্তর দিতে পারি। {extra}\n\nযেমন লিখুন: \"২০০০ টাকার মধ্যে গিফট\", \"জুতা দেখাও\", \"ডেলিভারি চার্জ কত?\"",
        f"Hi! 👋 I'm Haatbox's auto-reply assistant. I can find products, tell you prices and answer delivery and payment questions. {extra}\n\nTry: \"gift ideas under ৳2,000\", \"show me running shoes\", \"how much is delivery?\"",
    ).replace("  ", " ")


def _thanks(r, text):
    return r.t("আপনাকেও ধন্যবাদ! আর কিছু লাগলে জানাবেন। 😊", "You're welcome! Let me know if you need anything else. 😊")


def _human(r, text):
    if r.live_chat:
        return r.team_line()
    r.state["handoff"] = True
    return r.t("অবশ্যই! নিচের **Chat with our team** বাটনে চাপ দিন — আমাদের টিম (শনি–বৃহস্পতি, সকাল ৯টা–রাত ৯টা) উত্তর দেবে।",
               "Of course! Tap **Chat with our team** below — our team (Sat–Thu, 9 AM–9 PM) will reply.")


def _shipping(r, text):
    lines = []
    for m in r.call("get_store_info")["shipping"]:
        free = r.t(f", {_tk(m['free_over'])} বা বেশি অর্ডারে ফ্রি", f", free on orders of {_tk(m['free_over'])} or more") if m["free_over"] else ""
        lines.append(f"- **{m['label']}** ({m['description']}): {_tk(m['cost'])}{free}")
    return r.t("আমরা সারা বাংলাদেশে ডেলিভারি দিই:\n\n", "We deliver all over Bangladesh:\n\n") + "\n".join(lines)


def _payment(r, text):
    methods = [m for m in r.call("get_store_info")["payment_methods"] if m["available"]]
    names = ", ".join(m["method"] for m in methods) or "Card, bKash, Nagad"
    return r.t(
        f"পেমেন্ট করতে পারবেন: **{names}**। অনলাইন পেমেন্ট হয় Stripe/bKash/Nagad-এর নিরাপদ পেজে, আর ক্যাশ অন ডেলিভারিতে রাইডারকে নগদ দিন। আমরা কখনো আপনার PIN বা OTP চাই না।",
        f"You can pay with **{names}**. Online payments happen on the secure Stripe/bKash/Nagad page; with cash on delivery you pay the rider. We never ask for your PIN or OTP.",
    )


def _cod(r, text):
    info = next((m for m in r.call("get_store_info")["payment_methods"] if m["method"] == "Cash on delivery"), None)
    if not info or not info["available"]:
        return r.t("এই মুহূর্তে ক্যাশ অন ডেলিভারি চালু নেই। Card, bKash বা Nagad দিয়ে পেমেন্ট করতে পারবেন।",
                   "Cash on delivery isn't available right now. You can pay with Card, bKash or Nagad.")
    limit = _tk(settings.COD_MAX_AMOUNT)
    return r.t(
        f"হ্যাঁ! **ক্যাশ অন ডেলিভারি** আছে — চেকআউটে \"COD\" বেছে নিন, অর্ডার আসলে রাইডারকে নগদ টাকা দিন। {limit} পর্যন্ত অর্ডারে প্রযোজ্য।",
        f"Yes! **Cash on delivery** is available — choose \"COD\" at checkout and pay the rider in cash when your order arrives (orders up to {limit}).",
    )


def _cancel(r, text):
    return r.t(
        "**ক্যাশ অন ডেলিভারি** অর্ডার শিপ হওয়ার আগ পর্যন্ত নিজেই বাতিল করতে পারবেন: [My orders](/orders) → অর্ডার খুলুন → **Cancel order**। কোনো টাকা দিতে হবে না।\n\n"
        "অনলাইনে পেমেন্ট করা অর্ডার বাতিল বা রিফান্ডের জন্য আমাদের টিম সাহায্য করবে। ",
        "**Cash-on-delivery** orders can be cancelled by you until they ship: [My orders](/orders) → open the order → **Cancel order**. Nothing to pay.\n\n"
        "For orders already paid online (Card, bKash, Nagad), our team will help with the cancellation and refund. ",
    ) + r.team_line()


def _returns(r, text):
    return r.t(
        "ডেলিভারির ৭ দিনের মধ্যে অব্যবহৃত পণ্য আসল প্যাকেটে ফেরত দেওয়া যায়। ভাঙা বা ভুল পণ্য এলে আমাদের টিম দ্রুত সমাধান করবে।\n\n",
        "Unused items in their original packaging can be returned within 7 days of delivery. If something arrived damaged or wrong, our team will sort it out quickly.\n\n",
    ) + r.team_line()


def _store(r, text):
    s = STORE_LOCATION
    return r.t(
        f"আমাদের দোকান: **{s['name']}**, {s['address']} ({s['hours']})। ম্যাপ ও দিকনির্দেশনা: [দোকান দেখুন]({s['map_link']})",
        f"Our store: **{s['name']}**, {s['address']} ({s['hours']}). Map and directions: [Find our store]({s['map_link']})",
    )


def _categories(r, text):
    cats = r.call("list_categories")
    lines = "\n".join(f"- [{c['name']}](/products?category={c['slug']}) ({c['products']})" for c in cats if c["products"])
    return r.t("আমাদের ক্যাটাগরি:\n\n", "Here's what we sell:\n\n") + lines


def _orders(r, text):
    if not r.logged_in:
        return r.t("আপনার অর্ডার দেখতে আগে [লগ ইন](/login) করুন।", "Please [log in](/login) to see your orders.")
    orders = r.call("get_my_orders", limit=3)
    if not orders:
        return r.t("আপনার এখনো কোনো অর্ডার নেই। [কেনাকাটা শুরু করুন](/products)!", "You don't have any orders yet. [Start shopping](/products)!")
    lines = "\n".join(f"- [Order #{o['order_id']}]({o['link']}) — **{o['status']}**, {_tk(o['total_bdt'])}, {o['date']}" for o in orders)
    return r.t("আপনার সাম্প্রতিক অর্ডার:\n\n", "Your recent orders:\n\n") + lines + r.t(
        "\n\nসব অর্ডার: [My orders](/orders)", "\n\nAll orders: [My orders](/orders)")


def _add_cart(r, text):
    if not r.logged_in:
        return r.t("কার্টে যোগ করতে আগে [লগ ইন](/login) করুন।", "Please [log in](/login) so I can add things to your cart.")
    clean = text.translate(BN_DIGITS)
    # "add 2 yoga mats", "x2", "২টা" — but not the 6 in "6mm"
    qty = re.search(r"(?:^|\s)(?:x\s*)?(\d{1,2})\s*(?:x|টা|টি|pcs|pieces?)?(?=\s|$)", clean)
    quantity = int(qty.group(1)) if qty and 0 < int(qty.group(1)) < 100 else 1
    query_text = re.sub(r"\b(add|to|my|the|cart|into|in)\b|কার্টে|কার্ট|যোগ|করো|করুন|দাও|দিন|এড", " ", clean, flags=re.I)
    products, words, _, _ = _find_products(r, query_text)
    if not products:
        return r.t("কোন পণ্যটা যোগ করব বুঝতে পারিনি। নাম লিখুন, যেমন: \"Yoga Mat কার্টে যোগ করো\"।",
                   "Which product should I add? Try: \"add Yoga Mat 6mm to my cart\".")
    exact = [p for p in products if all(w in p["name"].lower() for w in words)] if words else []
    if len(products) > 1 and len(exact) != 1:
        return r.t("কোনটা যোগ করব? পুরো নাম লিখুন:\n\n", "Which one should I add? Reply with the full name:\n\n") + r.product_lines(products)
    product = (exact or products)[0]
    result = r.call("add_to_cart", product_id=product["id"], quantity=quantity)
    if "error" in result:
        return r.t(f"যোগ করা গেল না: {result['error']}", f"Couldn't add it: {result['error']}")
    return r.t(
        f"✅ কার্টে যোগ করেছি: {quantity} × [{product['name']}]({product['link']})। এখন কার্টে {result['items_in_cart']}টি পণ্য। [কার্ট দেখুন](/cart)",
        f"✅ Added {quantity} × [{product['name']}]({product['link']}) to your cart ({result['items_in_cart']} items now). [View cart](/cart)",
    )


def _products(r, text):
    products, words, category, max_price = _find_products(r, text)
    if not products and max_price and (words or category):
        # Nothing in budget: show the closest matches without the price limit.
        nearby = r.call("search_products", query=" ".join(words), category=category, sort="price_low")["products"]
        if not nearby and len(words) > 1:
            for w in sorted(words, key=len, reverse=True):
                nearby = r.call("search_products", query=w, category=category, sort="price_low")["products"]
                if nearby:
                    break
        if nearby:
            return r.t(f"{_tk(max_price)}-এর মধ্যে পাইনি, তবে কাছাকাছি এগুলো আছে:\n\n",
                       f"Nothing under {_tk(max_price)}, but these are the closest:\n\n") + r.product_lines(nearby)
    if not products:
        return r.t(
            "দুঃখিত, এমন কিছু খুঁজে পাইনি। অন্যভাবে লিখে দেখুন (যেমন \"ঘড়ি\", \"running shoes\", \"২০০০ টাকার মধ্যে গিফট\") অথবা [সব পণ্য দেখুন](/products)।\n\n",
            "Sorry, I couldn't find that. Try other words (e.g. \"watch\", \"running shoes\", \"gift under ৳2,000\") or [browse all products](/products).\n\n",
        ) + r.team_line()
    budget = r.t(f" ({_tk(max_price)}-এর মধ্যে)", f" (under {_tk(max_price)})") if max_price else ""
    head = r.t(f"এগুলো দেখুন{budget}:\n\n", f"Here's what I found{budget}:\n\n")
    tail = ""
    if r.logged_in:
        tail = r.t("\n\nকার্টে নিতে লিখুন: \"<নাম> কার্টে যোগ করো\"।", "\n\nTo buy, say \"add <name> to my cart\".")
    return head + r.product_lines(products) + tail


HANDLERS = {
    "human": _human, "cancel": _cancel, "add_cart": _add_cart, "orders": _orders, "returns": _returns, "shipping": _shipping,
    "payment": _payment, "cod": _cod, "store": _store, "categories": _categories, "thanks": _thanks, "greeting": _greeting,
}


def detect_intent(text):
    low = text.lower()
    for name, pattern in INTENTS:
        if re.search(pattern, low):
            # A greeting that also asks for something ("hi, show me shoes") is a product question.
            if name == "greeting" and len(_words(low)) > 4:
                continue
            return name
    return "products"


def basic_reply(history, user, live_chat=False):
    """history ends with the customer's message(s). → {"reply", "cart_updated", "handoff"}"""
    text = history[-1]["content"]
    r = _Reply(text, user, live_chat)
    reply = HANDLERS.get(detect_intent(text), _products)(r, text)
    return {"reply": reply.strip(), "cart_updated": r.state["cart_updated"], "handoff": bool(r.state["handoff"] and not live_chat)}
