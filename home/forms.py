from django import forms
from .models import Location, Note, JournalNote


class LocationForm(forms.ModelForm):
    """Form for creating/editing location details."""

    class Meta:
        model = Location
        fields = ["number", "name", "picture"]
        widgets = {
            "number": forms.NumberInput(
                attrs={
                    "class": "form-input",
                    "placeholder": "Assign a number to this location...",
                    "min": "1",
                    "max": "999",
                }
            ),
            "name": forms.TextInput(
                attrs={"class": "form-input", "placeholder": "Enter location name..."}
            ),
            "picture": forms.FileInput(
                attrs={"class": "form-file-input", "accept": "image/*"}
            ),
        }
        labels = {
            "number": "Location Number (visible to you)",
            "name": "Location Name",
            "picture": "Picture",
        }


class NoteForm(forms.ModelForm):
    """Form for adding a new note to a location."""

    class Meta:
        model = Note
        fields = ["text"]
        widgets = {
            "text": forms.Textarea(
                attrs={
                    "class": "note-input",
                    "placeholder": "Add a note... (Use #123 to link to location 123, or (Location Name) to link by name)",
                    "rows": 1,
                }
            ),
        }
        labels = {
            "text": "",
        }


class JournalNoteForm(forms.ModelForm):
    """Form for adding a new journal note."""

    class Meta:
        model = JournalNote
        fields = ["text"]
        widgets = {
            "text": forms.Textarea(
                attrs={
                    "class": "note-input",
                    "placeholder": "Add a journal note... (Use #123 to link to location 123, or (Location Name) to link by name)",
                    "rows": 1,
                }
            ),
        }
        labels = {
            "text": "",
        }
