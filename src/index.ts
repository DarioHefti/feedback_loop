/**
 * Feedback Loop - Minimal agent harness with objective feedback
 * 
 * Inspired by https://github.com/karpathy/autoresearch
 * 
 * Usage:
 * 1. Define your task in a markdown file
 * 2. Implement an Evaluator for your specific use case
 * 3. Optionally implement a ContextProvider for custom context
 * 4. Run the loop!
 */

export * from "./interfaces/index.js"
export * from "./implementations/index.js"
export * from "./memory.js"
export * from "./loop.js"
export * from "./prompts.js"
export * from "./logger.js"
