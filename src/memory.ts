import { readFile, writeFile, mkdir } from "fs/promises"
import { join } from "path"

interface RunState {
  runId: string
  taskPath: string
  startedAt: string
  currentIteration: number
  maxIterations: number
  threshold: number
  bestScore: number
  bestIteration: number
  completed: boolean
}

export class Memory {
  private state: RunState
  private runDir: string
  private notesDir: string
  private logsDir: string

  constructor(state: RunState, runDir: string) {
    this.state = state
    this.runDir = runDir
    this.notesDir = join(runDir, "notes")
    this.logsDir = join(runDir, "logs")
  }

  static async create(config: {
    taskPath: string
    maxIterations: number
    threshold: number
    runDir?: string
  }): Promise<Memory> {
    const runId = new Date().toISOString().replace(/[:.]/g, "-")
    const runDir = config.runDir ?? join(process.cwd(), "runs", runId)
    
    await mkdir(runDir, { recursive: true })
    await mkdir(join(runDir, "notes"), { recursive: true })
    await mkdir(join(runDir, "logs"), { recursive: true })

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
    }

    const memory = new Memory(state, runDir)
    await memory.save()
    return memory
  }

  static async resume(runDir: string): Promise<Memory> {
    const statePath = join(runDir, "state.json")
    const content = await readFile(statePath, "utf-8")
    const state = JSON.parse(content) as RunState
    return new Memory(state, runDir)
  }

  async advance(): Promise<void> {
    this.state.currentIteration++
    await this.save()
  }

  async writeNote(title: string, content: string): Promise<string> {
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50)
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const filename = `${timestamp}_${sanitizedTitle}.md`
    const filepath = join(this.notesDir, filename)
    
    const noteContent = `# ${title}\n\n${content}\n`
    await writeFile(filepath, noteContent, "utf-8")
    return filepath
  }

  async logIteration(iteration: number, result: {
    score: number
    output: string
    logs: string[]
    debug?: string
  }): Promise<void> {
    if (result.score > this.state.bestScore) {
      this.state.bestScore = result.score
      this.state.bestIteration = iteration
    }
    
    const logPath = join(this.logsDir, `iteration_${String(iteration + 1).padStart(3, "0")}.json`)
    await writeFile(logPath, JSON.stringify({
      iteration: iteration + 1,
      timestamp: new Date().toISOString(),
      score: result.score,
      outputLength: result.output.length,
      logs: result.logs,
      debug: result.debug,
    }, null, 2), "utf-8")
  }

  async complete(): Promise<void> {
    this.state.completed = true
    await this.save()
  }

  private async save(): Promise<void> {
    const statePath = join(this.runDir, "state.json")
    await writeFile(statePath, JSON.stringify(this.state, null, 2), "utf-8")
  }

  get currentIteration(): number { return this.state.currentIteration }
  get runId(): string { return this.state.runId }
  get isCompleted(): boolean { return this.state.completed }
  get maxIterations(): number { return this.state.maxIterations }
  get threshold(): number { return this.state.threshold }
  get bestScore(): number { return this.state.bestScore }
  get bestIteration(): number { return this.state.bestIteration }
  get directory(): string { return this.runDir }
  get notesDirectory(): string { return this.notesDir }
  get logsDirectory(): string { return this.logsDir }
}