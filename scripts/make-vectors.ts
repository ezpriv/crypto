// Writes vectors/vectors.json. Derived keys are fixed; ciphertexts change on every run.
import { writeFileSync } from "node:fs";
import sodium from "libsodium-wrappers-sumo";
import { createCrypto, frame, type KeyPair } from "../src/index.ts";

await sodium.ready;
const c = createCrypto(sodium);
const hex = (bytes: Uint8Array) => sodium.to_hex(bytes);
const text = (value: string) => new TextEncoder().encode(value);
const pair = (keys: KeyPair) => ({
	publicKey: hex(keys.publicKey),
	privateKey: hex(keys.privateKey),
});

const keys = {
	user: c.createUserKeys(),
	member: c.createUserKeys(),
	link: c.newLinkRequest(),
};
const salt = sodium.from_hex("000102030405060708090a0b0c0d0e0f");
const params = { opsLimit: 2, memLimit: 19 * 1024 * 1024 };
const passwords = ["correct horse battery staple", "contraseña segura"];
const passwordKeys = passwords.map((password) => {
	const { keyP, authKey } = c.passwordKeys({ password, salt, params });
	return { password, salt: hex(salt), params, keyP: hex(keyP), authKey: hex(authKey) };
});
const words =
	"legal winner thank year wave sausage worth useful legal winner thank yellow";
const prf = sodium.from_hex(
	"000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
);
const groupKey = sodium.from_hex(
	"a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf",
);
const keyP = c.passwordKeys({ password: passwords[0] ?? "", salt, params }).keyP;
const row = text('{"name":"Pizza","amountClp":12990}');
const notification = text('{"title":"Pizza","body":"$12.990"}');
const ids = {
	userId: "user-1",
	groupId: "9b2f4c1e-0d3a-4e5f-8a6b-7c8d9e0f1a2b",
	rowId: "3f6c2a10-8b7d-4c9e-a1f2-0e3d4c5b6a79",
	channelId: "c7e1d2f3-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
};

const vectors = {
	version: 1,
	keys: { user: pair(keys.user), member: pair(keys.member), link: pair(keys.link) },
	frame: [
		{ fields: ["1", "ezpriv/row", "expense", "42"], frame: frame(["1", "ezpriv/row", "expense", "42"]) },
		{ fields: ["1", "ezpriv/user", "señal"], frame: frame(["1", "ezpriv/user", "señal"]) },
	],
	passwordKeys,
	keyFromWords: [{ words, key: hex(c.keyFromWords(words)) }],
	keyFromPrf: [{ prf: hex(prf), key: hex(c.keyFromPrf(prf)) }],
	wrapKey: [
		{
			key: hex(keys.user.privateKey),
			wrappingKey: hex(keyP),
			userId: ids.userId,
			kind: "password",
			wrapped: hex(
				c.wrapKey({ key: keys.user.privateKey, wrappingKey: keyP, userId: ids.userId, kind: "password" }),
			),
		},
	],
	encryptRow: [
		{
			value: hex(row),
			groupKey: hex(groupKey),
			table: "expense",
			rowId: ids.rowId,
			encrypted: hex(c.encryptRow({ value: row, groupKey, table: "expense", rowId: ids.rowId })),
		},
	],
	sealGroupKey: [
		{
			groupKey: hex(groupKey),
			groupId: ids.groupId,
			recipient: "member",
			sealed: hex(c.sealGroupKey({ groupKey, groupId: ids.groupId, publicKey: keys.member.publicKey })),
		},
	],
	sealForUser: [
		{
			value: hex(notification),
			context: "notification",
			recipient: "user",
			sealed: hex(
				c.sealForUser({ value: notification, context: "notification", publicKey: keys.user.publicKey }),
			),
		},
	],
	sealForLink: [
		{
			channelId: ids.channelId,
			userId: ids.userId,
			recipient: "link",
			sealed: hex(
				c.sealForLink({
					userKeys: keys.user,
					channelId: ids.channelId,
					userId: ids.userId,
					linkPublicKey: keys.link.publicKey,
				}),
			),
		},
	],
};

writeFileSync(
	new URL("../vectors/vectors.json", import.meta.url),
	`${JSON.stringify(vectors, null, "\t")}\n`,
);
