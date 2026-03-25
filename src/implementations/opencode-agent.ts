import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk"
import type { Agent, AgentResponse, DetailedEvent, FullResponseDetails, MajorEventType } from "../interfaces/index.js"

type OpencodeInstance = Awaited<ReturnType<typeof createOpencode>>
type OpencodeClient = ReturnType<typeof createOpencodeClient>

// Extract config type from createOpencode parameters
type CreateOpencodeParams = Parameters<typeof createOpencode>[0]
type OpenCodeConfig = NonNullable<CreateOpencodeParams>["config"]

/** Callback for major events during execution */
export type EventCallback = (event: {
  type: MajorEventType
  name?: string       // Tool name for tool events
  message?: string    // Description or error message
  timestamp: Date
  input?: Record<string, unknown>  // Tool input parameters
  output?: unknown    // Tool output/result
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
  /**
   * Timeout for each prompt in milliseconds.
   * If the agent doesn't respond within this time, the request is aborted.
   * Default: 120000 (2 minutes)
   */
  timeoutMs?: number
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
    
    // Verbose mode logs tool events with parameters
    if (this.options.verboseEvents) {
      const prefix = `[${event.timestamp.toISOString()}]`
      switch (event.type) {
        case "tool.start":
          const inputStr = event.input ? this.formatToolInput(event.input) : ""
          console.log(`${prefix} 🔧 ${event.name}${inputStr}`)
          break
        case "tool.complete":
          console.log(`${prefix} ✅ ${event.name}`)
          break
        case "tool.error":
          console.log(`${prefix} ❌ ${event.name}: ${event.message}`)
          break
        case "message.complete":
          console.log(`${prefix} 💬 Response complete`)
          break
      }
    }
  }

  /** Format tool input for CLI display (truncated for readability) */
  private formatToolInput(input: Record<string, unknown>): string {
    const parts: string[] = []
    for (const [key, value] of Object.entries(input)) {
      let valStr: string
      if (typeof value === "string") {
        // Truncate long strings
        valStr = value.length > 60 ? value.slice(0, 57) + "..." : value
        // Replace newlines for single-line display
        valStr = valStr.replace(/\n/g, "\\n")
      } else if (value === null || value === undefined) {
        continue
      } else {
        valStr = JSON.stringify(value)
        if (valStr.length > 60) valStr = valStr.slice(0, 57) + "..."
      }
      parts.push(`${key}=${valStr}`)
    }
    return parts.length > 0 ? ` (${parts.join(", ")})` : ""
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
    const collectedEvents: DetailedEvent[] = []
    const toolStartTimes = new Map<string, number>() // Track tool start times for duration calculation
    let messageStartTime: number | null = null
    
    logs.push(`[${new Date().toISOString()}] Sending prompt to OpenCode...`)

    // Helper to collect an event and also emit it
    const collectAndEmitEvent = (event: Parameters<EventCallback>[0], durationMs?: number) => {
      // Add to collected events for logging
      collectedEvents.push({
        type: event.type,
        timestamp: event.timestamp.toISOString(),
        name: event.name,
        message: event.message,
        durationMs,
        input: event.input,
        output: event.output,
      })
      // Also emit to callback/verbose
      this.emitEvent(event)
    }

    // Track tools we've seen start (to avoid duplicate logging)
    const toolsInProgress = new Set<string>()
    // Store tool inputs so we can reference them later
    const toolInputs = new Map<string, Record<string, unknown>>()

    // Always subscribe to events for logging (not just when callbacks are set)
    this.abortController = new AbortController()
    let eventCleanup: (() => void) | null = null
    
    // Subscribe to events in background
    const subscribeToEvents = async () => {
      try {
        const events = await this.client!.event.subscribe()
        
        for await (const event of events.stream) {
          // Check if we should stop
          if (this.abortController?.signal.aborted) break

          // Parse event and emit major ones
          // Event structure from SDK: { type: "event.type", properties: { ... } }
          const eventData = event as unknown as { 
            type?: string
            properties?: Record<string, unknown>
          }

          const eventType = eventData.type || ""
          const props = eventData.properties || {} as Record<string, unknown>

          // Tool events - triggered by message.part.updated with tool parts
          if (eventType === "message.part.updated") {
            const part = props.part as Record<string, unknown> | undefined
            const partType = part?.type as string | undefined

            if (partType === "tool") {
              // ToolPart has 'tool' field for tool name, 'input' for params, and 'state' object with 'status'
              const toolName = part?.tool as string | undefined
              const toolInput = part?.input as Record<string, unknown> | undefined
              const stateObj = part?.state as Record<string, unknown> | undefined
              const status = stateObj?.status as string | undefined
              const stateOutput = stateObj?.output as unknown
              const messageID = part?.messageID as string | undefined

              if (toolName) {
                const toolKey = `${messageID || ""}:${toolName}`
                const now = Date.now()
                
                if (status === "pending" || status === "running") {
                  if (!toolsInProgress.has(toolKey)) {
                    toolsInProgress.add(toolKey)
                    toolStartTimes.set(toolKey, now)
                    // Store input for later reference
                    if (toolInput) {
                      toolInputs.set(toolKey, toolInput)
                    }
                    collectAndEmitEvent({
                      type: "tool.start",
                      name: toolName,
                      timestamp: new Date(),
                      input: toolInput,
                    })
                  }
                } else if (status === "completed") {
                  const startTime = toolStartTimes.get(toolKey)
                  const durationMs = startTime ? now - startTime : undefined
                  toolsInProgress.delete(toolKey)
                  toolStartTimes.delete(toolKey)
                  toolInputs.delete(toolKey)
                  collectAndEmitEvent({
                    type: "tool.complete",
                    name: toolName,
                    timestamp: new Date(),
                    output: stateOutput,
                  }, durationMs)
                } else if (status === "error") {
                  const startTime = toolStartTimes.get(toolKey)
                  const durationMs = startTime ? now - startTime : undefined
                  toolsInProgress.delete(toolKey)
                  toolStartTimes.delete(toolKey)
                  toolInputs.delete(toolKey)
                  const errorMsg = stateObj?.error as string | undefined
                  collectAndEmitEvent({
                    type: "tool.error",
                    name: toolName,
                    message: errorMsg || "Unknown error",
                    timestamp: new Date(),
                  }, durationMs)
                }
              }
            }
          }

          // Message events - triggered by message.updated
          if (eventType === "message.updated") {
            const info = props.info as Record<string, unknown> | undefined
            const role = info?.role as string | undefined
            const timeObj = info?.time as Record<string, unknown> | undefined
            const completed = timeObj?.completed as number | undefined
            
            if (role === "assistant") {
              const now = Date.now()
              if (completed) {
                const durationMs = messageStartTime ? now - messageStartTime : undefined
                collectAndEmitEvent({
                  type: "message.complete",
                  timestamp: new Date(),
                }, durationMs)
              } else if (messageStartTime === null) {
                // Message started (no completed time yet) - only emit once
                messageStartTime = now
                collectAndEmitEvent({
                  type: "message.start",
                  timestamp: new Date(),
                })
              }
            }
          }

          // Session errors
          if (eventType === "session.error") {
            const error = props.error as Record<string, unknown> | undefined
            const errorData = error?.data as Record<string, unknown> | undefined
            const errorMsg = errorData?.message as string | undefined
            collectAndEmitEvent({
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

    try {
      // Set up timeout (default 2 minutes)
      const timeoutMs = this.options.timeoutMs ?? 120000
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Timeout: Agent did not respond within ${timeoutMs / 1000} seconds`))
        }, timeoutMs)
      })

      // Send the prompt with timeout
      const promptPromise = this.client.session.prompt({
        path: { id: this.sessionId },
        body: {
          parts: [{ type: "text", text: task }],
          ...(this.options.model && { model: this.options.model }),
          ...(this.options.agent && { agent: this.options.agent }),
        },
      })

      const result = await Promise.race([promptPromise, timeoutPromise])

      if (result.error) {
        logs.push(`[ERROR] ${JSON.stringify(result.error)}`)
        return {
          output: `Error: ${JSON.stringify(result.error)}`,
          logs,
          sessionId: this.sessionId,
          events: collectedEvents,
        }
      }

      // Extract text from the response parts and build fullResponse
      const parts = result.data?.parts ?? []
      const textParts: string[] = []
      const fullResponseParts: FullResponseDetails["parts"] = []
      let toolCount = 0
      
      for (const p of parts) {
        if (p.type === "text" && "text" in p) {
          const textContent = (p as { text: string }).text
          textParts.push(textContent)
          fullResponseParts.push({
            type: "text",
            content: textContent,
          })
        }
        // Log tool usage
        if (p.type === "tool" && "tool" in p) {
          const toolPart = p as unknown as { tool: string; state?: unknown }
          const stateStr = typeof toolPart.state === "string" ? toolPart.state : JSON.stringify(toolPart.state ?? "called")
          logs.push(`[TOOL] ${toolPart.tool}: ${stateStr}`)
          toolCount++
          fullResponseParts.push({
            type: "tool",
            toolName: toolPart.tool,
            toolState: toolPart.state,
          })
        }
      }
      
      const output = textParts.join("\n")
      const textLength = output.length

      logs.push(`[${new Date().toISOString()}] Response received (${output.length} chars)`)

      // Build fullResponse object
      const fullResponse: FullResponseDetails = {
        parts: fullResponseParts,
        totalParts: fullResponseParts.length,
        textLength,
        toolCount,
      }

      return {
        output,
        logs,
        sessionId: this.sessionId,
        events: collectedEvents,
        fullResponse,
      }
    } catch (err) {
      // Handle timeout and other errors
      const errorMessage = err instanceof Error ? err.message : String(err)
      logs.push(`[ERROR] ${errorMessage}`)
      
      // Add timeout event if it was a timeout
      if (errorMessage.includes("Timeout")) {
        collectedEvents.push({
          type: "session.error",
          timestamp: new Date().toISOString(),
          message: errorMessage,
        })
      }
      
      return {
        output: `Error: ${errorMessage}`,
        logs,
        sessionId: this.sessionId,
        events: collectedEvents,
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
