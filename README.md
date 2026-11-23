# DecisionRoom

A private workspace for a team to compare options, discuss tradeoffs, and vote on a shared decision in real time.

Built for the DeepSpace Summer 2027 Software Engineering Internship assignment. The core MVP is implemented locally. **No live release is recorded yet.** The configured deployment target is `https://decision-room.app.space`; name availability and successful release still need confirmation.

## The user journey

1. Sign in with the existing DeepSpace Google/GitHub authentication flow.
2. Create a private room with a question, context, and category.
3. Share an expiring invitation. A signed-in recipient explicitly accepts it to join.
   Members can also click **Join Room**, directly beside **Create Room** on the dashboard, and paste an invitation URL or token to open that same acceptance flow.
4. Propose options and discuss each option's benefits and risks.
5. Vote for one option. Change that vote without increasing the total number of votes.
6. See accepted options, comments, and vote results arrive automatically in other members' open rooms.

The functional app reads stored records; it does not populate rooms with sample fixtures. Test data is confined to tests.

## Architecture

| Layer | Implementation |
| --- | --- |
| Frontend | React 19, TypeScript, React Router/Generouted, Tailwind 4, existing Base UI components. |
| Backend | Hono routes in a Cloudflare Worker using DeepSpace SDK **0.44.2**. |
| Identity | Existing DeepSpace authentication, JWT verification, and authenticated SDK session/token helpers. |
| Persistence | DeepSpace RecordRoom Durable Objects with SQLite-backed schema collections. |
| Authorization | Native team-based record reads; validated Worker actions check room membership and operation-specific permission before privileged writes. |
| Synchronization | Native RecordProvider/RecordScope and useQuery subscriptions over WebSockets. |
| Voting | One deterministic record per room/user plus `uniqueOn: ['roomId', 'userId']`; an atomic upsert changes the choice. |

Public `/` is prerenderable and does not boot authentication or records. `/home`, `/rooms/:roomId`, and `/join` use the existing dynamic provider boundary. The Worker derives identity from verified credentials; client-provided author/voter identities are rejected. Options referenced by comments/votes must belong to the specified room.

Collections: `decision_rooms`, `team_members`, `room_invites`, `room_options`, `option_comments`, and `room_votes`, alongside scaffold user/settings collections. Schemas are registered in [src/schemas.ts](./src/schemas.ts). The application scope uses a build-injected immutable app ID, not its changeable display name.

## DeepSpace capabilities used

- Platform authentication and Worker JWT verification.
- Schema-based SQLite records, required fields, immutable/user-bound identity fields, text limits, and composite uniqueness.
- Native team-membership read policies applied before private records reach clients.
- Authenticated server actions and acknowledged database writes.
- Realtime record subscriptions, reconnection, and database snapshots.
- Cloudflare build integration and deployment manifest support; deployment has not yet been performed.

The priority is reliable collaborative decisions. Authentication, persistence, authorization, and realtime delivery directly support that journey. Adding unrelated integrations would introduce more configuration and failure modes without improving the core assignment. **AI summaries are not implemented.** Scaffold integration/agent infrastructure exists, but it is not presented as a completed user-facing AI feature.

## Local setup

Use a Node/npm version supported by [package.json](./package.json): Node `>=22.15 <23`, `>=24 <25`, or `>=26 <27`, and npm `>=11.6`. Verification here used Node 24.11.1. Do not upgrade the SDK immediately before submission without a reason and regression testing.

```sh
npm ci
npm run login
npm run dev
```

Open the Vite URL printed by DeepSpace, normally `http://localhost:5173/`. On Windows PowerShell with blocked npm.ps1 execution, use `npm.cmd` for these commands; changing machine execution policy is unnecessary.

The existing checkout is already associated with its DeepSpace app ID. Forking for an independent app requires an explicit identity decision; do not replace the ID merely to rename the product. See the official [installation](https://docs.deep.space/get-started/installation.md) and [app identity](https://docs.deep.space/guides/app-identity.md) guides.

Secrets belong in the DeepSpace secrets store. The CLI-generated local `.dev.vars` cache, `.env` files, key files, runtime state, dependencies, build output, and browser test artifacts are ignored. Never paste credentials into source files or commit local credential caches. Runtime platform credentials are supplied by DeepSpace; the core decision flow needs no third-party provider API key.

## Verification

```sh
npm run type-check
npm run lint
npm run test:unit
npm run build
```

The latest Join Room run passed typecheck, lint, **48 tests across 8 files**, and the production build. The suite includes invitation URL/token validation and real isolated workerd/SQLite tests: restart persistence, pasted invitation acceptance, three separate connected WebSocket identities, private incremental delivery, foreign-option rejection, direct-write denial, repeated voting, and twelve concurrent vote requests from one voter. The storage harness uses installed Miniflare/esbuild tooling and does not touch the application's development or production room records.

Additional existing browser smoke/API suites can run on a separate port:

```sh
npx deepspace test run --port 5174
```

The runner may install Playwright browser binaries. Authenticated test fixtures require usable SDK test accounts. There are currently **0 usable test accounts**, so automated runtime identities must not be described as real OAuth users. Results and limitations are recorded in [docs/BUILD_LOG.md](./docs/BUILD_LOG.md).

The readiness review also ran that smoke/API command successfully: **8 browser tests passed**. They cover the public page, metadata, static-provider isolation, dynamic shell, signed-out navigation, auth proxy, and missing-route behavior. They do not certify signed-in collaboration or a deployed release.

## Manual acceptance before submission

Use accounts A and B in separate browser profiles. Create a room, invite B, add options/comments from both accounts, and confirm updates without refresh. Verify 0-vote results, two different votes (50%/50%), a changed vote (still two total), persistence after refresh/sign-in, and recovery after reconnecting. A third unrelated account C must not see the room or its content. Check the signed-in flow at phone width, keyboard/focus behavior, error messages, sign-out, and an invalid invitation.

**USER-VERIFIED locally:** Google sign-in, room creation, persistence after refresh, invitation links in a second browser profile, and two-user voting with realtime updates. These were reported by the applicant, not performed by Codex. Production acceptance and the new dashboard Join Room dialog require separate checks. Detailed evidence is in the build log.

## Deployment checklist

Publication and GitHub-source deployment are authorized. The current verification passed TypeScript, lint, 48 tests in 8 files, and the production build. GitHub CLI authentication confirms kareemaelemam. Publication and release evidence will be recorded below after execution.

- [x] Review Create Room and Join Room implementation, ignored files, and credential markers.
- [x] Run typecheck, lint, unit tests, and production build.
- [ ] Publish the reviewed main branch to the public kareemaelemam/decision-room repository.
- [ ] Confirm GitHub source inference before the first DeepSpace deployment.
- [ ] Deploy with the supported DeepSpace CLI and record its actual result.
- [ ] Check the live public page and repeat signed-in, two-profile acceptance in production.

Local Miniflare/SQLite state is separate from hosted production Durable Objects; deploying does not copy local rooms. Integration tests use a third, disposable database. Platform authentication may use the same remote identity service locally and in production; sharing identity does not mean sharing room storage. Production records persist across subsequent deploys. Named Wrangler environments are separate apps and require their own app IDs/configuration. See [deployment](https://docs.deep.space/concepts/deployment.md), [source control](https://docs.deep.space/guides/source-control.md), and [releases/rollback](https://docs.deep.space/guides/releases-and-rollback.md).

## Known limitations

- The user confirmed local two-profile invitations and realtime voting; signed-in mobile acceptance and production behavior still need verification.
- SDK 0.44.2's membership-change notifier reads `UserId` rather than `userId`. Joining navigates into a fresh connection; normal options/comments/votes synchronize without refresh.
- Member removal/revocation needs a policy review because native team policies also grant the original record author access. Removal is not implemented.
- Invite links are reusable for seven days and have no revoke control. They are bearer capabilities; share them privately. Only hashes are stored in the database.
- Options/comments are append-only. A timeout followed by retry can duplicate an option/comment; check saved activity first. Vote retries are safe.
- Votes are member-visible, not anonymous. Simultaneous changes use last accepted write semantics. Rounded percentages may sum to 99 or 101.
- Room creation and owner membership are two acknowledged writes with best-effort rollback, not one transaction.
- No AI summaries, moderation, vote retraction, option deletion, finalization controls, or large-room pagination. Membership roster retrieval is capped at 500.

## Implementation and review record

Codex implemented the frontend, schemas, Worker actions, permissions, native subscriptions, invite handling, tests, and documentation while preserving the DeepSpace scaffold. The applicant's manual verification must be added only after it is performed. [BUILD_LOG.md](./docs/BUILD_LOG.md) includes the architecture rationale, exact file inventory, test evidence, interview explanation, and submission draft.
