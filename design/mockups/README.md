# Mockups — the rendered markup, recovered

Each file here is the **rendered DOM** of a page design, lifted from the
`__bundler/template` block of the bundled HTML in the repository root. Fonts and the
`@font-face` block are stripped; the inline styles are the design, verbatim.

Read these rather than the bundles: the bundles' JavaScript is React plus a bundler
runtime, and the components are not recoverable from it. The markup here is.

## The palette, as actually used

```text
#111214  page            #1a1c1f  panel          #141517  panel, deeper
#1a1a1a  inset           #2a2a2a  border
#22C55E  working         #FBBF24  waiting        #EF4444  stopped / over
#F97316  attention       #A78BFA  accent         #2DD4BF  · #F472B6  capability
#8fb0ff  link            #fff     ink
```

Fonts: `Patrick Hand` for prose, `IBM Plex Mono` for identifiers, paths and figures.

## The rule these encode

An agent card states its role, its capability, what it is doing, the document and
line range it is doing it in, and what it has cost. Colour never carries a status on
its own — every state is also a word.
