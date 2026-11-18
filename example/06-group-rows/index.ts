// A group: one key for its rows, sealed to each member. The server stores only ciphertexts.
import assert from "node:assert/strict";
import { createServer, ez, read, show, text } from "../_shared/setup.ts";

interface Expense {
	description: string;
	amount: number;
	paidBy: string;
}
interface Row {
	groupId: string;
	keyVersion: number;
	data: Uint8Array;
}

const server = createServer();
const publicKeys = server.table<Uint8Array>("public_keys"); // userId → public key
const groupKeys = server.table<Uint8Array>("group_keys"); // `${groupId}/${userId}` → sealed
const expenses = server.table<Row>("expenses"); // rowId → row

// Each member signed up earlier (see 01) and published a public key.
const ana = ez.createUserKeys();
const ben = ez.createUserKeys();
publicKeys.set("ana", ana.publicKey);
publicKeys.set("ben", ben.publicKey);

// Ana's phone creates the group: a new key, sealed to every member's public key.
const groupId = "grp_trip";
const groupKey = ez.newGroupKey();
for (const userId of ["ana", "ben"]) {
	const publicKey = publicKeys.get(userId);
	assert.ok(publicKey);
	groupKeys.set(
		`${groupId}/${userId}`,
		ez.sealGroupKey({ groupKey, groupId, publicKey }),
	);
}

// Ana adds expenses. Each row is bound to its table and id.
const added: Record<string, Expense> = {
	exp_1: { description: "Dinner", amount: 4200, paidBy: "ana" },
	exp_2: { description: "Taxi", amount: 1500, paidBy: "ana" },
	exp_3: { description: "Museum", amount: 3000, paidBy: "ben" },
};
for (const [rowId, expense] of Object.entries(added)) {
	const value = text(JSON.stringify(expense));
	const data = ez.encryptRow({ value, groupKey, table: "expense", rowId });
	expenses.set(rowId, { groupId, keyVersion: 1, data });
}

// Ben's phone opens his copy of the group key with key_A, then reads every row.
const bensKey = ez.openGroupKey({
	sealed: groupKeys.get(`${groupId}/ben`) ?? new Uint8Array(),
	groupId,
	keyPair: ben,
});
const decrypt = (rowId: string, encrypted: Uint8Array) =>
	JSON.parse(
		read(
			ez.decryptRow({ encrypted, groupKey: bensKey, table: "expense", rowId }),
		),
	) as Expense;
const seen = Object.fromEntries(
	[...expenses].map(([rowId, row]) => [rowId, decrypt(rowId, row.data)]),
);
assert.deepEqual(seen, added);
show("Ben's phone shows", seen);
server.show();
assert.ok(!server.dump().includes("Dinner"));

// The server moves a ciphertext to another row id: refused, because the id is bound to it.
const dinner = expenses.get("exp_1")?.data ?? new Uint8Array();
assert.throws(() => decrypt("exp_2", dinner), /ezpriv: cannot decrypt/);

// The server flips one byte: refused by the authentication tag.
const flipped = dinner.slice();
flipped[30] = (flipped[30] ?? 0) ^ 1;
assert.throws(() => decrypt("exp_1", flipped), /ezpriv: cannot decrypt/);

// A sealed group key is bound to its group: it can't be passed off as another group's.
assert.throws(
	() =>
		ez.openGroupKey({
			sealed: groupKeys.get(`${groupId}/ben`) ?? new Uint8Array(),
			groupId: "grp_other",
			keyPair: ben,
		}),
	/ezpriv: wrong context/,
);
console.log("\n✓ 06 group rows");
