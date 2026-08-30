import type { ScannerAdapter } from "./adapter";
import { scanManifest, scannerId, scannerVersion } from "./scanManifest";

export const communityScanner: ScannerAdapter = {
  descriptor: {
    id: scannerId,
    version: scannerVersion,
    displayName: "FLINT AgentGate Community Scanner",
    executionMode: "in-process-read-only",
    requiresCredential: false,
    executesSubmittedCode: false,
    supportedArtifactTypes: ["webmcp-manifest", "mcp-manifest"],
  },
  assess: scanManifest,
};
