/**
 * Core types for the feedback loop harness
 */

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
