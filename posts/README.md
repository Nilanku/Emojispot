# Publish one article at a time

Put a publication-ready `.md` post file in this folder, then Commit and Push using GitHub Desktop. The automatic build creates its webpage, listing, metadata and sitemap entry.

Keep articles you are not ready to publish outside the repository. Alternatively, use `published: false`; the builder excludes them. This is not a scheduling system. A future date does not schedule a build.

Do not put the earlier prose-only Markdown files here. Use the files supplied in the separate ready-to-publish pack; they include required metadata. Keep README.md.

To edit a published article, replace its existing post file without changing its slug. Keep original dates, if present. Do not delete published files just to remove them from the listing: deletion removes their generated webpages too. Ask for a redirect plan first.

No dates are invented. Date and updated fields are optional. These initial post files deliberately omit them because the owner chooses when to publish. If dates are added later, use the actual publication date and actual substantive revision date.

Copy and related-link lists are configured in each post file. Related guides appear only after the target article is published. Backlinks are generated on the configured English emoji pages, not every page on the website.
