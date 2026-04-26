/**
 * core/remediation.ts — inline remediation hints
 *
 * Maps rule_id → "How to fix" text shown in the hover tooltip.
 * No network call needed — all guidance is inline.
 *
 * CONTRIBUTING: When adding a new rule to bawbel-scanner, add its
 * remediation hint here. Key = rule_id from the CLI finding.
 * Keep hints under 120 chars per line. Be specific and actionable.
 */

const REMEDIATION_MAP: Record<string, string> = {
  "bawbel-shell-pipe":
    "Remove curl|bash or similar pipe patterns. If code execution is needed, " +
    "use a sandboxed tool with explicit user consent.",

  "bawbel-external-fetch":
    "Remove instructions to fetch from external URLs. Hard-code trusted " +
    "sources or require explicit user approval before any fetch.",

  "bawbel-instruction-override":
    "Remove phrases that attempt to override the system prompt or ignore " +
    "previous instructions. These are the core prompt injection vector.",

  "bawbel-memory-persistence":
    "Remove instructions to persist memory across sessions without user " +
    "consent. Memory writes must be explicit and user-visible.",

  "bawbel-exfiltration":
    "Remove any instruction to send data to external endpoints. All " +
    "outbound calls must be user-initiated and scoped.",

  "bawbel-role-impersonation":
    "Remove role-claim escalation patterns (e.g. 'you are now', 'act as " +
    "root'). Roles must be set by the system prompt only.",

  "bawbel-mcp-tool-poison":
    "Audit MCP tool descriptions for embedded instructions. Tool " +
    "descriptions must describe the tool only — no behavioral directives.",

  "bawbel-hidden-instruction":
    "Remove whitespace-hidden or Unicode-obfuscated text. All content " +
    "must be visible to the user who installs the skill.",

  "bawbel-rag-injection":
    "Sanitise RAG inputs before injecting into the prompt. Treat retrieved " +
    "content as untrusted user input, not trusted instructions.",

  "bawbel-lateral-movement":
    "Remove references to accessing agents, services, or systems not " +
    "declared in the skill manifest.",

  "bawbel-content-type-mismatch":
    "File content does not match its extension. Verify this is not a " +
    "disguised binary or executable masquerading as a skill file.",

  "bawbel-a2a-injection":
    "Cross-agent messages must be validated before use. Never pass raw " +
    "agent output into another agent's system prompt.",

  "bawbel-memory-poisoning":
    "Remove patterns that write arbitrary data into agent memory stores. " +
    "Memory writes must be scoped, validated, and user-approved.",

  "bawbel-destructive-command":
    "Remove or sandbox destructive operations (rm -rf, DROP TABLE, etc.). " +
    "Destructive actions require explicit user confirmation every time.",

  "bawbel-env-exfiltration":
    "Remove instructions to read or transmit environment variables. " +
    "API keys and secrets must never leave the local environment.",

  "bawbel-unsafe-eval":
    "Remove eval(), exec(), and dynamic code execution. Use safe " +
    "alternatives with strict input validation and sandboxing.",

  "bawbel-supply-chain":
    "Do not dynamically import skills or plugins from unverified sources. " +
    "Pin all dependencies to specific verified versions.",

  "bawbel-covert-channel":
    "Remove encoding/steganographic patterns used to exfiltrate data. " +
    "All output must be human-readable and auditable.",

  "bawbel-excessive-agency":
    "Constrain tool access to the minimum required. Declare all tools " +
    "explicitly in the skill manifest — no open-ended tool discovery.",

  "bawbel-vision-injection":
    "Sanitise image/document content before passing to vision models. " +
    "Treat visual content as untrusted user input.",
};

/**
 * Get the remediation hint for a rule.
 * Falls back to the finding description if no specific hint exists.
 */
export function getRemediation(ruleId: string, description: string): string {
  return REMEDIATION_MAP[ruleId]
    ?? description
    ?? "Review the matched content and remove or sanitise the flagged pattern.";
}

/**
 * Check if a specific hint exists for a rule.
 * Useful for UI to show "Bawbel guidance" vs "From finding description".
 */
export function hasSpecificRemediation(ruleId: string): boolean {
  return ruleId in REMEDIATION_MAP;
}
