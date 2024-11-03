import React from "react";
import { Langs } from "@/lang/langs";

import Image from "next/image";
import { textRenderer } from "@/lib/utils";
import Link from "next/link";
import SectionWrapper from "@/app/containers/sectionWrapper";
import BorderMagicLink from "../ui/borderMagicLink";

const HeroSection = () => {
  return (
    <SectionWrapper
      sectionId="home"
      className="flex flex-col gap-4 justify-center items-center"
    >
      <div className="w-full lg:w-[90%] 2xl:w-[80%] flex flex-col p-4 justify-center items-center gap-6">
        <div className="w-full flex flex-col relative z-10">
          <h1 className="text-white text-center text-2xl md:text-3xl lg:text-5xl font-bold">
            {textRenderer(Langs["en"].landing.title)[0]}{" "}
            <span className="text-primary">
              {textRenderer(Langs["en"].landing.title)[1]}
            </span>
            {textRenderer(Langs["en"].landing.title)[2]}
          </h1>
          <h1 className="text-white text-center text-2xl md:text-3xl lg:text-5xl font-bold">
            {textRenderer(Langs["en"].landing.subTitle)[0]}{" "}
            <span className="text-primary">
              {textRenderer(Langs["en"].landing.subTitle)[1]}
            </span>
            {textRenderer(Langs["en"].landing.subTitle)[2]}
          </h1>
        </div>
        <div className="flex flex-col md:flex-row justify-center items-center gap-4 mt-6 relative z-10">
          <BorderMagicLink href="/dashboard" text="Start Creating Free ✒️" />
          <Link
            href={"#advantages"}
            className="px-4 py-2  text-white font-bold rounded-lg border-2 border-transparent border-opacity-0 hover:border-secondary hover:border-opacity-100 transition-all ease-in-out duration-300"
          >
            Learn More 👇
          </Link>
        </div>
        <div className="w-full flex flex-col justify-center items-center md:flex-col gap-6 mb-8 relative h-[25vh] md:h-[40vh] xl:h-[60vh] z-10">
          <Image
            src={"/posting-tool.png"}
            alt="PostifAI"
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1366px) 50vw, 33vw"
            priority={true}
            className="w-full h-full"
          />
        </div>
      </div>
    </SectionWrapper>
  );
};

export default HeroSection;
