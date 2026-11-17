// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "EzprivOpen",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library(name: "EzprivOpen", targets: ["EzprivOpen"])],
    dependencies: [
        .package(url: "https://github.com/jedisct1/swift-sodium.git", exact: "0.9.1"),
    ],
    targets: [
        .target(name: "EzprivOpen", dependencies: [.product(name: "Sodium", package: "swift-sodium")]),
        .testTarget(name: "EzprivOpenTests", dependencies: ["EzprivOpen"]),
    ]
)
