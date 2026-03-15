/**
 * SAT Solver using DPLL algorithm with:
 * - Unit clause propagation
 * - Pure literal elimination
 * - Random restarts
 * - VSIDS-like variable selection heuristic
 */

export type SATResult =
  | { satisfiable: true; model: Record<number, boolean> }
  | { satisfiable: false };

type Literal = number; // positive for variable, negative for negation
type Clause = Literal[];
type Assignment = Map<number, boolean>;

interface WatchedLiterals {
  watches: Map<Literal, Set<number>>; // literal -> clause indices
  clauseWatches: Map<number, [Literal, Literal]>; // clause index -> two watched literals
}

export class SATSolver {
  private numVars: number = 0;
  private clauses: Clause[] = [];
  private activity: Map<number, number> = new Map();
  private decayFactor: number = 0.95;
  private conflicts: number = 0;
  private restartThreshold: number = 100;
  private restartMultiplier: number = 1.5;

  solve(cnf: string): SATResult {
    this.parse(cnf);

    if (this.clauses.length === 0) {
      // No clauses means satisfiable
      const model: Record<number, boolean> = {};
      for (let i = 1; i <= this.numVars; i++) {
        model[i] = true;
      }
      return { satisfiable: true, model };
    }

    // Check for empty clause
    for (const clause of this.clauses) {
      if (clause.length === 0) {
        return { satisfiable: false };
      }
    }

    // Initialize activity scores
    for (let i = 1; i <= this.numVars; i++) {
      this.activity.set(i, 0);
    }
    for (const clause of this.clauses) {
      for (const lit of clause) {
        const v = Math.abs(lit);
        this.activity.set(v, (this.activity.get(v) || 0) + 1);
      }
    }

    this.conflicts = 0;
    this.restartThreshold = 100;

    // Main solving loop with restarts
    let maxRestarts = 1000;
    for (let restart = 0; restart < maxRestarts; restart++) {
      const result = this.dpll(new Map(), [...this.clauses.map(c => [...c])]);
      if (result !== null) {
        // Build model from assignment
        const model: Record<number, boolean> = {};
        for (let i = 1; i <= this.numVars; i++) {
          model[i] = result.get(i) ?? true;
        }
        return { satisfiable: true, model };
      }

      // Check if we should restart
      if (this.conflicts < this.restartThreshold) {
        // No restart needed, we've exhausted the search
        return { satisfiable: false };
      }

      // Reset for restart
      this.restartThreshold = Math.floor(this.restartThreshold * this.restartMultiplier);
      this.conflicts = 0;

      // Decay activities
      for (const [v, act] of this.activity) {
        this.activity.set(v, act * this.decayFactor);
      }
    }

    return { satisfiable: false };
  }

  private parse(cnf: string): void {
    this.clauses = [];
    this.numVars = 0;

    const lines = cnf.split('\n');
    let currentClause: Literal[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('c')) {
        continue;
      }

      // Parse problem line
      if (trimmed.startsWith('p')) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 4 && parts[1] === 'cnf') {
          this.numVars = parseInt(parts[2], 10);
        }
        continue;
      }

      // Parse clause literals
      const tokens = trimmed.split(/\s+/);
      for (const token of tokens) {
        if (!token) continue;
        const lit = parseInt(token, 10);
        if (isNaN(lit)) continue;

        if (lit === 0) {
          // End of clause
          if (currentClause.length > 0) {
            // Remove duplicates and tautologies
            const clause = this.simplifyClause(currentClause);
            if (clause !== null) {
              this.clauses.push(clause);
            }
          }
          currentClause = [];
        } else {
          currentClause.push(lit);
        }
      }
    }

    // Handle case where last clause doesn't end with 0
    if (currentClause.length > 0) {
      const clause = this.simplifyClause(currentClause);
      if (clause !== null) {
        this.clauses.push(clause);
      }
    }
  }

  // Remove duplicate literals and detect tautologies
  private simplifyClause(clause: Literal[]): Clause | null {
    const lits = new Set<Literal>();
    for (const lit of clause) {
      if (lits.has(-lit)) {
        // Tautology - clause is always true
        return null;
      }
      lits.add(lit);
    }
    return [...lits];
  }

  private dpll(assignment: Assignment, clauses: Clause[]): Assignment | null {
    // Simplify with current assignment
    let simplified = this.propagate(assignment, clauses);
    if (simplified === null) {
      return null; // Conflict
    }

    let { assignment: newAssignment, clauses: newClauses } = simplified;

    // Check if all clauses are satisfied
    if (newClauses.length === 0) {
      return newAssignment;
    }

    // Check for conflicts (too many)
    this.conflicts++;
    if (this.conflicts > this.restartThreshold) {
      return null; // Trigger restart
    }

    // Choose variable to branch on
    const variable = this.chooseVariable(newAssignment, newClauses);
    if (variable === null) {
      return newAssignment; // All variables assigned
    }

    // Try both polarities
    const polarities = this.getPreferredPolarity(variable, newClauses);

    for (const polarity of polarities) {
      const branchAssignment = new Map(newAssignment);
      branchAssignment.set(variable, polarity);

      const result = this.dpll(branchAssignment, newClauses.map(c => [...c]));
      if (result !== null) {
        return result;
      }
    }

    // Both branches failed
    return null;
  }

  private propagate(
    assignment: Assignment,
    clauses: Clause[]
  ): { assignment: Assignment; clauses: Clause[] } | null {
    const newAssignment = new Map(assignment);
    let newClauses = clauses.map(c => [...c]);
    let changed = true;

    while (changed) {
      changed = false;

      // Apply current assignment to clauses
      const simplified = this.applyAssignment(newAssignment, newClauses);
      if (simplified === null) {
        return null; // Empty clause found
      }
      newClauses = simplified;

      // Unit propagation
      for (const clause of newClauses) {
        if (clause.length === 1) {
          const lit = clause[0];
          const v = Math.abs(lit);
          const val = lit > 0;

          if (newAssignment.has(v)) {
            if (newAssignment.get(v) !== val) {
              return null; // Conflict
            }
          } else {
            newAssignment.set(v, val);
            changed = true;
          }
        }
      }

      // Pure literal elimination
      const pureLiterals = this.findPureLiterals(newAssignment, newClauses);
      for (const [v, val] of pureLiterals) {
        if (!newAssignment.has(v)) {
          newAssignment.set(v, val);
          changed = true;
        }
      }
    }

    // Final simplification
    const finalClauses = this.applyAssignment(newAssignment, newClauses);
    if (finalClauses === null) {
      return null;
    }

    return { assignment: newAssignment, clauses: finalClauses };
  }

  private applyAssignment(assignment: Assignment, clauses: Clause[]): Clause[] | null {
    const result: Clause[] = [];

    for (const clause of clauses) {
      let satisfied = false;
      const newClause: Literal[] = [];

      for (const lit of clause) {
        const v = Math.abs(lit);
        const isPositive = lit > 0;

        if (assignment.has(v)) {
          const val = assignment.get(v)!;
          if ((isPositive && val) || (!isPositive && !val)) {
            // Literal is true, clause is satisfied
            satisfied = true;
            break;
          }
          // Literal is false, remove from clause
        } else {
          newClause.push(lit);
        }
      }

      if (!satisfied) {
        if (newClause.length === 0) {
          return null; // Empty clause - unsatisfiable
        }
        result.push(newClause);
      }
    }

    return result;
  }

  private findPureLiterals(assignment: Assignment, clauses: Clause[]): Map<number, boolean> {
    const positive = new Set<number>();
    const negative = new Set<number>();

    for (const clause of clauses) {
      for (const lit of clause) {
        const v = Math.abs(lit);
        if (assignment.has(v)) continue;

        if (lit > 0) {
          positive.add(v);
        } else {
          negative.add(v);
        }
      }
    }

    const pure = new Map<number, boolean>();

    for (const v of positive) {
      if (!negative.has(v)) {
        pure.set(v, true);
      }
    }

    for (const v of negative) {
      if (!positive.has(v)) {
        pure.set(v, false);
      }
    }

    return pure;
  }

  private chooseVariable(assignment: Assignment, clauses: Clause[]): number | null {
    let bestVar: number | null = null;
    let bestScore = -1;

    // Find unassigned variables in the clauses
    const unassigned = new Set<number>();
    for (const clause of clauses) {
      for (const lit of clause) {
        const v = Math.abs(lit);
        if (!assignment.has(v)) {
          unassigned.add(v);
        }
      }
    }

    for (const v of unassigned) {
      const score = this.activity.get(v) || 0;
      if (score > bestScore) {
        bestScore = score;
        bestVar = v;
      }
    }

    return bestVar;
  }

  private getPreferredPolarity(variable: number, clauses: Clause[]): [boolean, boolean] {
    // Count occurrences of positive and negative literals
    let posCount = 0;
    let negCount = 0;

    for (const clause of clauses) {
      for (const lit of clause) {
        if (Math.abs(lit) === variable) {
          if (lit > 0) {
            posCount++;
          } else {
            negCount++;
          }
        }
      }
    }

    // Prefer the polarity that satisfies more clauses
    if (posCount >= negCount) {
      return [true, false];
    } else {
      return [false, true];
    }
  }
}

// Export default instance for convenience
export default SATSolver;
