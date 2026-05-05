# Mazeking Engineering Retrospective — Polecat Knight

**Author:** mazeking/polecats/knight (polecat with hands on this codebase across
the regalia split, mint-UX, mobile UX, and SVG-renderer redeploy work this
week)
**Date:** 2026-05-05
**Audience:** Mayor's aggregated retrospective for the user.

A blunt, file-level read of mazeking. I've pushed code into nearly every
layer this week — circuit, contracts, frontend, deploy scripts — so where I
have an opinion, I have it.

---

## 1. What's working well

**The cross-layer hash binding is the single best architectural decision in
this repo.**

`maze_prover/src/hash.nr` defines a canonical 1520-byte layout
(20-byte header + 1500 packed cells), packs into 50 BN254-field chunks at 31
bytes apiece, and Pedersen-hashes them. The frontend (`mazeIdentity.ts`
+ `tokenId.ts`) computes the *exact same* hash via bb.js, and the on-chain
contract just trusts whatever `mazeHash` the caller passes — because the
proof's public input pins it. This means:

- TokenID ≡ mazeHash. There is no separate registry to keep consistent.
- Anyone can audit a mint by re-hashing the layout and checking equality.
- Layout storage is keyed off a value that the prover *cannot lie about*.

`MazeKingNFT.sol:108-183` (the big `mintWithProof`) is the cleanest
crypto-economic boundary in the project. It does the minimum and trusts the
proof. Good shape.

**`useMintNFT.ts` is well-engineered.** The pre-flight `simulateContract`
call before `writeContract` (introduced in ma-6ff) means a verifier revert
surfaces with its real reason instead of as `IntrinsicGasTooHighError`.
`formatMintError` (ma-q7n) is the kind of error-categorization helper
you usually wish you had earlier — it walks viem's BaseError chain and
maps `UserRejectedRequestError`, `ContractFunctionRevertedError`,
`TimeoutError`, `HttpRequestError` into short user-facing strings. This
pattern should be the template for any future Web3 hooks here.

**Foundry tests are dense and well-organized.** `contracts/test/MazeKingNFT.t.sol`
is 659 lines, uses a `MockVerifier` with a flag toggle, and exercises the
full `mintWithProof` lifecycle including stats accrual, badge bitfield, and
admin gates. 21 tests that actually mean something.

**The `just`-based build system is genuinely good.** A single `justfile`
unifies Noir compile (via `noir_wasm`, no native nargo required for the
critical path), forge build, ABI sync, contracts.generated.ts emission, and
verifier regen. `just compile-circuits` "do the right thing" semantics — sync
ABIs, write `mazeConstants.generated.ts`, copy circuit JSON to
`frontend/public/circuit/` — keeps the cross-layer artifacts moving as a
unit. The `just redeploy-svg-{local,sepolia}` recipe (ma-96n) was added
exactly because we kept redeploying the renderer manually and forgetting to
re-point the NFT.

**`maze-config.json` as a single source of truth for circuit constants** is a
small but huge win. `MAX_MAZE_CELLS=3000`, `MAX_MOVES=1000` are emitted into
`mazeConstants.generated.ts` (frontend), `MazeConstants.sol` (contracts), and
referenced in `main.nr` globals. Drift between the three was a real risk
and this catches it.

**Tests I trust:**

- `frontend/src/lib/__tests__/e2eSolveProve.test.ts` (ma-0du) — runs
  `Noir.execute()` on the actual compiled circuit with the actual
  TS-side prover input. This is the single most important regression test
  in the repo. It catches exactly the class of bug that bit us during the
  regalia split (TS field names drifted from circuit ABI).
- `mazeIdentity.test.ts` — pins the cross-layer Pedersen fixture
  values printed by `nargo test test_print_fixtures`. If the TS-side hash
  ever stops matching Noir, this fails immediately.
- `nargo test` in the maze_prover crate — `should_fail` tests for
  miss-robe, miss-scepter, miss-both, wrong-destination, wrong-hash. Tight.

**Modules where adding a feature feels easy:**

- Pixel font (`pixelFont.ts`, 937 lines but flat data): clean. Add a
  glyph, maze layout updates correctly through `getCharacterBoundaries`.
- `colorGenerator.ts`: deterministic; can derive a new palette variant
  without touching anything else.
- `useGalleryMazes.ts` / `useOwnedMazes.ts` follow the same shape, easy
  to add a new "view of mints" without rewriting RPC plumbing.

---

## 2. What's gnarly — the four-layer cascade

The recurring pain is what I'm calling **the regalia chain**: any change to
the maze schema cascades through four layers in a fixed order, and skipping
a step leaves the system silently broken.

```
maze-config.json / Noir circuit ABI
        │
        ▼
maze_prover.json  ──(noir_wasm build)──>  frontend/public/circuit/
        │
        ▼
TS prover input shape (zkSerialize.ts, generateProverInput)
        │
        ▼
Pedersen hash header layout (hash.nr ⇄ tokenId.ts)
        │
        ▼
On-chain verifier bytecode (generated/MazeVerifier.sol)
        │
        ▼
Deployed verifier address (just redeploy + setVerifier)
        │
        ▼
NFT renderer header decode (MazeRenderer.sol)
```

**The split-key → robe+scepter migration (ma-3rr → ma-6ff) hit every link.**
It required:

1. `main.nr` — add `robe_x/y, scepter_x/y` parameters; both-collected
   assertion.
2. `hash.nr` — bump header from 16 to 20 bytes (8 → 10 u16s); recompute
   `LAYOUT_TOTAL_BYTES = 1520`, `LAYOUT_FIELD_COUNT = 50`.
3. Recompile circuit, regenerate verifier (`just generate-verifier`).
4. `zkSerialize.ts` / `tokenId.ts` — match the new header byte-by-byte.
5. Frontend `Game.tsx` placement, `Maze.tsx` rendering with separate
   robe/scepter sprites.
6. **Deploy a new on-chain HonkVerifier** because the verification key is
   baked into bytecode.
7. `setVerifier` on the NFT to repoint at the new verifier.
8. `MazeRenderer.sol` decoder — re-deploy + `setRenderer` (ma-96n).
9. ABI sync to `frontend/src/lib/abi/MazeKingNFT.json`.

**Skipping step 6 was the bug we shipped.** The on-chain verifier still
expected the old 8-u16 header; new proofs reverted with no useful message.
ma-6ff added the simulate-on-mint pre-flight to catch this faster, but the
underlying problem — that *circuit ABI changes silently invalidate the
deployed verifier* — is still there.

**Other cascades I've seen this week:**

- ma-e7r dropped character/pickup/goal overlays in the SVG renderer. That's a
  pure-Solidity-render change with *no* circuit/frontend impact, but it
  still required ma-96n (redeploy + setRenderer) to land. The deploy story
  for "renderer-only changes" got better but is still a manual recipe.

- Mobile UX (ma-q1u, ma-7kw, ma-8ls) sprawled across `Game.tsx` (980
  lines), `Maze.tsx` (1177 lines), `HeaderSeedInput.tsx`, `WinModal.tsx`
  (823 lines), `Controls.tsx`, `SeedBar.tsx`. These four files
  collectively own "how the game looks on a phone" and there is no single
  place to reason about it.

**Where boundaries blur:**

- `mazeGenerator.ts` (837 lines) is the deterministic *layout* source of
  truth, *and* it knows about pixel-font wordmark margins, *and* it has
  opinions about how text cells are placed. Same code path renders the
  word INTO the wall and then also writes derived layout for the circuit.
  If wordmark layout changes, the maze hash changes, which means tokenIDs
  change for the same seed. That coupling is invisible.
- `seedPhrases.ts` (627 lines) is a static word list, but it's
  load-bearing for tokenID semantics: the seed → maze → hash → tokenID
  pipeline means *changing how seeds normalize* breaks every existing
  mint's identity. There's nothing in the file that warns about this.

---

## 3. Test gaps

**The solve→prove→mint critical path is half-tested.**

What `e2eSolveProve.test.ts` covers:
- Solve (`findOptimalPath`)
- Serialize (`serializeForZk` + `serializeLayoutBytes`)
- Hash binding (`computeMazeHash`)
- Prover input shape (`generateProverInput`)
- Witness execution via `Noir.execute()`
- Optionally: full UltraHonk proof + verify (`RUN_E2E_FULL_PROOF=1`)

What it does NOT cover:
- **`mintWithProof` against a real deployed verifier.** That's a vitest
  no-go because it needs anvil + a 200KB+ HonkVerifier deployed. Belongs in
  `scripts/integration-test.sh`, but I haven't read it deeply enough to
  vouch for what it actually asserts. If it doesn't run on CI, the
  verifier-drift bug from ma-6ff can recur.
- **Mint failure modes.** `useMintNFT.ts` has a real error surface
  (`formatMintError`) and exactly one unit test (`formatMintError.test.ts`).
  Untested: simulate revert, write rejection, receipt timeout, RPC outage,
  wrong chain, contract not deployed. Each of those was hit live during the
  Sepolia push.
- **SVG renderer correctness.** `MazeRenderer.sol` is 326 lines of
  bytecode-tight string-building Solidity, *and there are no Foundry tests
  for it*. The `tokenURI` ABI decode is hand-written. A 1-byte off-by-one in
  `_decodeHeader` would break every mint's image silently and we'd find
  out from a user.
- **On-chain state assertions after `mintWithProof`.** The Foundry tests
  check stats + balanceOf, but I don't see a test that asserts
  `layouts[tokenId]` is the exact bytes the caller passed (only that it's
  non-empty, IIRC). Subtle but: a malicious caller can pass a layout that
  *doesn't match* the proven hash and the contract stores it (option α).
  This is documented as accepted-by-design in the contract NatSpec, but
  it's a footgun for renderer correctness — needs a regression test that
  asserts "valid mint with mismatched layout still mints, but renderer
  produces gibberish" so the behavior stays load-bearing.
- **Mobile UX.** Zero automated coverage. Every mobile change (ma-q1u,
  ma-7kw, ma-8ls, ma-bd9, ma-pfv) was visual smoke-tested. The
  `WinModal.tsx` viewport-fit work (ma-20j, ma-hkq) is exactly the kind
  of thing Playwright snapshot tests would have caught, and we've burned
  two cycles of "wider modal → still scrolls on iPhone SE" already.
- **`mazeGenerator.ts` text-embedding correctness.** 837 lines, generates
  a maze by carving paths around pixel-font glyphs. There is *one*
  `mazeGenerator.test.ts` and it does not assert that "the word is
  readable in the resulting maze" — only structural invariants. Visual
  regressions (margin too tight, text cells colliding with goal
  placement) get caught by hand.

**Specific tests I would write tomorrow:**

1. Foundry test for `MazeRenderer.tokenURI` golden-decode against a
   layout produced by the TS encoder.
2. Vitest snapshot for the SVG output of a deterministic seed
   (frontend has the SVG renderer logic mirrored… actually it doesn't
   anymore, since ma-e7r dropped the overlays. The on-chain SVG is
   now the *only* SVG. Even more reason to test it.)
3. Playwright e2e: seed → solve → win → mint button visible → click
   → mock-wallet sign → success modal. We have all the pieces; nobody
   has wired the harness.

---

## 4. Architecture observations

### Frontend (TSX components, hooks, lib)

**State is implicit and prop-drilled.** No Redux / Zustand / Jotai. State
lives in `Game.tsx` (980 lines, 12+ `useState` hooks) and gets passed down.
Adding a new piece of game state means another `useState` in `Game.tsx`
and another prop on `Maze.tsx` (which already has 14+ props). This works
*today* but every new feature widens the prop surface. The component is
near the limit of "comprehensible by reading top-to-bottom."

**`Maze.tsx` (1177 lines) is the boss-level component.** It owns canvas
rendering, pinch-zoom, mouse wheel zoom, click-drag pan, touch transform,
double-tap, the "kingly hint" speech bubble, sprite placement, visited
overlay, and `forwardRef` for `resetView`. It compiles, it works, but
splitting `MazeCanvas` (rendering) from `MazeViewport` (transform/input)
would be defensible.

**Hook layering is okay but inconsistent.**
- `useMintNFT` is a clean wrapper around `useWriteContract` +
  `useWaitForTransactionReceipt`.
- `useGalleryMazes` (294 lines) does its own multicall fetching and
  caching with raw wagmi.
- `useOwnedMazes` (247 lines) does similar work with overlapping
  patterns. There's an extractable "fetch-by-tokenId-list" primitive
  that would deduplicate ~150 lines.

**`pixelFont.ts` (937 lines) is data masquerading as code.** Per-glyph
bitmaps in TS object literals. It's fine, but if anyone wants to add
characters, they're hand-editing arrays. A JSON file + codegen would be
nicer; not urgent.

**`zkSerialize.ts` / `tokenId.ts` overlap.** `zkSerialize.ts` (474 lines)
serializes maze data into the prover input shape; `tokenId.ts` (81
lines) wraps `serializeLayoutBytes`. The 20-byte header layout is
defined in *three* places by my count — `hash.nr`, `zkSerialize.ts`,
`MazeRenderer.sol` — with comments saying "must match." That's the
classic "domain logic in three forms" trap.

### Circuit (`maze_prover/src`)

**The circuit is small and clean.** ~1200 lines across 5 files
(`main.nr`, `position.nr`, `walls.nr`, `hash.nr`, `types.nr`).

- `position.nr` handles toroidal wraparound; deserves a minor reader's
  guide — modular arithmetic on `width`/`height` is non-obvious.
- `walls.nr` does the bit-decode of packed cells. Symmetric: reading the
  east wall from cell (x,y) requires reading either (x,y) or (x+1,y)
  depending on direction. This is in the comment but it's the bit I'd
  re-verify if I had to touch it.
- `main.nr` test coverage is good (8 tests, mix of `should_pass` /
  `should_fail`). Tests for "start on robe", "start on both regalia",
  "wrap-around solution" are all real edge cases.

**Circuit tech debt:**

- `MAX_MAZE_CELLS = 3000` is a global. Going to 4000 means re-proving
  every constraint and re-deploying the verifier. We're paying constraint
  cost for the worst-case maze on every proof. A two-tier circuit
  ("small" and "big") would let typical mints prove faster, but that's a
  significant refactor (two verifiers, dispatching mint, etc.). Probably
  not worth it until proof time becomes a UX complaint.
- `MAX_MOVES = 1000` is also a global; same constraint issue.
- The `for i in 0..MAX_MOVES` with `if i < move_count` shape is the
  standard Noir bounded-loop idiom but it means we always pay the cost
  for 1000 moves even when the user solved in 50. Same flat cost issue.
- `compute_maze_hash` rebuilds the canonical layout buffer in-circuit
  on every proof. This is unavoidable given the design (the hash binding
  is the proof's whole job at the public-input layer), but the 1520-byte
  buffer copy isn't free in constraint count. Worth a measurement.
- `pedersen_hash` (BN254) was the right choice for cross-layer
  compatibility with bb.js, but Poseidon would be cheaper in the circuit.
  Trade-off taken consciously, IIRC.

### Contracts

**The split is right.**
- `MazeKingNFT.sol` — token + stats + admin.
- `DefaultBadgeAwarder.sol` — pluggable badge logic, can be swapped via
  `setBadgeAwarder`.
- `MazeRenderer.sol` — pure-view SVG renderer, can be swapped via
  `setRenderer`.
- `MazeConstants.sol` — generated single-source-of-truth bridge to the
  config JSON.
- `IBadgeAwarder.sol`, `IVerifier`, `IMazeRenderer` — small, focused
  interfaces. No bloat.

The pluggability of awarder + renderer + verifier is the right move; we
exercised it in ma-6ff (verifier swap) and ma-96n (renderer swap) and
the contract didn't have to change.

**Contract debt:**

- `disqualified` mapping is a per-tokenID admin override. Unbounded
  storage growth (one slot per disqualified maze, indefinitely), unset
  retention policy, no access events for *who* disqualified. Fine for now,
  problematic at scale.
- `officialMazes[seedHash]` registry duplicates information that is
  already implicitly available (any seed has a deterministic tokenID). The
  registry primarily serves the `BADGE_REGISTERED` semantics. Worth
  documenting why this isn't redundant.
- No `ERC1155URIStorage` per-token URI override; the renderer is
  global. Once we want per-token "themed" renders (anniversary mint,
  promotional palette), this needs another indirection. Fine for v1.

### Deploy / DevOps

**The deploy story is fragile.** Reality:

1. `just deploy-local` works well for fresh local dev; it deploys
   verifier + NFT + awarder + renderer and writes
   `frontend/src/lib/contracts.local.ts` (gitignored). Solid.
2. **Sepolia deploy is partially manual.** Recent commits include
   "deploy to sepolia", "deploy new zk logic on chain", "Recompile
   circuit for robe+scepter ABI" — these are not script-driven, they're
   hand operations that left commits. The contracts.generated.ts file is
   committed by hand after each deploy.
3. **Renderer-only redeploys** got a recipe (ma-96n) but that's the
   exception that proves the rule: every deploy class needs its own
   recipe.
4. **Verifier-only redeploys** when the circuit ABI changes don't have
   a clean recipe yet. The pattern is "regenerate verifier, deploy via
   forge script, capture address, call setVerifier on NFT, update
   contracts.generated.ts." That's the ma-6ff playbook and it's still in
   the surgeon's head, not in code.
5. **statichost.eu** frontend deploys are env-var dances per the
   bead description — not in this repo, so I can't audit, but given that
   `wagmi.ts` reads `VITE_*` env vars for chain RPC URLs, a typo in a
   single env var produces a confusing "no chain" runtime error.

**What I would prioritize for production launch:**

- A `just deploy-sepolia` recipe that does the full
  verifier → NFT → awarder → renderer dance and writes contracts.generated.ts.
- A `just upgrade-verifier-{local,sepolia}` recipe to avoid the
  manual `setVerifier` step.
- An integration-test that runs `forge script` against a fresh anvil,
  generates a real proof, and mints. If `scripts/integration-test.sh`
  doesn't already do this end-to-end, it should.
- CI that re-runs `nargo test`, `forge test`, `vitest`, AND
  `e2eSolveProve.test.ts` (full tier with `RUN_E2E_FULL_PROOF=1`) on
  every PR. The E2E test is the only thing that catches the silent
  cross-layer drift that bit us.

---

## 5. ZK / circuit-specific debt

**Things that are right:**

- Pedersen choice for cross-layer compatibility.
- Hash binding architecture (`mazeHash` as public input, layout as
  private witness, contract trusts caller's layout because the hash
  pins it).
- Test coverage in `nargo test` is unusually thorough for a Noir
  project this size.
- The `verify_solution` function is split out from `main` so tests can
  call the path-validity check without running the hash binding.

**Things that are suspect:**

- **Witness construction lives in TS, not in a tested utility.**
  `generateProverInput` in `zkSerialize.ts` builds the InputMap by
  field name. If a field name in `main.nr` is renamed and we forget to
  update the TS, `Noir.execute()` rejects the input *at runtime* — but
  there's no compile-time check. The e2e test catches this if it runs.
- **`compute_maze_hash` always pads to 1500 bytes.** Even a 10x10
  maze pays the full hash cost. This is the only sensible choice given
  fixed-size circuits, but it's an N^2-ish floor on proof time per
  user. ZK perf optimization is generally not worth it pre-launch, but
  it's a known cost.
- **The "start on collectable" test (`test_start_on_both`)** sets
  robe and scepter at the *same cell* and counts both as collected at
  start. This is documented behavior but I doubt the frontend ever
  generates such a maze — the in-circuit assertion is more permissive
  than the frontend's invariant. Either tighten the circuit (forbid
  same-cell robe+scepter) or document that the frontend's
  `generateMaze` is the authoritative deduper.
- **Direction encoding (`DIR_UP=0`, `DIR_RIGHT=1`, etc.)** is
  triplicated: Noir constants, TS `Move` enum, the JS-side
  `DIR_UP/DIR_RIGHT/DIR_DOWN/DIR_LEFT` constants in `zkSerialize.ts`.
  Fourth copy: implicit in the verifier bytecode. We rely on three text
  comparisons-by-eye to keep them aligned. They've never drifted, but
  one disorderly refactor away.
- **`assert(direction <= DIR_LEFT)`** is the only sanity check on the
  move byte (other than the wall check). With `DIR_LEFT = 3`, this
  works out to "any byte 0–3," but "DIR_LEFT" being the upper bound is
  a coincidence of how the constants happen to be ordered. If anyone
  reorders them, the assertion silently changes meaning.
- **Proof size + on-chain verify gas.** UltraHonk verifier on Sepolia
  is the dominant gas cost of `mintWithProof`. We haven't (that I've
  seen) measured the gas cost or considered batching mints. Probably
  fine for v1; will become a competitive issue if mainnet.

---

## 6. Frontend debt

Beyond what's in §4:

- **`Game.tsx` is the load-bearing god-component**, reaches 980 lines.
  Every piece of game state, every keyboard handler, every mobile
  detection, every mint orchestration lives there. Splitting along the
  natural seams — `useGameState` (custom hook), `useMobileDetection`
  (already inlined in 5+ places via `window.innerWidth <= 768`),
  `useGameKeyboard` — would substantially reduce file weight without
  changing behavior.
- **Mobile detection is inconsistent.**
  `window.innerWidth <= 768 || 'ontouchstart' in window` appears in
  `Game.tsx`, `Maze.tsx`, `WinModal.tsx`, `HeaderSeedInput.tsx`, and
  probably more. Should be one hook.
- **`WinModal.tsx` is 823 lines** because it's the modal *and* the
  mint orchestrator *and* the share-card *and* the
  view-collection-button *and* the success state. Three sub-components
  (MintBlock, ShareBlock, NavBlock) would be obvious.
- **`Controls.tsx` (474 lines)** for what is at heart "four arrow
  buttons + a help panel" suggests we built the help-panel into the
  controls component instead of factoring it out.
- **Wagmi viem version drift risk.** `useMintNFT` imports specific
  error classes from `viem` (`BaseError`, `ContractFunctionRevertedError`,
  `HttpRequestError`, `TimeoutError`, `UserRejectedRequestError`). These
  are stable but version-pinned to viem's internals. One unpinned
  upgrade and the error-classification stops working with no test
  coverage to catch it.
- **`pino-browser-stub.ts`** exists because of a transitive dep that
  pulls pino in for browser builds. Vite `resolve.alias` workaround.
  Worth a comment about *which* dep needs this so the next person can
  delete it when that dep stops needing the workaround.
- **Touch handling in `Maze.tsx`** is hand-rolled (pinch zoom, swipe
  pan, double-tap reset). It works, but it's a known-fragile category
  of code; the recent ma-q1u "swipe affordance" lives separately. A
  library (use-gesture, hammerjs) would shrink this significantly. Not
  urgent.
- **Contracts ABIs are committed JSON files.** `MazeKingNFT.json` and
  `MazeVerifier.json` get hand-synced via `scripts/sync-abis.sh`. If
  someone forgets to run sync, the frontend mints against a stale ABI
  shape. A vite plugin (or a `pnpm prebuild` hook) that runs sync
  automatically would close the loop.

---

## 7. Cross-cutting bugs I'd file beads for

Off-the-cuff, in rough priority order:

1. **MazeRenderer has zero Foundry tests.** A 1-byte off-by-one in the
   header decoder breaks every mint's image. File: `bug, p2, contracts/test/`.
2. **`window.innerWidth <= 768 || 'ontouchstart' in window` is
   duplicated 5+ times across the frontend.** Different files, same
   logic, easy to drift. File: `chore, p3, frontend/src/lib/useIsMobile.ts`.
3. **Verifier ABI drift not caught at build time.** When the circuit
   changes, only the e2e test catches the mismatch. A
   `just check-abi-drift` recipe could compare the circuit's expected
   public inputs against `MazeConstants.PUBLIC_INPUTS_LENGTH` and the
   frontend's `generateProverInput` keys. File: `chore, p2, scripts/`.
4. **Sepolia deploy steps are tribal knowledge.** No `just
   deploy-sepolia` recipe; commits like "deploy to sepolia" suggest
   each deploy is hand-rolled. File: `feat, p2, justfile`.
5. **`disqualified` mapping has no event for the actor / no expiry.**
   Operator action is unattributed; storage grows without bound.
   File: `feat, p3, contracts/src/MazeKingNFT.sol`.
6. **`mintRegistry.ts` is 63 lines of localStorage gymnastics**
   that's load-bearing for "My Mazes" and "Gallery" pages. Zero tests.
   localStorage corruption (full disk, second-tab race) silently
   wedges the gallery view. File: `bug, p3, frontend/src/lib/`.
7. **Dropped Alchemy demo RPC fallback (ma-jr9) means env-var typos
   are now fatal.** Worth a startup-time RPC reachability probe with a
   user-visible "Sepolia RPC unreachable" banner. File:
   `feat, p3, frontend/src/lib/wagmi.ts`.
8. **`useGalleryMazes.ts` and `useOwnedMazes.ts` have ~150 lines of
   duplicated multicall fetch logic.** A `useMazeBatch` primitive
   would clean this up. File: `chore, p3, frontend/src/hooks/`.
9. **`Game.tsx` mounts a `theme-color` meta updater on every render
   when active.** Only writes to DOM when `colors` changes, but the
   effect deps include `active`, so navigating between routes does an
   extra paint. Tiny perf bug, easy fix. File:
   `bug, p4, frontend/src/components/Game.tsx`.
10. **`pixelFont.ts` glyph data is copy-pasted bitmap arrays in TS.**
    Adding a glyph means hand-editing arrays; no test asserts each
    glyph's expected dimensions. File: `chore, p4, frontend/src/lib/`.

---

## 8. Things that make mazeking great

- **The cross-layer hash architecture.** It's the kind of design
  decision people read papers about. We get it for free in every
  feature.
- **Word-as-maze is genuinely novel.** The pixel font carved into
  walls is the visual signature of the game. Don't water it down.
- **Deterministic palettes from seed (with optional hash alignment)**
  give every maze a unique identity. The two-stage paint in `Game.tsx`
  (first paint with seed-only palette, upgrade to hash-aligned once
  bb.js Pedersen lands) is a nice piece of progressive-enhancement
  craft.
- **Pluggable badge awarder + pluggable renderer + updateable
  verifier.** This is exactly the right level of contract upgradability:
  three small surgical knobs, not a Diamond proxy. We've used all three
  this week and the contract structure was exactly what we needed.
- **`just`-driven build reproducibility.** A clean clone + `just
  setup` + `just deploy-local` + `just dev` gets you a running game
  with a real ZK proof flow. That's rare for a project with this many
  toolchains (Noir, Foundry, Vite, bb.js).
- **The error-categorization in `formatMintError`.** When mint
  failures actually surface in the UI with reasons, users trust the
  product. Worth keeping as a template for any future Web3 hook.
- **Test coverage for circuit edge cases (wraparound, start-on-collectable,
  miss-X, wrong-hash) is unusually thorough.** Whoever wrote those
  understood the problem.
- **The on-chain SVG renderer is a flex.** Fully on-chain art for a
  ZK-backed mint NFT is the kind of detail that makes the project
  feel finished.

---

## Closing

The architecture is sound. The pain points are at the seams between
layers — and the seams are inherent to a project that spans Noir +
Solidity + TypeScript + bb.js. The two highest-leverage investments
before launch are:

1. **An automated cross-layer drift gate.** Either a CI job that
   runs `e2eSolveProve` on the full tier, or a `just check-abi-drift`
   that fails the build if the circuit, contracts, and frontend
   header layouts disagree. The regalia split bug should be impossible
   to ship.
2. **A scripted Sepolia deploy.** Three scripts (`deploy-sepolia`,
   `upgrade-verifier-sepolia`, `upgrade-renderer-sepolia`) that
   capture the operations currently in someone's head. The renderer
   redeploy script (ma-96n) is the model — do that for each operation
   class.

Everything else is iterative.

— knight
