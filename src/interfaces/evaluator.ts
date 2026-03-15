import type { EvaluationResult, AgentResponse } from "./types.js"

/**
 * Evaluator interface - implement this to define how success is measured
 * 
 * This MUST be deterministic for the feedback loop to work properly.
 * Examples:
 * - Run tests and return pass rate
 * - Check if output matches expected format
 * - Measure code coverage
 * - Validate against a schema
 */
export interface Evaluator {
  /**
   * Evaluate the agent's response
   * @param response - The agent's output from this iteration
   * @param iteration - Current iteration number (0-indexed)
   * @returns Evaluation result with score (0-1) and optional metadata
   */
  evaluate(response: AgentResponse, iteration: number): Promise<EvaluationResult>
}

/**
 * Factory function type for creating evaluators
 */
export type EvaluatorFactory = () => Evaluator | Promise<Evaluator>
