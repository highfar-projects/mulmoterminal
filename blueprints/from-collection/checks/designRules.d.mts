export declare const SAME_AS_MULMOTERMINAL: string;
export declare const DESIGNS: readonly { option: string; theme: string | null }[];
export declare const SIGNATURE_CLASSES: readonly string[];
export declare function designOf(answer: string | undefined): { option: string; theme: string | null } | null;
export declare function themeBlock(text: string): string | null;
export interface FileText {
  path: string;
  text: string;
}
export declare function designProblems(input: {
  answer: string | undefined;
  packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null;
  viteConfigs: readonly FileText[];
  styles: readonly FileText[];
  sources: readonly FileText[];
  designMd: string | null;
  icon: string | null;
  template: string | null;
}): string[];
