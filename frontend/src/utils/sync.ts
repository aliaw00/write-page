// Sync API integration for Minimal Write Ecosystem

export interface Document {
  id: string;
  title: string;
  content: string;
  updated_at: number;
  created_at: number;
  is_deleted: boolean;
  share_id?: string;
}

export interface SyncResponse {
  updates: Document[];
  server_time: number;
}

// In development, target localhost:8080. In production, assume same origin.
const API_BASE = import.meta.env.DEV ? 'http://localhost:8080/api' : '/api';

export async function signupAPI(username: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to sign up');
  }
  return res.json(); // returns { token, user: { id, username } }
}

export async function loginAPI(username: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to log in');
  }
  return res.json(); // returns { token, user: { id, username } }
}

export async function syncAPI(token: string, documents: Document[], lastSyncTime: number): Promise<SyncResponse> {
  const res = await fetch(`${API_BASE}/sync?last_sync_time=${lastSyncTime}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ documents }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Sync failed');
  }
  return res.json();
}

export async function toggleShareAPI(token: string, documentId: string, share: boolean): Promise<string> {
  const res = await fetch(`${API_BASE}/share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ document_id: documentId, share }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to toggle share');
  }
  const data = await res.json();
  return data.share_id;
}

export async function getSharedDocumentAPI(shareId: string): Promise<Document> {
  const res = await fetch(`${API_BASE}/shared?share_id=${shareId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Shared document not found');
  }
  return res.json();
}
