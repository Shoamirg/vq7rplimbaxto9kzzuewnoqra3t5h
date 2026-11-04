# GarageOS website

The public GarageOS marketing site: landing page, pricing, security, docs, privacy and terms, in Uzbek, Russian and English. It is a standalone Next.js app with no backend.

## Run it

```bash
npm install
npm run dev
```

The site opens at http://localhost:3000. Use `npm run build` and `npm start` for a production build.

## Configuration

`APP_URL` sets where `/login` and `/demo` redirect, because those pages belong to the GarageOS app. It is read at build time and defaults to `https://garageos.uz`.

## Layout

- `app/(marketing)/` holds the pages.
- `components/marketing/` holds the sections and styles.
- `lib/marketing-*.ts` holds the translated copy.
- `public/marketing/` holds images, with photo credits in `PHOTO-CREDITS.md`.
