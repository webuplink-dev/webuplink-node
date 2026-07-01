<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset=".github/logo-light.svg">
  <img alt="WebUplink" src=".github/logo-light.svg" width="200">
</picture>

### The whole web, as function calls.

[![npm version](https://img.shields.io/npm/v/webuplink.svg)](https://www.npmjs.com/package/webuplink)
[![CI](https://github.com/webuplink-dev/webuplink-node/actions/workflows/ci.yml/badge.svg)](https://github.com/webuplink-dev/webuplink-node/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Official TypeScript SDK for [WebUplink](https://webuplink.ai).

## Installation

```bash
npm install webuplink
```

## Quickstart

```typescript
import { WebUplink } from 'webuplink';

const client = new WebUplink(); // reads WEBUPLINK_API_KEY from env

// Browse a page — get back structured, callable tools
const page = await client.browse('https://example.com');
console.log(page.summary);
console.log(page.tools); // [{ name: '...', description: '...', params: [...] }, ...]

// Execute a tool discovered on the page
const tool = page.tools[0];
const result = await client.browse({
  session_id: page.session_id,
  tool: tool.name,
  params: { [tool.params[0].name]: 'some value' },
});

// Clean up
await client.closeSession(page.session_id);
```

## What you can build

- **AI agents that act on the web** — browse any site, get back typed tool definitions, execute actions
- **No selectors, no scraping** — WebUplink understands pages and generates callable tools automatically
- **Multi-step workflows** — sessions persist across navigations, so your agent can search → filter → select → checkout
- **Any website, zero configuration** — works on sites you've never seen before

## Documentation

Full reference at **[webuplink.ai/docs](https://webuplink.ai/docs)**.

## Contributing

```bash
git clone https://github.com/webuplink-dev/webuplink-node.git
cd webuplink-node
npm install
npm test
```

## License

MIT
