const STORAGE_KEY = 'valnce-join-profile';
const SESSION_KEY = 'valnce-join-session';

export interface JoinProfile {
  name: string;
  riotName: string;
  riotTag: string;
}

export interface JoinSession {
  id: string;
  queueNo: number;
  name: string;
  autoJoined: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'joined' | 'cancelled';
}

export function loadJoinProfile(): JoinProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { name: '', riotName: '', riotTag: '' };
    const parsed = JSON.parse(raw) as Partial<JoinProfile>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      riotName: typeof parsed.riotName === 'string' ? parsed.riotName : '',
      riotTag: typeof parsed.riotTag === 'string' ? parsed.riotTag.replace(/^#+/, '') : '',
    };
  } catch {
    return { name: '', riotName: '', riotTag: '' };
  }
}

export function saveJoinProfile(profile: JoinProfile): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        name: profile.name.trim(),
        riotName: profile.riotName.trim(),
        riotTag: profile.riotTag.trim().replace(/^#+/, ''),
      })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadJoinSession(): JoinSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<JoinSession>;
    if (typeof parsed.id !== 'string' || !parsed.id) return null;
    const status = parsed.status;
    if (
      status !== 'pending' &&
      status !== 'approved' &&
      status !== 'rejected' &&
      status !== 'joined' &&
      status !== 'cancelled'
    ) {
      return null;
    }
    return {
      id: parsed.id,
      queueNo: typeof parsed.queueNo === 'number' ? parsed.queueNo : 0,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      autoJoined: Boolean(parsed.autoJoined),
      status,
    };
  } catch {
    return null;
  }
}

export function saveJoinSession(session: JoinSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function clearJoinSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
