import { entropyToMnemonic, mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { Sodium } from "./sodium.js";

export type { Sodium } from "./sodium.js";

/** First byte of every ciphertext, and the first field of every frame. See SPEC.md. */
export const VERSION = 1;
export const DEFAULT_PASSWORD_PARAMS: PasswordParams = {
	opsLimit: 3,
	memLimit: 64 * 1024 * 1024,
};

const KEY_BYTES = 32;
const NONCE_BYTES = 24;
const TAG_BYTES = 16;
const SALT_BYTES = 16;
const SEAL_BYTES = 48;
const ARGON2ID13 = 2; // libsodium's crypto_pwhash_ALG_ARGON2ID13
const MIN_OPS_LIMIT = 2; // OWASP's minimum for Argon2id: t=2, m=19 MiB
const MIN_MEM_LIMIT = 19 * 1024 * 1024;
// Caps what a server can make a client spend: 4x the default memory, so a phone's WASM heap
// survives it. Must stay below 2^31 bytes: react-native-libsodium casts memLimit to a C int.
const MAX_OPS_LIMIT = 16;
const MAX_MEM_LIMIT = 256 * 1024 * 1024;
const PASSWORD_CONTEXT = "ezprivpw";
const PASSKEY_CONTEXT = "ezprivpk";

export interface KeyPair {
	publicKey: Uint8Array;
	privateKey: Uint8Array;
}

/** What a new browser shows as a QR code: `publicKey` and `secret`. The private key never leaves it. */
export interface LinkRequest extends KeyPair {
	secret: Uint8Array;
}

export interface PasswordParams {
	opsLimit: number;
	/** Bytes. */
	memLimit: number;
}

const encoder = new TextEncoder();
const utf8 = (text: string) => encoder.encode(text);

/** Netstrings (`<UTF-8 byte length>:<field>,`), so two different field lists never encode the same. */
export function frame(fields: string[]): string {
	return fields.map((field) => `${utf8(field).length}:${field},`).join("");
}

function concat(...parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function assertLength(name: string, bytes: Uint8Array, length: number) {
	if (bytes.length !== length) {
		throw new Error(`ezpriv: ${name} must be ${length} bytes`);
	}
}

/** Strips and checks the version byte. */
function body(ciphertext: Uint8Array, minLength: number): Uint8Array {
	if (ciphertext[0] !== VERSION) throw new Error("ezpriv: unsupported version");
	if (ciphertext.length < 1 + minLength) {
		throw new Error("ezpriv: ciphertext too short");
	}
	return ciphertext.subarray(1);
}

export function createCrypto(sodium: Sodium) {
	const kdf = (id: number, context: string, key: Uint8Array) =>
		sodium.crypto_kdf_derive_from_key(KEY_BYTES, id, context, key);

	function encrypt(value: Uint8Array, key: Uint8Array, fields: string[]) {
		assertLength("key", key, KEY_BYTES);
		const nonce = sodium.randombytes_buf(NONCE_BYTES);
		const ad = frame([String(VERSION), ...fields]);
		const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
			value,
			ad,
			null,
			nonce,
			key,
		);
		return concat(Uint8Array.of(VERSION), nonce, sealed);
	}

	function decrypt(ciphertext: Uint8Array, key: Uint8Array, fields: string[]) {
		assertLength("key", key, KEY_BYTES);
		const rest = body(ciphertext, NONCE_BYTES + TAG_BYTES);
		const ad = frame([String(VERSION), ...fields]);
		try {
			return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
				null,
				rest.subarray(NONCE_BYTES),
				ad,
				rest.subarray(0, NONCE_BYTES),
				key,
			);
		} catch {
			throw new Error("ezpriv: cannot decrypt");
		}
	}

	function seal(value: Uint8Array, publicKey: Uint8Array, fields: string[]) {
		assertLength("publicKey", publicKey, KEY_BYTES);
		const header = utf8(frame([String(VERSION), ...fields]));
		const box = sodium.crypto_box_seal(concat(header, value), publicKey);
		return concat(Uint8Array.of(VERSION), box);
	}

	function open(sealed: Uint8Array, keyPair: KeyPair, fields: string[]) {
		const box = body(sealed, SEAL_BYTES);
		let opened: Uint8Array;
		try {
			opened = sodium.crypto_box_seal_open(
				box,
				keyPair.publicKey,
				keyPair.privateKey,
			);
		} catch {
			throw new Error("ezpriv: cannot open");
		}
		const header = utf8(frame([String(VERSION), ...fields]));
		if (
			opened.length < header.length ||
			header.some((byte, i) => opened[i] !== byte)
		) {
			throw new Error("ezpriv: wrong context");
		}
		return opened.slice(header.length);
	}

	function newKeyPair(): KeyPair {
		const { publicKey, privateKey } = sodium.crypto_box_keypair();
		return { publicKey, privateKey };
	}

	return {
		/** A user's X25519 key pair. The private key is `key_A`. */
		createUserKeys: newKeyPair,

		/** A random 32-byte key for one group's rows. */
		newGroupKey: () => sodium.crypto_aead_xchacha20poly1305_ietf_keygen(),

		/** A random 16-byte salt for `passwordKeys`, stored next to the wrap. */
		newSalt: () => sodium.randombytes_buf(SALT_BYTES),

		/**
		 * Argon2id over the NFC-normalized password, then two subkeys:
		 * `keyP` wraps `key_A`, `authKey` is sent at sign-in instead of the password.
		 */
		passwordKeys({
			password,
			salt,
			params = DEFAULT_PASSWORD_PARAMS,
		}: {
			password: string;
			salt: Uint8Array;
			params?: PasswordParams;
		}): { keyP: Uint8Array; authKey: Uint8Array } {
			assertLength("salt", salt, SALT_BYTES);
			const { opsLimit, memLimit } = params;
			// react-native-libsodium casts these to a C int unchecked, so this is the only check on native.
			if (!Number.isSafeInteger(opsLimit) || !Number.isSafeInteger(memLimit)) {
				throw new Error("ezpriv: password params must be integers");
			}
			if (opsLimit < MIN_OPS_LIMIT || memLimit < MIN_MEM_LIMIT) {
				throw new Error("ezpriv: password params below the minimum");
			}
			if (opsLimit > MAX_OPS_LIMIT || memLimit > MAX_MEM_LIMIT) {
				throw new Error("ezpriv: password params above the maximum");
			}
			const master = sodium.crypto_pwhash(
				KEY_BYTES,
				utf8(password.normalize("NFC")),
				salt,
				opsLimit,
				memLimit,
				ARGON2ID13,
			);
			return {
				keyP: kdf(1, PASSWORD_CONTEXT, master),
				authKey: kdf(2, PASSWORD_CONTEXT, master),
			};
		},

		/** 12 English BIP-39 words carrying 128 random bits. */
		newRecoveryWords: () =>
			entropyToMnemonic(sodium.randombytes_buf(16), wordlist),

		/** `key_R` from the 12 words. Throws on an unknown word or a bad checksum. */
		keyFromWords(words: string): Uint8Array {
			let entropy: Uint8Array;
			try {
				entropy = mnemonicToEntropy(
					words.trim().toLowerCase().split(/\s+/).join(" "),
					wordlist,
				);
			} catch {
				// @scure/bip39's messages can quote a mistyped word, which is part of a secret.
				throw new Error("ezpriv: invalid recovery words");
			}
			assertLength("recovery entropy", entropy, 16);
			return sodium.crypto_generichash(
				KEY_BYTES,
				entropy,
				utf8("ezpriv recovery v1"),
			);
		},

		/** `key_F` from a passkey's 32-byte PRF output. */
		keyFromPrf(prf: Uint8Array): Uint8Array {
			assertLength("prf", prf, KEY_BYTES);
			return kdf(1, PASSKEY_CONTEXT, prf);
		},

		/** Encrypts a key (usually `key_A`) under one way to unlock it. `kind` names that way. */
		wrapKey: ({
			key,
			wrappingKey,
			userId,
			kind,
		}: {
			key: Uint8Array;
			wrappingKey: Uint8Array;
			userId: string;
			kind: string;
		}) => encrypt(key, wrappingKey, ["ezpriv/wrap", userId, kind]),

		unwrapKey: ({
			wrapped,
			wrappingKey,
			userId,
			kind,
		}: {
			wrapped: Uint8Array;
			wrappingKey: Uint8Array;
			userId: string;
			kind: string;
		}) => decrypt(wrapped, wrappingKey, ["ezpriv/wrap", userId, kind]),

		/** Encrypts one row's content, bound to its table and id. */
		encryptRow: ({
			value,
			groupKey,
			table,
			rowId,
		}: {
			value: Uint8Array;
			groupKey: Uint8Array;
			table: string;
			rowId: string;
		}) => encrypt(value, groupKey, ["ezpriv/row", table, rowId]),

		decryptRow: ({
			encrypted,
			groupKey,
			table,
			rowId,
		}: {
			encrypted: Uint8Array;
			groupKey: Uint8Array;
			table: string;
			rowId: string;
		}) => decrypt(encrypted, groupKey, ["ezpriv/row", table, rowId]),

		/** Seals a group key to one member's public key. */
		sealGroupKey({
			groupKey,
			groupId,
			publicKey,
		}: {
			groupKey: Uint8Array;
			groupId: string;
			publicKey: Uint8Array;
		}): Uint8Array {
			assertLength("groupKey", groupKey, KEY_BYTES);
			return seal(groupKey, publicKey, ["ezpriv/group-key", groupId]);
		},

		openGroupKey({
			sealed,
			groupId,
			keyPair,
		}: {
			sealed: Uint8Array;
			groupId: string;
			keyPair: KeyPair;
		}): Uint8Array {
			const groupKey = open(sealed, keyPair, ["ezpriv/group-key", groupId]);
			assertLength("groupKey", groupKey, KEY_BYTES);
			return groupKey;
		},

		/**
		 * Seals a value to a user's public key: anyone (the server) can seal, only the user opens.
		 * `context` names what it is ("movement", "notification") so one can't pass for another.
		 */
		sealForUser: ({
			value,
			context,
			publicKey,
		}: {
			value: Uint8Array;
			context: string;
			publicKey: Uint8Array;
		}) => seal(value, publicKey, ["ezpriv/user", context]),

		openSealed: ({
			sealed,
			context,
			keyPair,
		}: {
			sealed: Uint8Array;
			context: string;
			keyPair: KeyPair;
		}) => open(sealed, keyPair, ["ezpriv/user", context]),

		/**
		 * A one-time key pair and secret for a new browser. The QR code carries `publicKey` and
		 * `secret`, straight from screen to camera, so the server never sees the secret.
		 */
		newLinkRequest: (): LinkRequest => ({
			...newKeyPair(),
			secret: sodium.crypto_aead_xchacha20poly1305_ietf_keygen(),
		}),

		/**
		 * On the phone: encrypts the user's key pair under the QR secret, then seals it to the
		 * browser's one-time public key. Ask the user to confirm before calling this: whoever
		 * showed the QR code gets the private key.
		 */
		sealForLink({
			userKeys,
			channelId,
			userId,
			linkPublicKey,
			linkSecret,
		}: {
			userKeys: KeyPair;
			channelId: string;
			userId: string;
			linkPublicKey: Uint8Array;
			linkSecret: Uint8Array;
		}): Uint8Array {
			assertLength("privateKey", userKeys.privateKey, KEY_BYTES);
			assertLength("publicKey", userKeys.publicKey, KEY_BYTES);
			const fields = ["ezpriv/link", channelId, userId];
			return seal(
				encrypt(
					concat(userKeys.privateKey, userKeys.publicKey),
					linkSecret,
					fields,
				),
				linkPublicKey,
				fields,
			);
		},

		/**
		 * In the browser: opens the user's key pair. Only someone who read the QR code can have made
		 * `sealed`. Compare the returned `publicKey` with the account's before using the keys.
		 */
		openLink({
			sealed,
			channelId,
			userId,
			linkKeys,
		}: {
			sealed: Uint8Array;
			channelId: string;
			userId: string;
			linkKeys: LinkRequest;
		}): KeyPair {
			const fields = ["ezpriv/link", channelId, userId];
			const keys = decrypt(
				open(sealed, linkKeys, fields),
				linkKeys.secret,
				fields,
			);
			assertLength("linked keys", keys, 2 * KEY_BYTES);
			const privateKey = keys.slice(0, KEY_BYTES);
			const publicKey = keys.slice(KEY_BYTES);
			// ponytail: a seal round trip proves the pair matches; use crypto_scalarmult_base
			// once react-native-libsodium has it on native.
			try {
				sodium.crypto_box_seal_open(
					sodium.crypto_box_seal(new Uint8Array(0), publicKey),
					publicKey,
					privateKey,
				);
			} catch {
				throw new Error("ezpriv: linked keys don't match");
			}
			return { privateKey, publicKey };
		},
	};
}

export type Crypto = ReturnType<typeof createCrypto>;
