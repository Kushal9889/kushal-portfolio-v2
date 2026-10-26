## Defects this page shipped and then fixed

Every one of these was live on this site or in its build, found by a test, a
gate, or a reader looking at it. They are listed because a portfolio that
describes only its successes is describing a project that never ran, and because
each one is now held down by something that fails the build if it comes back.

@defect A reasoning model leaked its chain-of-thought and the system prompt into answers | cleanAnswer strips think blocks and leading meta-paragraphs, asserted in the unit tests
@defect Streaming shipped with token usage hardcoded to null, so the cost panel was always empty | streamUsage enabled on the client, asserted in the integration tests
@defect The work-authorisation matcher caught "work authorization" and missed "authorized to work" | both word orders matched, both asserted in the eval suite
@defect ScrollTrigger measured the page before webfonts laid it out, so below-fold elements spent their entrance off-screen | the motion kit awaits document.fonts.ready before it resolves
@defect The build crashed when no embedding key was present, instead of degrading to lexical retrieval | the projection step exits cleanly with a null stress, guarded by two regression tests
@defect Question grammar was being scored as content, so a 64-token section matching the shape of the question outranked the section that answered it | stopwords are dropped at tokenisation, including the pronouns that carry no signal in a corpus about one person, with six ranking assertions in the integration tests
@defect The corpus claimed the agent degrades to the retrieved source when every provider fails, and only the non-streaming path did it; the path every visitor uses returned an error | the streaming path serves the top chunk unsummarised and labels the answer degraded
@defect The streaming path applied its reasoning filter per chunk, but a token already sent cannot be retracted, so a visitor was shown the model deliberating before the answer arrived | the opening is held until a paragraph break proves it is not working, and only then released
@defect A corpus section grew past the embedding model's 512-token limit, so the request returned 400 and the whole site silently dropped to keyword-only retrieval | long passages are split into windows and mean-pooled, and a rejected request now names the chunk and fails loudly instead of reporting a fallback
@defect The graph documented that conversation history was passed per request, and nothing accepted history, so every follow-up was answered as though it were the first question asked | history rides with each request from the browser tab and is folded into both the prompt and the retrieval query
@defect Select-to-ask sent the highlighted phrase with no section and no history, so the one interaction that proves the agent is reading this page answered like a search box | the nearest section heading travels with the selection
@defect The colour system claimed three text tones and had two: the two quiet ones measured 1.06:1 apart, where 1.00 is the same colour | the ramp is set explicitly rather than mixed off a single axis, and every step is measured in-browser
@defect Emphasis in prose was a 6% size change at the same colour as its surroundings, invisible to the scan that hunts for bolded phrases | a second semantic accent, chosen by simulating three kinds of colour blindness rather than by eye
@defect Entrance motion ran correctly and could not be seen: 14px over 500ms is below the perceptual threshold for motion | 30px over 620ms, which clears the threshold without reading as a template
@defect The site URL in the corpus pointed at an address that was not this site, feeding the canonical tag, the entity graph and the share card | corrected at the source, where every surface reads it from
@defect Two entrance systems owned one element's opacity: a panel faded itself in with @starting-style and was also swept into the scroll batch, so GSAP wrote an inline zero while the CSS transition was mid-flight and whichever finished second decided what the reader saw | the element that animates itself says so, and the batch skips it
@defect The net that catches an element stranded at zero skipped anything inside [data-state], and panels set that attribute unconditionally, so every panel on the page was exempt from the sweep written to rescue it | only a running instrument is skipped, because an idle panel at zero opacity is reporting nothing
@defect That same net ran once, a second after mount, while the stranding it guards against happens whenever a reader crosses several batch boundaries quickly, which is at any point in the session | it runs again whenever scrolling stops

The pattern across all eighteen is the same and it is the reason this section exists:
none of them threw. A leaked monologue renders as text, a null token count
renders as blank, a missed regex returns a plausible answer to the wrong
question, and a trigger that fires early simply looks like nothing happened.
Silent failure is the class of bug the published research is about, and it is
the class this page kept producing until something was written to watch for it.
