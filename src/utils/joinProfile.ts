const STORAGE_KEY = 'valnce-join-profile';

export interface JoinProfile {
  name: string;
  riotName: string;
  riotTag: string;
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
