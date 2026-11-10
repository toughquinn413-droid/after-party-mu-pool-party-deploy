# After Party Mu Pool Party — User Accounts + Admin

## Local
1. Install Node.js LTS.
2. In this folder run `npm install`.
3. Run `npm start`.
4. Open the local site on port 3000.

Public pages:
- `/` — party website
- `/register.html` — create user account
- `/login.html` — user login
- `/account.html` — My Account and tickets
- `/admin.html` — admin panel

Default admin:
- Username: `admin`
- Password: `ChangeMe123!`

Change the admin password and JWT secret before production.

## Production deployment
This project supports PostgreSQL automatically when `DATABASE_URL` is present. The included `render.yaml` creates a Node web service and PostgreSQL database. Connect the repository to Render, deploy the Blueprint, and set a strong `ADMIN_PASSWORD` when prompted.

The existing `public/background.jpg` is kept unchanged.
