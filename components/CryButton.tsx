'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  /** 叫声地址（data 里的 cryUrl，指向 PokeAPI cries CDN） */
  cryUrl: string;
  /** 宝可梦中文名，用于无障碍标签 */
  nameZh: string;
}

/**
 * 叫声播放按钮。
 *
 * 直接播 CDN 上的 ogg（YJ 定的：不下载到本地，省仓库体积）。
 * 状态机只有三个：idle / playing / failed —— 加载失败（CDN 不可达、
 * 浏览器不支持 ogg）就把按钮置灰并改文案，不会一直转圈。
 *
 * 通用性：只吃 pokemon.cryUrl，与具体是哪只无关，加宝可梦不用改这里。
 */
export default function CryButton({ cryUrl, nameZh }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  // 离开页面时停掉声音，避免「人都走了还在叫」
  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  const play = useCallback(() => {
    if (!cryUrl || failed) return;

    // 每次新建实例：同一个实例连续 play() 在部分浏览器里不会从头开始
    audioRef.current?.pause();
    const audio = new Audio(cryUrl);
    audioRef.current = audio;

    const settle = () => setPlaying(false);
    audio.addEventListener('ended', settle);
    audio.addEventListener('error', () => {
      setFailed(true);
      settle();
    });

    setPlaying(true);
    void audio.play().catch(() => {
      setFailed(true);
      settle();
    });
  }, [cryUrl, failed]);

  const disabled = !cryUrl || failed;

  return (
    <button
      type="button"
      onClick={play}
      disabled={disabled}
      aria-label={failed ? '叫声不可用' : `播放${nameZh}的叫声`}
      data-testid="cry-button"
      data-state={failed ? 'failed' : playing ? 'playing' : 'idle'}
      className={[
        'theme-fill inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold no-underline transition-[transform,opacity] duration-150',
        disabled ? 'cursor-not-allowed opacity-55' : 'hover:-translate-y-0.5 active:translate-y-0',
        playing ? 'scale-[0.97]' : '',
      ].join(' ')}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[16px] shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 9v6h4l5 4V5L8 9z" />
        <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      </svg>
      {failed ? '叫声不可用' : playing ? '播放中…' : '叫一声'}
    </button>
  );
}
