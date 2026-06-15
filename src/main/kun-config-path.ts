import { homedir } from 'node:os'
import { join } from 'node:path'

export function resolveKunMcpJsonPath(): string {
  return join(homedir(), '.kun', 'mcp.json')
}
