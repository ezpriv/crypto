/**
 * The libsodium functions this library calls, and nothing else.
 * `libsodium-wrappers-sumo` (browsers, service workers, Node) and `react-native-libsodium`
 * (iOS and Android) both satisfy it, so the caller passes whichever its runtime has.
 * Associated data is a string because `react-native-libsodium` accepts nothing else on native.
 */
export interface Sodium {
	crypto_box_keypair(): { publicKey: Uint8Array; privateKey: Uint8Array };
	crypto_box_seal(message: Uint8Array, publicKey: Uint8Array): Uint8Array;
	crypto_box_seal_open(
		ciphertext: Uint8Array,
		publicKey: Uint8Array,
		privateKey: Uint8Array,
	): Uint8Array;
	crypto_aead_xchacha20poly1305_ietf_keygen(): Uint8Array;
	crypto_aead_xchacha20poly1305_ietf_encrypt(
		message: Uint8Array,
		additionalData: string,
		secretNonce: null,
		publicNonce: Uint8Array,
		key: Uint8Array,
	): Uint8Array;
	crypto_aead_xchacha20poly1305_ietf_decrypt(
		secretNonce: null,
		ciphertext: Uint8Array,
		additionalData: string,
		publicNonce: Uint8Array,
		key: Uint8Array,
	): Uint8Array;
	crypto_kdf_derive_from_key(
		subkeyLength: number,
		subkeyId: number,
		context: string,
		key: Uint8Array,
	): Uint8Array;
	crypto_pwhash(
		keyLength: number,
		password: Uint8Array,
		salt: Uint8Array,
		opsLimit: number,
		memLimit: number,
		algorithm: number,
	): Uint8Array;
	crypto_generichash(
		hashLength: number,
		message: Uint8Array,
		key: Uint8Array,
	): Uint8Array;
	randombytes_buf(length: number): Uint8Array;
}
