// The server receives a bank movement for a user and seals it so only that user can read it.
import assert from "node:assert/strict";
import { createServer, ez, read, show, text } from "../_shared/setup.ts";

interface Movement {
	date: string;
	description: string;
	amount: number;
}

const server = createServer();
const publicKeys = server.table<Uint8Array>("public_keys"); // userId → public key
const inbox = server.table<{ userId: string; sealed: Uint8Array }>("movements");

const ana = ez.createUserKeys();
const ben = ez.createUserKeys();
publicKeys.set("ana", ana.publicKey);
publicKeys.set("ben", ben.publicKey);

// Server: a bank's notification email arrives at Ana's forwarding address. It parses it in
// memory, seals the result to Ana's public key and keeps only the sealed bytes.
// In a real app: never write the email or the parsed movement to disk, queues or logs.
function ingest(userId: string, email: string) {
	const [, date = "", description = "", amount = "0"] =
		/on (\S+) at (.+) for \$(\d+\.\d\d)/.exec(email) ?? [];
	const movement: Movement = {
		date,
		description,
		amount: Math.round(Number(amount) * 100),
	};
	const publicKey = publicKeys.get(userId);
	assert.ok(publicKey);
	const value = text(JSON.stringify(movement));
	const sealed = ez.sealForUser({ value, context: "movement", publicKey });
	inbox.set(crypto.randomUUID(), { userId, sealed });
}
ingest(
	"ana",
	"Your card was charged on 2026-11-18 at Corner Bakery for $12.40.",
);
server.show();
assert.ok(!server.dump().includes("Bakery"));

// Ana's phone: fetch her sealed movements and open them with key_A.
const mine = [...inbox.values()].filter((item) => item.userId === "ana");
const movements = mine.map(({ sealed }) =>
	JSON.parse(
		read(ez.openSealed({ sealed, context: "movement", keyPair: ana })),
	),
);
assert.deepEqual(movements, [
	{ date: "2026-11-18", description: "Corner Bakery", amount: 1240 },
]);
show("Ana's phone shows", movements);
// In a real app: when Ana adds it to a group, her app re-encrypts it as a row (see 06).

const [item] = mine;
assert.ok(item);
// Ben can't open what was sealed to Ana.
assert.throws(
	() =>
		ez.openSealed({ sealed: item.sealed, context: "movement", keyPair: ben }),
	/ezpriv: cannot open/,
);
// The context is bound: a movement can't be passed off as a notification (see 10).
assert.throws(
	() =>
		ez.openSealed({
			sealed: item.sealed,
			context: "notification",
			keyPair: ana,
		}),
	/ezpriv: wrong context/,
);
console.log("\n✓ 09 sealed ingest");
