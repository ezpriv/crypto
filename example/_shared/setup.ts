// Shared by every example: libsodium and the library, a stand-in server, and byte helpers.
import { createCrypto } from "@ezpriv/crypto";
import sodium from "libsodium-wrappers-sumo";

// In a real app: `import * as sodium from "react-native-libsodium"` on iOS and Android,
// libsodium-wrappers-sumo in browsers and service workers.
await sodium.ready;
export const ez = createCrypto(sodium);

export const text = (value: string) => new TextEncoder().encode(value);
export const read = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
export const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
export const toB64url = (bytes: Uint8Array) =>
	Buffer.from(bytes).toString("base64url");
export const fromB64url = (value: string) =>
	new Uint8Array(Buffer.from(value, "base64url"));
export const random = (length: number) =>
	crypto.getRandomValues(new Uint8Array(length));

/** Length and first 4 bytes. Real apps must never log keys, passwords or recovery words at all. */
export const brief = (bytes: Uint8Array) =>
	`${bytes.length} bytes, ${hex(bytes.subarray(0, 4))}…`;

function json(value: unknown, bytes: (b: Uint8Array) => string) {
	return JSON.stringify(
		value,
		function (this: Record<string, unknown>, key, v) {
			const raw = this[key]; // before toJSON, so a Buffer counts as bytes too
			if (raw instanceof Uint8Array) return bytes(raw);
			return v instanceof Map ? Object.fromEntries(v) : v;
		},
		2,
	);
}

/** Prints what one party holds, with every byte array shortened by `brief`. */
export const show = (who: string, value: unknown) =>
	console.log(`\n${who}:\n${json(value, brief)}`);

/**
 * In a real app: your backend and its database. Everything stored here is what the server,
 * and anyone who breaches it, can read.
 */
export function createServer() {
	const tables = new Map<string, Map<string, unknown>>();
	return {
		table<T>(name: string): Map<string, T> {
			if (!tables.has(name)) tables.set(name, new Map());
			return tables.get(name) as Map<string, T>;
		},
		/** The whole database with bytes in full hex, to check what isn't in it. */
		dump: () => json(tables, hex),
		show: () => show("Server holds", tables),
	};
}
