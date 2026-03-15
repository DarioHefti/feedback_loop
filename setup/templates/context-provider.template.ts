/**
 * Template: Project Context Provider
 * 
 * Copy this file to src/context-provider.ts and implement the getContext method.
 * This is OPTIONAL - there's a default provider that summarizes memory.
 */

// When copied to src/, import from "./index.js"
import type { ContextProvider, MemoryEntry } from "./index.js"
import { existsSync } from "fs"
import { readFile } from "fs/promises"

export class ProjectContextProvider implements ContextProvider {
  /**
   * Provide context for the current iteration.
   * 
   * This helps the agent understand:
   * - Current state of the project
   * - What was tried before
   * - Relevant files or documentation
   */
  async getContext(task: string, memory: MemoryEntry[], iteration: number): Promise<string> {
    const sections: string[] = []

    // =====================================================
    // IMPLEMENT YOUR CONTEXT LOGIC BELOW
    // =====================================================

    // Section 1: Iteration info
    sections.push(`## Iteration ${iteration + 1}`)

    // Section 2: Previous attempts (recommended)
    if (memory.length > 0) {
      sections.push(`\n## Previous Attempts`)
      sections.push(`You have made ${memory.length} previous attempt(s).`)
      
      for (const entry of memory) {
        const status = entry.failed ? "FAILED" : `scored ${(entry.score * 100).toFixed(0)}%`
        sections.push(`\n### Attempt ${entry.iteration + 1} (${status})`)
        sections.push(`Approach: ${entry.approach}`)
        
        if (entry.insights.length > 0) {
          sections.push(`Feedback:`)
          for (const insight of entry.insights) {
            sections.push(`- ${insight}`)
          }
        }
      }

      // What to do differently
      const bestScore = Math.max(...memory.map(m => m.score))
      const lastScore = memory[memory.length - 1].score
      
      if (lastScore < bestScore) {
        sections.push(`\nNote: Your last attempt scored lower than your best (${(lastScore * 100).toFixed(0)}% vs ${(bestScore * 100).toFixed(0)}%). Consider what worked better before.`)
      }
    }

    // Section 3: Current state of files (customize this)
    // ---------------------------------------------------
    // const filesToShow = ["src/index.ts", "src/solution.ts"]
    // for (const file of filesToShow) {
    //   if (existsSync(file)) {
    //     const content = await readFile(file, "utf-8")
    //     sections.push(`\n## Current ${file}`)
    //     sections.push("```typescript")
    //     sections.push(content)
    //     sections.push("```")
    //   }
    // }

    // Section 4: Documentation or examples
    // -------------------------------------
    // sections.push(`\n## Reference`)
    // sections.push(`Here's an example of the expected format:`)
    // sections.push("```typescript")
    // sections.push(`export function example(): string { return "hello" }`)
    // sections.push("```")

    // Section 5: Hints based on iteration
    // ------------------------------------
    // if (iteration > 3) {
    //   sections.push(`\n## Hint`)
    //   sections.push(`You've tried ${iteration} times. Consider a completely different approach.`)
    // }

    // =====================================================
    // END OF CONTEXT LOGIC
    // =====================================================

    return sections.join("\n")
  }
}
