import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk"
import type { Agent, AgentResponse } from "../interfaces/index.js"

type OpencodeInstance = Awaited<ReturnType<typeof createOpencode>>
type OpencodeClient = ReturnType<typeof createOpencodeClient>

// Extract config type from createOpencode parameters
type CreateOpencodeParams = Parameters<typeof createOpencode>[0]
type OpenCodeConfig = NonNullable<CreateOpencodeParams>["config"]

export interface OpenCodeAgentOptions {
  /** Model to use for prompts */
  model?: { providerID: string; modelID: string }
  /** Agent configuration to use */
  agent?: string
  /** Connect to existing server instead of starting one */
  connectTo?: string
  /** 
   * Working directory for the OpenCode server.
   * Config is loaded from this directory (opencode.json).
   * Defaults to process.cwd()
   */
  cwd?: string
  /**
   * Inline config to pass to createOpencode().
   * Merged with config files (inline takes precedence).
   * See https://opencode.ai/docs/config/
   */
  config?: OpenCodeConfig
  /** Server port (0 = random available port) */
  port?: number
  /** Server hostname */
  hostname?: string
}

/**
 * OpenCode agent implementation using the official SDK
 * 
 * Configuration is loaded in this order (later overrides earlier):
 * 1. Global config (~/.config/opencode/opencode.json)
 * 2. Project config (opencode.json in cwd)
 * 3. Inline config passed to constructor
 * 
 * @see https://opencode.ai/docs/config/
 */
export class OpenCodeAgent implements Agent {
  private opencode: OpencodeInstance | null = null
  private client: OpencodeClient | null = null
  private sessionId: string | null = null
  private options: OpenCodeAgentOptions

  constructor(options?: OpenCodeAgentOptions) {
    this.options = options ?? {}
  }

  async init(): Promise<void> {
    if (this.options.connectTo) {
      // Connect to existing server
      this.client = createOpencodeClient({ baseUrl: this.options.connectTo })
      console.log(`Connected to OpenCode server at ${this.options.connectTo}`)
    } else {
      // Change to target directory if specified
      const originalCwd = process.cwd()
      if (this.options.cwd) {
        process.chdir(this.options.cwd)
        console.log(`Working directory: ${this.options.cwd}`)
      }

      try {
        // Start our own server
        // The SDK automatically loads config from:
        // - ~/.config/opencode/opencode.json (global)
        // - ./opencode.json (project, relative to cwd)
        // - Inline config passed here (highest priority)
        this.opencode = await createOpencode({
          hostname: this.options.hostname ?? "127.0.0.1",
          port: this.options.port ?? 0, // Random available port
          config: this.options.config,
        })
        this.client = this.opencode.client
        console.log(`OpenCode server started at ${this.opencode.server.url}`)
      } finally {
        // Restore original cwd
        if (this.options.cwd) {
          process.chdir(originalCwd)
        }
      }
    }

    // Create a session for this run
    const session = await this.client.session.create({
      body: { title: `Feedback Loop - ${new Date().toISOString()}` },
    })

    if (session.error) {
      throw new Error(`Failed to create session: ${JSON.stringify(session.error)}`)
    }

    this.sessionId = session.data!.id
    console.log(`Created session: ${this.sessionId}`)
  }

  async run(task: string, context: string): Promise<AgentResponse> {
    if (!this.client || !this.sessionId) {
      throw new Error("Agent not initialized. Call init() first.")
    }

    const logs: string[] = []
    logs.push(`[${new Date().toISOString()}] Sending prompt to OpenCode...`)

    // Send the prompt
    const result = await this.client.session.prompt({
      path: { id: this.sessionId },
      body: {
        parts: [{ type: "text", text: task }],
        ...(this.options.model && { model: this.options.model }),
        ...(this.options.agent && { agent: this.options.agent }),
      },
    })

    if (result.error) {
      logs.push(`[ERROR] ${JSON.stringify(result.error)}`)
      return {
        output: `Error: ${JSON.stringify(result.error)}`,
        logs,
        sessionId: this.sessionId,
      }
    }

    // Extract text from the response parts
    const parts = result.data?.parts ?? []
    const textParts: string[] = []
    
    for (const p of parts) {
      if (p.type === "text" && "text" in p) {
        textParts.push((p as { text: string }).text)
      }
      // Log tool usage
      if (p.type === "tool" && "toolName" in p) {
        const toolPart = p as unknown as { toolName: string; state?: unknown }
        const stateStr = typeof toolPart.state === "string" ? toolPart.state : JSON.stringify(toolPart.state ?? "called")
        logs.push(`[TOOL] ${toolPart.toolName}: ${stateStr}`)
      }
    }
    
    const output = textParts.join("\n")

    logs.push(`[${new Date().toISOString()}] Response received (${output.length} chars)`)

    return {
      output,
      logs,
      sessionId: this.sessionId,
    }
  }

  async cleanup(): Promise<void> {
    if (this.opencode) {
      this.opencode.server.close()
      console.log("OpenCode server stopped")
    }
    this.client = null
    this.sessionId = null
  }
}
