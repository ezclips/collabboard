import type { RegisterE2EBridge } from './bridgeContract';

// Ordinary builds resolve here. E2E builds replace this exact module at build time.
export const registerE2EBridge: RegisterE2EBridge = () => () => undefined;
