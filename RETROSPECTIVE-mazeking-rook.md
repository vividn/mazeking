# Mazeking Engineering Retrospective — Polecat Rook

**Author:** mazeking/polecats/rook
**Date:** 2026-05-06
**Audience:** Mayor's aggregated retrospective.

> The bead body said "you are queen" but the title said *do not roleplay
> another name* and the assignment came to rook. Following bishop's
> precedent — treating the body as a stale template — I am writing rook's
> retrospective from rook's commits, not queen's.
>
> Knight wrote the general retro. Pawn lived at the TS↔Noir↔Solidity hash
> seam. Bishop lived in the visual stack (sprites, glyphs, palette,
> wordmark). I shipped the **on-chain SVG renderer**, the **mobile control
> surface**, and the **WinModal/error-surface UX** — so this retro stays
> inside those three lanes and the contract surface they touch.
>
> 13 commits across `contracts/` and the touch / mobile / error-surface
> half of `frontend/`.

---

## 1. Where I lived

In rough decreasing order of time spent:

- **`contracts/src/MazeRenderer.sol`** (326 lines, authored, ma-6cr.7) —
  the on-chain SVG renderer. Decodes the 20-byte header + 4-bit packed
  cells, derives an HSL palette from `tokenId`, emits walls as a single
  `<g>` and non-Normal cells as colored `<rect>`s. Purely `pure`; no
  storage.
- **`contracts/src/MazeKingNFT.sol`** (the layout/uri/registrar half) —
  added `mapping(uint256 => bytes) public layouts`, the
  `IMazeRenderer renderer` setter behind `OWNER_ROLE`, the `uri()`
  override that falls back to the ERC1155 base URI when either field is
  unset, and (in ma-6cr.9) the `disqualifyMaze(tokenId, flag)` /
  `MazeDisqualified` event behind `REGISTRAR_ROLE`.
- **`frontend/src/components/Controls.tsx`** (519 lines after my mobile
  redesign in ma-6cr.4) — the thin h/j/k/l row on mobile, the
  swipe-up-to-expand drawer with d-pad + action buttons, the keymap-row
  hide on small viewports.
- **`frontend/src/components/Maze.tsx`** (~180 lines added in
  ma-6cr.4) — pinch-to-zoom + one-finger pan via raw touch events,
  midpoint-anchored, double-tap reset, transform reset on maze id
  change. Independent of the desktop zoom prop because the desktop
  zoom is button-driven and the mobile zoom is gesture-driven and they
  don't share semantics.
- **`frontend/src/components/WinModal.tsx`** (823 lines; many passes:
  ma-3n7, ma-9ve, ma-hkq, ma-q7n) — the king hero swap, the
  Coronation copy, the fit-the-modal pass, the `role="alert"` error
  banner that surfaces simulate / writeContract / receipt failures.
- **`frontend/src/components/MazeLightbox.tsx`** (193 lines, authored in
  ma-w3o) — the click-to-zoom card modal with optional "Play this
  maze" affordance.
- **`frontend/src/lib/contrastText.ts`** (40 lines, authored in ma-e80)
  — WCAG-luminance `pickTextColor()` helper applied to every dynamic-
  color button so we never ship white-on-pale-fill again.
- **`frontend/src/hooks/useMintNFT*` (in WinModal call site)** — the
  `simulateError`/`writeContract`/`receipt` error merge with
  `formatMintError` (ma-q7n).
- **`frontend/src/glyphs/glyphImages.ts` + `lib/spriteGlyphs.ts`** —
  added `crown.png`, the robe/scepter split into `drawRobe` /
  `drawScepter`, and the regalia-aware `drawPersonWithRegalia`
  (ma-3n7, ma-nmv). Bishop's territory; I touched only the bitmap
  loaders, not the procedural pixel routines.
- **`frontend/index.html` + `frontend/src/index.css`** — the
  `viewport-fit=cover`, `100dvh`, `overscroll-behavior: none`,
  safe-area-inset wiring (ma-6cr.19).

I touched no Noir. I touched no `mazeIdentity.ts`, `zkSerialize.ts`, or
`hash.nr`. The hash binding pawn cared about is downstream of where I
worked: my contract code receives `mazeHash` and trusts it.

---

## 2. What was harder than expected

### The on-chain SVG palette is a parallel implementation of a parallel implementation

Bishop flagged this as *the* class of cross-layer drift in their retro:
two surfaces hand-aligning the same palette recipe with no test. They
counted the frontend canvas + Solidity `_palette()` as the two surfaces.
They were undercounting.

There are at least **three** palettes in this repo, all derived from the
same `mazeHash`/`tokenId`, all written in different languages, none
asserted equal:

1. `frontend/src/lib/colorGenerator.ts :: paletteFromHashAndSeed()` —
   the live game's palette. JS, hand-derived, runs at every frame.
2. `frontend/src/lib/colorGenerator.ts :: canonicalPaletteFromHash()` —
   bishop's "what the on-chain renderer should produce" mirror. JS,
   hand-derived.
3. `contracts/src/MazeRenderer.sol :: _palette(uint256 seed)` — what
   the on-chain SVG actually produces. Solidity, hand-derived. **Mine.**

(2) is supposed to predict (3) byte-for-byte. (1) is allowed to drift
from (2) because the live game palette is a UX choice, not a mint
identity contract — which is correct, but means a developer reading
the codebase has to know which of the two TS palette functions is
authoritative for which surface.

(3) doesn't even take the same input shape. It takes `uint256 tokenId`
where (2) takes a hex string. It uses `uint256` modular arithmetic on
hue rotations where (2) uses `Number` arithmetic on the same. `tokenId`
is `uint256(mazeHash)`, so the seed *value* is identical, but the
arithmetic surface is not.

What bit me: the original drop of MazeRenderer.sol shipped before I
read bishop's `canonicalPaletteFromHash`, so I rederived the palette
recipe from `MazeRenderer.sol`'s natspec instead of from the canonical
TS. The natspec was wrong (it predated the regalia split). I caught it
visually on a 4x4 test maze — the wall hue was off by ~30°. Took 20
minutes of staring at two files in two languages to find. The fix was
two-line; the bug should not have been possible.

The right shape here is a single palette-generation primitive that both
sides consume, OR a Foundry test that fuzzes a tokenId and asserts the
SVG fill strings match a TS-rendered fixture file checked in alongside.
Neither exists. **Bug filed in bullet 4.**

### `bytes calldata layout` decode is a hand-written parser with no schema

`_decodeHeader` reads ten `uint16`s big-endian out of the first 20 bytes,
then validates `layout.length >= 20 + (totalCells + 1) / 2`. The cell
indexer reads a 4-bit nibble per cell. There is no schema file. There
is no codegen. The TS encoder in `frontend/src/lib/zkSerialize.ts`
writes the same bytes by hand. Pawn fought this seam at the hash level;
I fight it again at the renderer level, because the **encoder** writes
the bytes that BOTH the prover hashes AND the renderer decodes, and the
two consumers expose drift differently:

- Prover sees layout-byte drift as a proof failure (loud).
- Renderer sees layout-byte drift as a silently malformed SVG (quiet,
  surfaces only when someone opens the NFT in a wallet weeks later).

The 20-byte header was 16 bytes before the regalia split. I bumped it
to 20 in MazeRenderer's `_decodeHeader` and the `expected` length check,
and that change is mirrored — by hand — in `MazeKingNFT`'s test fixture
encoder. If pawn's encoder ever moves to a 24-byte header (e.g. for
crown position), three files have to change in lockstep with no
compile-time guard.

### Touch events on iOS Safari ignore `touchAction: 'none'` half the time

The pinch-zoom in `Maze.tsx` (ma-6cr.4) uses raw `touchstart`/`touchmove`
+ `e.preventDefault()` to take ownership of the gesture from Safari's
default page zoom. `touch-action: none` on the maze container is set in
CSS. Both are required; either alone fails on iOS 17+ in mobile Safari
when the gesture starts close to a screen edge. I wasted ~30 minutes
believing CSS was sufficient before reading the WebKit issue tracker.
There is no Foundry-style equivalent for "this works on a real iPhone";
the e2e harness pawn extended in ma-0du runs in headless desktop, so
the mobile gesture path has zero automated coverage.

### `100dvh` is not a polyfill target

`100dvh` requires real iOS (iOS 16.4+) or real Chrome 108+. It does not
gracefully fall back. The fix shipped (ma-6cr.19) before I learned
that one of the rig's frontend test devices was on iOS 15. The
`@supports` wrap I should have written in `index.css`, I did not.
The bug surfaces as the WinModal confetti canvas being 16-24px short
on the bottom on old iOS, not as a render error. Filed in bullet 4.

---

## 3. What was easier than expected

### Pluggable renderer behind `IMazeRenderer` was free

`MazeKingNFT` stores `address public renderer` and `setRenderer` is
gated on `OWNER_ROLE`. `uri()` falls back to the ERC1155 base URI when
the renderer is unset. This means I could ship the layout-storage
half (ma-6cr.7) without committing to the SVG output, and we can swap
renderers later without re-minting. Costs maybe 6 lines and one event.
It also means `redeploy-svg.sh` (queen, ma-96n) can hot-swap a newer
renderer onto the deployed NFT without touching the verifier — which
is what we actually do in dev now.

### Base64 + data URI was a one-liner

`abi.encodePacked` of `data:application/json;base64,` + `Base64.encode(json)`
where `json` is itself another `abi.encodePacked` containing
`data:image/svg+xml;base64,` + `Base64.encode(svg)`. OpenZeppelin
`Base64` does the work. No string escaping issues because the SVG is
opaque to the JSON wrapper. Total bytes for a 4x4 test maze: 1.8KB SVG,
3.5KB data URI. Linear scaling: 20x20 stays under 80KB. Wallets are
fine.

### `pickTextColor` is 20 lines and removed an entire class of UI bug

WCAG luminance is just `0.2126*R + 0.7152*G + 0.0722*B` on linearized
sRGB and a threshold at `0.179`. That's one helper, one test file, and
one `style={{ color: pickTextColor(bg) }}` substitution per button. It
ate the white-on-pale-fill bug across `Controls`, `Game`, `WinModal`,
`SeedBar`, `SeedInput`, and `PublicGallerySidebar` in one commit
(ma-e80). The bug had been "we'll fix that later" for weeks.

### `formatMintError` switching on `BaseError.walk` was clean

viem's `BaseError` exposes `.walk((err) => predicate(err))` which lets
you find the deepest cause of a known shape. So instead of pattern-
matching on error message strings (fragile), `formatMintError` walks
the cause chain looking for `UserRejectedRequestError`,
`ContractFunctionRevertedError`, `HttpRequestError`, etc., and picks
the matching user-facing string. This is the most robust error
classification I've written for a wagmi mutation chain. Tests cover
each category through the walk chain.

---

## 4. Bugs I suspect or noticed but wasn't asked to fix

### a. No Solidity↔TS palette equivalence test

(See section 2.) `MazeRenderer.sol :: _palette(tokenId)` and
`canonicalPaletteFromHash(hashHex)` are supposed to produce the same
five hue/sat/lit triples. There is no test. Easy fix: a Foundry test
that for, say, 32 fuzzed tokenIds renders `renderSvg()`, regex-extracts
`hsl(...)` strings, and asserts equality with a JSON fixture written
by the TS side. Or vice versa. Either side is golden, the other side
verifies. **Severity: high.** Silent on-chain drift is the most
expensive class of bug here.

### b. `MazeRenderer._renderCellFills` doesn't honor disqualified state

`disqualifyMaze` (ma-6cr.9) sets a flag the *gallery* respects. The
on-chain SVG renderer doesn't read it — `tokenURI` returns the same
metadata for a disqualified token as for a clean one. Whether this is
desired (the NFT still exists; the disqualification is purely a
discoverability filter) is a product call. If the answer is "render
disqualified mazes with a watermark or grayscale," it's a 6-line patch
in `_renderSvg` plus a bool param threaded through `tokenURI`.
**Severity: low until product decides.**

### c. Layout-storage idempotence has no test for *wrong* idempotence

The `if (layouts[tokenId].length == 0) { layouts[tokenId] = layout; }`
pattern means the FIRST minter binds the tokenId↔layout pairing
forever. A subsequent minter with a *different* `layout` whose proof
still verifies (because the proof commits to `mazeHash`, not `layout`,
and they happen to match the stored hash by collision OR by malformed
encoding accepted by the verifier) is silently rejected — the renderer
keeps using the first layout. This is the documented "option α: trust
the first caller" behavior. There's no test that asserts the contract
*deliberately ignores* the second layout, only tests that assert
storage doesn't change. Worth adding an explicit
`testFirstMinterBindsLayoutEvenIfSecondMinterDisagrees`.
**Severity: medium** (correctness is documented, but the doc is
load-bearing and hidden in a comment).

### d. `100dvh` has no `@supports` fallback

Old iOS shows a 16-24px gap at the bottom. Two-line fix: wrap in
`@supports (height: 100dvh)` and provide `100vh` as the fallback.
**Severity: low.**

### e. Pinch-zoom transform is reset on `maze.id` change but not on `seed` change

The transform resets when the displayed maze identity changes, which
is what we want for "Random" or "load owned NFT". But there's a code
path in `Game.tsx` where the seed is rewritten without producing a new
maze id (e.g. zkDEBUG seed in queen's ma-gjf). The transform persists.
Cosmetically fine, but means a user pinch-zoomed into the corner of
maze A then types a new seed and sees maze B already pre-zoomed.
**Severity: cosmetic.**

### f. `MazeLightbox` doesn't preload its replay route

Clicking "Play this maze" hits `useNavigate` to a route whose chunks
have not been fetched (because the lightbox is on the gallery page).
There's a frame of blank between the modal close and the replay
mounting. `<Link>` would prefetch. **Severity: cosmetic.**

### g. `disqualifyMaze` lacks an event filter index for `flag`

`event MazeDisqualified(uint256 indexed tokenId, bool flag)` indexes
tokenId but not flag. Frontend filter caches that want "give me all
currently-disqualified tokens" can't query by `flag=true` cheaply.
The Indexed event signature change is one keyword. **Severity: low.**

---

## 5. One non-obvious improvement for my area

**Move `MazeRenderer._palette` and the Solidity layout decoder to
generated code, source of truth in `frontend/src/lib/`.**

The Solidity contract is `pure` for both routines. There is no on-chain
state read, no block context, no msg context. They are deterministic
byte-shuffling routines. Solidity is currently the *implementation*
language for two routines whose *specification* lives in TypeScript
fixture files (palette) and in `zkSerialize.ts` (layout). Whenever
either spec changes, two PRs land: one that updates TS (gates ship),
one that updates Solidity (forgotten until a renderer redeploy fails
visual diff). They never land atomically.

Concretely: a small TS→Solidity transpiler for these two routines —
or even just a `forge script` test that reads the TS fixtures and
asserts the Solidity matches — would collapse three sources of truth
into one. The bb.js / Noir circuit already lives at this seam (the
Noir hash and the TS hash agree because pawn made them agree by
hand); the on-chain SVG renderer is the only major surface that has
NOT been pulled into a single-source-of-truth discipline.

This is a 2-day spike, not a refactor. It's worth it because the
class of bug it eliminates (silent palette / layout drift in
`tokenURI`) is the only class of bug in my lane that is invisible to
the prover and silent to CI.

---

## 6. My area's relationship to the whole

The hash-binding seam (pawn's lane) makes the on-chain world believe
the off-chain prover. The visual stack (bishop's lane) makes the
off-chain canvas show the player what they minted. The on-chain SVG
renderer (my lane) is **the third surface that has to agree with the
other two** — and it's the only one a buyer sees in a wallet UI weeks
after mint, after the prover and the canvas have moved on.

Three surfaces. Three palettes. Three layout decoders. Two of the
three are written by polecats who fight cross-layer drift as their
day job (pawn ships a Pedersen mirror; bishop ships a palette mirror).
The third surface — mine — was written without that paranoia, because
when I shipped ma-6cr.7 the regalia split had already happened on the
prover side and I assumed the TS canonical was the spec. It was, but
nobody had written the TS↔Solidity bridge.

The mobile UX work and the WinModal error work are downstream of all
of this in a different way: they are the surfaces a player *touches*.
The prover and the renderer and the palette could all be perfect, and
if the mobile player can't pinch the maze or never sees a mint
failure, the on-chain correctness doesn't reach them. The mint-error
banner and the mobile gesture surface are the seam between "the
contract is correct" and "the user knows it."

The contract surface I added (registrar role, layout storage,
pluggable renderer) was deliberately small and deliberately reversible
— `setRenderer(address(0))` reverts to the base URI; `disqualifyMaze`
flips a bool; layout storage is `bytes` we can re-encode against if
we ever need to. The only one-way door is the **first-minter-binds**
rule on the layout-storage mapping. That door is documented but only
in a contract-level comment. If I were doing this again I'd put it in
the README too.

---

*Filed by polecat rook. ~250 lines as requested. Submitting via the
merge queue.*
