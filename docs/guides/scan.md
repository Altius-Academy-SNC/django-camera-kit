# Document scanning

## How it works

`DocumentScannerWidget` is a `forms.FileInput` subclass. It renders the normal
`<input type="file">` plus a trigger button, and everything else happens in the
browser:

1. **Setup** — the user picks the format, the orientation and the capture mode
   (unless the widget imposes them). See [Document formats](formats.md).
2. **Live capture** — `getUserMedia` opens the camera, rear-facing by default.
3. **Edge detection** — about eight times a second, the frame is downscaled to
   480 px and run through a classic OpenCV pipeline (grayscale → Gaussian blur
   → Canny → `findContours` → `approxPolyDP`). Candidates are scored on how
   much of the frame they cover *and* how close their proportions are to the
   chosen format; the best one is drawn over the video. Detection never runs on
   the full-resolution frame — that is what makes it usable on a phone.
4. **Capture** — automatic once the shape has been steady for four detections
   and the image is sharp, or on the button, always.
5. **Adjust** — four draggable handles appear over the frozen frame, seeded
   from the detected quadrilateral or from the guide when detection missed.
6. **Flatten** — `cv.warpPerspective()` un-warps the quadrilateral to exactly
   the format's aspect ratio.
7. **Export** — the pages are assembled into a PDF whose pages carry the
   format's real millimetre size, or into one JPEG per page, then written into
   the file input through the `DataTransfer` API. A `change` event and a
   `camerakit:scan-complete` event are dispatched.

No server round-trip happens while scanning. The widget does not know or care
what model the surrounding form belongs to.

## Series mode: scanning a stack without stopping

Twenty pages to digitise? Series mode keeps the camera open: each page is
captured, flattened and stacked on its own, and the scanner waits for the next
one. There is a flash, a thumbnail appears in the strip, and a cooldown of
about a second and a half gives the user time to swap the sheet — without it
the same page is captured three times.

```python
DocumentScannerWidget(document_format="a4", batch=True, auto_capture=True)
```

The corner-adjustment step is skipped in series mode: stopping on every page to
confirm is exactly what the mode exists to avoid. Pages can still be deleted
one by one from the thumbnail strip before finishing.

For a careful, page-by-page scan, leave `batch=False`: every capture goes
through the adjustment step and has to be confirmed.

## Automatic capture

Auto-capture fires when three conditions hold at once: a quadrilateral is
detected that matches the format, it has not moved for four consecutive
detections, and the frame is not blurry (variance of the Laplacian). A short
countdown follows so the shutter never surprises the user, and the guide turns
green while it runs.

```python
DocumentScannerWidget(auto_capture=False)   # button only
```

## Output

```python
DocumentScannerWidget(output="pdf")      # default: one PDF, real page sizes
DocumentScannerWidget(output="images")   # one JPEG per page
```

`output="images"` writes several files into the input, so the input needs
`multiple` for anything beyond one page:

```python
DocumentScannerWidget(output="images", attrs={"multiple": True})
```

## Reacting to a finished scan

```javascript
document.addEventListener("camerakit:scan-complete", function (event) {
  console.warn(event.detail.pageCount, event.detail.format, event.detail.files);
});
```

## Progressive enhancement

Until `doc_scan.js` binds to a `.camera-kit-scanner` container, the native
`<input type="file">` stays visible: if JavaScript fails to load, users can
still pick a file by hand. Once bound, the widget hides the native input and
the scan button becomes the way in.

## Styling

`camera_kit.css` ships the overlay layout *and* a minimal set of button rules,
so the scanner looks deliberate on a page with no CSS framework. The classes
follow Bootstrap's naming (`btn`, `btn-primary`…), so a project already on
Bootstrap inherits its own styling instead.

## Translations

The browser code contains no user-facing text. Every string comes from the
widget as a JSON block, translated server-side through the usual `.po`
catalogues — so the scanner speaks whatever language the request does.

French ships with the package: set `LANGUAGE_CODE = "fr"` and the scanner is in
French, formats included. Any other language is a `makemessages` away in your
own project, or a pull request here.

## Offline and self-hosted assets

`opencv.js` (~13 MB) and `jspdf.umd.min.js` are vendored into the package
rather than loaded from a CDN, so the widget works with no external network
access at runtime — which is the point in low-connectivity deployments.

## Limitations

- Detection quality depends on the contrast between the document and what it
  sits on. The manual corner-drag is the fallback, not an edge case to
  eliminate.
- No OCR and no field extraction: the output is a PDF or an image, nothing
  more.
- Nothing is re-validated server-side. If your use case needs a *trusted*
  image rather than a convenient one, validate the upload like any other file.
