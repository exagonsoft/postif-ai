import React from "react";
import Link from "next/link";

export function BrandLogo({
  href = "/",
  compact = false,
  showByline = false,
}: {
  href?: string;
  compact?: boolean;
  showByline?: boolean;
}) {
  return (
    <Link href={href} className="group inline-flex items-center gap-3 focus:outline-none">
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-500 p-[1px] shadow-lg shadow-violet-600/25 transition-transform group-hover:scale-105">
        <div className="flex h-full w-full items-center justify-center rounded-[11px] bg-[#090d1c]">
          <svg
            viewBox="0 0 28 28"
            className="h-5 w-5"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M6 19.5V8.5C6 7.39543 6.89543 6.5 8 6.5H15.5C18.5376 6.5 21 8.96243 21 12C21 15.0376 18.5376 17.5 15.5 17.5H10.5"
              stroke="url(#postifai-grad)"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <circle cx="20.5" cy="20.5" r="2.75" fill="#22D3EE" />
            <path
              d="M10.5 21.5L14.5 17.5"
              stroke="#A78BFA"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient
                id="postifai-grad"
                x1="6"
                y1="6.5"
                x2="21"
                y2="20"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#A78BFA" />
                <stop offset="0.55" stopColor="#818CF8" />
                <stop offset="1" stopColor="#22D3EE" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {!compact && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-extrabold tracking-tight">
              POSTIF<span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">-AI</span>
            </span>
          </div>
          {showByline && (
            <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              by ExagonSoft
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
