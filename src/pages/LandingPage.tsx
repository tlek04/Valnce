import { useEffect, useState } from 'react';
import { fetchTrustStatus } from '../utils/streamerAuth';
import { fetchSiteSettings } from '../utils/siteSettings';

interface LandingPageProps {
  onSelectStreamer: () => void;
  onSelectViewer: () => void;
}

export default function LandingPage({ onSelectStreamer, onSelectViewer }: LandingPageProps) {
  const [ready, setReady] = useState(false);
  const [showViewerCard, setShowViewerCard] = useState(false);
  const [showStreamerCard, setShowStreamerCard] = useState(false);
  const [viewerEntryOpen, setViewerEntryOpen] = useState(false);
  /** 서버 OFF여도 이 PC(신뢰)면 true */
  const [streamerEntryOpen, setStreamerEntryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [settings, trusted] = await Promise.all([fetchSiteSettings(), fetchTrustStatus()]);
      if (cancelled) return;
      setShowViewerCard(settings.showViewerCard);
      setShowStreamerCard(settings.showStreamerCard);
      setViewerEntryOpen(settings.viewerAccessOpen);
      setStreamerEntryOpen(settings.streamerAccessOpen || trusted);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cardCount = Number(showStreamerCard) + Number(showViewerCard);
  const gridClass =
    cardCount >= 2
      ? 'max-w-4xl grid-cols-1 sm:grid-cols-2'
      : 'max-w-md grid-cols-1';

  return (
    <div className="flex min-h-screen flex-col items-center px-4 pb-8 pt-16 sm:pt-20">
      <div className="mb-8 text-center">
        <img
          src="/valorant-logo.webp"
          alt="VALORANT"
          className="mx-auto h-14 w-auto mix-blend-lighten sm:h-16"
          draggable={false}
        />
        <h1 className="mt-4 font-display text-3xl font-bold uppercase tracking-[0.2em] text-val-red sm:text-4xl">
          Valnce
        </h1>
        <p className="mt-3 text-sm text-val-muted">내전 참가 방식을 선택하세요</p>
      </div>

      {!ready ? (
        <p className="text-sm text-val-muted">불러오는 중…</p>
      ) : cardCount === 0 ? (
        <p className="text-sm text-val-muted">지금은 선택할 수 있는 입장이 없습니다.</p>
      ) : (
        <div className={`grid w-full gap-5 sm:gap-6 ${gridClass}`}>
          {showStreamerCard ? (
            <button
              type="button"
              onClick={onSelectStreamer}
              className={`group flex aspect-square flex-col items-center justify-center rounded-3xl border-2 bg-val-panel/70 p-8 text-center transition hover:bg-val-panel ${
                streamerEntryOpen
                  ? 'border-val-line hover:border-val-red'
                  : 'border-val-warn/50 hover:border-val-warn'
              }`}
            >
              <span
                className={`font-display text-4xl font-bold tracking-wide text-val-cream transition sm:text-5xl ${
                  streamerEntryOpen ? 'group-hover:text-val-red' : 'group-hover:text-val-warn'
                }`}
              >
                {streamerEntryOpen ? '스트리머' : '관리자'}
              </span>
              <span className="mt-4 max-w-[14rem] text-sm leading-relaxed text-val-muted">
                {streamerEntryOpen
                  ? '비밀번호로 입장 · 팀 구성 · 신청 승인'
                  : '스트리머 입장 닫힘 · 관리자 비밀번호로 입장'}
              </span>
            </button>
          ) : null}

          {showViewerCard ? (
            <button
              type="button"
              onClick={onSelectViewer}
              disabled={!viewerEntryOpen}
              className={`group flex aspect-square flex-col items-center justify-center rounded-3xl border-2 bg-val-panel/70 p-8 text-center transition ${
                viewerEntryOpen
                  ? 'border-val-line hover:border-val-teal hover:bg-val-panel'
                  : 'cursor-not-allowed border-val-line/50 opacity-60'
              }`}
            >
              <span
                className={`font-display text-4xl font-bold tracking-wide text-val-cream transition sm:text-5xl ${
                  viewerEntryOpen ? 'group-hover:text-val-teal' : ''
                }`}
              >
                시청자
              </span>
              <span className="mt-4 max-w-[16rem] text-sm leading-relaxed text-val-muted">
                {viewerEntryOpen
                  ? '성인만 · 마이크 필수 · 닉네임·태그·오더 신청 · 티어는 API 자동 · 보정은 스트리머에게'
                  : '지금은 참가 신청을 받지 않습니다'}
              </span>
            </button>
          ) : null}
        </div>
      )}

      <p className="mx-auto mt-auto max-w-lg pt-10 text-center text-sm leading-relaxed text-val-muted/90">
        빠른 내전 진행을 위해 스트리머의 팬심으로 만든 페이지입니다.
        <br />
        재미로 하는 내전이니 독선적인 행동은 피해 주세요.
      </p>
    </div>
  );
}
