These two files are required by `DocumentScannerWidget` and are intentionally not vendored into the repo (binary/generated build output). Download pinned versions before the widget will work:

- `opencv.js` — OpenCV.js WASM build. https://docs.opencv.org/4.x/opencv.js (build with `--build_wasm` for a browser target, or take a release build from the opencv/opencv-python-headless-js mirror). Pin a specific 4.x version.
- `jspdf.umd.min.js` — https://github.com/parallax/jsPDF releases, UMD build. Pin a specific version.

Place both files in this directory (`django_camera_kit/static/django_camera_kit/vendor/`). `widgets.py` references them by these exact filenames.
