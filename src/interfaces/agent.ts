import type { AgentResponse, MemoryEntry } from "./types.js"

/**
 * Agent interface - implement this to use different LLM backends
 */
export interface Agent {
  /**
   * Run the agent with the given task and context
   * @param task - The main task description
   * @param context - Additional context (from get_context + memory)
   * @returns Agent response with output and logs
   */
  run(task: string, context: string): Promise<AgentResponse>

  /**
   * Optional: Initialize the agent (e.g., start server, create session)
   */
  init?(): Promise<void>

  /**
   * Optional: Cleanup (e.g., stop server, close session)
   */
  cleanup?(): Promise<void>
}

/**
 * Factory function type for creating agents
 */
export type AgentFactory = () => Agent | Promise<Agent>
