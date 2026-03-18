// Global Hono context variable declarations.
// Applied to the entire server compilation via tsconfig.server.json include.
// Makes this file a module so the declaration below augments (extends)
// the existing 'hono' module instead of replacing it.
export {};

declare module 'hono' {
  interface ContextVariableMap {
    userId: number;
    userRole: string;
    sessionId: string;
  }
}
