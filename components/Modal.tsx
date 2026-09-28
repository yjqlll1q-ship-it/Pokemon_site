'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';

interface Props {
  onClose: () => void;
  /** 对话框标题元素的 id，供 aria-labelledby 使用 */
  labelledBy: string;
  /** 值变化时把面板滚回顶部（在弹窗内切换内容时用，不必重挂载） */
  scrollKey?: string | number;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * 通用对话框外壳：只管交互与可访问性，不掺业务。
 * 负责 Esc 关闭、点遮罩关闭、body 滚动锁、初始/离开时的焦点归属、Tab 焦点循环。
 */
export default function Modal({ onClose, labelledBy, scrollKey, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    document.body.dataset.scrollLocked = 'true';
    document.addEventListener('keydown', handleKeyDown);

    // 打开后把焦点送进面板，键盘/读屏用户不会"丢失"位置
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target =
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        panel.querySelector<HTMLElement>(FOCUSABLE) ??
        panel;
      target.focus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      delete document.body.dataset.scrollLocked;
      restoreRef.current?.focus?.();
    };
  }, [handleKeyDown]);

  // 弹窗内换内容时回到顶部，避免用户停留在上一只的滚动位置
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [scrollKey]);

  return (
    <div
      className="modal-veil animate-fade fixed inset-0 z-50 flex items-center justify-center p-6 max-[640px]:items-end max-[640px]:p-0"
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        className="animate-rise relative max-h-[min(92vh,900px)] w-[min(920px,100%)] overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface shadow-lg focus:outline-none max-[640px]:max-h-[92vh] max-[640px]:rounded-b-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        // 只有点在遮罩本身（不是面板内部）才关闭
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
