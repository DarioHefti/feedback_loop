# Task: Implement a SAT Solver

Write a SAT solver in TypeScript that can determine whether a propositional logic formula is satisfiable or unsatisfiable.

## Requirements

1. Create a file called `solution.ts` in the examples directory
2. Implement a SAT solver that:
   - Takes a formula in DIMACS CNF format (via string)
   - Returns `{ satisfiable: true, model: {...} }` if satisfiable
   - Returns `{ satisfiable: false }` if unsatisfiable
3. Export the solver as `export class SATSolver` with a `solve(cnf: string)` method
4. Handle at least these features:
   - Pure literal elimination
   - Unit clause propagation
   - DPLL algorithm with backtracking
   - Random restarts for avoiding worst-case paths

## Input Format (DIMACS CNF)

```
c This is a comment
p cnf 3 4
1 -2 0
-1 2 0
-1 -2 3 0
1 2 -3 0
```

- `p cnf V C` - V variables, C clauses
- Each clause ends with `0`
- Variables are positive integers, negated with `-`

## Testing

Your solver will be tested against 30 SAT instances:
- 15 satisfiable instances (should return satisfiable: true)
- 15 unsatisfiable instances (should return satisfiable: false)

The test cases include:
- Small formulas (5-10 variables, 5-15 clauses)
- Medium formulas (20-50 variables, 50-100 clauses)
- Hard formulas (100+ variables, 200+ clauses)
- Formulas with many clauses per variable

## Output

Write your solution to: `examples/solution.ts`

## Tips

- Start with basic DPLL
- Add unit propagation (clauses with one literal)
- Add pure literal elimination
- Consider clause learning for harder instances
- Track which assignment caused failure for efficient backtracking

YOU ARE NOT ALLOWED TO READ THE test-evaluator.ts!!!
FIND THE SOLUTION YOURSELF