# opencode-agy

Delegate tasks to [Antigravity](https://github.com/google-gemini/antigravity) (`agy` / Gemini) as a **blocking one-shot** — no polling, the full result is returned when done.

Ships as **two interchangeable front-ends** over one shared core:

| Front-end | Portable to | Live progress | When to use |
|-----------|-------------|---------------|-------------|
| **opencode custom tool** (`tools/agy.ts`) | opencode only | ✅ TUI title updates while agy runs | You're on opencode and want live progress |
| **MCP server** (`mcp/server.ts`) | Any MCP client (Claude Desktop, Cursor, opencode, …) | ❌ single result at end (use `tee_file` + `tail -f`) | You want portability across clients |

Both spawn `agy --print <prompt> --output-format stream-json`, parse the JSON stream line-by-line, and resolve with the full response.

## Why

The existing `mcp-server-google-antigravity` MCP server delegates via an async job model: call `use_antigravity` → get a `jobId` → poll `antigravity_result`. Polling burns orchestrator tokens on every round.

This project replaces that with a **single blocking call**: the caller invokes the tool **once**, goes **idle (0 tokens)** while agy works, then receives the complete result. Same ergonomics as delegating to a subagent.

## Features

- **No polling** — one call, full result returned
- **Live progress** (opencode tool only) — the tool-call title updates with elapsed time + the latest text delta
- **Tee to file** — `tee_file` writes the raw `stream-json` line-by-line so you can `tail -f` it in another terminal to watch the full process (works in both front-ends)
- **Cancellation** — abort signal kills the agy process (SIGTERM)
- **Conversation continuity** — `conversation_id` resumes a prior agy conversation
- **All agy flags** — `add_dirs`, `auto_approve`, `sandbox`, `model`, `agent`, `mode`, `project`, `new_project`, `print_timeout`
- **Parallel-safe** — callers that run tool calls concurrently (e.g. opencode) can invoke `agy` several times in one response for independent tasks (each gets its own agy conversation)

## Requirements

- The [agy CLI](https://github.com/google-gemini/antigravity) (`agy`) on your `PATH` (or set `AGY_PATH`), authenticated (`agy` login)
- A TS runtime for the MCP server: [Bun](https://bun.sh) or Node 22+ (`--experimental-strip-types`) or `tsx`

## Install

### Option A — opencode custom tool (live progress)

```bash
mkdir -p ~/.config/opencode/tools
cp tools/agy.ts ~/.config/opencode/tools/
cp -r src ~/.config/opencode/tools/../  # or keep src/ next to tools/
```

Then enable the `agy` tool for an agent (see [opencode.example.jsonc](opencode.example.jsonc)).

### Option B — MCP server (portable)

```jsonc
// opencode.jsonc
{
  "mcp": {
    "agy": {
      "type": "local",
      "command": ["bun", "run", "/path/to/opencode-agy/mcp/server.ts"],
      "enabled": true
    }
  }
}
```

For Claude Desktop / Cursor, add to their MCP config:

```json
{
  "mcpServers": {
    "agy": {
      "command": "bun",
      "args": ["run", "/path/to/opencode-agy/mcp/server.ts"]
    }
  }
}
```

> No `bun`? Use `"command": "npx", "args": ["tsx", ".../mcp/server.ts"]` or
> `"command": "node", "args": ["--experimental-strip-types", ".../mcp/server.ts"]`.

## Usage

The LLM calls the `agy` tool. Arguments:

| Arg | Type | Default | Description |
|-----|------|---------|-------------|
| `prompt` | string | — | The task to send to agy. |
| `thinking_depth` | `"low"`\|`"high"` | — | Prepended as a prompt prefix. |
| `add_dirs` | string[] | — | Folders to add to agy's workspace. |
| `auto_approve` | boolean | `true` | Auto-approve tool/file permissions (`--dangerously-skip-permissions`). |
| `sandbox` | boolean | `false` | Sandbox with terminal restrictions (`--sandbox`). |
| `model` | string | — | Model id (e.g. `gemini-3.5-flash`). |
| `agent` | string | — | agy agent profile. |
| `mode` | `"plan"`\|`"accept-edits"` | — | Execution mode. |
| `project` | string | — | agy project id/name. |
| `new_project` | boolean | — | Create a new agy project. |
| `print_timeout` | string | `"10m"` | agy print timeout. |
| `conversation_id` | string | — | Resume a prior agy conversation. |
| `write_to_file` | string | — | Also write the final response to this path. |
| `extract` | `"last_code_block"` | — | Extract the last fenced code block. |
| `tee_file` | string | `/tmp/agy-<sid>.jsonl` | Tee raw stream-json for `tail -f`. |

### Environment variables

| Var | Default | Description |
|-----|---------|-------------|
| `AGY_PATH` | `"agy"` | Path to the agy binary. |
| `AGY_AUTO_APPROVE` | `"true"` | Default for `auto_approve`. |
| `AGY_SANDBOX` | `"false"` | Default for `sandbox`. |
| `AGY_PRINT_TIMEOUT` | `"10m"` | Default for `print_timeout`. |

## Watch the process live

```bash
# raw stream-json (one JSON object per line)
tail -f /tmp/agy-stream.jsonl

# just the streaming text deltas
tail -f /tmp/agy-stream.jsonl | jq -r 'select(.event=="step_update").step_update.text_delta // empty'
```

## How it works

```
agy tool called
  └─ spawn: agy -p <prompt> --output-format stream-json [...flags]
       ├─ stdout: {"event":"init","conversation_id":"..."}
       ├─ stdout: {"event":"step_update","step_update":{"text_delta":"..."}}
       └─ stdout: {"event":"result","result":{"response":"...","status":"SUCCESS"}}
  └─ core parses each line → onProgress callback (opencode: context.metadata)
  └─ on close → resolve({ output: result.response, conversationId, teePath })
caller idle (0 tokens) while agy runs → gets full result
```

## Compatibility

- Tested against `agy` 1.1.22 (Antigravity CLI).
- opencode plugin SDK `@opencode-ai/plugin`; MCP SDK `@modelcontextprotocol/sdk` ≥1.30.

## License

MIT
