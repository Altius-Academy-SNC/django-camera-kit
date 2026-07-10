# Document Scanning

## How it works

`DocumentScannerWidget` (`django_camera_kit.widgets.DocumentScannerWidget`) is a `forms.FileInput` subclass. It renders the normal `<input type="file">` plus a trigger button. Everything else happens in the browser:

1. **Live capture** — `getUserMedia` opens the camera (rear-facing by default).
2. **Edge detection** — every frame, `camera_kit.js` runs a classic OpenCV pipeline (grayscale → Gaussian blur → Canny → `findContours` → `approxPolyDP`) via OpenCV.js (WASM) to find the largest 4-point contour, and draws it as an overlay.
3. **Manual override** — on capture, four draggable corner handles appear over the frozen frame, seeded from the auto-detected quad (or a default inset rectangle if detection failed). The user can drag any corner before confirming the page.
4. **Perspective warp** — confirming a page runs `cv.warpPerspective()` to flatten the quadrilateral into a rectangular page image.
5. **Multi-page** — repeat for as many pages as needed; a thumbnail strip tracks progress.
6. **Export** — "Finish" assembles all pages into a single PDF via jsPDF, and writes it into the underlying file input via the `DataTransfer` API, dispatching a normal `change` event plus a custom `camerakit:scan-complete` event.

No server round-trip happens during scanning. The widget doesn't know or care what model/view the surrounding form belongs to.

## Styling

The widget's own CSS (`camera_kit.css`) only covers structural/positioning rules (the fullscreen overlay, corner handles, thumbnail strip). Button styling (`btn`, `btn-primary`, etc.) assumes **Bootstrap** (or Bootstrap Native) is already loaded on the page. If it isn't, the buttons still work, just unstyled.

## Progressive enhancement

Until `doc_scan.js` binds to a `.camera-kit-scanner` container, the native `<input type="file">` stays visible — if JavaScript fails to load, users can still pick an existing file manually. Once bound, the widget hides the native input (`camera-kit-js-ready` class) and the scan button becomes the only way in.

## Offline / self-hosted assets

Both `opencv.js` (~13MB) and `jspdf.umd.min.js` are vendored into the package rather than loaded from a CDN, so the widget works without external network access at runtime — useful for low-connectivity deployments. See [Installation](../getting-started/install.md) for how these are obtained when installing from a wheel.

## Limitations

- Edge detection quality depends on lighting and contrast between the document and its background — the manual corner-drag is the fallback, not an edge case to eliminate.
- No OCR, no field extraction — the output is a PDF/image, nothing more.
- No server-side re-validation of the scanned image; if your use case needs a trusted image (not just a convenience input), validate it after upload like any other file field.
