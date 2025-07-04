// src/global.d.ts
export {};

declare global {
  interface Window {
    /** Version injected by the Ably Chat React UI Components bundle */
    __ABLY_CHAT_REACT_UI_COMPONENTS_VERSION__?: string;
  }
  // eslint-disable-next-line no-var
  var __ABLY_CHAT_REACT_UI_COMPONENTS_VERSION__: string | undefined;
}
