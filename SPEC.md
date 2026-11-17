# @ezpriv/crypto format, version 1

Every byte this library writes is described here. A port to another language is correct when it follows this file and passes [`vectors/vectors.json`](vectors/vectors.json).

## Primitives

All from [libsodium](https://doc.libsodium.org). Nothing is implemented here.

| Use | libsodium function |
|---|---|
| Key pairs | `crypto_box_keypair` (X25519) |
| Sealed messages | `crypto_box_seal` / `crypto_box_seal_open` (ephemeral X25519 + XSalsa20-Poly1305, 48 bytes of overhead) |
| Symmetric encryption | `crypto_aead_xchacha20poly1305_ietf` (random 24-byte nonce, 16-byte tag) |
| Password hashing | `crypto_pwhash`, Argon2id v1.3 |
| Subkeys | `crypto_kdf_derive_from_key` (BLAKE2b) |
| Hash | `crypto_generichash` (BLAKE2b) |
| Randomness | `randombytes_buf` |

## Frames

A frame is a list of text fields written as [netstrings](https://cr.yp.to/proto/netstrings.txt): for each field, its length in UTF-8 bytes in decimal, `:`, the field, `,`. Two different lists never produce the same frame.

```
frame(["1", "ezpriv/row", "expense", "42"]) = "1:1,10:ezpriv/row,7:expense,2:42,"
```

The first field is always the version, `"1"`. The second is a label naming the purpose.

## Ciphertexts

Every ciphertext starts with the version byte `0x01`. Anything else is refused.

| Kind | Bytes |
|---|---|
| Encrypted | `0x01 ‖ nonce (24) ‖ AEAD ciphertext and tag (n + 16)` |
| Sealed | `0x01 ‖ crypto_box_seal(header ‖ payload)` |

- **Encrypted:** the associated data is the UTF-8 encoding of `frame(["1", label, ...fields])`. It is passed to libsodium as a string because `react-native-libsodium` takes no other type on iOS and Android.
- **Sealed:** `header` is the UTF-8 encoding of `frame(["1", label, ...fields])`. Opening checks that the plaintext starts with exactly the expected header, then returns the rest.

| Function | Kind | Label | Fields | Payload |
|---|---|---|---|---|
| `wrapKey` | Encrypted | `ezpriv/wrap` | `userId`, `kind` | The key (usually `key_A`, 32 bytes) |
| `encryptRow` | Encrypted | `ezpriv/row` | `table`, `rowId` | The row's bytes |
| `sealGroupKey` | Sealed | `ezpriv/group-key` | `groupId` | The group key (32 bytes) |
| `sealForUser` | Sealed | `ezpriv/user` | `context` | The value |
| `sealForLink` | Sealed | `ezpriv/link` | `channelId`, `userId` | Private key (32) ‖ public key (32) |

`kind` names the way to unlock (for example `password`, `recovery`, `passkey:<credentialId>`, `device`). `context` names what a sealed value is (for example `movement`, `notification`).

## Derived keys

| Key | Derivation |
|---|---|
| `master` | `crypto_pwhash(32, UTF-8(NFC(password)), salt, opsLimit, memLimit, ARGON2ID13)`, salt 16 random bytes |
| `keyP` | `crypto_kdf_derive_from_key(32, 1, "ezprivpw", master)` |
| `authKey` | `crypto_kdf_derive_from_key(32, 2, "ezprivpw", master)` |
| `key_R` | `crypto_generichash(32, entropy, UTF-8("ezpriv recovery v1"))`, where `entropy` is the 16 bytes behind 12 English BIP-39 words |
| `key_F` | `crypto_kdf_derive_from_key(32, 1, "ezprivpk", prf)`, where `prf` is a passkey's 32-byte PRF output |

- **Argon2id parameters:** the default is `opsLimit` 3 and `memLimit` 64 MiB. Anything below `opsLimit` 2 or 19 MiB (OWASP's minimum for Argon2id) is refused, so a server can't hand out weak parameters to make `authKey` cheap to crack.
- **Passwords** are normalized to Unicode NFC before hashing, so "ñ" typed on different keyboards gives the same key.
- **Recovery words** are trimmed, lowercased and joined with single spaces. The BIP-39 checksum is checked.

## Limits

- **Sealed messages are anonymous.** Anyone with a public key can seal to it. `openGroupKey` can't tell who sealed a group key, so a server could seal a key it knows. Signatures (`crypto_sign`) are planned for a later version.
- **No forward secrecy.** Whoever gets a private key can open everything sealed to it.
- **No key rotation bookkeeping.** The caller records which group key encrypted each row.
- **JavaScript can't wipe memory.** Keys stay until garbage collection.
- **No post-quantum protection yet.** A later version byte will mark a hybrid scheme.

## Test vectors

[`vectors/vectors.json`](vectors/vectors.json) holds fixed inputs with expected outputs for the derived keys, and ciphertexts made with fixed keys that every port must open. All binary values are lowercase hex. `pnpm vectors` regenerates the file; the derived keys never change, the ciphertexts do because nonces and ephemeral keys are random.
