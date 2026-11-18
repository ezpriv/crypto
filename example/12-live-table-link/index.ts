// A receipt shared by link: friends claim items. Names and prices are encrypted, claims are not.
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
	name: string;
	price: number; // cents
}

const server = createServer();
const items = server.table<{ tableId: string; data: Uint8Array }>(
	"receipt_items",
); // itemId →
const claims = server.table<string>("claims"); // itemId → userId, plain on purpose

// Ana's phone: a receipt from the restaurant, one key for this table only.
const tableId = toB64url(random(12));
const tableKey = ez.newGroupKey();
const receipt: Record<string, Item> = {
	item_1: { name: "Pizza", price: 1800 },
	item_2: { name: "Salad", price: 1100 },
	item_3: { name: "Lemonade", price: 450 },
};
for (const [itemId, item] of Object.entries(receipt)) {
	const value = text(JSON.stringify(item));
	const data = ez.encryptRow({
		value,
		groupKey: tableKey,
		table: "receipt_item",
		rowId: itemId,
	});
	items.set(itemId, { tableId, data });
}
const link = `https://app.example.com/t/${tableId}#k=${toB64url(tableKey)}`;
console.log(`Ana shares: ${link.split("#")[0]}#k=<${brief(tableKey)}>`);

// Anyone with the link: the key from the fragment, the items from the server, decrypted here.
function openTable(href: string) {
	const url = new URL(href);
	const key = fromB64url(new URLSearchParams(url.hash.slice(1)).get("k") ?? "");
	const id = url.pathname.split("/").pop();
	const decrypt = (itemId: string, data: Uint8Array) =>
		JSON.parse(
			read(
				ez.decryptRow({
					encrypted: data,
					groupKey: key,
					table: "receipt_item",
					rowId: itemId,
				}),
			),
		) as Item;
	return new Map(
		[...items]
			.filter(([, row]) => row.tableId === id)
			.map(([itemId, row]) => [itemId, decrypt(itemId, row.data)]),
	);
}

// Claiming is a plain write: item id ↔ user id. No cryptography, so it's instant and works
// for any guest. In a real app: a realtime subscription shows each claim to everyone at once.
const claim = (itemId: string, userId: string) => claims.set(itemId, userId);
claim("item_1", "ben");
claim("item_3", "ben");
claim("item_2", "carla");

// Each phone adds up its own share from the decrypted prices.
const bensView = openTable(link);
const total = (view: Map<string, Item>, userId: string) =>
	[...claims]
		.filter(([, by]) => by === userId)
		.reduce((sum, [itemId]) => sum + (view.get(itemId)?.price ?? 0), 0);
assert.equal(total(bensView, "ben"), 2250);
assert.equal(total(openTable(link), "carla"), 1100);
show("Ben's phone shows", {
	items: bensView,
	bensTotal: total(bensView, "ben"),
});
server.show();

// The server sees which item ids each person claimed, never what they are or cost.
assert.ok(!server.dump().includes("Pizza"));
// Swapping two items' ciphertexts (to change who pays what) is refused.
const pizza = items.get("item_1");
const salad = items.get("item_2");
assert.ok(pizza && salad);
items.set("item_1", salad);
items.set("item_2", pizza);
assert.throws(() => openTable(link), /ezpriv: cannot decrypt/);
console.log("\n✓ 12 live table link");
