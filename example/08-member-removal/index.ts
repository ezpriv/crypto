// Removing a member: a new group key version, sealed only to the members who stay.
import assert from "node:assert/strict";
import { createServer, ez, read, show, text } from "../_shared/setup.ts";

interface Row {
	keyVersion: number;
	data: Uint8Array;
}

const server = createServer();
// `${groupId}/${version}/${userId}` → sealed group key
const groupKeys = server.table<Uint8Array>("group_keys");
const expenses = server.table<Row>("expenses"); // rowId → row

const groupId = "grp_flat";
const people = {
	ana: ez.createUserKeys(),
	ben: ez.createUserKeys(),
	carla: ez.createUserKeys(),
};
type Name = keyof typeof people;

function shareKey(version: number, groupKey: Uint8Array, userIds: Name[]) {
	for (const userId of userIds) {
		const { publicKey } = people[userId];
		const sealed = ez.sealGroupKey({ groupKey, groupId, publicKey });
		groupKeys.set(`${groupId}/${version}/${userId}`, sealed);
	}
}
function addExpense(
	rowId: string,
	value: string,
	version: number,
	groupKey: Uint8Array,
) {
	const data = ez.encryptRow({
		value: text(value),
		groupKey,
		table: "expense",
		rowId,
	});
	expenses.set(rowId, { keyVersion: version, data });
}

// Version 1: Ana, Ben and Carla.
const v1 = ez.newGroupKey();
shareKey(1, v1, ["ana", "ben", "carla"]);
addExpense("exp_1", "Rent, 900.00", 1, v1);
const carlasKeys = keysFor("carla"); // her phone keeps the keys it opened

// Ana removes Carla. Her phone makes version 2 and seals it to Ana and Ben only. The server
// drops Carla's copy and stops sending her the group's rows.
groupKeys.delete(`${groupId}/1/carla`);
const v2 = ez.newGroupKey();
shareKey(2, v2, ["ana", "ben"]);
// New rows use version 2. Old rows keep version 1: nothing is re-encrypted.
addExpense("exp_2", "Internet, 30.00", 2, v2);

// Any member's app: open each version it was given, and pick the key by the row's keyVersion.
function keysFor(userId: Name) {
	const keys = new Map<number, Uint8Array>();
	for (const [id, sealed] of groupKeys) {
		const [group, version, owner] = id.split("/");
		if (group !== groupId || owner !== userId) continue;
		const keyPair = people[userId];
		keys.set(Number(version), ez.openGroupKey({ sealed, groupId, keyPair }));
	}
	return keys;
}
function readAll(keys: Map<number, Uint8Array>) {
	return [...expenses].map(([rowId, row]) => {
		const groupKey = keys.get(row.keyVersion);
		if (!groupKey) throw new Error(`no key for version ${row.keyVersion}`);
		return read(
			ez.decryptRow({ encrypted: row.data, groupKey, table: "expense", rowId }),
		);
	});
}

// Ben stays: he reads old and new rows.
const bensKeys = keysFor("ben");
assert.deepEqual([...bensKeys.keys()], [1, 2]);
assert.deepEqual(readAll(bensKeys), ["Rent, 900.00", "Internet, 30.00"]);
show("Ben's app shows", readAll(bensKeys));

// Carla kept version 1, so the old rows she already had stay readable to her.
assert.deepEqual([...carlasKeys.keys()], [1]);
// But she has no version 2, and version 1 doesn't open the new rows…
assert.throws(() => readAll(carlasKeys), /no key for version 2/);
const internet = expenses.get("exp_2")?.data ?? new Uint8Array();
assert.throws(
	() =>
		ez.decryptRow({
			encrypted: internet,
			groupKey: carlasKeys.get(1) ?? new Uint8Array(),
			table: "expense",
			rowId: "exp_2",
		}),
	/ezpriv: cannot decrypt/,
);
// …and someone else's sealed copy of version 2 doesn't open with her key.
assert.throws(
	() =>
		ez.openGroupKey({
			sealed: groupKeys.get(`${groupId}/2/ben`) ?? new Uint8Array(),
			groupId,
			keyPair: people.carla,
		}),
	/ezpriv: cannot open/,
);
server.show();
console.log("\n✓ 08 member removal");
