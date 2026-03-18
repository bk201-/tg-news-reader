// Global Hono context variable declarations.
// Applied to the entire server compilation via tsconfig.server.json include.
declare module 'hono' {
  interface ContextVariableMap {
    userId: number;
    userRole: string;
    sessionId: string;
  }
}

