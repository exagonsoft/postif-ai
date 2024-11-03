"use client";

import * as React from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { faqsQuestions } from "@/app/constants/contentConstants";
import "./accordionStyles.css";

const AccordionComponent = ({
  question,
  expanded,
  setExpanded,
}: {
  question: { id: number; question: string; answer: string };
  expanded: number | boolean;
  setExpanded: React.Dispatch<React.SetStateAction<number | false>>;
}) => {
  const isOpen = question.id === expanded;

  // By using `AnimatePresence` to mount and unmount the contents, we can animate
  // them in and out while also only rendering the contents of open accordions
  return (
    <>
      <motion.header
        initial={false}
        animate={{ backgroundColor: isOpen ? "#f770ff" : "#4f46e559", color: isOpen ? "black" : "white" }}
        onClick={() => setExpanded(isOpen ? false : question.id)}
        className="w-full flex justify-start items-center p-4 py-6 pr-0 text-[.9rem] md:text-xl xl:text-2xl font-bold"
      >{question.question}</motion.header>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.section
            key="content"
            initial="collapsed"
            animate="open"
            exit="collapsed"
            variants={{
              open: { opacity: 1, height: "auto" },
              collapsed: { opacity: 0, height: 0 },
            }}
            transition={{ duration: 0.8, ease: [0.04, 0.62, 0.23, 0.98] }}
          >
            <motion.div
              variants={{ collapsed: { scale: 0.8 }, open: { scale: 1 } }}
              transition={{ duration: 0.8 }}
              className="content-placeholder"
            >
              <p className="text-white p-4 py-0 text-sm md:text-lg xl:text-xl">{question.answer}</p>
            </motion.div>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
};

const Accordion = () => {
  // This approach is if you only want max one section open at a time. If you want multiple
  // sections to potentially be open simultaneously, they can all be given their own `useState`.
  const [expanded, setExpanded] = useState<false | number>(0);

  return faqsQuestions.map((_question, indx) => (
    <AccordionComponent
      key={indx}
      question={_question}
      expanded={expanded}
      setExpanded={setExpanded}
    />
  ));
};

export default Accordion;
