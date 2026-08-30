export interface AgyUsage {
  input_tokens?: number
  output_tokens?: number
  thinking_tokens?: number
  cache_read_tokens?: number
  total_tokens?: number
}

export interface AgyEvent {
  event?: string
  conversation_id?: string
  text?: string
  pid?: number
  init?: { cwd?: string; tools?: string[]; permission_mode?: string }
  step_update?: {
    conversation_id?: string
    step_index?: number
    state?: string
    step_type?: string
    text_delta?: string
    tool_name?: string
    tool_info?: {
      name?: string
      parameters?: Record<string, unknown>
      output?: string
      error?: { type?: string; message?: string }
    }
    duration_seconds?: number
    usage?: AgyUsage
  }
  result?: {
    conversation_id?: string
    status?: string
    response?: string
    error?: string
    duration_seconds?: number
    num_turns?: number
    usage?: AgyUsage
  }
}

export interface DiffLine {
  type: "add" | "del" | "ctx"
  text: string
}

export interface Step {
  idx: number
  type: string
  state: string
  text: string
  tool: string
  params: Record<string, unknown> | null
  output: string | null
  error: string | null
  duration: number | null
  thinking: number
  diff?: DiffLine[] | null
  usage: AgyUsage | null
}

export interface Run {
  file: string
  convId: string | null
  cwd: string | null
  toolCount: number
  perm: string | null
  status: "running" | "done" | "error"
  start: number
  steps: Map<number, Step>
  result: AgyEvent["result"] | null
  promptText: string | null
  pid: number | null
}
