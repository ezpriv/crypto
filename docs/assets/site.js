// Small page helpers: code highlighting, copy buttons and the current nav link.
const escapeHtml = (text) =>
	text.replace(
		/[&<>]/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
	);

const TS =
	/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(const|let|var|function|return|await|async|import|from|export|new|if|else|for|of|in|throw|try|catch|type|interface|true|false|null|undefined)\b|\b(\d[\d_.]*)\b|([A-Za-z_$][\w$]*)(?=\()/g;
const SHELL = /(#[^\n]*)/g;

function highlight(code) {
	const shell = code.classList.contains("language-bash");
	const source = code.textContent ?? "";
	let html = "";
	let last = 0;
	for (const match of source.matchAll(shell ? SHELL : TS)) {
		html += escapeHtml(source.slice(last, match.index));
		const [token, comment, string, keyword, number] = match;
		const kind = comment
			? "c"
			: string
				? "s"
				: keyword
					? "k"
					: number
						? "n"
						: "f";
		html += `<span class="tok-${kind}">${escapeHtml(token)}</span>`;
		last = match.index + token.length;
	}
	code.innerHTML = html + escapeHtml(source.slice(last));
}

for (const code of document.querySelectorAll("pre > code")) {
	highlight(code);
	const button = document.createElement("button");
	button.className = "copy";
	button.type = "button";
	button.textContent = "Copy";
	button.addEventListener("click", async () => {
		await navigator.clipboard.writeText(code.textContent ?? "");
		button.textContent = "Copied";
		setTimeout(() => {
			button.textContent = "Copy";
		}, 1500);
	});
	code.parentElement?.append(button);
}

const here = location.pathname.replace(/index\.html$/, "");
const current = [...document.querySelectorAll(".site-nav a")]
	.filter(
		(link) => link.host === location.host && here.startsWith(link.pathname),
	)
	.sort((a, b) => b.pathname.length - a.pathname.length)[0];
current?.setAttribute("aria-current", "page");
