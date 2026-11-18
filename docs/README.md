# Website

The docs and examples site, published at **[https://ezpriv.xyz](https://ezpriv.xyz)**. Plain HTML, CSS and JavaScript: there's no build step, and what's in this folder is what's served.

| Path | Page |
|---|---|
| [`index.html`](index.html) | [Home](https://ezpriv.xyz/) |
| [`guide/`](guide) | [Getting started](https://ezpriv.xyz/guide/), [API reference](https://ezpriv.xyz/guide/api/), [Security and limits](https://ezpriv.xyz/guide/security/) |
| [`examples/`](examples) | [All examples](https://ezpriv.xyz/examples/), one folder per example with its page and animation |
| [`assets/`](assets) | Styles, scripts, the flow player and vendored Three.js |
| `_headers` | Security headers, applied by Cloudflare Pages |

## Preview locally

```bash
python3 -m http.server 8080 --directory docs
```

Then open http://localhost:8080. `_headers` only applies on Cloudflare Pages.

## Editing

- Pages are hand-written HTML with the same header and footer. A nav change touches every `index.html`.
- An example page mirrors its folder in [`example/`](../example): when an example's README changes, update its page.
- `pnpm check-site` (run in CI) checks that every example has a page, a `flow.js` and a README, that every flow names real actors, that local links resolve, that every folder has a README linking here, and that the vendored Three.js files match their hashes.

## Flow format

Each example's `flow.js` exports the actors and steps its animation plays:

```js
export default {
	actors: [
		{ id: "phone", name: "Phone", kind: "phone", note: "optional subtitle", holds: ["secret:key_A"] },
		{ id: "server", name: "Server", kind: "server" },
	],
	steps: [
		// A step on one actor: a pulse and the function call above it.
		{ title: "Make the key pair", at: "phone", call: "ez.createUserKeys()", text: "…", add: { phone: ["public:publicKey"] } },
		// A message: a packet travels from one actor to another.
		{ title: "Sign up", from: "phone", to: "server", carry: "cipher:2 wraps", text: "…", add: { server: ["cipher:2 wraps"] } },
		// A refused message: the packet stops short and turns red. `attack` tags it in the step list.
		{ title: "Moved row", attack: true, from: "server", to: "phone", carry: "cipher:exp_1", refused: "cannot decrypt", text: "…" },
	],
};
```

- `kind` is one of `phone`, `computer`, `server`, `cloud`, `bank`, `authenticator`, `store`, `attacker`.
- An item is `tone:label`, where tone is `secret`, `public`, `cipher`, `plain`, `session` or `danger`. `add` puts items on an actor after the step, `drop` removes them by label.

## How it's served

[Cloudflare Pages](https://developers.cloudflare.com/pages/) serves this folder from the `main` branch of this repository. Cloudflare connects to GitHub through its own app, so no token or secret is stored here. Every push to `main` deploys, and every other branch gets a preview URL.

### One-time setup

1. **Add the domain to Cloudflare.** In the Cloudflare dashboard, add `ezpriv.xyz` as a site on the Free plan. Cloudflare shows two nameservers for the zone, like `name1.ns.cloudflare.com` and `name2.ns.cloudflare.com` (yours will differ).
2. **Point Dynadot at Cloudflare.** In Dynadot, open the domain's name server settings, choose custom name servers, enter the two Cloudflare nameservers and remove any others. If DNSSEC is on at Dynadot, turn it off first. Wait until Cloudflare shows the zone as active (minutes to a day).
3. **Create the Pages project.** Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git. Install the Cloudflare GitHub app on the `ezpriv` organization for **only** the `ezpriv/crypto` repository, then set:

   | Setting | Value |
   |---|---|
   | Project name | `ezpriv` (gives `ezpriv.pages.dev`; if it's taken, any name works and the records below use it) |
   | Production branch | `main` |
   | Framework preset | None |
   | Build command | empty |
   | Build output directory | `docs` |
   | Root directory | empty |
   | Environment variables | none |

4. **Add the custom domains.** Pages project → Custom domains → Set up a custom domain → `ezpriv.xyz`. Since the zone is on Cloudflare, it creates the DNS record itself. Repeat for `www.ezpriv.xyz`.
5. **Send `www` to the apex.** Rules → Redirect Rules → create a rule: when the hostname equals `www.ezpriv.xyz`, redirect dynamically to `concat("https://ezpriv.xyz", http.request.uri.path)` with status 301 and the query string kept.
6. **Force HTTPS.** SSL/TLS → Edge Certificates: turn on Always Use HTTPS and set the minimum TLS version to 1.2.
7. **Turn on DNSSEC.** DNS → Settings → Enable DNSSEC. Cloudflare shows a DS record (key tag, algorithm 13, digest type 2, digest). Add it in Dynadot under the domain's DNSSEC settings.
8. **Say the domain sends no email**, so nobody can spoof it: add the two TXT records below.

### DNS records

In Cloudflare, once it hosts the zone:

| Type | Name | Content | Proxy | Added by |
|---|---|---|---|---|
| CNAME | `ezpriv.xyz` | `ezpriv.pages.dev` | Proxied | Pages, step 4 |
| CNAME | `www` | `ezpriv.pages.dev` | Proxied | Pages, step 4 |
| TXT | `ezpriv.xyz` | `v=spf1 -all` | DNS only | You, step 8 |
| TXT | `_dmarc` | `v=DMARC1; p=reject;` | DNS only | You, step 8 |

At Dynadot: the two Cloudflare nameservers (step 2) and the DS record (step 7). Nothing else.

### Check it

```bash
dig +short NS ezpriv.xyz
curl -sI https://ezpriv.xyz/ | grep -iE "^(HTTP|content-security-policy|strict-transport-security)"
curl -sI https://www.ezpriv.xyz/some/path | grep -iE "^(HTTP|location)"
```

The first lists the Cloudflare nameservers. The second shows `200` and the headers from `_headers`. The third shows a `301` to `https://ezpriv.xyz/some/path`.
