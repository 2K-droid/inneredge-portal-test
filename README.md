# Inner Edge portal test

A technical test: can a Claude agent save something into storage on an Inner Edge Netlify site, through a private connection?

- `netlify/functions/mcp.mjs`: the private agent connection (MCP). Address: `/mcp/<secret>`.
- The secret is the Netlify environment variable `MCP_PATH_TOKEN` (scope: Functions, marked secret). It is never written in any file.
- Tools: `add_test_item` and `list_test_items`. Test data only. No delete tool.
- Storage: Netlify Blobs, store `portal-test`.

Delete this project when the test is done, or keep it as the start of the client portal.
