# Feedback Loop

A minimal agent harness that gives LLMs objective feedback to iteratively improve their output.

Inspired by [karpathy/autoresearch](https://github.com/karpathy/autoresearch), but generic - works for any task that can be evaluated deterministically.

## The Idea

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Task ──► Agent ──► Evaluate ──► Score < threshold?       │
│     ▲                                    │                  │
│     │                                    ▼                  │
│     └─────────── Memory ◄─── Yes: Learn & Retry             │
│                                                             │
│                              No: Done!                      │
└─────────────────────────────────────────────────────────────┘
```

The agent attempts a task, gets evaluated with a deterministic score, and if below threshold, tries again with memory of what worked and what didn't. Simple, but powerful.

## Installation

```bash
git clone https://github.com/DarioHefti/feedback_loop
cd feedback-loop
npm install
npm run build
```

## Quick and Dirty Setup

1. Open opencode
2. Point it to `setup/IMPLEMENT.md`
3. Tell it to go ahead and ask you all the necessary questions to implement the feedback loop for your project

That's it! The implementation guide will walk you through creating your custom evaluator and context provider.

## Quick Start

### 1. Define Your Task

Create a markdown file describing what the agent should do:

```markdown
# task.md

Write a function that sorts an array of numbers.
The function should be called `sortNumbers` and exported.
Write it to `src/solution.ts`.
```

### 2. Implement an Evaluator

The evaluator must be **deterministic** - same input, same score.

```typescript
import type { Evaluator, EvaluationResult, AgentResponse } from "feedback-loop"

class MyEvaluator implements Evaluator {
  async evaluate(response: AgentResponse, iteration: number): Promise<EvaluationResult> {
    // Run tests, check output, measure metrics
    const testsPass = await runTests()
    
    return {
      score: testsPass ? 1.0 : 0.0,  // Required: 0.0 - 1.0
      testsPassed: testsPass,        // Optional: any extra data
    }
  }
}
```

### 3. Run the Loop

```typescript
import { runLoop, OpenCodeAgent } from "feedback-loop"

const result = await runLoop({
  agent: new OpenCodeAgent(),
  evaluator: new MyEvaluator(),
  loopConfig: {
    taskPath: "./task.md",
    maxIterations: 5,
    threshold: 0.9,
  },
})

console.log(result.success ? "Done!" : "Failed after max iterations")
```

## More Information

See [extensive_readme.md](./extensive_readme.md) for detailed documentation on architecture, interfaces, configuration, and examples.

## License

MIT
