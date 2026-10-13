# Inbox #39: talab va dalillar jadvali

Boshlang'ich kod: `b0864f91139cbf6924105b94d3e433a8b0e1af29`.
Talab: https://github.com/Shoamirg/garageos/issues/39.
Ushbu jadval original 13 guruhni saqlaydi; suite soni spec qabuli o'rniga o'tmaydi.
Yakuniy application/test SHA: `be24c902acb3030638d7d99994fa65d40fd4f5ae`.
2026-10-14 (Tashkent), 2026-10-13 UTC kuni shu commitda bitta to'liq lokal
Windows release run exit 0 bilan tugadi. Keyingi evidence commitlari faqat
ushbu jadval va `tasks/plan.md`ni yangilaydi; application/test baytlari o'zgarmaydi.

| # | Talab / implementation | Bevosita regressiyalar | Joriy ish |
|---|---|---|---|
| 1 | Scalar server literal search/paging, priority/activity/UUID order, old>80, ICU503 | `test_inbox_queue_api.py`; `inbox-queue-workflow.spec.ts` UZ/EN/RU 360/390/1280 | Mavjud implementatsiya saqlangan; full API/browser regression o'tdi |
| 2 | Barcha safe filtered rows bo'yicha rail counts; selected view faqat matched total/page'ga | `test_each_count_keeps_filters_but_not_selected_view`; yangi `inbox-share-boundaries.spec.ts` combined search/type/channel/view golden counts | Browser acceptance gap uchun normal HTTP-created fixtures qo'shildi |
| 3 | Current active staff/garage/permission/demo/session/tenant/reference/child boundary | Reference-combination/queue/history tests; yangi `test_inbox_current_policy_api.py`15 forced-lock authority cases | 17 RED -> 18 focused GREEN; full990 backend va574 browser o'tdi |
| 4 | Bounded queue SQL, no N+1, complete512-message/128-event history and stable UUID order | Queue query budget2129 rows, history batch-query tests and attachments | Mavjud implementatsiya saqlangan |
| 5 | Create/PATCH input, explicit assignment clear, atomic commit/rollback, separate conversation/case lifecycle | `test_inbox_mutations_api.py`, creation-reference tests; create/actions E2E | Current caller policy lock/commit gap tuzatildi |
| 6 | UUID watcher ownership, concurrent follow; server-observed read watermark preserves newer arrivals | Follow concurrency, `test_inbox_read_observation_api.py`, new authority-wait tests | Follow/unfollow current actor recheck va precommit session guard qo'shildi |
| 7 | Initial/loading/empty/stale/error/revoked states, obsolete reads, old deep links, short phone | Queue/loading/recovery/late-response/deep-link E2E | Mavjud kontrakt saqlangan |
| 8 | Captured actor/target guards, pending/ACK/unknown/reconciliation, no automatic non-keyed replay | Inbox actions/create + message-intent/Operations/Mini suites | Passport share uchun selection/epoch/pending guards; logout/login ordering qo'shildi |
| 9 | Truthful context, owning links, local inactive histories retained with unavailable label | Existing vehicle history;2 new archived case/customer normal API owning404 tests; linked header projection | Inactive case/customer linklar olib tashlandi; header validated card'ga bog'landi |
| 10 | Recorded call, real booking/estimate/case, passport clipboard, editable photo/location, explicit ETA unavailable | `inbox-conversation-actions.spec.ts`; new passport authorization/artifact/pending/read-error E2E | Fresh actor/thread/artifact verification before clipboard; unchanged supported workflows |
| 11 | Authorized UTF-8 JSON complete-thread export, allowlisted values/no private tokens/metadata | Existing actual download/failure/readonly/late-unmount export E2E | Existing explicit single-thread scope saqlangan |
| 12 | UZ/EN/RU,44px/focus/keyboard/dialog/nooverflow/short-phone/light-dark/axe | Existing full matrices; new API-created192-char unbroken summary pane tests with screenshots | List/context wrap fixed; baseline browser reproduced6 failing share/overflow tests |
| 13 | Operations/Mini/Flutter/financial/auth/event-bus contracts preserved | Full normal-PG/API/browser/Flutter/recovery/invoice-volume release gates | Session-aware real fixtures adapted; bitta combined run barcha gate'lardan o'tdi |

## Saqlangan boshlang'ich va focused natijalar

- Original local run:925 backend,92 Flutter; browser534pass+1 ERR_NO_BUFFER_SPACE.
- Separate original browser run:535pass. QA Android34gates; owner release emas.
- New session RED:25 failures; no sid/logout/replay revocation in original behavior.
- Session first GREEN:98pass (normal-PG/HTTP, staff/customer/legacy/lifecycle).
- Inbox policy/history RED:17fail; current role/garage/session revoked while real
  aggregate lock held still permitted effects; archived cards advertised404 links.
- Inbox policy/history+password/Telegram boundary GREEN:18pass.
- Signed session-claim boundary GREEN:11pass,37deselected.
- Client scoped green:24 Flutter tests, analyzer,17 controller/proxy tests;
  yakuniy full runtime va combined release natijalari quyida.
- Inbox production browser GREEN:11pass, including six actual light/dark summary
  cases at360/390/1280 with whole-page accessibility checks. Representative360px
  light and dark screenshots inspected. The earlier unused theme cookie was
  replaced by real system-theme emulation and an explicit HTML theme assertion.
- Delayed authenticated-render ownership RED:2fail, for both same/different
  principal replacement. The fix binds all three UI logout callers to an
  immutable server-rendered access fingerprint, checked before ledger/draft
  changes and against the actual HttpOnly cookie in the BFF. Raw tokens remain
  server-only; public fingerprints grant no authority. Legacy explicit no-body
  logout remains supported. Old rendered proofs receive409 without side effects.
- Final focused production browser GREEN:22pass in43.9s, zero retries, real
  PostgreSQL/HTTP. This includes11 Inbox and11 logout/session cases, whole-page
  accessibility and unchanged receipt/ledger/new-session checks for delayed SSR.
- Final independent client/security/Inbox review: no remaining required finding
  on the frozen source. Ikki destructive migration testining re-login moslashuvi
  ham original read-watermark va same-key/same-payload talablarini saqlashi review qilindi.

## Yakuniy bitta release run

Dalil ID: `qa-session-inbox-final4-20261013-be24c90`; tested SHA yuqorida.
Runner: `garageos/scripts/jenkins_windows_ci.py`, system Python, pinned Flutter
3.47.6 va WSL `Ubuntu-24.04` Docker. Tracked CI checkout run'dan keyin toza.
`result.json`: application, Docker, database recovery va invoice-volume `passed`;
parent process exit 0. Bu lokal runner natijasi; GitHub tekshiruv holati alohida.

| Gate | Yakuniy natija |
|---|---|
| Fresh migrations/schema va demo oldidan API | O'tdi |
| Full normal PostgreSQL backend | 990 passed,26m10s; mavjud Pydantic namespace warning1 |
| TypeScript/lint/dashboard build | O'tdi; unrelated existing lint warnings5, yangi suppression yo'q |
| Browser UZ/EN/RU | 1458 keys; i18n audit0, backlog0 |
| Full authenticated Chromium | 574 passed,39.3m; retries0, traces off |
| Flutter analyze/locales/live API suite/web build | O'tdi;107 tests,249 complete messages per language |
| Runtime Python va Node dependency audits | Python55/55 audited,skip0,advisory0; Node full/production0 vulnerabilities |
| Docker build context/public routing/recovery/invoice volume | O'tdi; recovery10 tests, invoice volume1; owned Docker/private fixture cleanup receipts true |
| QA Android | 34 gates,3 ABI APKs; debuggable=false, cleartext=false; disposable signing fixture cleanup true |

Full run avval topgan fixture muammolari alohida tekshirildi: pre-account seed
schema yangi `auth_sessions` jadvalini yasamasligi (5 focused pass); destructive
downgrade/reupgrade'dan keyin eski staff/customer tokenlar401 bo'lib, normal
HTTP login o'sha staff UUID'ni qayta ochishi (3 focused pass). Original tarix,
discarded observation UUID422 va eski key/payload bilan yo'qolgan receipt
oqibatidagi yangi message talablari saqlangan. Failed/interrupted old runs
SUCCESS sifatida hisoblanmaydi; yuqoridagi bitta run yakuniy dalil.

Owned API/dashboard/PostgreSQL to'xtatilgan; test ports55444/8010/3001 da
listener yo'q, credential fixture va `owned.json` olib tashlangan. Test bazasi
papkasini o'chirish avtomatik approval review tomonidan `blocked by policy`
deb rad etilgan; to'xtatilgan mahalliy PGdata papkalari diskda qoldi va alternativ
delete yo'li ishlatilmadi. Docker resurslari va Android private signing fixture
o'z cleanup receipts bilan tekshirilgan.

Private credentials, JWTs, traces and runtime fixtures are not published.
Evidence remains in gitignored `ci-evidence` and the owned CI workspace.

## GitHub holati

Own branch `codex/service-work-demo` va PR5: source/evidence checkpoint
`3389816e79394ce0d3f6430086730c4898efa51b` push qilingan, remote va PR HEAD
tasdiqlangan. PR5 hamda #39/#12/#10 body'lari yangi evidence bilan yangilangan;
original acceptance/history saqlanishi GitHub'dan qayta o'qib tekshirilgan.
Keyingi publication-receipt commitlari faqat shu Markdown hujjatlarni o'zgartiradi.
Application/test verification SHA `be24c902...` bo'lib qoladi.
CodeRabbit pass matni review skipped; current-SHA GitHub CI yoki Jenkins server
build SUCCESS deb ko'rsatilmaydi. PR/issue'lar review/merge va external acceptance
qolganligi uchun OPEN.

## Moslik va tashqi qabul

Sid-less old tokens require deliberate re-login. Auth-session jadvali destructive
downgrade'da o'chirilsa ham eski tokenlar qayta ishlamaydi; normal login kerak.
Existing users/password hashes,
customer account-version/read-only policies, demo restriction and financial/message
idempotency remain. Browser session is still access-only30min; Flutter rotates
under its single in-flight request. Coordinated UI auth requires secure context,
Web Locks and usable same-origin storage; unsupported cases fail before mutations.

Local acceptance does not prove production HTTPS/client accounts, off-host
backup/restore/rollback, owner signing/iOS distribution, physical devices,
actual garage workday pilot or support handoff. These remain under #10. No
main merge, deployment or project100% claim is part of this increment.
