import type { MemoryEntry } from "./types.js"

/**
 * Context provider interface - implement this to provide task-specific context
 * 
 * This is where you customize the harness for your specific codebase/task.
 * Examples:
 * - Read relevant source files
 * - Fetch test results
 * - Include documentation
 * - Add codebase structure
 */
export interface ContextProvider {
  /**
   * Get context for the current iteration
   * @param task - The main task description
   * @param memory - Memory from previous iterations
   * @param iteration - Current iteration number (0-indexed)
   * @returns Context string to provide to the agent
   */
  getContext(task: string, memory: MemoryEntry[], iteration: number): Promise<string>
}

/**
 * Factory function type for creating context providers
 */
export type ContextProviderFactory = () => ContextProvider | Promise<ContextProvider>

/**
 * Simple default context provider that just returns memory summary
 */
export class DefaultContextProvider implements ContextProvider {
  async getContext(task: string, memory: MemoryEntry[], iteration: number): Promise<string> {
    if (memory.length === 0) {
      return `This is iteration ${iteration + 1}. No previous attempts.`
    }

    const summary = memory.map((m) => {
      const status = m.failed ? "FAILED" : `score: ${m.score.toFixed(2)}`
      return `- Iteration ${m.iteration + 1} (${status}): ${m.approach}\n  Insights: ${m.insights.join(", ")}`
    }).join("\n")

    return `This is iteration ${iteration + 1}.

Previous attempts:
${summary}

Best score so far: ${Math.max(...memory.map((m) => m.score)).toFixed(2)}

Learn from what worked and what didn't. Try a different approach if previous ones failed.`
  }
}
