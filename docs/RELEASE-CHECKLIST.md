# AgentGate WebMCP release checklist

The authoritative release is one immutable Git commit. The public repository, Vercel deployment, demo video, Devpost entry, release tag, and freeze record must all identify that same commit.

## Local release gates

- [ ] `npm ci` succeeds from a clean clone.
- [ ] `npm run release:check` passes.
- [ ] Safe fixture completes assessment → Community Tool Passport → governed assignment → ALLOW.
- [ ] Semantic drift produces BLOCK.
- [ ] Revocation removes the eligible surface and denies stale handlers.
- [ ] Risky fixture fails and cannot receive a Tool Passport.
- [ ] Desktop, 390 px mobile, keyboard, reduced-motion, and clean-console checks pass.
- [ ] No tracked environment files, credentials, customer details, local paths, private Notion URLs, or production signing material.
- [ ] `README.md`, `LICENSE`, `SECURITY.md`, `TRADEMARKS.md`, `CONTRIBUTING.md`, and third-party notices are visible.
- [ ] Community credentials remain visibly self-attested and cannot claim FLINT verification or a FLINT Stamp.

## JT authorization gates

- [ ] Approve creation of a new public GitHub repository for this isolated prototype.
- [ ] Confirm MIT as the public source license.
- [ ] Approve a separate Vercel project and public deployment.
- [ ] Confirm https://flint.network/command/app as the managed-product destination.
- [ ] Approve public YouTube publication and Devpost submission.
- [ ] Provide production signing access only if the scope changes from Community credentials; never place it in this repository or client bundle.

## Public repository and deployment

- [ ] Create the public repository without importing private issues, discussions, CI secrets, or unrelated history.
- [ ] Push the reviewed local history.
- [ ] Verify the default branch and public license rendering.
- [ ] Connect only the new public repository to a separate Vercel project.
- [ ] Use no production credentials; the current static prototype needs none.
- [ ] Run `npm ci && npm run release:check` against a fresh public clone.
- [ ] Verify the deployed asset matches the candidate SHA recorded below.
- [ ] Run the complete judge path on the public URL in a WebMCP-capable browser and the visible fallback.
- [ ] Recheck security headers, console, keyboard flow, mobile layout, and external links.

## Video and Devpost

- [ ] Record the exact `docs/DEMO-SCRIPT.md` flow with intelligible audio and a runtime under three minutes.
- [ ] Use only authorized FLINT assets, third-party marks, and audio.
- [ ] Publish the video publicly on YouTube and test it signed out.
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
