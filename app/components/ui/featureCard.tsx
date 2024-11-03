import Image from "next/image";
import React from "react";
import BorderMagicLink from "./borderMagicLink";

const FeatureCard = ({
  feature,
  switchOrder,
}: {
  feature: {
    title: string;
    subTitle: string;
    pictureUrl: string;
    details: string[];
  };
  switchOrder?: boolean;
}) => {
  return (
    <div className="w-full lg:w-[90%] 2xl:w-[80%] flex flex-col md:flex-row p-4 gap-4 relative feature-bg">
      <div className={`${switchOrder ? 'order-2' : 'order-1'} w-full md:w-1/2 flex flex-col gap-4 p-4 py-8`}>
        <h1 className="text-white text-xl md:text-2xl xl:text-3xl">
          {feature.title}
        </h1>
        <h3 className="text-white/65 text-md md:text-xl xl:text-2xl">
          {feature.subTitle}
        </h3>
        <ul className="">
          {feature.details.map((_detail: string, indx) => (
            <li
              key={indx}
              className="w-full flex gap-4 justify-start items-start"
            >
              <span className="text-[.6rem] p-[2px] rounded-full border border-primary/85 translate-y-1">
                ✔️
              </span>
              <p className="text-white/45 md:text-lg xl:text-xl">{_detail}</p>
            </li>
          ))}
        </ul>
        <div className="w-full flex justify-center md:justify-start">
          <BorderMagicLink href="/dashboard" text="Start Creating Free ✒️" />
        </div>
      </div>
      <div className={`${switchOrder ? 'order-1' : 'order-2'} w-full md:w-1/2 h-[12rem] md:h-[28rem] p-4 rounded-lg bg-indigo-600/45 relative`}>
        <Image
          src={feature.pictureUrl}
          alt="Feature"
          width={800}
          height={800}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        priority={true}
          className="rounded-lg w-full h-full"
        />
      </div>
    </div>
  );
};

export default FeatureCard;
