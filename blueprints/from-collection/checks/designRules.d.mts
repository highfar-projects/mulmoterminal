export declare const SAME_AS_MULMOTERMINAL: string;
export declare const DESIGNS: readonly { option: string; theme: string | null }[];
export declare const SCREEN_ANCHORS: readonly { screen: string; className: string; when?: string }[];
export declare function designOf(answer: string | undefined): { option: string; theme: string | null } | null;
export declare function canonicalValue(value: string): string;
export declare function declarations(css: string): { name: string; value: string }[];
export interface FileText {
  path: string;
  text: string;
}
export declare function designProblems(input: {
  answer: string | undefined;
  packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null;
  builtCss: string | null;
  tailwindTheme: string | null;
  template: string | null;
  sources: readonly FileText[];
  designMd: string | null;
  icon: string | null;
  views?: { kanban?: boolean; calendar?: boolean };
}): string[];
