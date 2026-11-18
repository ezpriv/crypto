# Coding rules

## Cryptography
- Never implement a primitive. Every cryptographic operation is a libsodium call listed in `interface Sodium` (`src/sodium.ts`). Adding a call means checking that `react-native-libsodium` exposes it on native with the same signature ([decision 001](../decisions/001-libsodium-only.md)).
- Any change to what bytes are written updates `SPEC.md`, regenerates `vectors/vectors.json` (`pnpm vectors`) and gets a new label or version byte, so old and new ciphertexts can't be confused. Derived keys must not change unless that's the point of the change.
- Every way a ciphertext can be refused (wrong key, context, ids, version, a changed byte, bad lengths) has a test in `test/crypto.test.ts`.
- Check input lengths before calling libsodium (`assertLength`); ports check them too, since lazysodium and swift-sodium pass them to C.
- Throw `Error("ezpriv: …")` with a constant message, and replace libsodium's errors so messages are the same on every runtime.

## Code
- TypeScript, strict, with `noUncheckedIndexedAccess`. Type-only imports use `import type`; relative imports in `src/` end in `.js`.
- Functions take and return `Uint8Array`. A function with more than 3 inputs takes one object (`{ value, groupKey, table, rowId }`).
- No `console` in `src/` (Biome `noConsole`). Biome formats: tabs, double quotes. Run `pnpm check` before pushing.
- Keep it short: no abstraction with one implementation, no options nobody uses.

## Dependencies
- Exact versions only, upgraded by hand in their own PR ([decision 002](../decisions/002-exact-pins.md)). `pnpm check-pins` enforces it in CI; GitHub Actions are pinned to commit SHAs with the tag in a comment.

## Releases
- Bump `version` in `package.json` in the PR that changes what's published. Merging to `main` publishes it through `release.yml`.
- Code, comments, docs, commits and PRs are in English (the repo is public). Commits use a gitmoji prefix, sentence case, at most 72 characters.
