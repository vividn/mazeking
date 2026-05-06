# Mazeking Engineering Retrospective — Polecat Pawn

**Author:** mazeking/polecats/pawn (the polecat that wired up bb.js Pedersen,
shipped the regalia split's frontend half, fixed Anvil's missing multicall3,
and restored the debounced seed preview)
**Date:** 2026-05-06
**Audience:** Mayor's aggregated retrospective for the user.

A blunt, file-level read of mazeking from where I sat. Knight wrote the
general retro at `RETROSPECTIVE-mazeking-polecat.md` — go read that first.
This one only covers what knight didn't, because that's the assignment.

I lived at the **TS↔Noir↔Solidity hash seam** this week: byte-packing,
field-element encoding, palette derivation, and the deploy plumbing that
makes local dev believe the on-chain world. So this retro is biased toward
that seam.

---

## 1. Layers I lived in

In rough decreasing order of time spent:

- **`frontend/src/lib/mazeIdentity.ts`** (109 lines, mostly mine in ma-6cr.8) —
  the bb.js Pedersen wiring. The TS half of the cross-layer hash invariant.
- **`frontend/src/lib/colorGenerator.ts`** (335 lines) — `canonicalPaletteFromHash`
  is a hand-written mirror of `MazeRenderer.sol::_palette`. I added it.
- **`frontend/src/lib/zkSerialize.ts`** (474 lines) — `ProverInput.maze_hash`
  + `move_count` as the public-input pair the circuit declares. The TS map
  used to silently omit `maze_hash` on this branch.
- **`frontend/src/components/HeaderSeedInput.tsx`** (277 lines) — the
  debounced live preview with `requestIdleCallback` scheduling.
- **`scripts/inject-multicall3.sh`** + `frontend/src/lib/wagmi.ts` —
  Anvil's missing multicall3, etched via `anvil_setCode` and declared in the
  wagmi chain config so viem dispatches.
- **`maze_prover/src/hash.nr` ⇄ `mazeIdentity.ts`** byte-alignment work for
  the regalia split (header 16 → 20 bytes; 1516 → 1520 total).
- **`contracts/src/MazeRenderer.sol::_decodeHeader`** — read-only,
  understood it well enough to keep the TS encoder aligned, did not push
  changes here myself.

I touched no Foundry tests. I touched no Noir tests beyond reading them as
oracles for fixture values.

---

## 2. What was harder than expected

### bb.js's Fr-to-bytes32 footgun

`Fr.toString()` returns variable-length hex with leading zeros stripped.
`computeMazeHash` returns a `0x${string}` that gets passed straight into
`mintWithProof` as a `bytes32`. If you reach for `Fr.toString()` instead
of the manual `Fr.toBuffer()` + per-byte `.padStart(2, '0')` path in
`mazeIdentity.ts:68-78`, you produce sub-64-char hex for the ~1-in-256
hashes whose high byte is < 0x10, and viem zero-extends on the wrong
end. Ships green; surfaces in production when "some" mazes won't mint.
One-line encoder fix; took longer than writing the rest of the file.

### The cross-layer Pedersen fixtures

`mazeIdentity.test.ts:63-85` pins two specific 32-byte hex hashes against
specific TS-constructed layouts. Those hashes came out of
`nargo test --show-output` after a temporary `println` in `hash.nr`. There
is no other way to verify TS↔Noir agreement: vitest can't run Noir, and
Noir can't run vitest.

Today this is two fixtures. It should be ten — one per "shape of layout
weirdness" (all-zero, all-0xff, max-width, packed-cells boundary, header
boundary). Adding fixtures is annoying because it requires temporarily
mutating `hash.nr` to print the value, running nargo, copying back. The
fixture pinning is load-bearing for the entire system's correctness and
the workflow to extend it is hand-rolled.

### `generateProverInput` is a hand-typed mirror of the circuit ABI

`zkSerialize.ts:278+` is a string-template TOML emitter. When the
circuit added `maze_hash` as a public input but the TS map omitted it,
the serializer silently produced incomplete TOML and nargo's error
("input not found") didn't say *which* circuit input was missing. The
failure mode is silent on the TS side, obscure on the Noir side.
`mazeConstants.generated.ts` emits *some* constants from
`maze-config.json` but the prover-input *shape* is hand-mirrored —
there's no generated-from-ABI TS interface enforcing the field set.

### Anvil's multicall3 hole

Viem's `publicClient.multicall(...)` works for known chains because
`wagmi/chains.sepolia` ships a `multicall3` address in its chain config.
The Anvil chain object we hand-roll in `wagmi.ts` *also* declares
multicall3 at the canonical address. But Anvil 1.6/1.7 doesn't predeploy
multicall3, so the address is empty bytecode, and viem's call reverts
with `Chain Anvil does not support contract multicall3` — which is
*wrong* (the chain config supports it; the *node* doesn't have it).

The fix needs **both** the wagmi declaration and an `anvil_setCode` etch
of the bytecode. Either alone fails. Worse: `anvil_reset` blows away the
etched bytecode but leaves the wagmi config in place — silently
re-introducing the bug mid-session. There's no `just rehook-multicall3`
recipe that re-etches after a reset.

---

## 3. What was easier than expected

### `BarretenbergSync.initSingleton()` is a clean DX win

One promise to await at app startup (`preloadMazeIdentity()`), then every
subsequent `computeMazeHash` is effectively synchronous from the user's
POV. The first hash on a cold load takes ~hundreds of ms; the rest are
basically free. Pre-warming on app boot in `App.tsx`-equivalent is the
right pattern.

### `anvil_setCode` is the right primitive for "fix the chain"

Writing `inject-multicall3.sh` took 30 minutes. The pattern generalizes:
any time mainnet has a system contract Anvil lacks (Permit2, Universal
Router, ENS reverse resolver, etc.), `anvil_setCode` plus a one-line just
recipe lands it. The script pattern (RPC URL arg, idempotent check via
`eth_getCode`, bytecode in a sibling file) is reusable. We should add
more etch scripts proactively rather than reactively.

### The hash-as-public-input architecture earned itself in week one

Once `mazeIdentity.ts` lined up byte-for-byte with `hash.nr`, the
on-chain palette derivation became automatic — `MazeRenderer.sol`
takes the tokenID (which IS the hash) and `_palette(tokenId)` produces
a hue. No registry, no off-chain lookup, no consistency layer. The
frontend's `canonicalPaletteFromHash` mirrors the same recipe and the
two agree because they're both functions of one number. Knight praised
the architecture in general; what I want to add is that it specifically
made the *palette* problem free. We had four colors (wall, mazeBg,
textBg, zkBg, crownBg) that needed cross-layer consistency for the
"live game matches minted NFT" promise, and we got it for the cost of
one shared formula.

### `requestIdleCallback` for live preview was the right call

Heavy maze regen on every keystroke is unworkable; running it on a
fixed `setTimeout` lag steals the main thread when the user is still
typing. `requestIdleCallback` (with a 300ms debounce on top, immediate
on space) lets the browser decide when generation is cheap. The
generation-counter pattern (`generationRef.current++` to invalidate
stale callbacks) is small but exactly right —
`HeaderSeedInput.tsx:44, 71, 78`.

### `nargo --show-output` is good enough as a fixture oracle

When you can't run two languages in the same test process, the only sane
move is to print values from the canonical implementation and pin them
in the other side's test. The DX is annoying but the *correctness story*
is airtight: TS can't lie about the value because it's pinned to a Noir
emission. We should lean into this pattern, not away from it.

---

## 4. Bugs I noticed but wasn't asked to fix

In rough priority order, file-level:

1. **`MazeRenderer.sol::_palette` and `colorGenerator.ts::canonicalPaletteFromHash`
   are duplicated formulas with no automated check.** The TS comment says
   "MUST match byte-for-byte" but nothing fails the build if they drift.
   A Foundry-or-vitest fixture asserting `_palette(0xdeadbeef)` produces
   the same HSL strings as `canonicalPaletteFromHash('0xdeadbeef')` for
   five seeds would pin it. `bug, p2, contracts/test/MazeRenderer.t.sol`
   (file doesn't exist yet — knight flagged the renderer's lack of
   Foundry tests, this is the specific test that should be added first).

2. **`Fr.toString()` is a footgun.** A future polecat reaching for the
   "obvious" stringifier will produce variable-length hex that breaks
   `bytes32` ABI encoding for one-in-256 hashes. Either wrap it in a
   `frToBytes32(fr)` helper exported from `mazeIdentity.ts` and lint
   for direct `Fr.toString()` usage, or add a unit test that pins the
   output format. `bug, p2, frontend/src/lib/mazeIdentity.ts`.

3. **`anvil_reset` silently breaks multicall.** When dev tools or tests
   reset Anvil mid-session, the etched multicall3 bytecode is gone but
   the wagmi config still claims it's there. `My Mazes` and `Gallery`
   then revert with the misleading "chain does not support multicall3"
   error. Add a `just rehook-multicall3` recipe AND have
   `_ensure-anvil` re-etch idempotently on every invocation, not just
   first start. `bug, p3, justfile`.

4. **`paletteFromHashAndSeed` rng-call order is unpinned.** The richer
   frontend-only color fields (textWall, uiAccent, glows, chrome) are
   determined by the order of `rng.next()` calls in
   `colorGenerator.ts:170-196`. A refactor that reorders those calls
   silently changes every existing maze's live appearance. Pin three
   seed→palette tuples in a snapshot test.
   `bug, p3, frontend/src/lib/__tests__/colorGenerator.test.ts` (test
   file doesn't exist).

5. **`LAYOUT_FIELD_COUNT` is computed twice.** `mazeIdentity.ts:25` does
   `Math.ceil(LAYOUT_TOTAL_BYTES / 31)`; Noir computes its own constant
   in `hash.nr`. If `LAYOUT_TOTAL_BYTES` ever changes (it just did, for
   the regalia split), both sides have to recompute and any drift goes
   undetected until the cross-layer fixture test fails. Emit
   `LAYOUT_FIELD_COUNT` from `mazeConstants.generated.ts` so there's
   one source. `chore, p3, scripts/emit-maze-constants.*`.

6. **The `requestIdleCallback` polyfill is wrong on Safari.** In
   `HeaderSeedInput.tsx:67-68`, the fallback is
   `(cb) => window.setTimeout(cb, 1)` — that runs the heavy maze regen
   on the next tick, blocking the input thread. iOS Safari users will
   feel jank while typing. Use `requestAnimationFrame` or a longer
   `setTimeout(cb, 50)` so typing stays responsive when the browser is
   busy. `bug, p3, frontend/src/components/HeaderSeedInput.tsx`.

7. **`generateProverToml` is a string template.** Adding a new circuit
   input means hand-editing the template (`zkSerialize.ts:278+`). A
   future polecat will forget. The generated TS interface
   (`mazeConstants.generated.ts` companion) should declare the *shape*
   of `ProverInput` from the same source the TOML emitter consumes, so
   "drift" becomes a TypeScript error instead of a runtime "input not
   found in toml". `chore, p2, scripts/`.

---

## 5. Non-obvious improvement (the section knight wouldn't have flagged)

**Treat the cross-layer Pedersen fixtures as a first-class test asset, not
a workflow afterthought.**

Today, the entire correctness of the hash-as-public-input architecture
rides on `mazeIdentity.test.ts:63-85` — two pinned hash values produced
by a temporary `println` in `hash.nr`. If those two pass, the system
works. If a future polecat changes the byte-packing in either language,
the two fixtures should catch it. Maybe they do. Maybe they don't —
both fixtures pack into the *same* bytes-of-the-layout pattern (header
+ first packed-cell). A drift that only manifests in, say, the last
field's zero-padding (the `1520 = 49*31 + 1` carry byte) is invisible
to both fixtures.

The fix isn't more fixtures, it's **a fixture-generation script that's
part of the build, not a hand-rolled debug session**.

Concretely, I'd add `just regen-pedersen-fixtures`:

1. Vitest writes a JSON file of N test layouts (all-zero, all-0xff,
   header-only, packed-cells-only, max-width, header+single-bit, etc.)
   covering byte boundaries we care about: each 31-byte chunk
   transition, the high-bit of each header u16, the trailing-pad byte
   of the last field.
2. The justfile recipe runs a Noir test that reads the JSON, computes
   `compute_maze_hash` for each, prints the hex, and writes
   `frontend/src/lib/__tests__/pedersen-fixtures.json`.
3. `mazeIdentity.test.ts` reads the JSON and asserts every TS-side
   hash matches.

This turns the fixture-generation workflow from "remember to add a
println, run nargo, copy hex by hand" into "run one recipe, get N
fixtures, commit." More importantly, it makes adding a fixture
*cheap*, which means we'll add more fixtures, which means the
TS↔Noir invariant gets more shadow tests for free.

The bonus: the JSON file is self-documenting. A new polecat reading
the file sees "ah, these are the boundary cases that matter for the
byte-packing." Today, the "what's a tricky layout" knowledge lives in
my head, and when this session ends, it's gone.

This is the highest-leverage cross-layer test investment in the repo
right now. Knight flagged "the regalia split bug should be impossible
to ship" and proposed an ABI-drift gate; that's complementary. ABI
drift catches *which fields exist*. Pedersen fixtures catch *whether
the byte-encoding of those fields is identical across languages*. Both
are needed. Knight covered the first; this is the second.

---

## 6. My area's relationship to the whole

Pawn lives at the **byte-encoding seam** between three languages.

Three different implementations of "canonical maze identity" have to
agree byte-for-byte:

- `maze_prover/src/hash.nr::compute_maze_hash` — Noir, inside the
  proof, defines what the verifier is committing to.
- `frontend/src/lib/mazeIdentity.ts::computeMazeHash` — TypeScript +
  bb.js WASM, computes the public input the contract is given.
- `contracts/src/MazeKingNFT.sol::mintWithProof` — Solidity, accepts
  a `bytes32 mazeHash` argument and trusts it because the proof's
  public input pins it.

The contract trusts the proof. The proof trusts the circuit. The
circuit trusts that whatever bytes Noir hashed are the same bytes
that the frontend hashed. Each pairing is a hand-written translation
in a different language, and each pairing has a single integrity
mechanism:

- **Noir ⇄ Verifier**: the circuit and the on-chain HonkVerifier
  are bound by bytecode regeneration (`just generate-verifier`).
- **TS ⇄ Noir**: the cross-layer Pedersen fixtures in
  `mazeIdentity.test.ts`. **Two test cases hold up the whole
  architecture.**
- **TS ⇄ Solidity (palette)**: a comment in
  `colorGenerator.ts:64` saying "MUST match byte-for-byte" and
  visual inspection.

The TS ⇄ Noir seam is the most fragile because it's the seam I
work at most often (the regalia split rewrote it; the bb.js wiring
introduced it; future schema changes will touch it again). Every
cross-layer change is a chance to silently break it. The fixture
tests are the *only* automated thing standing between "ship" and
"every mint reverts on Sepolia."

The TS ⇄ Solidity palette seam is the one I'd worry about *next* —
it's untested today, and the duplicated `_palette` recipe is the kind
of thing a polecat will refactor without realizing they've broken the
"live game matches minted NFT" promise.

The frontend, from this seam's POV, is **two distinct things stapled
together**. Above the seam (UI, components, mobile UX) it's a normal
React app. Below the seam (`mazeIdentity.ts`, `zkSerialize.ts`,
`tokenId.ts`, `mazeGenerator.ts`) it's a *byte-format library*
implementing protocol-level invariants. The two halves have very
different testing needs (snapshot vs. cross-layer fixture), and very
different blast radii of being wrong (one user vs. every mint
forever). They're all `frontend/src/lib/*.ts` today; they should be a
sibling `packages/maze-protocol/` so a UI refactor can't accidentally
touch the proof public-input shape.

---

— pawn
