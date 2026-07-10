from django import forms

from django_camera_kit.widgets import DocumentScannerWidget

from .models import Document


class DocumentForm(forms.ModelForm):
    class Meta:
        model = Document
        fields = ["file"]
        widgets = {"file": DocumentScannerWidget()}
