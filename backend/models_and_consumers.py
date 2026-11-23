"""
Synore Production Reference Architecture — Django ORM Models, RBAC & Django Channels Consumers
Matches the live relational schema & WebSocket event protocol running in server/db.ts and server/ws.ts.
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.db import models
from django.contrib.auth.models import AbstractUser
from rest_framework import permissions


class User(AbstractUser):
    title = models.CharField(max_length=120, default="Team Member")
    department = models.CharField(max_length=120, default="Operations")
    avatar_url = models.URLField(blank=True)
    status = models.CharField(max_length=80, default="Available")
    email_verified = models.BooleanField(default=False)


class Workspace(models.Model):
    name = models.CharField(max_length=160)
    slug = models.SlugField(unique=True)
    workspace_type = models.CharField(max_length=80, default="Technology Startup")
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="owned_workspaces")
    plan = models.CharField(max_length=20, default="FREE")
    storage_quota_bytes = models.BigIntegerField(default=5368709120)
    created_at = models.DateTimeField(auto_now_add=True)


class WorkspaceMembership(models.Model):
    ROLE_CHOICES = [
        ("Owner", "Owner"),
        ("Administrator", "Administrator"),
        ("Manager", "Manager"),
        ("Member", "Member"),
        ("Guest", "Guest"),
    ]
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="Member")
    permissions_json = models.JSONField(default=dict)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("workspace", "user")


class HasWorkspacePermission(permissions.BasePermission):
    """Enforces multi-tenant workspace isolation & RBAC on DRF endpoints."""
    required_permission = None

    def has_permission(self, request, view):
        workspace_id = view.kwargs.get("workspace_id")
        if not request.user.is_authenticated or not workspace_id:
            return False
        membership = WorkspaceMembership.objects.filter(
            workspace_id=workspace_id, user=request.user
        ).first()
        if not membership:
            return False
        if not self.required_permission:
            return True
        return bool(membership.permissions_json.get(self.required_permission, False))


class WorkspaceConsumer(AsyncWebsocketConsumer):
    """Django Channels ASGI Consumer for real-time Chat, Typing, Presence & Kanban Sync."""

    async def connect(self):
        self.workspace_id = self.scope["url_route"]["kwargs"]["workspace_id"]
        self.user = self.scope["user"]
        is_member = await self.verify_membership()
        if not is_member:
            await self.close(code=4003)
            return

        self.room_group_name = f"workspace_{self.workspace_id}"
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        payload = json.loads(text_data)
        event_type = payload.get("type")
        if event_type in ("typing:start", "typing:stop", "message:created", "task:updated"):
            await self.channel_layer.group_send(
                self.room_group_name,
                {"type": "workspace.event", "event": event_type, "payload": payload},
            )

    async def workspace_event(self, event):
        await self.send(text_data=json.dumps(event))

    @database_sync_to_async
    def verify_membership(self):
        if not self.user or not self.user.is_authenticated:
            return False
        return WorkspaceMembership.objects.filter(
            workspace_id=self.workspace_id, user=self.user
        ).exists()
