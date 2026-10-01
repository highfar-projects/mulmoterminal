import { computed } from "vue";
import type { DirFormKey } from "../../../common/dirConfigForm";
import type { DirConfigDetailView } from "../dirConfigDetail";

export function useDirFormKeys(detail: () => DirConfigDetailView) {
  const values = computed(() => detail().formValues);
  const isSet = (key: DirFormKey): boolean => key in values.value;
  const isLocal = (key: DirFormKey): boolean => detail().source.local.includes(key);
  return { values, isSet, isLocal };
}
