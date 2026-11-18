# Publish one article at a time

Put a publication-ready `.md` post file in this folder, then Commit and Push using GitHub Desktop. The automatic build creates its webpage, listing, metadata and sitemap entry.

Keep articles you are not ready to publish outside the repository. Alternatively, use `published: false`; the builder excludes them. This is not a scheduling system. A future date does not schedule a build.

Do not put the earlier prose-only Markdown files here. Use the files supplied in the separate ready-to-publish pack; they include required metadata. Keep README.md.

To edit a published article, replace its existing post file without changing its slug. Keep original dates, if present. Do not delete published files just to remove them from the listing: deletion removes their generated webpages too. Ask for a redirect plan first.

No dates are invented. Date and updated fields are optional. These initial post files deliberately omit them because the owner chooses when to publish. If dates are added later, use the actual publication date and actual substantive revision date.

Copy and related-link lists are configured in each post file. Related guides appear only after the target article is published. Backlinks are generated on the configured English emoji pages, not every page on the website.

## Article illustrations

A post may include an optional `hero_image` object in its YAML front matter with `src`, `social_src`, `alt` and `caption` fields. Use a local WebP header image at `/assets/img/guides/<slug>/header.webp`; for broad social-preview compatibility, provide its matching JPEG at `/assets/img/guides/<slug>/header-social.jpg` as `social_src`. Write an accurate concise alt description and a short visible caption. The builder uses the WebP in the article and the JPEG in Article structured data and social-preview metadata.

Place supporting visuals near the text they explain using standard Markdown image syntax:

```markdown
![Describe the important visual information.](/assets/img/guides/<slug>/illustration-name.webp "A short visible caption that adds useful context.")
```

Keep images local under `assets/img/guides/<slug>/`. Use descriptive alt text rather than keyword lists. The builder converts these to semantic figures, provides intrinsic dimensions and lazy-loads supporting images. No image should contain essential explanatory text that is absent from the article.

FAQs are visible reader content; do not add FAQPage markup to chase a Google rich result. Publication dates remain optional and must never be guessed or backdated.
