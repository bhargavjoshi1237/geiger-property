"use client";

import Logo from "@geiger/ui/logo";
import { PlaygroundFrame } from "@/components/landing/playground_frame";
import styles from "@/components/landing/landing.module.css";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

// The real Property workspace on a sample portfolio, served from /playground and embedded as an iframe (mirrors geiger-events' showcase).
export default function PropertyPlaygroundShowcase() {
  return (
    <div className={`dark ${styles.playgroundShell}`}>
      <PlaygroundFrame src={`${BASE_PATH}/playground`} title="Geiger Property playground" className="!rounded-none !border-0" />
    </div>
  );
}
