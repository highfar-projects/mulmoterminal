import type { DirConfigEdit } from "../../common/dirConfigForm";
import { isRecord } from "../../common/isRecord";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { parseDirConfigDetail, type DirConfigDetailView } from "./dirConfigDetail";

// Why a save did not land, in the three ways the form words differently: the file is not JSON the
// form can safely add to (named, so the user knows which one to fix), the server refused the value,
// or the request itself failed.
export type DirConfigSaveFailure = { kind: "unreadable"; file: string } | { kind: "refused"; message: string } | { kind: "failed" };

export type DirConfigSaveResult = { ok: true; detail: DirConfigDetailView } | { ok: false; failure: DirConfigSaveFailure };

const HTTP_UNPROCESSABLE = 422;
const HTTP_BAD_REQUEST = 400;

export async function saveDirConfigEdit(cwd: string, edit: DirConfigEdit): Promise<DirConfigSaveResult> {
  try {
    const res = await fetchWithTimeout("/api/dir-config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cwd, ...edit }),
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, detail: parseDirConfigDetail(body) };
    return { ok: false, failure: failureOf(res.status, body) };
  } catch {
    return { ok: false, failure: { kind: "failed" } };
  }
}

function failureOf(status: number, body: unknown): DirConfigSaveFailure {
  const fields = isRecord(body) ? body : {};
  if (status === HTTP_UNPROCESSABLE && typeof fields.file === "string") return { kind: "unreadable", file: fields.file };
  if (status === HTTP_BAD_REQUEST && typeof fields.error === "string") return { kind: "refused", message: fields.error };
  return { kind: "failed" };
}
