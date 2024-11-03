import React, { ReactNode } from "react";
import LandingNavBar from "../components/landingHeroSectionComponent/landingNavBar";

const LandingLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="w-full flex flex-col overflow-hidden bg-bgBackground">
      <div className="fixed top-[40%] left-0 w-full h-[50%] z-[1] block opacity-30">
        <div className="container-shape-1 float-bob-x"></div>
        <div className="container-shape-2 float-bob-y"></div>
        <div className="container-shape-3 float-bob-x"></div>
      </div>
      <LandingNavBar />
      {children}
    </div>
  );
};

export default LandingLayout;
