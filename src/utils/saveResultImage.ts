const SEQ_KEY_PREFIX = 'valnce-result-seq:';

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

/** 로컬 기준 YYYY_MM_DD (파일명·일별 번호용) */
export function localDateStamp(date = new Date()): string {
  return `${date.getFullYear()}_${pad2(date.getMonth() + 1)}_${pad2(date.getDate())}`;
}

/** 오늘 기준 다음 번호 (1부터). 저장 성공 후에만 호출해 소비한다. */
export function peekNextResultSeq(dateStamp = localDateStamp()): number {
  const raw = localStorage.getItem(`${SEQ_KEY_PREFIX}${dateStamp}`);
  const current = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(current) && current > 0 ? current + 1 : 1;
}

export function commitResultSeq(seq: number, dateStamp = localDateStamp()): void {
  localStorage.setItem(`${SEQ_KEY_PREFIX}${dateStamp}`, String(seq));
}

/** 예: Valnce_2026_11_04_1.png */
export function resultImageFileName(dateStamp = localDateStamp(), seq = peekNextResultSeq(dateStamp)): string {
  return `Valnce_${dateStamp}_${seq}.png`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, payload] = dataUrl.split(',');
  const mime = meta.match(/data:([^;]+)/)?.[1] ?? 'image/png';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = fileName;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

/** PNG data URL을 Valnce_날짜_번호 이름으로 바로 다운로드한다. (경로 선택 없음) */
export async function saveResultImage(dataUrl: string): Promise<{ fileName: string }> {
  const dateStamp = localDateStamp();
  const seq = peekNextResultSeq(dateStamp);
  const fileName = resultImageFileName(dateStamp, seq);
  downloadBlob(dataUrlToBlob(dataUrl), fileName);
  commitResultSeq(seq, dateStamp);
  return { fileName };
}
