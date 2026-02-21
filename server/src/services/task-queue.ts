import { JsonStore } from '../data/store.js';
import type { Task, AgentRoleName } from '../models/types.js';
import { generateId } from '../utils/crypto.js';
import { appendAudit } from './audit-log.js';
import { messageBus } from './message-bus.js';

const store = new JsonStore<Task>('tasks.json');

export interface CreateTaskInput {
  title: string;
  description: string;
  role: AgentRoleName;
  scopedPaths?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';
  estimatedLines?: number;
  parentTaskId?: string;
}

export function createTask(input: CreateTaskInput, createdBy: string): Task {
  const task: Task = {
    id: generateId('task'),
    title: input.title,
    description: input.description,
    role: input.role,
    scopedPaths: input.scopedPaths ?? [],
    priority: input.priority ?? 'medium',
    status: 'open',
    claimedBy: null,
    proposalId: null,
    parentTaskId: input.parentTaskId ?? null,
    estimatedLines: input.estimatedLines ?? 100,
    createdBy,
    createdAt: new Date().toISOString(),
    claimedAt: null,
    completedAt: null,
  };

  store.append(task);
  appendAudit(createdBy, 'task_created', task.id, { title: task.title, role: task.role });

  messageBus.send('system', 'broadcast', 'system', {
    event: 'task_created',
    taskId: task.id,
    title: task.title,
    role: task.role,
    priority: task.priority,
  });

  return task;
}

export function getTasks(filter?: {
  role?: string;
  status?: string;
  priority?: string;
  claimedBy?: string;
}): Task[] {
  let tasks = store.readAll();
  if (filter?.role) tasks = tasks.filter(t => t.role === filter.role);
  if (filter?.status) tasks = tasks.filter(t => t.status === filter.status);
  if (filter?.priority) tasks = tasks.filter(t => t.priority === filter.priority);
  if (filter?.claimedBy) tasks = tasks.filter(t => t.claimedBy === filter.claimedBy);
  return tasks;
}

export function getTask(id: string): Task | undefined {
  return store.findById(id);
}

export function claimTask(taskId: string, agentId: string, agentRole: AgentRoleName | null): { task: Task | null; error?: string } {
  const task = store.findById(taskId);
  if (!task) return { task: null, error: 'Task not found' };
  if (task.status !== 'open') return { task: null, error: `Task is ${task.status}, not open` };
  if (!agentRole) return { task: null, error: 'Agent has no role assigned' };
  if (task.role !== agentRole) return { task: null, error: `Task requires ${task.role} role, you are ${agentRole}` };

  const updated = store.update(taskId, {
    status: 'claimed',
    claimedBy: agentId,
    claimedAt: new Date().toISOString(),
  } as Partial<Task>);

  if (updated) {
    appendAudit(agentId, 'task_claimed', taskId, { title: task.title });
    messageBus.send('system', 'broadcast', 'system', {
      event: 'task_claimed',
      taskId,
      agentId,
    });
  }

  return { task: updated };
}

export function updateTaskStatus(taskId: string, agentId: string, status: Task['status'], proposalId?: string): { task: Task | null; error?: string } {
  const task = store.findById(taskId);
  if (!task) return { task: null, error: 'Task not found' };
  if (task.claimedBy !== agentId) return { task: null, error: 'You do not own this task' };

  const updates: Partial<Task> = { status };
  if (status === 'completed') {
    updates.completedAt = new Date().toISOString();
    if (proposalId) updates.proposalId = proposalId;
  }

  const updated = store.update(taskId, updates as Partial<Task>);

  if (updated) {
    appendAudit(agentId, `task_${status}`, taskId, { proposalId });
    if (status === 'completed') {
      messageBus.send('system', 'broadcast', 'system', {
        event: 'task_completed',
        taskId,
        agentId,
      });
    }
  }

  return { task: updated };
}
