/**
 * Sets the film's page mode before the first paint.
 *
 * The live film restyles the sections and opens a window (FilmTransit) between
 * each pair of them, which together doubled the page height. Both waited for the
 * engine to boot, so on a desktop the Work section sat 64 px up the first screen
 * and then jumped 2,250 px down about 330 ms later (layout shift 0.071). This
 * script runs the same cheap gates as canRun() in Film.tsx, and when they pass
 * it marks the page live at once; the engine confirms it on start and clears
 * data-film-pre. A device that fails a later gate (no WebGL2) is moved to the
 * still frame by Film.tsx as before, and if the engine never starts the
 * fallback below hands the page back its plain classic layout after 10 s.
 */
const BOOT = `(function(){try{var d=document.documentElement,n=navigator,c=n.connection||{},q=new URLSearchParams(location.search).get("film");if(q==="off"||q==="still"||c.saveData||matchMedia("(prefers-reduced-motion: reduce)").matches)return;if(innerWidth<768&&/^(slow-2g|2g|3g)$/.test(c.effectiveType||""))return;if((n.deviceMemory||8)<=4&&(n.hardwareConcurrency||8)<=4)return;d.dataset.film="live";d.dataset.filmPre="1";setTimeout(function(){if(d.dataset.filmPre&&d.dataset.film==="live"){delete d.dataset.film;delete d.dataset.filmPre}},10000)}catch(e){}})()`;

export default function FilmBoot() {
  return <script dangerouslySetInnerHTML={{ __html: BOOT }} />;
}
