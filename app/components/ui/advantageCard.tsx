/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import React, { ReactNode, useEffect, useState } from "react";
import { animate, inView } from "framer-motion";

const AdvantageCard = ({
  text,
  icon,
  percent,
  id,
}: {
  text: string;
  icon: ReactNode;
  percent: number;
  id: string;
}) => {
  const [card, SetCard] = useState<HTMLElement>();

  inView(
    card!,
    (info) => {
      console.log("From Framer Motion: ", info);

      const animation = animate(info.target, { opacity: 1 });
      return () => animation.stop();
    },
    { root: card! }
  );
  useEffect(() => {
    const featuresSection = document.getElementById(id);
    SetCard(featuresSection!);
  }, []);
  return (
    <div id={id} className="w-full h-full max-h-max flex flex-col gap-8 justify-center ">
      <div className="flex justify-center items-center gap-4">
        <span className="text-[3rem] xl:text-[4rem] text-white">{icon}</span>
        <span className="text-[3rem] xl:text-[4rem] text-white">{percent}%</span>
      </div>
      <hr className="bg-primary border-primary" />
      <div className="text-lg xl:text-2xl text-white">{text}</div>
    </div>
  );
};

export default AdvantageCard;
