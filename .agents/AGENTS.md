`@ezpriv/crypto` is an MIT TypeScript package that gives apps end-to-end encryption on top of libsodium, without implementing any cryptography itself. `createCrypto(sodium)` (`src/index.ts`) takes the caller's libsodium (`react-native-libsodium` on iOS and Android, `libsodium-wrappers-sumo` in browsers, service workers and Node) and returns functions for user key pairs, unlock paths (password via Argon2id, 12 BIP-39 recovery words, passkey PRF), key wraps, group keys sealed to members, encrypted rows, values sealed to a user, and linking a browser by QR code. Every byte is fixed by `SPEC.md` and checked by `vectors/vectors.json`, which the small Swift and Kotlin ports in `ports/` (for notification handlers) must also open. It's published to npm by GitHub Actions through trusted publishing, with provenance. Its first user is split2 (`mvargas33/split2`, improvement 048).

# Context
- @context/architecture.md
- @context/commands.md

# Rules
- @rules/coding.md

# Decisions
- decisions/001-libsodium-only.md — when the decision "001 — Compose libsodium, implement nothing" is questioned, or when adding a primitive, a dependency or a binding
- decisions/002-exact-pins.md — when the decision "002 — Exact dependency versions, upgraded by hand" is questioned, or when adding or upgrading any dependency or GitHub Action

# Improvements
Planned work, one STAR objective per file (Situation, Task, Why, Action, Result). Not implemented yet; delete a file once it ships and the context docs describe it.
- improvements/001-signed-keys.md — when adding signatures, key fingerprints or anything that protects against a server that tampers
