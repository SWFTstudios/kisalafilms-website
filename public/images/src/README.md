# Logo sources

Drop the two KISALA FILMS exports here, both as full-colour artwork on a solid black field:

| File | What it is |
| --- | --- |
| `kisala-films-logo-source.png` | The wide wordmark — red script over the white FILMS block |
| `kisala-films-icon-source.png` | The round version with the red ring, used as the favicon |

Then from the repo root:

```bash
pip install pillow
python3 scripts/build-brand-assets.py
```

That writes:

- `public/images/brand/kisala-films-logo.png` and `-light.png` — header, mobile drawer, gallery intro
- `public/images/brand/kisala-films-icon.png`
- `public/images/favicon-16.png`, `favicon-32.png`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon.ico`

Because the artwork sits on black rather than transparency, the script recovers the alpha channel exactly — a pixel composited over black is `foreground × alpha`, so dividing the colour back out by its brightest channel restores the original artwork with clean edges. Thresholding would have chewed up the dark red in the script strokes.

**Until those two files land, `public/images/brand/` holds placeholder copies of the old metallic K Films mark** so nothing 404s. Running the script replaces them.

## Legacy

`scripts/make-logo-variants.py` produced flat black/white silhouettes from the previous single-colour mark. It is kept for that older artwork only; it cannot handle the red-and-white logo.
