// Sign-up: a key pair for the user, and two ways to unlock its private key (key_A).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DEFAULT_PASSWORD_PARAMS, type PasswordParams } from "@ezpriv/crypto";
import { brief, createServer, ez, hex, show } from "../_shared/setup.ts";

interface User {
	userId: string;
	publicKey: Uint8Array;
	salt: Uint8Array;
	params: PasswordParams;
	authHash: Uint8Array;
}

const server = createServer();
const users = server.table<User>("users");
const wraps = server.table<Uint8Array>("key_wraps"); // `${userId}/${kind}` → wrap

// Server: POST /signup. It keeps a hash of authKey, never authKey itself, so a leaked
// database can't be replayed to sign in. authKey is 32 random-looking bytes, so a fast
// hash is enough; the slow Argon2id already ran on the phone.
function signUp(request: {
	email: string;
	user: Omit<User, "authHash">;
	authKey: Uint8Array;
	wraps: Record<string, Uint8Array>;
}) {
	const authHash = createHash("sha256").update(request.authKey).digest();
	users.set(request.email, { ...request.user, authHash });
	for (const [kind, wrap] of Object.entries(request.wraps)) {
		wraps.set(`${request.user.userId}/${kind}`, wrap);
	}
}

// Phone: the user types an email and a password.
const email = "ana@example.com";
const password = "a long passphrase only Ana knows";
// In a real app: an id the server hands out before sign-up, or a UUID made here.
const userId = crypto.randomUUID();

const user = ez.createUserKeys(); // user.privateKey is key_A
const salt = ez.newSalt();
const params = DEFAULT_PASSWORD_PARAMS; // Argon2id: 3 passes, 64 MiB
const { keyP, authKey } = ez.passwordKeys({ password, salt, params });
const passwordWrap = ez.wrapKey({
	key: user.privateKey,
	wrappingKey: keyP,
	userId,
	kind: "password",
});

// Shown once on screen for the user to write down. Never sent, stored or logged.
const words = ez.newRecoveryWords();
const keyR = ez.keyFromWords(words);
const recoveryWrap = ez.wrapKey({
	key: user.privateKey,
	wrappingKey: keyR,
	userId,
	kind: "recovery",
});

signUp({
	email,
	user: { userId, publicKey: user.publicKey, salt, params },
	authKey,
	wraps: { password: passwordWrap, recovery: recoveryWrap },
});

// In a real app: the phone also keeps key_A in its keychain (see 05).
show("Phone holds", {
	key_A: brief(user.privateKey),
	recoveryWords: `${words.split(" ").length} words, shown once`,
});
server.show();

// The server holds neither the password, the words, key_A, keyP, key_R nor authKey.
const dump = server.dump();
assert.ok(!dump.includes(password) && !dump.includes(words));
for (const secret of [user.privateKey, keyP, keyR, authKey]) {
	assert.ok(!dump.includes(hex(secret)));
}

// Both wraps give key_A back: the password one through keyP, the other through the words.
assert.deepEqual(
	ez.unwrapKey({
		wrapped: passwordWrap,
		wrappingKey: keyP,
		userId,
		kind: "password",
	}),
	user.privateKey,
);
assert.deepEqual(
	ez.unwrapKey({
		wrapped: recoveryWrap,
		wrappingKey: keyR,
		userId,
		kind: "recovery",
	}),
	user.privateKey,
);
console.log("\n✓ 01 account setup");
