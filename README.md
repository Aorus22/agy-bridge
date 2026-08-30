# opencode-agy

A custom [opencode](https://opencode.ai) tool that delegates tasks to [Antigravity](https://github.com/google-gemini/antigravity) (`agy` / Gemini) as a **blocking one-shot** — no polling.

## Why

The existing `mcp-server-google-antigravity` MCP server delegates to `agy` via an async job model: call `use_antigravity` → get a `jobId` immediately → poll `antigravity_result` until done. This polling burns orchestrator tokens on every poll round.

This tool replaces that with a **single blocking call**:

- Spawns `agy --print <prompt> --output-format stream-json`
- Parses the JSON stream line-by-line, pushing live progress to opencode's `context.metadata()` (the TUI title updates while agy runs)
- Returns the **full response** in the tool result when agy finishes

Net effect: the orchestrator calls the tool **once**, the model goes **idle (0 tokens)** while agy works, then gets the complete result. Same as delegating to a subagent.

## Features

- **No polling** — one tool call, full result returned
- **Live progress** — the tool-call title updates with elapsed time + the latest text delta from agy
- **Tee to file** — pass `tee_file` to write the raw `stream-json` line-by-line so you can `tail -f` it in another terminal to watch the full process
- **Cancellation** — opencode's abort signal kills the agy process (SIGTERM)
- **Conversation continuity** — pass `conversation_id` to resume a prior agy conversation
- **All agy flags** — `add_dirs`, `auto_approve`, `sandbox`, `model`, `agent`, `mode`, `project`, `new_project`, `print_timeout`
- **Parallel-safe** — opencode runs multiple tool calls concurrently; call `agy` several times in one response for independent tasks (each gets its own agy conversation)

## Requirements

- [opencode](https://opencode.ai) installed
- The [agy CLI](https://github.com/google-gemini/antigravity) (`agy`) on your `PATH` (or set `AGY_PATH`)
- `agy` authenticated (`agy` login)

## Install

### Option A — global tools dir

Copy the tool to opencode's global tools directory:

```bash
mkdir -p ~/.config/opencode/tools
cp tools/agy.ts ~/.config/opencode/tools/
```

### Option B — project-level

Copy to your project's `.opencode/tools/`:

```bash
mkdir -p .opencode/tools
cp tools/agy.ts .opencode/tools/
```

## Configure an agent

Enable the `agy` tool for an agent and instruct it to use the tool. Example `opencode.jsonc`:

```jsonc
{
  "agent": {
    "Orchestrator-Agy": {
      "model": "opencode-go/deepseek-v4-flash",
      "tools": {
        "agy": true
      },
      "prompt": "You are Orchestrator-Agy. Delegate work ONLY to Antigravity (agy) via the `agy` tool. It's blocking one-shot: call ONCE, full result arrives in output, no polling. PARALLEL: for several MUTUALLY INDEPENDENT tasks, call `agy` MULTIPLE TIMES in ONE response — opencode runs them concurrently, so total time = the longest, not the sum. Safe parallel rules: each agy = separate conversation, DO NOT reuse the same conversation_id across parallel calls; never direct two parallel calls to write/edit the same file (race). Collect all results, synthesize, report concisely. NEVER call any other subagent or coding tool."
    }
  }
}
```

If you're replacing the `mcp-server-google-antigravity` MCP server, disable it:

```jsonc
{
  "mcp": {
    "antigravity": {
      "type": "local",
      "command": ["mcp-server-google-antigravity"],
      "enabled": false
    }
  }
}
```

## Usage

The LLM calls the tool. Arguments:

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

Open another terminal and tail the tee file:

```bash
# raw stream-json (one JSON object per line)
tail -f /tmp/agy-stream.jsonl

# just the streaming text deltas
tail -f /tmp/agy-stream.jsonl | jq -r 'select(.event=="step_update").step_update.text_delta // empty'
```

## How it works

```
LLM calls agy(prompt)
  └─ spawn: agy -p <prompt> --output-format stream-json [...flags]
       ├─ stdout: {"event":"init","conversation_id":"..."}
       ├─ stdout: {"event":"step_update","step_update":{"text_delta":"..."}}
       └─ stdout: {"event":"result","result":{"response":"...","status":"SUCCESS"}}
  └─ parse each line → context.metadata({ title: "agy · 12s · ..." })
  └─ on close → resolve({ output: result.response, metadata: { conversation_id } })
LLM idle (0 tokens) while agy runs → gets full result
```

## Compatibility

- Tested against `agy` 1.1.22 (Antigravity CLI).
- opencode plugin SDK `@opencode-ai/plugin` (Zod-based `tool()` helper).

## License

MIT
