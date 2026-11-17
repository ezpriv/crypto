package ezpriv

import com.goterl.lazysodium.LazySodiumAndroid
import com.goterl.lazysodium.SodiumAndroid

class EzprivException(message: String) : Exception(message)

private const val SEAL_BYTES = 48 // crypto_box_SEALBYTES

/** Netstrings, as in SPEC.md "Frames". */
fun frame(fields: List<String>): String =
    fields.joinToString("") { "${it.toByteArray(Charsets.UTF_8).size}:$it," }

/** Opens what `sealForUser` made (SPEC.md, "Sealed"), for an Android FirebaseMessagingService. */
fun openSealed(
    sealed: ByteArray,
    context: String,
    publicKey: ByteArray,
    privateKey: ByteArray,
    sodium: LazySodiumAndroid = LazySodiumAndroid(SodiumAndroid()),
): ByteArray {
    if (sealed.isEmpty() || sealed[0] != 1.toByte()) throw EzprivException("unsupported version")
    val box = sealed.copyOfRange(1, sealed.size)
    if (box.size < SEAL_BYTES) throw EzprivException("cannot open")
    val opened = ByteArray(box.size - SEAL_BYTES)
    if (!sodium.cryptoBoxSealOpen(opened, box, box.size.toLong(), publicKey, privateKey)) {
        throw EzprivException("cannot open")
    }
    val header = frame(listOf("1", "ezpriv/user", context)).toByteArray(Charsets.UTF_8)
    if (opened.size < header.size || !opened.copyOfRange(0, header.size).contentEquals(header)) {
        throw EzprivException("wrong context")
    }
    return opened.copyOfRange(header.size, opened.size)
}
