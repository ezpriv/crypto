# Three.js 0.187.0

Used by [`flow-player.js`](../../flow-player.js) on **[https://ezpriv.xyz/examples/](https://ezpriv.xyz/examples/)**.

`three.module.js` and `three.core.js` are byte-for-byte copies of `build/` in the npm package `three@0.187.0`, whose tarball matched npm's published integrity (`sha512-Qiu7R+Cmh8CstZsY1uJOSWnVlfo7ZtNLV7mF8Jltk3LB3AtDu9cRZlcnRKkAk8Y4z6KKw35z7Y7Urd7jWY8etA==`). `LICENSE` is the package's MIT license. `pnpm check-site` checks these SHA-256 hashes:

| File | SHA-256 |
|---|---|
| `three.module.js` | `104f56145899722094556490d787aae0617cc2fc3382f31df02d724ea1aee341` |
| `three.core.js` | `613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578` |

To upgrade, copy the same two files from the new version's npm tarball into a new `three-<version>/` folder, update the import in `flow-player.js` and the hashes in `scripts/check-site.ts`, and delete this folder. The version in the path lets the site cache these files forever.
