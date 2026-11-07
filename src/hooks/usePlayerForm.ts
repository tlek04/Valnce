import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Player, RankRating, WeaponRestriction } from '../types';
import { useAppStore } from '../store/useAppStore';
import { RESTRICTION_OPTIONS, restrictionKey, sameRating } from '../constants/valorant';
import { DEFAULT_RATING } from '../constants/game';
import { cloneRating, isRatingAtLeast } from '../utils/rating';
import { formatRiotId, parseRiotId } from '../utils/matchStats';

interface PlayerFormOptions {
  open: boolean;
  player: Player | null;
  onClose: () => void;
  onNotice?: (message: string) => void;
}

export function usePlayerForm({ open, player, onClose, onNotice }: PlayerFormOptions) {
  const players = useAppStore((state) => state.players);
  const boardPlayers = useAppStore((state) => [...state.waitlist, ...state.team1, ...state.team2]);
  const addPlayer = useAppStore((state) => state.addPlayer);
  const updatePlayer = useAppStore((state) => state.updatePlayer);
  const formRef = useRef<HTMLFormElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [name, setName] = useState(player?.name ?? '');
  const [riotId, setRiotId] = useState(formatRiotId(player?.riotName, player?.riotTag));
  const [currentTier, setCurrentTier] = useState<RankRating>(player?.currentTier ?? DEFAULT_RATING);
  const [maxTier, setMaxTier] = useState<RankRating>(player?.maxTier ?? player?.currentTier ?? DEFAULT_RATING);
  const [internalTier, setInternalTier] = useState<RankRating | null>(player?.internalTier ?? null);
  const [restrictions, setRestrictions] = useState<WeaponRestriction[]>(player?.restrictions ?? []);
  const [canOrder, setCanOrder] = useState(player?.canOrder ?? false);
  const [lockedTeam, setLockedTeam] = useState<Player['lockedTeam']>(player?.lockedTeam ?? null);
  const [rivalIds, setRivalIds] = useState<string[]>(player?.rivalIds ?? []);
  const [allyIds, setAllyIds] = useState<string[]>(player?.allyIds ?? []);
  const [weaponPanelOpen, setWeaponPanelOpen] = useState(false);

  useEffect(() => {
    if (!isRatingAtLeast(maxTier, currentTier)) setMaxTier(cloneRating(currentTier));
  }, [currentTier, maxTier]);

  useEffect(() => {
    if (!open) return;
    const saved = player ? useAppStore.getState().players.find((item) => item.id === player.id) : null;
    const source = player ?? saved;
    setName(source?.name ?? '');
    setRiotId(formatRiotId(source?.riotName, source?.riotTag));
    setCurrentTier(source?.currentTier ?? DEFAULT_RATING);
    setMaxTier(player?.maxTier ?? source?.currentTier ?? DEFAULT_RATING);
    setInternalTier(player?.internalTier ?? null);
    setRestrictions(player?.restrictions ?? []);
    setCanOrder(player?.canOrder ?? false);
    setLockedTeam(player?.lockedTeam ?? null);
    setRivalIds(player?.rivalIds ?? []);
    setAllyIds(player?.allyIds ?? []);
    setWeaponPanelOpen(false);
  }, [open, player]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
      previousFocus.current?.focus();
    };
  }, [open]);

  const trimmedName = name.trim();
  const isDuplicate = useMemo(
    () =>
      players.some(
        (item) => item.id !== player?.id && item.name.trim().toLowerCase() === trimmedName.toLowerCase()
      ),
    [players, player?.id, trimmedName]
  );

  const otherPlayers = boardPlayers.filter((item) => item.id !== player?.id);
  const selectedKeys = new Set(restrictions.map(restrictionKey));
  const restrictionGroups = useMemo(() => {
    const groups: { name: string; options: typeof RESTRICTION_OPTIONS }[] = [];
    for (const option of RESTRICTION_OPTIONS) {
      const last = groups[groups.length - 1];
      if (last && last.name === option.group) last.options.push(option);
      else groups.push({ name: option.group, options: [option] });
    }
    return groups;
  }, []);

  const toggleRestriction = (value: string) => {
    const option = RESTRICTION_OPTIONS.find((item) => item.value === value);
    if (!option) return;
    setRestrictions((current) => {
      const key = restrictionKey({
        id: '',
        type: option.type,
        weaponId: option.weaponId,
      });
      const existing = current.find((item) => restrictionKey(item) === key);
      if (existing) return current.filter((item) => item.id !== existing.id);
      return [
        ...current,
        {
          id: crypto.randomUUID(),
          type: option.type,
          weaponId: option.weaponId,
        },
      ];
    });
  };

  const addLink = (kind: 'rival' | 'ally', id: string) => {
    if (!id) return;
    if (kind === 'rival') {
      setRivalIds((current) => (current.includes(id) ? current : [...current, id]));
      setAllyIds((current) => current.filter((item) => item !== id));
    } else {
      setAllyIds((current) => (current.includes(id) ? current : [...current, id]));
      setRivalIds((current) => current.filter((item) => item !== id));
    }
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !formRef.current) return;
    const focusable = [...formRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((item) => !item.hasAttribute('disabled') && item.getAttribute('aria-hidden') !== 'true');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmedName) return;
    const trimmedRiotId = riotId.trim();
    const parsed = parseRiotId(trimmedRiotId);
    if (trimmedRiotId && (!parsed.riotName || !parsed.riotTag)) {
      onNotice?.('발로란트 닉네임#태그 형식으로 입력하거나 비워 두세요.');
      return;
    }
    const saved = player ? useAppStore.getState().players.find((item) => item.id === player.id) : null;
    const payload: Player = {
      id: player?.id ?? crypto.randomUUID(),
      name: trimmedName,
      currentTier: cloneRating(currentTier),
      maxTier: cloneRating(isRatingAtLeast(maxTier, currentTier) ? maxTier : currentTier),
      internalTier:
        internalTier && !sameRating(internalTier, currentTier) ? cloneRating(internalTier) : undefined,
      canOrder,
      restrictions,
      lockedTeam,
      rivalIds,
      allyIds,
      riotName: parsed.riotName || undefined,
      riotTag: parsed.riotTag || undefined,
      wins: player?.wins ?? saved?.wins ?? 0,
      losses: player?.losses ?? saved?.losses ?? 0,
      streak: player?.streak ?? saved?.streak ?? 0,
    };
    const message = player ? updatePlayer(player.id, payload) : addPlayer(payload);
    if (message) onNotice?.(message);
    onClose();
  };

  return {
    formRef, name,
    setName, riotId,
    setRiotId, currentTier,
    setCurrentTier, maxTier,
    setMaxTier, internalTier,
    setInternalTier, restrictions,
    setRestrictions, canOrder,
    setCanOrder, lockedTeam,
    setLockedTeam, rivalIds,
    setRivalIds, allyIds,
    setAllyIds, weaponPanelOpen,
    setWeaponPanelOpen, trimmedName,
    isDuplicate, otherPlayers,
    selectedKeys, restrictionGroups,
    toggleRestriction, addLink,
    handleDialogKeyDown, handleSubmit
  };
}
