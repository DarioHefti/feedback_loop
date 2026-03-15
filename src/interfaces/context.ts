import type { MemoryEntry } from "./types.js"
import { SYSTEM_INSTRUCTIONS, formatMemoryEntry } from "../prompts.js"

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
 * Simple default context provider that includes system instructions and memory summary
 */
export class DefaultContextProvider implements ContextProvider {
  async getContext(task: string, memory: MemoryEntry[], iteration: number): Promise<string> {
    const sections: string[] = []
    
    // Always include system instructions so agent knows about critical feedback
    sections.push(SYSTEM_INSTRUCTIONS)
    
    sections.push(`## Current Status\n`)
    sections.push(`This is iteration ${iteration + 1}.`)
    
    if (memory.length === 0) {
      sections.push(`No previous attempts yet.`)
    } else {
      sections.push(`\n## Previous Attempts\n`)
      
      // Use formatMemoryEntry for detailed feedback
      for (const entry of memory) {
        sections.push(formatMemoryEntry(entry))
      }
      
      const bestScore = Math.max(...memory.map((m) => m.score))
      const lastScore = memory[memory.length - 1].score
      
      sections.push(`\n**Best score so far:** ${(bestScore * 100).toFixed(0)}%`)
      
      if (memory.length > 1 && lastScore < bestScore) {
        sections.push(`\n**Note:** Your last attempt scored lower than your best (${(lastScore * 100).toFixed(0)}% vs ${(bestScore * 100).toFixed(0)}%). Consider what worked better before.`)
      }
      
      sections.push(`\nLearn from the evaluation feedback above. If previous approaches aren't working, try something fundamentally different.`)
    }
    
    return sections.join("\n")
  }
}
