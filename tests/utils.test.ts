import { describe, expect, it } from 'vitest';
import { extractVerdict } from '@/lib/agents/orchestrator';
import { parseCommand } from '@/lib/terminal/commands';
import { clamp, formatBytes, formatRelativeTime, safeEqual } from '@/lib/utils';

describe('formatBytes', () => {
  it('scales into the right unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(16 * 1024 ** 3)).toBe('16 GB');
  });

  it('does not produce nonsense for zero or negative input', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-01-01T12:00:00Z');

  it('formats recent timestamps in seconds and minutes', () => {
    expect(formatRelativeTime('2026-01-01T11:59:50Z', now)).toBe('10s ago');
    expect(formatRelativeTime('2026-01-01T11:30:00Z', now)).toBe('30m ago');
  });

  it('handles clock skew from the future without negative output', () => {
    expect(formatRelativeTime('2026-01-01T12:00:30Z', now)).toBe('just now');
  });

  it('reports unknown for an unparsable value', () => {
    expect(formatRelativeTime('soon', now)).toBe('unknown');
  });
});

describe('safeEqual', () => {
  it('matches identical strings and rejects anything else', () => {
    expect(safeEqual('secret', 'secret')).toBe(true);
    expect(safeEqual('secret', 'secrez')).toBe(false);
    expect(safeEqual('secret', 'secret-longer')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('clamp', () => {
  it('bounds the value and treats NaN as the minimum', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
    expect(clamp(Number.NaN, 2, 10)).toBe(2);
  });
});

describe('extractVerdict', () => {
  it('pulls the reviewer verdict out of a longer answer', () => {
    expect(extractVerdict('lots of text\nVERDICT: hold — missing evidence')).toBe(
      'hold — missing evidence',
    );
  });

  it('returns null when the reviewer did not state one', () => {
    expect(extractVerdict('looks fine to me')).toBeNull();
  });
});

describe('parseCommand', () => {
  it('lowercases the command and keeps argument casing', () => {
    expect(parseCommand('  NODE Core-01 ')).toEqual({ name: 'node', args: ['Core-01'] });
  });

  it('returns an empty name for a blank line', () => {
    expect(parseCommand('   ')).toEqual({ name: '', args: [] });
  });
});
