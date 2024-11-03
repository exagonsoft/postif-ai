import { features, testimonials } from "@/app/constants/contentConstants";
import SectionWrapper from "@/app/containers/sectionWrapper";
import { Langs } from "@/lang/langs";
import { textRenderer } from "@/lib/utils";
import React from "react";
import FeatureCard from "../ui/featureCard";
import Image from "next/image";
import AdvantageCard from "../ui/advantageCard";
import { FaClock } from "react-icons/fa";
import { FeedbackCards } from "../ui/feedbackCard";

const FeaturesSection = () => {
  return (
    <SectionWrapper
      sectionId="features"
      className="flex flex-col gap-12 items-center"
    >
      <div className="w-full flex flex-col relative z-10">
        <h1 className="text-white text-center text-2xl md:text-3xl lg:text-5xl font-bold">
          {textRenderer(Langs["en"].landing.featuresTitle)[0]}{" "}
          <span className="text-primary">
            {textRenderer(Langs["en"].landing.featuresTitle)[1]}
          </span>
          {textRenderer(Langs["en"].landing.featuresTitle)[2]}
        </h1>
        <h1 className="text-white text-center text-2xl md:text-3xl lg:text-5xl font-bold">
          {textRenderer(Langs["en"].landing.featuresTitle)[3]}{" "}
          <span className="text-primary">{Langs.appTitle}</span>
        </h1>
      </div>
      <div className="w-full flex flex-col justify-center items-center gap-12 relative z-10">
        {features.map((feature, indx) => (
          <FeatureCard
            key={indx}
            feature={feature}
            switchOrder={indx % 2 !== 0}
          />
        ))}
      </div>
      <div className="w-full lg:w-[90%] 2xl:w-[80%] flex items-start justify-center max-h-max  relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3  gap-4 p-4 rounded-lg">
          <div className="bg-indigo-600/35 flex flex-col h-full rounded-xl p-4">
            <AdvantageCard
              id="advantage1"
              icon={<FaClock />}
              text="Expected Time saved After moving PostifAI."
              percent={86}
            />
          </div>
          <div className="bg-indigo-600/35 flex flex-col h-full rounded-xl p-4">
            <AdvantageCard
              id="advantage1"
              icon={<FaClock />}
              text="Expected Time saved After moving PostifAI."
              percent={86}
            />
          </div>
          <div className="bg-indigo-600/35 max-h-max rounded-xl p-8 pb-0 pr-0 row-span-1 sm:row-span-2">
            <Image
              src={"/counter-img-1.jpg"}
              alt="Counter"
              width={500}
              height={800}
              className="rounded-tl-lg rounded-br-xl w-full h-full max-h-[33rem]"
            />
          </div>
          <div className="bg-indigo-600/35 flex flex-col h-full justify-center rounded-xl col-span-1 md:col-span-2">
            <FeedbackCards items={testimonials} direction="left" speed="slow" />
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
};

export default FeaturesSection;
