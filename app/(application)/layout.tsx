import React, { ReactNode } from "react";
import AppNavBar from "../components/appComponents/appNavBar";

const AppLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-bgBackground">
      <AppNavBar />
      <div className="mt-20 w-full h-full">{children}</div>
    </div>
  );
};

export default AppLayout;
