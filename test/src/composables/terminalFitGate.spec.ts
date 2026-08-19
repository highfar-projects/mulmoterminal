import { describe, it, expect } from "vitest";
import { initialFitGate, reportOnScreen, requestFit, type FitGate } from "../../../src/composables/terminalFitGate";

// The rule behind #1762: a terminal xterm has paused (because it is off screen) must not be
// resized, or its viewport keeps a scroll range built from the height it had and the line count it
// has — which in the alternate buffer nothing ever recomputes.

const offScreen: FitGate = { onScreen: false, owed: false };

describe("terminal fit gate", () => {
  it("starts open, so the fit attach() does before connect() still runs", () => {
    expect(initialFitGate.onScreen).toBe(true);
    expect(requestFit(initialFitGate).fit).toBe(true);
  });

  it("fits while on screen and owes nothing", () => {
    const step = requestFit({ onScreen: true, owed: false });
    expect(step).toEqual({ gate: { onScreen: true, owed: false }, fit: true });
  });

  it("holds a fit back while off screen and remembers it", () => {
    const step = requestFit(offScreen);
    expect(step).toEqual({ gate: { onScreen: false, owed: true }, fit: false });
  });

  it("collapses repeated off-screen requests into the one fit that is owed", () => {
    const once = requestFit(offScreen);
    const twice = requestFit(once.gate);
    const thrice = requestFit(twice.gate);
    expect(thrice.fit).toBe(false);
    expect(thrice.gate).toEqual({ onScreen: false, owed: true });
    // …and coming back pays it exactly once.
    const back = reportOnScreen(thrice.gate, true);
    expect(back.fit).toBe(true);
    expect(reportOnScreen(back.gate, true).fit).toBe(false);
  });

  it("runs the held-back fit when the terminal comes back on screen", () => {
    const held = requestFit(offScreen).gate;
    expect(reportOnScreen(held, true)).toEqual({ gate: { onScreen: true, owed: false }, fit: true });
  });

  it("does not fit on a return that nothing was waiting for", () => {
    expect(reportOnScreen(offScreen, true)).toEqual({ gate: { onScreen: true, owed: false }, fit: false });
  });

  it("never fits on the way off screen, and keeps a debt across the trip", () => {
    const held = requestFit(offScreen).gate;
    const away = reportOnScreen(held, false);
    expect(away).toEqual({ gate: { onScreen: false, owed: true }, fit: false });
    expect(reportOnScreen({ onScreen: true, owed: false }, false)).toEqual({ gate: { onScreen: false, owed: false }, fit: false });
  });

  it("clears a stale debt when a fit is admitted", () => {
    // Not reachable through the two functions (a debt is only taken on while off screen), but the
    // gate is a plain value a caller could hand back — an admitted fit settles whatever was owed.
    expect(requestFit({ onScreen: true, owed: true })).toEqual({ gate: { onScreen: true, owed: false }, fit: true });
  });

  it("leaves the gate it was given untouched", () => {
    const gate: FitGate = { onScreen: false, owed: false };
    requestFit(gate);
    reportOnScreen(gate, true);
    expect(gate).toEqual({ onScreen: false, owed: false });
  });

  it("stays put under a repeated report of the same state", () => {
    const on = reportOnScreen(initialFitGate, true);
    expect(on).toEqual({ gate: { onScreen: true, owed: false }, fit: false });
    const off = reportOnScreen(offScreen, false);
    expect(off).toEqual({ gate: { onScreen: false, owed: false }, fit: false });
  });
});
