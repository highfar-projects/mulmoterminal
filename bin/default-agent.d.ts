// Types for bin/default-agent.js. See that file for why the gate works the way it does.
import type { TerminalAgent } from "../common/sessionAgent.js";

export interface StartupGate {
  /** Whose binary start-up must find. */
  agent: TerminalAgent;
  /** Always true today; named so a future "warn instead" cannot be added by accident. */
  required: boolean;
  /** Whether the user asked for this agent, which changes what the failure says. */
  declared: boolean;
}

export declare function isKnownAgent(value: unknown): value is TerminalAgent;
/** The raw token after `--agent`, `""` for a valueless flag, or null when absent. */
export declare function parseAgentArg(args: readonly string[]): string | null;
export declare function resolveDeclaredAgent(input?: { cliAgent?: string | null; configAgent?: string | null }): string | null;
export declare function gateFor(declaredAgent: string | null): StartupGate;
export declare function configuredDefaultAgent(parsedConfig: unknown): string | null;
export declare function missingAgentMessage(gate: StartupGate, bin: string | null): string[];
