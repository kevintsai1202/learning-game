/**
 * 手機版面的判斷（自己的家第 10.2 節，docs/plans/home.md）：螢幕寬 600px 以下，或橫式而且高 500px 以下（橫式手機）。
 * 平板與電腦照舊。usePhoneLayout 同時在 <html> 加上 phone class，CSS 用 :root.phone 選，判斷只有這一個來源
 * （不在 CSS 另寫一份 @media，兩邊才不會各判各的）。
 */
import { useEffect, useState } from 'react';

/** 這個畫面大小是不是手機（寬、高是 CSS px） */
export function isPhoneViewport(width: number, height: number): boolean {
  return width <= 600 || (width > height && height <= 500);
}

/** 現在的視窗是不是手機 */
function nowPhone(): boolean {
  return typeof window !== 'undefined' && isPhoneViewport(window.innerWidth, window.innerHeight);
}

/** 現在是不是手機版面（轉向、改視窗大小時跟著變）；同時在 <html> 加上 phone class 給 CSS 用 */
export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(nowPhone);
  useEffect(() => {
    const update = () => setPhone(nowPhone());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('phone', phone);
  }, [phone]);
  return phone;
}
