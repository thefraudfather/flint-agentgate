# AgentGate WebMCP release checklist

The authoritative release is one immutable Git commit. The public repository, Vercel deployment, demo video, Devpost entry, release tag, and freeze record must all identify that same commit.

The unchecked public-candidate, Devpost, and tag items below are intentional final-freeze gates. They must be repeated against the final tagged submission commit and do not indicate that current `main` failed the completed local release gates.

## Local release gates

- [x] `npm ci` succeeds from a clean clone.
- [x] `npm run release:check` passes.
- [x] Safe fixture completes assessment → Community Tool Passport → governed assignment → ALLOW.
- [x] Semantic drift produces BLOCK.
- [x] Revocation removes the eligible surface and denies stale handlers.
- [x] Risky fixture fails and cannot receive a Tool Passport.
- [x] Desktop, 390 px mobile, keyboard, reduced-motion, and clean-console checks pass.
- [x] No tracked environment files, credentials, customer details, local paths, private Notion URLs, or production signing material.
- [x] `README.md`, `LICENSE`, `SECURITY.md`, `TRADEMARKS.md`, `CONTRIBUTING.md`, and third-party notices are visible.
- [x] Community credentials remain visibly self-attested and cannot claim FLINT verification or a FLINT Stamp.

## JT authorization gates

- [x] Approve creation of a new public GitHub repository for this isolated prototype.
- [x] Confirm MIT as the public source license.
- [x] Approve a separate Vercel project and public deployment.
- [x] Confirm https://flint.network/command as the managed-product destination.
- [x] Approve public YouTube publication and Devpost submission.
- [ ] Provide production signing access only if the scope changes from Community credentials; never place it in this repository or client bundle.

## Public repository and deployment

- [x] Create the public repository without importing private issues, discussions, CI secrets, or unrelated history.
- [x] Push the reviewed local history.
- [x] Verify the default branch and public license rendering.
- [x] Connect only the new public repository to a separate Vercel project.
- [x] Use no production credentials; the current static prototype needs none.
- [ ] Repeat `npm ci && npm run release:check` against a fresh public clone of the final candidate.
- [ ] Verify the deployed asset matches the candidate SHA recorded below.
- [ ] Run the complete judge path on the public URL in a WebMCP-capable browser and the visible fallback.
- [ ] Recheck security headers, console, keyboard flow, mobile layout, and external links.

## Video and Devpost

- [x] Record the exact `docs/DEMO-SCRIPT.md` flow with intelligible audio and a runtime under three minutes.
- [x] Use only authorized FLINT assets, third-party marks, and audio.
- [x] Publish the video publicly on YouTube and test it signed out.
- [ ] Complete the project description, WebMCP implementation explanation, repo URL, live URL, and video URL.
- [ ] Submit before the internal target of September 3, 2026 at 10:00 AM PDT.
- [ ] Reopen the submitted entry once and verify every link.

## Tag and freeze

- [ ] Record candidate commit: `______________________________`.
- [ ] Confirm the public repository, Vercel deployment, video, and Devpost entry demonstrate that commit.
- [ ] Tag that exact commit `webmcp-2026-submission` and push the tag.
- [ ] Record deployment ID and Devpost submission timestamp.
- [ ] Freeze the submission branch, deployment, demo data, video, and entry through winner announcement except for an authorized security fix.
- [ ] If a security fix is unavoidable, create a new reviewed commit and update every recorded artifact before the deadline.
