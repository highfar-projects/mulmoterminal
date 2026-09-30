// jsdom ships no types, and `@types/jsdom` is not installed; this is the part the specs use.
declare module "jsdom" {
  export interface ConstructorOptions {
    runScripts?: "dangerously" | "outside-only";
    beforeParse?: (window: Window & typeof globalThis) => void;
  }
  export class JSDOM {
    constructor(html?: string, options?: ConstructorOptions);
    readonly window: Window & typeof globalThis;
  }
}
