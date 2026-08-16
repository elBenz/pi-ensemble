# Contributing

Contributions through issues and pull requests are welcome.

## Before opening work

- Search existing issues and pull requests.
- Open an issue before substantial changes so scope can be agreed.
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Development

Requirements:

- Node.js 24
- npm

Setup and validation:

```sh
npm ci --ignore-scripts
npm run typecheck
npm run test:all
```

Keep changes focused. Add or update tests when behavior changes. Update documentation when interfaces, configuration, or user-visible behavior changes.

## Pull requests

- Explain what changed and why.
- Link the relevant issue when one exists.
- Include validation commands and results.
- Ensure CI passes and review conversations are resolved.
- Never commit credentials, secrets, private keys, or generated local agent state.

By contributing, you agree that your contribution is licensed under this repository's MIT license.
