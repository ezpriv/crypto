# @ezpriv/crypto

End-to-end encryption for apps, built only on [libsodium](https://doc.libsodium.org). It gives an app the pieces to keep its users' data unreadable to its own server:

- a key pair per user, and several ways to unlock the private key: password, 12 recovery words, passkey (PRF), or another of the user's devices;
- a key per group, sealed to each member;
- encrypted rows bound to their table and id;
- values the server seals to a user (incoming data, push notifications) that only the user can open;
- linking a new browser from a phone by QR code.

It writes no cryptography of its own: every primitive is libsodium's, and this package only fixes how they are combined. The byte format is in [SPEC.md](SPEC.md).

## Install

```bash
npm install @ezpriv/crypto
```

The package doesn't import libsodium. You pass in the one your runtime has:

| Runtime | libsodium |
|---|---|
| React Native (iOS, Android) | [`react-native-libsodium`](https://github.com/serenity-kit/react-native-libsodium) |
| React Native Web, browsers, service workers | `libsodium-wrappers-sumo` (or `react-native-libsodium` after `loadSumoVersion()`) |
| Node | `libsodium-wrappers-sumo` |

The sumo build is needed for `passwordKeys` (Argon2id). In browsers, WebAssembly needs `'wasm-unsafe-eval'` in the page's `script-src`.

## Use

```ts
import sodium from "libsodium-wrappers-sumo";
import { createCrypto } from "@ezpriv/crypto";

await sodium.ready;
const ez = createCrypto(sodium);

// Sign-up: a key pair, and two ways to unlock it.
const user = ez.createUserKeys();
const salt = ez.newSalt();
const { keyP, authKey } = ez.passwordKeys({ password, salt });
const passwordWrap = ez.wrapKey({ key: user.privateKey, wrappingKey: keyP, userId, kind: "password" });
const words = ez.newRecoveryWords(); // show once
const recoveryWrap = ez.wrapKey({ key: user.privateKey, wrappingKey: ez.keyFromWords(words), userId, kind: "recovery" });
// Store user.publicKey, salt, passwordWrap and recoveryWrap on the server. Send authKey at sign-in, never the password.

// A group and its rows.
const groupKey = ez.newGroupKey();
const forMember = ez.sealGroupKey({ groupKey, groupId, publicKey: memberPublicKey });
const encrypted = ez.encryptRow({ value: bytes, groupKey, table: "expense", rowId });

// On the server: seal something only the user can read.
const sealed = ez.sealForUser({ value: bytes, context: "notification", publicKey: user.publicKey });
```

Every function takes and returns `Uint8Array`. Encoding (base64, JSON) is up to the app.

## Other languages

The iOS Notification Service Extension and the Android notification service can't run JavaScript, so `ports/` has a small `openSealed` for each:

- [`ports/swift`](ports/swift): a Swift package on [swift-sodium](https://github.com/jedisct1/swift-sodium), tested against the vectors (`swift test`).
- [`ports/kotlin`](ports/kotlin): one file on [lazysodium-android](https://github.com/terl/lazysodium-android). Not tested yet.

## Development

```bash
pnpm install
pnpm test          # Vitest, including vectors/vectors.json
pnpm check-types
pnpm build         # dist/
pnpm vectors       # regenerate vectors/vectors.json
```

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability, and the "Limits" section of [SPEC.md](SPEC.md) for what this library does not protect against. It has not been audited.

## License

[MIT](LICENSE)
