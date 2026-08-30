const PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "AWS access key id", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "private key block", pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
  { name: "Slack token", pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "OpenAI key", pattern: /sk-[A-Za-z0-9]{32,}/ },
];

/** Names of the secret kinds this text appears to contain. */
export function detectSecrets(text: string): string[] {
  return PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
}
