import { readFile, writeFile, mkdir } from "fs/promises"
import { join } from "path"
import type { MemoryEntry, RunState } from "./interfaces/types.js"

/**
 * Memory manager for tracking iterations and persisting state
 */
export class Memory {
  private state: RunState
  private runDir: string

  constructor(state: RunState, runDir: string) {
    this.state = state
    this.runDir = runDir
  }

  /**
   * Create a new memory instance for a fresh run
   */
  static async create(config: {
    taskPath: string
    maxIterations: number
    threshold: number
    runDir?: string
  }): Promise<Memory> {
    const runId = new Date().toISOString().replace(/[:.]/g, "-")
    const runDir = config.runDir ?? join(process.cwd(), "runs", runId)
    
    await mkdir(runDir, { recursive: true })

    const state: RunState = {
      runId,
      taskPath: config.taskPath,
      startedAt: new Date().toISOString(),
      currentIteration: 0,
      maxIterations: config.maxIterations,
      threshold: config.threshold,
      bestScore: 0,
      bestIteration: -1,
      completed: false,
      memory: [],
    }

    const memory = new Memory(state, runDir)
    await memory.save()
    return memory
  }

  /**
   * Resume from an existing run
   */
  static async resume(runDir: string): Promise<Memory> {
    const statePath = join(runDir, "state.json")
    const content = await readFile(statePath, "utf-8")
    const state = JSON.parse(content) as RunState
    return new Memory(state, runDir)
  }

  /**
   * Record the result of an iteration
   */
  async record(entry: Omit<MemoryEntry, "timestamp">): Promise<void> {
    const fullEntry: MemoryEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    }

    this.state.memory.push(fullEntry)
    this.state.currentIteration = entry.iteration + 1

    if (entry.score > this.state.bestScore) {
      this.state.bestScore = entry.score
      this.state.bestIteration = entry.iteration
    }

    await this.save()
  }

  /**
   * Log agent output for an iteration
   */
  async logIteration(iteration: number, logs: string[]): Promise<void> {
    const logPath = join(this.runDir, `iteration_${String(iteration + 1).padStart(3, "0")}.log`)
    await writeFile(logPath, logs.join("\n"), "utf-8")
  }

  /**
   * Mark the run as completed
   */
  async complete(): Promise<void> {
    this.state.completed = true
    await this.save()
  }

  /**
   * Save state to disk
   */
  private async save(): Promise<void> {
    const statePath = join(this.runDir, "state.json")
    await writeFile(statePath, JSON.stringify(this.state, null, 2), "utf-8")
  }

  // Getters
  get entries(): MemoryEntry[] {
    return this.state.memory
  }

  get currentIteration(): number {
    return this.state.currentIteration
  }

  get bestScore(): number {
    return this.state.bestScore
  }

  get bestIteration(): number {
    return this.state.bestIteration
  }

  get runId(): string {
    return this.state.runId
  }

  get isCompleted(): boolean {
    return this.state.completed
  }

  get maxIterations(): number {
    return this.state.maxIterations
  }

  get threshold(): number {
    return this.state.threshold
  }

  /**
   * Get a summary of memory for context
   */
  summary(): string {
    if (this.entries.length === 0) return "No previous iterations"
    
    return this.entries
      .map((e) => `[${e.iteration + 1}] ${e.failed ? "FAILED" : `${e.score.toFixed(2)}`}: ${e.approach}`)
      .join("\n")
  }
}
