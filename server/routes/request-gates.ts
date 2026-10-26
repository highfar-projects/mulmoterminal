// The two gates every request passes before any route, parser or static file (#3188). Its own
// function so the order is decided — and tested — in one place: mountAppRoutes calls it first.
//
// The Host gate is first: a DNS-rebound page reads as same-origin and sends no Origin, so only the
// name it was addressed to gives it away. Then one same-origin gate for every state-changing request,
// so a site the user visits cannot drive this server through their browser. Both run ahead of the
// body parsers, so a request that is going to be refused is never handed a body to parse. Individual
// routes keep their own checks — these are the floor, not a replacement.
import type { Express } from "express";
import { hostGuard } from "../infra/http/host-guard.js";
import { sameOriginGuard } from "./same-origin-guard.js";

export interface RequestGateDeps {
  isAllowedHost: (hostHeader: string | undefined) => boolean;
  isAllowedOrigin: (origin: string | undefined, remoteAddress: string | undefined) => boolean;
}

export function mountRequestGates(app: Pick<Express, "use">, deps: RequestGateDeps): void {
  app.use(hostGuard(deps.isAllowedHost));
  app.use(sameOriginGuard(deps.isAllowedOrigin));
}
