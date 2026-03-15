/**
 * Template: Main Entry Point
 * 
 * Copy this file to src/run.ts and customize the configuration.
 */

// When copied to src/, import from "./index.js"
import { runLoop, OpenCodeAgent } from "./index.js"
import { ProjectEvaluator } from "./evaluator.js"
import { ProjectContextProvider } from "./context-provider.js"
import { join } from "path"

async function main() {
  console.log("Starting Feedback Loop")
  console.log("======================\n")

  // =====================================================
  // CONFIGURE THE AGENT
  // =====================================================
  
  const agent = new OpenCodeAgent({
    // Option 1: Let the harness start its own server
    // (Comment out connectTo)
    
    // Option 2: Connect to an existing server (faster)
    // Run `opencode serve --port 4096` in another terminal first
    // connectTo: "http://localhost:4096",
    
    // Optional: Specify a model
    // model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
    
    // Optional: Use a specific agent configuration
    // agent: "my-custom-agent",
  })

  // =====================================================
  // CONFIGURE THE LOOP
  // =====================================================

  const result = await runLoop({
    agent,
    evaluator: new ProjectEvaluator(),
    
    // Optional: Use custom context provider
    // Comment out to use the default (memory summary only)
    contextProvider: new ProjectContextProvider(),
    
    loopConfig: {
      // Path to your task description
      taskPath: join(process.cwd(), "task.md"),
      
      // Maximum attempts before giving up
      maxIterations: 10,
      
      // Score threshold to consider task "done" (0.0 - 1.0)
      threshold: 0.9,
      
      // Optional: Custom run directory
      // runDir: "./my-runs",
    },
    
    // Optional: Callback after each iteration
    onIteration: (iteration, score) => {
      const pct = (score * 100).toFixed(1)
      const bar = "█".repeat(Math.floor(score * 20)) + "░".repeat(20 - Math.floor(score * 20))
      console.log(`[${iteration + 1}] ${bar} ${pct}%`)
    },
    
    // Optional: Resume a previous run
    // resumeFrom: "./runs/2026-03-15T12-00-00-000Z",
  })

  // =====================================================
  // HANDLE RESULT
  // =====================================================

  console.log("\n======================")
  if (result.success) {
    console.log(`SUCCESS after ${result.iterations} iteration(s)!`)
    console.log(`Final score: ${(result.finalScore * 100).toFixed(1)}%`)
  } else {
    console.log(`FAILED after ${result.iterations} iteration(s)`)
    console.log(`Best score: ${(result.bestScore * 100).toFixed(1)}% (iteration ${result.bestIteration + 1})`)
    console.log(`\nCheck ./runs/${result.runId}/ for logs`)
  }
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
