'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '@/components/hud/Icon';
import { useVoice } from '@/components/voice/useVoice';
import { postStream } from '@/lib/client/stream';
import type { RunEvent } from '@/lib/ai/runner';
import { cn, shortId } from '@/lib/utils';

interface ToolTrace {
  name: string;
  status: 'running' | 'ok' | 'error';
  output?: string;
}

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools: ToolTrace[];
  error?: string;
}

type ChatEvent = RunEvent | { type: 'meta'; model: string } | { type: 'error'; message: string };

interface ChatAppProps {
  model: string | null;
  speakReplies: boolean;
}

export function ChatApp({ model, speakReplies }: ChatAppProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const voice = useVoice();

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  useEffect(() => {
    if (voice.transcript) setInput(voice.transcript.trim());
  }, [voice.transcript]);

  const send = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || busy) return;

      const history = [...turns, { id: shortId('t'), role: 'user' as const, text: trimmed, tools: [] }];
      const replyId = shortId('t');
      setTurns([...history, { id: replyId, role: 'assistant', text: '', tools: [] }]);
      setInput('');
      voice.reset();
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const patch = (update: (turn: Turn) => Turn) =>
        setTurns((current) => current.map((turn) => (turn.id === replyId ? update(turn) : turn)));

      try {
        const stream = postStream<ChatEvent>(
          '/api/chat',
          {
            model,
            messages: history.map((turn) => ({ role: turn.role, content: turn.text })),
          },
          controller.signal,
        );

        let spoken = '';
        for await (const event of stream) {
          switch (event.type) {
            case 'text':
              spoken += event.delta;
              patch((turn) => ({ ...turn, text: turn.text + event.delta }));
              break;
            case 'tool_start':
              patch((turn) => ({
                ...turn,
                tools: [...turn.tools, { name: event.call.name, status: 'running' }],
              }));
              break;
            case 'tool_end':
              patch((turn) => ({
                ...turn,
                tools: turn.tools.map((tool) =>
                  tool.name === event.name && tool.status === 'running'
                    ? { name: tool.name, status: event.isError ? 'error' : 'ok', output: event.output }
                    : tool,
                ),
              }));
              break;
            case 'error':
              patch((turn) => ({ ...turn, error: event.message }));
              break;
            default:
              break;
          }
        }
        if (speakReplies && spoken) voice.speak(spoken);
      } catch (error) {
        if (!controller.signal.aborted) {
          patch((turn) => ({
            ...turn,
            error: error instanceof Error ? error.message : 'The request failed.',
          }));
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, model, speakReplies, turns, voice],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(input);
  }

  function handleStop() {
    abortRef.current?.abort();
    voice.cancelSpeech();
    setBusy(false);
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={logRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {turns.length === 0 ? (
          <div className="space-y-3 pt-6 text-center">
            <p className="neo-label">Neo is listening</p>
            <p className="mx-auto max-w-xs text-xs leading-relaxed text-mist">
              Ask about your fleet or your repositories. Neo calls tools for real state instead of
              guessing — try &ldquo;which node is in trouble?&rdquo;
            </p>
          </div>
        ) : null}

        {turns.map((turn) => (
          <article
            key={turn.id}
            className={cn(
              'neo-rise rounded-lg border px-3 py-2 text-sm leading-relaxed',
              turn.role === 'user'
                ? 'ml-6 border-neo/25 bg-neo/5'
                : 'mr-2 border-edge/70 bg-abyss/50',
            )}
          >
            <p className="neo-label mb-1.5">{turn.role === 'user' ? 'You' : 'Neo'}</p>

            {turn.tools.length > 0 ? (
              <ul className="mb-2 flex flex-wrap gap-1.5">
                {turn.tools.map((tool, index) => (
                  <li
                    key={`${tool.name}-${index}`}
                    title={tool.output?.slice(0, 400)}
                    className={cn(
                      'rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider',
                      tool.status === 'running' && 'neo-pulse border-neo/40 bg-neo/10 text-neo',
                      tool.status === 'ok' && 'border-signal/40 bg-signal/10 text-signal',
                      tool.status === 'error' && 'border-alert/40 bg-alert/10 text-alert',
                    )}
                  >
                    {tool.name}
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="whitespace-pre-wrap break-words text-chrome/90">
              {turn.text || (turn.role === 'assistant' && busy ? '▍' : '')}
            </p>

            {turn.error ? (
              <p className="mt-2 rounded border border-alert/40 bg-alert/10 p-2 text-xs text-alert">
                {turn.error}
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="shrink-0 border-t border-edge/70 bg-abyss/60 p-2">
        {voice.error ? <p className="mb-1.5 px-1 text-[11px] text-alert">{voice.error}</p> : null}
        <div className="flex items-end gap-1.5">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder="Ask Neo…  (Enter to send, Shift+Enter for a new line)"
            className="min-h-[3rem] flex-1 resize-none rounded-lg border border-edge bg-panel px-2.5 py-2 text-sm text-chrome placeholder:text-mist/50"
          />

          {voice.supported ? (
            <button
              type="button"
              onClick={voice.listening ? voice.stop : voice.start}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? 'Stop dictation' : 'Start dictation'}
              className={cn(
                'grid h-10 w-10 shrink-0 place-items-center rounded-lg border transition',
                voice.listening
                  ? 'neo-pulse border-alert/50 bg-alert/15 text-alert'
                  : 'border-edge text-mist hover:border-neo/50 hover:text-neo',
              )}
            >
              <Icon name="mic" size={17} />
            </button>
          ) : null}

          <button
            type={busy ? 'button' : 'submit'}
            onClick={busy ? handleStop : undefined}
            disabled={!busy && input.trim().length === 0}
            aria-label={busy ? 'Stop generating' : 'Send message'}
            className={cn(
              'grid h-10 w-10 shrink-0 place-items-center rounded-lg border transition disabled:opacity-30',
              busy
                ? 'border-alert/50 bg-alert/15 text-alert'
                : 'border-neo/50 bg-neo/10 text-neo hover:bg-neo/20',
            )}
          >
            <Icon name={busy ? 'stop' : 'send'} size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
