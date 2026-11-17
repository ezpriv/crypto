import Sodium

public enum EzprivError: Error {
    case unsupportedVersion, cannotOpen, wrongContext
}

/// Opens what `sealForUser` made (SPEC.md, "Sealed"), for an iOS Notification Service Extension.
public func openSealed(_ sealed: [UInt8], context: String, publicKey: [UInt8], privateKey: [UInt8]) throws -> [UInt8] {
    guard sealed.first == 1 else { throw EzprivError.unsupportedVersion }
    guard let opened = Sodium().box.open(
        anonymousCipherText: Array(sealed.dropFirst()),
        recipientPublicKey: publicKey,
        recipientSecretKey: privateKey
    ) else { throw EzprivError.cannotOpen }
    let header = Array(frame(["1", "ezpriv/user", context]).utf8)
    guard opened.starts(with: header) else { throw EzprivError.wrongContext }
    return Array(opened.dropFirst(header.count))
}

/// Netstrings, as in SPEC.md "Frames".
public func frame(_ fields: [String]) -> String {
    fields.map { "\($0.utf8.count):\($0)," }.joined()
}
