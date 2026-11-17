# Commands

Node 24+ (Node's type stripping runs `scripts/*.ts`) and pnpm `12.10.1` (`packageManager`).

| Command | Does |
|---|---|
| `pnpm install --frozen-lockfile` | Installs exactly the lockfile |
| `pnpm test` | Vitest, including `vectors/vectors.json` |
| `pnpm check-types` | `tsc --noEmit` over `src/`, `test/`, `scripts/` |
| `pnpm build` | `tsc -p tsconfig.build.json` → `dist/` (only `src/`) |
| `pnpm lint` | `biome ci .` (no writes; what CI runs) |
| `pnpm check` | `biome check --write .` (format, lint and organize imports with fixes) |
| `pnpm check-pins` | Fails if a dependency or `packageManager` isn't an exact version ([decision 002](../decisions/002-exact-pins.md)) |
| `pnpm vectors` | Regenerates `vectors/vectors.json`. Derived keys stay the same; ciphertexts change because nonces and ephemeral keys are random |
| `cd ports/swift && swift test` | The Swift port against the vectors |
| `trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --ignore-unfixed --skip-dirs node_modules .` | CI's Trivy scan. Use Trivy 0.72 or later: older versions can't read pnpm 12's lockfile |

Biome skips Markdown (`biome.json`): its Markdown formatter realigns every table.

Publishing happens only in `release.yml` on `main`. Never `npm publish` by hand, except the one-time `0.0.0` placeholder that let npm attach the trusted publisher.
