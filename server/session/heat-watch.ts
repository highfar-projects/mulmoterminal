// Measures how hard each connected session is working and tells its browser (playfulEffects).
//
// One `ps` and one tmux listing per tick, for every session at once, and only while some browser
// is connected and the setting is not "off" — an unwatched server spawns nothing.
import type { HeatLevel } from "../../common/playfulEffects.js";
import { emptyHeatTrack, nextHeat, type HeatTrack } from "./heat-track.js";
import type { ProcessRow } from "../infra/process-list.js";
import { sessionCpuPercent } from "./session-cpu.js";

export interface HeatWatchDeps {
  enabled: () => boolean;
  /** Each session a browser is attached to, keyed to that browser's socket. */
  connectedSessions: () => ReadonlyMap<string, object>;
  listProcesses: () => Promise<ProcessRow[] | null>;
  listPanePids: () => Promise<ReadonlyMap<string, number> | null>;
  publish: (id: string, level: HeatLevel, finale: boolean) => void;
  now?: () => number;
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 5000;
const MS_PER_SECOND = 1000;

/** A session tmux no longer lists is gone; its history goes with it. */
function forgetVanished(panes: ReadonlyMap<string, number>, ...records: Map<string, unknown>[]): void {
  records.forEach((record) => [...record.keys()].filter((id) => !panes.has(id)).forEach((id) => record.delete(id)));
}

export function createHeatWatch(deps: HeatWatchDeps) {
  const now = deps.now ?? Date.now;
  const tracks = new Map<string, HeatTrack>();
  const published = new Map<string, { socket: object; level: HeatLevel }>();
  let baseline: { rows: ProcessRow[]; atMs: number } | null = null;
  let running = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const report = (id: string, socket: object, level: HeatLevel, finale: boolean): void => {
    const last = published.get(id);
    if (!finale && last?.socket === socket && last.level === level) return;
    published.set(id, { socket, level });
    deps.publish(id, level, finale);
  };

  const measure = async (connected: ReadonlyMap<string, object>): Promise<void> => {
    const [rows, panes] = await Promise.all([deps.listProcesses(), deps.listPanePids()]);
    if (rows === null || panes === null) return;
    const atMs = now();
    const previous = baseline;
    baseline = { rows, atMs };
    if (previous === null) return;
    forgetVanished(panes, tracks, published);
    const watched = new Map([...panes].filter(([id]) => connected.has(id)));
    const usage = sessionCpuPercent(previous.rows, rows, watched, (atMs - previous.atMs) / MS_PER_SECOND);
    usage.forEach((percent, id) => {
      const result = nextHeat(tracks.get(id) ?? emptyHeatTrack(), { fromMs: previous.atMs, toMs: atMs, percent });
      tracks.set(id, result.track);
      const socket = connected.get(id);
      if (socket) report(id, socket, result.level, result.finale);
    });
  };

  /** One measurement. Skipped while another is still running, or when nobody is watching. */
  async function tick(): Promise<void> {
    const connected = deps.connectedSessions();
    if (!deps.enabled() || connected.size === 0) {
      // The next measurement is against a fresh listing, not one taken before the pause.
      baseline = null;
      return;
    }
    if (running) return;
    running = true;
    try {
      await measure(connected);
    } finally {
      running = false;
    }
  }

  function start(): void {
    if (timer !== null) return;
    timer = setInterval(() => {
      tick().catch(() => {});
    }, deps.intervalMs ?? DEFAULT_INTERVAL_MS);
  }

  function stop(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  // Exists so "a finished session frees its history" is tested rather than asserted.
  const trackedSessionCount = (): number => tracks.size;

  return { tick, start, stop, trackedSessionCount };
}
