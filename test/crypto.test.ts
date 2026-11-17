import { readFileSync } from "node:fs";
import sodium from "libsodium-wrappers-sumo";
import { beforeAll, describe, expect, test } from "vitest";
import {
	createCrypto,
	frame,
	type KeyPair,
	type LinkRequest,
	type Sodium,
} from "../src/index.ts";

const vectors = JSON.parse(
	readFileSync(new URL("../vectors/vectors.json", import.meta.url), "utf8"),
);
const bytes = (hex: string) => sodium.from_hex(hex);
const hex = (value: Uint8Array) => sodium.to_hex(value);
const text = (value: string) => new TextEncoder().encode(value);
const pair = (keys: { publicKey: string; privateKey: string }): KeyPair => ({
	publicKey: bytes(keys.publicKey),
	privateKey: bytes(keys.privateKey),
});
const FAST = { opsLimit: 2, memLimit: 19 * 1024 * 1024 };

let c: ReturnType<typeof createCrypto>;
let user: KeyPair;
let member: KeyPair;
let link: LinkRequest;

beforeAll(async () => {
	await sodium.ready;
	c = createCrypto(sodium satisfies Sodium);
	user = pair(vectors.keys.user);
	member = pair(vectors.keys.member);
	link = {
		...pair(vectors.keys.link),
		secret: bytes(vectors.keys.link.secret),
	};
});

describe("vectors", () => {
	test("frames", () => {
		for (const v of vectors.frame) expect(frame(v.fields)).toBe(v.frame);
	});

	test("derived keys follow SPEC.md", () => {
		for (const v of vectors.passwordKeys) {
			const master = sodium.crypto_pwhash(
				32,
				text(v.password.normalize("NFC")),
				bytes(v.salt),
				v.params.opsLimit,
				v.params.memLimit,
				sodium.crypto_pwhash_ALG_ARGON2ID13,
			);
			const keys = c.passwordKeys({
				password: v.password,
				salt: bytes(v.salt),
				params: v.params,
			});

			expect(hex(keys.keyP)).toBe(v.keyP);
			expect(hex(keys.authKey)).toBe(v.authKey);
			expect(v.keyP).toBe(
				hex(sodium.crypto_kdf_derive_from_key(32, 1, "ezprivpw", master)),
			);
			expect(v.authKey).toBe(
				hex(sodium.crypto_kdf_derive_from_key(32, 2, "ezprivpw", master)),
			);
		}
		for (const v of vectors.keyFromWords) {
			expect(hex(c.keyFromWords(v.words))).toBe(v.key);
		}
		for (const v of vectors.keyFromPrf) {
			expect(hex(c.keyFromPrf(bytes(v.prf)))).toBe(v.key);
			expect(v.key).toBe(
				hex(sodium.crypto_kdf_derive_from_key(32, 1, "ezprivpk", bytes(v.prf))),
			);
		}
	});

	test("ciphertexts open", () => {
		const [wrap] = vectors.wrapKey;
		const [row] = vectors.encryptRow;
		const [groupKey] = vectors.sealGroupKey;
		const [sealed] = vectors.sealForUser;
		const [linked] = vectors.sealForLink;

		expect(
			hex(
				c.unwrapKey({
					wrapped: bytes(wrap.wrapped),
					wrappingKey: bytes(wrap.wrappingKey),
					userId: wrap.userId,
					kind: wrap.kind,
				}),
			),
		).toBe(wrap.key);
		expect(
			hex(
				c.decryptRow({
					encrypted: bytes(row.encrypted),
					groupKey: bytes(row.groupKey),
					table: row.table,
					rowId: row.rowId,
				}),
			),
		).toBe(row.value);
		expect(
			hex(
				c.openGroupKey({
					sealed: bytes(groupKey.sealed),
					groupId: groupKey.groupId,
					keyPair: member,
				}),
			),
		).toBe(groupKey.groupKey);
		expect(
			hex(
				c.openSealed({
					sealed: bytes(sealed.sealed),
					context: sealed.context,
					keyPair: user,
				}),
			),
		).toBe(sealed.value);
		expect(
			c.openLink({
				sealed: bytes(linked.sealed),
				channelId: linked.channelId,
				userId: linked.userId,
				linkKeys: link,
			}),
		).toEqual(user);
	});
});

describe("refusals", () => {
	const flip = (value: Uint8Array, index: number) => {
		const copy = value.slice();
		copy[index] = (copy[index] ?? 0) ^ 1;
		return copy;
	};

	test("rows refuse another table, row, version or a changed byte", () => {
		const groupKey = c.newGroupKey();
		const encrypted = c.encryptRow({
			value: text("hi"),
			groupKey,
			table: "expense",
			rowId: "1",
		});

		expect(() =>
			c.decryptRow({ encrypted, groupKey, table: "settlement", rowId: "1" }),
		).toThrow("cannot decrypt");
		expect(() =>
			c.decryptRow({ encrypted, groupKey, table: "expense", rowId: "2" }),
		).toThrow("cannot decrypt");
		expect(() =>
			c.decryptRow({
				encrypted: flip(encrypted, 30),
				groupKey,
				table: "expense",
				rowId: "1",
			}),
		).toThrow("cannot decrypt");
		expect(() =>
			c.decryptRow({
				encrypted: flip(encrypted, 0),
				groupKey,
				table: "expense",
				rowId: "1",
			}),
		).toThrow("unsupported version");
		expect(() =>
			c.decryptRow({
				encrypted: encrypted.slice(0, 20),
				groupKey,
				table: "expense",
				rowId: "1",
			}),
		).toThrow("too short");
	});

	test("wraps refuse another user or kind", () => {
		const wrappingKey = c.newGroupKey();
		const wrapped = c.wrapKey({
			key: user.privateKey,
			wrappingKey,
			userId: "u1",
			kind: "password",
		});

		expect(
			c.unwrapKey({ wrapped, wrappingKey, userId: "u1", kind: "password" }),
		).toEqual(user.privateKey);
		expect(() =>
			c.unwrapKey({ wrapped, wrappingKey, userId: "u2", kind: "password" }),
		).toThrow("cannot decrypt");
		expect(() =>
			c.unwrapKey({ wrapped, wrappingKey, userId: "u1", kind: "recovery" }),
		).toThrow("cannot decrypt");
	});

	test("sealed values refuse another context, group, channel or recipient", () => {
		const groupKey = c.newGroupKey();
		const sealedKey = c.sealGroupKey({
			groupKey,
			groupId: "g1",
			publicKey: member.publicKey,
		});
		const notification = c.sealForUser({
			value: text("x"),
			context: "notification",
			publicKey: user.publicKey,
		});
		const linked = c.sealForLink({
			userKeys: user,
			channelId: "ch1",
			userId: "u1",
			linkPublicKey: link.publicKey,
			linkSecret: link.secret,
		});

		expect(
			c.openGroupKey({ sealed: sealedKey, groupId: "g1", keyPair: member }),
		).toEqual(groupKey);
		expect(() =>
			c.openGroupKey({ sealed: sealedKey, groupId: "g2", keyPair: member }),
		).toThrow("wrong context");
		expect(() =>
			c.openGroupKey({ sealed: sealedKey, groupId: "g1", keyPair: user }),
		).toThrow("cannot open");
		expect(() =>
			c.openSealed({
				sealed: notification,
				context: "movement",
				keyPair: user,
			}),
		).toThrow("wrong context");
		expect(() =>
			c.openSealed({
				sealed: flip(notification, 60),
				context: "notification",
				keyPair: user,
			}),
		).toThrow("cannot open");
		expect(() =>
			c.openLink({
				sealed: linked,
				channelId: "ch2",
				userId: "u1",
				linkKeys: link,
			}),
		).toThrow("wrong context");
		expect(() =>
			c.openLink({
				sealed: linked,
				channelId: "ch1",
				userId: "u2",
				linkKeys: link,
			}),
		).toThrow("wrong context");
	});

	test("links refuse keys from someone who only has the public key, or a pair that doesn't match", () => {
		const attacker = c.createUserKeys();
		const ids = { channelId: "ch1", userId: "u1" };
		const blind = c.sealForLink({
			...ids,
			userKeys: attacker,
			linkPublicKey: link.publicKey,
			linkSecret: c.newGroupKey(),
		});
		const mixed = c.sealForLink({
			...ids,
			userKeys: { privateKey: attacker.privateKey, publicKey: user.publicKey },
			linkPublicKey: link.publicKey,
			linkSecret: link.secret,
		});

		expect(() => c.openLink({ ...ids, sealed: blind, linkKeys: link })).toThrow(
			"cannot decrypt",
		);
		expect(() => c.openLink({ ...ids, sealed: mixed, linkKeys: link })).toThrow(
			"don't match",
		);
	});
});

describe("unlock keys", () => {
	test("passwords are normalized and weak params are refused", () => {
		const salt = c.newSalt();
		const composed = c.passwordKeys({
			password: "contraseña",
			salt,
			params: FAST,
		});
		const decomposed = c.passwordKeys({
			password: "contraseña",
			salt,
			params: FAST,
		});

		expect(decomposed).toEqual(composed);
		expect(composed.keyP).not.toEqual(composed.authKey);
		expect(() =>
			c.passwordKeys({
				password: "x",
				salt,
				params: { opsLimit: 1, memLimit: FAST.memLimit },
			}),
		).toThrow("below the minimum");
		expect(() =>
			c.passwordKeys({
				password: "x",
				salt,
				params: { opsLimit: 2, memLimit: 1024 * 1024 },
			}),
		).toThrow("below the minimum");
		expect(() =>
			c.passwordKeys({ password: "x", salt: salt.slice(0, 8), params: FAST }),
		).toThrow("salt must be 16 bytes");
	});

	test.each([
		["NaN", { opsLimit: Number.NaN, memLimit: Number.NaN }, "must be integers"],
		[
			"a fraction",
			{ opsLimit: 2.5, memLimit: FAST.memLimit },
			"must be integers",
		],
		[
			"too many passes",
			{ opsLimit: 17, memLimit: FAST.memLimit },
			"above the maximum",
		],
		[
			"too much memory",
			{ opsLimit: 2, memLimit: 2 * 1024 ** 3 },
			"above the maximum",
		],
	])("password params with %s are refused", (_label, params, message) => {
		expect(() =>
			c.passwordKeys({ password: "x", salt: c.newSalt(), params }),
		).toThrow(message);
	});

	test("recovery words round-trip and tolerate spacing and case", () => {
		const words = c.newRecoveryWords();
		const messy = `  ${words.toUpperCase().split(" ").join("   ")} `;

		expect(words.split(" ")).toHaveLength(12);
		expect(c.keyFromWords(messy)).toEqual(c.keyFromWords(words));
	});

	test.each([
		[
			"an unknown word",
			"legal winner thank year wave sausage worth useful legal winner thank notaword",
		],
		[
			"a bad checksum",
			"legal winner thank year wave sausage worth useful legal winner thank zoo",
		],
		[
			"11 words",
			"legal winner thank year wave sausage worth useful legal winner thank",
		],
	])("recovery words with %s are refused", (_label, words) => {
		expect(() => c.keyFromWords(words)).toThrow();
	});

	test("PRF output must be 32 bytes", () => {
		expect(() => c.keyFromPrf(new Uint8Array(16))).toThrow(
			"prf must be 32 bytes",
		);
	});

	test("libsodium's Argon2id id matches the hard-coded one", () => {
		expect(sodium.crypto_pwhash_ALG_ARGON2ID13).toBe(2);
	});
});
