# Mazeking Engineering Retrospective — Polecat Bishop

**Author:** mazeking/polecats/bishop
**Date:** 2026-05-06
**Audience:** Mayor's aggregated retrospective.

> Knight wrote the general retro. Read that first. This one stays inside
> the layers I lived in: sprite/glyph rendering, the seed→hash→palette
> pipeline, the pixel-font wordmark, and the bb.js/Noir build hoist.
> I won't repeat the regalia-chain enumeration, the cross-layer hash
> binding praise, or the Game.tsx god-component watch — knight covered
> them.

---

## 1. Where I lived

In rough surface-area order:

- `frontend/src/lib/spriteGlyphs.ts` (442 lines) — authored. Procedural
  pixel-art sprites with a PNG-glyph swap path. Person, regalia, crown,
  tiered crown overlays.
- `frontend/src/lib/colorGenerator.ts` (335 lines) — added the
  hash-aligned palette path (`paletteFromHashAndSeed`,
  `canonicalPaletteFromHash`).
- `frontend/src/lib/pixelFont.ts` (937 lines) — extended; consumed for
  the in-header wordmark and the in-maze word.
- `frontend/src/lib/mazeGenerator.ts` — `MARGIN_CHARS` work and the
  ascender/baseline asymmetry (ma-1mv, ma-kwb, ma-kj9).
- `frontend/src/components/WinModal.tsx` — Polaroid-develop reveal
  (ma-6cr.17), Coronation copy (ma-9ve), tier crowns wired in
  (ma-6cr.20).
- `frontend/src/components/Header*.tsx` — pixel wordmark (ma-6cr.14),
  desktop single-row (ma-8ls), compact mobile (ma-7kw).
- Build infra: `pnpm-workspace.yaml` catalog hoist for bb.js + noir
  (ma-rhe), WASM-only bb+nargo replacement (ma-6cr.2).
- `frontend/src/lib/zkSerialize.ts` + `tokenId.ts` + the contract
  `MazeKingNFT.sol` — the hash-as-public-input refactor (ma-6cr.6).

24 commits, all of which paint pixels or align two surfaces that
have to render the same thing.

---

## 2. What was harder than expected

### The visual stack has two parallel renderers and they MUST agree

The cross-layer hash binding gives us *layout* agreement for free. But
the **palette** is a parallel hand-aligned contract:

- `contracts/src/MazeRenderer.sol :: _palette()` derives wall / mazeBg
  / textBg / zkBg / crownBg / player / key / goal hues from `mazeHash`.
- `frontend/src/lib/colorGenerator.ts :: canonicalPaletteFromHash()`
  re-derives the same eight fields, in TS, by hand, with comments
  saying "MUST match byte-for-byte."

There is no test that asserts equality. There is no codegen. The two
recipes are kept in sync by the next person reading both files at the
same time. This is the same shape of bug as the verifier ABI drift
(knight's regalia-split story) — the difference is that a
palette mismatch produces no error, just a mint whose on-chain SVG
looks subtly different from the live game it just left.

Knight counted three places where the byte layout lives (hash.nr,
zkSerialize.ts, MazeRenderer.sol). I want to add a fourth class
of cross-layer drift here: **the palette recipe**, two surfaces, no
guard.

### Maze margin = unwritten contract with mint identity

The pixel-font wordmark needs a margin around it so glyphs aren't
squashed against the maze edge. I tightened that margin three times
(ma-kj9, ma-1mv, ma-kwb) chasing visual balance.

What I learned the hard way: **`MARGIN_CHARS` is load-bearing for
mint identity.** The margin determines which cells become walls,
which determines packed-cell bytes, which determines `mazeHash`,
which IS the tokenID. Changing visual padding changes mint identity
for the same seed.

There is no comment at the call site that says "this constant
is consensus-critical, do not change after mainnet." There should
be. (See bug #1 below.)

### Sprite render at small cell sizes

`drawSprite` paints individual pixels with `Math.round` per coordinate.
Adjacent filled pixels round independently, so at non-integer cell sizes
(common — `cellSize = canvasWidth / cols`) you can get 1-pixel seams
inside a silhouette. The 1px outline pass *masks* this in practice
because the dark fill bleeds into the gap. So if anyone ever calls
`drawSprite(..., { outline: false })`, the seams come back, and there's
no test that catches it.

### PNG-glyph load race produces a "plain peasant" flicker

`drawPerson(..., images?)` swaps PNGs in when loaded. The procedural
fallback only knows two states: plain and full-regalia. Partial states
(robe-only, scepter-only) **render as plain until the PNGs finish
loading.** First-paint after pickup of the first regalia piece can
flash a plain peasant for a frame or two.

Not high-impact; it's a frame on a fresh load. But it surprised me.
The fix would be procedural sprites for the partial states (8 lines
of bitmap data each), or block draws until images are ready. Neither
felt urgent enough to file.

---

## 3. What was easier than expected

### Pixel-font wordmark in the header (ma-6cr.14)

Pulling `pixelFont.ts` glyphs out of the maze and into a standalone
canvas in the header was 30 minutes. The font module was *already*
designed to render anywhere: bitmap data + a `getCharacterBoundaries`
helper. I wrote a small canvas wrapper, sized it to one row of cells,
and the wordmark dropped in. This is the kind of small architecture
win that pays back later — knight separately noted pixelFont as
clean.

### Polaroid reveal in WinModal (ma-6cr.17)

The animation is a single CSS keyframe sequence behind the SVG image
element. The reason it was easy: the on-chain SVG is just an `<img>`
with a `data:` URL. Once `tokenURI()` returns, the image is one
React render away. No streaming, no tile loading, no protocol — the
"art" is a self-contained string.

### `pnpm` catalog for bb.js + noir packages (ma-rhe)

I introduced a named catalog (`zktools`) for the four bb.js + Noir
packages. They were all version-pinned across `frontend/`,
`scripts/`, and the e2e harness, drifting by patch versions. The
catalog took ~10 minutes:

```yaml
catalogs:
  zktools:
    "@aztec/bb.js": ^X.Y.Z
    "@noir-lang/noir_js": ^X.Y.Z
    "@noir-lang/noir_wasm": ^X.Y.Z
    "@noir-lang/noirc_abi": ^X.Y.Z
```

Workspaces reference `catalog:zktools`. One pin to update, no drift.
This is the right pattern for any package family that must move
together.

### WASM-only build path (ma-6cr.2)

Replacing native `nargo` + native `bb` with `noir_wasm` + `bb.js`
node runtime in the build pipeline removed the "install nargo first"
preamble from new contributor onboarding. Compile is slower (WASM
overhead) but it runs on any Node environment, including CI runners
without the toolchain.

Knight's retro praises `just compile-circuits` as "do the right thing
semantics" — that recipe works *because* of this: no native binaries
to bootstrap.

---

## 4. Bugs I noticed but wasn't asked to fix

In rough priority for my area:

1. **`MARGIN_CHARS` and the wordmark layout aren't documented as
   consensus-critical.** Changing them changes `mazeHash` for every
   existing seed. Same risk class as `seedPhrases.ts`. Add a banner
   comment at the top of `mazeGenerator.ts` (and any margin constant)
   that says "DO NOT CHANGE AFTER MAINNET LAUNCH — affects mint
   identity." File: `bug, p2, frontend/src/lib/mazeGenerator.ts`.

2. **`canonicalPaletteFromHash` ↔ `MazeRenderer._palette()` is a
   silent-drift surface with zero coverage.** A vitest that loads the
   Solidity source, regex-greps the constants, and compares to TS
   would catch most drift. A foundry test that returns the palette
   and compares to a TS-generated golden JSON would catch all of it.
   File: `bug, p2, frontend/src/lib/__tests__/`.

3. **Crown tier sprites are dead code on the PNG path.**
   `drawPerson(..., wearingCrown=true, images=present)` calls
   `drawImageGlyph(images.king, ...)` and ignores `crownTier`. The
   six procedural overlays (Stone/Plain/Copper/Silver/Gold/Robot) only
   render when PNGs aren't loaded. Either wire tier-specific king
   PNGs or drop the procedural overlays. Currently we ship both
   and use neither for the win moment after page load. File:
   `bug, p3, frontend/src/lib/spriteGlyphs.ts`.

4. **`regaliaColor` parameter on `drawPerson` is dead.** The function
   accepts it, comments "ignore regaliaColor," and never reads it.
   Dead args are subtle footguns: someone will pass a value, expect
   it to do something, and not see anything change. Either remove it
   or implement it. File: `chore, p3,
   frontend/src/lib/spriteGlyphs.ts`.

5. **`paletteFromHashAndSeed` consumes the rng for fields with
   structural alignment requirements.** `textWallColor` calls
   `rng.next()` four times. The order of those calls is part of the
   palette identity for any seed. A line reorder silently changes
   every existing seed's textWallColor. Should be either a single
   `rng.next()` per field with a comment, or fully deterministic from
   hash. File: `bug, p3, frontend/src/lib/colorGenerator.ts:152-177`.

6. **`drawSprite` assumes square sprite patterns
   (`pixel = size / max(rows, cols)`).** All current sprites are 8x8,
   so it works. The first 8x16 (banner-shaped) sprite anyone adds
   will render as tiny squares centered in the cell. No invariant
   asserted. File: `bug, p4, frontend/src/lib/spriteGlyphs.ts:211`.

7. **Sprite outline pass and color pass have separate `Math.round`
   per pixel.** When `outline=false` and cell sizes are non-integer,
   adjacent filled pixels can leave 1-pixel seams. Not visible today
   (everything calls with `outline=true`), but a class-of-bug waiting.
   File: `bug, p4, frontend/src/lib/spriteGlyphs.ts:227-255`.

---

## 5. One non-obvious improvement for my area

**Codegen the palette recipe the same way we codegen `MazeConstants`.**

We already have a working pattern for cross-layer constants:
`maze-config.json` is the single source of truth, `just compile-circuits`
emits `MazeConstants.sol` and `mazeConstants.generated.ts`, and the
Noir circuit reads the JSON directly. Drift between the three is
caught by the build.

The palette recipe is the *exact same shape of problem* and we don't
do it. The recipe is:

- 8 canonical fields, each `(hueRecipe, s, l)`.
- `hueRecipe` is one of: `baseHue`, `(baseHue + N) % 360`, or constant.
- `baseHue = uint256(mazeHash) % 360`.

That is JSON-encodable. Spell it as `paletteRecipe.json`:

```json
{
  "wall":    { "hue": "base",          "s": 25, "l": 22 },
  "mazeBg":  { "hue": "base+30",       "s": 22, "l": 80 },
  "textBg":  { "hue": "base+200",      "s": 80, "l": 60 },
  "zkBg":    { "hue": "base+200+120",  "s": 80, "l": 55 },
  "crownBg": { "hue": "const:48",      "s": 85, "l": 55 },
  "player":  { "hue": "const:45",      "s": 90, "l": 60 },
  "key":     { "hue": "const:55",      "s": 85, "l": 55 },
  "goal":    { "hue": "base+90",       "s": 65, "l": 50 }
}
```

Codegen `_palette()` in Solidity (or generate a library) and
`canonicalPaletteFromHash` in TS from it. ~50 lines of build work.
Eliminates an entire class of "the live game looks different from
the NFT" bugs that would only ever manifest visually and never error.

This is more important than knight's `just check-abi-drift` because:

- ABI drift errors at proof time (loud).
- Palette drift renders a visually-wrong but valid NFT (silent).

Silent drift is what kills products in production. Fix this before
mainnet.

---

## 6. My area's relationship to the whole

**Bishop's territory is the visual stack and one specific seam: the
parallel rendering pipeline.**

There are two renderers in mazeking, and they MUST agree:

1. **Live game renderer** — `Maze.tsx` canvas, `spriteGlyphs.ts`,
   `colorGenerator.ts`. Runs in the browser, paints the canvas the
   user plays on.
2. **On-chain SVG renderer** — `MazeRenderer.sol`. Runs in `eth_call`,
   produces the `tokenURI` image embedded in the NFT.

The user's experience of the seam is: solve a maze in the live game,
mint it, then see the NFT. **They expect the NFT to look like the
maze they solved.** If the palette differs, that expectation breaks
silently — no error, no revert, just visual incongruity.

The cross-layer hash binding (knight's praise) handles *layout*
agreement: same packed bytes go in, same maze comes out. But the
*styling* — palette, glyph design, cell decorations — is two
implementations that have to be kept aligned by hand:

| Concern             | Live game                     | On-chain SVG                       | Aligned by                |
|---------------------|-------------------------------|------------------------------------|---------------------------|
| Maze layout (cells) | `mazeGenerator.ts`            | derived from packed-bytes header   | hash binding              |
| Palette             | `colorGenerator.ts`           | `MazeRenderer._palette()`          | hand-mirrored, no test    |
| Walls/path glyphs   | `Maze.tsx` canvas             | `MazeRenderer` `<rect>` emission   | hand-mirrored, no test    |
| Player/regalia/goal | `spriteGlyphs.ts`             | none (ma-e7r dropped overlays)     | n/a                       |

ma-e7r dropped character/pickup/goal overlays from the on-chain SVG.
That decision *narrowed* the seam — the NFT no longer renders sprites,
so I (bishop) don't have a sprite-mismatch worry. But it widened the
gap in expectation: the NFT shows just the maze, and the player saw a
maze with a peasant in it. We accepted that asymmetry by design.

What still matters: **palette + cell decoration** must stay aligned.
The codegen suggestion in §5 is the cheap insurance.

---

## Closing

Three things to fix before mainnet, in priority order:

1. **Codegen `paletteRecipe.json`** — eliminates silent palette drift
   between the live game and the NFT. Highest leverage in my area.
2. **Mark `MARGIN_CHARS` (and any maze-layout constant) as
   consensus-critical.** A comment is the minimum; a lint rule
   that fails CI on changes would be better.
3. **Either ship tier-specific king PNGs or remove the procedural
   tier overlays.** Right now we have six unused crown tier sprites
   in production code — dead code that pretends to be live.

Everything else (the dead `regaliaColor` param, the rng-order
fragility, the sprite squareness assumption) is small enough to
batch into one cleanup pass.

— bishop
