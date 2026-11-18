// Push notifications whose text only the recipient's phone can read.
import assert from "node:assert/strict";
import {
	createServer,
	ez,
	fromB64url,
	read,
	show,
	text,
	toB64url,
} from "../_shared/setup.ts";

const server = createServer();
const publicKeys = server.table<Uint8Array>("public_keys"); // userId → public key
const delivered: { to: string; payload: Record<string, unknown> }[] = []; // APNs, FCM

const people = {
	ana: ez.createUserKeys(),
	ben: ez.createUserKeys(),
	carla: ez.createUserKeys(),
};
for (const [userId, keys] of Object.entries(people))
	publicKeys.set(userId, keys.publicKey);

// The fallback text shows if the phone can't open the payload (no key yet, signed out).
const fallback = { title: "New activity", body: "Open the app to see it" };

// Ben's app adds an expense, then seals the notification text once per recipient. The server
// only forwards the bytes, so it never sees the text.
const message = { title: "Weekend trip", body: "Ben added Dinner, 42.00" };
for (const userId of ["ana", "carla"]) {
	const publicKey = publicKeys.get(userId);
	assert.ok(publicKey);
	const value = text(JSON.stringify(message));
	const sealed = ez.sealForUser({ value, context: "notification", publicKey });
	// In a real app: an APNs payload. FCM's is a data message with the same fields.
	const payload = {
		aps: { alert: fallback, "mutable-content": 1 },
		ezpriv: toB64url(sealed),
	};
	delivered.push({ to: userId, payload });
}
show("Push payload for Ana", delivered[0]?.payload);

// APNs and FCM accept 4 KB. Keep sealed payloads well under it: the seal adds 84 bytes,
// base64 adds a third.
for (const { payload } of delivered) {
	assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 1024);
}

// The recipient's phone, before showing it. In a real app this runs in the iOS Notification
// Service Extension (ports/swift) or the Android FirebaseMessagingService (ports/kotlin), with
// key_A read from the keychain shared with the app (see 05).
function display(
	userId: keyof typeof people,
	payload: Record<string, unknown>,
) {
	try {
		const sealed = fromB64url(String(payload.ezpriv));
		const keyPair = people[userId];
		return JSON.parse(
			read(ez.openSealed({ sealed, context: "notification", keyPair })),
		);
	} catch {
		return fallback;
	}
}
const [toAna, toCarla] = delivered.map((push) => push.payload);
assert.ok(toAna && toCarla);
assert.deepEqual(display("ana", toAna), message);
assert.deepEqual(display("carla", toCarla), message);
// Someone else's notification shows only the fallback.
assert.deepEqual(display("ben", toAna), fallback);

// The context is bound: a sealed bank movement (see 09) can't be shown as a notification.
const movement = ez.sealForUser({
	value: text(JSON.stringify(message)),
	context: "movement",
	publicKey: people.ana.publicKey,
});
assert.throws(
	() =>
		ez.openSealed({
			sealed: movement,
			context: "notification",
			keyPair: people.ana,
		}),
	/ezpriv: wrong context/,
);
console.log("\n✓ 10 push notifications");
