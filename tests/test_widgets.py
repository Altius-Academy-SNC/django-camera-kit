from tests.testapp.forms import DocumentForm


def test_widget_renders_scanner_container():
    html = str(DocumentForm())
    assert 'class="camera-kit-scanner"' in html
    assert 'class="btn btn-outline-primary camera-kit-trigger"' in html
    assert 'type="file"' in html


def test_widget_declares_media_assets():
    media_html = str(DocumentForm().media)
    assert "django_camera_kit/js/camera_kit.js" in media_html
    assert "django_camera_kit/js/doc_scan.js" in media_html
    assert "django_camera_kit/css/camera_kit.css" in media_html
