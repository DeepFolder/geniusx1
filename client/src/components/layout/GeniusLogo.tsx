import lightWordmark from "@/assets/geniusx1-wordmark.svg";
import darkWordmark from "@/assets/geniusx1-wordmark-dark.svg";

interface Props {
  className?: string;
  alt?: string;
}

/** The shared bold GeniusX1 wordmark with theme-matched Genius lettering. */
export function GeniusLogo({ className = "h-8 w-auto", alt = "GeniusX1" }: Props) {
  return (
    <>
      <img src={lightWordmark} alt={alt} className={`${className} dark:hidden`} />
      <img src={darkWordmark} alt="" aria-hidden="true" className={`hidden ${className} dark:block`} />
    </>
  );
}
