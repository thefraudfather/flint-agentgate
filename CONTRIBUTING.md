# Contributing

Thank you for improving AgentGate Community.

## Development

```bash
npm ci
npm test
npm run typecheck
npm run build
```

Changes should preserve these boundaries:

- deterministic denials remain outside model judgment;
- scanner failures and degraded coverage fail closed;
- artifact identity is bound to an exact version and canonical digest;
- community credentials cannot claim a FLINT Stamp or FLINT verification;
- submitted tools are never executed in the application process; and
- no production credentials, customer data, or proprietary FLINT detection logic enter this repository.

New scanners must implement `ScannerAdapter`, declare execution and credential requirements, normalize evidence into the FLINT Assessment Contract, and include license and notice obligations. New trust backends must implement `TrustProvider` without weakening the local cloneable path.

Include tests for success, denial, malformed input, partial coverage, and tampering where relevant.
