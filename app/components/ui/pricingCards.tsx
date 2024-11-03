import { prices } from "@/app/constants/contentConstants";
import React, { useEffect } from "react";
import BorderMagicButton from "./borderMagicButton";

const PricingCard = ({
  price,
  discount,
}: {
  price: { title: string; cost: number; features: string[] };
  discount: number;
}) => {
  const getDiscountedPrice = (): number => {
    let _finalPrice = price.cost;

    if (discount != 0) {
      const _percent = Math.floor((discount * price.cost) / 100);
      _finalPrice = _finalPrice - _percent;
    }

    return _finalPrice;
  };

  const getSubscriptionPeriod = (): string => {
    let _subscriptionDetails = "";

    switch (discount) {
      case 0:
        _subscriptionDetails = "*Billed monthly until cancelled";
        break;
      case 20:
        _subscriptionDetails = "*Billed yearly until cancelled";
        break;
      case 30:
        _subscriptionDetails = "*Billed every 2 years until cancelled";
        break;

      default:
        _subscriptionDetails = "*Billed monthly until cancelled";
        break;
    }

    return _subscriptionDetails;
  };
  return (
    <div className="group w-full h-full p-6 px-8 rounded-lg flex flex-col gap-6 border border-blue-700/55 bg-indigo-600/35 hover:border-secondary transition-all ease-in-out duration-300 shadow-lg hover:shadow-sm">
      <div className="w-full flex justify-between">
        <span className="text-lg md:text-xl lg:text-2xl font-bold text-secondary/75 capitalize">
          {price.title}
        </span>
        {price.title === "starter" && (
          <span className="font-bold text-orange-600 uppercase">Popular</span>
        )}
      </div>
      <span className="text-2xl md:text-3xl lg:text-5xl font-bold text-white">{`$${getDiscountedPrice().toFixed(
        2
      )}`}</span>
      <div className="w-full flex flex-col gap-2 justify-center items-start">
        <BorderMagicButton text="Start For Free" />
        <p className="text-gray-500/75 md:text-md lg:text-lg">
          {getSubscriptionPeriod()}
        </p>
      </div>
      <ul className="flex flex-col gap-2 mt-2">
        {price.features.map((feature, indx) => (
          <li
            key={indx}
            className="flex items-center text-gray-200 md:text-md lg:text-lg"
          >
            🔸 {feature}
          </li>
        ))}
      </ul>
    </div>
  );
};

const PricingCards = ({ discount }: { discount: number }) => {
  useEffect(() => {}, [discount]);
  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4">
      {prices.map((_price, indx) => (
        <PricingCard key={indx} price={_price} discount={discount} />
      ))}
    </div>
  );
};

export default PricingCards;
