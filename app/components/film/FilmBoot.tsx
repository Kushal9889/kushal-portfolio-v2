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
 *
 * It also applies the reader's motion choice (the Motion button in the dock,
 * saved as localStorage "motion" = "allowed" | "reduced"). Unset means
 * "allowed": full motion is the default whatever the OS setting, and the dock
 * button is how a reader turns it off. It sets data-motion-pref for
 * reducedMotion() in lib/verbs.ts, and rewrites every
 * (prefers-reduced-motion: ...) clause in the page's stylesheets to a constant,
 * so the CSS animations follow the same choice without a duplicate rule each.
 */
const BOOT = `(function(){try{var d=document.documentElement,p=null;try{p=localStorage.getItem("motion")}catch(e){}if(p!=="reduced")p="allowed";if(p){d.dataset.motionPref=p;var on=p==="allowed",T="(min-width: 0px)",F="(max-width: 0.01px)",flip=function(rs){for(var i=0;i<rs.length;i++){var r=rs[i];if(r.media&&/prefers-reduced-motion/.test(r.media.mediaText)){r.media.mediaText=r.media.mediaText.replace(/\\(prefers-reduced-motion:\\s*no-preference\\)/g,on?T:F).replace(/\\(prefers-reduced-motion:\\s*reduce\\)/g,on?F:T)}if(r.cssRules)flip(r.cssRules)}},all=function(){for(var i=0;i<document.styleSheets.length;i++){try{flip(document.styleSheets[i].cssRules)}catch(e){}}};document.addEventListener("DOMContentLoaded",all);addEventListener("load",all);new MutationObserver(all).observe(document.head,{childList:true})}var calm=p?p==="reduced":matchMedia("(prefers-reduced-motion: reduce)").matches,n=navigator,c=n.connection||{},q=new URLSearchParams(location.search).get("film");if(q==="off"||q==="still"||calm)return;d.dataset.film="live";d.dataset.filmPre="1";setTimeout(function(){if(d.dataset.filmPre&&d.dataset.film==="live"){delete d.dataset.film;delete d.dataset.filmPre}},10000)}catch(e){}})()`;

export default function FilmBoot() {
  return <script dangerouslySetInnerHTML={{ __html: BOOT }} />;
}
