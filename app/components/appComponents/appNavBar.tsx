import React from "react";
import TextIcon from "../ui/textIcon";
import Image from "next/image";

const AppNavBar = () => {
  return (
    <nav className="w-full flex items-center justify-between fixed top-0 left-0 z-30 max-h-24 p-4 md:p-16 py-4 md:py-4 bg-transparent shadow-md shadow-slate-800/25 transition-all ease-in-out duration-300">
      <div className="absolute top-0 left-0 w-full h-full navigation-blur-background"></div>
      <div className="flex justify-start items-center">
        <TextIcon
          icon={
            <Image
              src={"/company-logo.png"}
              alt="P"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              priority={true}
              className="relative h-auto"
            />
          }
          text="ostifAI"
          href="/"
        />
      </div>
      <div className=""></div>
    </nav>
  );
};

export default AppNavBar;
