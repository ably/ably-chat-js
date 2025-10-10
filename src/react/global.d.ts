// src/global.d.ts
declare global {
  interface Window {
    /** Version injected by the Ably Chat React UI Kit bundle */
    __ABLY_CHAT_REACT_UI_KIT_VERSION__?: string;
  }

  var __ABLY_CHAT_REACT_UI_KIT_VERSION__: string | undefined;
}

// eslint-disable-next-line unicorn/require-module-specifiers
export {};
