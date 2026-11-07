import { X } from 'lucide-react';
import { Player } from '../types';
import { RANK_OPTIONS, WEAPON_CATEGORY_STYLES, getRestrictionLabel, parseRatingKey, ratingKey } from '../constants/valorant';
import { isRatingAtLeast } from '../utils/rating';
import { usePlayerForm } from '../hooks/usePlayerForm';
import SearchSelect from './SearchSelect';
import ChipList from './ChipList';

interface PlayerFormModalProps {
  open: boolean;
  player: Player | null;
  onClose: () => void;
  onNotice?: (message: string) => void;
}

function submitLabel(player: Player | null, lockedTeam: Player['lockedTeam']) {
  if (player) return '수정 저장';
  if (lockedTeam === 'TEAM_1') return '1팀에 추가';
  if (lockedTeam === 'TEAM_2') return '2팀에 추가';
  if (lockedTeam === 'MATCH' || lockedTeam === 'WAITLIST') return '고정으로 추가';
  return '대기열에 추가';
}

export default function PlayerFormModal({ open, player, onClose, onNotice }: PlayerFormModalProps) {
  const {
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
  } = usePlayerForm({ open, player, onClose, onNotice });

  if (!open) return null;

  const fieldLabel = 'mb-1.5 block text-base font-medium text-val-cream/90';
  const toggleBtn = (active: boolean, tone: 'default' | 'sky' | 'red' | 'teal' = 'default') => {
    if (tone === 'sky') {
      return active
        ? 'rounded-md border border-sky-400/70 bg-sky-500/35 px-3 py-1.5 text-sm font-semibold text-sky-100 transition-colors'
        : 'rounded-md border border-sky-400/15 bg-sky-500/[0.06] px-3 py-1.5 text-sm text-sky-300/45 transition-colors hover:border-sky-400/30 hover:bg-sky-500/10 hover:text-sky-300/70';
    }
    if (tone === 'teal') {
      return active
        ? 'rounded-md border border-val-teal/70 bg-val-teal/35 px-3 py-1.5 text-sm font-semibold text-teal-100 transition-colors'
        : 'rounded-md border border-val-teal/15 bg-val-teal/[0.06] px-3 py-1.5 text-sm text-val-teal/45 transition-colors hover:border-val-teal/30 hover:bg-val-teal/10 hover:text-val-teal/70';
    }
    if (tone === 'red') {
      return active
        ? 'rounded-md border border-val-red/70 bg-val-red/35 px-3 py-1.5 text-sm font-semibold text-red-100 transition-colors'
        : 'rounded-md border border-val-red/15 bg-val-red/[0.06] px-3 py-1.5 text-sm text-val-red/45 transition-colors hover:border-val-red/30 hover:bg-val-red/10 hover:text-val-red/70';
    }
    return active
      ? 'rounded-md border border-val-red bg-val-red/15 px-3 py-1.5 text-sm text-val-cream transition-colors'
      : 'rounded-md border border-val-line/50 bg-val-bg/40 px-3 py-1.5 text-sm text-val-muted/50 transition-colors hover:border-val-line hover:text-val-muted';
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
        className="relative z-10 w-full max-w-lg overflow-visible rounded-t-2xl border border-val-line bg-val-panel p-4 shadow-2xl sm:rounded-2xl sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="player-form-title" className="font-display text-xl font-bold text-val-cream">
            {player ? '플레이어 수정' : '플레이어 추가'}
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
            <label htmlFor="player-name" className={fieldLabel}>
              치지직 닉네임
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
              <p className="mt-1 text-xs text-val-warn">같은 닉네임이 이미 있습니다.</p>
            )}
          </div>

          <div>
            <label htmlFor="player-riot-id" className={fieldLabel}>
              발로란트 닉네임#태그
            </label>
            <input
              id="player-riot-id"
              value={riotId}
              onChange={(event) => setRiotId(event.target.value)}
              placeholder="닉네임#KR1"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-val-line bg-val-bg px-3 py-2 text-val-cream outline-none ring-val-red/40 placeholder:text-val-muted/60 focus:border-val-red/60 focus:ring-2"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className={fieldLabel}>현재 티어</p>
              <SearchSelect
                id="player-current-tier"
                options={RANK_OPTIONS}
                value={ratingKey(currentTier)}
                placeholder="티어 검색"
                onSelect={(value) => setCurrentTier(parseRatingKey(value))}
              />
            </div>
            <div>
              <p className={fieldLabel}>최고 티어</p>
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
            <div>
              <p className={fieldLabel}>내전 티어</p>
              <SearchSelect
                id="player-internal-tier"
                options={RANK_OPTIONS}
                value={internalTier ? ratingKey(internalTier) : null}
                placeholder="강제 조정"
                onSelect={(value) => setInternalTier(parseRatingKey(value))}
                onClear={() => setInternalTier(null)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={canOrder}
              onClick={() => setCanOrder((value) => !value)}
              className={
                canOrder
                  ? 'rounded-md border border-val-teal/50 px-3 py-1.5 text-sm font-semibold text-val-cream transition-colors'
                  : 'rounded-md border border-val-teal/15 px-3 py-1.5 text-sm text-val-teal/40 transition-colors'
              }
              style={{
                backgroundColor: canOrder ? 'rgba(15, 223, 195, 0.6)' : 'rgba(15, 223, 195, 0.08)',
              }}
            >
              {canOrder ? '오더 가능' : '오더 불가능'}
            </button>
            <button
              type="button"
              aria-pressed={lockedTeam === 'TEAM_1'}
              onClick={() => setLockedTeam((current) => (current === 'TEAM_1' ? null : 'TEAM_1'))}
              className={toggleBtn(lockedTeam === 'TEAM_1', 'sky')}
            >
              1팀 고정
            </button>
            <button
              type="button"
              aria-pressed={lockedTeam === 'TEAM_2'}
              onClick={() => setLockedTeam((current) => (current === 'TEAM_2' ? null : 'TEAM_2'))}
              className={toggleBtn(lockedTeam === 'TEAM_2', 'red')}
            >
              2팀 고정
            </button>
            <button
              type="button"
              aria-pressed={lockedTeam === 'MATCH' || lockedTeam === 'WAITLIST'}
              onClick={() =>
                setLockedTeam((current) =>
                  current === 'MATCH' || current === 'WAITLIST' ? null : 'MATCH'
                )
              }
              className={toggleBtn(lockedTeam === 'MATCH' || lockedTeam === 'WAITLIST', 'teal')}
            >
              고정
            </button>
          </div>

          <div>
            <p className={fieldLabel}>무기 제한</p>
            <button
              type="button"
              onClick={() => setWeaponPanelOpen(true)}
              className="w-full rounded-lg border border-val-line bg-val-bg px-3 py-2.5 text-left text-sm text-val-cream hover:border-val-red/40"
            >
              {restrictions.length > 0
                ? `선택 ${restrictions.length}개 · 제한 선택`
                : '제한 선택'}
            </button>
            <ChipList
              items={restrictions.map((item) => ({ id: item.id, label: getRestrictionLabel(item) }))}
              onRemove={(id) => setRestrictions((current) => current.filter((item) => item.id !== id))}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={fieldLabel}>라이벌</p>
              <p className="mb-1.5 text-xs text-val-muted">같은 팀 불가</p>
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
              <p className={fieldLabel}>고정 듀오</p>
              <p className="mb-1.5 text-xs text-val-muted">같은 팀 묶기</p>
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

      {weaponPanelOpen && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="제한 선택 닫기"
            className="absolute inset-0"
            onClick={() => setWeaponPanelOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="weapon-limit-title"
            className="relative z-10 flex max-h-[min(85vh,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-val-line bg-val-panel p-4 shadow-2xl sm:rounded-2xl sm:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 id="weapon-limit-title" className="font-display text-lg font-bold text-val-cream">
                  제한 선택
                </h3>
                <p className="mt-0.5 text-xs text-val-muted">버튼을 눌러 제한을 켜고 끕니다</p>
              </div>
              <button
                type="button"
                aria-label="닫기"
                className="rounded-md p-1.5 text-val-muted hover:bg-white/5 hover:text-val-cream"
                onClick={() => setWeaponPanelOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {restrictionGroups.map((group) => (
                <div key={group.name}>
                  <p
                    className={`mb-1.5 text-[11px] font-semibold ${
                      (WEAPON_CATEGORY_STYLES[group.name] ?? WEAPON_CATEGORY_STYLES['세트'])
                        .split(' ')
                        .find((part) => part.startsWith('text-')) ?? 'text-val-muted'
                    }`}
                  >
                    {group.name}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.options.map((option) => {
                      const active = selectedKeys.has(option.value);
                      const tone = WEAPON_CATEGORY_STYLES[option.group] ?? WEAPON_CATEGORY_STYLES['세트'];
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleRestriction(option.value)}
                            className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                            active
                              ? tone
                              : 'border-val-line/40 bg-val-bg/40 text-val-muted/45 hover:border-val-line hover:text-val-muted'
                          }`}
                        >
                          {option.short}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setWeaponPanelOpen(false)}
                className="rounded-lg bg-val-red px-4 py-2 text-sm font-semibold text-white hover:bg-val-red/90"
              >
                완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
