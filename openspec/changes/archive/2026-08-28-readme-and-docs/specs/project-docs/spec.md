## ADDED Requirements

### Requirement: Repository documents the product and how to self-host
`README.md` SHALL state the pitch, show a real diff message, give the 3-step setup with the curl example, list the connectors, and give self-host instructions naming the six environment variables; `docs/` SHALL hold per-platform setup pages.

#### Scenario: Developer arrives from the n8n node
- **WHEN** a developer opens the repository root on GitHub
- **THEN** they can run the backend and frontend locally from the README alone
