// Forgotten password: the 12 recovery words give key_A back, and the user picks a new password.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
	brief,
	createServer,
	ez,
	random,
	read,
	show,
	text,
} from "../_shared/setup.ts";

const server = createServer();
const wraps = server.table<Uint8Array>("key_wraps"); // `${userId}/${kind}` → wrap
const accounts = server.table<{ salt: Uint8Array; authHash: Uint8Array }>(
	"users",
);
const sha256 = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest();

// Signed up earlier (see 01), with a password since forgotten. The group data stays as it is.
const userId = crypto.randomUUID();
const ana = ez.createUserKeys();
const words = ez.newRecoveryWords(); // written on paper at sign-up
const oldSalt = ez.newSalt();
const old = ez.passwordKeys({ password: "forgotten", salt: oldSalt });
accounts.set(userId, { salt: oldSalt, authHash: sha256(old.authKey) });
const key = (wrappingKey: Uint8Array, kind: string) =>
	ez.wrapKey({ key: ana.privateKey, wrappingKey, userId, kind });
wraps.set(`${userId}/password`, key(old.keyP, "password"));
wraps.set(`${userId}/recovery`, key(ez.keyFromWords(words), "recovery"));
const groupKey = ez.newGroupKey();
const groupId = "grp_team";
const sealedGroupKey = ez.sealGroupKey({
	groupKey,
	groupId,
	publicKey: ana.publicKey,
});
const record = ez.encryptRow({
	value: text("Meeting notes"),
	groupKey,
	table: "records",
	rowId: "rec_1",
});

// Phone: the user types the words. Case and extra spaces don't matter.
const typed = `  ${words.toUpperCase().split(" ").join("   ")}\n`;
const keyR = ez.keyFromWords(typed);
assert.deepEqual(keyR, ez.keyFromWords(words));

// The recovery wrap is useless without the words (128 random bits), so the server can hand
// it out by email. In a real app: rate-limit this and email the user that it happened.
const privateKey = ez.unwrapKey({
	wrapped: wraps.get(`${userId}/recovery`) ?? new Uint8Array(),
	wrappingKey: keyR,
	userId,
	kind: "recovery",
});
assert.deepEqual(privateKey, ana.privateKey);

// Before accepting a new password, the server checks the phone really holds key_A: it seals
// a random challenge to the public key, and only key_A opens it.
// In a real app: also require a code sent to the account's email.
const challenge = random(32);
const sealedChallenge = ez.sealForUser({
	value: challenge,
	context: "recovery-challenge",
	publicKey: ana.publicKey,
});
const answer = ez.openSealed({
	sealed: sealedChallenge,
	context: "recovery-challenge",
	keyPair: { publicKey: ana.publicKey, privateKey },
});
assert.deepEqual(answer, challenge);

// New password: a new salt, keyP and authKey, and a new password wrap. Nothing else changes.
const salt = ez.newSalt();
const { keyP, authKey } = ez.passwordKeys({
	password: "a new passphrase",
	salt,
});
const recoveryBefore = wraps.get(`${userId}/recovery`);
wraps.set(`${userId}/password`, key(keyP, "password"));
accounts.set(userId, { salt, authHash: sha256(authKey) });
assert.deepEqual(wraps.get(`${userId}/recovery`), recoveryBefore);

// No data was re-encrypted: the group key and rows open as before.
const recovered = { publicKey: ana.publicKey, privateKey };
const opened = ez.openGroupKey({
	sealed: sealedGroupKey,
	groupId,
	keyPair: recovered,
});
const row = {
	encrypted: record,
	groupKey: opened,
	table: "records",
	rowId: "rec_1",
};
assert.equal(read(ez.decryptRow(row)), "Meeting notes");
show("Phone holds", {
	key_A: brief(privateKey),
	newPasswordWrap: wraps.get(`${userId}/password`),
});
server.show();

// The words carry a checksum, so most typos are caught before any decryption.
const badChecksum = Array(12).fill("abandon").join(" ");
assert.throws(() => ez.keyFromWords(badChecksum));
assert.throws(() => ez.keyFromWords(`${words} extra`));
// A different valid phrase passes the checksum but can't unwrap.
assert.throws(
	() =>
		ez.unwrapKey({
			wrapped: wraps.get(`${userId}/recovery`) ?? new Uint8Array(),
			wrappingKey: ez.keyFromWords(ez.newRecoveryWords()),
			userId,
			kind: "recovery",
		}),
	/ezpriv: cannot decrypt/,
);
console.log("\n✓ 03 recover with words");
