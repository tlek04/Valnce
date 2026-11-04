import { Check, X } from 'lucide-react';
import { JoinApplication } from '../types';

interface JoinApplicationCardProps {
  application: JoinApplication;
  busy?: boolean;
  onApprove: (application: JoinApplication) => void;
  onReject: (application: JoinApplication) => void;
}

export default function JoinApplicationCard({
  application,
  busy = false,
  onApprove,
  onReject,
}: JoinApplicationCardProps) {
  return (
    <article className="rounded-xl border border-dashed border-val-teal/50 bg-val-teal/5 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-lg font-semibold text-val-cream">
            {application.name}
            <span className="ml-1.5 align-middle text-sm font-medium text-val-teal">
              #{application.queueNo}
            </span>
          </h3>
          <p className="mt-1 truncate text-sm text-val-muted">
            {application.riotName}#{application.riotTag}
          </p>
          <p className="mt-1 text-sm font-medium text-val-teal">승인 대기</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onApprove(application)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-val-teal/70 px-3 py-2 text-sm font-semibold text-val-bg hover:brightness-110 disabled:opacity-40"
        >
          <Check size={16} />
          승인
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onReject(application)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-val-line px-3 py-2 text-sm font-semibold text-val-muted hover:border-val-red/40 hover:text-val-red disabled:opacity-40"
        >
          <X size={16} />
          거절
        </button>
      </div>
    </article>
  );
}
