# DSA Automation — working Flask prototype

Uses the supplied `Internal Travel Request (2).docx` as the document template, retaining the a2i logo, table structure, and signature areas.

## Run locally

1. Install Python 3.10+.
2. In this folder, run `pip install -r requirements.txt`.
3. Run `python app.py`.
4. Open `http://127.0.0.1:5000`.
5. Fill in the common trip, travel legs, and travelers, then click **Generate all DOCX files**.

The result is a ZIP containing one individual Word document per traveler and `claim_summary.csv`.

## Calculation rules

- **Full-day DSA** = eligible full days × individual daily DSA rate.
- **Half-day DSA** = eligible half days × individual daily DSA rate × 0.5.
- **Travel allowance for each leg** = travel distance (km) × rate per km × individual's TA multiplier.
- **Individual total** = full-day DSA + half-day DSA + sum of travel allowances.
- The official uploaded template does **not** define eligibility, half-day criteria, or allowed rates. Enter only approved days and rates. No automatic calendar-based eligibility inference is made.
- Set TA multiplier to **0** for an individual who is not eligible for mileage reimbursement. The multiplier is provided for flexibility, not as an official a2i rule.

## Notes and limitations

- The provided template has fixed tables and signatures. Longer itineraries may expand beyond its original two-page layout; review the generated files before use.
- The sample form's 3 claimed DSA days do not match the four calendar dates from departure through return. The software intentionally uses entered approved days.
- This is a local prototype, not a production application with authentication, approval workflow, persistence, audit trail, or role-based access. Deploy only after adding those features and data-protection controls.
- Dates and hours on the web form are shared across travelers. Different schedules require separate trip entries or further enhancement.
- Individual travelers can have different daily rates, approved days, and travel reimbursement multipliers; the template does not provide per-person line-item override of distances.

## Deploy from GitHub to Render (test environment)

1. Create a new GitHub repository named `dsa-automation` (private is recommended for internal documents).
2. Upload **all the contents** of this project folder into the repository root, including `assets/original_template.docx`, `render.yaml`, and `requirements.txt`.
3. Sign in to [Render](https://dashboard.render.com/) and connect your GitHub account.
4. Choose **New > Blueprint**, select the repository, and apply the service defined by `render.yaml`. Alternatively, choose **New > Web Service**, connect the repo, select **Python 3**, set build command to `pip install -r requirements.txt` and start command to `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`.
5. Open the Render-provided `.onrender.com` link and test the **Generate all DOCX files** action with fictional travelers.
6. Subsequent pushes to your main branch will trigger redeployment if automatic deployments are enabled.

**Security warning:** This prototype has no authentication or access controls. Its public Render URL can be accessed by anyone who knows it. Do not enter real employee personal information or confidential travel records until authentication, access control, and data-handling safeguards are in place. The repository can be private, but the running website is public unless protected separately.

**GitHub Pages alone will not run this application**, because its DOCX generation is performed on the Flask server.
