// Runs every example/*/index.ts in order and stops at the first failure. Needs `pnpm build` first.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../example/", import.meta.url));
for (const name of readdirSync(root).sort()) {
	const file = `${root}${name}/index.ts`;
	if (!existsSync(file)) continue;
	console.log(`\n=== ${name}`);
	execFileSync(process.execPath, [file], { stdio: "inherit" });
}
