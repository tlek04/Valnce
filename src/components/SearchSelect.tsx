import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

export interface SearchOption {
  value: string;
  label: string;
  searchText?: string;
  group?: string;
}

interface SearchSelectProps {
  id?: string;
  options: SearchOption[];
  value?: string | null;
  onSelect: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  clearOnSelect?: boolean;
}

export default function SearchSelect({
  id,
  options,
  value,
  onSelect,
  onClear,
  placeholder = '검색',
  clearOnSelect = false,
}: SearchSelectProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(selected?.label ?? '');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) setQuery(selected?.label ?? '');
  }, [selected?.label, open]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || selected?.label === query) return options;
    return options.filter((option) =>
      `${option.label} ${option.searchText ?? ''} ${option.value}`.toLowerCase().includes(needle)
    );
  }, [options, query, selected?.label]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open, filtered.length]);

  const choose = (option: SearchOption) => {
    onSelect(option.value);
    setQuery(clearOnSelect ? '' : option.label);
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + (open ? 1 : 0), Math.max(filtered.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (!open) {
        setOpen(true);
        return;
      }
      const option = filtered[activeIndex] ?? filtered[0];
      if (option) choose(option);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  const activeOption = filtered[activeIndex];

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center rounded-lg border border-val-line bg-val-bg focus-within:border-val-red/60 focus-within:ring-2 focus-within:ring-val-red/40">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeOption ? `${listId}-${activeOption.value}` : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-2.5 text-val-cream outline-none placeholder:text-val-muted/60"
        />
        {onClear && value ? (
          <button
            type="button"
            aria-label="선택 해제"
            className="mr-1 rounded p-1 text-val-muted hover:bg-white/5 hover:text-val-cream"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onClear();
              setQuery('');
              setOpen(false);
            }}
          >
            <X size={14} />
          </button>
        ) : null}
        <ChevronDown size={16} className="mr-3 shrink-0 text-val-muted" />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-val-line bg-val-panel py-1 shadow-xl"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-val-muted">검색 결과가 없습니다</li>
          ) : (
            filtered.map((option, index) => {
              const showGroup = option.group && option.group !== filtered[index - 1]?.group;
              const isActive = index === activeIndex;
              return (
                <li key={option.value}>
                  {showGroup && (
                    <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-val-muted">
                      {option.group}
                    </p>
                  )}
                  <button
                    type="button"
                    id={`${listId}-${option.value}`}
                    role="option"
                    aria-selected={option.value === value || isActive}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-white/5 ${
                      isActive ? 'bg-white/5 text-val-cream' : option.value === value ? 'text-val-red' : 'text-val-cream'
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option)}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
