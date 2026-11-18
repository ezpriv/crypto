// Optional passkeys: each one unlocks key_A through its PRF output, with its own wrap row.
import assert from "node:assert/strict";
import {
	brief,
	createServer,
	ez,
	hex,
	random,
	show,
} from "../_shared/setup.ts";

interface PasskeyRow {
	prfSalt: Uint8Array; // public, one per credential, sent back as the PRF input
	wrap: Uint8Array;
}

const server = createServer();
const passkeys = server.table<PasskeyRow>("passkey_wraps"); // `${userId}/${credentialId}`
const wraps = server.table<Uint8Array>("key_wraps"); // `${userId}/${kind}` → wrap

// Signed up earlier (see 01): key_A and a recovery wrap.
const userId = crypto.randomUUID();
const ana = ez.createUserKeys();
const words = ez.newRecoveryWords();
wraps.set(
	`${userId}/recovery`,
	ez.wrapKey({
		key: ana.privateKey,
		wrappingKey: ez.keyFromWords(words),
		userId,
		kind: "recovery",
	}),
);

// In a real app: the authenticator (iCloud Keychain, Google Password Manager, a security key)
// computes the PRF output inside a WebAuthn ceremony, always the same for one credential and
// salt, and it never leaves the device:
// - browsers: navigator.credentials.get({ publicKey: { …, extensions: { prf: { eval: { first: prfSalt } } } } }),
//   then getClientExtensionResults().prf.results.first;
// - iOS 18+ and Android 14+: the same request through react-native-passkeys.
// Here it's 32 random bytes per credential and salt, kept in this Map.
const authenticator = new Map<string, Uint8Array>();
function prf(credentialId: string, prfSalt: Uint8Array) {
	const id = `${credentialId}/${hex(prfSalt)}`;
	const output = authenticator.get(id) ?? random(32);
	authenticator.set(id, output);
	return output;
}

// Phone, already unlocked: add a passkey. One row per credential, kind `passkey:<id>`.
function addPasskey(credentialId: string) {
	const prfSalt = random(32);
	const wrap = ez.wrapKey({
		key: ana.privateKey,
		wrappingKey: ez.keyFromPrf(prf(credentialId, prfSalt)),
		userId,
		kind: `passkey:${credentialId}`,
	});
	passkeys.set(`${userId}/${credentialId}`, { prfSalt, wrap });
}

// Any device with the passkey: fetch the row, ask the authenticator, unwrap.
function unlock(credentialId: string, kind = `passkey:${credentialId}`) {
	const row = passkeys.get(`${userId}/${credentialId}`);
	assert.ok(row, "no such passkey");
	const keyF = ez.keyFromPrf(prf(credentialId, row.prfSalt));
	return ez.unwrapKey({ wrapped: row.wrap, wrappingKey: keyF, userId, kind });
}

addPasskey("cred-phone");
addPasskey("cred-laptop");
assert.deepEqual(unlock("cred-laptop"), ana.privateKey);
show("Laptop holds after unlock", { key_A: brief(unlock("cred-laptop")) });

// Removing one passkey deletes one row. The other rows stay byte for byte the same.
const others = () => ({
	laptop: passkeys.get(`${userId}/cred-laptop`),
	recovery: wraps.get(`${userId}/recovery`),
});
const before = structuredClone(others());
passkeys.delete(`${userId}/cred-phone`);
assert.throws(() => unlock("cred-phone"), /no such passkey/);
assert.deepEqual(others(), before);
assert.deepEqual(unlock("cred-laptop"), ana.privateKey);
server.show();

// A wrap is bound to its kind: it can't be passed off as another credential's or the password's.
assert.throws(
	() => unlock("cred-laptop", "password"),
	/ezpriv: cannot decrypt/,
);
// A different PRF output (another authenticator, or another salt) can't unwrap either.
const row = passkeys.get(`${userId}/cred-laptop`);
assert.ok(row);
assert.throws(
	() =>
		ez.unwrapKey({
			wrapped: row.wrap,
			wrappingKey: ez.keyFromPrf(random(32)),
			userId,
			kind: "passkey:cred-laptop",
		}),
	/ezpriv: cannot decrypt/,
);
console.log("\n✓ 04 passkey PRF");
