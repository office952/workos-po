# Governance V2 wave authorizations

Owner-controlled. Contract: [NOTION_JOURNAL_GATE_V2](../NOTION_JOURNAL_GATE_V2.md).

- `<RECORD_ID>.json` + `<RECORD_ID>.json.sig` — one Owner-signed wave authorization per implementation record.
- `owner_allowed_signers` — Owner public signing keys. Changed only by the Owner.
- `revocations.json` — append-only revocations.

Implementation agents never create, sign or edit files here. A wave PR touching this directory fails the V2 gate; an authorization PR must contain only these files, and every manifest must verify against the signer set already on protected `main`.
