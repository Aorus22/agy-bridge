#!/usr/bin/env node
/**
 * MCP server (stdio) exposing `agy` as a blocking one-shot tool.
 *
 * Portable to any MCP client (Claude Desktop, Cursor, opencode, etc.).
 * Unlike the opencode custom tool (tools/agy.ts) there is no live TUI
 * progress — MCP returns a single CallToolResult at the end. Use `tee_file`
 * to watch the process via `tail -f` in another terminal.
 *
 * Run with a TS runner, e.g.:
 *   bun run mcp/server.ts
 *   npx tsx mcp/server.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { runAgy } from "../src/core.js"

const server = new McpServer(
  { name: "agy", version: "1.0.0" },
  { capabilities: { logging: {} } },
)

server.tool(
  "agy",
  "Delegate a task to Antigravity (Gemini / agy). Blocking one-shot: runs `agy --print --output-format stream-json` and returns the full response when done — no polling, no job id. Mirrors agy CLI flags: add_dirs, auto_approve, sandbox, model, agent, mode, project, conversation_id, etc. Good for web search, large-codebase analysis, file/folder creation, viewing images/PDFs. Tip: pass tee_file and `tail -f` it in another terminal to watch the process live (MCP has no live progress channel).",
  {
    prompt: z.string().describe("The question or task to send to Antigravity (agy)."),
    thinking_depth: z
      .enum(["low", "high"])
      .optional()
      .describe("low = quick, high = deep reasoning (prepended to the prompt as a prefix)."),
    add_dirs: z
      .array(z.string())
      .optional()
      .describe("Absolute folder paths to add to agy's workspace so it can read/write them."),
    auto_approve: z
      .boolean()
      .optional()
      .describe("Auto-approve all tool/file permissions (default true). Set false for cautious/read-only runs."),
    new_project: z
      .boolean()
      .optional()
      .describe("Create a new Antigravity project for this session."),
    model: z
      .string()
      .optional()
      .describe("Model id (e.g. gemini-3.5-flash)."),
    mode: z
      .enum(["plan", "accept-edits"])
      .optional()
      .describe("agy execution mode: plan (read-only planning) or accept-edits (auto-apply edits)."),
    agent: z
      .string()
      .optional()
      .describe("agy agent profile to use for this session."),
    project: z
      .string()
      .optional()
      .describe("agy project ID or name to run this session under."),
    sandbox: z
      .boolean()
      .optional()
      .describe("Run agy in a sandbox with terminal restrictions enabled. Safer than auto_approve for untrusted prompts."),
    print_timeout: z
      .string()
      .optional()
      .describe("agy print timeout, e.g. 10m (default 10m)."),
    conversation_id: z
      .string()
      .optional()
      .describe("Resume a previous agy conversation by ID (maps to --conversation)."),
    write_to_file: z
      .string()
      .optional()
      .describe("Absolute output file path; the final response is also written here."),
    extract: z
      .enum(["last_code_block"])
      .optional()
      .describe("Extract the last fenced code block from the response before returning it."),
    tee_file: z
      .string()
      .optional()
      .describe("Absolute path to tee agy's raw stream-json output line-by-line so you can `tail -f` it in another terminal to watch the process live. Defaults to /tmp/agy-<timestamp>.jsonl."),
  },
  async (args) => {
    try {
      const result = await runAgy(args, {
        sessionId: `mcp-${Date.now().toString(36)}`,
        onProgress: (p) => {
          // best-effort progress notifications for clients that render them
          try {
            server.server.sendRequest({
              method: "notifications/progress",
              params: {
                progress: p.elapsedSeconds,
                total: undefined,
                progressToken: undefined,
                message: `agy · ${p.elapsedSeconds}s${p.tail ? " · " + p.tail : ""}`,
              },
            })
          } catch {
            /* some clients reject unsolicited progress; ignore */
          }
        },
      })
      const meta = {
        conversation_id: result.conversationId,
        tee_file: result.teePath,
        usage: result.usage,
      }
      return {
        content: [
          {
            type: "text" as const,
            text: result.output + "\n\n---\n_meta: " + JSON.stringify(meta),
          },
        ],
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        isError: true,
        content: [{ type: "text" as const, text: `agy error: ${message}` }],
      }
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
