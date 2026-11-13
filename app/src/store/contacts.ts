// Contacts live on the device only. No seeded people: the list
// starts empty and only holds people the user adds. A contact
// without an address cannot be sent to until one is added.
//
// One entry per person, usable anywhere: a person has a name and an
// address, nothing else. There is no per-person place their money
// lives; the app picks the route. Records saved before this change
// carried a `network` field; loading drops it and keeps the address.
// The five prototype people seeded by older versions are dropped on
// load when they still have no address; one the user gave an address
// to is kept.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ZERO_ADDRESS } from '../lib/chains';

export interface Contact {
  id: string;
  name: string;
  address: `0x${string}` | null;
  color: string;
}

const KEY = 'primeway.contacts.v1';

/** Ids of the prototype people older versions seeded. */
const SEEDED_IDS = new Set(['sarah', 'mum', 'james', 'emma', 'daniel']);

let cache: Contact[] | null = null;

/** Drop the old per-person `network` field from a stored record,
 *  keeping the name, address and colour. Unknown shapes are skipped
 *  rather than crashing the list. A stored zero address is dropped
 *  too: money sent there is unrecoverable, so it is never a contact
 *  address. */
function migrate(raw: unknown): Contact[] {
  if (!Array.isArray(raw)) return [];
  const out: Contact[] = [];
  for (const row of raw as Record<string, unknown>[]) {
    if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') continue;
    const address =
      typeof row.address === 'string' &&
      row.address.startsWith('0x') &&
      row.address.toLowerCase() !== ZERO_ADDRESS
        ? (row.address as `0x${string}`)
        : null;
    // A seeded prototype person with no address was never real.
    if (SEEDED_IDS.has(row.id) && !address) continue;
    out.push({
      id: row.id,
      name: row.name,
      address,
      color: typeof row.color === 'string' ? row.color : '#2E6BE6',
    });
  }
  return out;
}

export async function loadContacts(): Promise<Contact[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      cache = migrate(JSON.parse(raw));
      return cache;
    }
  } catch {
    // fall through to empty
  }
  cache = [];
  await AsyncStorage.setItem(KEY, JSON.stringify([]));
  return cache;
}

async function save(list: Contact[]): Promise<void> {
  cache = list;
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

export async function addContact(
  c: Omit<Contact, 'id'>,
): Promise<Contact> {
  const list = await loadContacts();
  const contact: Contact = {
    ...c,
    id: `c${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`,
  };
  await save([...list, contact]);
  return contact;
}

export async function updateContact(
  id: string,
  patch: Partial<Contact>,
): Promise<void> {
  const list = await loadContacts();
  await save(list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
}

export async function removeContact(id: string): Promise<void> {
  const list = await loadContacts();
  await save(list.filter((c) => c.id !== id));
}
