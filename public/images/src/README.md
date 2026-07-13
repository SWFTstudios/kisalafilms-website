# Logo sources

Place the official K Films logo files here:

1. `k-films-logo-source-on-black.png` — metallic/silver mark on black
2. `k-films-logo-source-on-white.png` — flat black mark on white

Then from the repo root:

```bash
python3 scripts/make-logo-variants.py public/images/src/k-films-logo-source-on-white.png
```

That writes `public/images/k-films-logo-white.png` and `public/images/k-films-logo-black.png` with transparent backgrounds.
