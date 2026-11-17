# 001 — Signed group keys and public-key fingerprints

**Status:** Proposed · **Priority:** P1 · **Depends on:** —

## Situation
- Sealed boxes are anonymous: `openGroupKey` can't tell who sealed a group key, so a server could seal one it knows into a member's wrap.
- Public keys aren't authenticated: a server could hand out its own in place of a member's and receive the group key.
- `SPEC.md` "Limits" and the README say so: today the data is safe from a server that stores and reads, not one that tampers.

## Task
Let a member's app check who sealed a group key, and let users compare each other's keys.

## Why
It's the remaining gap between "the server can't read a dump" and "the server can't read the data at all".

## Action
- Give each user an Ed25519 signing key (`crypto_sign`) next to the X25519 key, wrapped the same way.
- Sign sealed group keys with the sealer's key, and sign each user's X25519 public key with their signing key.
- Add a short fingerprint of a user's keys that two people can compare (safety numbers).
- Check that `react-native-libsodium` exposes `crypto_sign_*` on native; add the calls to `interface Sodium`, a new label or version byte, `SPEC.md` and vectors, and the Swift/Kotlin ports if notifications need it.

## Result
A member's app refuses a group key not signed by a member it trusts, and the threat model's "server that tampers" rows close for groups whose members compared fingerprints.
