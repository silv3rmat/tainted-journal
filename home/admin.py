from django.contrib import admin
from .models import Location, Note, JournalNote, DecisionNode, DecisionEdge


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = [
        "number",
        "coord_x",
        "coord_y",
        "name",
        "has_data",
        "created_at",
        "updated_at",
    ]
    list_filter = ["created_at", "updated_at", "coord_x", "coord_y"]
    search_fields = ["number", "name"]
    ordering = ["coord_y", "coord_x"]


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "location",
        "author",
        "completed",
        "assigned_edge_id",
        "is_requirement",
        "created_at",
        "text_preview",
    ]
    list_filter = ["completed", "created_at", "author"]
    search_fields = ["text", "author", "assigned_edge_id"]
    ordering = ["-created_at"]

    def text_preview(self, obj):
        return obj.text[:50] + "..." if len(obj.text) > 50 else obj.text

    text_preview.short_description = "Text Preview"


@admin.register(JournalNote)
class JournalNoteAdmin(admin.ModelAdmin):
    """Admin interface for journal notes."""

    list_display = ["text_preview", "author", "completed", "created_at"]
    list_filter = ["completed", "author", "created_at"]
    search_fields = ["text", "author"]
    ordering = ["-created_at"]

    def text_preview(self, obj):
        """Show a preview of the note text."""
        return obj.text[:50] + "..." if len(obj.text) > 50 else obj.text

    text_preview.short_description = "Text"


@admin.register(DecisionNode)
class DecisionNodeAdmin(admin.ModelAdmin):
    """Admin interface for decision nodes."""

    list_display = [
        "node_id",
        "location",
        "node_type",
        "text_preview",
        "cost",
        "completed",
        "position_x",
        "position_y",
        "created_at",
    ]
    list_filter = ["completed", "node_type", "created_at"]
    search_fields = ["node_id", "text", "cost", "location__name"]
    ordering = ["location", "created_at"]

    def text_preview(self, obj):
        """Show a preview of the node text."""
        return obj.text[:30] + "..." if len(obj.text) > 30 else obj.text or "(empty)"

    text_preview.short_description = "Text"


@admin.register(DecisionEdge)
class DecisionEdgeAdmin(admin.ModelAdmin):
    """Admin interface for decision edges."""

    list_display = [
        "edge_id",
        "location",
        "source",
        "target",
        "text_preview",
        "completed",
        "created_at",
    ]
    list_filter = ["completed", "created_at"]
    search_fields = ["edge_id", "text", "source", "target", "location__name"]
    ordering = ["location", "created_at"]

    def text_preview(self, obj):
        """Show a preview of the edge text."""
        return obj.text[:30] + "..." if len(obj.text) > 30 else obj.text or "(empty)"

    text_preview.short_description = "Text"
