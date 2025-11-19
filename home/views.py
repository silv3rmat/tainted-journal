from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.http import JsonResponse, HttpResponseRedirect
from django.urls import reverse
from django.db.models import Q
from django.views.decorators.http import require_http_methods
import json
from .models import Location, Note, JournalNote, DecisionNode, DecisionEdge
from .forms import LocationForm, NoteForm, JournalNoteForm


def ensure_surrounding_placeholders(location):
    """
    Create placeholder locations around a filled location if they don't exist.
    This makes the map expand dynamically as locations are added.
    """
    if not location.has_data:
        return

    surrounding_coords = location.get_surrounding_coords()
    for x, y in surrounding_coords:
        Location.objects.get_or_create(coord_x=x, coord_y=y)


def get_visible_locations():
    """
    Get all locations that should be visible on the map.
    This includes all locations with data and placeholder locations
    adjacent to filled locations.
    """
    all_locations = Location.objects.all()

    if not all_locations.exists():
        # If no locations exist, create the center location at (0,0)
        center, _ = Location.objects.get_or_create(coord_x=0, coord_y=0)
        return [center]

    return list(all_locations)


def home_view(request):
    """Render the home landing page with dynamic coordinate-based map."""
    locations = get_visible_locations()

    # Calculate bounds of the map
    if locations:
        min_x = min(loc.coord_x for loc in locations)
        max_x = max(loc.coord_x for loc in locations)
        min_y = min(loc.coord_y for loc in locations)
        max_y = max(loc.coord_y for loc in locations)
    else:
        min_x = max_x = min_y = max_y = 0

    # Create a dictionary for quick lookup
    location_map = {(loc.coord_x, loc.coord_y): loc for loc in locations}

    # Prepare location data for template
    locations_data = []
    for loc in locations:
        # Get the most recent note timestamp for this location
        latest_note = loc.note_set.order_by("-created_at").first()
        latest_note_time = latest_note.created_at.isoformat() if latest_note else ""

        locations_data.append(
            {
                "id": loc.id,
                "coord_x": loc.coord_x,
                "coord_y": loc.coord_y,
                "number": loc.number,
                "name": loc.name,
                "picture": loc.picture,
                "has_data": loc.has_data,
                "is_empty": loc.is_empty,
                "updated_at": loc.updated_at,
                "latest_note_at": latest_note_time,
            }
        )

    # Get journal notes and location notes
    journal_notes = JournalNote.objects.all()
    location_notes = Note.objects.select_related("location").all()
    journal_form = JournalNoteForm()

    context = {
        "locations": locations_data,
        "min_x": min_x,
        "max_x": max_x,
        "min_y": min_y,
        "max_y": max_y,
        "journal_notes": journal_notes,
        "location_notes": location_notes,
        "journal_form": journal_form,
    }

    return render(request, "home/home.html", context)


def location_detail_api(request, location_id):
    """API endpoint for location details."""
    location = get_object_or_404(Location, id=location_id)

    if request.method == "GET":
        # Get all notes for this location
        notes = location.note_set.all()
        notes_data = []
        for note in notes:
            notes_data.append(
                {
                    "id": note.id,
                    "text": note.text,
                    "author": note.author,
                    "completed": note.completed,
                    "assigned_edge_id": note.assigned_edge_id,
                    "is_requirement": note.is_requirement,
                    "created_at": note.created_at.isoformat(),
                    "updated_at": note.updated_at.isoformat(),
                }
            )

        # Get decision graph nodes
        nodes = location.decision_nodes.all()
        nodes_data = []
        for node in nodes:
            nodes_data.append(
                {
                    "id": node.node_id,
                    "type": node.node_type,
                    "position": {"x": node.position_x, "y": node.position_y},
                    "data": {
                        "text": node.text,
                        "cost": node.cost,
                        "completed": node.completed,
                    },
                }
            )

        # Get decision graph edges
        edges = location.decision_edges.all()
        edges_data = []
        for edge in edges:
            edges_data.append(
                {
                    "id": edge.edge_id,
                    "source": edge.source,
                    "target": edge.target,
                    "data": {
                        "text": edge.text,
                        "completed": edge.completed,
                    },
                }
            )

        return JsonResponse(
            {
                "location": {
                    "id": location.id,
                    "coord_x": location.coord_x,
                    "coord_y": location.coord_y,
                    "number": location.number,
                    "name": location.name,
                    "picture": location.picture.url if location.picture else None,
                    "has_data": location.has_data,
                    "is_empty": location.is_empty,
                },
                "notes": notes_data,
                "graph": {
                    "nodes": nodes_data,
                    "edges": edges_data,
                },
            }
        )

    return JsonResponse({"error": "Method not allowed"}, status=405)


def location_detail_view(request, location_id):
    """View and edit location details by coordinate-based ID."""
    location = get_object_or_404(Location, id=location_id)

    # Track if this was previously empty
    was_empty = location.is_empty

    # Initialize forms (will be overwritten if needed in POST)
    form = LocationForm(instance=location)
    note_form = NoteForm()

    if request.method == "POST":
        if "update_location" in request.POST:
            form = LocationForm(request.POST, request.FILES, instance=location)
            if form.is_valid():
                location = form.save()

                # If this location now has data and was previously empty,
                # create surrounding placeholders
                if location.has_data and was_empty:
                    ensure_surrounding_placeholders(location)

                messages.success(request, "Location updated successfully!")
                return redirect("home:location_detail", location_id=location.id)

        elif "add_note" in request.POST:
            note_form = NoteForm(request.POST)
            if note_form.is_valid():
                note = note_form.save(commit=False)
                note.location = location
                # Get author from cookie, fallback to "Anonymous"
                note.author = request.COOKIES.get("tainted_grail_user", "Anonymous")
                note.save()

                # Check if we should create surrounding placeholders
                if location.has_data and was_empty:
                    ensure_surrounding_placeholders(location)

                messages.success(request, "Note added successfully!")
                return redirect("home:location_detail", location_id=location.id)

        elif "delete_picture" in request.POST:
            if location.picture:
                location.picture.delete()
                location.save()
                messages.success(request, "Picture deleted successfully!")
                return redirect("home:location_detail", location_id=location.id)

        elif "clear_location" in request.POST:
            # Clear all location data (picture, name, number) but keep notes
            if location.picture:
                location.picture.delete()
            location.picture = None
            location.name = ""
            location.number = None
            location.save()
            messages.success(request, "Location cleared successfully!")
            return redirect("home:location_detail", location_id=location.id)

        elif "toggle_note" in request.POST:
            note_id = request.POST.get("note_id")
            try:
                note = Note.objects.get(id=note_id, location=location)
                note.completed = not note.completed
                note.save()
                return redirect("home:location_detail", location_id=location.id)
            except Note.DoesNotExist:
                messages.error(request, "Note not found!")

        elif "delete_note" in request.POST:
            note_id = request.POST.get("note_id")
            try:
                note = Note.objects.get(id=note_id, location=location)
                note.delete()
                messages.success(request, "Note deleted successfully!")
                return redirect("home:location_detail", location_id=location.id)
            except Note.DoesNotExist:
                messages.error(request, "Note not found!")
                return redirect("home:location_detail", location_id=location.id)

        elif "edit_note" in request.POST:
            note_id = request.POST.get("note_id")
            note_text = request.POST.get("note_text", "").strip()
            try:
                note = Note.objects.get(id=note_id, location=location)
                if note_text:
                    note.text = note_text
                    note.save()
                    messages.success(request, "Note updated successfully!")
                else:
                    messages.error(request, "Note text cannot be empty!")
                return redirect("home:location_detail", location_id=location.id)
            except Note.DoesNotExist:
                messages.error(request, "Note not found!")
                return redirect("home:location_detail", location_id=location.id)

    # Get all notes for this location
    notes = location.note_set.all()

    context = {
        "location": location,
        "form": form,
        "note_form": note_form,
        "notes": notes,
    }

    return render(request, "home/location_detail.html", context)


def location_detail_view_react(request, location_id):
    """React-based location detail view."""
    location = get_object_or_404(Location, id=location_id)
    return render(
        request,
        "home/location_detail_react.html",
        {"location": location, "location_id": location_id},
    )


def map_updates_api(request):
    """API endpoint for real-time map updates."""
    locations = Location.objects.all()

    locations_data = []
    for loc in locations:
        # Get the most recent note timestamp for this location
        latest_note = loc.note_set.order_by("-created_at").first()
        latest_note_time = latest_note.created_at.isoformat() if latest_note else None

        locations_data.append(
            {
                "id": loc.id,
                "coord_x": loc.coord_x,
                "coord_y": loc.coord_y,
                "number": loc.number,
                "name": loc.name,
                "picture": loc.picture.url if loc.picture else None,
                "has_data": loc.has_data,
                "is_empty": loc.is_empty,
                "updated_at": loc.updated_at.isoformat(),
                "latest_note_at": latest_note_time,
            }
        )

    return JsonResponse(
        {
            "locations": locations_data,
            "timestamp": Location.objects.latest("updated_at").updated_at.isoformat()
            if Location.objects.exists()
            else None,
        }
    )


def journal_note_action(request):
    """Handle journal note CRUD operations."""
    if request.method != "POST":
        return redirect("home:home")

    if "add_journal_note" in request.POST:
        form = JournalNoteForm(request.POST)
        if form.is_valid():
            note = form.save(commit=False)
            note.author = request.COOKIES.get("tainted_grail_user", "Anonymous")
            note.save()
        return HttpResponseRedirect(reverse("home:home") + "?journal=open")

    elif "toggle_journal_note" in request.POST:
        note_id = request.POST.get("note_id")
        try:
            note = JournalNote.objects.get(id=note_id)
            note.completed = not note.completed
            note.save()
        except JournalNote.DoesNotExist:
            pass
        return HttpResponseRedirect(reverse("home:home") + "?journal=open")

    elif "edit_journal_note" in request.POST:
        note_id = request.POST.get("note_id")
        note_text = request.POST.get("note_text", "").strip()
        try:
            note = JournalNote.objects.get(id=note_id)
            if note_text:
                note.text = note_text
                note.save()
        except JournalNote.DoesNotExist:
            pass
        return HttpResponseRedirect(reverse("home:home") + "?journal=open")

    elif "delete_journal_note" in request.POST:
        note_id = request.POST.get("note_id")
        try:
            note = JournalNote.objects.get(id=note_id)
            note.delete()
        except JournalNote.DoesNotExist:
            pass
        return HttpResponseRedirect(reverse("home:home") + "?journal=open")

    return redirect("home:home")


def journal_updates_api(request):
    """API endpoint for real-time journal updates (includes both journal notes and location notes)."""
    journal_notes = JournalNote.objects.all()
    location_notes = Note.objects.all()

    journal_notes_data = []
    for note in journal_notes:
        journal_notes_data.append(
            {
                "id": note.id,
                "type": "journal",
                "text": note.text,
                "author": note.author,
                "completed": note.completed,
                "created_at": note.created_at.isoformat(),
                "updated_at": note.updated_at.isoformat(),
            }
        )

    location_notes_data = []
    for note in location_notes:
        location_notes_data.append(
            {
                "id": note.id,
                "type": "location",
                "location_id": note.location.id,
                "location_number": note.location.number,
                "location_name": note.location.name,
                "text": note.text,
                "author": note.author,
                "completed": note.completed,
                "assigned_edge_id": note.assigned_edge_id,
                "is_requirement": note.is_requirement,
                "created_at": note.created_at.isoformat(),
                "updated_at": note.updated_at.isoformat(),
            }
        )

    # Get the most recent timestamp from either note type
    latest_journal = (
        JournalNote.objects.latest("updated_at").updated_at
        if JournalNote.objects.exists()
        else None
    )
    latest_location = (
        Note.objects.latest("updated_at").updated_at if Note.objects.exists() else None
    )

    timestamp = None
    if latest_journal and latest_location:
        timestamp = max(latest_journal, latest_location).isoformat()
    elif latest_journal:
        timestamp = latest_journal.isoformat()
    elif latest_location:
        timestamp = latest_location.isoformat()

    return JsonResponse(
        {
            "journal_notes": journal_notes_data,
            "location_notes": location_notes_data,
            "timestamp": timestamp,
        }
    )


@require_http_methods(["POST"])
def save_graph(request, location_id):
    """API endpoint to save decision graph nodes and edges."""
    location = get_object_or_404(Location, id=location_id)

    try:
        data = json.loads(request.body)
        nodes_data = data.get("nodes", [])
        edges_data = data.get("edges", [])

        # Clear existing graph data for this location
        location.decision_nodes.all().delete()
        location.decision_edges.all().delete()

        # Save nodes (excluding root node)
        for node_data in nodes_data:
            if node_data.get("id") != "root":  # Skip root node
                DecisionNode.objects.create(
                    location=location,
                    node_id=node_data["id"],
                    node_type=node_data.get("type", "outcomeNode"),
                    text=node_data.get("data", {}).get("text", ""),
                    cost=node_data.get("data", {}).get("cost", ""),
                    completed=node_data.get("data", {}).get("completed", False),
                    position_x=node_data.get("position", {}).get("x", 0),
                    position_y=node_data.get("position", {}).get("y", 0),
                )

        # Save edges
        for edge_data in edges_data:
            DecisionEdge.objects.create(
                location=location,
                edge_id=edge_data["id"],
                source=edge_data["source"],
                target=edge_data["target"],
                text=edge_data.get("data", {}).get("text", ""),
                completed=edge_data.get("data", {}).get("completed", False),
            )

        return JsonResponse({"success": True, "message": "Graph saved successfully"})

    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=400)


@require_http_methods(["POST"])
def assign_note_to_edge(request, note_id):
    """API endpoint to assign a note to an edge as a requirement."""
    note = get_object_or_404(Note, id=note_id)

    try:
        data = json.loads(request.body)
        edge_id = data.get("edge_id")

        if edge_id:
            # Assign note to edge
            note.assigned_edge_id = edge_id
            note.save()
            return JsonResponse({"success": True, "message": "Note assigned to edge"})
        else:
            # Unassign note from edge
            note.assigned_edge_id = None
            note.save()
            return JsonResponse(
                {"success": True, "message": "Note unassigned from edge"}
            )

    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=400)
