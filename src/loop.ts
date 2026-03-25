import { readFile, writeFile, readdir } from "fs/promises"
import { join, dirname } from "path"
import type { Agent, Evaluator, ContextProvider, LoopConfig, LoopResult, SelfReflectionResult } from "./interfaces/index.js"
import { DefaultContextProvider } from "./interfaces/index.js"
import { Memory } from "./memory.js"
import { buildReflectionPrompt, buildMidLoopReflectionPrompt, buildIterationSummary } from "./prompts.js"

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
  if (loopConfig.selfReflectionInterval) {
    console.log(`Self-reflection: every ${loopConfig.selfReflectionInterval} iterations`)
  }
  console.log(`Starting from iteration: ${memory.currentIteration + 1}`)
  console.log(`==============================\n`)

  let finalScore = 0
  let lastReflection: SelfReflectionResult | undefined = undefined

  try {
    for (let i = memory.currentIteration; i < loopConfig.maxIterations; i++) {
      console.log(`\n--- Iteration ${i + 1}/${loopConfig.maxIterations} ---`)

      // Get context for this iteration
      let context = await contextProvider.getContext(task, i, memory.notesDirectory)

      // Include last reflection analysis if available
      if (lastReflection) {
        context = `## Self-Reflection Guidance (from iteration ${lastReflection.atIteration + 1})

${lastReflection.analysis}

---

${context}`
      }

      // Build the full prompt
      const fullPrompt = `${task}\n\n---\n\n${context}`

      // Run the agent
      console.log("Running agent...")
      const response = await agent.run(fullPrompt, context)

      // Print agent output and logs
      console.log("\n--- Agent Output ---")
      console.log(response.output)
      if (response.logs.length > 0) {
        console.log("\n--- Agent Logs ---")
        response.logs.forEach(log => console.log(log))
      }

      // Check for critical feedback - from response field OR parsed from output
      // The agent can signal critical feedback by including "CRITICAL_FEEDBACK:" in its output
      const criticalFeedbackMatch = response.output.match(/CRITICAL_FEEDBACK:\s*(.+?)(?:\n\n|\n(?=[A-Z#])|$)/s)
      const criticalFeedback = response.criticalFeedback || (criticalFeedbackMatch ? criticalFeedbackMatch[1].trim() : null)
      
      if (criticalFeedback) {
        console.log("\n!!! CRITICAL FEEDBACK RECEIVED !!!")
        console.log(criticalFeedback)
        console.log("=================================\n")
        
        // Log the critical feedback
        await memory.logIteration(i, {
          score: 0,
          output: response.output,
          logs: response.logs,
          debug: `CRITICAL FEEDBACK: ${criticalFeedback}`,
        })
        
        await memory.complete()
        
        // Return early with the critical feedback result
        const result: LoopResult = {
          success: false,
          iterations: i + 1,
          finalScore: 0,
          bestScore: memory.bestScore,
          bestIteration: memory.bestIteration,
          runId: memory.runId,
        }
        
        console.log(`\n=== Loop Stopped: Critical Feedback ===`)
        console.log(`Iterations: ${result.iterations}`)
        console.log(`=======================================\n`)
        
        return result
      }

      // Log the iteration (for developer debugging)
      await memory.logIteration(i, {
        score: 0,
        output: response.output,
        logs: response.logs,
        debug: "awaiting evaluation",
      })

      // Evaluate the result
      console.log("Evaluating...")
      const evaluation = await evaluator.evaluate(response, i)
      finalScore = evaluation.score

      // Update log with score
      await memory.logIteration(i, {
        score: evaluation.score,
        output: response.output,
        logs: response.logs,
        debug: JSON.stringify(evaluation),
      })

      console.log(`Score: ${evaluation.score.toFixed(3)}`)

      await memory.advance()

      // Callback
      onIteration?.(i, evaluation.score)

      // Check if we've reached the threshold
      if (evaluation.score >= loopConfig.threshold) {
        console.log(`\nThreshold ${loopConfig.threshold} reached! Stopping.`)
        await memory.complete()
        break
      }

      // Run mid-loop reflection if interval is set and we've completed N iterations
      const reflectionInterval = loopConfig.selfReflectionInterval
      if (reflectionInterval && (i + 1) % reflectionInterval === 0 && i + 1 < loopConfig.maxIterations) {
        const reflection = await runMidLoopReflection(agent, task, memory, i)
        lastReflection = reflection

        // Check if reflection triggered critical feedback
        if (reflection.criticalFeedback) {
          console.log("\n!!! CRITICAL FEEDBACK FROM SELF-REFLECTION !!!")
          console.log(reflection.criticalFeedback)
          console.log("================================================\n")

          await memory.complete()

          // Return early with the critical feedback result
          const result: LoopResult = {
            success: false,
            iterations: i + 1,
            finalScore: evaluation.score,
            bestScore: memory.bestScore,
            bestIteration: memory.bestIteration,
            runId: memory.runId,
          }

          console.log(`\n=== Loop Stopped: Self-Reflection Critical Feedback ===`)
          console.log(`Iterations: ${result.iterations}`)
          console.log(`========================================================\n`)

          return result
        }
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

  // Run self-reflection to analyze the run and suggest improvements
  await runSelfReflection(agent, task, memory, result)

  return result
}

/**
 * Run self-reflection: Agent analyzes its run and suggests improvements
 */
async function runSelfReflection(
  agent: Agent,
  task: string,
  memory: Memory,
  result: LoopResult
): Promise<void> {
  const improvementsPath = join(memory.directory, "self-reflection.md")

  console.log("\n=== Self-Reflection: Analyzing run for improvements ===")

  const iterationSummary = await loadIterationSummary(memory.logsDirectory)

  const reflectionPrompt = buildReflectionPrompt({
    task,
    success: result.success,
    iterations: result.iterations,
    finalScore: result.finalScore,
    bestScore: result.bestScore,
    bestIteration: result.bestIteration,
    iterationSummary,
  })

  try {
    // Initialize agent for reflection if needed
    if (agent.init) {
      await agent.init()
    }

    const response = await agent.run(reflectionPrompt, "")

    console.log("\n--- Self-Reflection Output ---")
    console.log(response.output)

    // Write reflection to the run directory
    const reflectionContent = `# Self-Reflection: Run ${memory.runId}

## Run Summary
- Success: ${result.success}
- Iterations: ${result.iterations}
- Final Score: ${result.finalScore.toFixed(2)}
- Best Score: ${result.bestScore.toFixed(2)} (iteration ${result.bestIteration + 1})

---

${response.output}
`
    await writeFile(improvementsPath, reflectionContent, "utf-8")
    console.log(`\nSelf-reflection written to: ${improvementsPath}`)
  } catch (error) {
    console.error("Self-reflection failed:", error)
  }
}

/**
 * Calculate score trend from iteration logs
 */
function calculateScoreTrend(iterations: { iteration: number; score: number }[]): string {
  if (iterations.length < 2) return "Not enough data"
  
  const scores = iterations.map(i => i.score)
  const lastThree = scores.slice(-3)
  
  const isImproving = lastThree.every((s, i) => i === 0 || s >= lastThree[i - 1])
  const isRegressing = lastThree.every((s, i) => i === 0 || s <= lastThree[i - 1])
  const isPlateau = Math.max(...lastThree) - Math.min(...lastThree) < 0.05
  
  if (isPlateau) return `Plateau at ~${(scores[scores.length - 1] * 100).toFixed(0)}%`
  if (isImproving) return `Improving: ${lastThree.map(s => (s * 100).toFixed(0) + "%").join(" → ")}`
  if (isRegressing) return `Regressing: ${lastThree.map(s => (s * 100).toFixed(0) + "%").join(" → ")}`
  return `Fluctuating: ${lastThree.map(s => (s * 100).toFixed(0) + "%").join(" → ")}`
}

/**
 * Load iteration data from the logs directory
 */
async function loadIterationData(logsDir: string): Promise<Array<{ iteration: number; score: number; debug?: string }>> {
  try {
    const files = await readdir(logsDir)
    const jsonFiles = files.filter(f => f.startsWith("iteration_") && f.endsWith(".json"))
    
    const iterations: Array<{ iteration: number; score: number; debug?: string }> = []
    
    for (const file of jsonFiles) {
      const content = await readFile(join(logsDir, file), "utf-8")
      const data = JSON.parse(content)
      iterations.push({
        iteration: data.iteration,
        score: data.score,
        debug: data.debug,
      })
    }
    
    return iterations.sort((a, b) => a.iteration - b.iteration)
  } catch {
    return []
  }
}

/**
 * Load iteration summary for reflection prompts
 */
async function loadIterationSummary(logsDir: string): Promise<string> {
  const iterations = await loadIterationData(logsDir)
  return buildIterationSummary(iterations)
}

/**
 * Run mid-loop self-reflection: Analyze progress and decide whether to continue
 */
async function runMidLoopReflection(
  agent: Agent,
  task: string,
  memory: Memory,
  iteration: number
): Promise<SelfReflectionResult> {
  const reflectionPath = join(memory.directory, `reflection_iteration_${iteration + 1}.md`)

  console.log("\n=== Mid-Loop Self-Reflection ===")
  console.log(`Analyzing progress after ${iteration + 1} iterations...`)

  const iterations = await loadIterationData(memory.logsDirectory)
  const iterationSummary = buildIterationSummary(iterations)
  const scoreTrend = calculateScoreTrend(iterations)

  const reflectionPrompt = buildMidLoopReflectionPrompt({
    task,
    currentIteration: iteration + 1,
    maxIterations: memory.maxIterations,
    bestScore: memory.bestScore,
    bestIteration: memory.bestIteration,
    scoreTrend,
    iterationSummary,
  })

  try {
    const response = await agent.run(reflectionPrompt, "")

    console.log("\n--- Reflection Output ---")
    console.log(response.output)

    // Parse the response for CRITICAL_FEEDBACK or CONTINUE
    const criticalMatch = response.output.match(/\*\*CRITICAL_FEEDBACK:\*\*\s*(.+?)(?:\n\n|\n(?=\*\*)|$)/s)
    const continueMatch = response.output.match(/\*\*CONTINUE:\*\*\s*(.+?)(?:\n\n|\n(?=\*\*)|$)/s)

    const criticalFeedback = criticalMatch ? criticalMatch[1].trim() : null

    // Write reflection to disk
    const reflectionContent = `# Mid-Loop Reflection: Iteration ${iteration + 1}

## Progress Summary
- Iterations completed: ${iteration + 1} of ${memory.maxIterations}
- Best Score: ${(memory.bestScore * 100).toFixed(0)}% (iteration ${memory.bestIteration + 1})
- Score Trend: ${scoreTrend}

## Decision
${criticalFeedback ? `**STOP** - Critical feedback: ${criticalFeedback}` : `**CONTINUE** - ${continueMatch?.[1]?.trim() || "Proceeding with next iteration"}`}

---

${response.output}
`
    await writeFile(reflectionPath, reflectionContent, "utf-8")
    console.log(`\nReflection written to: ${reflectionPath}`)

    return {
      analysis: response.output,
      criticalFeedback,
      atIteration: iteration,
    }
  } catch (error) {
    console.error("Mid-loop reflection failed:", error)
    // On error, continue the loop
    return {
      analysis: `Reflection failed: ${error}`,
      criticalFeedback: null,
      atIteration: iteration,
    }
  }
}
