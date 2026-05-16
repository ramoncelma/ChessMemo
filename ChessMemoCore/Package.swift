// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ChessMemoCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "ChessMemoCore", targets: ["ChessMemoCore"]),
    ],
    targets: [
        .target(name: "ChessMemoCore"),
        .testTarget(name: "ChessMemoCoreTests", dependencies: ["ChessMemoCore"]),
    ]
)
