"use client";

import dynamic from "next/dynamic";
import { LoadingArea } from "@geiger/ui/screen-kit";

// Client-only: the playground switches createClient() to the in-memory sandbox, which has to happen in the browser before any screen mounts.
const PropertyPlayground = dynamic(
  () => import("./property_playground").then((mod) => mod.PropertyPlayground),
  {
    ssr: false,
    loading: () => <LoadingArea size={80} label="Loading the playground" className="h-full bg-background" />,
  },
);

export default PropertyPlayground;
