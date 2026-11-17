// Fails when a dependency isn't pinned to an exact version (.agents/decisions/002-exact-pins.md).
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const deps = {
	...pkg.dependencies,
	...pkg.devDependencies,
	...pkg.peerDependencies,
};
const loose = Object.entries(deps).filter(
	([, version]) => !/^\d+\.\d+\.\d+$/.test(String(version)),
);
if (!/^pnpm@\d+\.\d+\.\d+$/.test(pkg.packageManager))
	loose.push(["packageManager", pkg.packageManager]);

if (loose.length > 0) {
	console.error("Not pinned to an exact version:", Object.fromEntries(loose));
	process.exit(1);
}
