"""Shipping methods offered at checkout. Costs are in BDT and decided on the server only."""

from decimal import Decimal

SHIPPING_METHODS = {
    "standard": {
        "label": "Standard delivery",
        "description": "3–5 business days",
        "cost": Decimal("120.00"),
        "free_over": Decimal("5000.00"),  # free when subtotal >= this amount
    },
    "express": {
        "label": "Express delivery",
        "description": "1–2 business days",
        "cost": Decimal("300.00"),
        "free_over": None,
    },
}

DEFAULT_SHIPPING_METHOD = "standard"


def shipping_cost(method_code, subtotal):
    method = SHIPPING_METHODS[method_code]
    free_over = method["free_over"]
    if free_over is not None and subtotal >= free_over:
        return Decimal("0.00")
    return method["cost"]


def shipping_methods_payload():
    return [
        {
            "code": code,
            "label": m["label"],
            "description": m["description"],
            "cost": f"{m['cost']:.2f}",
            "free_over": f"{m['free_over']:.2f}" if m["free_over"] is not None else None,
        }
        for code, m in SHIPPING_METHODS.items()
    ]
