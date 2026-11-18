// An invite link: the group key rides in the URL fragment, which browsers never send to the server.
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

const server = createServer();
const invites = server.table<string>("invites"); // token → groupId
const members = server.table<string[]>("members"); // groupId → userIds
const groupKeys = server.table<Uint8Array>("group_keys"); // `${groupId}/${userId}` → sealed
const expenses = server.table<Uint8Array>("expenses"); // rowId → encrypted
const requestLog: string[] = [];

// Ana's group already exists (see 06), with one expense.
const groupId = "grp_trip";
const groupKey = ez.newGroupKey();
members.set(groupId, ["ana"]);
expenses.set(
	"exp_1",
	ez.encryptRow({
		value: text("Dinner, 42.00"),
		groupKey,
		table: "expense",
		rowId: "exp_1",
	}),
);

// Ana's phone: the server makes a random token; the app adds the key as the fragment.
const token = toB64url(random(16));
invites.set(token, groupId);
const link = `https://app.example.com/invite/${token}#k=${toB64url(groupKey)}`;
// In a real app: shared through the system share sheet. Print it without the key.
console.log(`Ana shares: ${link.split("#")[0]}#k=<${brief(groupKey)}>`);

// Server: GET /invite/<token>, as a signed-in user. The request line has no fragment.
function join(path: string, userId: string) {
	requestLog.push(`GET ${path}`);
	const id = invites.get(path.split("/").pop() ?? "");
	assert.ok(id, "unknown invite");
	members.get(id)?.push(userId);
	return { groupId: id, rows: [...expenses] };
}

// Carla's phone or browser opens the link, and the app reads the key from the fragment.
const carla = ez.createUserKeys();
const url = new URL(link);
const keyFromLink = fromB64url(
	new URLSearchParams(url.hash.slice(1)).get("k") ?? "",
);
const joined = join(url.pathname, "carla");

// Before keeping the key, check it opens the group's rows: a changed link fails here.
const readRow = (key: Uint8Array, [rowId, encrypted]: [string, Uint8Array]) =>
	read(ez.decryptRow({ encrypted, groupKey: key, table: "expense", rowId }));
const rows = joined.rows.map((row) => readRow(keyFromLink, row));
assert.deepEqual(rows, ["Dinner, 42.00"]);

// Carla seals the key to herself, so her other devices get it like any member's.
groupKeys.set(
	`${joined.groupId}/carla`,
	ez.sealGroupKey({
		groupKey: keyFromLink,
		groupId: joined.groupId,
		publicKey: carla.publicKey,
	}),
);
show("Carla's app shows", rows);
show("The server's request log", requestLog);
server.show();

// The server saw the token, never the key.
assert.ok(!requestLog.join().includes("#"));
assert.ok(!server.dump().includes(toB64url(groupKey)));
// Whoever has only the token (a server log, a link preview without the fragment) can join
// but can't read: any other key is refused.
const [firstRow] = joined.rows;
assert.ok(firstRow);
assert.throws(
	() => readRow(ez.newGroupKey(), firstRow),
	/ezpriv: cannot decrypt/,
);
console.log("\n✓ 07 invite link");
