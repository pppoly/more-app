/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars */
export interface PromptDefinition {
  id: string;
  name: string;
  description?: string;
  version?: string;
  system: string;
  instructions?: string;
  params?: string[];
  tags?: string[];
  meta?: Record<string, any>;
  status?: string;
  approvedById?: string | null;
  approvedAt?: string | null;
}

export interface PromptAuditLog {
  id: string;
  promptId: string;
  version?: string;
  action: 'create' | 'update' | 'delete';
  actorId?: string;
  notes?: string;
  createdAt: Date;
}
