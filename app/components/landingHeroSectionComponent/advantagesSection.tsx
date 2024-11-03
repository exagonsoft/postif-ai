import SectionWrapper from "@/app/containers/sectionWrapper";
import React from "react";
import { HoverEffect } from "../ui/card-hover-effect";
import { advantages, usesCarrousel } from "@/app/constants/contentConstants";
import { Langs } from "@/lang/langs";
import { textRenderer } from "@/lib/utils";
import { InfiniteMovingCards } from "../ui/infiniteMovingCards";

const AdvantagesSection = () => {
  return (
    <SectionWrapper
      sectionId="advantages"
      className="flex flex-col gap-4 items-center"
    >
      <div className="w-full lg:w-[90%] 2xl:w-[80%] flex flex-col gap-4 items-center">
        <h1 className="text-white text-center text-2xl md:text-3xl lg:text-5xl font-bold w-full capitalize relative z-10">
          {`${textRenderer(Langs["en"].landing.advantageTitle)[0]} `}
          <span className="text-primary">{Langs.appTitle}</span>
          {` ${textRenderer(Langs["en"].landing.advantageTitle)[1]}`}
        </h1>
        <HoverEffect items={advantages} className="relative z-10" />
        <div className="h-full w-full 2xl:w-[90%] rounded-md flex flex-col antialiased bg-transparent dark:bg-black dark:bg-grid-white/[0.05] items-center justify-center relative overflow-hidden z-10">
          <InfiniteMovingCards
            items={usesCarrousel}
            direction="right"
            speed="slow"
          />
        </div>
      </div>
    </SectionWrapper>
  );
};

export default AdvantagesSection;
