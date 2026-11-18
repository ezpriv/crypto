// A new phone: the user types their email and password, and gets key_A back.
import assert from "node:assert/strict";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
	DEFAULT_PASSWORD_PARAMS,
	type KeyPair,
	type PasswordParams,
} from "@ezpriv/crypto";
import { brief, createServer, ez, random, show } from "../_shared/setup.ts";

interface User {
	userId: string;
	publicKey: Uint8Array;
	salt: Uint8Array;
	params: PasswordParams;
	authHash: Uint8Array;
	passwordWrap: Uint8Array;
}

const server = createServer();
const users = server.table<User>("users");
const sha256 = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest();
// In a real app: a secret from the server's secret manager, the same across restarts.
const fakeSaltKey = random(32);

// Server: GET /prelogin?email=… An unknown email gets a salt derived from it, the same on
// every request, so the answer looks like a real account's and doesn't reveal who signed up.
function preLogin(email: string): { salt: Uint8Array; params: PasswordParams } {
	const user = users.get(email);
	if (user) return { salt: user.salt, params: user.params };
	const salt = createHmac("sha256", fakeSaltKey).update(email).digest();
	return { salt: salt.subarray(0, 16), params: DEFAULT_PASSWORD_PARAMS };
}

// Server: POST /signin with authKey. Returns what the phone needs to unwrap key_A.
function signIn(email: string, authKey: Uint8Array) {
	const user = users.get(email);
	if (!user || !timingSafeEqual(sha256(authKey), user.authHash)) return;
	const { userId, publicKey, passwordWrap } = user;
	return { userId, publicKey, passwordWrap };
}

// Sign-up happened earlier on another phone (see 01).
const email = "ana@example.com";
const password = "a long passphrase only Ana knows";
const ana = ez.createUserKeys();
const userId = crypto.randomUUID();
const salt = ez.newSalt();
const first = ez.passwordKeys({ password, salt });
users.set(email, {
	userId,
	publicKey: ana.publicKey,
	salt,
	params: DEFAULT_PASSWORD_PARAMS,
	authHash: sha256(first.authKey),
	passwordWrap: ez.wrapKey({
		key: ana.privateKey,
		wrappingKey: first.keyP,
		userId,
		kind: "password",
	}),
});

// New phone: fetch the salt, derive keyP and authKey, sign in, unwrap.
const pre = preLogin(email);
const { keyP, authKey } = ez.passwordKeys({ password, ...pre });
const account = signIn(email, authKey);
assert.ok(account, "sign-in failed");
const privateKey = ez.unwrapKey({
	wrapped: account.passwordWrap,
	wrappingKey: keyP,
	userId: account.userId,
	kind: "password",
});

// Check key_A belongs to the account's public key: seal an empty value to the public key
// and open it with the private key. Only a matching pair opens it.
function keysMatch(keyPair: KeyPair) {
	const context = "key-check";
	const { publicKey } = keyPair;
	const sealed = ez.sealForUser({
		value: new Uint8Array(),
		context,
		publicKey,
	});
	try {
		ez.openSealed({ sealed, context, keyPair });
		return true;
	} catch {
		return false;
	}
}
assert.ok(keysMatch({ publicKey: account.publicKey, privateKey }));
assert.ok(!keysMatch({ publicKey: ez.createUserKeys().publicKey, privateKey }));
show("New phone holds", { key_A: brief(privateKey), userId: account.userId });

// A wrong password gives a different authKey, so the server refuses it.
const wrong = ez.passwordKeys({ password: "a guess", ...pre });
assert.equal(signIn(email, wrong.authKey), undefined);

// An unknown email gets a fake salt: 16 bytes, the same each time, and no account behind it.
const fake = preLogin("nobody@example.com");
assert.equal(fake.salt.length, 16);
assert.deepEqual(fake, preLogin("nobody@example.com"));

// A server can't hand out weak parameters to make authKey cheap to crack, nor huge ones.
const weak = { opsLimit: 1, memLimit: 8 * 1024 * 1024 };
const huge = { opsLimit: 3, memLimit: 1024 * 1024 * 1024 };
assert.throws(
	() => ez.passwordKeys({ password, salt, params: weak }),
	/ezpriv: password params below the minimum/,
);
assert.throws(
	() => ez.passwordKeys({ password, salt, params: huge }),
	/ezpriv: password params above the maximum/,
);
console.log("\n✓ 02 unlock with password");
