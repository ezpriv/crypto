// Where key_A lives after unlock, so the user doesn't type the password on every launch.
// The library isn't involved here: it made key_A, and storing it is the platform's job.
import assert from "node:assert/strict";
import { brief, ez, show } from "../_shared/setup.ts";

/** A place that keeps key_A. Each real one below is replaced here by a Map. */
interface KeyStore {
	readonly name: string;
	get(userId: string): Promise<Uint8Array | undefined>;
	set(userId: string, key: Uint8Array): Promise<void>;
	delete(userId: string): Promise<void>;
}

function memoryStore(name: string): KeyStore {
	const items = new Map<string, Uint8Array>();
	return {
		name,
		get: async (userId) => items.get(userId),
		set: async (userId, key) => void items.set(userId, key),
		delete: async (userId) => void items.delete(userId),
	};
}

// iOS and Android: expo-secure-store, kept on this device only and readable after the first
// unlock, so the notification extension can open pushes while the phone is locked (see 10):
//   SecureStore.setItemAsync(`key_A.${userId}`, base64, {
//     keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
//     accessGroup: "<TEAM_ID>.com.example.shared", // iOS: shared with the extension
//   });
const thisPhone = memoryStore("device keychain");

// iOS: a second, synced Keychain item (kSecAttrSynchronizable, kSecAttrAccessibleAfterFirstUnlock)
// through a small native module, so the user's other Apple devices get key_A from iCloud Keychain,
// which Apple encrypts end to end.
const iCloudKeychain = memoryStore("iCloud Keychain");

// Android: Google Block Store with setShouldBackupToCloud(true), but only when
// isEndToEndEncryptionAvailable() is true (a screen lock is set). Otherwise Google could read
// the backup, so the app skips it and the user types the password on the next phone.
const blockStore = memoryStore("Google Block Store");

// A computer's browser: IndexedDB for the app's origin. Anything running on the page can read
// it, so serve a strict Content-Security-Policy and clear it on sign-out.
const indexedDb = memoryStore("IndexedDB");

async function afterUnlock(
	stores: KeyStore[],
	userId: string,
	key: Uint8Array,
) {
	for (const store of stores) await store.set(userId, key);
}

const userId = crypto.randomUUID();
const keyA = ez.createUserKeys().privateKey; // unlocked by password, words or passkey (02 to 04)

// iPhone: keep it on the device and in iCloud Keychain.
await afterUnlock([thisPhone, iCloudKeychain], userId, keyA);
// Android phone without a screen lock: on the device only.
const androidPhone = memoryStore("device keychain (Android)");
const e2eeAvailable = false; // In a real app: BlockstoreClient.isEndToEndEncryptionAvailable()
await afterUnlock(
	e2eeAvailable ? [androidPhone, blockStore] : [androidPhone],
	userId,
	keyA,
);
// Computer: in the browser's storage, after a password unlock or a QR link (see 11).
await afterUnlock([indexedDb], userId, keyA);

// A new iPhone on the same Apple account: key_A arrives through iCloud Keychain, no password.
const newIphone = memoryStore("device keychain (new iPhone)");
const synced = await iCloudKeychain.get(userId);
assert.ok(synced);
await newIphone.set(userId, synced);
assert.deepEqual(await newIphone.get(userId), keyA);
// A new Android phone: nothing in Block Store, so it asks for the password (see 02).
assert.equal(await blockStore.get(userId), undefined);

const holds = async (store: KeyStore) => {
	const key = await store.get(userId);
	return key ? brief(key) : "nothing";
};
const stores = [
	thisPhone,
	iCloudKeychain,
	androidPhone,
	blockStore,
	indexedDb,
	newIphone,
];
show(
	"Who holds key_A",
	Object.fromEntries(
		await Promise.all(stores.map(async (s) => [s.name, await holds(s)])),
	),
);

// Sign-out on the computer clears its copy. The other devices keep theirs.
await indexedDb.delete(userId);
assert.equal(await indexedDb.get(userId), undefined);
assert.deepEqual(await thisPhone.get(userId), keyA);
console.log("\n✓ 05 device and synced copies");
