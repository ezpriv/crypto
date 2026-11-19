// A task list shared by link: people take items. Item contents are encrypted, assignments aren't.
import assert from "node:assert/strict";
import {
	brief,
	createServer,
	ez,
	fromB64url,
	random,
	read,
	show,
	text,
	toB64url,
} from "../_shared/setup.ts";

interface Item {
	title: string;
	hours: number;
}

const server = createServer();
const items = server.table<{ listId: string; data: Uint8Array }>("list_items"); // itemId →
const assignments = server.table<string>("assignments"); // itemId → userId, plain on purpose

// Ana's phone: a new list with one key for this list only.
const listId = toB64url(random(12));
const listKey = ez.newGroupKey();
const list: Record<string, Item> = {
	item_1: { title: "Book the venue", hours: 2 },
	item_2: { title: "Send the invites", hours: 1 },
	item_3: { title: "Order supplies", hours: 3 },
};
for (const [itemId, item] of Object.entries(list)) {
	const value = text(JSON.stringify(item));
	const data = ez.encryptRow({
		value,
		groupKey: listKey,
		table: "list_item",
		rowId: itemId,
	});
	items.set(itemId, { listId, data });
}
const link = `https://app.example.com/l/${listId}#k=${toB64url(listKey)}`;
console.log(`Ana shares: ${link.split("#")[0]}#k=<${brief(listKey)}>`);

// Anyone with the link: the key from the fragment, the items from the server, decrypted here.
function openList(href: string) {
	const url = new URL(href);
	const key = fromB64url(new URLSearchParams(url.hash.slice(1)).get("k") ?? "");
	const id = url.pathname.split("/").pop();
	const decrypt = (itemId: string, data: Uint8Array) =>
		JSON.parse(
			read(
				ez.decryptRow({
					encrypted: data,
					groupKey: key,
					table: "list_item",
					rowId: itemId,
				}),
			),
		) as Item;
	return new Map(
		[...items]
			.filter(([, row]) => row.listId === id)
			.map(([itemId, row]) => [itemId, decrypt(itemId, row.data)]),
	);
}

// Taking an item is a plain write: item id ↔ user id. No cryptography, so it's instant and works
// for anyone with the link. In a real app: a realtime subscription shows each change at once.
const assign = (itemId: string, userId: string) =>
	assignments.set(itemId, userId);
assign("item_1", "ben");
assign("item_3", "ben");
assign("item_2", "carla");

// Each phone adds up its own share from the decrypted data.
const bensView = openList(link);
const hours = (view: Map<string, Item>, userId: string) =>
	[...assignments]
		.filter(([, by]) => by === userId)
		.reduce((sum, [itemId]) => sum + (view.get(itemId)?.hours ?? 0), 0);
assert.equal(hours(bensView, "ben"), 5);
assert.equal(hours(openList(link), "carla"), 1);
show("Ben's phone shows", {
	items: bensView,
	bensHours: hours(bensView, "ben"),
});
server.show();

// The server sees which item ids each person took, never what the items say.
assert.ok(!server.dump().includes("venue"));
// Swapping two items' ciphertexts (to change who does what) is refused.
const first = items.get("item_1");
const second = items.get("item_2");
assert.ok(first && second);
items.set("item_1", second);
items.set("item_2", first);
assert.throws(() => openList(link), /ezpriv: cannot decrypt/);
console.log("\n✓ 12 live list link");
