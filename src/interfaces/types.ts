/**
 * Core types for the feedback loop harness
 */

/** Event types logged during agent execution */
export type MajorEventType = 
  | "tool.start"       // Tool execution started
  | "tool.complete"    // Tool execution completed
  | "tool.error"       // Tool execution failed
  | "message.start"    // Assistant message started
  | "message.complete" // Assistant message completed
  | "session.error"    // Session error

/** Detailed event for logging */
export interface DetailedEvent {
  type: MajorEventType
  timestamp: string           // ISO timestamp
  name?: string               // Tool name for tool events
  message?: string            // Description or error message
  durationMs?: number         // Duration for completed events (from start)
  input?: Record<string, unknown>  // Tool input parameters (for tool.start events)
  output?: unknown            // Tool output/result (for tool.complete events)
}

/** Full response details for logging */
export interface FullResponseDetails {
  parts: Array<{
    type: "text" | "tool"
    content?: string          // Text content for text parts
    toolName?: string         // Tool name for tool parts
    toolState?: unknown       // Tool state/result for tool parts
  }>
  totalParts: number
  textLength: number
  toolCount: number
}

/** Evaluation result - score is required, everything else is flexible */
export interface EvaluationResult {
  score: number // Required: 0.0 - 1.0
  [key: string]: unknown // Any additional metrics
}

/** Memory entry for tracking what worked and what didn't */
export interface MemoryEntry {
  iteration: number
  timestamp: string
  approach: string
  score: number
  insights: string[]
  failed: boolean
}

/** Run state for persistence and resume */
export interface RunState {
  runId: string
  taskPath: string
  startedAt: string
  currentIteration: number
  maxIterations: number
  threshold: number
  bestScore: number
  bestIteration: number
  completed: boolean
  memory: MemoryEntry[]
}

/** Agent response after executing a task */
export interface AgentResponse {
  output: string
  logs: string[]
  sessionId?: string
  /**
   * Critical feedback from the agent.
   * If present, the loop stops immediately and shows this to the user.
   * Use this when critical information or tools are missing to complete the task.
   */
  criticalFeedback?: string
  /**
   * Detailed events that occurred during execution.
   * Includes tool starts/completions, message events, errors, with timestamps.
   */
  events?: DetailedEvent[]
  /**
   * Full response details including all parts (text and tool calls).
   * Useful for detailed logging and debugging.
   */
  fullResponse?: FullResponseDetails
}

/** Loop configuration */
export interface LoopConfig {
  maxIterations: number
  threshold: number
  taskPath: string
  runDir?: string
  /**
   * Run self-reflection every N iterations (default: disabled).
   * Reflection analyzes progress and can stop the loop early if the task is unsolvable.
   */
  selfReflectionInterval?: number
}

/** Loop result */
export interface LoopResult {
  success: boolean
  iterations: number
  finalScore: number
  bestScore: number
  bestIteration: number
  runId: string
}

/** Result of a mid-loop self-reflection */
export interface SelfReflectionResult {
  /** Analysis and recommendations from reflection */
  analysis: string
  /** 
   * If set, the agent has determined the task cannot be completed.
   * This stops the loop immediately.
   */
  criticalFeedback: string | null
  /** Iteration at which reflection was performed */
  atIteration: number
}
