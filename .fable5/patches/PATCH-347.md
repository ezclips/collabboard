# PATCH-347 — PDF selection: ignore hyphens when matching the page text

## Why
Owner, 2026-10-12: selecting a sentence on the PDF page (the image's text
layer) shows "Couldn't match this to the page text. Select it in the text below
instead." — "only short texts from the same paragraph work".

Root cause, measured live on the owner's `Audi_A2_tire_big.pdf` (PM diagnosis,
both texts read from the reader): the pdf.js text layer and the stored page
text are identical after the matcher's normalization EXCEPT one character:

- layer:  `…documentation,tire-pressurelabel,…`
- stored: `…documentation,tirepressurelabel,…`

The extractor (OpenDataLoader) dehyphenated a line-end hyphen ("tire-" ⏎
"pressure"), so every selection crossing that line can never match.
Apostrophes (U+2019) and the en dash (U+2013) are identical in both texts and
are not the cause. The 100,000-char quote cap is not involved.

## Design
`lib/domain/knowledge/knowledgePageLayerSelection.ts`, both normalizers
(`normalizeForCompare` and `normalizeNeedle`): also drop the HYPHEN characters
— U+002D hyphen-minus, U+2010 hyphen, U+2011 non-breaking hyphen (U+00AD soft
hyphen is already dropped). Do NOT drop U+2012 figure dash, U+2013 en dash,
U+2014 em dash or U+2212 minus: they carry meaning and the two extractors
agree on them.
- The offsets still map back to the ORIGINAL page text, so the stored quote is
  the canonical text ("tirepressure"), exactly as today's rule says.
- Update the file's comment block ("The characters removed before
  comparison…") with the reason and this measured example.
- The needle-length guard (`< 2`) applies after removal (a selection of only
  hyphens is refused).

## Tests (`knowledgePageLayerSelection.test.ts`)
- the live case: layer `"documentation, tire-\npressure label"` matches stored
  `"documentation, tirepressure label"`, and the returned span slices to the
  stored text exactly;
- the reverse (layer without, stored with a hyphen) also matches;
- U+2010 and U+2011 behave like `-`;
- an en dash is NOT ignored: `"A2 – Approved"` does not match `"A2 Approved"`;
- `"--"` alone → null;
- the existing tests stay green.

## Verification
Focused test, tsc, full gate. Live (PM): on the Audi PDF, select the whole
"Always confirm … fitting tires." sentence on the page image → no "Couldn't
match" message and the selection action is offered; check the captured text.

## Allowed files
`lib/domain/knowledge/knowledgePageLayerSelection.ts` and its test. No SQL, no
git.
