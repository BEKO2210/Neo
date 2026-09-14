'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { AppId } from '@/components/os/types';
import { commandNames, executeCommand, type TerminalContext } from '@/lib/terminal/commands';
import type { NeoEvent, NeoNode } from '@/lib/telemetry/types';
import { shortId } from '@/lib/utils';

interface Line {
  id: string;
  kind: 'input' | 'output';
  text: string;
}

interface TerminalAppProps {
  nodes: NeoNode[];
  events: NeoEvent[];
  operator: string;
  store: string;
  model: string | null;
  onOpenApp(id: AppId): void;
  onSelectNode(id: string | null): void;
}

const BANNER = [
  'Neo command shell. Type "help" for commands.',
  'Tab completes, ↑/↓ walks history.',
];

export function TerminalApp({
  nodes,
  events,
  operator,
  store,
  model,
  onOpenApp,
  onSelectNode,
}: TerminalAppProps) {
  const [lines, setLines] = useState<Line[]>(() =>
    BANNER.map((text) => ({ id: shortId('l'), kind: 'output' as const, text })),
  );
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [busy, setBusy] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    viewRef.current?.scrollTo({ top: viewRef.current.scrollHeight });
  }, [lines]);

  const push = useCallback((kind: Line['kind'], text: string) => {
    setLines((current) => [...current, { id: shortId('l'), kind, text }]);
  }, []);

  const submit = useCallback(
    async (raw: string) => {
      const line = raw.trim();
      if (!line || busy) return;

      push('input', line);
      setHistory((current) => [line, ...current].slice(0, 100));
      setCursor(-1);
      setInput('');
      setBusy(true);

      const context: TerminalContext = {
        nodes,
        events,
        operator,
        store,
        model,
        openApp: onOpenApp,
        selectNode: onSelectNode,
        write: (text) => push('output', text),
        update: (text) =>
          setLines((current) => {
            const last = current[current.length - 1];
            if (!last || last.kind !== 'output') {
              return [...current, { id: shortId('l'), kind: 'output', text }];
            }
            return [...current.slice(0, -1), { ...last, text }];
          }),
        clear: () => setLines([]),
      };

      const output = await executeCommand(line, context);
      for (const text of output) push('output', text);
      setBusy(false);
    },
    [busy, events, model, nodes, onOpenApp, onSelectNode, operator, push, store],
  );

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Tab') {
      event.preventDefault();
      const match = commandNames.find((name) => name.startsWith(input.trim()) && input.trim().length > 0);
      if (match) setInput(`${match} `);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.min(cursor + 1, history.length - 1);
      if (next >= 0 && history[next]) {
        setCursor(next);
        setInput(history[next]);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = cursor - 1;
      setCursor(next);
      setInput(next >= 0 ? (history[next] ?? '') : '');
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(input);
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.focus()}
      className="flex h-full w-full cursor-text flex-col bg-void/70 text-left"
      aria-label="Terminal. Click to focus the prompt."
    >
      <div ref={viewRef} className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[11.5px] leading-relaxed">
        {lines.map((line) => (
          <p
            key={line.id}
            className={
              line.kind === 'input'
                ? 'whitespace-pre-wrap break-words text-neo'
                : 'whitespace-pre-wrap break-words text-chrome/80'
            }
          >
            {line.kind === 'input' ? `❯ ${line.text}` : line.text}
          </p>
        ))}
        {busy ? <p className="text-mist neo-pulse">…</p> : null}
      </div>

      <form onSubmit={handleSubmit} className="flex shrink-0 items-center gap-2 border-t border-edge/70 px-3 py-2">
        <span className="font-mono text-xs text-neo" aria-hidden>
          ❯
        </span>
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
          aria-label="Terminal input"
          className="flex-1 bg-transparent font-mono text-xs text-chrome outline-none placeholder:text-mist/50"
          placeholder={busy ? 'working…' : 'status'}
        />
      </form>
    </button>
  );
}
