# 002 — Exact dependency versions, upgraded by hand

## Status
Accepted

## Context
A cryptography package is a supply-chain target: a dependency that changes under a range (`^1.2.3`) changes what ships to every app that installs it, and npm packages have been hijacked to publish malicious patch releases.

## Decision
- Every entry in `dependencies` and `devDependencies`, and `packageManager`, is an exact version. `pnpm-workspace.yaml` sets `saveExact: true` so `pnpm add` writes one, and `pnpm check-pins` fails CI otherwise.
- GitHub Actions are pinned to commit SHAs, with the tag in a comment; Trivy's version is pinned in `ci.yml`; the Swift port pins swift-sodium with `exact:`.
- Upgrades are manual: one PR per upgrade (or per related group), reading the changelog, with CI green, Trivy included.

## Consequences
- Security fixes in dependencies don't arrive by themselves. Trivy's scan in CI is what flags them.
- The lockfile still pins transitive dependencies; exact top-level versions make the published `package.json` reproducible for consumers too.
