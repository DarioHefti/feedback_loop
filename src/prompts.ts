/**
 * System prompts and instructions for the feedback loop
 * 
 * These prompts guide the agent's behavior during the feedback loop execution.
 */

/**
 * System instructions prepended to every agent prompt.
 * Explains the feedback loop context and the criticalFeedback mechanism.
 */
export const SYSTEM_INSTRUCTIONS = `## Feedback Loop Context

You are operating within an automated feedback loop. After each attempt, your output is evaluated and scored (0.0 to 1.0). The loop continues until the score meets the threshold or max iterations are reached.

### Logs and Feedback

Each iteration produces two log files in the run directory:
- **iteration_XXX.log** - Your output and logs from that iteration
- **evaluation_XXX.log** - The evaluator's feedback showing what worked and what didn't

You can read these files to understand:
- What approaches succeeded or failed
- Why specific scores were given
- Patterns across multiple attempts

### Critical Feedback Mechanism

If you cannot complete the task due to missing information, tools, or other blockers, you MUST clearly state this. Include in your response:

**CRITICAL_FEEDBACK:** [Explain what is missing or blocking you]

Examples:
- "CRITICAL_FEEDBACK: I need access to the target screenshot file to complete this visual comparison task."
- "CRITICAL_FEEDBACK: The required API endpoint is not accessible from this environment."
- "CRITICAL_FEEDBACK: I need clarification on the expected output format."

This will stop the loop immediately and surface the issue to the user, rather than wasting iterations on an impossible task.

### How to Improve

After each iteration, you receive:
1. Your previous score and approach summary
2. Evaluation feedback explaining what worked and what didn't
3. Insights from all previous attempts

Use this feedback to:
- Understand WHY your score was low
- Avoid repeating failed approaches
- Build on what worked in previous attempts
- Try fundamentally different strategies if incremental changes aren't working

`

/**
 * Prompt template for self-reflection after a run completes.
 * Variables: {task}, {success}, {iterations}, {finalScore}, {bestScore}, {bestIteration}, {entrySummary}
 */
export const REFLECTION_PROMPT_TEMPLATE = `You are analyzing a feedback loop run. Your job is to reflect on what worked, what didn't, and how to improve.

## Task
{task}

## Run Results
- Success: {success}
- Iterations: {iterations}
- Final Score: {finalScore}
- Best Score: {bestScore} (iteration {bestIteration})

## Iteration History
{entrySummary}

## Analysis Instructions
Analyze this run and write recommendations for improving future runs. Consider:
1. Was the approach effective? What worked well?
2. What patterns led to score improvements or regressions?
3. What would make the next run more likely to succeed?
4. Any specific code or configuration changes to recommend?
5. Did the agent receive sufficient feedback from evaluations to understand what was wrong?
6. Were there blockers that should have triggered critical feedback earlier?

Write your analysis as a structured markdown document covering:
- What Worked Well
- What Could Be Improved  
- Specific Recommendations for Next Run
- Feedback Loop Improvements (if the loop itself could be better)

Be concise and actionable.`

/**
 * Build the reflection prompt with actual values
 */
export function buildReflectionPrompt(params: {
  task: string
  success: boolean
  iterations: number
  finalScore: number
  bestScore: number
  bestIteration: number
  entrySummary: string
}): string {
  return REFLECTION_PROMPT_TEMPLATE
    .replace("{task}", params.task)
    .replace("{success}", String(params.success))
    .replace("{iterations}", String(params.iterations))
    .replace("{finalScore}", params.finalScore.toFixed(2))
    .replace("{bestScore}", params.bestScore.toFixed(2))
    .replace("{bestIteration}", String(params.bestIteration + 1))
    .replace("{entrySummary}", params.entrySummary)
}

/**
 * Context template for iterations that includes evaluation feedback.
 * This ensures the agent sees WHY their previous attempts scored as they did.
 */
export const ITERATION_CONTEXT_TEMPLATE = `## Iteration {iteration}

{previousAttempts}

{systemInstructions}`

/**
 * Prompt template for mid-loop self-reflection.
 * This is run every N iterations to analyze progress and determine if the task is solvable.
 */
export const MID_LOOP_REFLECTION_TEMPLATE = `You are performing a mid-loop self-reflection. Your job is to critically analyze the progress so far and determine if the task can be completed.

## Task
{task}

## Progress So Far
- Current Iteration: {currentIteration} of {maxIterations}
- Best Score: {bestScore} (iteration {bestIteration})
- Score Trend: {scoreTrend}

## Iteration History
{entrySummary}

## Your Analysis

Analyze the progress and answer these questions:

1. **Is progress being made?** Are scores improving, plateauing, or regressing?
2. **Are there recurring blockers?** Issues that appear in multiple iterations without resolution?
3. **Is the task solvable?** Given the available tools and information, can this task be completed?
4. **What should change?** Concrete recommendations for the next iterations.

## Critical Feedback Decision

After your analysis, you MUST decide: should the loop continue or stop?

If the task CANNOT be completed (missing assets, tools, permissions, or information that won't become available), output:

**CRITICAL_FEEDBACK:** [Explain exactly why the task cannot be completed and what would be needed]

If the task CAN still be completed, output:

**CONTINUE:** [Brief summary of recommended approach for next iterations]

Be ruthlessly honest. Stopping early on an impossible task is better than wasting iterations.`

/**
 * Build the mid-loop reflection prompt with actual values
 */
export function buildMidLoopReflectionPrompt(params: {
  task: string
  currentIteration: number
  maxIterations: number
  bestScore: number
  bestIteration: number
  scoreTrend: string
  entrySummary: string
}): string {
  return MID_LOOP_REFLECTION_TEMPLATE
    .replace("{task}", params.task)
    .replace("{currentIteration}", String(params.currentIteration))
    .replace("{maxIterations}", String(params.maxIterations))
    .replace("{bestScore}", (params.bestScore * 100).toFixed(0) + "%")
    .replace("{bestIteration}", String(params.bestIteration + 1))
    .replace("{scoreTrend}", params.scoreTrend)
    .replace("{entrySummary}", params.entrySummary)
}

/**
 * Format a single memory entry with full evaluation feedback
 */
export function formatMemoryEntry(entry: {
  iteration: number
  score: number
  approach: string
  insights: string[]
  failed: boolean
}): string {
  const status = entry.failed ? "FAILED" : `Score: ${(entry.score * 100).toFixed(0)}%`
  
  let result = `### Attempt ${entry.iteration + 1} (${status})\n`
  result += `**Approach:** ${entry.approach}\n`
  
  if (entry.insights.length > 0) {
    result += `\n**Evaluation Feedback:**\n`
    for (const insight of entry.insights) {
      result += `- ${insight}\n`
    }
  }
  
  return result
}
