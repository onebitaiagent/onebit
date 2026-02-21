import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const locks = new Map<string, boolean>();

export class JsonStore<T extends { id?: string; entry_id?: string }> {
  private filePath: string;

  constructor(filename: string) {
    this.filePath = join(__dirname, filename);
    if (!existsSync(this.filePath)) {
      writeFileSync(this.filePath, '[]', 'utf-8');
    }
  }

  private acquireLock(): void {
    while (locks.get(this.filePath)) {
      // Spin — fine for single-process file-based MVP
    }
    locks.set(this.filePath, true);
  }

  private releaseLock(): void {
    locks.set(this.filePath, false);
  }

  readAll(): T[] {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  writeAll(data: T[]): void {
    this.acquireLock();
    try {
      writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } finally {
      this.releaseLock();
    }
  }

  append(item: T): T {
    const data = this.readAll();
    data.push(item);
    this.writeAll(data);
    return item;
  }

  findById(id: string): T | undefined {
    const data = this.readAll();
    return data.find(item => (item.id ?? item.entry_id) === id);
  }

  findAll(filter?: Partial<Record<string, unknown>>): T[] {
    const data = this.readAll();
    if (!filter) return data;
    return data.filter(item => {
      for (const [key, value] of Object.entries(filter)) {
        if ((item as Record<string, unknown>)[key] !== value) return false;
      }
      return true;
    });
  }

  update(id: string, updates: Partial<T>): T | null {
    const data = this.readAll();
    const index = data.findIndex(item => (item.id ?? item.entry_id) === id);
    if (index === -1) return null;
    data[index] = { ...data[index], ...updates };
    this.writeAll(data);
    return data[index];
  }

  count(filter?: Partial<Record<string, unknown>>): number {
    return this.findAll(filter).length;
  }
}
