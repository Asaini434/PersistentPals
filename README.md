# ReflectX Health — Immersive Wellness & Clinical Logs

**ReflectX Health** (by Persistent Technology) is a modern React web application designed for healthcare settings, research, and clinical log management. It provides a real-time overview of patient statuses, vital signs monitoring, medical profiles, and interactive clinical observation logging.

---

## ✨ Features

- **🔐 Centered Auth Portal**: Clean, centered Login and Signup screens styled with full-screen flex alignment.
- **📋 Patient List & Clinical Logs**: Interactive table with real-time search (by patient ID, name, or diagnosis) and status filtering (`Admitted`, `In Treatment`, `Observation`, `Discharged`).
- **🩺 Patient Detail Dashboard**:
  - Live vital signs dashboard (Heart rate, Blood pressure, SpO₂, Temperature, Respiratory rate).
  - Complete medical profile (Primary diagnosis, physician, blood type, contact information, allergies, medical history).
  - Active medications summary.
  - Interactive clinical activity timeline with real-time observation log entry submission.
- **🎨 Reflect XR Design System**:
  - Custom typography using Google Fonts (`Plus Jakarta Sans`).
  - Ambient glow background and sunset color scheme (`#f43f5e`, `#ec4899`, `#a855f7`).
  - Floating pill navigation bar with top utility bar.
  - High-contrast, interactive action buttons and color-coded status badges.

---

## 🛠️ Tech Stack

- **Frontend Framework**: React 18
- **Build Tooling**: Vite 5
- **Routing**: React Router DOM v7
- **Styling**: Vanilla CSS3 with CSS Variables & Glassmorphism
- **Iconography**: Lucide React
- **HTTP/Services Layer**: Modular fetch abstraction (`api.js`) ready for backend REST API integration
- **Database**: PostgreSQL 16 (synthetic data only)

---

## 📁 Directory Structure

```text
PersistentPals/
├── backend/                     # API/backend services
├── database/
│   ├── schema.sql               # PostgreSQL table definitions
│   └── seed.sql                 # Synthetic sample data
├── frontend/                    # React + Vite frontend application
│   ├── index.html               # HTML entry point (Plus Jakarta Sans font + Title)
│   ├── package.json             # Project dependencies and script commands
│   ├── vite.config.js           # Vite bundler configuration
│   ├── .env.example             # Environment variable template
│   ├── public/
│   └── src/
│       ├── main.jsx             # React DOM mount point
│       ├── App.jsx              # Root App wrapper with BrowserRouter
│       ├── index.css            # Reflect XR design system & responsive styling
│       ├── components/
│       │   ├── common/
│       │   │   ├── Header.jsx   # Floating navbar with Reflect XR branding & nav links
│       │   │   └── Sidebar.jsx  # Secondary sidebar navigation
│       │   └── layout/
│       │       ├── AuthLayout.jsx # Centered layout container for login/signup
│       │       └── MainLayout.jsx # Header + Sidebar layout shell for app pages
│       ├── data/
│       │   └── mockPatients.js  # Mock patient records & clinical log timeline data
│       ├── pages/
│       │   ├── auth/
│       │   │   ├── Login.jsx    # Login page component
│       │   │   └── Signup.jsx   # Signup page component
│       │   ├── logs/
│       │   │   └── PatientList.jsx # Patient List & Clinical Logs page
│       │   └── patients/
│       │       └── PatientDetail.jsx # Patient Detail & Vitals dashboard page
│       ├── routes/
│       │   └── AppRoutes.jsx    # Application routing table
│       └── services/
│           ├── api.js           # Base fetch client (reads VITE_API_URL)
│           ├── authService.js   # Authentication service endpoints
│           └── patientService.js # Patient logs & details service endpoints
└── README.md                   # Project overview and setup guide
```

---

## 🚦 Getting Started

### 1. Prerequisites
- **Node.js**: `v20.17.0+` or `v22+` recommended
- **npm**: `v10+`

### 2. Installation & Setup
Clone the repository and install the frontend dependencies:

```bash
git clone https://github.com/Asaini434/PersistentPals.git
cd PersistentPals/frontend
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and set your backend API URL if connecting to a server:

```bash
cp .env.example .env
```

Default environment variable:
```env
VITE_API_URL=http://localhost:8000
```

### Run the FastAPI backend

The API authenticates against `users` and `user_credentials` in PostgreSQL. Passwords are verified against the bcrypt-compatible hashes created by `database/seed.sql`.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

Set `DATABASE_URL` and replace `JWT_SECRET` in `backend/.env`. Seeded demo logins are `admin@example.com` and `sarah.jenkins@example.com`; both use `demo-password` after running `database/seed.sql`.

### Test authentication with Postman

1. Start PostgreSQL and ensure the `reflect` database has been initialized with `database/schema.sql` and `database/seed.sql`.
2. In `backend/`, create `.env` from `.env.example`, set a working `DATABASE_URL`, and replace `JWT_SECRET` with a long random value.
3. Install the backend packages with `pip install -r requirements.txt`, then start the API with `python main.py`. Confirm `http://localhost:8000/health` returns `{"status":"ok"}`.
4. Import `backend/postman/ReflectX Auth.postman_collection.json` into Postman.
5. Send **Health check** first, then **Login**. The default request uses `admin@example.com` / `demo-password`; a successful response is HTTP 200 with `user` and `access_token` fields. The collection saves the token automatically.
6. Send **Current user (verify token)** to confirm the bearer token works. Send **Login with invalid password** to verify bad credentials return HTTP 401.

The API also exposes interactive documentation at `http://localhost:8000/docs`.

### Backend API routes

API handlers are grouped under `backend/routes/`. Login accepts either a seeded username or email and returns an eight-hour bearer token. Send that token in `Authorization: Bearer <access_token>` for protected routes.

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/login` | Public | Authenticate with `{ "username": "sjenkins", "password": "demo-password" }`; `email` is also accepted. |
| `GET` | `/auth/me` | Authenticated | Verify the bearer token and return the logged-in user id and role. |
| `GET` | `/logs/patient-list` | Provider/Admin | List the caller's assigned patients. Admins may pass `?providerId=<uuid>`. |
| `GET` | `/providers/{provider_id}/patients` | Provider/Admin | List a provider's assigned patients; providers can only request themselves. |
| `GET` | `/providers?providerId=<uuid>` | Provider/Admin | Get a provider profile and assigned patients; providers can only request themselves. |
| `GET` | `/patients/{patient_id}` | Provider/Admin | Get patient demographics, assigned providers, medical history, clinical notes, app sessions, and clinical sessions. |
| `GET` | `/admin/providers` | Admin | List provider accounts and assigned-patient counts. |
| `GET` | `/admin/providers/{provider_id}` | Admin | Get one provider and assigned-patient details. |

These endpoints use the existing schema (`users`, `user_credentials`, `assignments`, `patients`, `patient_medical_history`, `provider_notes`, `sessions`, `clinical_sessions`, and `modules`). The schema does not currently store provider addresses, room numbers, or mock licensing/shift metrics, so the APIs do not fabricate those fields.

### 4. Running Locally
Start the development server from the frontend folder:

```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Production Build
To create an optimized production build:

```bash
cd frontend
npm run build
```

To preview the built app:

```bash
cd frontend
npm run preview
```

---

## 🗺️ Application Routes

| Route | View Component | Description |
| :--- | :--- | :--- |
| `/login` | `Login.jsx` | Centered Login screen |
| `/signup` | `Signup.jsx` | Centered Signup screen |
| `/logs/patient-list` | `Patient-list.jsx` | Main patient list & clinical logs with search & filters |
| `/patients/:id` | `PatientDetail.jsx` | Individual patient details & vitals dashboard |
| `/patient-detail` | Redirect | Automatically redirects to `/patients/PT-1001` |

---

## 🗄️ Database (PostgreSQL)

The database holds **synthetic data only** (no real patient information). It is designed to sit behind the API layer and will be connected to the front end once the API is ready. Until then, the front end runs on `frontend/src/data/mockPatients.js`.

### 1. Prerequisites
- **PostgreSQL**: `v16` recommended

**macOS (Homebrew):**

```bash
brew install postgresql@16
brew services start postgresql@16
```

If `psql` is not found afterward, add Postgres to your PATH using the `export PATH=...` line Homebrew prints after install.

**Alternative (Docker):**

```bash
docker run --name reflect-db -e POSTGRES_PASSWORD=devpassword -e POSTGRES_DB=reflect -p 5432:5432 -d postgres:16
```

### 2. Create the Database

Only needed the first time on your machine. If it says `already exists`, you can skip it.

```bash
createdb reflect
```

### 3. Build the Tables and Load Sample Data
From the repository root:

```bash
psql reflect -f database/schema.sql
psql reflect -f database/seed.sql
```

With Docker, run the same files through the container:

```bash
docker exec -i reflect-db psql -U postgres -d reflect < database/schema.sql
docker exec -i reflect-db psql -U postgres -d reflect < database/seed.sql
```

### 4. Verify

```bash
psql reflect
\dt
\q
```

You should see the tables listed below.

### 5. Reset from Scratch

```bash
dropdb reflect
createdb reflect
psql reflect -f database/schema.sql
psql reflect -f database/seed.sql
```

Connection string for the API: `postgresql://localhost:5432/reflect` (Docker: `postgresql://postgres:devpassword@localhost:5432/reflect`).

### Tables

| Table | Purpose |
| :--- | :--- |
| `users` | Login accounts with a role of `Admin` or `Provider` |
| `patients` | Patient personal details (synthetic) |
| `patient_medical_history` | Medical history entries, many per patient |
| `provider_patients` | Which provider is assigned to which patient |
| `clinical_sessions` | Therapy sessions between provider and patient (remote or in person) |
| `modules` | Catalog of Reflect XR and Reflect Mobile experiences |
| `app_sessions` | Patient app usage: platform, module, start and end time |
| `provider_review_sessions` | Time a provider spends reviewing a patient (reimbursement, admin calendar) |
| `provider_notes` | Provider session notes and trend/activity logs |
| `patient_communications` | Log of async provider/patient communication |
| `chat_messages` | AI chat history |

### Conventions
- Every table has `id` (UUID), `date_created`, `is_deleted`, and `date_deleted`, following PTI's tech spec.
- Timestamps are stored in UTC (`timestamptz`) and converted for display only.
- Rows are soft-deleted (`is_deleted = true`), never removed.
- Durations are computed from start and end times, not stored.
- All data is synthetic. Never commit real patient data or credentials.

---

## 📜 Commit History & Trajectory

| Commit | Description | Key Changes |
| :--- | :--- | :--- |
| `3482a59` | **Initial commit: ReflectX Health frontend (React + Vite)** | Scaffolded React Vite project, created folder structure (`pages`, `components`, `services`, `routes`, `data`), implemented mock dataset, created Login/Signup forms, Patient List & Patient Detail pages, and applied Reflect XR design system with Google Fonts & glowing theme. |
| `37949d7` | **Clean up routes, API config, and template leftovers** | Updated `api.js` to use `import.meta.env.VITE_API_URL`, removed hardcoded fallback tokens, updated `/patient-detail` route to redirect to default patient `:id`, updated navigation links, and removed unused starter template assets (`App.css`, `react.svg`). |
