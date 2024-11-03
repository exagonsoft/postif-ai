import { cn } from "@/lib/utils";
import React, { ReactNode } from "react";

const SimpleCard = ({ icon, text, extraClass }: { icon: ReactNode; text?: string, extraClass?:string }) => {
  return (
    <div className={cn("p-8 py-4 rounded-lg shadow-md flex flex-col gap-4 justify-center items-center bg-slate-300/15", extraClass)}>
      {icon}
      {text && <span className="text-white max-w-20 text-center">{text}</span>}
    </div>
  );
};

export default SimpleCard;
