import { trustedCompanies } from "@/app/constants/contentConstants";
import SectionWrapper from "@/app/containers/sectionWrapper";
import { Langs } from "@/lang/langs";
import { textRenderer } from "@/lib/utils";
import Image from "next/image";
import React from "react";
import BorderMagicLink from "../ui/borderMagicLink";

const TrustedSection = () => {
  return (
    <SectionWrapper
      sectionId="partnerships"
      className="flex flex-col gap-4 items-center"
    >
      <div className="w-full lg:w-[90%] 2xl:w-[80%] flex flex-col gap-4 items-center relative z-10">
        <h1 className="text-white text-center text-2xl md:text-3xl lg:text-5xl font-bold">
          {textRenderer(Langs["en"].landing.trustedTitle)[0]}{" "}
          <span className="text-primary">
            {textRenderer(Langs["en"].landing.trustedTitle)[1]}
          </span>
          {textRenderer(Langs["en"].landing.trustedTitle)[2]}
        </h1>
        <h1 className="text-white text-center text-2xl md:text-3xl lg:text-5xl font-bold">
          {textRenderer(Langs["en"].landing.trustedTitle)[3]}{" "}
        </h1>
        <div className="w-full flex flex-wrap gap-4 justify-between items-center mt-16">
          {trustedCompanies.map((_pictureUrl, indx) => (
            <Image
              key={indx}
              src={_pictureUrl}
              alt="Company"
              width={512}
              height={256}
              className="w-32 h-12"
            />
          ))}
        </div>
        <div className="w-full mt-16 p-12 rounded-lg border border-secondary feature-bg flex flex-col items-center gap-4">
          <span className="w-full text-center mb-8 text-sm md:text-lg text-orange-700">{Langs["en"].landing.trustedAdd}</span>
          <h1 className="text-white text-center text-xl md:text-2xl lg:text-4xl font-bold">
            {textRenderer(Langs["en"].landing.trustedSpan)[0]}
          </h1>
          <h1 className="text-white text-center text-xl md:text-2xl lg:text-4xl font-bold">
            {textRenderer(Langs["en"].landing.trustedSpan)[1]}
          </h1>
          <p className="text-gray-500 text-center mt-4">{Langs["en"].landing.trustedSpanSubtitle}</p>
          <BorderMagicLink href="/dashboard" text="Start Creating Free ✒️" className="mt-10  md:w-1/4 xl:1/5"/>
        </div>
      </div>
    </SectionWrapper>
  );
};

export default TrustedSection;
