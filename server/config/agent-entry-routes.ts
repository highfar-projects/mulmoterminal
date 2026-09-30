// One custom agent or one account added or removed (#2620), against the config ON DISK — never a
// client's copy of the list. A Settings tab sending its whole list would drop an entry another tab,
// another MulmoTerminal or a hand-edit added since it loaded; the saved directories and the palette
// favorites moved to one-entry routes for the same reason.
import type { Express, Response } from "express";
import { buildAccount, buildCustomAgent } from "../../common/agentEntries.js";
import { isAccountAgent } from "../../common/agentAccounts.js";
import { buildProvider } from "../../common/providerEntries.js";
import type { AppConfig } from "./app-config.js";
import { requestBody } from "../routes/requestBody.js";

export interface OnDiskChange {
  /** Why the change cannot be made to this config, or null to make it. Asked under the lock. An object
   *  is the 409's whole body, for a refusal that carries what the caller needs to try again. */
  refuse?: (base: AppConfig, unknownKeys: Record<string, unknown>) => string | ({ error: string } & Record<string, unknown>) | null;
  /** `unknownKeys`: what this version did not recognise in the file, which the write carries back (#966). */
  update: (base: AppConfig, unknownKeys: Record<string, unknown>) => Record<string, unknown>;
  answer: (next: AppConfig) => void;
}

export type MutateOnDisk = (res: Response, change: OnDiskChange) => Promise<void>;

const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function mountAgentEntryRoutes(app: Express, mutate: MutateOnDisk, onAccountsChanged: () => void): void {
  app.post("/api/config/custom-agents/add", (req, res) => {
    const body = requestBody(req.body);
    // Built against the list under the lock, so the id it derives is free in THAT list.
    const build = (base: AppConfig) => buildCustomAgent(text(body.label), text(body.command), base.customAgents);
    void mutate(res, {
      refuse: (base) => {
        const built = build(base);
        return "problem" in built ? built.problem : null;
      },
      update: (base) => {
        const built = build(base);
        return { customAgents: "entry" in built ? [...base.customAgents, built.entry] : base.customAgents };
      },
      answer: (next) => res.json({ customAgents: next.customAgents }),
    });
  });

  app.post("/api/config/custom-agents/remove", (req, res) => {
    const id = text(requestBody(req.body).id);
    if (!id) return res.status(400).json({ error: "id is required" });
    return void mutate(res, {
      update: (base) => ({ customAgents: base.customAgents.filter((entry) => entry.id !== id) }),
      answer: (next) => res.json({ customAgents: next.customAgents }),
    });
  });

  app.post("/api/config/accounts/add", (req, res) => {
    const body = requestBody(req.body);
    if (!isAccountAgent(body.agent)) return res.status(400).json({ error: "agent must be claude or codex" });
    const agent = body.agent;
    const build = (base: AppConfig) => buildAccount(text(body.label), agent, text(body.home), base.accounts);
    return void mutate(res, {
      refuse: (base) => {
        const built = build(base);
        return "problem" in built ? built.problem : null;
      },
      update: (base) => {
        const built = build(base);
        return { accounts: "entry" in built ? [...base.accounts, built.entry] : base.accounts };
      },
      answer: (next) => {
        // A new account's home has none of the bundled skills yet — the same step POST /api/config takes.
        onAccountsChanged();
        res.json({ accounts: next.accounts });
      },
    });
  });

  app.post("/api/config/accounts/remove", (req, res) => {
    const id = text(requestBody(req.body).id);
    if (!id) return res.status(400).json({ error: "id is required" });
    return void mutate(res, {
      update: (base) => ({ accounts: base.accounts.filter((entry) => entry.id !== id) }),
      answer: (next) => res.json({ accounts: next.accounts }),
    });
  });

  mountProviderRoutes(app, mutate);
}

// A backend (#2621), built against the providers ON DISK so its id is free there. The key itself
// never passes through here: `tokenEnv` is the name of the variable the server reads it from.
function mountProviderRoutes(app: Express, mutate: MutateOnDisk): void {
  app.post("/api/config/providers/add", (req, res) => {
    const body = requestBody(req.body);
    const draft = {
      label: text(body.label),
      baseUrl: text(body.baseUrl),
      tokenEnv: text(body.tokenEnv),
      models: text(body.models),
      maxOutputTokens: text(body.maxOutputTokens),
    };
    const build = (base: AppConfig) =>
      buildProvider(
        draft,
        base.providers.map((provider) => provider.id),
      );
    return void mutate(res, {
      refuse: (base) => {
        const built = build(base);
        return "problem" in built ? built.problem : null;
      },
      update: (base) => {
        const built = build(base);
        return { providers: "entry" in built ? [...base.providers, built.entry] : base.providers };
      },
      answer: (next) => res.json({ providers: next.providers }),
    });
  });

  app.post("/api/config/providers/remove", (req, res) => {
    const id = text(requestBody(req.body).id);
    if (!id) return res.status(400).json({ error: "id is required" });
    return void mutate(res, {
      update: (base) => ({ providers: base.providers.filter((provider) => provider.id !== id) }),
      answer: (next) => res.json({ providers: next.providers }),
    });
  });
}
