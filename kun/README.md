# Kun Agent Runtime

Kun is the private local Agent runtime embedded in ZhiYan Assistant.
It is not a standalone end-user product.

## Responsibilities

- connect to OpenAI-compatible model APIs;
- manage conversations, context, approvals, and resumable sessions;
- discover and activate built-in, project, and user Skills;
- expose controlled file, search, web, MCP, and analysis tools;
- stream structured events to the Electron desktop application.

## Development

```powershell
npm install
npm run build
npm test
npm run typecheck
```

The desktop application starts Kun automatically. Teachers do not need to
run commands, edit runtime configuration, or understand this directory.

Runtime data is stored under the ZhiYan application data directory. Product
defaults and migration behavior are owned by the desktop settings layer in
`src/shared/app-settings-*`.
