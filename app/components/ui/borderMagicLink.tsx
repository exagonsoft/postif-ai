import { cn } from "@/lib/utils";
import Link from "next/link";
import React from "react";

const BorderMagicLink = ({
  onClick,
  text,
  href='/',
  className
}: {
  onClick?: () => void;
  text: string;
  href?: string;
  className?: string;
}) => {
  return (
    <Link
    href={href}
      onClick={onClick && onClick}
      className={cn("group relative inline-flex h-12 overflow-hidden rounded-lg p-[1.5px] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-50 ", className)}
    >
      <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)]" />
      <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-lg bg-slate-950 px-6 py-1 text-md font-bold text-white backdrop-blur-3xl hover:bg-primary/55 hover:text-black transition-all ease-in-out duration-300">
        {text}
      </span>
    </Link>
  );
};

export default BorderMagicLink;
