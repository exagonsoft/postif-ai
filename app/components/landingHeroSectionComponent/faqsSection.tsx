import SectionWrapper from "@/app/containers/sectionWrapper";
import { Langs } from "@/lang/langs";
import { textRenderer } from "@/lib/utils";
import React from "react";
import Accordion  from "../ui/accordion";

const FaqsSection = () => {
  return (
    <SectionWrapper
      sectionId="faqs"
      className="flex flex-col gap-4 items-center"
    >
      <div className="w-full lg:w-[90%] 2xl:w-[80%] flex flex-col gap-4 items-center relative z-10">
        <h1 className="text-white text-center text-2xl md:text-3xl lg:text-5xl font-bold">
          {textRenderer(Langs["en"].landing.faqsTitle)[0]}{" "}
          <span className="text-primary">{Langs.appTitle}?</span>
        </h1>
        <h1 className="text-white text-center text-2xl md:text-3xl lg:text-5xl font-bold">
          {textRenderer(Langs["en"].landing.faqsTitle)[1]}
        </h1>

        <div className="w-full md:w-2/3 flex flex-col mt-12">
            <Accordion />
        </div>
      </div>
    </SectionWrapper>
  );
};

export default FaqsSection;
