import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
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
import { formatRecord, formatStreak } from '../utils/matchStats';
import { cloneRating, isRatingAtLeast } from '../utils/rating';
import { MAX_MATCH_SEEDS } from '../utils/valorantMatch';
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

export default function PlayerFormModal({ open, player, onClose, onNotice }: PlayerFormModalProps) {
  const players = useAppStore((state) => state.players);
  const boardPlayers = useAppStore((state) => [...state.waitlist, ...state.team1, ...state.team2]);
  const addPlayer = useAppStore((state) => state.addPlayer);
  const updatePlayer = useAppStore((state) => state.updatePlayer);
  const recordPlayerResult = useAppStore((state) => state.recordPlayerResult);
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
  const [matchSeed, setMatchSeed] = useState(player?.matchSeed ?? false);

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
    setMatchSeed(Boolean(source && 'matchSeed' in source ? source.matchSeed : player?.matchSeed));
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
  const otherSeedCount = players.filter((item) => item.id !== player?.id && item.matchSeed).length;
  const canEnableSeed = matchSeed || otherSeedCount < MAX_MATCH_SEEDS;
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
      matchSeed: Boolean(matchSeed && trimmedRiotName && trimmedRiotTag),
      wins,
      losses,
      streak,
    };
    const message = player ? updatePlayer(player.id, payload) : addPlayer(payload);
    if (message) onNotice?.(message);
    onClose();
  };

  const handleQuickResult = (result: 'win' | 'loss') => {
    if (!player) {
      if (result === 'win') {
        setWins((value) => value + 1);
        setStreak((value) => (value > 0 ? value + 1 : 1));
      } else {
        setLosses((value) => value + 1);
        setStreak((value) => (value < 0 ? value - 1 : -1));
      }
      return;
    }
    recordPlayerResult(player.id, result);
    const next =
      useAppStore.getState().players.find((item) => item.id === player.id) ??
      [...useAppStore.getState().waitlist, ...useAppStore.getState().team1, ...useAppStore.getState().team2].find(
        (item) => item.id === player.id
      );
    if (next) {
      setWins(next.wins);
      setLosses(next.losses);
      setStreak(next.streak);
    }
  };

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
        className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-val-line bg-val-panel p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-val-red">Roster</p>
            <h2 id="player-form-title" className="mt-1 font-display text-2xl font-bold text-val-cream">
              {player ? '플레이어 수정' : '플레이어 등록'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="닫기"
            className="rounded-md p-1.5 text-val-muted hover:bg-white/5 hover:text-val-cream"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="player-name" className="mb-1.5 block text-sm text-val-muted">
              닉네임
            </label>
            <input
              id="player-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 은후"
              className="w-full rounded-lg border border-val-line bg-val-bg px-3 py-2.5 text-val-cream outline-none ring-val-red/40 placeholder:text-val-muted/60 focus:border-val-red/60 focus:ring-2"
            />
            {isDuplicate && (
              <p className="mt-1.5 text-xs text-yellow-300">같은 닉네임이 이미 등록되어 있습니다.</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <div>
              <label htmlFor="player-riot-name" className="mb-1.5 block text-sm text-val-muted">
                발로란트 닉
              </label>
              <input
                id="player-riot-name"
                value={riotName}
                onChange={(event) => setRiotName(event.target.value)}
                placeholder="게임 닉네임"
                className="w-full rounded-lg border border-val-line bg-val-bg px-3 py-2.5 text-val-cream outline-none ring-val-red/40 placeholder:text-val-muted/60 focus:border-val-red/60 focus:ring-2"
              />
            </div>
            <div>
              <label htmlFor="player-riot-tag" className="mb-1.5 block text-sm text-val-muted">
                태그
              </label>
              <div className="flex items-center gap-1">
                <span className="text-val-muted">#</span>
                <input
                  id="player-riot-tag"
                  value={riotTag}
                  onChange={(event) => setRiotTag(event.target.value)}
                  placeholder="KR1"
                  className="w-full rounded-lg border border-val-line bg-val-bg px-3 py-2.5 text-val-cream outline-none ring-val-red/40 placeholder:text-val-muted/60 focus:border-val-red/60 focus:ring-2"
                />
              </div>
            </div>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm text-val-muted">전적 시드 (단골)</legend>
            <button
              type="button"
              role="switch"
              aria-checked={matchSeed}
              disabled={!canEnableSeed || !riotName.trim() || !riotTag.trim()}
              onClick={() => setMatchSeed((value) => !value)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                matchSeed
                  ? 'border-sky-400/50 bg-sky-500/10 text-val-cream'
                  : 'border-val-line bg-val-bg text-val-muted hover:border-val-red/40'
              }`}
            >
              <span>커스텀 전적 조회 시드</span>
              <span className={`text-xs font-semibold ${matchSeed ? 'text-sky-300' : 'text-val-muted'}`}>
                {matchSeed ? '시드' : '일반'}
              </span>
            </button>
            <p className="mt-1.5 text-xs text-val-muted">
              자주 오는 사람 최대 {MAX_MATCH_SEEDS}명만 API로 전적을 가져옵니다. 나머지 인원도 닉#태그가
              있으면 그 매치 참가자로 매칭되어 승패가 반영됩니다.
            </p>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-sm text-val-muted">내전 전적</legend>
            <div className="rounded-lg border border-val-line bg-val-bg px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-val-cream">
                  {formatRecord({ wins, losses })}
                  {formatStreak(streak) ? (
                    <span className={`ml-2 text-xs ${streak > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {formatStreak(streak)}
                    </span>
                  ) : null}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickResult('win')}
                    className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
                  >
                    승 +1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickResult('loss')}
                    className="rounded-md border border-rose-400/40 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
                  >
                    패 +1
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-val-muted">보드에서 팀 승패를 누르면 전원에게 자동 반영됩니다.</p>
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="player-current-tier" className="mb-1.5 block text-sm text-val-muted">
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
              <label htmlFor="player-max-tier" className="mb-1.5 block text-sm text-val-muted">
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
            <label htmlFor="player-internal-tier" className="mb-1.5 block text-sm text-val-muted">
              내전 티어
            </label>
            <SearchSelect
              id="player-internal-tier"
              options={RANK_OPTIONS}
              value={internalTier ? ratingKey(internalTier) : null}
              placeholder="없으면 현재 티어 사용"
              onSelect={(value) => setInternalTier(parseRatingKey(value))}
            />
            <p className="mt-1.5 text-xs text-val-muted">
              {internalTier
                ? `자동 밸런스는 내전 티어(${formatRating(internalTier)})를 기준으로 나눕니다.`
                : '자동 밸런스는 현재 티어를 기준으로 나눕니다.'}
            </p>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm text-val-muted">오더</legend>
            <button
              type="button"
              role="switch"
              aria-checked={canOrder}
              onClick={() => setCanOrder((value) => !value)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                canOrder
                  ? 'border-emerald-400/50 bg-emerald-500/10 text-val-cream'
                  : 'border-val-line bg-val-bg text-val-muted hover:border-val-red/40'
              }`}
            >
              <span>오더 가능</span>
              <span className={`text-xs font-semibold ${canOrder ? 'text-emerald-300' : 'text-val-muted'}`}>
                {canOrder ? '가능' : '불가'}
              </span>
            </button>
          </fieldset>

          <div>
            <label htmlFor="player-weapon-limit" className="mb-1.5 block text-sm text-val-muted">
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

          <fieldset>
            <legend className="mb-1.5 text-sm text-val-muted">팀 고정</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="팀 고정">
              {(
                [
                  { value: null, label: '없음' },
                  { value: 'TEAM_1', label: '1팀' },
                  { value: 'TEAM_2', label: '2팀' },
                ] as const
              ).map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={lockedTeam === option.value}
                  aria-pressed={lockedTeam === option.value}
                  onClick={() => setLockedTeam(option.value)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    lockedTeam === option.value
                      ? 'border-val-red bg-val-red/15 text-val-cream'
                      : 'border-val-line bg-val-bg text-val-muted hover:border-val-red/40'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="player-rivals" className="mb-1.5 block text-sm text-val-muted">
              라이벌 (같은 팀 금지)
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
            <label htmlFor="player-allies" className="mb-1.5 block text-sm text-val-muted">
              같은 팀 묶기
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

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm text-val-muted hover:bg-white/5"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!trimmedName}
            className="rounded-lg bg-val-red px-4 py-2.5 text-sm font-semibold text-white hover:bg-val-red/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitLabel(player, lockedTeam)}
          </button>
        </div>
      </form>
    </div>
  );
}
