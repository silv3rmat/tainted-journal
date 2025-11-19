from django.urls import path
from . import views

app_name = "home"

urlpatterns = [
    path("", views.home_view, name="home"),
    path("home/", views.home_view, name="home"),
    path(
        "location/<int:location_id>/",
        views.location_detail_view_react,
        name="location_detail",
    ),
    path(
        "location/<int:location_id>/action/",
        views.location_detail_view,
        name="location_detail_action",
    ),
    path("api/map-updates/", views.map_updates_api, name="map_updates_api"),
    path("api/journal-updates/", views.journal_updates_api, name="journal_updates_api"),
    path(
        "api/location/<int:location_id>/",
        views.location_detail_api,
        name="location_detail_api",
    ),
    path(
        "api/location/<int:location_id>/save-graph/",
        views.save_graph,
        name="save_graph",
    ),
    path(
        "api/note/<int:note_id>/assign-edge/",
        views.assign_note_to_edge,
        name="assign_note_to_edge",
    ),
    path("journal/action/", views.journal_note_action, name="journal_note_action"),
]
