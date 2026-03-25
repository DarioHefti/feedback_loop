import { SYSTEM_INSTRUCTIONS } from "../prompts.js"

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
   * @param iteration - Current iteration number (0-indexed)
   * @param notesDir - Path to the notes directory where the agent can write markdown files
   * @returns Context string to provide to the agent
   */
  getContext(task: string, iteration: number, notesDir?: string): Promise<string>
}

/**
 * Factory function type for creating context providers
 */
export type ContextProviderFactory = () => ContextProvider | Promise<ContextProvider>

/**
 * Context provider options
 */
export interface ContextProviderOptions {
  notesDir?: string
}

/**
 * Simple default context provider that includes system instructions and notes directory
 */
export class DefaultContextProvider implements ContextProvider {
  async getContext(task: string, iteration: number, notesDir?: string): Promise<string> {
    const sections: string[] = []
    
    // Always include system instructions so agent knows about critical feedback and notes
    let systemInstructions = SYSTEM_INSTRUCTIONS
    if (notesDir) {
      systemInstructions = systemInstructions.replace(/<NOTES_DIR>/g, notesDir)
    }
    sections.push(systemInstructions)
    
    sections.push(`## Current Status\n`)
    sections.push(`This is iteration ${iteration + 1}.`)
    sections.push(`\nWrite notes to the notes folder about your thinking, solutions, and errors.`)
    sections.push(`\n**Notes directory:** ${notesDir ?? "<notes>"}`)
    
    return sections.join("\n")
  }
}
