# Security policy

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, private data, or a working attack against a deployed FLINT system. Report security concerns to contact@flint.network and include the affected version, reproduction conditions, impact, and a safe proof of concept when possible.

## Prototype boundary

This repository is a hackathon reference implementation. It:

- performs bounded manifest analysis and does not execute submitted tools;
- uses synthetic fixtures and session-local state;
- generates ephemeral local signing keys for self-attested community credentials;
- does not issue a FLINT Stamp or provide production assurance; and
- must not be connected to production credentials or sensitive customer data without a separate security review.

If you add a scanner that executes commands, MCP servers, or submitted code, run it in an isolated disposable environment with explicit consent, constrained credentials and egress, resource limits, and complete audit logs.
