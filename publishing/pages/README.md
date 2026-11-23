# Standalone editorial pages

`emoji-combinations.json` is the editable source for the English `/emoji-combinations/` copy-and-paste page. The build validates the content and renders it into `dist/emoji-combinations/index.html`; keep the JSON and generation code outside the deployable output.

The first version deliberately uses **Copy** only. It uses the site's existing copy controls and fallback message; the emoji tray currently exposes selection for individual emoji, not a supported combination-level API. Search and category filters run locally over the static HTML. There are no external requests, analytics, cookies or server-side saves for this page.

Keep the set between 40 and 60 distinct sequences, use the existing five category IDs unless the builder/data are updated together, and treat cultural and contextual readings as suggestions rather than universal meanings. FAQs are visible content; the builder does not add FAQPage structured data.

To preview the generated site locally, run `npm ci` and `npm run build`, then serve `dist/` over HTTP. The production Cloudflare build also runs `npm run build` before deploying `dist/`.
