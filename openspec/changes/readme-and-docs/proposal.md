## Why

The repository is public and its README is Emergent's placeholder ("Here are your Instructions"). The n8n community node and every share link will send developers here first; the README is the second landing page and currently says nothing. Cheap, and useful for the contest's "Use of Emergent" and "Problem Solving" story too.

**Activation trigger:** now — no product risk, no credits (edit in Git, not through the Emergent agent).

## What Changes

- README: one-paragraph pitch, the diff-message example, 3-step setup with the curl, connector table, self-host instructions (six env vars, Mongo, `uvicorn`, `craco build`), link to `openspec/` for the roadmap.
- `docs/` folder: per-platform setup (n8n, Make, Zapier), "what we store" (stub until `data-minimisation`), security disclosure contact.
- Trim `requirements.txt` of unused packages (pandas, numpy, boto3, emergentintegrations, passlib, python-jose) after confirming none are imported.
- Fix PRD date ("Implemented 2026-02" → 2026-08) and point `memory/PRD.md` at OpenSpec.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- (none — documentation and dependency hygiene only)

## Impact

`README.md`, `docs/`, `backend/requirements.txt`, `memory/PRD.md`. Verify the Emergent build still succeeds after trimming requirements (deploy preview before publish).
