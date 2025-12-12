# Maze Game Implementation Plan

## Overview
A browser-based maze game built with React where players navigate a king (crown glyph) through a procedurally generated maze to collect a key and reach a door. The maze embeds the seed string as visible text in the walls.

## Core Features

### Maze Generation
- Deterministic generation from seed string (same seed = same maze)
- Wraparound edges (toroidal topology)
- 2-bit cell state: South wall (1 bit) + East wall (1 bit)
- 1-bit text flag per cell
- Text centered with 2-4 character-widths of margin around the text
- Word-wrapping at boundaries
- 8-cell tall pixel font for embedded text, optimized for thumbnail readability

### Gameplay
- Player: Crown glyph (👑 or similar)
- Objective: Collect key, then reach door
- Controls: Arrow keys, WASD, and visible touch buttons for mobile
- Move counter tracked
- Full maze visibility
- Zoom option for accessibility

### Visual Style
- Colors deterministically generated from seed (different per maze)
- Text walls have distinct background color that pops
- Responsive sizing (maze fits viewport)
- King, key, door placed randomly (deterministically from seed)

### UI Elements
- Seed input field + Generate button
- URL parameter support for sharing
- Zoom toggle
- Mobile arrow buttons
- Win modal: congratulations, move count, placeholder for ZK proof/NFT mint

## Data Structure (for future ZK proof)
- Serialized maze: 3 bits per cell (S wall, E wall, text flag)
- Starting positions: king, key, door coordinates
- Move history: sequence of moves (2 bits each: up/down/left/right)
- Public inputs: serialized maze (without text flag), starting positions
- Private input: move sequence

## Technical Stack
- React (client-side only)
- Seeded PRNG for deterministic generation
- Canvas or CSS grid for rendering
- No external dependencies beyond React

## File Structure
```
src/
  components/
    Game.tsx          # Main game container
    Maze.tsx          # Maze renderer
    Controls.tsx      # Touch controls
    WinModal.tsx      # Completion modal
    SeedInput.tsx     # Seed input UI
  lib/
    mazeGenerator.ts  # Core maze algorithm
    pixelFont.ts      # 8-cell tall letter definitions
    seededRandom.ts   # Deterministic PRNG
    colorGenerator.ts # Seed-based color schemes
    serialize.ts      # Maze serialization
  types.ts            # TypeScript interfaces
  App.tsx
  index.tsx
```
