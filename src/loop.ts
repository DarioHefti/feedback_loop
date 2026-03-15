import { readFile } from "fs/promises"
import type { Agent, Evaluator, ContextProvider, LoopConfig, LoopResult } from "./interfaces/index.js"
import { DefaultContextProvider } from "./interfaces/index.js"
import { Memory } from "./memory.js"

/**
 * Main feedback loop
 */
export async function runLoop(config: {
  agent: Agent
  evaluator: Evaluator
  contextProvider?: ContextProvider
  loopConfig: LoopConfig
  onIteration?: (iteration: number, score: number) => void
  resumeFrom?: string // Path to run directory to resume from
}): Promise<LoopResult> {
  const {
    agent,
    evaluator,
    contextProvider = new DefaultContextProvider(),
    loopConfig,
    onIteration,
    resumeFrom,
  } = config

  // Initialize or resume memory
  const memory = resumeFrom
    ? await Memory.resume(resumeFrom)
    : await Memory.create({
        taskPath: loopConfig.taskPath,
        maxIterations: loopConfig.maxIterations,
        threshold: loopConfig.threshold,
        runDir: loopConfig.runDir,
      })

  // Read the task
  const task = await readFile(loopConfig.taskPath, "utf-8")

  // Initialize agent if needed
  if (agent.init) {
    await agent.init()
  }

  console.log(`\n=== Starting feedback loop ===`)
  console.log(`Run ID: ${memory.runId}`)
  console.log(`Task: ${loopConfig.taskPath}`)
  console.log(`Max iterations: ${loopConfig.maxIterations}`)
  console.log(`Threshold: ${loopConfig.threshold}`)
  console.log(`Starting from iteration: ${memory.currentIteration + 1}`)
  console.log(`==============================\n`)

  let finalScore = 0

  try {
    for (let i = memory.currentIteration; i < loopConfig.maxIterations; i++) {
      console.log(`\n--- Iteration ${i + 1}/${loopConfig.maxIterations} ---`)

      // Get context for this iteration
      const context = await contextProvider.getContext(task, memory.entries, i)

      // Build the full prompt
      const fullPrompt = `${task}\n\n---\n\n${context}`

      // Run the agent
      console.log("Running agent...")
      const response = await agent.run(fullPrompt, context)

      // Log the iteration output
      await memory.logIteration(i, [
        `=== Iteration ${i + 1} ===`,
        `Timestamp: ${new Date().toISOString()}`,
        "",
        "=== Agent Output ===",
        response.output,
        "",
        "=== Agent Logs ===",
        ...response.logs,
      ])

      // Evaluate the result
      console.log("Evaluating...")
      const evaluation = await evaluator.evaluate(response, i)
      finalScore = evaluation.score

      console.log(`Score: ${evaluation.score.toFixed(3)}`)

      // Extract approach description from response (first line or truncated)
      const approach = response.output.split("\n")[0]?.slice(0, 100) ?? "Unknown approach"

      // Record the iteration
      await memory.record({
        iteration: i,
        approach,
        score: evaluation.score,
        insights: Object.entries(evaluation)
          .filter(([k]) => k !== "score")
          .map(([k, v]) => `${k}: ${v}`),
        failed: evaluation.score === 0,
      })

      // Callback
      onIteration?.(i, evaluation.score)

      // Check if we've reached the threshold
      if (evaluation.score >= loopConfig.threshold) {
        console.log(`\nThreshold ${loopConfig.threshold} reached! Stopping.`)
        await memory.complete()
        break
      }

      console.log(`Below threshold (${loopConfig.threshold}), continuing...`)
    }
  } finally {
    // Cleanup agent
    if (agent.cleanup) {
      await agent.cleanup()
    }
    await memory.complete()
  }

  const result: LoopResult = {
    success: finalScore >= loopConfig.threshold,
    iterations: memory.currentIteration,
    finalScore,
    bestScore: memory.bestScore,
    bestIteration: memory.bestIteration,
    runId: memory.runId,
  }

  console.log(`\n=== Loop Complete ===`)
  console.log(`Success: ${result.success}`)
  console.log(`Iterations: ${result.iterations}`)
  console.log(`Final score: ${result.finalScore.toFixed(3)}`)
  console.log(`Best score: ${result.bestScore.toFixed(3)} (iteration ${result.bestIteration + 1})`)
  console.log(`====================\n`)

  return result
}
