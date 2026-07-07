import { describe, it, expect, vi, beforeEach } from 'vitest';
import { __audioController } from '../hooks/useAudioPlayer';

describe('audio controller (singleton, um por vez)', () => {
  beforeEach(() => __audioController.reset());

  it('play em B pausa A', () => {
    const a = { pause: vi.fn(), play: vi.fn(() => Promise.resolve()) } as unknown as HTMLAudioElement;
    const b = { pause: vi.fn(), play: vi.fn(() => Promise.resolve()) } as unknown as HTMLAudioElement;
    __audioController.play(a);
    __audioController.play(b);
    expect(a.pause).toHaveBeenCalled();
    expect(b.play).toHaveBeenCalled();
  });

  it('pause no atual limpa o current', () => {
    const a = { pause: vi.fn(), play: vi.fn(() => Promise.resolve()) } as unknown as HTMLAudioElement;
    __audioController.play(a);
    __audioController.pause(a);
    expect(__audioController.current()).toBeNull();
  });
});
