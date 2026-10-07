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

---

## 📁 Directory Structure

```text
ChallengeX-Front_end/
├── index.html                   # HTML entry point (Plus Jakarta Sans font + Title)
├── package.json                 # Project dependencies and script commands
├── vite.config.js               # Vite bundler configuration
├── .env.example                 # Environment variable template
└── src/
    ├── main.jsx                 # React DOM mount point
    ├── App.jsx                  # Root App wrapper with BrowserRouter
    ├── index.css                # Reflect XR design system & responsive styling
    ├── components/
    │   ├── common/
    │   │   ├── Header.jsx       # Floating navbar with Reflect XR branding & nav links
    │   │   └── Sidebar.jsx      # Secondary sidebar navigation
    │   └── layout/
    │       ├── AuthLayout.jsx   # Centered layout container for login/signup
    │       └── MainLayout.jsx   # Header + Sidebar layout shell for app pages
    ├── data/
    │   └── mockPatients.js      # Mock patient records & clinical log timeline data
    ├── pages/
    │   ├── auth/
    │   │   ├── Login.jsx        # Login page component
    │   │   └── Signup.jsx       # Signup page component
    │   ├── logs/
    │   │   └── Patient-list.jsx # Patient List & Clinical Logs page
    │   └── patients/
    │       └── PatientDetail.jsx# Patient Detail & Vitals dashboard page
    ├── routes/
    │   └── AppRoutes.jsx        # Application routing table
    └── services/
        ├── api.js               # Base fetch client (reads VITE_API_URL)
        ├── authService.js       # Authentication service endpoints
        └── patientService.js    # Patient logs & details service endpoints
```

---

## 🚦 Getting Started

### 1. Prerequisites
- **Node.js**: `v20.17.0+` or `v22+` recommended
- **npm**: `v10+`

### 2. Installation & Setup
Clone the repository and install dependencies:

```bash
git clone https://github.com/Asaini434/PersistentPals.git
cd ChallengeX-Front_end
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

### 4. Running Locally
Start the development server:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Production Build
To create an optimized production build:

```bash
npm run build
```

To preview the built app:

```bash
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

## 📜 Commit History & Trajectory

| Commit | Description | Key Changes |
| :--- | :--- | :--- |
| `3482a59` | **Initial commit: ReflectX Health frontend (React + Vite)** | Scaffolded React Vite project, created folder structure (`pages`, `components`, `services`, `routes`, `data`), implemented mock dataset, created Login/Signup forms, Patient List & Patient Detail pages, and applied Reflect XR design system with Google Fonts & glowing theme. |
| `37949d7` | **Clean up routes, API config, and template leftovers** | Updated `api.js` to use `import.meta.env.VITE_API_URL`, removed hardcoded fallback tokens, updated `/patient-detail` route to redirect to default patient `:id`, updated navigation links, and removed unused starter template assets (`App.css`, `react.svg`). |
