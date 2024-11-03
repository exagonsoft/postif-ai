import { ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const textRenderer = (text: string) => {
    let _stringResult = [];
    _stringResult = text.split("-");
    return _stringResult;
}
