import { useCases } from "@/app/constants/contentConstants";
import SectionWrapper from "@/app/containers/sectionWrapper";
import { Langs } from "@/lang/langs";
import { textRenderer } from "@/lib/utils";
import React from "react";
import UseCaseCard from "../ui/useCaseCard";
import BorderMagicButton from "../ui/borderMagicButton";

const UseCasesSection = () => {
  return (
    <SectionWrapper
      sectionId="use-cases"
      className="flex flex-col gap-4 items-center"
    >
      <div className="w-full lg:w-[90%] 2xl:w-[80%] flex flex-col gap-4 items-center">
        <h1 className="text-white text-center text-2xl md:text-3xl lg:text-5xl font-bold w-full capitalize relative z-10">
          {`${textRenderer(Langs["en"].landing.useCasesTitle)[0]}`}
        </h1>
        <h1 className="text-white text-center text-2xl md:text-3xl lg:text-5xl font-bold">
          {`${textRenderer(Langs["en"].landing.useCasesTitle)[1]}`}
        </h1>
      </div>
      <div className="w-full lg:w-[90%] 2xl:w-[80%] flex items-start justify-center mt-8 max-h-max  relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 p-4 rounded-lg">
            {useCases.map((_case, indx) => (
                <UseCaseCard key={indx} useCase={_case}/>
            ))}
        </div>
      </div>
      <div className="w-full lg:w-[90%] 2xl:w-[80%] flex items-start justify-center mt-8 max-h-max  relative z-10">
      <BorderMagicButton text="See All Cases ↗️"/>
      </div>
    </SectionWrapper>
  );
};

export default UseCasesSection;
