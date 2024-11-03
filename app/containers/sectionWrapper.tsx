import { cn } from "@/lib/utils";
import React, { ReactNode } from "react";

const SectionWrapper = ({
  children,
  sectionId,
  className,
}: {
  children: ReactNode;
  sectionId?: string;
  className?: string;
}) => {
  return (
    <section
      id={sectionId}
      className={cn(
        "w-full h-full p-4 px-8 pt-24  md:pt-36 relative",
        className
      )}
    >
      

      {children}
    </section>
  );
};

export default SectionWrapper;
