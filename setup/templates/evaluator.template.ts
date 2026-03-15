/**
 * Template: Project Evaluator
 * 
 * Copy this file to src/evaluator.ts and implement the evaluate method.
 */

// When copied to src/, import from "./index.js"
import type { Evaluator, EvaluationResult, AgentResponse } from "./index.js"
import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export class ProjectEvaluator implements Evaluator {
  /**
   * Evaluate the agent's work and return a score.
   * 
   * IMPORTANT: This must be deterministic!
   * Same input should always produce the same score.
   */
  async evaluate(response: AgentResponse, iteration: number): Promise<EvaluationResult> {
    const results: Record<string, unknown> = {}
    let totalScore = 0
    let maxScore = 0

    // =====================================================
    // IMPLEMENT YOUR EVALUATION LOGIC BELOW
    // =====================================================

    // Example 1: Check if required files exist
    // -----------------------------------------
    // const requiredFiles = ["src/index.ts", "src/utils.ts"]
    // for (const file of requiredFiles) {
    //   maxScore += 1
    //   if (existsSync(file)) {
    //     totalScore += 1
    //     results[`file_${file}`] = "exists"
    //   } else {
    //     results[`file_${file}`] = "missing"
    //   }
    // }

    // Example 2: Run tests
    // --------------------
    // try {
    //   const { stdout } = await execAsync("npm test")
    //   maxScore += 1
    //   totalScore += 1
    //   results.tests = "passed"
    // } catch (error) {
    //   maxScore += 1
    //   results.tests = "failed"
    //   results.testError = (error as Error).message
    // }

    // Example 3: Type check
    // ---------------------
    // try {
    //   await execAsync("npx tsc --noEmit")
    //   maxScore += 1
    //   totalScore += 1
    //   results.types = "valid"
    // } catch {
    //   maxScore += 1
    //   results.types = "invalid"
    // }

    // Example 4: Check file content
    // -----------------------------
    // const filePath = "src/solution.ts"
    // if (existsSync(filePath)) {
    //   const content = await readFile(filePath, "utf-8")
    //   
    //   // Check for required patterns
    //   const patterns = [
    //     { name: "hasExport", regex: /export\s+(function|const|class)/ },
    //     { name: "hasTypes", regex: /:\s*(string|number|boolean|void)/ },
    //   ]
    //   
    //   for (const { name, regex } of patterns) {
    //     maxScore += 1
    //     if (regex.test(content)) {
    //       totalScore += 1
    //       results[name] = true
    //     } else {
    //       results[name] = false
    //     }
    //   }
    // }

    // =====================================================
    // END OF EVALUATION LOGIC
    // =====================================================

    // Calculate final score (0.0 - 1.0)
    const score = maxScore > 0 ? totalScore / maxScore : 0

    return {
      score,
      totalScore,
      maxScore,
      ...results,
    }
  }
}
