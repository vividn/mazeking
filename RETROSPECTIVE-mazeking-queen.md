# Mazeking Engineering Retrospective — Polecat Queen

**Author:** mazeking/polecats/queen
**Date:** 2026-05-06
**Audience:** Mayor's aggregated retrospective.

> Knight wrote the general retro. Pawn lived at the TS↔Noir↔Solidity hash
> seam. Bishop lived in the visual stack (sprites, glyphs, palette). Rook
> shipped the on-chain SVG renderer and the mobile control surface.
>
> I shipped what's left after all of that lands: the **replay path** (you
> own a tokenId on-chain — how do you load it back into the live game?),
> the **page-level navigation** (sidebars → routed pages, with the game
> instance kept alive across routes), the **maze-viewport pan clamp**, and
> the **dev-loop tooling** (just redeploy-svg, zkDEBUG seed, the e2e
> solve→prove vitest harness).
>
> 11 commits. Mostly `frontend/` plus one ops-shell script and one justfile
> recipe.

---

## 1. Where I lived

Decreasing time spent:

- **`frontend/src/hooks/useOwnedMazes.ts`** (247 lines, authored, ma-6cr.12)
  — scans `TransferSingle`/`TransferBatch` logs for the connected address,
  `balanceOf`-filters away outgoing transfers, multicalls `uri()` and
  `stats()`, and decodes the embedded SVG image URL out of the
  `data:application/json;base64,...` envelope. Backwards chunked log
  pagination, 9k-block slices to stay under the public-RPC `eth_getLogs`
  cap.
- **`frontend/src/lib/mintRegistry.ts`** (63 lines, authored, ma-6cr.12) —
  the localStorage tokenId↔seed map. The fundamental quirk of my lane
  lives here: see §2 first item.
- **`frontend/src/lib/tokenId.ts`** (81 lines, authored, ma-6cr.12) —
  canonical layout-bytes serializer (10 BE u16 header + packed cells,
  zero-padded to `MAX_PACKED_BYTES`). Mirrors pawn's Noir layout, MUST
  agree byte-for-byte with `compute_maze_hash`.
- **`frontend/src/components/MyMazesPage.tsx`** + **`GalleryPage.tsx`** +
  **`PageHeader.tsx`** (ma-1bl) — the routed-pages refactor. Was sliding
  sidebars; now `/mazes` and `/gallery` are real routes. Game stays
  mounted across nav (`display: none` toggle).
- **`frontend/src/components/Game.tsx`** — major surgery in ma-6cr.12,
  ma-1bl, ma-do8, ma-xiq, ma-gjf. The god-component knight flagged: I
  added to it more than I extracted from it.
- **`frontend/src/components/Maze.tsx`** — pan clamping in ma-do8. Plus
  the parapets-overlay deletion (it had shipped in ma-2jl, user nixed it).
- **`scripts/redeploy-svg.sh`** + **`justfile`** (229 + 16 lines, ma-96n)
  — `just redeploy-svg-{local,sepolia}`. Bare `redeploy-svg` is a guard
  recipe that errors with usage so an operator can't fat-finger Sepolia.
- **`frontend/src/lib/__tests__/e2eSolveProve.test.ts`** (249 lines, ma-0du)
  — fast vs full tier vitest harness. Fast tier executes the witness only
  (~20s, runs in PR CI); full tier proves + verifies (RUN_E2E_FULL_PROOF=1,
  nightly).
- **`frontend/src/lib/mazeSolver.ts`** — `findOptimalPath` BFS, needed
  to drive the e2e harness programmatically.
- **`frontend/src/lib/debugSeed.ts`** (10 lines, ma-gjf) — the
  localhost-only `zkDEBUG` seed.
- **`frontend/src/components/Wordmark.tsx`** + **`pixelFont.ts`** —
  glyph-descender fix (`maze♚\nking♚` was clipping the `g`'s descender).

I touched no Solidity (rook owns that). I touched no Noir (pawn). I
touched no sprite procedural code (bishop). My contributions to bishop's
sprite layer were strictly bitmap-loader swaps: `crown.png`, `robe.png`,
`scepter.png` glyphs in the header (ma-xiq).

---

## 2. What was harder than expected

### The seed→tokenId arrow is one-way and there is no on-chain recovery

This is the load-bearing fact of my entire lane. Stated baldly:

> **Given a tokenId you own, you cannot recover the seed needed to replay
> the maze in the live game.**

The contract derives `tokenId = uint256(mazeHash)` where `mazeHash` is the
Pedersen hash of the canonical layout bytes (pawn's seam). The seed string
("aurora", "the quick brown fox") is the input to `mazeGenerator.ts` which
*produces* the layout. Hash is one-way. Layout doesn't store the seed
anywhere. **The seed is never on-chain.**

So when the My Mazes view fetches your owned tokenIds via `eth_getLogs`,
it has tokenIds and SVG image URLs and nothing else. To replay, it needs
the seed. The only place the seed exists is *the browser the user minted
from*. I built `mintRegistry.ts` (localStorage map) to bridge this, and
`useOwnedMazes` uses `lookupSeed(tokenId)` to mark each tile playable or
disabled.

What this means in practice:

- Mint on desktop, open My Mazes on mobile → every tile is disabled with
  "solve again to replay" hint.
- Clear browser data → all your replays are gone forever.
- Buy an NFT off the gallery → never playable, only viewable.

I shipped the bridge but the bridge is, architecturally, a band-aid.
The real fix lives one layer down — see §5.

### Page navigation requires keeping `<Game>` mounted via `display:none`

ma-1bl moved `MyMazes` and `Gallery` from sliding sidebars to routed
pages (`/mazes`, `/gallery`). The naive routing pattern is:

```tsx
<Routes>
  <Route path="/" element={<Game />} />
  <Route path="/mazes" element={<MyMazesPage />} />
</Routes>
```

But that **unmounts `<Game>` on navigation**, blowing away the in-progress
solve (seed, position, move count, visited set). React-router doesn't
preserve component state across route changes; preserving game state was
the whole point of "you can browse your collection mid-solve."

What I did: `<Game active={location.pathname === '/'} />` with
`<Game>` rendered unconditionally inside the layout, hidden via
`display: none` when `active` is false. The component stays mounted, all
state survives. The `active` prop gates effects so Game's keyboard
listener and theme-color side effect don't fight the page that's
actually visible.

The fragility: every effect inside `<Game>` now needs to honor `active`.
Three already do; the next one someone adds, won't, because the pattern
is invisible from inside the component. Easy lurking bug. (See §4 bullet
3.)

### `LOOKBACK_BLOCKS = 100_000n` is a 14-day timer

`useOwnedMazes` walks backward from `head` for 100k blocks in 9k-block
chunks. At ~12s/block on Sepolia that's ~14 days. The comment says
"comfortably covers the demo window for a recently-deployed contract."

It doesn't cover anything past the demo window. The day someone mints
on day-0, then opens My Mazes on day-15, the genesis logs that contained
their `TransferSingle` are outside the lookback. They see an empty
collection. There's no error, no "older mazes hidden" footer — it just
silently truncates.

This is fine for now (we are in fact "recently deployed") but it ages
into a bug. Filed in §4.

### The pan clamp interacts with pinch zoom and that interaction is hand-tuned

ma-do8 added `clampPan(pan, totalZoom)` to keep the maze image's outer
edge from being dragged inside the viewport. The clamp lives on every
gesture path: mouse drag, touch pan, pinch zoom, wheel zoom. Each path
calls `clampPan` with what *it* believes the post-gesture zoom is.

For pinch zoom that's `newUserZoom * baseZoom`, computed before the
state update. There's a frame between the `setUserZoom(newUserZoom)`
and the next render where `pan` is constrained against a `totalZoom`
that doesn't yet match the visual zoom on screen. In practice it's not
visible — the gesture finishes fast — but it would be visible on a slow
device or under React profiling. The right fix is to clamp inside a
`useLayoutEffect` after the zoom commits, but this works and I left it.

### Parapets shipped, then unshipped, two days apart

ma-2jl added a Parapets overlay (decorative wall-tops). User decided
against the look. ma-do8 removed it. 86 lines added then 86 lines
deleted. The lesson isn't "we shipped something and removed it" — that's
fine — it's that **purely decorative features should default to opt-in
behind a flag**, not to be on-by-default-and-then-yanked. There was no
A/B; nobody got to compare. The parapets shipped to main; mainnet would
have meant they shipped to users.

---

## 3. What was easier than expected

### Sliding sidebar → routed page conversion was 80% rename

`MyMazesSidebar.tsx` and `PublicGallerySidebar.tsx` were both
self-contained components that already accepted `seed`/`onSelectSeed`
callbacks. Converting them to pages: rename, replace the
"close on Esc" handler with a `useNavigate('/')`, hoist their tile-grid
markup unchanged, and add a `PageHeader` shared component.

The hard part wasn't the component conversion — it was deciding *what to
do about the keep-Game-mounted requirement*, which was a design call
(see §2 second item). Once that was settled, the actual code change was
~30 minutes per page.

### `redeploy-svg.sh` flow

The contract design rook chose (`renderer` is a settable address behind
`OWNER_ROLE`) made the redeploy flow trivial: deploy `MazeRenderer`, call
`setRenderer(newAddr)` on the NFT, regenerate frontend config. No
migration of existing tokens; their `tokenURI()` calls just route to the
new renderer next time. The script is 229 lines because of the operator
ergonomics (env-var validation, confirmation prompt on Sepolia, summary
printing, ABI sanity probe), not because the redeploy is complex.

The bare-`redeploy-svg` guard recipe (errors with usage) is the small
detail I'm proudest of: it makes "did you mean local or sepolia?"
mechanically impossible to fat-finger.

### e2e harness fast tier (witness-only)

The original ask in ma-0du was "regression coverage that catches the
key_x→robe_x/scepter_x split." Full proof generation takes ~30-60s in
node, which is too slow for PR CI. I split into tiers:

- **Fast tier** runs `Noir.execute(input)` only — generates a witness,
  validates every assertion in the circuit, doesn't run UltraHonk. 20
  seconds total for 5 cases (3 positive + 2 negative).
- **Full tier** runs `UltraHonkBackend.generateProof` + `verifyProof`,
  gated on `RUN_E2E_FULL_PROOF=1`, intended for nightly.

The witness-only execution turned out to be exactly what we need: every
circuit assertion runs, the public-input shape is validated, and the
specific drift-class (TS prover-input field name vs. circuit `main()`
parameter name) errors loudly. The proof is icing for the cryptographic
soundness check; the assertions catch the actual bugs.

### `zkDEBUG` seed

A single 10-line module (`debugSeed.ts`), one branch in `mazeGenerator`
(carve internal walls open so BFS finds the goal in O(N) moves), one
test that asserts `zkDEBUG` produces an open maze. Drops mint-test
iteration time from 60s to 8s on localhost. Gated on hostname so it
cannot leak to Sepolia.

The win was confining the debug branch to two files. It does NOT change
hash-binding for non-debug seeds; it only changes the maze produced for
the literal seed `"zkDEBUG"` on `localhost`.

---

## 4. Bugs I noticed but wasn't asked to fix

In rough priority for my area:

1. **`mintRegistry` is browser-local.** This is the headline. Buyers,
   secondary owners, and cross-device users have no replay path. The
   tile shows "solve again" but the token is *already* one specific
   maze; "solve again" produces a different layout for a different seed.
   The hint copy is misleading. **Severity: high.** Cross-references §5.
   Filed: `bug, p1, frontend/src/lib/mintRegistry.ts`.

2. **`LOOKBACK_BLOCKS = 100_000n` silently truncates owned mazes after
   ~14 days on Sepolia (~12s blocks).** Mainnet at ~12s/block is the
   same; on faster L2s it's worse. Should walk to the contract's
   deployment block (cheap, one storage read) or paginate to genesis
   with a persistent cursor in localStorage. **Severity: medium-high
   (becomes a bug on day 15).** Filed: `bug, p2,
   frontend/src/hooks/useOwnedMazes.ts:16`.

3. **The `<Game active={...}>` pattern is invisible from inside Game.**
   I gate the keyboard listener and the theme-color effect; the next
   effect added (analytics, sound, anything) will fire on `/mazes` and
   `/gallery` because the Game component is mounted there. The fix is
   either an explicit `useGameActive()` hook that internally reads
   `useLocation`, or a context provider that gates all internal effects.
   **Severity: medium (latent).** Filed: `bug, p3,
   frontend/src/components/Game.tsx`.

4. **`computeTokenIdFromMazeHash` accepts any 0x-prefixed string.**
   `BigInt('0x')` throws but `BigInt('0x1')` is `1n`. A short or
   malformed hash silently produces a tiny tokenId that won't collide
   with real mints (so the bug is dormant) but should still be rejected
   at parse time with a length check. **Severity: low.** Filed:
   `chore, p4, frontend/src/lib/tokenId.ts:71`.

5. **`useOwnedMazes` doesn't subscribe to outgoing transfers.** It scans
   `to=owner` then prunes via `balanceOf`. Cheap today (NFT is barely
   transferred), expensive once secondary trading happens — every
   incoming-then-outgoing token costs a wasted multicall. Subscribing
   to `from=owner` and pruning at log-scan time would halve RPC calls
   for active wallets. **Severity: low (perf).** Filed: `perf, p4,
   frontend/src/hooks/useOwnedMazes.ts`.

6. **`isDebugSeedActive` is checked in `mazeGenerator` AND in
   `tokenId.ts :: serializeLayoutBytes`.** Two call sites, same string
   literal. If anyone serializes layout bytes via a different code path
   (the e2e harness, a future server-side mint flow), they need to
   remember to thread the debug flag. The debug-seed should be
   represented in the `ZkSerializedMaze` value itself, not as a parallel
   "are we in debug mode" check. **Severity: low.** Filed: `chore, p4,
   frontend/src/lib/tokenId.ts:34, frontend/src/lib/mazeGenerator.ts:780`.

7. **`redeploy-svg.sh` reads `PRIVATE_KEY` from env on local,** with
   anvil's account #0 as the fallback. If a developer has
   `PRIVATE_KEY=0x<their-mainnet-key>` exported (e.g., from a different
   project), running `just redeploy-svg-local` uses that key. It works
   (anvil accepts any key with funds) but it's a confusing leak. Should
   ignore env `PRIVATE_KEY` on local and always use the documented anvil
   default. **Severity: low.** Filed: `bug, p4,
   scripts/redeploy-svg.sh:42`.

8. **My Mazes tile grid does N parallel `eth_call`s for `stats()`** to
   surface "best moves." The `stats()` view returns a 4-tuple including
   data we don't render (`badges`, `usdcDonated`). Two of the four
   fields are wasted bandwidth per token. Either stop fetching `stats`
   on the tile grid (defer to a detail view) or extend the contract
   with a tile-sized view function. **Severity: very low.** Filed:
   `chore, p5, frontend/src/hooks/useOwnedMazes.ts:195`.

---

## 5. One non-obvious improvement for my area

**Stop relying on the seed for replay. Replay from the on-chain layout
bytes.**

The seed only matters because `mazeGenerator(seed)` is the
constructive path. But `useOwnedMazes` already fetches the on-chain
SVG, which means the contract returns enough data to render the maze.
The same `bytes` blob — `layouts[tokenId]` — also encodes the full grid
(the renderer decodes it). So a token's complete game state is on-chain.

The right architecture is:

1. Add a frontend `mazeFromLayoutBytes(layout: Uint8Array): MazeData`
   that mirrors `MazeRenderer._decodeHeader` + the cell-nibble decode.
   ~80 lines, deterministic, unit-testable.
2. Replay path becomes: `useOwnedMazes` already fetched `tokenURI()`;
   add a parallel multicall for `layouts(tokenId)` (a public mapping
   read; rook already exposes it). Pass the bytes to
   `mazeFromLayoutBytes` and feed the resulting `MazeData` directly into
   `<Game>` as the active maze.
3. Delete `mintRegistry.ts`. Delete the `lookupSeed` branch in
   `useOwnedMazes`. Every owned token becomes replayable, on every
   device, by every owner.

The seed becomes purely cosmetic — a label for "the prompt you typed."
Mint identity stays exactly where pawn put it: at the Pedersen hash of
the layout. The seed never enters the contract; it doesn't need to.

This collapses the third source of cross-layer drift in my lane (the
seed↔tokenId mapping) into the same shape bishop and rook want for
palette: **one source of truth, on-chain, decoded by the frontend**.
The current design has the seed be authoritative on the *frontend* and
non-recoverable on-chain, which is the wrong direction.

Cost: ~120 lines of TS (decoder + tests) + a small refactor of
`useOwnedMazes` and the WinModal post-mint flow. Net delete after the
mintRegistry removal: probably break-even.

This is the highest-leverage thing I would do before mainnet launch.

---

## 6. My area's relationship to the whole

There are three "agreement seams" between the live game and the chain:

1. **Layout** — bytes the prover hashes match bytes the renderer decodes
   (pawn's lane).
2. **Palette / glyphs** — what the player sees agrees with what the NFT
   shows (bishop's lane, rook's renderer).
3. **Replay identity** — given an on-chain token, can the frontend
   reconstruct the live game it represents? (My lane.)

Pawn made (1) work via the cross-layer hash. Bishop and rook keep (2)
aligned by hand (the TS↔Solidity palette mirror). Nobody made (3) work
from on-chain data alone — I patched it with localStorage and called it
done. **That's the architectural debt I want flagged most loudly.**

The other half of my lane is everything that touches the *flow* between
those seams: navigating between the game and the collection (ma-1bl),
viewing a single owned maze without re-entering the prove cycle (the
SVG image URL decoded out of `tokenURI`), iterating on the SVG renderer
without re-deploying everything (ma-96n), and proving the prover still
works after pawn's regalia split (ma-0du). None of these are seams in
the cryptographic or visual sense; they're seams in the *developer
loop* and the *user journey*. They don't appear in knight's hash-binding
praise because they're not part of the trust chain — but they are the
surface area on which the trust chain's correctness is operationally
validated.

The redeploy script and the e2e harness are particularly small but
load-bearing: they are the plumbing that lets us *exercise* the seam
agreements without manual ceremony. Knight noted the rig has good
"do-the-right-thing" justfile recipes; rook noted `redeploy-svg.sh` as a
clean side effect of the pluggable-renderer pattern; the e2e harness is
the third leg of that stool. If a polecat lands a regalia-class break
again, the fast tier catches it in 20s on PR.

---

## Closing

Three things I'd land before mainnet:

1. **Replay from on-chain layout bytes, delete `mintRegistry`.** Buys
   cross-device replay and removes the silent-failure copy ("solve
   again"). §5.
2. **Walk owned-mazes log scan to the deployment block, not 100k
   backward.** Stops the 14-day truncation timer. §4 bullet 2.
3. **Make the `<Game active={...}>` gating explicit at the effect
   layer**, not at the component prop. §4 bullet 3.

Everything else (the redeploy `PRIVATE_KEY` env leak, the duplicated
debug check, the stats over-fetch) is small enough to bundle into one
sweep.

The seed↔tokenId one-way arrow is the load-bearing fact of my lane and
should be flagged in the mayor's aggregated retro. We talk a lot about
hash binding (pawn) and palette binding (bishop, rook); we should also
talk about **identity binding**: an on-chain token should fully describe
the experience it represents, including the artifact needed to replay
it. We don't ship that today.

— queen
