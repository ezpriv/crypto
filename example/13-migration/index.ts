// Moving a group's existing plain rows to encrypted ones, all at once.
import assert from "node:assert/strict";
import { createServer, ez, read, show, text } from "../_shared/setup.ts";

interface PlainRow {
	groupId: string;
	title: string;
	body: string;
}
type Upload = { sealedKey: Uint8Array; rows: Map<string, Uint8Array> };
type Group = { members: string[]; encrypted: boolean };

const server = createServer();
const groups = server.table<Group>("groups");
const plain = server.table<PlainRow>("records"); // rowId → plain columns
const encrypted = server.table<Uint8Array>("records_encrypted"); // rowId →
const groupKeys = server.table<Uint8Array>("group_keys"); // `${groupId}/${userId}` → sealed
const publicKeys = server.table<Uint8Array>("public_keys"); // userId → public key

// Before the app update: a group of two with plain rows.
const groupId = "grp_team";
groups.set(groupId, { members: ["ana", "ben"], encrypted: false });
plain.set("rec_1", {
	groupId,
	title: "Meeting notes",
	body: "Ship on Friday.",
});
plain.set("rec_2", {
	groupId,
	title: "Launch checklist",
	body: "Docs, tests, release.",
});

// Server: POST /groups/<id>/encrypt. It can't read the upload, but it can check that every
// plain row has an encrypted counterpart, with the same ids and count. Only then it switches,
// all at once. In a real app: one database transaction.
function finishMigration(upload: Upload) {
	const group = groups.get(groupId);
	assert.ok(group && !group.encrypted, "already encrypted");
	const ids = [...plain]
		.filter(([, row]) => row.groupId === groupId)
		.map(([id]) => id);
	if (
		ids.length !== upload.rows.size ||
		ids.some((id) => !upload.rows.has(id))
	) {
		throw new Error("rows changed, encrypt again");
	}
	for (const [id, data] of upload.rows) encrypted.set(id, data);
	for (const id of ids) plain.delete(id);
	groupKeys.set(`${groupId}/ana`, upload.sealedKey); // the uploader
	group.encrypted = true;
}

// Ana updates first. Her app makes her key pair, a group key, and encrypts every row.
const ana = ez.createUserKeys();
publicKeys.set("ana", ana.publicKey);
const groupKey = ez.newGroupKey();
const sealedKey = ez.sealGroupKey({
	groupKey,
	groupId,
	publicKey: ana.publicKey,
});
function encryptAll(): Upload {
	const rows = new Map<string, Uint8Array>();
	for (const [rowId, { groupId: id, ...fields }] of plain) {
		if (id !== groupId) continue;
		const value = text(JSON.stringify(fields));
		rows.set(
			rowId,
			ez.encryptRow({ value, groupKey, table: "records", rowId }),
		);
	}
	return { sealedKey, rows };
}

// Ben, still on the old app, adds a plain row while Ana's app is encrypting. The counts
// differ, so the server refuses the upload and nothing changes. Ana's app tries again.
const early = encryptAll();
plain.set("rec_3", { groupId, title: "Travel plan", body: "Flight at 9:40." });
assert.throws(() => finishMigration(early), /rows changed/);
assert.equal(plain.size, 3);
assert.equal(encrypted.size, 0);
finishMigration(encryptAll());
assert.equal(plain.size, 0);
assert.ok(!server.dump().includes("Meeting notes"));
// In a real app: from here on, old app versions get "please update" for this group.

// Ben updates later: his app makes his key pair and publishes the public key. He has no
// group key yet, and the server can't make one, so it waits for a member's app.
const ben = ez.createUserKeys();
publicKeys.set("ben", ben.publicKey);
const waiting = (groups.get(groupId)?.members ?? []).filter(
	(userId) => publicKeys.has(userId) && !groupKeys.has(`${groupId}/${userId}`),
);
assert.deepEqual(waiting, ["ben"]);

// Ana's app, next time it's open: opens its group key and seals it to Ben.
const openKey = (userId: string, keyPair: typeof ana) => {
	const sealed = groupKeys.get(`${groupId}/${userId}`) ?? new Uint8Array();
	return ez.openGroupKey({ sealed, groupId, keyPair });
};
const anasKey = openKey("ana", ana);
for (const userId of waiting) {
	const publicKey = publicKeys.get(userId) ?? new Uint8Array();
	groupKeys.set(
		`${groupId}/${userId}`,
		ez.sealGroupKey({ groupKey: anasKey, groupId, publicKey }),
	);
}

// Ben's app reads every row, the old ones included.
const groupKeyForBen = openKey("ben", ben);
const rows = Object.fromEntries(
	[...encrypted].map(([rowId, data]) => {
		const row = { encrypted: data, groupKey: groupKeyForBen, rowId };
		return [
			rowId,
			JSON.parse(read(ez.decryptRow({ ...row, table: "records" }))),
		];
	}),
);
assert.deepEqual(rows, {
	rec_1: { title: "Meeting notes", body: "Ship on Friday." },
	rec_2: { title: "Launch checklist", body: "Docs, tests, release." },
	rec_3: { title: "Travel plan", body: "Flight at 9:40." },
});
show("Ben's app shows", rows);
server.show();
console.log("\n✓ 13 migration");
