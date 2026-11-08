// Contacts live on the device only. Seeded once with the people from
// the prototype; the user can add, edit and remove them. A contact
// without an address cannot be sent to until one is added.
//
// One entry per person, usable anywhere: a person has a name and an
// address, nothing else. There is no per-person place their money
// lives; the app picks the route. Records saved before this change
// carried a `network` field; loading drops it and keeps the address.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ZERO_ADDRESS } from '../lib/chains';

export interface Contact {
  id: string;
  name: string;
  address: `0x${string}` | null;
  color: string;
}

const KEY = 'primeway.contacts.v1';

const SEED: Contact[] = [
  { id: 'sarah', name: 'Sarah', address: null, color: '#2E6BE6' },
  { id: 'mum', name: 'Mum', address: null, color: '#8B5CF6' },
  { id: 'james', name: 'James', address: null, color: '#3E7CB1' },
  { id: 'emma', name: 'Emma', address: null, color: '#D9577B' },
  { id: 'daniel', name: 'Daniel', address: null, color: '#7A5AF5' },
];

let cache: Contact[] | null = null;

/** Drop the old per-person `network` field from a stored record,
 *  keeping the name, address and colour. Unknown shapes are skipped
 *  rather than crashing the list. A stored zero address is dropped
 *  too: money sent there is unrecoverable, so it is never a contact
 *  address. */
function migrate(raw: unknown): Contact[] {
  if (!Array.isArray(raw)) return SEED;
  const out: Contact[] = [];
  for (const row of raw as Record<string, unknown>[]) {
    if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') continue;
    out.push({
      id: row.id,
      name: row.name,
      address:
        typeof row.address === 'string' &&
        row.address.startsWith('0x') &&
        row.address.toLowerCase() !== ZERO_ADDRESS
          ? (row.address as `0x${string}`)
          : null,
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
    // fall through to seed
  }
  cache = SEED;
  await AsyncStorage.setItem(KEY, JSON.stringify(SEED));
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
