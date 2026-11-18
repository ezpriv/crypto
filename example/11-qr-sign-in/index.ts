// Signing in on a computer by scanning a QR code with the phone, which hands key_A over.
import assert from "node:assert/strict";
import { createHash, timingSafeEqual } from "node:crypto";
import {
	brief,
	createServer,
	ez,
	fromB64url,
	random,
	show,
	toB64url,
} from "../_shared/setup.ts";

interface Channel {
	receiveHash: Uint8Array;
	userId?: string;
	sealed?: Uint8Array;
	session?: string;
}

const server = createServer();
const channels = server.table<Channel>("link_channels");
const publicKeys = server.table<Uint8Array>("public_keys"); // userId → public key
const sha256 = (value: string) => createHash("sha256").update(value).digest();

// Ana is signed in on her phone.
const ana = ez.createUserKeys();
publicKeys.set("ana", ana.publicKey);

// Server: POST /link. Anyone may open a channel; the server keeps a hash of receiveToken.
function openChannel() {
	const channelId = toB64url(random(16));
	const receiveToken = toB64url(random(32));
	channels.set(channelId, { receiveHash: sha256(receiveToken) });
	return { channelId, receiveToken };
}
// Server: POST /link/<channelId> from a signed-in phone. Ties the channel to that user.
function approve(channelId: string, userId: string, sealed: Uint8Array) {
	const channel = channels.get(channelId);
	assert.ok(channel && !channel.userId, "unknown or used channel");
	Object.assign(channel, { userId, sealed, session: toB64url(random(32)) });
}
// Server: GET /link/<channelId> with the receiveToken. Works once.
function receive(channelId: string, receiveToken: string) {
	const channel = channels.get(channelId);
	if (!channel?.userId || !channel.sealed) return;
	if (!timingSafeEqual(sha256(receiveToken), channel.receiveHash)) return;
	channels.delete(channelId);
	const { userId, sealed, session } = channel;
	return { userId, sealed, session };
}

// Computer: a one-time key pair and secret, and a channel. The QR code carries the channel,
// the public key and the secret, but not receiveToken, which stays on the computer.
// The prefix is the app's own, so no other app or the system camera opens it.
const link = ez.newLinkRequest();
const { channelId, receiveToken } = openChannel();
const qr = `example-link:1:${channelId}:${toB64url(link.publicKey)}:${toB64url(link.secret)}`;
const shown = qr.slice(0, qr.lastIndexOf(":"));
console.log(`QR: ${shown}:<secret, ${brief(link.secret)}>`);
const openOnComputer = (sealed: Uint8Array, userId: string) =>
	ez.openLink({ sealed, channelId, userId, linkKeys: link });

// Phone: read the code, ask the user, then seal key_A for the computer.
function parseQr(value: string) {
	const match = /^example-link:1:([\w-]+):([\w-]+):([\w-]+)$/.exec(value);
	if (!match) throw new Error("not a link code");
	const [, id = "", publicKey = "", secret = ""] = match;
	const linkPublicKey = fromB64url(publicKey);
	return { channelId: id, linkPublicKey, linkSecret: fromB64url(secret) };
}
const scanned = parseQr(qr);
// In a real app: "Link a new browser to your account?", with the browser and rough location the
// server saw when the channel opened. Whoever showed the code gets key_A (SPEC.md, Limits).
const userConfirmed = true;
assert.ok(userConfirmed);
const sealed = ez.sealForLink({ userKeys: ana, userId: "ana", ...scanned });
approve(scanned.channelId, "ana", sealed);

// Attacker with a photo of the QR code: no receiveToken, so the server gives nothing…
assert.equal(receive(channelId, toB64url(random(32))), undefined);
// …and the sealed keys only open with the computer's private key, which never left it.
const photo = { ...ez.createUserKeys(), secret: scanned.linkSecret };
assert.throws(
	() => ez.openLink({ sealed, channelId, userId: "ana", linkKeys: photo }),
	/ezpriv: cannot open/,
);

// Computer: receive, open, and check the keys are the account's before using them.
const received = receive(channelId, receiveToken);
assert.ok(received);
const keys = openOnComputer(received.sealed, received.userId);
// In a real app: fetch the account's public key with the new session.
assert.deepEqual(keys.publicKey, publicKeys.get(received.userId));
assert.deepEqual(keys.privateKey, ana.privateKey);
const session = `${received.session?.slice(0, 6)}…`; // a credential: don't log it
show("Computer holds", { session, key_A: brief(keys.privateKey) });
assert.equal(receive(channelId, receiveToken), undefined); // the channel is gone

// Attacker who knows only the public key, not the secret: they push their own keys so the
// computer would sign in to their account. Without the secret, it fails.
const mallory = ez.createUserKeys();
const forge = (userKeys: typeof ana, userId: string, linkSecret: Uint8Array) =>
	ez.sealForLink({
		userKeys,
		channelId,
		userId,
		linkPublicKey: link.publicKey,
		linkSecret,
	});
const guess = ez.newGroupKey();
assert.throws(
	() => openOnComputer(forge(mallory, "mallory", guess), "mallory"),
	/ezpriv: cannot decrypt/,
);
// A private key that doesn't belong to the public key is refused.
const mismatched = { publicKey: ana.publicKey, privateKey: mallory.privateKey };
assert.throws(
	() => openOnComputer(forge(mismatched, "ana", link.secret), "ana"),
	/ezpriv: linked keys don't match/,
);
console.log("\n✓ 11 QR sign-in");
