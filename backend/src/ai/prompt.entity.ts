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
