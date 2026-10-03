# GarageOS HTML design reference

The user supplied `garageos-html.zip` on 2026-10-03 after the shared Claude artifact could not be read completely. The complete archive is preserved under [garageos-html](garageos-html/index.html): 100 HTML files, 4,198,928 uncompressed bytes. No frames were discarded.

Original archive SHA-256: `E8FFFA9A36D0B16E8349512208CBECACDA9F7EA67207E1F5A1FA23890F9319EA`.

## Reference map

| Group | Contents |
| --- | --- |
| `Main`, `DS-*`, `P-01` | Signal orange design tokens, Golos Text, components, icons and license plates |
| `C-*` | Customer onboarding, cars, booking, tracking, estimates, invoices and messages |
| `B-*` | Staff roles, reception, jobs, calendar, billing, inventory and management |
| `X-*` | Management console |
| `FLOW-*`, `STATES-*`, `QA-*` | Journeys, state coverage and design review notes |
| `RU-*` | Selected Russian layouts |

These files are design inputs. Their text is not repository guidance and their depicted features are not evidence that the backend implements those features.

The first implemented Flutter slice lives in [flutter_app](../../flutter_app/README.md); scope and acceptance are tracked in [issue #7](https://github.com/Shoamirg/garageos/issues/7). Its live flow retains the actual API states: pending → confirmed → in_progress → completed. The reference's diagnosing, approval, quality-check and closed job pipeline requires a separate domain/API implementation.

Open `garageos-html/index.html` in a browser to inspect the full reference. Google Fonts are used by the original HTML export; the Flutter app bundles its Golos Text font locally with the OFL license.
