# APA 2 - Duty Outside

Staff duty request and return tracking for APA 2.

## Local setup

- Frontend: `cd frontend && npm run dev` → http://localhost:4326
- Backend: `cd backend && npm run dev` → http://localhost:5005
- Database: MySQL schema `apa2_duty_outside`
- Frontend production build: `cd frontend && npm run build` (outputs `dist2/`)
- Backend production bundle: `cd backend && npm run build`
- PM2 services: `apa2-duty-outside` and `apa2-duty-backend`

The local backend reads `backend/.env`, which is ignored by Git. It contains the local MySQL connection settings. The previous `apa_duty_outside` database is retained as a backup after the move to `apa2_duty_outside`.

The frontend reads `.env.development` and `.env.production`. The local development server proxies API requests to port 5005.

## Production

The production host and deployment environment remain configured separately from this local project. Build and review local changes before publishing them.
