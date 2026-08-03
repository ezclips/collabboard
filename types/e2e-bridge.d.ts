import type { CollabboardE2EBridge } from '@/lib/e2e/bridgeContract';

declare global {
  interface Window {
    __COLLABBOARD_E2E__?: CollabboardE2EBridge;
  }
}

export {};
