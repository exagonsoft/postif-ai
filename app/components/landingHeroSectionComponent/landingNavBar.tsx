"use client";

import React, { useEffect, useRef, useState } from "react";
import TextIcon from "../ui/textIcon";
import Image from "next/image";
import { landingNavbarItems } from "@/app/constants/navBarItems";
import Link from "next/link";
import useMobile from "@/app/hooks/useMobile";
import { motion, useCycle } from "framer-motion";
import { MenuToggle } from "../ui/menuToggle";
import { useDimensions } from "@/app/hooks/useDimensions";

const variants = {
  open: {
    y: 0,
    opacity: 1,
    transition: {
      y: { stiffness: 1000, velocity: -100 },
    },
  },
  closed: {
    y: 50,
    opacity: 0,
    transition: {
      y: { stiffness: 1000 },
    },
  },
};

const sidebar = {
  open: (height = 1000) => ({
    clipPath: `circle(${height * 2 + 200}px at 84% 40px)`,
    transition: {
      type: "spring",
      stiffness: 20,
      restDelta: 2,
    },
  }),
  closed: {
    clipPath: "circle(20px at 84% 40px)",
    transition: {
      delay: 0.5,
      type: "spring",
      stiffness: 400,
      damping: 40,
    },
  },
};

const sidebarBlur = {
  open: (height = 1000) => ({
    clipPath: `circle(${height * 2 + 200}px at 84% 40px)`,
    transition: {
      type: "spring",
      stiffness: 20,
      restDelta: 2,
    },
  }),
  closed: {
    clipPath: "circle(0px at 86% 40px)",
    transition: {
      delay: 0.5,
      type: "spring",
      stiffness: 400,
      damping: 40,
    },
  },
};

const LandingNavBarItem = ({
  itemText,
  itemLink,
  activeSection,
  onSelected,
}: {
  itemText: string;
  itemLink: string;
  activeSection: string;
  onSelected: (item: string) => void;
}) => {
  return (
    <Link
      href={itemLink}
      className={`${
        itemText === activeSection ? "border-white border-opacity-100" : ""
      } border-b-2 border-transparent border-opacity-0 hover:border-white hover:border-opacity-100 transition-all ease-in-out duration-300`}
      onClick={() => onSelected(itemText)}
    >
      <span className="text-white text-lg">{itemText}</span>
    </Link>
  );
};

const MenuItem = ({
  item,
  onClick,
}: {
  item: { text: string; link: string };
  onClick?: () => void;
}) => {
  return (
    <motion.li
      variants={variants}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      className="text-lg"
    >
      <Link href={item.link} className="text-lg font-bold" onClick={onClick}>
        {item.text}
      </Link>
    </motion.li>
  );
};

export const Navigation = ({ onClick }: { onClick?: () => void }) => (
  <motion.ul
    variants={variants}
    className="absolute top-12 w-max p-4 gap-4 left-4 z-50"
  >
    {landingNavbarItems.map((_item, indx) => (
      <MenuItem item={_item} key={indx} onClick={onClick} />
    ))}
  </motion.ul>
);

const SideMenuBar = () => {
  const [isOpen, toggleOpen] = useCycle(false, true);
  const containerRef = useRef<HTMLElement>(null);
  const { height } = useDimensions(containerRef);

  useEffect(() => {
    if (isOpen) {
      const body = document.getElementById("body");
      if (body) {
        body.style.overflow = "hidden";
      }
    } else {
      const body = document.getElementById("body");
      if (body) {
        body.style.overflow = "auto";
      }
    }
  }, [isOpen]);

  return (
    <motion.nav
      initial={false}
      animate={isOpen ? "open" : "closed"}
      custom={height}
      ref={containerRef}
      className="fixed w-2/3 top-0 right-0 z-50"
      variants={{
        open: {
          height: "100vh",
          transition: { type: "spring", stiffness: 400, damping: 40 },
        },
        closed: {
          height: "4rem",
          transition: {
            type: "spring",
            stiffness: 400,
            damping: 40,
            delay: 0.5,
          },
        },
      }}
    >
      <motion.div
        className="bg-primary flex h-full justify-center items-center p-4 relative z-50 shadow-left rounded-tl-lg rounded-bl-lg"
        variants={sidebar}
      ></motion.div>
      <motion.div
        className="glass-dark flex h-full fixed top-0 left-0 w-screen justify-center items-center p-4 z-40"
        variants={sidebarBlur}
      ></motion.div>
      <MenuToggle
        toggle={() => toggleOpen()}
        className="top-8 z-50 right-[12%] md:right-[14%] lg:right-[14.3%] absolute text-white"
      />
      <Navigation onClick={() => toggleOpen()} />
    </motion.nav>
  );
};

const LandingNavBar = () => {
  const [activeSection, SetActiveSection] = useState("");
  const isMobile = useMobile();
  return (
    <nav className="w-full flex items-center justify-between fixed top-0 left-0 z-30 max-h-24 p-4 md:p-16 py-4 md:py-4 bg-transparent shadow-md shadow-slate-800/25 transition-all ease-in-out duration-300">
      <div className="absolute top-0 left-0 w-full h-full navigation-blur-background"></div>
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
        onClick={() => SetActiveSection("")}
      />
      {!isMobile ? (
        <>
          <div className="flex px-4 gap-6 items-end relative">
            {landingNavbarItems.map((_navBarItem, _index) => (
              <LandingNavBarItem
                key={_index}
                itemText={_navBarItem.text}
                itemLink={_navBarItem.link}
                activeSection={activeSection}
                onSelected={(selected) => SetActiveSection(selected)}
              />
            ))}
          </div>
          <div className="flex items-center justify-center relative">
            <button className="px-4 py-2  text-white font-bold rounded-lg border-2 border-transparent border-opacity-0 hover:border-secondary hover:border-opacity-100 transition-all ease-in-out duration-300">
              Login 🔑
            </button>
            <button className="px-4 py-2  text-white font-bold rounded-lg border-2 border-transparent border-opacity-0 hover:border-secondary hover:border-opacity-100 transition-all ease-in-out duration-300">
              Signup 📑
            </button>
          </div>
        </>
      ) : (
        <SideMenuBar />
      )}
    </nav>
  );
};

export default LandingNavBar;
