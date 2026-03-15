/**
 * Example: Using the feedback loop to write and improve code
 * 
 * This example demonstrates:
 * 1. A simple task (write a counter module)
 * 2. A deterministic evaluator (checks if code exists and passes tests)
 * 3. Running the loop until success or max iterations
 */

import { runLoop, OpenCodeAgent } from "../src/index.js"
import type { Evaluator, AgentResponse, ContextProvider, MemoryEntry } from "../src/index.js"
import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { exec } from "child_process"
import { promisify } from "util"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const execAsync = promisify(exec)
const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Evaluator that checks if the counter module works correctly
 */
class CounterEvaluator implements Evaluator {
  async evaluate(response: AgentResponse, iteration: number): Promise<{ score: number; [key: string]: unknown }> {
    const counterPath = join(__dirname, "counter.ts")
    
    // Check if file exists
    if (!existsSync(counterPath)) {
      return {
        score: 0,
        reason: "counter.ts file not found",
        fileExists: false,
      }
    }

    // Read the file
    const content = await readFile(counterPath, "utf-8")
    
    // Basic checks
    const checks = {
      hasCreateCounter: content.includes("createCounter"),
      hasIncrement: content.includes("increment"),
      hasDecrement: content.includes("decrement"),
      hasReset: content.includes("reset"),
      hasValue: content.includes("value"),
      hasExport: content.includes("export"),
      hasTypes: content.includes(":") && (content.includes("number") || content.includes("Counter")),
    }

    const passed = Object.values(checks).filter(Boolean).length
    const total = Object.keys(checks).length
    const score = passed / total

    // Try to run a quick syntax check with tsc
    let syntaxValid = false
    try {
      await execAsync(`npx tsc --noEmit ${counterPath}`, { cwd: process.cwd() })
      syntaxValid = true
    } catch {
      // Syntax error
    }

    const finalScore = syntaxValid ? score : score * 0.5

    return {
      score: finalScore,
      checks,
      syntaxValid,
      passed,
      total,
    }
  }
}

/**
 * Context provider that gives feedback on what's missing
 */
class CounterContextProvider implements ContextProvider {
  async getContext(task: string, memory: MemoryEntry[], iteration: number): Promise<string> {
    const counterPath = join(__dirname, "counter.ts")
    
    let currentState = "The file does not exist yet."
    
    if (existsSync(counterPath)) {
      const content = await readFile(counterPath, "utf-8")
      currentState = `Current file content:\n\`\`\`typescript\n${content}\n\`\`\``
    }

    if (memory.length === 0) {
      return `This is the first iteration.\n\n${currentState}`
    }

    const lastAttempt = memory[memory.length - 1]
    const insights = lastAttempt.insights.join("\n")

    return `This is iteration ${iteration + 1}.

Previous attempt scored: ${lastAttempt.score.toFixed(2)}
Issues found:
${insights}

${currentState}

Fix the issues and try again.`
  }
}

// Main
async function main() {
  console.log("Starting Counter Example")
  console.log("========================\n")

  // You can either:
  // 1. Let the harness start its own OpenCode server
  // 2. Connect to an existing server with: new OpenCodeAgent({ connectTo: "http://localhost:4096" })
  
  const agent = new OpenCodeAgent({
    // Optionally specify model
    // model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" }
  })

  const result = await runLoop({
    agent,
    evaluator: new CounterEvaluator(),
    contextProvider: new CounterContextProvider(),
    loopConfig: {
      taskPath: join(__dirname, "task.md"),
      maxIterations: 5,
      threshold: 0.9,
    },
    onIteration: (iteration, score) => {
      console.log(`Callback: iteration ${iteration + 1} completed with score ${score}`)
    },
  })

  console.log("\nFinal Result:", result)
}

main().catch(console.error)
