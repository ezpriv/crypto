# 001 — Compose libsodium, implement nothing

## Status
Accepted

## Context
- The package has to run the same format in React Native (Hermes, no WebAssembly), browsers, service workers, Node, an iOS notification extension (Swift) and an Android notification service (Kotlin).
- Signal, Bitwarden and Proton each built their own core in Rust or Go and compile it per platform. That costs a toolchain and a build per target.
- The open-source apps closest to this stack (Notesnook, Standard Notes, Ente, Session) ship libsodium; GitHub's secrets API uses its sealed boxes.
- The first design used HPKE and AES-GCM through WebCrypto, CryptoKit and Tink, and `hash-wasm` for Argon2id. HPKE would have needed a JavaScript implementation, and none is audited (`@hpke/core` says it hasn't been); `hash-wasm` has no audit, and noble's Argon2 is outside its audit.

## Decision
- Every operation is a libsodium function: `crypto_box_seal`, `crypto_aead_xchacha20poly1305_ietf`, `crypto_pwhash` (Argon2id), `crypto_kdf_derive_from_key`, `crypto_generichash`, `randombytes_buf`. The package only fixes how they're combined (`SPEC.md`).
- The package never imports libsodium. The caller passes the binding its runtime has (`interface Sodium`), so all runtimes run the same C code: `react-native-libsodium` (JSI), `libsodium-wrappers-sumo` (WASM), swift-sodium, lazysodium.
- The only other runtime dependency is `@scure/bip39` for the recovery words.

## Consequences
- Associated data must be a string, because `react-native-libsodium` accepts nothing else on native.
- In browsers, keys are bytes in JavaScript memory, not non-extractable WebCrypto keys, and pages need `'wasm-unsafe-eval'`.
- No HPKE, no post-quantum scheme until libsodium and its bindings offer one; the version byte leaves room for it.
