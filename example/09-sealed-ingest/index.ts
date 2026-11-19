// Inbound data: the server receives something for a user and seals it so only that user reads it.
import assert from "node:assert/strict";
import { createServer, ez, read, show, text } from "../_shared/setup.ts";

interface InboundEmail {
	from: string;
	subject: string;
	body: string;
}

const server = createServer();
const publicKeys = server.table<Uint8Array>("public_keys"); // userId → public key
const inbox = server.table<{ userId: string; sealed: Uint8Array }>("inbox");

const ana = ez.createUserKeys();
const ben = ez.createUserKeys();
publicKeys.set("ana", ana.publicKey);
publicKeys.set("ben", ben.publicKey);

// Server: an email from outside the app arrives at Ana's address. The server reads only what it
// needs to route it, seals the rest to Ana's public key and keeps only the sealed bytes, the way
// end-to-end encrypted mail services encrypt incoming mail on arrival.
// In a real app: never write the plain message to disk, queues or logs.
function receive(userId: string, raw: string) {
	const [headers = "", body = ""] = raw.split("\n\n");
	const header = (name: string) =>
		new RegExp(`^${name}: (.+)$`, "m").exec(headers)?.[1] ?? "";
	const email: InboundEmail = {
		from: header("From"),
		subject: header("Subject"),
		body,
	};
	const publicKey = publicKeys.get(userId);
	assert.ok(publicKey);
	const value = text(JSON.stringify(email));
	const sealed = ez.sealForUser({ value, context: "inbound", publicKey });
	inbox.set(crypto.randomUUID(), { userId, sealed });
}
receive(
	"ana",
	"From: reports@partner.example\nSubject: Your monthly report\n\nThe report is attached.",
);
server.show();
assert.ok(!server.dump().includes("monthly report"));

// Ana's phone: fetch her sealed inbox and open each item with key_A.
const mine = [...inbox.values()].filter((item) => item.userId === "ana");
const emails = mine.map(({ sealed }) =>
	JSON.parse(read(ez.openSealed({ sealed, context: "inbound", keyPair: ana }))),
);
assert.deepEqual(emails, [
	{
		from: "reports@partner.example",
		subject: "Your monthly report",
		body: "The report is attached.",
	},
]);
show("Ana's phone shows", emails);
// In a real app: when Ana shares it with a group, her app re-encrypts it as a row (see 06).

const [item] = mine;
assert.ok(item);
// Ben can't open what was sealed to Ana.
assert.throws(
	() =>
		ez.openSealed({ sealed: item.sealed, context: "inbound", keyPair: ben }),
	/ezpriv: cannot open/,
);
// The context is bound: inbound data can't be passed off as a notification (see 10).
assert.throws(
	() =>
		ez.openSealed({
			sealed: item.sealed,
			context: "notification",
			keyPair: ana,
		}),
	/ezpriv: wrong context/,
);
console.log("\n✓ 09 sealed inbound data");
