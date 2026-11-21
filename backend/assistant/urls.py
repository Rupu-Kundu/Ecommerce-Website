from django.urls import path

from .views import ChatConfigView, ChatView

urlpatterns = [
    path("", ChatView.as_view(), name="chat"),
    path("config/", ChatConfigView.as_view(), name="chat-config"),
]
