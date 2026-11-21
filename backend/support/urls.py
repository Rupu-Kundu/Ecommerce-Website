from django.urls import path

from . import views

urlpatterns = [
    path("status/", views.SupportStatusView.as_view(), name="support-status"),
    path("conversations/", views.StartConversationView.as_view(), name="support-start"),
    path("conversations/mine/", views.MyConversationView.as_view(), name="support-mine"),
    path("conversations/<int:pk>/messages/", views.CustomerMessagesView.as_view(), name="support-messages"),
    path("conversations/<int:pk>/close/", views.CustomerCloseView.as_view(), name="support-close"),
    path("admin/conversations/", views.AdminConversationListView.as_view(), name="support-admin-list"),
    path("admin/summary/", views.AdminSummaryView.as_view(), name="support-admin-summary"),
    path("admin/conversations/<int:pk>/", views.AdminConversationView.as_view(), name="support-admin-detail"),
    path("admin/conversations/<int:pk>/messages/", views.AdminMessagesView.as_view(), name="support-admin-messages"),
]
