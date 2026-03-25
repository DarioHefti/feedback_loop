import { appendFile, mkdir, writeFile } from "fs/promises"
import { join, dirname } from "path"
import { existsSync } from "fs"
import type { DetailedEvent } from "./interfaces/index.js"

/**
 * Simple CSV logger that appends events line by line
 */
export class EventLogger {
  private logPath: string
  private initialized = false

  constructor(logDir: string, filename = "events.csv") {
    this.logPath = join(logDir, filename)
  }

  /**
   * Initialize the logger - creates the CSV file with headers if it doesn't exist
   */
  async init(): Promise<void> {
    if (this.initialized) return

    // Ensure directory exists
    const dir = dirname(this.logPath)
    await mkdir(dir, { recursive: true })

    // Write headers if file doesn't exist
    if (!existsSync(this.logPath)) {
      const headers = [
        "timestamp",
        "iteration",
        "event_type",
        "tool_name",
        "duration_ms",
        "input",
        "output",
        "message",
      ].join(",")
      await writeFile(this.logPath, headers + "\n", "utf-8")
    }

    this.initialized = true
  }

  /**
   * Log an event to the CSV file
   */
  async logEvent(event: DetailedEvent, iteration?: number): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }

    const row = [
      event.timestamp,
      iteration ?? "",
      event.type,
      event.name ?? "",
      event.durationMs ?? "",
      this.escapeCSV(event.input ? JSON.stringify(event.input) : ""),
      this.escapeCSV(event.output ? JSON.stringify(event.output) : ""),
      this.escapeCSV(event.message ?? ""),
    ].join(",")

    await appendFile(this.logPath, row + "\n", "utf-8")
  }

  /**
   * Log a raw message (for debugging)
   */
  async logRaw(message: string, iteration?: number): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }

    const row = [
      new Date().toISOString(),
      iteration ?? "",
      "debug",
      "",
      "",
      "",
      "",
      this.escapeCSV(message),
    ].join(",")

    await appendFile(this.logPath, row + "\n", "utf-8")
  }

  /**
   * Escape a value for CSV (handle commas, quotes, newlines)
   */
  private escapeCSV(value: string): string {
    if (!value) return ""
    // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""').replace(/\n/g, "\\n")}"`
    }
    return value
  }

  get path(): string {
    return this.logPath
  }
}
