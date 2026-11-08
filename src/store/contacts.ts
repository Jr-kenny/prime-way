// Contacts live on the device only. Seeded once with the people from
// the prototype; the user can add, edit and remove them. A contact
// without an address cannot be sent to until one is added.

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Contact {
  id: string;
  name: string;
  network: string;
  address: `0x${string}` | null;
  color: string;
}

const KEY = 'primeway.contacts.v1';

const SEED: Contact[] = [
  { id: 'sarah', name: 'Sarah', network: 'Base', address: null, color: '#2E6BE6' },
  { id: 'mum', name: 'Mum', network: 'Polygon', address: null, color: '#8B5CF6' },
  { id: 'james', name: 'James', network: 'Arbitrum', address: null, color: '#3E7CB1' },
  { id: 'emma', name: 'Emma', network: 'Base', address: null, color: '#D9577B' },
  { id: 'daniel', name: 'Daniel', network: 'Base', address: null, color: '#7A5AF5' },
];

let cache: Contact[] | null = null;

export async function loadContacts(): Promise<Contact[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      cache = JSON.parse(raw) as Contact[];
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
