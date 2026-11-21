class PaymentError(Exception):
    """A payment could not be started or verified; the message is safe to show to the customer."""
