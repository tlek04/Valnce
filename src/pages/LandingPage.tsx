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
    <div className="flex min-h-[100dvh] flex-col items-center px-4 pb-8 pt-10 sm:pt-20">
      <div className="mb-6 text-center sm:mb-8">
        <img
          src="/valorant-logo.webp"
          alt="VALORANT"
          className="mx-auto h-12 w-auto mix-blend-lighten sm:h-16"
          draggable={false}
        />
        <h1 className="mt-3 font-display text-3xl font-bold uppercase tracking-[0.2em] text-val-red sm:mt-4 sm:text-4xl">
          Valnce
        </h1>
        <p className="mt-2 text-sm text-val-muted sm:mt-3">내전 참가 방식을 선택하세요</p>
      </div>

      {!ready ? (
        <p className="text-sm text-val-muted">불러오는 중…</p>
      ) : cardCount === 0 ? (
        <p className="text-sm text-val-muted">지금은 선택할 수 있는 입장이 없습니다.</p>
      ) : (
        <div className={`grid w-full gap-3 sm:gap-6 ${gridClass}`}>
          {showStreamerCard ? (
            <button
              type="button"
              onClick={onSelectStreamer}
              className={`group flex min-h-[9.5rem] flex-col items-center justify-center rounded-2xl border-2 bg-val-panel/70 p-6 text-center transition hover:bg-val-panel sm:aspect-square sm:min-h-0 sm:rounded-3xl sm:p-8 ${
                streamerEntryOpen
                  ? 'border-val-line hover:border-val-red'
                  : 'border-val-warn/50 hover:border-val-warn'
              }`}
            >
              <span
                className={`font-display text-3xl font-bold tracking-wide text-val-cream transition sm:text-5xl ${
                  streamerEntryOpen ? 'group-hover:text-val-red' : 'group-hover:text-val-warn'
                }`}
              >
                {streamerEntryOpen ? '스트리머' : '관리자'}
              </span>
            </button>
          ) : null}

          {showViewerCard ? (
            <button
              type="button"
              onClick={onSelectViewer}
              disabled={!viewerEntryOpen}
              className={`group flex min-h-[9.5rem] flex-col items-center justify-center rounded-2xl border-2 bg-val-panel/70 p-6 text-center transition sm:aspect-square sm:min-h-0 sm:rounded-3xl sm:p-8 ${
                viewerEntryOpen
                  ? 'border-val-line hover:border-val-teal hover:bg-val-panel'
                  : 'cursor-not-allowed border-val-line/50 opacity-60'
              }`}
            >
              <span
                className={`font-display text-3xl font-bold tracking-wide text-val-cream transition sm:text-5xl ${
                  viewerEntryOpen ? 'group-hover:text-val-teal' : ''
                }`}
              >
                시청자
              </span>
            </button>
          ) : null}
        </div>
      )}

      <p className="mx-auto mt-6 max-w-lg px-1 text-center text-xs leading-relaxed text-val-muted/90 sm:mt-8 sm:text-sm">
        빠른 내전 진행을 위해 스트리머의 팬심으로 만든 페이지입니다.
        <br />
        재미로 하는 내전이니 독선적인 행동은 피해 주세요.
      </p>
    </div>
  );
}
