// Checks docs/, the website: every example has a page, flows name real actors, local links
// resolve, every folder has a README linking to the site, and vendored Three.js is unchanged.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const docs = join(root, "docs");
const problems: string[] = [];

const THREE_DIR = "assets/vendor/three-0.187.0";
const THREE_SHA256: Record<string, string> = {
	"three.module.js":
		"104f56145899722094556490d787aae0617cc2fc3382f31df02d724ea1aee341",
	"three.core.js":
		"613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578",
};
for (const [file, expected] of Object.entries(THREE_SHA256)) {
	const actual = createHash("sha256")
		.update(readFileSync(join(docs, THREE_DIR, file)))
		.digest("hex");
	if (actual !== expected) problems.push(`${THREE_DIR}/${file}: wrong sha256`);
}

const files = readdirSync(docs, { recursive: true, encoding: "utf8" });
const isDir = (path: string) =>
	existsSync(path) && statSync(path).isDirectory();

for (const dir of [".", ...files.filter((f) => isDir(join(docs, f)))]) {
	const readme = join(docs, dir, "README.md");
	if (
		!existsSync(readme) ||
		!readFileSync(readme, "utf8").includes("https://ezpriv.xyz")
	) {
		problems.push(
			`docs/${dir}: needs a README.md linking to https://ezpriv.xyz`,
		);
	}
}

for (const file of files.filter((f) => f.endsWith(".html"))) {
	const html = readFileSync(join(docs, file), "utf8");
	for (const [, url = ""] of html.matchAll(
		/(?:href|src|data-flow)="([^"]+)"/g,
	)) {
		if (/^(https?:|mailto:|#)/.test(url)) continue;
		const path = url.split("#")[0] ?? "";
		const target = path.startsWith("/")
			? join(docs, path)
			: join(docs, dirname(file), path);
		if (!existsSync(isDir(target) ? join(target, "index.html") : target)) {
			problems.push(`docs/${file}: broken link ${url}`);
		}
	}
}

interface Actor {
	id: string;
	kind: string;
	holds?: string[];
}
interface Step {
	title: string;
	text: string;
	at?: string;
	from?: string;
	to?: string;
	carry?: string;
	add?: Record<string, string[]>;
	drop?: Record<string, string[]>;
}
const KINDS = [
	"phone",
	"computer",
	"server",
	"cloud",
	"bank",
	"authenticator",
	"store",
	"attacker",
];
const TONES = ["secret", "public", "cipher", "plain", "session", "danger"];
const toneOk = (item: string) =>
	TONES.includes(item.slice(0, item.indexOf(":")));

const examples = readdirSync(join(root, "example")).filter((n) =>
	/^\d\d-/.test(n),
);
for (const name of examples) {
	const dir = join(docs, "examples", name);
	for (const file of ["index.html", "flow.js", "README.md"]) {
		if (!existsSync(join(dir, file)))
			problems.push(`docs/examples/${name}: missing ${file}`);
	}
	if (!existsSync(join(dir, "flow.js"))) continue;
	const flow: { actors: Actor[]; steps: Step[] } = (
		await import(pathToFileURL(join(dir, "flow.js")).href)
	).default;
	const where = `docs/examples/${name}/flow.js`;
	const ids = new Set(flow.actors.map((a) => a.id));
	if (ids.size !== flow.actors.length)
		problems.push(`${where}: duplicate actor ids`);
	for (const actor of flow.actors) {
		if (!KINDS.includes(actor.kind))
			problems.push(`${where}: unknown kind ${actor.kind}`);
		if (!(actor.holds ?? []).every(toneOk))
			problems.push(`${where}: bad item in ${actor.id}`);
	}
	flow.steps.forEach((step, i) => {
		const at = `${where} step ${i + 1}`;
		if (!step.title || !step.text)
			problems.push(`${at}: needs a title and text`);
		const local = step.at !== undefined;
		const message = step.from !== undefined && step.to !== undefined;
		if (local === message)
			problems.push(`${at}: needs either at, or from and to`);
		for (const id of [step.at, step.from, step.to].filter(
			(x) => x !== undefined,
		)) {
			if (!ids.has(id)) problems.push(`${at}: unknown actor ${id}`);
		}
		if (step.carry !== undefined && !toneOk(step.carry))
			problems.push(`${at}: bad carry`);
		for (const id of Object.keys({ ...step.add, ...step.drop })) {
			if (!ids.has(id)) problems.push(`${at}: unknown actor ${id}`);
		}
		if (!Object.values(step.add ?? {}).every((items) => items.every(toneOk))) {
			problems.push(`${at}: bad item`);
		}
	});
}

if (problems.length > 0) {
	console.error(problems.join("\n"));
	process.exit(1);
}
console.log(
	`docs/ checked: ${files.length} files, ${examples.length} examples`,
);
