# Feedback Loop Implementation Guide

You are an AI agent tasked with implementing a feedback loop harness for a user's specific project. This document explains what you need to do.

## Overview

The feedback loop harness runs an LLM agent iteratively on a task until it achieves a target score. Your job is to implement the project-specific components based on the user's requirements.

## What You Need From The User

Ask the user for the following information:

1. **Task Description** - What should the agent accomplish?
2. **Evaluation Criteria** - How do we know if the agent succeeded? (must be deterministic)
3. **Context Sources** - What information should the agent have access to?
4. **Success Threshold** - What score (0.0-1.0) means "done"?
5. **Max Iterations** - How many attempts before giving up?

## Files You Need To Create

### 1. Task File: `task.md`

Create a markdown file describing the task. Be specific and clear.

```markdown
# Task: [Title]

[Detailed description of what the agent should accomplish]

## Requirements
- [Requirement 1]
- [Requirement 2]

## Constraints
- [Any constraints or rules]

## Expected Output
- [What files/changes should exist when done]
```

### 2. Evaluator: `src/evaluator.ts`

The evaluator MUST be deterministic - same input produces same score.

```typescript
import type { Evaluator, EvaluationResult, AgentResponse } from "./index.js"

export class ProjectEvaluator implements Evaluator {
  async evaluate(response: AgentResponse, iteration: number): Promise<EvaluationResult> {
    // IMPLEMENT: Your evaluation logic here
    // 
    // Common patterns:
    // - Run tests and count pass/fail
    // - Check if files exist with correct content
    // - Validate output against a schema
    // - Run linters/type checkers
    // - Execute code and check results
    
    let score = 0
    const details: Record<string, unknown> = {}
    
    // Example: Check if a file exists
    // if (existsSync("path/to/expected/file.ts")) {
    //   score += 0.25
    //   details.fileExists = true
    // }
    
    // Example: Run tests
    // try {
    //   const result = await execAsync("npm test")
    //   const passed = parseTestResults(result.stdout)
    //   score += passed / total
    //   details.testsPassed = passed
    // } catch (e) {
    //   details.testError = e.message
    // }
    
    return {
      score,  // Required: 0.0 - 1.0
      ...details,  // Optional: any extra metrics
    }
  }
}
```

**Important Evaluation Principles:**
- Must be deterministic (no randomness)
- Should run quickly (agent waits for result)
- Return partial scores when possible (0.5 is better than 0)
- Include diagnostic info in the result for debugging

### 3. Context Provider (Optional): `src/context-provider.ts`

Provides project-specific context to the agent each iteration.

```typescript
import type { ContextProvider, MemoryEntry } from "./index.js"

export class ProjectContextProvider implements ContextProvider {
  async getContext(task: string, memory: MemoryEntry[], iteration: number): Promise<string> {
    // IMPLEMENT: Return relevant context for your project
    //
    // Common patterns:
    // - Read relevant source files
    // - Include test results from last run
    // - Show current state of the codebase
    // - Provide documentation or examples
    
    const context: string[] = []
    
    // Example: Include current file content
    // if (existsSync("src/solution.ts")) {
    //   const content = await readFile("src/solution.ts", "utf-8")
    //   context.push(`Current implementation:\n\`\`\`typescript\n${content}\n\`\`\``)
    // }
    
    // Example: Include last test output
    // if (memory.length > 0) {
    //   const last = memory[memory.length - 1]
    //   context.push(`Last attempt scored ${last.score}`)
    //   context.push(`Issues: ${last.insights.join(", ")}`)
    // }
    
    // Memory summary (recommended to include)
    if (memory.length > 0) {
      context.push(`\n## Previous Attempts`)
      for (const entry of memory) {
        context.push(`- Iteration ${entry.iteration + 1}: score ${entry.score.toFixed(2)} - ${entry.approach}`)
      }
    }
    
    return context.join("\n\n")
  }
}
```

### 4. Main Entry Point: `src/run.ts`

Wire everything together:

```typescript
import { runLoop, OpenCodeAgent } from "./index.js"
import { ProjectEvaluator } from "./evaluator.js"
import { ProjectContextProvider } from "./context-provider.js"
import { join } from "path"

async function main() {
  const agent = new OpenCodeAgent({
    // Optional: connect to existing server for faster iterations
    // connectTo: "http://localhost:4096",
  })

  const result = await runLoop({
    agent,
    evaluator: new ProjectEvaluator(),
    contextProvider: new ProjectContextProvider(),
    loopConfig: {
      taskPath: join(process.cwd(), "task.md"),
      maxIterations: 10,  // Adjust based on task complexity
      threshold: 0.9,     // Adjust based on requirements
    },
    onIteration: (iteration, score) => {
      console.log(`Iteration ${iteration + 1}: ${(score * 100).toFixed(1)}%`)
    },
  })

  if (result.success) {
    console.log(`Success after ${result.iterations} iterations!`)
  } else {
    console.log(`Failed. Best score: ${result.bestScore} at iteration ${result.bestIteration + 1}`)
  }
}

main().catch(console.error)
```

## Implementation Checklist

Before running, verify:

- [ ] `task.md` exists with clear task description
- [ ] `src/evaluator.ts` implements deterministic evaluation
- [ ] `src/context-provider.ts` provides relevant context (or use default)
- [ ] `src/run.ts` wires everything together
- [ ] Run `npm run build` to compile TypeScript
- [ ] Test evaluator manually before running loop

## Common Evaluation Patterns

### Pattern 1: Test-Based Evaluation

```typescript
import { exec } from "child_process"
import { promisify } from "util"
const execAsync = promisify(exec)

async evaluate(response: AgentResponse): Promise<EvaluationResult> {
  try {
    const { stdout } = await execAsync("npm test -- --json")
    const results = JSON.parse(stdout)
    const passed = results.numPassedTests
    const total = results.numTotalTests
    
    return {
      score: passed / total,
      passed,
      total,
      failures: results.testResults.filter(t => t.status === "failed"),
    }
  } catch (error) {
    return { score: 0, error: error.message }
  }
}
```

### Pattern 2: File Validation

```typescript
import { existsSync } from "fs"
import { readFile } from "fs/promises"

async evaluate(response: AgentResponse): Promise<EvaluationResult> {
  const checks = {
    fileExists: existsSync("src/solution.ts"),
    hasExport: false,
    hasFunction: false,
  }
  
  if (checks.fileExists) {
    const content = await readFile("src/solution.ts", "utf-8")
    checks.hasExport = content.includes("export")
    checks.hasFunction = content.includes("function")
  }
  
  const passed = Object.values(checks).filter(Boolean).length
  const total = Object.keys(checks).length
  
  return {
    score: passed / total,
    checks,
  }
}
```

### Pattern 3: Type Checking

```typescript
async evaluate(response: AgentResponse): Promise<EvaluationResult> {
  try {
    await execAsync("npx tsc --noEmit")
    return { score: 1.0, typesValid: true }
  } catch (error) {
    const errorCount = (error.stdout.match(/error TS/g) || []).length
    return {
      score: Math.max(0, 1 - errorCount * 0.1),
      typesValid: false,
      errorCount,
    }
  }
}
```

### Pattern 4: Output Matching

```typescript
async evaluate(response: AgentResponse): Promise<EvaluationResult> {
  const actual = await runScript("src/solution.ts")
  const expected = await readFile("expected-output.txt", "utf-8")
  
  if (actual.trim() === expected.trim()) {
    return { score: 1.0, match: true }
  }
  
  // Partial credit for similar output
  const similarity = calculateSimilarity(actual, expected)
  return { score: similarity, match: false, actual, expected }
}
```

## Tips for Good Evaluators

1. **Start strict, then relax** - Begin with exact matching, add partial credit later
2. **Fast is better** - Slow evaluation = slow iteration
3. **Return diagnostics** - Help the agent understand what failed
4. **Handle errors gracefully** - Return score 0 with error info, don't throw
5. **Test manually first** - Run your evaluator on known good/bad inputs

## Running The Loop

```bash
# Build first
npm run build

# Run with your implementation
npx tsx src/run.ts

# Or add to package.json scripts:
# "run": "tsx src/run.ts"
```

## Resuming Failed Runs

Runs are saved to `./runs/`. To resume:

```typescript
const result = await runLoop({
  // ... other options
  resumeFrom: "./runs/2026-03-15T12-00-00-000Z",
})
```

## Debugging

1. Check iteration logs in `./runs/[run-id]/iteration_*.log`
2. Check state in `./runs/[run-id]/state.json`
3. Add console.log in your evaluator
4. Run evaluator standalone to test scoring logic
