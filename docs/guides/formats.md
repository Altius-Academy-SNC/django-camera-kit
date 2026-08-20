# Document formats

## The problem a format solves

Without a target format, a scan comes out at whatever size the detected
quadrilateral happened to be. Two A4 sheets photographed one after the other
produce two different page sizes, an ID card comes out as an arbitrary
rectangle, and a batch of twenty pages is twenty slightly different documents.

Locking a format does three things at once:

* the live view draws a guide with the right proportions, so the user frames
  the document instead of guessing;
* a candidate quadrilateral whose proportions are far from the format is
  rejected, which kills most false detections — a table edge, a laptop, a
  keyboard;
* the flattened page is rendered at exactly the format's aspect ratio, and the
  PDF page is created at its real millimetre size.

## Choosing one

```python
from django_camera_kit.widgets import DocumentScannerWidget

DocumentScannerWidget(document_format="a4")
DocumentScannerWidget(document_format="id_card")
DocumentScannerWidget(document_format="original")   # keep what was measured
```

Or once, for the whole project:

```python
# settings.py
DJANGO_CAMERA_KIT = {"DEFAULT_FORMAT": "a4"}
```

## Built-in formats

Sizes are stored in portrait orientation; orientation is a capture-time
choice, not a property of the format.

| Key | Size (mm) | Usually held |
|---|---|---|
| `a3` | 297 × 420 | portrait |
| `a4` | 210 × 297 | portrait |
| `a5` | 148 × 210 | portrait |
| `a6` | 105 × 148 | portrait |
| `letter` | 215.9 × 279.4 | portrait |
| `legal` | 215.9 × 355.6 | portrait |
| `id_card` | 53.98 × 85.6 (ISO/IEC 7810 ID-1) | landscape |
| `passport` | 88 × 125 (ICAO 9303 TD3) | landscape |
| `photo` | 100 × 150 | portrait |
| `receipt` | 80 × 200 | portrait |
| `original` | — | keeps the measured proportions |

## Your own formats

A notebook, a delivery slip, a school register: declare it once and it joins
the list everywhere, including the picker the user sees.

```python
# settings.py
DJANGO_CAMERA_KIT = {
    "EXTRA_FORMATS": [
        {"key": "register", "label": "Cooperative register", "width_mm": 210, "height_mm": 330},
        {
            "key": "receipt_book",
            "label": "Receipt book",
            "width_mm": 100,
            "height_mm": 210,
            "natural_orientation": "portrait",
        },
    ],
    "DEFAULT_FORMAT": "register",
}
```

Dimensions are validated when they are read: a missing key, a string where a
number belongs, or a side outside 10–2000 mm raises `ConfigurationError` with
a message that says what to fix, instead of producing a silently wrong guide.

## Orientation

```python
DocumentScannerWidget(document_format="a4", orientation="landscape")
```

`orientation="auto"` (the default) follows the format's own habit: paper is
scanned portrait, an ID card landscape. The guide, the flattened page and the
PDF page all follow the same choice, so a landscape A4 stays a landscape A4
all the way to the file.

## Letting the user choose

By default the scanner opens on a short setup step: format, orientation,
automatic capture, series mode. Turn it off when the format is not the user's
decision — an ID card is an ID card:

```python
DocumentScannerWidget(document_format="id_card", allow_format_change=False)
```

The camera then opens straight away.

## What "keep original proportions" means

`original` imposes nothing: the page keeps the shape that was measured. Use it
for anything irregular — a torn receipt, a hand-drawn map, a page that is not
a standard size. Auto-capture still works; only the ratio filter is off, so
detection is more permissive and false positives more likely.
