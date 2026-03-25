import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk"
import type { Agent, AgentResponse } from "../interfaces/index.js"

type OpencodeInstance = Awaited<ReturnType<typeof createOpencode>>
type OpencodeClient = ReturnType<typeof createOpencodeClient>

// Extract config type from createOpencode parameters
type CreateOpencodeParams = Parameters<typeof createOpencode>[0]
type OpenCodeConfig = NonNullable<CreateOpencodeParams>["config"]

/** Event types to log during agent execution */
export type MajorEventType = 
  | "tool.start"      // Tool execution started
  | "tool.complete"   // Tool execution completed
  | "tool.error"      // Tool execution failed
  | "message.start"   // Assistant message started
  | "message.complete"// Assistant message completed
  | "session.error"   // Session error

/** Callback for major events during execution */
export type EventCallback = (event: {
  type: MajorEventType
  name?: string       // Tool name for tool events
  message?: string    // Description or error message
  timestamp: Date
}) => void

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
  /** 
   * Callback for major events during execution.
   * Use this to log tool calls, completions, and errors to your main loop.
   */
  onEvent?: EventCallback
  /**
   * Enable verbose event logging to console.
   * If true, logs all major events. If onEvent is also set, both are called.
   */
  verboseEvents?: boolean
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
  private abortController: AbortController | null = null

  constructor(options?: OpenCodeAgentOptions) {
    this.options = options ?? {}
  }

  /** Emit an event to the callback and/or console */
  private emitEvent(event: Parameters<EventCallback>[0]): void {
    // Always call custom callback with all events
    if (this.options.onEvent) {
      this.options.onEvent(event)
    }
    
    // Verbose mode only logs MAJOR events: tool.complete, message.complete
    if (this.options.verboseEvents) {
      const prefix = `[${event.timestamp.toISOString()}]`
      switch (event.type) {
        case "tool.complete":
          console.log(`${prefix} ✅ ${event.name}`)
          break
        case "message.complete":
          console.log(`${prefix} 💬 Response complete`)
          break
      }
    }
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

    // Track tools we've seen start (to avoid duplicate logging)
    const toolsInProgress = new Set<string>()

    // Start event subscription if we have callbacks
    const shouldSubscribe = this.options.onEvent || this.options.verboseEvents
    let eventCleanup: (() => void) | null = null

    if (shouldSubscribe) {
      this.abortController = new AbortController()
      
      // Subscribe to events in background
      const subscribeToEvents = async () => {
        try {
          const events = await this.client!.event.subscribe()
          
          for await (const event of events.stream) {
            // Check if we should stop
            if (this.abortController?.signal.aborted) break

            // Parse event and emit major ones
            const eventData = event as unknown as { 
              type?: string
              properties?: Record<string, unknown>
            }

            // Handle different event types from OpenCode
            // Event structure: { type: "event.type", properties: { ... } }
            const eventType = eventData.type || ""
            const props = eventData.properties || {} as Record<string, unknown>

            // Tool events
            if (eventType === "part.updated" || eventType === "part.created") {
              const part = props.part as Record<string, unknown> | undefined
              const partType = part?.type as string | undefined
              const toolName = part?.toolName as string | undefined
              const state = part?.state as string | undefined

              if (partType === "tool" && toolName) {
                const messageID = props.messageID as string | undefined
                const toolKey = `${messageID || ""}:${toolName}`
                
                if (state === "pending" || state === "running") {
                  if (!toolsInProgress.has(toolKey)) {
                    toolsInProgress.add(toolKey)
                    this.emitEvent({
                      type: "tool.start",
                      name: toolName,
                      timestamp: new Date(),
                    })
                  }
                } else if (state === "completed") {
                  toolsInProgress.delete(toolKey)
                  this.emitEvent({
                    type: "tool.complete",
                    name: toolName,
                    timestamp: new Date(),
                  })
                } else if (state === "error") {
                  toolsInProgress.delete(toolKey)
                  const errorMsg = part?.error as string | undefined
                  this.emitEvent({
                    type: "tool.error",
                    name: toolName,
                    message: errorMsg || "Unknown error",
                    timestamp: new Date(),
                  })
                }
              }
            }

            // Message events
            if (eventType === "message.created") {
              const message = props.message as Record<string, unknown> | undefined
              const role = message?.role as string | undefined
              if (role === "assistant") {
                this.emitEvent({
                  type: "message.start",
                  timestamp: new Date(),
                })
              }
            }

            if (eventType === "message.updated") {
              const message = props.message as Record<string, unknown> | undefined
              const role = message?.role as string | undefined
              const complete = message?.complete as boolean | undefined
              if (role === "assistant" && complete) {
                this.emitEvent({
                  type: "message.complete",
                  timestamp: new Date(),
                })
              }
            }

            // Session errors
            if (eventType === "session.error") {
              const errorMsg = props.error as string | undefined
              this.emitEvent({
                type: "session.error",
                message: errorMsg || "Unknown session error",
                timestamp: new Date(),
              })
            }
          }
        } catch (err) {
          // Ignore errors from abort
          if (this.abortController?.signal.aborted) return
          console.error("Event subscription error:", err)
        }
      }

      // Start subscription (don't await - runs in background)
      const subscriptionPromise = subscribeToEvents()
      eventCleanup = () => {
        this.abortController?.abort()
        this.abortController = null
      }
    }

    try {
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
    } finally {
      // Cleanup event subscription
      if (eventCleanup) {
        eventCleanup()
      }
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
