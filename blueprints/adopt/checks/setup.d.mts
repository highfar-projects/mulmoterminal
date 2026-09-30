// Types for setup.mjs, which the pack runs with plain node and the specs import.
export declare const placesIn: (answer: unknown) => { places: string[]; refused: string[] };
export declare const workflowFor: (template: string, places: readonly string[]) => string;
export declare const workflowProblems: (workflow: string, template: string, places: readonly string[]) => string[];
