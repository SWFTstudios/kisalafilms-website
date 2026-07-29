# Logo sources

Drop the two KISALA FILMS exports here, as full-colour artwork on a solid black field. **Filenames do not matter** — the script tells them apart by shape:

| Export | Recognised as | Becomes |
| --- | --- | --- |
| The wide one — red script over the white FILMS block | artwork wider than 1.2:1 | the wordmark |
| The round one with the red ring | artwork close to square | the icon and every favicon |

Then from the repo root:

```bash
pip install pillow
python3 scripts/build-brand-assets.py
```

That writes:

- `public/images/brand/kisala-films-logo.png` — header, mobile drawer, gallery intro
- `public/images/brand/kisala-films-icon.png`
- `public/images/favicon-16.png`, `favicon-32.png`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon.ico`

…and rewrites the `width`/`height` on every page's logo `<img>` to match what it produced, so the header does not shift on first paint. CSS sizes the logo by height, so any aspect ratio is fine.

## Two things the script does deliberately

**It recovers alpha by division, not by thresholding.** A pixel composited over black is `foreground × alpha`, so dividing the colour back out by its brightest channel restores the original artwork with clean edges. Thresholding would have chewed up the dark red in the script strokes.

**Favicons keep an opaque black background.** The mark is red *and white*. Left transparent, the white FILMS half of it disappears against a light browser tab strip or a light home screen. The large `brand/kisala-films-icon.png` keeps its transparency, because it only ever sits on the site's own black.

Current sources in this folder:

- `kisala-films-logo-source.png` — wide wordmark (nav / loader / OG)
- `kisala-films-icon-source.png` — round mark (favicon + Instagram profile)

## Legacy

`scripts/make-logo-variants.py` produced flat black/white silhouettes from the previous single-colour mark. It is kept for that older artwork only; it cannot handle the red-and-white logo.
