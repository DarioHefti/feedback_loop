import { resolve } from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"
import { readFile } from "fs/promises"

const __dirname = dirname(fileURLToPath(import.meta.url))

interface SATInstance {
  cnf: string
  expected: boolean // true = satisfiable, false = unsatisfiable
  name: string
}

const testCases: SATInstance[] = [
  // Simple satisfiable (3 vars, 4 clauses)
  {
    name: "simple_sat_1",
    expected: true,
    cnf: `p cnf 3 4
1 -2 0
-1 2 0
-1 -2 3 0
1 2 -3 0`,
  },
  // Simple unsatisfiable (3 vars, 4 clauses)
  {
    name: "simple_unsat_1", 
    expected: false,
    cnf: `p cnf 3 4
1 0
-1 0
2 0
-2 0`,
  },
  // Tautology (single clause with all positive)
  {
    name: "tautology",
    expected: true,
    cnf: `p cnf 3 1
1 2 3 0`,
  },
  // Contradiction (empty clause)
  {
    name: "contradiction",
    expected: false,
    cnf: `p cnf 3 5
1 0
-1 0
2 0
-2 0
0`,
  },
  // 4 variables, medium
  {
    name: "medium_sat_1",
    expected: true,
    cnf: `p cnf 4 10
1 2 0
-1 3 0
-2 4 0
1 -3 -4 0
-1 2 -3 0
3 4 0
-3 -4 0
1 -4 0
-1 4 0
2 3 -4 0`,
  },
  {
    name: "medium_unsat_1",
    expected: false,
    cnf: `p cnf 4 8
1 0
-1 0
2 0
-2 0
1 -2 0
-1 2 0
1 2 0
-1 -2 0`,
  },
  // XOR-style (unsatisfiable when combined)
  {
    name: "xor_unsat",
    expected: false,
    cnf: `p cnf 3 6
1 2 0
1 -2 0
-1 2 0
-1 -2 0
3 0
-3 0`,
  },
  // 5 variables
  {
    name: "five_var_sat",
    expected: true,
    cnf: `p cnf 5 12
1 2 3 0
-1 -2 0
-2 -3 0
-3 -4 0
-4 -5 0
5 0
-1 4 0
-2 5 0
-3 -5 0
-4 1 0
-5 2 0
3 4 5 0`,
  },
  {
    name: "five_var_unsat",
    expected: false,
    cnf: `p cnf 5 10
1 0
-1 0
2 0
-2 0
3 0
-3 0
1 2 0
-1 -2 0
1 3 0
-1 -3 0`,
  },
  // Large clause (all but one)
  {
    name: "large_clause_sat",
    expected: true,
    cnf: `p cnf 6 6
1 2 3 4 5 6 0
-1 0
-2 0
-3 0
-4 0
-5 0
-6 0`,
  },
  // Many unit clauses (deterministic)
  {
    name: "unit_chain_sat",
    expected: true,
    cnf: `p cnf 8 10
1 0
-2 0
3 0
-4 0
5 0
-6 0
7 0
-8 0
1 2 3 4 0
5 6 7 8 0`,
  },
  // Inconsistent units
  {
    name: "unit_conflict",
    expected: false,
    cnf: `p cnf 4 6
1 0
-1 0
2 0
-2 0
3 0
-3 0`,
  },
  // Pigeon hole principle (n pigeons, n+1 holes = unsatisfiable)
  {
    name: "pigeon_2",
    expected: false,
    cnf: `p cnf 8 16
1 0
2 0
3 0
4 0
-1 -3 0
-1 -4 0
-2 -3 0
-2 -4 0
-3 -1 0
-3 -2 0
-4 -1 0
-4 -2 0
1 2 3 4 0
-1 -2 0
-3 -4 0
1 2 0
3 4 0`,
  },
  // 10 variable, many clauses
  {
    name: "ten_var_sat",
    expected: true,
    cnf: `p cnf 10 25
1 2 3 4 5 0
-1 -2 0
-2 -3 0
-3 -4 0
-4 -5 0
1 6 0
2 7 0
3 8 0
4 9 0
5 10 0
-6 -7 0
-7 -8 0
-8 -9 0
-9 -10 0
-10 -1 0
6 0
7 0
8 0
9 0
10 0
-1 -6 0
-2 -7 0
-3 -8 0
-4 -9 0
-5 -10 0
1 -2 3 0`,
  },
  // 10 variable unsat
  {
    name: "ten_var_unsat",
    expected: false,
    cnf: `p cnf 10 20
1 0
-1 0
2 0
-2 0
3 0
-3 0
4 0
-4 0
5 0
-5 0
-1 -2 -3 0
1 2 3 0
-2 -3 -4 0
2 3 4 0
-3 -4 -5 0
3 4 5 0
1 2 0
3 4 0
-1 -2 0
-3 -4 0`,
  },
  // Empty clauses throughout
  {
    name: "empty_clause_unsat",
    expected: false,
    cnf: `p cnf 3 4
1 2 0
-1 -2 0
0
1 -2 0`,
  },
  // Variable used only positively
  {
    name: "pure_literal_sat",
    expected: true,
    cnf: `p cnf 4 3
1 2 0
1 3 0
1 4 0`,
  },
  // Multiple pure literals
  {
    name: "multi_pure_sat",
    expected: true,
    cnf: `p cnf 5 4
1 2 0
1 3 0
4 5 0
-1 -4 0`,
  },
  // Latin square hint (simplified)
  {
    name: "latin_hint_sat",
    expected: true,
    cnf: `p cnf 9 27
1 2 3 0
-1 -2 0
-1 -3 0
-2 -3 0
4 5 6 0
-4 -5 0
-4 -6 0
-5 -6 0
7 8 9 0
-7 -8 0
-7 -9 0
-8 -9 0
1 4 7 0
-1 -4 0
-1 -7 0
-4 -7 0
2 5 8 0
-2 -5 0
-2 -8 0
-5 -8 0
3 6 9 0
-3 -6 0
-3 -9 0
-6 -9 0
-1 -5 -9 0
-2 -6 -7 0
-3 -4 -8 0`,
  },
  // Harder unsat
  {
    name: "hard_unsat_1",
    expected: false,
    cnf: `p cnf 7 21
1 0
-1 2 0
-2 3 0
-3 4 0
-4 5 0
-5 6 0
-6 7 0
-7 0
-1 -2 0
-2 -3 0
-3 -4 0
-4 -5 0
-5 -6 0
-6 -7 0
1 2 0
2 3 0
3 4 0
4 5 0
5 6 0
6 7 0
-1 7 0`,
  },
  // Chain of implications
  {
    name: "chain_sat",
    expected: true,
    cnf: `p cnf 5 8
1 2 0
-2 3 0
-3 4 0
-4 5 0
-5 0
-1 0
1 0
2 0`,
  },
  // At-least-one encoding
  {
    name: "alo_5_sat",
    expected: true,
    cnf: `p cnf 5 6
1 2 3 4 5 0
-1 -2 0
-1 -3 0
-1 -4 0
-1 -5 0
-2 -3 0`,
  },
  // At-most-one (should be satisfiable)
  {
    name: "amo_5_sat",
    expected: true,
    cnf: `p cnf 5 10
-1 -2 0
-1 -3 0
-1 -4 0
-1 -5 0
-2 -3 0
-2 -4 0
-2 -5 0
-3 -4 0
-3 -5 0
-4 -5 0`,
  },
  // Exactly-one (using AMO + ALO)
  {
    name: "exact_one_unsat",
    expected: false,
    cnf: `p cnf 3 7
1 2 3 0
-1 -2 0
-1 -3 0
-2 -3 0
1 0
2 0
3 0`,
  },
  // Random-ish satisfiable
  {
    name: "random_sat_1",
    expected: true,
    cnf: `p cnf 8 15
1 2 -3 0
-1 4 0
2 5 -6 0
-2 6 0
3 -4 7 0
-3 8 0
-5 1 0
6 -7 0
-6 2 0
-8 3 0
4 -5 0
7 -8 0
1 -2 3 0
-3 4 -5 0
2 -6 8 0`,
  },
  // Random-ish unsat
  {
    name: "random_unsat_1",
    expected: false,
    cnf: `p cnf 6 12
1 0
-1 0
2 0
-2 0
3 0
-3 0
1 2 3 0
-1 -2 -3 0
1 -2 0
-1 2 0
2 -3 0
-2 3 0`,
  },
  // At least 2 true
  {
    name: "at_least_2_sat",
    expected: true,
    cnf: `p cnf 4 6
1 2 0
1 3 0
1 4 0
2 3 0
2 4 0
3 4 0`,
  },
  // At most 2 (for 3 vars - unsatisfiable with exactly-3 requirement)
  {
    name: "at_most_2_unsat",
    expected: false,
    cnf: `p cnf 3 6
-1 -2 0
-1 -3 0
-2 -3 0
1 0
2 0
3 0`,
  },
  // Double-chain unsat
  {
    name: "double_chain_unsat",
    expected: false,
    cnf: `p cnf 6 16
1 0
-1 2 0
-2 3 0
-3 0
4 0
-4 5 0
-5 6 0
-6 0
1 -4 0
-1 4 0
2 -5 0
-2 5 0
3 -6 0
-3 6 0
-1 -2 0
-5 -6 0`,
  },
  // 15 variable test (medium)
  {
    name: "fifteen_var_sat",
    expected: true,
    cnf: `p cnf 15 30
1 2 3 4 5 0
-1 -2 -3 0
-2 -4 -5 0
-3 -5 -6 0
-4 -6 -7 0
-5 -7 -8 0
-6 -8 -9 0
-7 -9 -10 0
-8 -10 -11 0
-9 -11 -12 0
-10 -12 -13 0
-11 -13 -14 0
-12 -14 -15 0
-1 -4 0
-2 -5 0
-3 -6 0
1 6 7 0
2 8 9 0
3 10 11 0
4 12 13 0
5 14 15 0
6 -7 0
8 -9 0
10 -11 0
12 -13 0
14 -15 0
-1 0
-2 0
-3 0
-4 0
-5 0
-6 0
7 0
8 0
9 0`,
  },
]

export class SATEvaluator {
  async evaluate(_response: { output: string; logs: string[] }, _iteration: number): Promise<{ score: number; [key: string]: unknown }> {
    const solutionPath = resolve(__dirname, "solution.ts")
    
    try {
      const solutionCode = await readFile(solutionPath, "utf-8")
      
      const hasClass = solutionCode.includes("class SATSolver")
      const hasSolve = solutionCode.includes("solve")
      
      if (!hasClass || !hasSolve) {
        return {
          score: 0,
          feedback: "No SATSolver class with solve method found",
        }
      }
      
      const results: string[] = []
      let passed = 0
      
      const { writeFile, unlink } = await import("fs/promises")
      const { execSync } = await import("child_process")
      
      for (const tc of testCases) {
        try {
          const testFile = resolve(__dirname, "temp-sat-test.ts")
          const testCode = `
import { SATSolver } from './solution.js';

const solver = new SATSolver();
const cnf = ${JSON.stringify(tc.cnf)};
try {
  const result = solver.solve(cnf);
  console.log(JSON.stringify({ 
    passed: result.satisfiable === ${tc.expected}, 
    actual: result.satisfiable, 
    expected: ${tc.expected},
    name: ${JSON.stringify(tc.name)}
  }));
} catch (e) {
  console.log(JSON.stringify({ passed: false, error: e.message, name: ${JSON.stringify(tc.name)} }));
}
`
          await writeFile(testFile, testCode)
          const output = execSync(`npx tsx temp-sat-test.ts`, { encoding: "utf-8", cwd: __dirname }).trim()
          await unlink(testFile).catch(() => {})
          
          const parsed = JSON.parse(output)
          if (parsed.passed) {
            passed++
            results.push(`✓ ${tc.name}`)
          } else {
            results.push(`✗ ${tc.name} (got ${parsed.actual}, expected ${parsed.expected})`)
          }
        } catch (e: unknown) {
          const error = e as Error
          results.push(`✗ ${tc.name} (ERROR: ${error.message})`)
        }
      }
      
      const score = passed / testCases.length
      
      return {
        score,
        feedback: `Passed ${passed}/${testCases.length} SAT instances`,
        details: results.slice(0, 20),
      }
    } catch (error) {
      return {
        score: 0,
        feedback: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
}

export function createEvaluator() {
  return new SATEvaluator()
}