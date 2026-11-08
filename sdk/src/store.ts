// The decision store: the record that makes one decision mean one send.
//
// Every executed send is written here under its decision key, with the
// receipt, before the send is watched to completion. A retry with the
// same key reads the stored receipt back instead of sending again.
// The store also holds decisions waiting for human approval, and the
// amounts spent each day for the daily limit.
//
// Two implementations ship: an in-memory store (tests, short-lived
// scripts) and a JSON file store (the default for real use — it
// survives restarts, which is exactly when a duplicate send is most
// likely). Writes go through a temp file plus rename, so a crash
// mid-write never leaves a half-written file.

import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Receipt {
  decisionKey: string;
  requestId: string;
  approveTx?: string;
  depositTx: string;
  status: string;
  txHashes: string[];
  usdAmount: number;
  recipient: string;
  originChainId: number;
  destinationChainId: number;
  createdAt: string;
  updatedAt: string;
}

/** A decision that needs a human before it may send. */
export interface PendingDecision {
  decisionKey: string;
  usdAmount: number;
  recipient: string;
  originChainId: number;
  destinationChainId: number;
  reason: 'over-per-send-limit' | 'over-daily-limit';
  limitUsd: number;
  spentTodayUsd: number;
  createdAt: string;
}

export interface DecisionRecord {
  key: string;
  receipt?: Receipt;
  pending?: PendingDecision;
}

export interface DecisionStore {
  get(key: string): Promise<DecisionRecord | undefined>;
  put(record: DecisionRecord): Promise<void>;
  list(): Promise<DecisionRecord[]>;
}

export class MemoryDecisionStore implements DecisionStore {
  private records = new Map<string, DecisionRecord>();

  async get(key: string): Promise<DecisionRecord | undefined> {
    return this.records.get(key);
  }

  async put(record: DecisionRecord): Promise<void> {
    this.records.set(record.key, record);
  }

  async list(): Promise<DecisionRecord[]> {
    return [...this.records.values()];
  }
}

export function defaultStorePath(): string {
  if (process.env.PRIMEWAY_STORE_PATH) return process.env.PRIMEWAY_STORE_PATH;
  return join(homedir(), '.prime-way', 'decisions.json');
}

export class FileDecisionStore implements DecisionStore {
  private cache: Map<string, DecisionRecord> | null = null;

  constructor(private readonly path: string = defaultStorePath()) {}

  private async load(): Promise<Map<string, DecisionRecord>> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw) as { records?: DecisionRecord[] };
      const map = new Map<string, DecisionRecord>();
      for (const r of parsed.records ?? []) map.set(r.key, r);
      this.cache = map;
      return map;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cache = new Map();
        return this.cache;
      }
      throw err;
    }
  }

  private async save(): Promise<void> {
    const map = this.cache ?? new Map<string, DecisionRecord>();
    const data = JSON.stringify(
      { records: [...map.values()] },
      null,
      2,
    );
    await fs.mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    await fs.writeFile(tmp, data, 'utf8');
    await fs.rename(tmp, this.path);
  }

  async get(key: string): Promise<DecisionRecord | undefined> {
    return (await this.load()).get(key);
  }

  async put(record: DecisionRecord): Promise<void> {
    const map = await this.load();
    map.set(record.key, record);
    await this.save();
  }

  async list(): Promise<DecisionRecord[]> {
    return [...(await this.load()).values()];
  }
}
