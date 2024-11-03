"use client";

import SectionWrapper from "@/app/containers/sectionWrapper";
import { Langs } from "@/lang/langs";
import React, { useState } from "react";
import PricingCards from "../ui/pricingCards";

const PricingSection = () => {
  const [payPeriod, SetPayPeriod] = useState("yearly");

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    SetPayPeriod(event.target.value);
  };

  const getPayDiscount = (): number => {
    let _discount = 0;

    switch (payPeriod) {
      case "yearly":
        _discount = 20;
        break;
      case "2years":
        _discount = 30;
        break;

      default:
        _discount = 0;
        break;
    }

    return _discount;
  };

  return (
    <SectionWrapper
      sectionId="pricing"
      className="flex flex-col gap-4 items-center"
    >
      <div className="w-full lg:w-[90%] 2xl:w-[80%] flex flex-col gap-4 items-center relative z-10">
        <h1 className="text-white text-center text-2xl md:text-3xl lg:text-5xl font-bold w-full capitalize relative z-10">
          {Langs["en"].landing.pricingTitle}
        </h1>
        <div className="w-full lg:w-[90%] 2xl:w-[80%] flex items-start justify-center mt-8 max-h-max relative z-10">
          <div className="w-full md:w-max flex justify-start items-center md:justify-center gap-8 relative">
            <div className="flex flex-col md:flex-row justify-start md:justify-center gap-2 items-start md:items-center md:space-x-8">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="monthly"
                  name="choice"
                  className="hidden peer"
                  checked={payPeriod === "monthly"}
                  value={"monthly"}
                  onChange={handleChange}
                />
                <label
                  htmlFor="monthly"
                  className="w-6 h-6 border-2 border-gray-300 rounded-full flex items-center justify-center cursor-pointer peer-checked:bg-blue-500 peer-checked:border-blue-500"
                >
                  <span className="w-3 h-3 bg-white rounded-full peer-checked:bg-white"></span>
                </label>
                <label
                  htmlFor="monthly"
                  className="text-gray-100 cursor-pointer capitalize font-bold"
                >
                  Pay monthly
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="1year"
                  name="choice"
                  className="hidden peer"
                  checked={payPeriod === "yearly"}
                  value={"yearly"}
                  onChange={handleChange}
                />
                <label
                  htmlFor="1year"
                  className="w-6 h-6 border-2 border-gray-300 rounded-full flex items-center justify-center cursor-pointer peer-checked:bg-blue-500 peer-checked:border-blue-500"
                >
                  <span className="w-3 h-3 bg-white rounded-full peer-checked:bg-white"></span>
                </label>
                <label
                  htmlFor="1year"
                  className="text-gray-100 cursor-pointer capitalize font-bold"
                >
                  Pay one year
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="2years"
                  name="choice"
                  className="hidden peer"
                  checked={payPeriod === "2years"}
                  value={"2years"}
                  onChange={handleChange}
                />
                <label
                  htmlFor="2years"
                  className="w-6 h-6 border-2 border-gray-300 rounded-full flex items-center justify-center cursor-pointer peer-checked:bg-blue-500 peer-checked:border-blue-500"
                >
                  <span className="w-3 h-3 bg-white rounded-full peer-checked:bg-white"></span>
                </label>
                <label
                  htmlFor="2years"
                  className="text-gray-100 cursor-pointer capitalize font-bold"
                >
                  Pay two years
                </label>
              </div>
            </div>
            {payPeriod != "monthly" && (
              <span className="flex justify-center items-center font-bold text-secondary bg-indigo-600/35 rounded-md p-6 py-1 absolute top-6 md:-top-[.4rem] right-8 md:-right-28">{`${getPayDiscount()}% off`}</span>
            )}
          </div>
        </div>
        <div className="w-full  flex items-start justify-center mt-8 max-h-max relative z-10">
          <PricingCards discount={getPayDiscount()}/>
        </div>
      </div>
    </SectionWrapper>
  );
};

export default PricingSection;
