"use client";

import dynamic from "next/dynamic";

/** Client boundary so the server page can mount the film without rendering it. */
const Film = dynamic(() => import("./Film"), { ssr: false });

export default function FilmMount() {
  return <Film />;
}
