interface LandingPageProps {
  onSelectStreamer: () => void;
  onSelectViewer: () => void;
}

export default function LandingPage({ onSelectStreamer, onSelectViewer }: LandingPageProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-10 text-center">
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

      <div className="grid w-full max-w-4xl grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
        <button
          type="button"
          onClick={onSelectStreamer}
          className="group flex aspect-square flex-col items-center justify-center rounded-3xl border-2 border-val-line bg-val-panel/70 p-8 text-center transition hover:border-val-red hover:bg-val-panel"
        >
          <span className="font-display text-4xl font-bold tracking-wide text-val-cream transition group-hover:text-val-red sm:text-5xl">
            스트리머
          </span>
          <span className="mt-4 max-w-[14rem] text-sm leading-relaxed text-val-muted">
            비밀번호로 입장 · 팀 구성 · 신청 승인
          </span>
        </button>

        <button
          type="button"
          onClick={onSelectViewer}
          className="group flex aspect-square flex-col items-center justify-center rounded-3xl border-2 border-val-line bg-val-panel/70 p-8 text-center transition hover:border-val-teal hover:bg-val-panel"
        >
          <span className="font-display text-4xl font-bold tracking-wide text-val-cream transition group-hover:text-val-teal sm:text-5xl">
            시청자
          </span>
          <span className="mt-4 max-w-[14rem] text-sm leading-relaxed text-val-muted">
            치지직 닉 · 발로란트 닉으로 참가 신청
          </span>
        </button>
      </div>
    </div>
  );
}
