import Image from "next/image";
import Link from "next/link";
import React from "react";

const UseCaseCard = ({
  useCase,
}: {
  useCase: {
    title: string;
    description: string;
    imageUrl: string;
    link: string;
  };
}) => {
  return (
    <div className="group w-full h-full p-4 rounded-lg flex flex-col items-stretch justify-start gap-4 border bg-indigo-600/35 border-primary/35 relative">
      <div className="w-full h-full">
        <Image
          src={useCase.imageUrl}
          alt="Use Case"
          width={512}
          height={512}
          className="w-12 h-12 group-hover:scale-75 transition-all ease-in-out duration-300"
        />
      </div>
      <div className="w-full h-full flex flex-col gap-4 justify-start items-start">
        <h1 className="text-white text-xl md:text-2xl xl:text-3xl">
          {useCase.title}
        </h1>
        <p className="text-white/45 md:text-lg xl:text-xl">
          {useCase.description}
        </p>
      </div>
      <div className="w-full h-full relative  bottom-0 left-0 flex flex-col gap-4 justify-end items-start">
        <Link
          href={useCase.link}
          className="mt-4 text-white hover:underline transition-all ease-in-out duration-200 underline-offset-4"
        >
          Get Started ↗️
        </Link>
      </div>
    </div>
  );
};

export default UseCaseCard;
