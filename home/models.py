from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
import re


class Location(models.Model):
    """Model representing a location on the game map."""

    # Coordinate system (0,0 = center of map)
    coord_x = models.IntegerField(
        default=0, help_text="X coordinate on map (0 = center)"
    )
    coord_y = models.IntegerField(
        default=0, help_text="Y coordinate on map (0 = center)"
    )

    # User-assigned number (visible to user)
    number = models.IntegerField(
        unique=True,
        validators=[MinValueValidator(1), MaxValueValidator(999)],
        null=True,
        blank=True,
        help_text="User-assigned location number",
    )

    name = models.CharField(
        max_length=200, blank=True, help_text="Name of the location"
    )
    picture = models.ImageField(
        upload_to="locations/", blank=True, null=True, help_text="Location picture"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["coord_y", "coord_x"]
        unique_together = [["coord_x", "coord_y"]]

    def __str__(self):
        if self.number and self.name:
            return (
                f"Location {self.number}: {self.name} ({self.coord_x}, {self.coord_y})"
            )
        elif self.number:
            return f"Location {self.number} ({self.coord_x}, {self.coord_y})"
        return f"Location at ({self.coord_x}, {self.coord_y})"

    @property
    def has_data(self):
        """Check if location has any data filled in."""
        return bool(self.picture or self.name or self.note_set.exists())

    @property
    def is_empty(self):
        """Check if location is completely empty (no picture, name, or notes)."""
        return not self.has_data

    def get_surrounding_coords(self):
        """Get coordinates for all 8 surrounding locations."""
        return [
            (self.coord_x - 1, self.coord_y - 1),  # Top-left
            (self.coord_x, self.coord_y - 1),  # Top
            (self.coord_x + 1, self.coord_y - 1),  # Top-right
            (self.coord_x - 1, self.coord_y),  # Left
            (self.coord_x + 1, self.coord_y),  # Right
            (self.coord_x - 1, self.coord_y + 1),  # Bottom-left
            (self.coord_x, self.coord_y + 1),  # Bottom
            (self.coord_x + 1, self.coord_y + 1),  # Bottom-right
        ]


class Note(models.Model):
    """Model representing a note attached to a location."""

    location = models.ForeignKey(
        Location, on_delete=models.CASCADE, related_name="note_set"
    )
    text = models.TextField(help_text="Note content")
    author = models.CharField(
        max_length=100, default="Anonymous", help_text="Note author"
    )
    completed = models.BooleanField(default=False, help_text="Is this task completed?")

    # Optional: Link note to a decision edge as a requirement
    assigned_edge_id = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Edge ID this note is assigned to as a requirement",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]  # Newest first

    def __str__(self):
        return f"Note by {self.author} at {self.location}"

    @property
    def is_requirement(self):
        """Check if this note is assigned to an edge as a requirement."""
        return bool(self.assigned_edge_id)

    def get_linked_text(self):
        """
        Convert #number and (name) patterns to HTML links.
        #123 -> link to location with number 123
        (Forest Path) -> link to location named "Forest Path"
        """
        text = self.text

        # Pattern for #number
        def replace_number(match):
            number = match.group(1)
            try:
                location = Location.objects.get(number=int(number))
                return f'<a href="/location/{location.id}/" class="note-link">#{number}</a>'
            except Location.DoesNotExist:
                return match.group(0)  # Return original if not found

        # Pattern for (name)
        def replace_name(match):
            name = match.group(1)
            try:
                location = Location.objects.get(name__iexact=name)
                return (
                    f'<a href="/location/{location.id}/" class="note-link">({name})</a>'
                )
            except Location.DoesNotExist:
                return match.group(0)  # Return original if not found

        # Replace #number patterns
        text = re.sub(r"#(\d+)", replace_number, text)
        # Replace (name) patterns
        text = re.sub(r"\(([^)]+)\)", replace_name, text)

        return text


class JournalNote(models.Model):
    """Model representing a journal note (not tied to a specific location)."""

    text = models.TextField(help_text="Journal note content")
    author = models.CharField(
        max_length=100, default="Anonymous", help_text="Note author"
    )
    completed = models.BooleanField(default=False, help_text="Is this task completed?")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]  # Newest first

    def __str__(self):
        return f"Journal by {self.author} at {self.created_at}"

    def get_linked_text(self):
        """
        Convert #number and (name) patterns to HTML links.
        #123 -> link to location with number 123
        (Forest Path) -> link to location named "Forest Path"
        """
        text = self.text

        # Pattern for #number
        def replace_number(match):
            number = match.group(1)
            try:
                location = Location.objects.get(number=int(number))
                return f'<a href="/location/{location.id}/" class="note-link">#{number}</a>'
            except Location.DoesNotExist:
                return match.group(0)  # Return original if not found

        # Pattern for (name)
        def replace_name(match):
            name = match.group(1)
            try:
                location = Location.objects.get(name__iexact=name)
                return (
                    f'<a href="/location/{location.id}/" class="note-link">({name})</a>'
                )
            except Location.DoesNotExist:
                return match.group(0)  # Return original if not found

        # Replace #number patterns
        text = re.sub(r"#(\d+)", replace_number, text)
        # Replace (name) patterns
        text = re.sub(r"\(([^)]+)\)", replace_name, text)

        return text


class DecisionNode(models.Model):
    """Model representing a node in the decision tree graph."""

    location = models.ForeignKey(
        Location, on_delete=models.CASCADE, related_name="decision_nodes"
    )
    node_id = models.CharField(
        max_length=100, help_text="Unique node ID for React Flow"
    )
    node_type = models.CharField(
        max_length=50, default="outcomeNode", help_text="Type of node (outcomeNode)"
    )
    text = models.TextField(blank=True, help_text="Node text content")
    cost = models.TextField(blank=True, help_text="Cost or resource requirement")
    completed = models.BooleanField(default=False, help_text="Is this node completed?")
    position_x = models.FloatField(help_text="X position in the canvas")
    position_y = models.FloatField(help_text="Y position in the canvas")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        unique_together = [["location", "node_id"]]

    def __str__(self):
        return f"Node {self.node_id} at {self.location}"


class DecisionEdge(models.Model):
    """Model representing an edge (connection) in the decision tree graph."""

    location = models.ForeignKey(
        Location, on_delete=models.CASCADE, related_name="decision_edges"
    )
    edge_id = models.CharField(
        max_length=100, help_text="Unique edge ID for React Flow"
    )
    source = models.CharField(max_length=100, help_text="Source node ID")
    target = models.CharField(max_length=100, help_text="Target node ID")
    text = models.TextField(blank=True, help_text="Edge label text")
    completed = models.BooleanField(default=False, help_text="Is this edge completed?")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        unique_together = [["location", "edge_id"]]

    def __str__(self):
        return f"Edge {self.edge_id}: {self.source} -> {self.target}"
