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
const records = server.table<Row>("records"); // rowId → row

const groupId = "grp_team";
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
function addRecord(
	rowId: string,
	value: string,
	version: number,
	groupKey: Uint8Array,
) {
	const data = ez.encryptRow({
		value: text(value),
		groupKey,
		table: "records",
		rowId,
	});
	records.set(rowId, { keyVersion: version, data });
}

// Version 1: Ana, Ben and Carla.
const v1 = ez.newGroupKey();
shareKey(1, v1, ["ana", "ben", "carla"]);
addRecord("rec_1", "Meeting notes", 1, v1);
const carlasKeys = keysFor("carla"); // her phone keeps the keys it opened

// Ana removes Carla. Her phone makes version 2 and seals it to Ana and Ben only. The server
// drops Carla's copy and stops sending her the group's rows.
groupKeys.delete(`${groupId}/1/carla`);
const v2 = ez.newGroupKey();
shareKey(2, v2, ["ana", "ben"]);
// New rows use version 2. Old rows keep version 1: nothing is re-encrypted.
addRecord("rec_2", "Launch checklist", 2, v2);

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
	return [...records].map(([rowId, row]) => {
		const groupKey = keys.get(row.keyVersion);
		if (!groupKey) throw new Error(`no key for version ${row.keyVersion}`);
		return read(
			ez.decryptRow({ encrypted: row.data, groupKey, table: "records", rowId }),
		);
	});
}

// Ben stays: he reads old and new rows.
const bensKeys = keysFor("ben");
assert.deepEqual([...bensKeys.keys()], [1, 2]);
assert.deepEqual(readAll(bensKeys), ["Meeting notes", "Launch checklist"]);
show("Ben's app shows", readAll(bensKeys));

// Carla kept version 1, so the old rows she already had stay readable to her.
assert.deepEqual([...carlasKeys.keys()], [1]);
// But she has no version 2, and version 1 doesn't open the new rows…
assert.throws(() => readAll(carlasKeys), /no key for version 2/);
const checklist = records.get("rec_2")?.data ?? new Uint8Array();
assert.throws(
	() =>
		ez.decryptRow({
			encrypted: checklist,
			groupKey: carlasKeys.get(1) ?? new Uint8Array(),
			table: "records",
			rowId: "rec_2",
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
