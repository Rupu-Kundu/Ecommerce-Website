"""Consistent, safe API error responses."""

import logging

from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger("api")


def api_exception_handler(exc, context):
    """
    - Validation / auth / permission / 404 errors: DRF's normal JSON responses.
    - Deleting something still in use: 400 with a clear message.
    - Anything unexpected: logged on the server, and the client gets a generic
      500 JSON message (never a stack trace or internal details).
    """
    response = exception_handler(exc, context)
    if response is not None:
        return response

    if isinstance(exc, ProtectedError):
        return Response(
            {"detail": "This item is still in use and cannot be deleted."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    view = context.get("view")
    logger.exception("Unhandled API error in %s", view.__class__.__name__ if view else "unknown view")
    return Response(
        {"detail": "Something went wrong on our side. Please try again."},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
