# Pitch.vc — MCP server

Pitch.vc is reached through an **MCP server** that Claude Code talks to (there's no standalone CLI).
Once configured, Claude gets `mcp__pitch__*` tools for companies, people, pipeline, tags, cities,
follows, AI reviews, saved searches, sharing, and more.

- Package: [`@capitalthought/pitch-mcp-server`](https://www.npmjs.com/package/@capitalthought/pitch-mcp-server) (stdio, run via `npx -y`)
- Official docs: <https://pitch.vc/docs/mcp>

## Get an API key
In Pitch: **Settings → API Keys → create a key.** Copy the `pitch_…` token **immediately** — it's
shown only once.

## Set it up
The easy way — `cf connect` asks for the key (hidden input), writes the config, and verifies it:
```bash
cf connect      # or re-run it; it adds Pitch if not already configured
```

Or do it manually with the Claude CLI:
```bash
claude mcp add pitch --scope user \
  --env PITCH_API_KEY=pitch_YOUR_KEY_HERE \
  --env NPM_CONFIG_CACHE="$HOME/.npm-mcp-cache" \
  -- npx -y @capitalthought/pitch-mcp-server
```

Either way it lands in `~/.claude.json` as:
```jsonc
"mcpServers": {
  "pitch": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@capitalthought/pitch-mcp-server"],
    "env": { "PITCH_API_KEY": "pitch_…", "NPM_CONFIG_CACHE": "~/.npm-mcp-cache" }
  }
}
```
`NPM_CONFIG_CACHE` points the server at a private npm cache to sidestep `EACCES` errors from a
mixed-ownership `~/.npm` cache. The Pitch server validates your key against an internal
`/api/mcp/bootstrap` endpoint — no Supabase keys ever touch your machine.

## Important
**MCP servers load when Claude Code starts.** After adding Pitch, **restart Claude Code** before the
`mcp__pitch__*` tools appear. Verify with `cf doctor` (it does a quick MCP handshake) or by listing
tools inside Claude Code.

## Rotating / revoking
Generate a new key in Pitch settings and re-run `cf connect` (or edit `~/.claude.json`). To remove:
delete the `pitch` block from `mcpServers` in `~/.claude.json`.
