import type { Metadata } from "next";
import ClassicPage from "../ClassicPage";

/** Old address of the main page, kept so shared links still work. */
export const metadata: Metadata = {
  title: "Complete record",
  robots: { index: false, follow: false },
};

export default ClassicPage;
