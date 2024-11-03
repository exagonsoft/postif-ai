import {
  landingFooterCompanyLinks,
  landingFooterResourcesLinks,
} from "@/app/constants/contentConstants";
import SectionWrapper from "@/app/containers/sectionWrapper";
import { Langs } from "@/lang/langs";
import { textRenderer } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import React from "react";
import {
  FaDiscord,
  FaGithub,
  FaInstagram,
  FaLinkedin,
  FaTelegram,
  FaTwitter,
  FaYoutube,
} from "react-icons/fa6";

const LandingFooter = () => {
  return (
    <SectionWrapper
      sectionId="partnerships"
      className="flex flex-col gap-4 items-center"
    >
      <div className="w-full lg:w-[80%] 2xl:w-[60%] flex flex-col gap-4 items-center relative z-10">
        <div className="w-full flex flex-col md:flex-row flex-wrap gap-4 xl:gap-4">
          <div className="w-full md:w-1/5  flex flex-col justify-start items-start p-4">
            <div className="w-full flex items-start justify-start">
              <Image
                src={"/company-logo.png"}
                alt="P"
                width={128}
                height={128}
                className="w-8 h-10 -translate-y-3"
              />
              <span className="text-primary text-lg md:text-xl xl:text-2xl font-bold">
                ostifAI
              </span>
            </div>
            <p className="w-full text-gray-500 text-sm  2xl:text-lg text-left">
              {Langs["en"].landing.landingCompanyDescription}
            </p>
          </div>
          <div className="w-full md:w-1/5  flex flex-col justify-start items-start p-4 gap-4">
            <span className="text-lg text-white font-bold md:text-xl xl:text-2xl">
              {Langs["en"].landing.landingFooterCompanyHeader}
            </span>
            <ul className="w-full flex flex-col gap-1">
              {landingFooterCompanyLinks.map((_companyLink, indx) => (
                <li
                  key={indx}
                  className="hover:translate-x-4 transition-all ease-in-out duration-300 text-gray-500  hover:text-blue-600"
                >
                  <Link href={_companyLink.link} className="">
                    {_companyLink.text}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="w-full md:w-1/5  flex flex-col justify-start items-start p-4 gap-4">
            <span className="text-lg text-white font-bold md:text-xl xl:text-2xl">
              {Langs["en"].landing.landingFooterResourcesHeader}
            </span>
            <ul className="w-full flex flex-col gap-1">
              {landingFooterResourcesLinks.map((_companyLink, indx) => (
                <li
                  key={indx}
                  className="hover:translate-x-4 transition-all ease-in-out duration-300 text-gray-500  hover:text-blue-600"
                >
                  <Link href={_companyLink.link} className="">
                    {_companyLink.text}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="w-full md:w-1/3 flex flex-col justify-start items-start p-4 gap-4">
            <span className="text-lg text-white font-bold md:text-xl xl:text-2xl">
              {Langs["en"].landing.landingFooterResourcesHeader}
            </span>
            <form className="w-full flex items-center justify-between">
                <input type="email" required className="w-full h-full rounded-tl-lg rounded-bl-lg p-2 outline-none border"  />
                <button type="submit" className="rounded-tr-lg rounded-br-lg p-2 px-3 bg-indigo-600/35 border-2">🚀</button>
            </form>
            <div className="w-full flex gap-3 items-center">
              <Link
                href={"/"}
                className="text-gray-500 hover:text-blue-700 transition-all ease-in-out duration-300 text-lg"
              >
                {" "}
                <FaGithub />
              </Link>
              <Link
                href={"/"}
                className="text-gray-500 hover:text-blue-700 transition-all ease-in-out duration-300 text-lg"
              >
                <FaLinkedin />
              </Link>
              <Link
                href={"/"}
                className="text-gray-500 hover:text-blue-700 transition-all ease-in-out duration-300 text-lg"
              >
                <FaTwitter />
              </Link>
              <Link
                href={"/"}
                className="text-gray-500 hover:text-blue-700 transition-all ease-in-out duration-300 text-lg"
              >
                <FaInstagram />
              </Link>
              <Link
                href={"/"}
                className="text-gray-500 hover:text-blue-700 transition-all ease-in-out duration-300 text-lg"
              >
                <FaYoutube />
              </Link>
              <Link
                href={"/"}
                className="text-gray-500 hover:text-blue-700 transition-all ease-in-out duration-300 text-lg"
              >
                <FaDiscord />
              </Link>
              <Link
                href={"/"}
                className="text-gray-500 hover:text-blue-700 transition-all ease-in-out duration-300 text-lg"
              >
                <FaTelegram />
              </Link>
            </div>
          </div>
        </div>
        <span className="text-white w-full flex justify-center items-center text-center">{`${
          textRenderer(Langs["en"].copyright)[0]
        } 2013 - ${new Date().getFullYear().toString()} ${
          textRenderer(Langs["en"].copyright)[1]
        }`}</span>
      </div>
    </SectionWrapper>
  );
};

export default LandingFooter;
