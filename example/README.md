# Examples

Runnable examples of `@ezpriv/crypto` in an expense-sharing app: users, groups, expenses, bank movements, receipt tables, a phone app and a web version for computers. Each folder has an `index.ts` that runs every party (phone, computer, server) in one process and checks the result with `node:assert`, and a `README.md` that explains the feature, its flow, and its limits.

Everything outside the library is simulated in-process and marked `// In a real app: …`: the server and its database, the keychain, WebAuthn, the camera, push delivery. [`_shared/setup.ts`](_shared/setup.ts) loads libsodium, creates the library, and holds the stand-in server and the byte helpers.

| Example | What it shows | Functions |
|---|---|---|
| [01 · Account setup](01-account-setup) | Sign-up: a key pair, a password wrap and a recovery wrap. What the server holds | `createUserKeys`, `newSalt`, `passwordKeys`, `wrapKey`, `newRecoveryWords`, `keyFromWords` |
| [02 · Unlock with a password](02-unlock-with-password) | A new phone gets `key_A` back. Fake salts for unknown emails, parameter floor and cap | `passwordKeys`, `unwrapKey`, `sealForUser`, `openSealed` |
| [03 · Recover with the 12 words](03-recover-with-words) | A forgotten password: unwrap with the words, choose a new password, re-encrypt nothing | `keyFromWords`, `unwrapKey`, `passwordKeys`, `wrapKey` |
| [04 · Unlock with a passkey](04-passkey-prf) | A passkey's PRF output as another way in, one row per passkey | `keyFromPrf`, `wrapKey`, `unwrapKey` |
| [05 · Device and synced copies](05-device-and-synced-copies) | Where `key_A` is kept after unlock: keychain, iCloud Keychain, Block Store, IndexedDB | none (the platform's job) |
| [06 · Group rows](06-group-rows) | A group key sealed to each member, encrypted expenses, moved or changed rows refused | `newGroupKey`, `sealGroupKey`, `openGroupKey`, `encryptRow`, `decryptRow` |
| [07 · Invite link](07-invite-link) | The group key in the link's fragment, which the server never sees | `decryptRow`, `sealGroupKey` |
| [08 · Removing a member](08-member-removal) | A new key version for the members who stay | `newGroupKey`, `sealGroupKey`, `openGroupKey`, `encryptRow`, `decryptRow` |
| [09 · Sealed ingest](09-sealed-ingest) | The server seals a parsed bank movement that only its owner opens | `sealForUser`, `openSealed` |
| [10 · Push notifications](10-push-notifications) | Notification text sealed per recipient, with a fallback | `sealForUser`, `openSealed` |
| [11 · Sign in by QR code](11-qr-sign-in) | A computer gets the user's keys from the phone, and three attackers fail | `newLinkRequest`, `sealForLink`, `openLink` |
| [12 · Live receipt table](12-live-table-link) | Encrypted items, plain claims, a table key in the link | `newGroupKey`, `encryptRow`, `decryptRow` |
| [13 · Migration](13-migration) | Existing plain rows encrypted by the first member, switched all at once | `createUserKeys`, `newGroupKey`, `encryptRow`, `sealGroupKey`, `openGroupKey` |

Read the [Limits in SPEC.md](../SPEC.md#limits) first: most "Cons and limits" sections come back to them.

## How to run

The examples import the package by name (`import { createCrypto } from "@ezpriv/crypto"`), which Node resolves through `package.json` `exports` to `dist/`. Build first:

```bash
pnpm install
pnpm build
```

Run one example:

```bash
node example/06-group-rows/index.ts
```

Run them all, in order, stopping at the first failure (CI does this):

```bash
pnpm examples
```

Node 24 or later runs the TypeScript directly. `example/` isn't published to npm.
