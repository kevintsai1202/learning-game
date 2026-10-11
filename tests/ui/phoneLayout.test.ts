/**
 * 手機版面的判斷（第 10.2 節，src/ui/phoneLayout.ts）：螢幕寬 600px 以下，或橫式而且高 500px 以下（橫式手機）。
 * 平板與電腦照舊。
 */
import { describe, expect, it } from 'vitest';
import { isPhoneViewport } from '../../src/ui/phoneLayout';

describe('isPhoneViewport', () => {
  it('直式手機、橫式手機是手機', () => {
    expect(isPhoneViewport(390, 844)).toBe(true);
    expect(isPhoneViewport(360, 740)).toBe(true);
    expect(isPhoneViewport(844, 390)).toBe(true);
    expect(isPhoneViewport(667, 375)).toBe(true);
  });

  it('平板與電腦不是', () => {
    expect(isPhoneViewport(768, 1024)).toBe(false);
    expect(isPhoneViewport(1024, 768)).toBe(false);
    expect(isPhoneViewport(1280, 800)).toBe(false);
    expect(isPhoneViewport(1366, 650)).toBe(false);
  });
});
