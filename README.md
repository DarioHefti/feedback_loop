# Feedback Loop

A minimal agent harness that gives LLMs objective feedback to iteratively improve their output.

Inspired by [karpathy/autoresearch](https://github.com/karpathy/autoresearch), but generic - works for any task that can be evaluated deterministically.

## The Idea

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Task ──► Agent ──► Evaluate ──► Score < threshold?        │
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
git clone https://github.com/yourname/feedback-loop
cd feedback-loop
npm install
npm run build
```

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

## Architecture

```
feedback-loop/
├── src/
│   ├── interfaces/          # What you implement
│   │   ├── agent.ts         # LLM agent interface
│   │   ├── evaluator.ts     # Evaluation interface
│   │   └── context.ts       # Context provider interface
│   ├── implementations/
│   │   └── opencode-agent.ts  # OpenCode SDK integration
│   ├── loop.ts              # Main feedback loop
│   └── memory.ts            # State & persistence
├── setup/                   # AI-guided setup instructions
│   └── IMPLEMENT.md         # Point your agent here
└── runs/                    # Persisted run data
    └── 2026-03-15.../
        ├── state.json       # Resume state
        └── iteration_001.log
```

## Interfaces

### Agent

Runs the LLM with a task and context.

```typescript
interface Agent {
  run(task: string, context: string): Promise<AgentResponse>
  init?(): Promise<void>
  cleanup?(): Promise<void>
}
```

**Included:** `OpenCodeAgent` - uses OpenCode SDK

### Evaluator

Scores the agent's output. Must be deterministic.

```typescript
interface Evaluator {
  evaluate(response: AgentResponse, iteration: number): Promise<EvaluationResult>
}
```

**You implement this** for your specific use case.

### ContextProvider (Optional)

Provides additional context per iteration.

```typescript
interface ContextProvider {
  getContext(task: string, memory: MemoryEntry[], iteration: number): Promise<string>
}
```

**Default:** Summarizes previous attempts and scores.

## Features

- **State Persistence** - Runs save to `./runs/` and can be resumed
- **Iteration Logging** - Full agent output logged per iteration
- **Flexible Evaluation** - Return `score` (required) plus any metrics
- **Memory System** - Agent learns from previous attempts
- **OpenCode Integration** - Uses SDK for reliable cross-platform execution

## Configuration

```typescript
interface LoopConfig {
  taskPath: string      // Path to task markdown file
  maxIterations: number // Stop after N attempts
  threshold: number     // Success threshold (0.0 - 1.0)
  runDir?: string       // Custom run directory
}
```

## OpenCode Agent Options

```typescript
const agent = new OpenCodeAgent({
  // Connect to existing server (faster, no cold boot)
  connectTo: "http://localhost:4096",
  
  // Or specify model
  model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
  
  // Use specific agent
  agent: "my-custom-agent",
  
  // Working directory (config loaded from here)
  cwd: "/path/to/project",
  
  // Inline config (overrides config files)
  config: {
    model: "anthropic/claude-sonnet-4-5",
    permission: { bash: "allow", write: "allow" },
  },
})
```

**Tip:** Run `opencode serve` separately and use `connectTo` to avoid server startup time on each run.

## OpenCode Configuration

The `OpenCodeAgent` uses the OpenCode SDK which loads configuration automatically:

### Config Loading Order (later overrides earlier)

1. **Global config**: `~/.config/opencode/opencode.json`
2. **Project config**: `opencode.json` in working directory
3. **Inline config**: Passed via `config` option in constructor

### Example Project Config

Create `opencode.json` in your project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-5",
  "permission": {
    "bash": "allow",
    "write": "allow",
    "edit": "allow"
  },
  "tools": {
    "todowrite": false
  }
}
```

### Using a Different Working Directory

```typescript
const agent = new OpenCodeAgent({
  // Load config from a different project
  cwd: "/path/to/target/project",
})
```

The agent will:
1. Change to the specified directory
2. Load `opencode.json` from that directory
3. Start the server
4. Restore the original working directory

See [OpenCode Config Docs](https://opencode.ai/docs/config/) for all options.

## AI-Assisted Setup

Don't want to implement the interfaces manually? Point an AI agent to the setup instructions:

```
See ./setup/IMPLEMENT.md for instructions on implementing this harness for your project.
```

The setup file contains everything an AI needs to implement your custom Evaluator and ContextProvider.

## Example

See `examples/` for a complete working example that:
1. Tasks the agent with writing a counter module
2. Evaluates by checking if the code exists and has correct structure
3. Runs until the code passes all checks

```bash
npm run example
```

## License

MIT
