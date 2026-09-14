import type { Metadata } from "next";
import ClassicPage from "../ClassicPage";

/** The previous page, kept reachable while the stage chapters replace it. */
export const metadata: Metadata = {
  title: "Complete record",
  robots: { index: false, follow: false },
};

export default ClassicPage;
