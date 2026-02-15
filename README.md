# wisp-explorer

An in-browser [wisp.place](https://wisp.place) explorer. Currently deployed at [explore.wisp.place](https://explore.wisp.place/).

## how?

- Resolves handles to did:plc or did:web from the Bluesky API and gets DID document from plc.directory (or .well-known for did:web)
- Resolves wisp.place sites from PDS and lists them;
- On site load, grabs the manifest and sends it to service worker, which stores it within indexedDb context;
- on each page, injects a `<base>` URL to navigate from and overwrites absolute links + css links to derive from the base url
- Service worker then caches blobs in the indexedDb, decompresses the blob data, and intercepts requests to serve the site

Currently doesn't handle forced redirects well (you'll notice this for my [kuudere.pl](https://kuudere.pl) site).

## colophon

This repo was an experiment for me in a few ways: I've never worked with any atproto utilities; I've never bootstrapped a project with AI tooling and I've been curious to understand how wisp.place works, since I use it for all my static sites.

I built this with the [pi](https://shittycodingagent.ai/) coding agent; Claude Sonnet 4.5 and I wrote out a plan through discussing various methods of implementation, then broke it into tasks for GLM 4.7 to build out. A few renderer approaches were attempted, but none of them were faithful. This one, while unorthodox (and kinda scary?) works fairly stably across sites I've tested.

Overall I was surprised how quickly it caught onto ATProto patterns and I learned a lot about DID resolution and PDS parsing.
