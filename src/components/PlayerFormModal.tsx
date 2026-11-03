import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { Player, RankRating, WeaponRestriction } from '../types';
import { useAppStore } from '../store/useAppStore';
import {
  RANK_OPTIONS,
  RESTRICTION_OPTIONS,
  formatRating,
  getRestrictionLabel,
  parseRatingKey,
  ratingKey,
  restrictionKey,
  sameRating,
} from '../constants/valorant';
import { formatStreak } from '../utils/matchStats';
import { cloneRating, isRatingAtLeast } from '../utils/rating';
import SearchSelect from './SearchSelect';
import ChipList from './ChipList';

interface PlayerFormModalProps {
  open: boolean;
  player: Player | null;
  onClose: () => void;
  onNotice?: (message: string) => void;
}

const DEFAULT_RATING: RankRating = { tier: 'Gold', division: 2 };

function submitLabel(player: Player | null, lockedTeam: Player['lockedTeam']) {
  if (player) return '수정 저장';
  if (lockedTeam === 'TEAM_1') return '1팀에 추가';
  if (lockedTeam === 'TEAM_2') return '2팀에 추가';
  return '대기열에 추가';
}

function StatStepper({
  label,
  value,
  onAdjust,
}: {
  label: string;
  value: number;
  onAdjust: (delta: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 text-sm text-val-muted">{label}</span>
      <button
        type="button"
        aria-label={`${label} 감소`}
        disabled={value <= 0}
        onClick={() => onAdjust(-1)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-val-line bg-val-bg text-val-cream hover:border-val-red/50 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Minus size={14} />
      </button>
      <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums text-val-cream">{value}</span>
      <button
        type="button"
        aria-label={`${label} 증가`}
        onClick={() => onAdjust(1)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-val-line bg-val-bg text-val-cream hover:border-val-red/50"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

export default function PlayerFormModal({ open, player, onClose, onNotice }: PlayerFormModalProps) {
  const players = useAppStore((state) => state.players);
  const boardPlayers = useAppStore((state) => [...state.waitlist, ...state.team1, ...state.team2]);
  const addPlayer = useAppStore((state) => state.addPlayer);
  const updatePlayer = useAppStore((state) => state.updatePlayer);
  const adjustPlayerRecord = useAppStore((state) => state.adjustPlayerRecord);
  const formRef = useRef<HTMLFormElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [name, setName] = useState(player?.name ?? '');
  const [riotName, setRiotName] = useState(player?.riotName ?? '');
  const [riotTag, setRiotTag] = useState(player?.riotTag ?? '');
  const [currentTier, setCurrentTier] = useState<RankRating>(player?.currentTier ?? DEFAULT_RATING);
  const [maxTier, setMaxTier] = useState<RankRating>(player?.maxTier ?? player?.currentTier ?? DEFAULT_RATING);
  const [internalTier, setInternalTier] = useState<RankRating | null>(player?.internalTier ?? null);
  const [restrictions, setRestrictions] = useState<WeaponRestriction[]>(player?.restrictions ?? []);
  const [canOrder, setCanOrder] = useState(player?.canOrder ?? false);
  const [lockedTeam, setLockedTeam] = useState<Player['lockedTeam']>(player?.lockedTeam ?? null);
  const [rivalIds, setRivalIds] = useState<string[]>(player?.rivalIds ?? []);
  const [allyIds, setAllyIds] = useState<string[]>(player?.allyIds ?? []);
  const [wins, setWins] = useState(player?.wins ?? 0);
  const [losses, setLosses] = useState(player?.losses ?? 0);
  const [streak, setStreak] = useState(player?.streak ?? 0);

  useEffect(() => {
    if (!isRatingAtLeast(maxTier, currentTier)) setMaxTier(cloneRating(currentTier));
  }, [currentTier, maxTier]);

  useEffect(() => {
    if (!open) return;
    const saved = player ? useAppStore.getState().players.find((item) => item.id === player.id) : null;
    const source = player ?? saved;
    setName(source?.name ?? '');
    setRiotName(source?.riotName ?? '');
    setRiotTag(source?.riotTag ?? '');
    setCurrentTier(source?.currentTier ?? DEFAULT_RATING);
    setMaxTier(player?.maxTier ?? source?.currentTier ?? DEFAULT_RATING);
    setInternalTier(player?.internalTier ?? null);
    setRestrictions(player?.restrictions ?? []);
    setCanOrder(player?.canOrder ?? false);
    setLockedTeam(player?.lockedTeam ?? null);
    setRivalIds(player?.rivalIds ?? []);
    setAllyIds(player?.allyIds ?? []);
    setWins(source?.wins ?? 0);
    setLosses(source?.losses ?? 0);
    setStreak(source?.streak ?? 0);
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
  const weaponOptions = RESTRICTION_OPTIONS.filter((option) => !selectedKeys.has(option.value)).map(
    (option) => ({
      value: option.value,
      label: option.label,
      searchText: option.searchText,
      group: option.group,
    })
  );

  const addRestrictionByValue = (value: string) => {
    const option = RESTRICTION_OPTIONS.find((item) => item.value === value);
    if (!option || selectedKeys.has(option.value)) return;
    setRestrictions((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type: option.type,
        weaponId: option.weaponId,
      },
    ]);
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

  const syncRecordFromStore = (id: string) => {
    const next =
      useAppStore.getState().players.find((item) => item.id === id) ??
      [...useAppStore.getState().waitlist, ...useAppStore.getState().team1, ...useAppStore.getState().team2].find(
        (item) => item.id === id
      );
    if (!next) return;
    setWins(next.wins);
    setLosses(next.losses);
    setStreak(next.streak);
  };

  const handleRecordAdjust = (field: 'wins' | 'losses', delta: number) => {
    if (!player) {
      if (field === 'wins') {
        setWins((value) => Math.max(0, value + delta));
      } else {
        setLosses((value) => Math.max(0, value + delta));
      }
      setStreak(0);
      return;
    }
    adjustPlayerRecord(player.id, field, delta);
    syncRecordFromStore(player.id);
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

  if (!open) return null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmedName) return;
    const trimmedRiotName = riotName.trim();
    const trimmedRiotTag = riotTag.trim();
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
      riotName: trimmedRiotName || undefined,
      riotTag: trimmedRiotTag || undefined,
      wins,
      losses,
      streak,
    };
    const message = player ? updatePlayer(player.id, payload) : addPlayer(payload);
    if (message) onNotice?.(message);
    onClose();
  };

  const toggleBtn = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-sm transition-colors ${
      active
        ? 'border-val-red bg-val-red/15 text-val-cream'
        : 'border-val-line bg-val-bg text-val-muted hover:border-val-red/40'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <button type="button" aria-label="모달 닫기" className="absolute inset-0" onClick={onClose} />
      <form
        ref={formRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-form-title"
        onSubmit={handleSubmit}
        onKeyDown={handleDialogKeyDown}
        className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-val-line bg-val-panel p-4 shadow-2xl sm:rounded-2xl sm:p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="player-form-title" className="font-display text-xl font-bold text-val-cream">
            {player ? '플레이어 수정' : '플레이어 등록'}
          </h2>
          <button
            type="button"
            aria-label="닫기"
            className="rounded-md p-1.5 text-val-muted hover:bg-white/5 hover:text-val-cream"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="player-name" className="mb-1 block text-xs text-val-muted">
              닉네임
            </label>
            <input
              id="player-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 은후"
              className="w-full rounded-lg border border-val-line bg-val-bg px-3 py-2 text-val-cream outline-none ring-val-red/40 placeholder:text-val-muted/60 focus:border-val-red/60 focus:ring-2"
            />
            {isDuplicate && (
              <p className="mt-1 text-xs text-val-warn">같은 닉네임이 이미 등록되어 있습니다.</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_6.5rem]">
            <div>
              <label htmlFor="player-riot-name" className="mb-1 block text-xs text-val-muted">
                발로란트 닉
              </label>
              <input
                id="player-riot-name"
                value={riotName}
                onChange={(event) => setRiotName(event.target.value)}
                placeholder="게임 닉네임"
                className="w-full rounded-lg border border-val-line bg-val-bg px-3 py-2 text-val-cream outline-none ring-val-red/40 placeholder:text-val-muted/60 focus:border-val-red/60 focus:ring-2"
              />
            </div>
            <div>
              <label htmlFor="player-riot-tag" className="mb-1 block text-xs text-val-muted">
                태그
              </label>
              <div className="flex items-center gap-1">
                <span className="text-val-muted">#</span>
                <input
                  id="player-riot-tag"
                  value={riotTag}
                  onChange={(event) => setRiotTag(event.target.value)}
                  placeholder="KR1"
                  className="w-full rounded-lg border border-val-line bg-val-bg px-3 py-2 text-val-cream outline-none ring-val-red/40 placeholder:text-val-muted/60 focus:border-val-red/60 focus:ring-2"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-val-line bg-val-bg px-3 py-2.5">
            <StatStepper label="승" value={wins} onAdjust={(delta) => handleRecordAdjust('wins', delta)} />
            <StatStepper label="패" value={losses} onAdjust={(delta) => handleRecordAdjust('losses', delta)} />
            {formatStreak(streak) ? (
              <span className={`text-xs ${streak > 0 ? 'text-val-teal' : 'text-val-red'}`}>
                {formatStreak(streak)}
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="player-current-tier" className="mb-1 block text-xs text-val-muted">
                현재 티어
              </label>
              <SearchSelect
                id="player-current-tier"
                options={RANK_OPTIONS}
                value={ratingKey(currentTier)}
                placeholder="티어 검색"
                onSelect={(value) => setCurrentTier(parseRatingKey(value))}
              />
            </div>
            <div>
              <label htmlFor="player-max-tier" className="mb-1 block text-xs text-val-muted">
                최고 티어
              </label>
              <SearchSelect
                id="player-max-tier"
                options={RANK_OPTIONS.filter((option) =>
                  isRatingAtLeast(parseRatingKey(option.value), currentTier)
                )}
                value={ratingKey(maxTier)}
                placeholder="티어 검색"
                onSelect={(value) => setMaxTier(parseRatingKey(value))}
              />
            </div>
          </div>

          <div>
            <label htmlFor="player-internal-tier" className="mb-1 block text-xs text-val-muted">
              내전 티어{internalTier ? ` · ${formatRating(internalTier)}` : ' · 현재 티어 사용'}
            </label>
            <SearchSelect
              id="player-internal-tier"
              options={RANK_OPTIONS}
              value={internalTier ? ratingKey(internalTier) : null}
              placeholder="없으면 현재 티어"
              onSelect={(value) => setInternalTier(parseRatingKey(value))}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={canOrder}
              onClick={() => setCanOrder((value) => !value)}
              className={toggleBtn(canOrder)}
            >
              오더 {canOrder ? 'ON' : 'OFF'}
            </button>
            {(
              [
                { value: null, label: '고정 없음' },
                { value: 'TEAM_1', label: '1팀 고정' },
                { value: 'TEAM_2', label: '2팀 고정' },
              ] as const
            ).map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={lockedTeam === option.value}
                onClick={() => setLockedTeam(option.value)}
                className={toggleBtn(lockedTeam === option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="player-weapon-limit" className="mb-1 block text-xs text-val-muted">
              무기 제한
            </label>
            <SearchSelect
              id="player-weapon-limit"
              options={weaponOptions}
              placeholder="무기 검색 후 선택"
              clearOnSelect
              onSelect={addRestrictionByValue}
            />
            <ChipList
              items={restrictions.map((item) => ({ id: item.id, label: getRestrictionLabel(item) }))}
              onRemove={(id) => setRestrictions((current) => current.filter((item) => item.id !== id))}
            />
          </div>

          <div>
            <label htmlFor="player-rivals" className="mb-1 block text-xs text-val-muted">
              라이벌
            </label>
            <SearchSelect
              id="player-rivals"
              options={otherPlayers
                .filter((item) => !rivalIds.includes(item.id))
                .map((item) => ({ value: item.id, label: item.name, searchText: item.name }))}
              placeholder="닉네임 검색 후 추가"
              clearOnSelect
              onSelect={(id) => addLink('rival', id)}
            />
            <ChipList
              tone="rose"
              items={rivalIds
                .map((id) => ({ id, label: otherPlayers.find((item) => item.id === id)?.name ?? '알 수 없음' }))}
              onRemove={(id) => setRivalIds((current) => current.filter((item) => item !== id))}
            />
          </div>

          <div>
            <label htmlFor="player-allies" className="mb-1 block text-xs text-val-muted">
              같은 팀
            </label>
            <SearchSelect
              id="player-allies"
              options={otherPlayers
                .filter((item) => !allyIds.includes(item.id))
                .map((item) => ({ value: item.id, label: item.name, searchText: item.name }))}
              placeholder="닉네임 검색 후 추가"
              clearOnSelect
              onSelect={(id) => addLink('ally', id)}
            />
            <ChipList
              tone="sky"
              items={allyIds
                .map((id) => ({ id, label: otherPlayers.find((item) => item.id === id)?.name ?? '알 수 없음' }))}
              onRemove={(id) => setAllyIds((current) => current.filter((item) => item !== id))}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-val-muted hover:bg-white/5"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!trimmedName}
            className="rounded-lg bg-val-red px-4 py-2 text-sm font-semibold text-white hover:bg-val-red/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitLabel(player, lockedTeam)}
          </button>
        </div>
      </form>
    </div>
  );
}
