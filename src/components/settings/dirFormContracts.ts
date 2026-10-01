import type { DirConfigEdit, DirFormKey } from "../../../common/dirConfigForm";
import type { DirConfigDetailView } from "../dirConfigDetail";

// One field of a directory's form: it is handed what its key holds and says what the key should become.
export interface DirFieldProps {
  value: unknown;
  saving: boolean;
}
export interface DirFieldEmits {
  (e: "change", edit: DirConfigEdit): void;
}

// A section of the form: each row asks for a save, or for its key to move to the other file.
export interface DirSectionProps {
  detail: DirConfigDetailView;
  saving: boolean;
}
export interface DirSectionEmits {
  (e: "save", edit: DirConfigEdit): void;
  (e: "move", key: DirFormKey, to: "local" | "shared"): void;
}
