import type { AssessmentReport } from "../domain/contracts";
import type { ScanOptions } from "./scanManifest";

export type ScannerExecutionMode = "in-process-read-only" | "isolated-worker" | "remote-service";

export type ScannerAdapterDescriptor = {
  id: string;
  version: string;
  displayName: string;
  executionMode: ScannerExecutionMode;
  requiresCredential: boolean;
  executesSubmittedCode: boolean;
  supportedArtifactTypes: string[];
};

export interface ScannerAdapter {
  readonly descriptor: ScannerAdapterDescriptor;
  assess(input: unknown, options?: ScanOptions): Promise<AssessmentReport>;
}
